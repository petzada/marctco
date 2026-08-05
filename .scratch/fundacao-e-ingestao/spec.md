# Spec — Fundação e ingestão de leads

Status: ready-for-agent

> Fatia vertical: Fases 0 e 1 de [docs/plano-de-construcao.md](../../docs/plano-de-construcao.md).
> Vocabulário: [CONTEXT.md](../../CONTEXT.md). Nomes de código: [ADR-0005](../../docs/adr/0005-idioma-codigo-en-ui-pt-br.md).
> ADRs vinculantes: 0002, 0004, 0005, 0006, 0007, 0008, 0009, 0010, 0011, 0016, 0017, 0018.
> Correções de arquitetura aplicadas antes de codar: [correcoes-de-arquitetura.md](./correcoes-de-arquitetura.md).

---

## Problem Statement

A assessoria compra mídia no Meta e no Google e recebe leads em formulários de anúncio. Hoje esses leads chegam por planilha, e-mail ou WhatsApp de quem viu primeiro — sem dono, sem relógio, sem cadastro único. Consequências que o dono da assessoria enxerga todo dia:

- **Lead se perde.** Ninguém sabe quantos entraram, e a única evidência é o painel do anunciante, que não sabe o que aconteceu depois do clique.
- **Lead esfria.** Entre a submissão do formulário e o primeiro contato humano passam horas, às vezes um dia.
- **A mesma pessoa vira várias.** O cliente que já foi atendido em março volta em setembro com outro financiamento e ninguém percebe que é o mesmo CPF — dois atendentes ligam, o histórico não existe.
- **Não existe isolamento.** Quando a marctco tiver mais de uma assessoria cliente, não há garantia técnica de que uma não veja os dados da outra — e o dado em questão é CPF, telefone e situação financeira de pessoas reais.

## Solution

Um CRM multi-tenant onde cada grupo de assessoria é um **Workspace** isolado no banco, e onde todo lead de Ads ou landing page entra por um endpoint autenticado que **nunca perde o que recebeu**.

A Pluga mapeia Meta/Google para o contrato canônico `v1` e faz um `POST` por lead. O CRM grava o payload cru como `IntegrationEvent`/outbox e responde **200 após o commit**, sem depender do Redis. Um dispatcher independente publica no BullMQ; o worker normaliza, resolve identidade ou abre revisão e cria a **Oportunidade** na etapa de entrada de um funil comercial. O gestor vê Leads normalizados separados das Pendências de ingestão.

Nada do que chega é descartado: lead sem telefone e sem e-mail vai para quarentena visível na tela de Integrações; lead sem telefone entra no funil com marcador; retransmissão da Pluga não duplica nem ressuscita card.

O isolamento entre workspaces é garantido pelo banco, não por disciplina de código, e essa garantia é provada automaticamente a cada alteração.

## User Stories

### Acesso e workspace

1. Como membro de uma assessoria, quero entrar no CRM com e-mail e senha, para acessar os dados do meu workspace.
2. Como membro de um único workspace, quero entrar direto na aplicação sem escolher workspace, porque escolher entre uma opção é ruído.
3. Como membro de mais de um workspace (acesso de suporte da marctco), quero um seletor de workspace, para alternar entre clientes — e quero que cada aba mantenha o seu contexto, para não agir num cliente achando que estou noutro.
4. Como dono da assessoria, quero que meu workspace represente o grupo inteiro — matriz e filiais — para não multiplicar contas, integrações e configuração.
5. Como dono da assessoria, quero que meus dados sejam invisíveis a qualquer outra assessoria cliente da marctco, mesmo que haja um erro de programação numa consulta.
6. Como membro, quero que meu perfil — Atendente, Supervisor, Gestão ou Direção — fique registrado na minha associação ao workspace, e que o escopo dele seja aplicado no servidor.
6b. Como atendente entre dezenas, quero enxergar apenas os leads atribuídos a mim, para não navegar na carteira inteira da empresa nem editar o cliente de um colega.
6c. Como dono da assessoria, quero que só a Direção gere e rotacione o segredo da integração, enquanto a Gestão continua vendo o histórico e reprocessando, porque credencial e operação não são a mesma coisa.
7. Como equipe técnica da marctco, quero criar **o usuário** no painel do Supabase e marcá-lo como apto a provisionar, porque não há cadastro autônomo nem cobrança no aplicativo.
7b. Como dono da assessoria, quero que meu primeiro acesso crie meu workspace já utilizável — com meu vínculo de dono e um funil comercial padrão —, para não receber uma plataforma vazia que não aceita lead.
7c. Como equipe técnica da marctco, quero que um usuário que apenas perdeu a associação **não** provisione workspace novo, para que ex-colaborador demitido não vire dono de um workspace fantasma.

### Financiamento e funis

8. Como dono da assessoria, quero que tipo de financiamento (veículo, imóvel, empréstimo pessoal ou outro) seja uma classificação opcional da Oportunidade, sem determinar o funil.
9. Como dono da assessoria, quero que um funil comercial já venha com etapas razoáveis pré-criadas, para não configurar nada antes de receber o primeiro lead.
10. Como sistema, quero que todo funil em uso tenha exatamente uma etapa de entrada e ao menos uma de conclusão, para que o lead sempre tenha por onde entrar e por onde sair sem travar no meio.
11. Como gestor, quero que a etapa tenha rótulo e ordem que eu controle, sem que renomear quebre nada.
11b. Como sistema, quero um funil comercial marcado como padrão por workspace, sobrescrevível por conexão de integração, para que a ingestão sempre tenha destino sem consultar o tipo de financiamento.

### Recebimento de lead

12. Como Pluga, quero enviar um `POST` por lead a uma URL fixa com um token no cabeçalho, e receber uma resposta rápida, para não acumular fila do meu lado.
13. Como Pluga, quero receber `200` sempre que o corpo for JSON válido — inclusive em retransmissão e em lead incompleto — para que meu painel não acuse falha em situação normal.
14. Como Pluga, quero receber `401` quando o token for inválido, para que o cliente saiba revisar o segredo.
15. Como Pluga, quero receber `400` quando o corpo não for JSON, para que o erro apareça no meu log.
16. Como dono da assessoria, quero que o CRM identifique meu workspace pelo token, e nunca por um campo do corpo da requisição, para que ninguém consiga escrever no meu workspace conhecendo apenas o formato do JSON.
17. Como dono da assessoria, quero que o payload cru de cada recebimento fique guardado antes de qualquer interpretação, para que um erro de programação no conversor não me custe o lead.
18. Como dono de landing page própria, quero um endpoint servidor-servidor com as mesmas chaves canônicas e token próprio, para que leads de LP entrem com autenticação e origem corretas.
19. Como sistema, quero responder 200 depois de persistir o evento mesmo se o Redis estiver indisponível, para que a origem não precise conhecer a fila interna.

### Normalização e identidade

20. Como gestor, quero que todo telefone seja gravado em formato internacional, para que o mesmo número escrito de cinco jeitos diferentes seja reconhecido como um só.
21. Como gestor, quero que o CPF seja gravado só com dígitos e validado, para que dado inválido não contamine o cadastro.
22. Como gestor, quero que o e-mail seja gravado em minúsculas, para que variação de caixa não crie pessoa duplicada.
23. Como gestor, quero preservar todos os telefones e e-mails de uma Pessoa quando ela volta, sem sobrescrever contatos anteriores.
24. Como gestor, quero que o CRM não dependa de CPF para reconhecer alguém, porque o formulário do anúncio raramente traz CPF.
25. Como gestor, quero que identificadores contraditórios criem uma Pessoa nova e marquem revisão de identidade, sem que telefone ou e-mail vença automaticamente e sem que o lead pare de ser atendido.

### Criação da oportunidade

26. Como gestor, quero que **todo** lead com contato vire uma Oportunidade na etapa de entrada do funil comercial de destino, mesmo carregando pendência, para que nenhum lead quente espere decisão humana para ser atendido.
27. Como gestor, quero que o mesmo cliente com um novo financiamento em outra data gere uma **nova** Oportunidade, porque é um negócio novo.
28. Como gestor, quero que duas Oportunidades **em aberto** da mesma Pessoa sejam sempre ligadas por um marcador, mesmo quando não veio dado nenhum de financiamento, porque é justamente aí que dois atendentes ligariam para o mesmo cliente sem nenhum aviso.
28b. Como gestor, quero que o dado de financiamento sirva para eu **distinguir** os dois cards na tela, e não para decidir se serei avisado, porque ele não é prova.
29. Como gestor, quero decidir depois entre financiamento novo, mesmo financiamento ou inválido/spam, sem que a decisão pendente segure o atendimento de nenhum dos dois cards.
30. Como gestor, quero que as três resoluções preservem o envio e deixem trilha de auditoria; quando for o mesmo financiamento, quero que os cards sejam mesclados sem exclusão e a reentrada apareça na timeline.
30b. Como atendente, quero ver, ao abrir um lead com possível duplicado, qual é a outra Oportunidade e quem a atende, para não ligar para o mesmo cliente que um colega.
31. Como sistema, quero registrar o momento exato da chegada do lead, porque esse instante é o começo do relógio de atendimento e não pode ser reconstruído depois.

### Duplicidade e retransmissão

32. Como dono da assessoria, quero que uma retransmissão da Pluga do mesmo lead não crie uma segunda Oportunidade.
33. Como gestor, quero que uma retransmissão **nunca** mova meu card de volta para o início, nem reabra negócio perdido, nem troque o responsável, porque um card que volta sozinho destrói a confiança da equipe no funil.
34. Como gestor, quero que a retransmissão fique registrada na linha do tempo, para saber que houve reenvio.
35. Como dono de landing page, quero que o backend/provedor gere um identificador estável e, se ele faltar, que o conector sintetize um, sem expor segredo no navegador.

### Lead incompleto e quarentena

36. Como gestor, quero que um lead sem telefone e sem e-mail seja guardado e mostrado na tela de Integrações, e não jogado fora, porque nenhum lead pago pode sumir.
37. Como gestor, quero que um lead sem telefone e sem e-mail **não** entre no funil, porque não há como atendê-lo nem identificá-lo.
38. Como gestor, quero completar os dados de um lead em quarentena e liberá-lo para o funil, vendo o payload cru ao lado do formulário, porque o contato costuma ter chegado num campo que o mapeamento não mapeou.
39. Como gestor, quero que liberar exija ao menos um contato, para que eu não crie um cadastro que nunca casa com nada e um card que ninguém consegue atender.
39b. Como gestor, quero que o lead liberado da quarentena comece seu relógio de atendimento **na liberação**, para que ele não nasça com alerta estourado que nenhuma ação minha resolve.
40. Como gestor, quero que um lead que só tem e-mail entre no funil normalmente, mas marcado, porque não dá para chamar no WhatsApp nem ligar.
41. Como gestor, quero que a falta de CPF, instituição, parcela ou tipo de financiamento **não** marque nem segure o lead, porque o atendimento não depende deles.
42. Como gestor, quero um contador de leads sem telefone na própria tabela de Leads, que filtre ali mesmo, para corrigir no contexto do lead e não numa tela técnica.
43. Como atendente, quero editar os dados do lead dentro do card, para corrigir o que veio torto do formulário.
44. Como atendente, quero uma ação de edição direto na linha da tabela de Leads, para corrigir sem abrir o card.

### Tela de Leads

45. Como gestor, quero uma tabela paginada com todos os leads do workspace, porque o volume é alto e um quadro Kanban global não serve para triagem.
45b. Como gestor, quero que avançar de página **não** me mostre de novo um lead que já vi nem esconda um que chegou no meio — porque com lead entrando o dia inteiro, uma lista que desloca faz lead sumir da triagem em silêncio.
45c. Como gestor, quero ser avisado de que chegaram leads novos e decidir **quando** atualizar, em vez de a lista se remexer sob o meu cursor enquanto eu trabalho.
46. Como gestor, quero ver na tabela o nome, contatos, tipo de financiamento, instituição, origem e data de chegada, para decidir a quem atribuir.
47. Como gestor, quero distinguir na tabela dois leads da mesma pessoa, porque uma pessoa pode ter dois financiamentos legítimos em revisional.
48. Como gestor, quero ver a origem do lead (Meta, Google ou landing page) no próprio registro, para saber que campanha está produzindo.
49. Como membro de um workspace, quero que a tabela de Leads mostre exclusivamente leads do meu workspace, sempre.
49b. Como gestor, quero alcançar **todos** os avisos de um lead por um único ícone na linha e no card, e não um rótulo por tipo espalhado pela tabela, porque com três avisos a lista de triagem deixa de ser legível justamente quando mais preciso dela.

### Integrações

50. Como dono da assessoria, quero uma tela de Integrações que mostre a URL do webhook para eu colar na Pluga.
51. Como dono da assessoria, quero gerar e rotacionar o segredo da integração, e vê-lo mascarado depois de gerado.
52. Como dono da assessoria, quero um botão que envie um lead de exemplo, para conferir que a ligação funciona antes de gastar mídia.
53. Como dono da assessoria, quero ver o histórico recente de eventos com data, status e erro, para diagnosticar sem chamar suporte.
54. Como dono da assessoria, quero ver a última sincronização bem-sucedida, para saber se a captação está viva.
55. Como dono da assessoria, quero ver os eventos que falharam e poder reprocessá-los.
56. Como dono da assessoria, quero ver a documentação do formato esperado na própria tela, em linguagem não técnica.
57. Como dono da assessoria, quero ativar e desativar a integração sem apagar a configuração.
58. Como dono da assessoria, quero copiar modelos de mapeamento Meta e Google para o contrato `v1` e testar cada automação com dado real da Pluga.

### Operação e entrega

59. Como equipe técnica da marctco, quero um catálogo de feature flags no código com liberação por workspace, para ligar capacidades que custam dinheiro por cliente.
60. Como equipe técnica da marctco, quero que o dispatcher recupere eventos pendentes quando o Redis voltar, sem depender da retentativa da origem.
61. Como equipe técnica da marctco, quero que nenhuma alteração chegue à produção sem que as migrações tenham rodado do zero, o `schema.prisma` esteja sem drift, a DDL destrutiva tenha sido varrida e o isolamento entre workspaces tenha sido testado — e que o deploy do Railway só ocorra depois da migration de produção verde.
62. Como equipe técnica da marctco, quero que uma tabela nova sem policy de isolamento reprove a integração contínua, para que o erro não dependa de alguém lembrar na revisão.

---

## Implementation Decisions

### Estrutura

Monorepo pnpm sem Turborepo ([ADR-0011](../../docs/adr/0011-monorepo-pnpm-e-dominio-puro.md)): `apps/web` (Next.js App Router), `apps/worker` (Node + BullMQ), `packages/domain` (puro), `packages/db` (Prisma).

`packages/domain` **não importa Prisma e não faz I/O**. Recebe dado, devolve decisão. É requisito do desenho de CI, não preferência.

Os conectores de origem vivem em `apps/worker`. Os payloads de exemplo do botão de teste ficam em `packages/domain`, como JSON estático.

O **módulo de ingestão** mora em `packages/domain`, não no worker ([ADR-0017](../../docs/adr/0017-ingestao-como-decisao-e-plano.md)): ao contrário do conector, ele tem dois consumidores — o job do worker e o "completar e liberar" da tela de Integrações. Um consumidor é pasta; dois é pacote.

`packages/db` **não exporta o client do Prisma** ([ADR-0016](../../docs/adr/0016-contexto-de-acesso-e-leitor-escopado.md)). Exporta operações nomeadas recebendo `AccessContext`, com `SET LOCAL`, escopo de papel, keyset e índice do lado de dentro. O client cru é interno e o CI reprova import de fora.

### Nomenclatura

Código em inglês, UI em PT-BR ([ADR-0005](../../docs/adr/0005-idioma-codigo-en-ui-pt-br.md)). Colunas em `snake_case`, enums em `SCREAMING_SNAKE_CASE`, sem acento em identificador. **Todo model precisa de linha na tabela de mapeamento do ADR-0005** — model sem linha lá é model com nome improvisado.

### Schema

Entidades da fatia:

| Model | Notas |
|---|---|
| `Workspace` | Tenant do grupo; timezone America/Sao_Paulo; `slug` UUIDv4 único, usado no caminho da URL ([ADR-0012](../../docs/adr/0012-contexto-de-tenant-na-url.md)) |
| `WorkspaceMember` | `role: ATTENDANT \| SUPERVISOR \| MANAGER \| OWNER` — quatro, e nenhum a mais ([ADR-0015](../../docs/adr/0015-perfis-de-acesso-e-escopo.md)) |
| `WorkspaceSettings` | Configuração operacional do gestor |
| `WorkspaceFlag` | Liberação por workspace; ausência significa desligado |
| `FinancingType` | Enum opcional da Oportunidade: `VEHICLE \| REAL_ESTATE \| PERSONAL_LOAN \| OTHER` |
| `Pipeline` | `type: COMMERCIAL \| LEGAL`, `is_default` |
| `Stage` | `role: ENTRY \| CLOSING \| LEGAL_HANDOFF \| NORMAL`, `position` |
| `IntegrationConnection` | `provider`, `token_hash`, `status`, `target_pipeline_id` anulável |
| `IntegrationEvent` | payload cru/outbox, estado de despacho e processamento |
| `Person` | `cpf` opcional; contatos em `PersonPhone`/`PersonEmail`; `merged_into_person_id` |
| `PersonPhone` / `PersonEmail` | Múltiplos contatos normalizados por Pessoa, sem sobrescrita |
| `LeadSubmission` | `source`, `external_lead_id`, `received_at`, `last_integration_event_id` — **sem `raw`**: o payload é guardado uma vez, no evento ([ADR-0014](../../docs/adr/0014-copia-unica-e-retencao-do-payload.md)) |
| `IntakeReview` | `type: IDENTITY_CONFLICT \| POSSIBLE_DUPLICATE`, resolução e motivo auditáveis; marcador, nunca bloqueio |
| `Opportunity` | `status`, `area`, `stage_id`, `arrived_at`, `assigned_user_id`, `missing_phone`, `merged_into_opportunity_id`, financiamento opcional |

`arrived_at` é gravado **mesmo sem tela de SLA nesta fatia** — esse instante não é reconstruível depois, e perdê-lo inviabiliza a Fase 3 para todo lead já recebido. Ele marca **quando a Oportunidade passa a existir**: igual ao `received_at` no caminho direto, igual ao instante da liberação para lead que passou pela quarentena. O `received_at` continua no `LeadSubmission` e no `IntegrationEvent` como verdade sobre a origem, e a demora em quarentena é medível pela diferença entre os dois.

`amount` fica para a Fase 2: coluna anulável é aditiva e não custa nada acrescentar depois.

Toda tabela de negócio carrega `workspace_id` **indexado** — a coluna é usada em policy, e policy sem índice vira varredura sequencial.

### Isolamento

Duas camadas ([ADR-0006](../../docs/adr/0006-rls-duas-camadas-guc-worker.md)): escopo explícito na aplicação é o caminho normal, RLS é a rede.

- Policies keiam no GUC `app.workspace_id`, com a leitura envolta em subselect para o planner avaliar uma vez em vez de por linha.
- `FORCE ROW LEVEL SECURITY` em toda tabela de negócio — `ENABLE` sozinho não se aplica ao dono da tabela, e o dono é o papel das migrações.
- Papéis separados: um para migrações (dono, DDL), um sem bypass para app e worker, `service_role` só para ferramenta interna.
- `SET LOCAL` dentro de transação, nunca `SET`.
- **Papéis criados dentro das migrations**, idempotentes e prefixados (`marctco_migrator`, `marctco_app`, `marctco_worker`), para que CI, Docker local e produção derivem da mesma fonte. Senha nunca numa migration — o arquivo está no git.
- **App e worker abortam o boot** se o papel conectado for superusuário, tiver `BYPASSRLS` ou for dono de tabela de negócio. É a única verificação que pega a connection string errada no Railway, porque nenhum CI sabe qual string está lá.
- **`SECURITY DEFINER` só em schema `private`, lista fechada de três**: `resolve_workspace_by_token_hash`, `claim_pending_events` e `provision_workspace`. Nenhuma delas devolve payload — `claim_pending_events` devolve `(id, workspace_id)` e nada mais.
- O browser **não** acessa o Postgres direto. Supabase Auth é autenticação e nada mais.
- Na sessão do navegador o workspace vem do segmento de URL e é **validado** contra `WorkspaceMember` antes do GUC; o que não corresponde a uma associação devolve 404 e fica registrado. Na ingestão o `workspace_id` do corpo é **ignorado**. Validar e ignorar não são a mesma regra ([ADR-0012](../../docs/adr/0012-contexto-de-tenant-na-url.md)).
- O worker roda **sob RLS**, com o claim vindo do job. Se o evento não pertencer àquele workspace, a leitura devolve zero linhas e o job falha alto.
- Transação **nunca** envolve chamada de rede externa.
- **`AccessContext` é construído num ponto só** por requisição ou por job, e é argumento obrigatório de toda operação de `packages/db`. Receber o papel não basta: um helper que devolvesse o client tornaria o `role` inerte, e a RLS **não pega** escopo de papel — um atendente vendo a carteira inteira é leitura legítima dentro do tenant certo ([ADR-0016](../../docs/adr/0016-contexto-de-acesso-e-leitor-escopado.md)).
- **Duas variantes**: `UserContext` (`workspace_id`, `user_id`, `role`) e `JobContext` (`workspace_id`, `integration_event_id`). O worker não tem usuário nem papel, e um contexto único o obrigaria a inventar um — papel sem escopo declarado é o que o ADR-0015 proíbe. Só `findPersonCandidates` e `applyIntakePlan` aceitam as duas; `listLeads(jobCtx)` não compila.
- **As três consultas sem tenant não recebem contexto e não podem receber**: elas acontecem antes de existir workspace e são as que produzem o `workspace_id` que o constrói. Lista fechada de três, varrida pelo Seam 3.

### Contrato HTTP

```
POST /v1/integrations/pluga/leads
POST /v1/integrations/webhooks/leads
Authorization: Bearer <token por IntegrationConnection>
```

| Situação | Resposta |
|---|---|
| Token inválido | 401 |
| Corpo não é JSON | 400 |
| Qualquer JSON válido | 200 |
| Redis indisponível | 200 depois do commit; evento permanece com despacho pendente |

Nunca 409. Nenhum campo de negócio é obrigatório. O tenant vem do token; `workspace_id` no corpo é ignorado sempre.

O handler faz exatamente três coisas: **resolve o token → persiste o evento/outbox em commit → responde 200**. O dispatcher independente publica depois no BullMQ com `jobId` determinístico. O handler não abre conexão com Redis.

A resolução do token é uma das **três** consultas do sistema sem contexto de tenant — as outras duas são a descoberta de pendências pelo dispatcher e o provisionamento de workspace. Todas em `SECURITY DEFINER` no schema `private`, lista fechada, com `EXECUTE` revogado de todo papel que não seja o do app. Lookup por hash indexado, **sem cache**: token revogado precisa parar de funcionar na hora.

O hash é **SHA-256 determinístico** — não bcrypt nem argon2. Hash adaptativo é salgado por linha, o que impede busca por índice: restaria carregar todas as conexões e verificar uma a uma, na rota mais quente do sistema, com cache proibido. Salt e key-stretching existem contra segredo de baixa entropia escolhido por humano; o token é 256 bits de CSPRNG, e não há o que forçar.

Railway e Supabase na mesma região.

### Pipeline de processamento

O contrato canônico `v1` é validado de forma tolerante no worker e produz `InboundLead`. `normalize()` produz `NormalizedLead`. Dois tipos, não um: o compilador garante que a normalização aconteceu ([ADR-0008](../../docs/adr/0008-fronteira-conector-dominio.md)).

O adapter conhece a **forma canônica**; o domínio conhece o **significado**. A Pluga faz o De→Para de Meta/Google; o conector sintetiza `external_lead_id` quando necessário. O domínio normaliza, decide quarentena, resolve inequivocamente ou abre revisão, e só então cria/associa Opportunity.

A sequência é de três fases puras ([ADR-0017](../../docs/adr/0017-ingestao-como-decisao-e-plano.md)):

```
planSubmission(inbound)      → SubmissionKey       // source + external_lead_id
   ↓ o chamador insere com ON CONFLICT DO NOTHING RETURNING id
planPersonLookup(normalized) → PersonLookupPlan    // quais chaves buscar, e com que força
decideIntake(input)          → IntakePlan          // Quarantine | Retransmission | NewOpportunity
   ↓
applyIntakePlan(ctx, plan)                          // packages/db, uma transação, switch exaustivo
```

Três fases e não uma porque o resultado do `ON CONFLICT` é **entrada** da decisão, não saída. `now` é argumento de `decideIntake`, nunca lido por dentro. E a variante `Retransmission` **não tem campo** de etapa, responsável, situação nem `arrived_at` — é assim que "retransmissão não rebobina" para de depender de disciplina.

Os dois chamadores são o job do worker (`now` = `received_at`) e o route handler de "completar e liberar" (`now` = instante da liberação). É literalmente a mesma função.

Na liberação o `InboundLead` vem **do formulário, não do conector**: o gestor lê o payload cru e preenche campos `v1`, com `source` e `external_lead_id` preservados do envio original. O conector fica em `apps/worker` e não é importado pelo app — ali não há forma de origem para interpretar, há um humano preenchendo o contrato.

`external_lead_id` é `NOT NULL` sempre — em Postgres `NULL` não colide com `NULL`, e sem valor a constraint não deduplicaria nada. Quando a origem não fornece ID, o conector usa o **`IntegrationEvent.id`**: sem relógio dentro, único por requisição, estável sob qualquer reprocessamento.

### Idempotência

Dois mecanismos, em duas tabelas, respondendo perguntas diferentes ([ADR-0007](../../docs/adr/0007-ingestao-idempotencia.md)):

1. **`UNIQUE(workspace_id, source, external_lead_id)` em `LeadSubmission`** — "já recebi esta transmissão?". Sob concorrência só a constraint arbitra, nunca um `SELECT` anterior. O mecanismo é **`INSERT ... ON CONFLICT DO NOTHING RETURNING id`**, e não capturar a violação: em Postgres um erro aborta a transação inteira, e o worker precisa continuar depois — apontar para o evento novo, incrementar tentativas, registrar o reenvio. `RETURNING` vazio **é** o sinal de retransmissão. A chave começa por `workspace_id`, então o conflito é sempre intra-tenant.
2. **Duas Oportunidades em aberto da mesma Pessoa sempre se ligam** por um `POSSIBLE_DUPLICATE`, com ou sem dado de financiamento. Financiamento é discriminador na tela, nunca gatilho — este mesmo desenho declara que esses campos não são prova, e o que não basta para o humano concluir não basta para a máquina decidir se o humano será avisado. O gestor resolve depois como `NEW_FINANCING`, `SAME_FINANCING` (mescla por `merged_into_opportunity_id`) ou `INVALID_OR_SPAM`, sem apagar dados. Mesclar **Pessoas** reavalia a duplicidade entre as Oportunidades que a canônica passa a ter.

Identidade da Person: CPF válido é forte mas opcional; telefone só associa sem contradição; e-mail isolado é fraco. Chaves que apontam para Pessoas diferentes criam **Pessoa nova** e registram `IDENTITY_CONFLICT` com as candidatas. `Person` preserva múltiplos telefones/e-mails. Sem contato, não cria Person.

**Pendência é marcador, não portão.** O único envio que não vira Oportunidade é o sem telefone e sem e-mail. Reter lead antes da Oportunidade foi considerado e rejeitado: a prova de "mesmo financiamento" não existe em formulário de Ads, e lead de mídia paga apodrece em minutos ([ADR-0007](../../docs/adr/0007-ingestao-idempotencia.md)).

Retransmissão aponta `last_integration_event_id` para o evento novo, incrementa tentativas, registra na linha do tempo, e **não toca** etapa, responsável, status nem `arrived_at`.

### Quarentena

Sem telefone **e** sem e-mail → `QUARANTINED`, sem Person e sem Opportunity, visível em Integrações. Sem telefone (só e-mail) → entra no funil com `missing_phone`. Falta de CPF, tipo de financiamento, instituição ou parcela → entra normalmente, sem marcador.

**Sair da quarentena exige ao menos um contato.** A ação da tela é "completar e liberar", com o payload cru ao lado — o caso real é o contato ter chegado num campo que o mapeamento não mapeou. Liberar vazio criaria `Person` sem chave, que nunca casa com nada, e card que ninguém atende. O `arrived_at` do lead liberado é o instante da **liberação**, não o do recebimento.

`IntegrationEvent.status` é a fonte única da tela de Integrações — última sync, histórico e fila morta leem o mesmo campo. Sem estado paralelo no Redis para a UI consultar.

Dispatcher consulta pendências no PostgreSQL por `private.claim_pending_events`, publica no BullMQ quando o Redis estiver disponível e é a mesma peça usada pelo botão “reprocessar”. A descoberta precisa dessa função porque o dispatcher procura pendência de todos os workspaces sem sessão e sem job prévio: "claim por evento" seria circular, já que para setar o claim ele precisaria do `workspace_id` que só a leitura revela. LP é servidor-servidor; a durabilidade não depende de retentativa da origem.

### Feature flags

Catálogo de três entradas ([ADR-0004](../../docs/adr/0004-fronteira-flag-configuracao-estado.md)): `auto_primeiro_contato`, `score_cabimento_llm`, `resumo_handoff_llm`. Só as duas últimas têm consumidor fora desta fatia; a primeira existe aqui porque o worker de ingestão nasce com o ponto de engate para efeitos pós-criação, atrás dela, desligada.

Leitura de flag **exige `workspace_id` explícito** — no worker, valor de flag em escopo de módulo ou cache sem chave de workspace aplica a decisão de um tenant a outro. Ausência de linha significa desligado. Catálogo em `packages/domain`, uma cópia só.

### Migrações e entrega

Prisma Migrate é dono único do schema; policies são SQL escrito à mão dentro das migrações ([ADR-0010](../../docs/adr/0010-migrations-e-ci-cd.md)).

Desenvolvimento contra **Postgres e Redis em Docker local**, descartáveis: `prisma migrate dev` funciona com shadow database e a autoria de migration deixa de ser aposta. Continua sem Supabase local e sem staging: um projeto Supabase, o de produção, e `migrate dev`/`db push` permanecem proibidos contra qualquer banco remoto. Workflows de PR não recebem segredo algum de produção; a string do papel de migrations vive só no GitHub Environment do job de release, e a da aplicação só no Railway.

Expand/contract é regra dura: nunca `NOT NULL` sem default em um passo, nunca constraint única sem verificar duplicata antes, nunca remover coluna na mesma release que para de usá-la.

Fluxo: local (docker compose · migrate dev · vitest) → push abre PR automático → GitHub Actions sem acesso a produção (typecheck · lint · build · testes puros · migrate deploy do zero · **drift check** · varredura de DDL destrutiva · RLS · Redis) → branch protection impede merge sem CI verde → merge na `main` → job de release serializado aplica `prisma migrate deploy` → verificações → Railway com Wait for CI faz deploy.

Fixtures sintéticas e caminho de upgrade ficam adiados até produção ter dado real (item A13). Preflight vale como regra desde já; a infraestrutura nasce com a primeira migration dependente de dados.

Prisma Client é gerado em `packages/db`; o `postinstall` precisa garantir `prisma generate` antes do build dos apps.

### UI

`DESIGN.md` é a lei visual. A tabela de Leads usa o componente de tabela de dados documentado, com numerais tabulares nas colunas de data. **O arquivo de tokens referenciado por `{token.refs}` não existe** e precisa ser criado a partir dos valores já documentados no `DESIGN.md`, antes do primeiro componente — o guia proíbe hex e px inline.

**Um lead, um ícone.** Todos os avisos de um lead são alcançados por um único ponto de entrada na linha e no card, que abre a lista; três avisos são um ícone com contagem, nunca três rótulos. Os contadores-filtro continuam no topo e continuam por tipo — são perguntas diferentes. A regra vale para todo aviso que as fases seguintes acrescentarem.

Quem responde "o que este lead tem" é `markersFor(opportunity, reviews)`, em `packages/domain` ([ADR-0018](../../docs/adr/0018-marcador-como-modulo.md)) — as três superfícies chamam a mesma função. Os contadores **não** passam por ela: vêm de `countLeadsByMarker` sobre o índice parcial, porque contar a partir da lista carregada contaria só a página.

**Lacuna conhecida:** o `DESIGN.md` não documenta `popover` nem `tooltip`. Os componentes disponíveis são `button-icon`, `status-badge`, `dropdown-menu` e `modal`. A escolha entre reusar `dropdown-menu` e acrescentar um `popover` ao guia é do ticket 12, e precisa entrar no guia — não ser inventada dentro do componente.

Toda rota autenticada vive sob `/workspace/:slug` ([ADR-0012](../../docs/adr/0012-contexto-de-tenant-na-url.md)); `/onboarding` fica fora do prefixo, porque ali ainda não há workspace.

**Fluxo de dados** ([ADR-0013](../../docs/adr/0013-fluxo-de-dados-no-app.md)): leitura em Server Component chamando `listLeads(ctx, …)` de `packages/db` — a tela não monta consulta ([ADR-0016](../../docs/adr/0016-contexto-de-acesso-e-leitor-escopado.md)); filtro e cursor na URL via `nuqs`; escrita em route handler sob `/workspace/:slug/...`, não em Server Action — o tenant precisa continuar estrutural também no caminho de escrita. Paginação **keyset**, nunca `OFFSET`. `@tanstack/react-query` entra na Fase 2, no Kanban e na remoção otimista da linha atribuída.

---

## Testing Decisions

Um bom teste aqui verifica **comportamento externo**: o que entra pelo endpoint e o que sai no banco ou na tela. Não verifica que uma função interna foi chamada, nem o formato de um objeto intermediário. Não há código anterior no repo, portanto não há arte prévia — estes três seams são a arte prévia para tudo que vier depois.

Ferramenta: Vitest.

### Seam 1 — API pública de `packages/domain`

Funções puras, sem container, sem banco. Rápido o bastante para cobrir casos de borda em volume.

Cobre: contrato `v1` tolerante a extras; normalização de telefone, CPF, e-mail e moeda; preservação de múltiplos contatos; quarentena; recusa de liberação sem contato; associação inequívoca; conflito de identidade; **possível duplicado disparado por duas Oportunidades em aberto da mesma Pessoa, inclusive sem dado nenhum de financiamento**; `external_lead_id` derivado do `IntegrationEvent.id` produzindo a **mesma** chave para o mesmo evento processado duas vezes; três resoluções não destrutivas; definição dos funis padrão consumida tanto pelo seed de desenvolvimento quanto pelo provisionamento.

Cobre também, por efeito do [ADR-0017](../../docs/adr/0017-ingestao-como-decisao-e-plano.md) e do [ADR-0018](../../docs/adr/0018-marcador-como-modulo.md):

- **O `PersonLookupPlan`** — qual conjunto de chaves cada envio produz. Sem isto, um worker que busque só por telefone reconhece menos gente do que o ticket 08 promete e todo teste puro continua verde, porque é o teste que escolhe as candidatas que passa.
- **O `IntakePlan` de cada caso**, incluindo **retransmissão inerte**: card que já avançou permanece, negócio perdido não reabre, responsável não muda. Era a regra mais fácil de errar e dependia do teste mais caro do projeto.
- **Os dois `arrived_at` lado a lado** — recebimento direto e liberação da quarentena — como o mesmo argumento com valor diferente, e não como exceção escondida num caminho.
- **`markersFor`**, inclusive o lead com três avisos.

Este seam só existe porque `packages/domain` é puro. Se ele passar a importar Prisma, o seam morre.

### Seam 2 — Ingestão ponta a ponta

`POST` no endpoint com token válido → commit do evento/outbox → 200 com Redis disponível ou indisponível → dispatcher → BullMQ real → worker → `Person`, revisão ou `Opportunity`. Postgres e Redis como service containers do GitHub Actions.

Cobre: 200 em JSON autenticado; 401 em token inválido; 400 em corpo inválido; tenant pelo token; outbox persistida antes do 200; Redis fora mantendo despacho pendente; dispatcher recuperando e publicando uma vez por `jobId`; **evento reprocessado depois de o Redis voltar não criando segunda Oportunidade**; retransmissão inerte, com a detecção por `ON CONFLICT DO NOTHING` permitindo que a transação **continue** e registre o reenvio; múltiplos contatos preservados; conflito de identidade criando Pessoa nova **com** Oportunidade e marcador; segunda Oportunidade em aberto da mesma Pessoa nascendo **ligada** à anterior mesmo sem dado de financiamento; cada uma das três resoluções, incluindo mesclagem por `merged_into_opportunity_id` com as FKs **repontadas**; mesclagem de Pessoas reavaliando a duplicidade; `arrived_at` igual ao `received_at` no caminho direto e igual à liberação para lead ex-quarentena; roteamento por `is_default` e por `target_pipeline_id`; quarentena sem contato; financiamento ausente sem bloquear; provisionamento criando Workspace, vínculo de dono e funil padrão **num commit só**.

Redis real, e não processor inline, porque o seam precisa provar a independência entre aceite durável no PostgreSQL e despacho posterior no BullMQ.

**Com o módulo de ingestão em `packages/domain`, este seam não perde cobertura — perde responsabilidade.** A pergunta "qual plano é o certo" desce para o Seam 1; aqui fica "o plano é aplicado como descrito, sob RLS, numa transação". Vale também para o "completar e liberar", que passa a exercitar a mesma função do job em vez de um caminho paralelo.

### Seam 3 — Invariantes de RLS e schema

Direto no banco, sem passar pela aplicação.

Cobre: varredura de `pg_tables` e `pg_policies` exigindo, para **toda** tabela de negócio, RLS habilitada, RLS **forçada** e ao menos uma policy; leitura cross-workspace devolvendo zero linhas; escrita cross-workspace recusada; migrações aplicando limpas do zero; drift check entre `schema.prisma` e o banco migrado.

Mais três varreduras, todas da mesma natureza — invariantes que nenhuma rota exercita:

- **Atributos de papel:** o papel do app não é superusuário, não tem `BYPASSRLS` e não é dono de tabela de negócio.
- **Lista fechada de `SECURITY DEFINER`:** enumerar as funções do banco e **reprovar qualquer uma fora das três** nomeadas no [ADR-0006](../../docs/adr/0006-rls-duas-camadas-guc-worker.md) regra 9. Sem esta varredura a lista é comentário, e a quarta função entra sem ninguém notar.
- **Nenhum registro ativo aponta para um registro mesclado**, em nenhuma tabela.
- **Toda tabela de negócio tem índice que sirva à sua listagem**, não só o `workspace_id` da policy.
- **Nenhum import do client cru do Prisma fora de `packages/db`** — é o que impede o escopo de papel de voltar a ser convenção, e nenhuma rota o exercita ([ADR-0016](../../docs/adr/0016-contexto-de-acesso-e-leitor-escopado.md)).

Este seam é deliberadamente independente da fatia: seu propósito é reprovar a tabela que alguém criar daqui a meses e esquecer a policy, ou a que a Fase 5 acrescentar sem tratar mesclagem. Um teste de feature nunca pega isso, porque nenhuma rota toca a combinação.

**O drift check não substitui nada disso.** Ele compara o datamodel do Prisma com o banco, e o Prisma não modela policy, função, papel nem grant — ou seja, exatamente o SQL que carrega o modelo de segurança está fora do alcance dele. Uma policy derrubada à mão mantém o drift check verde.

---

## Out of Scope

WhatsMiau e mensagem automática de primeiro contato · atribuição de lead a atendente · tela de Equipe · tags · Kanban e arrastar-e-soltar · Atividade, `due_at`, Agenda · SLA e detecção de estagnação · alerta ao gestor · Dashboard operacional · Analytics, Ranking, Metas · documentos, propostas e upload · assinatura digital · handoff e funil jurídico · resumo LLM · score de cabimento · motivo de perda e fechamento de negócio · editor de funis e etapas na UI · `amount` na oportunidade · Contratos e Documentos como vistas globais · billing.

Nesta fatia os funis são **seedados**, não editáveis pela interface — o schema suporta edição desde já ([ADR-0009](../../docs/adr/0009-etapas-editaveis-papeis-e-status.md)), a tela vem depois.

O **provisionamento** entra (ticket 17), mas as telas do wizard que coletam dados da empresa não: o que a fatia precisa é que o workspace nasça válido e utilizável. **Cadastro de colaboradores pelo gestor fica fora** — a fatia opera com o dono provisionado, e atribuição só chega na Fase 2. Quando entrar, vale a invariante que o ticket 17 já assume: colaborador nasce **com** o vínculo, e por isso nunca cai no caminho de provisionamento.

Também fora: telemetria de produto (PostHog, Amplitude, Himetrica), conector nativo Meta/Google, mapeamento De→Para no CRM, compliance LGPD além do mínimo de segurança de acesso.

---

## Further Notes

**Verificações pendentes que precisam virar ticket antes de codar** (registradas em [docs/plano-de-construcao.md](../../docs/plano-de-construcao.md#itens-registrados-como-abertos)):

- **A7 encolheu.** Com Postgres em Docker local, `migrate dev` e o shadow database resolvem a autoria: a premissa não pode mais rachar. Restam quatro confirmações mecânicas no ticket 01: `SET LOCAL` dentro de `$transaction` do Prisma · `pgbouncer=true` para prepared statements em pooling transaction-mode · o comportamento de `$transaction` diante de erro capturado, que é o motivo de `ON CONFLICT DO NOTHING` ter substituído "insert-and-catch" · o schema `private`, não declarado na datasource, não aparecer como drift.
- **A6 é gate de deploy, não ticket de código.** Sem staging, o backup do Supabase é a única rede sob migração em produção — e PITR é add-on pago. Confirmar o que o plano free garante antes do primeiro `migrate deploy`.
- **A10 (tokens do `DESIGN.md`) toca esta fatia**, porque há UI. Ticket mecânico, mas anterior ao primeiro componente.
- A8 (se a Pluga registra 409 como sucesso) confirma o argumento sem mudar a decisão.

**Riscos aceitos conscientemente:** migration dependente de dado não é ensaiada contra dado real — o local e o efêmero ensaiam contra banco vazio. Fixtures e caminho de upgrade ficam adiados (A13) porque produção está vazia e mantê-los custaria sincronização contínua contra risco zero. A mitigação atual combina instalação limpa, drift check, varredura de DDL destrutiva, disciplina de expand/contract e bloqueio do deploy quando qualquer gate falha. Reavaliar assim que o piloto gerar dado real.

**Itens de UX já fechados:** revisão de identidade e possível duplicado são marcadores na própria tabela de Leads, com contador-filtro no mesmo padrão do "sem telefone" — não existe fila que esconde lead. Só a quarentena vive em Integrações, porque ali não há card onde pendurar marcador. Na operação, oportunidades da mesma Pessoa usam os dados disponíveis do financiamento como conjunto de discriminadores; banco isolado nunca é tratado como prova.
