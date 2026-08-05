# Spec — Fundação e ingestão de leads

Status: ready-for-agent

> Fatia vertical: Fases 0 e 1 de [docs/plano-de-construcao.md](../../docs/plano-de-construcao.md).
> Vocabulário: [CONTEXT.md](../../CONTEXT.md). Nomes de código: [ADR-0005](../../docs/adr/0005-idioma-codigo-en-ui-pt-br.md).
> ADRs vinculantes: 0002, 0004, 0005, 0006, 0007, 0008, 0009, 0010, 0011.

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
3. Como membro de mais de um workspace (staff marctco), quero um seletor de workspace, para alternar entre clientes.
4. Como dono da assessoria, quero que meu workspace represente o grupo inteiro — matriz e filiais — para não multiplicar contas, integrações e configuração.
5. Como dono da assessoria, quero que meus dados sejam invisíveis a qualquer outra assessoria cliente da marctco, mesmo que haja um erro de programação numa consulta.
6. Como membro, quero que meu papel (OWNER, ADMIN, MANAGER, ATTENDANT, VIEWER) fique registrado na minha associação ao workspace, para que as permissões possam se apoiar nele.
7. Como equipe técnica da marctco, quero criar workspaces e liberar acesso manualmente, porque não há cadastro autônomo nem cobrança no aplicativo.

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
28. Como gestor, quero que mesma Pessoa + tipo de financiamento apenas ligue as duas Oportunidades com um marcador, porque a pessoa pode ter dois contratos legítimos da mesma categoria.
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
38. Como gestor, quero poder completar os dados de um lead em quarentena e liberá-lo para o funil.
39. Como gestor, quero poder liberar um lead em quarentena para o funil mesmo sem completar os dados, se eu julgar que vale a pena.
40. Como gestor, quero que um lead que só tem e-mail entre no funil normalmente, mas marcado, porque não dá para chamar no WhatsApp nem ligar.
41. Como gestor, quero que a falta de CPF, instituição, parcela ou tipo de financiamento **não** marque nem segure o lead, porque o atendimento não depende deles.
42. Como gestor, quero um contador de leads sem telefone na própria tabela de Leads, que filtre ali mesmo, para corrigir no contexto do lead e não numa tela técnica.
43. Como atendente, quero editar os dados do lead dentro do card, para corrigir o que veio torto do formulário.
44. Como atendente, quero uma ação de edição direto na linha da tabela de Leads, para corrigir sem abrir o card.

### Tela de Leads

45. Como gestor, quero uma tabela paginada com todos os leads do workspace, porque o volume é alto e um quadro Kanban global não serve para triagem.
46. Como gestor, quero ver na tabela o nome, contatos, tipo de financiamento, instituição, origem e data de chegada, para decidir a quem atribuir.
47. Como gestor, quero distinguir na tabela dois leads da mesma pessoa, porque uma pessoa pode ter dois financiamentos legítimos em revisional.
48. Como gestor, quero ver a origem do lead (Meta, Google ou landing page) no próprio registro, para saber que campanha está produzindo.
49. Como membro de um workspace, quero que a tabela de Leads mostre exclusivamente leads do meu workspace, sempre.

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

### Nomenclatura

Código em inglês, UI em PT-BR ([ADR-0005](../../docs/adr/0005-idioma-codigo-en-ui-pt-br.md)). Colunas em `snake_case`, enums em `SCREAMING_SNAKE_CASE`, sem acento em identificador. **Todo model precisa de linha na tabela de mapeamento do ADR-0005** — model sem linha lá é model com nome improvisado.

### Schema

Entidades da fatia:

| Model | Notas |
|---|---|
| `Workspace` | Tenant do grupo; timezone America/Sao_Paulo |
| `WorkspaceMember` | `role: OWNER \| ADMIN \| MANAGER \| ATTENDANT \| VIEWER` |
| `WorkspaceSettings` | Configuração operacional do gestor |
| `WorkspaceFlag` | Liberação por workspace; ausência significa desligado |
| `FinancingType` | Enum opcional da Oportunidade: `VEHICLE \| REAL_ESTATE \| PERSONAL_LOAN \| OTHER` |
| `Pipeline` | `type: COMMERCIAL \| LEGAL`, `is_default` |
| `Stage` | `role: ENTRY \| CLOSING \| LEGAL_HANDOFF \| NORMAL`, `position` |
| `IntegrationConnection` | `provider`, `token_hash`, `status`, `target_pipeline_id` anulável |
| `IntegrationEvent` | payload cru/outbox, estado de despacho e processamento |
| `Person` | `cpf` opcional; contatos em `PersonPhone`/`PersonEmail`; `merged_into_person_id` |
| `PersonPhone` / `PersonEmail` | Múltiplos contatos normalizados por Pessoa, sem sobrescrita |
| `LeadSubmission` | `source`, `external_lead_id`, `raw`, `received_at` |
| `IntakeReview` | `type: IDENTITY_CONFLICT \| POSSIBLE_DUPLICATE`, resolução e motivo auditáveis; marcador, nunca bloqueio |
| `Opportunity` | `status`, `area`, `stage_id`, `arrived_at`, `assigned_user_id`, `missing_phone`, `merged_into_opportunity_id`, financiamento opcional |

`arrived_at` é gravado na ingestão **mesmo sem tela de SLA nesta fatia** — esse instante não é reconstruível depois, e perdê-lo inviabiliza a Fase 3 para todo lead já recebido.

`amount` fica para a Fase 2: coluna anulável é aditiva e não custa nada acrescentar depois.

Toda tabela de negócio carrega `workspace_id` **indexado** — a coluna é usada em policy, e policy sem índice vira varredura sequencial.

### Isolamento

Duas camadas ([ADR-0006](../../docs/adr/0006-rls-duas-camadas-guc-worker.md)): escopo explícito na aplicação é o caminho normal, RLS é a rede.

- Policies keiam no GUC `app.workspace_id`, com a leitura envolta em subselect para o planner avaliar uma vez em vez de por linha.
- `FORCE ROW LEVEL SECURITY` em toda tabela de negócio — `ENABLE` sozinho não se aplica ao dono da tabela, e o dono é o papel das migrações.
- Papéis separados: um para migrações (dono, DDL), um sem bypass para app e worker, `service_role` só para ferramenta interna.
- `SET LOCAL` dentro de transação, nunca `SET`.
- O browser **não** acessa o Postgres direto. Supabase Auth é autenticação e nada mais.
- O worker roda **sob RLS**, com o claim vindo do job. Se o evento não pertencer àquele workspace, a leitura devolve zero linhas e o job falha alto.
- Transação **nunca** envolve chamada de rede externa.

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

A resolução do token é a única consulta do sistema sem contexto de tenant — ela existe para descobrir o tenant. Resolvida por função `SECURITY DEFINER` em schema privado, com `EXECUTE` revogado de todo papel que não seja o do app. Lookup por hash indexado, **sem cache**: token revogado precisa parar de funcionar na hora.

Railway e Supabase na mesma região.

### Pipeline de processamento

O contrato canônico `v1` é validado de forma tolerante no worker e produz `InboundLead`. `normalize()` produz `NormalizedLead`. Dois tipos, não um: o compilador garante que a normalização aconteceu ([ADR-0008](../../docs/adr/0008-fronteira-conector-dominio.md)).

O adapter conhece a **forma canônica**; o domínio conhece o **significado**. A Pluga faz o De→Para de Meta/Google; o conector sintetiza `external_lead_id` quando necessário. O domínio normaliza, decide quarentena, resolve inequivocamente ou abre revisão, e só então cria/associa Opportunity.

`external_lead_id` é `NOT NULL` sempre — em Postgres `NULL` não colide com `NULL`, e sem valor a constraint não deduplicaria nada.

### Idempotência

Dois mecanismos, em duas tabelas, respondendo perguntas diferentes ([ADR-0007](../../docs/adr/0007-ingestao-idempotencia.md)):

1. **`UNIQUE(workspace_id, source, external_lead_id)` em `LeadSubmission`** — "já recebi esta transmissão?". Implementado como **insert-and-catch**, nunca check-then-insert: sob concorrência só a constraint arbitra.
2. **Identidade confiável do financiamento** — mesma Pessoa + tipo/banco não basta. Sem referência estável do mesmo contrato, a Oportunidade **é criada** e um `POSSIBLE_DUPLICATE` liga as duas. O gestor resolve depois como `NEW_FINANCING`, `SAME_FINANCING` (mescla por `merged_into_opportunity_id`) ou `INVALID_OR_SPAM`, sem apagar dados.

Identidade da Person: CPF válido é forte mas opcional; telefone só associa sem contradição; e-mail isolado é fraco. Chaves que apontam para Pessoas diferentes criam **Pessoa nova** e registram `IDENTITY_CONFLICT` com as candidatas. `Person` preserva múltiplos telefones/e-mails. Sem contato, não cria Person.

**Pendência é marcador, não portão.** O único envio que não vira Oportunidade é o sem telefone e sem e-mail. Reter lead antes da Oportunidade foi considerado e rejeitado: a prova de "mesmo financiamento" não existe em formulário de Ads, e lead de mídia paga apodrece em minutos ([ADR-0007](../../docs/adr/0007-ingestao-idempotencia.md)).

Retransmissão atualiza `raw` e tentativas, registra na linha do tempo, e **não toca** etapa, responsável, status nem `arrived_at`.

### Quarentena

Sem telefone **e** sem e-mail → `QUARANTINED`, sem Person e sem Opportunity, visível em Integrações. Sem telefone (só e-mail) → entra no funil com `missing_phone`. Falta de CPF, tipo de financiamento, instituição ou parcela → entra normalmente, sem marcador.

`IntegrationEvent.status` é a fonte única da tela de Integrações — última sync, histórico e fila morta leem o mesmo campo. Sem estado paralelo no Redis para a UI consultar.

Dispatcher consulta pendências no PostgreSQL, publica no BullMQ quando o Redis estiver disponível e é a mesma peça usada pelo botão “reprocessar”. LP é servidor-servidor; a durabilidade não depende de retentativa da origem.

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

---

## Testing Decisions

Um bom teste aqui verifica **comportamento externo**: o que entra pelo endpoint e o que sai no banco ou na tela. Não verifica que uma função interna foi chamada, nem o formato de um objeto intermediário. Não há código anterior no repo, portanto não há arte prévia — estes três seams são a arte prévia para tudo que vier depois.

Ferramenta: Vitest.

### Seam 1 — API pública de `packages/domain`

Funções puras, sem container, sem banco. Rápido o bastante para cobrir casos de borda em volume.

Cobre: contrato `v1` tolerante a extras; normalização de telefone, CPF, e-mail e moeda; preservação de múltiplos contatos; quarentena; associação inequívoca; conflito de identidade; possível duplicado; síntese determinística de `external_lead_id`; três resoluções não destrutivas.

Este seam só existe porque `packages/domain` é puro. Se ele passar a importar Prisma, o seam morre.

### Seam 2 — Ingestão ponta a ponta

`POST` no endpoint com token válido → commit do evento/outbox → 200 com Redis disponível ou indisponível → dispatcher → BullMQ real → worker → `Person`, revisão ou `Opportunity`. Postgres e Redis como service containers do GitHub Actions.

Cobre: 200 em JSON autenticado; 401 em token inválido; 400 em corpo inválido; tenant pelo token; outbox persistida antes do 200; Redis fora mantendo despacho pendente; dispatcher recuperando e publicando uma vez por `jobId`; retransmissão inerte; múltiplos contatos preservados; conflito de identidade criando Pessoa nova **com** Oportunidade e marcador; mesma Pessoa + tipo sem prova criando Oportunidade **ligada** à anterior; cada uma das três resoluções, incluindo mesclagem por `merged_into_opportunity_id`; `arrived_at` sempre igual ao `received_at`; roteamento por `is_default` e por `target_pipeline_id`; quarentena sem contato; financiamento ausente sem bloquear.

Redis real, e não processor inline, porque o seam precisa provar a independência entre aceite durável no PostgreSQL e despacho posterior no BullMQ.

### Seam 3 — Invariantes de RLS e schema

Direto no banco, sem passar pela aplicação.

Cobre: varredura de `pg_tables` e `pg_policies` exigindo, para **toda** tabela de negócio, RLS habilitada, RLS **forçada** e ao menos uma policy; leitura cross-workspace devolvendo zero linhas; escrita cross-workspace recusada; migrações aplicando limpas do zero; drift check entre `schema.prisma` e o banco migrado.

Este seam é deliberadamente independente da fatia: seu propósito é reprovar a tabela que alguém criar daqui a meses e esquecer a policy. Um teste de feature nunca pega isso, porque nenhuma rota toca a tabela nova.

---

## Out of Scope

WhatsMiau e mensagem automática de primeiro contato · atribuição de lead a atendente · tela de Equipe · tags · Kanban e arrastar-e-soltar · Atividade, `due_at`, Agenda · SLA e detecção de estagnação · alerta ao gestor · Dashboard operacional · Analytics, Ranking, Metas · documentos, propostas e upload · assinatura digital · handoff e funil jurídico · resumo LLM · score de cabimento · motivo de perda e fechamento de negócio · editor de funis e etapas na UI · `amount` na oportunidade · Contratos e Documentos como vistas globais · billing.

Nesta fatia os funis são **seedados**, não editáveis pela interface — o schema suporta edição desde já ([ADR-0009](../../docs/adr/0009-etapas-editaveis-papeis-e-status.md)), a tela vem depois.

Também fora: telemetria de produto (PostHog, Amplitude, Himetrica), conector nativo Meta/Google, mapeamento De→Para no CRM, compliance LGPD além do mínimo de segurança de acesso.

---

## Further Notes

**Verificações pendentes que precisam virar ticket antes de codar** (registradas em [docs/plano-de-construcao.md](../../docs/plano-de-construcao.md#itens-registrados-como-abertos)):

- **A7 encolheu.** Com Postgres em Docker local, `migrate dev` e o shadow database resolvem a autoria: a premissa não pode mais rachar. Resta confirmar no ticket 01, e é mecânico: `SET LOCAL` dentro de `$transaction` do Prisma e `pgbouncer=true` para prepared statements em pooling transaction-mode.
- **A6 é gate de deploy, não ticket de código.** Sem staging, o backup do Supabase é a única rede sob migração em produção — e PITR é add-on pago. Confirmar o que o plano free garante antes do primeiro `migrate deploy`.
- **A10 (tokens do `DESIGN.md`) toca esta fatia**, porque há UI. Ticket mecânico, mas anterior ao primeiro componente.
- A8 (se a Pluga registra 409 como sucesso) confirma o argumento sem mudar a decisão.

**Riscos aceitos conscientemente:** migration dependente de dado não é ensaiada contra dado real — o local e o efêmero ensaiam contra banco vazio. Fixtures e caminho de upgrade ficam adiados (A13) porque produção está vazia e mantê-los custaria sincronização contínua contra risco zero. A mitigação atual combina instalação limpa, drift check, varredura de DDL destrutiva, disciplina de expand/contract e bloqueio do deploy quando qualquer gate falha. Reavaliar assim que o piloto gerar dado real.

**Itens de UX já fechados:** revisão de identidade e possível duplicado são marcadores na própria tabela de Leads, com contador-filtro no mesmo padrão do "sem telefone" — não existe fila que esconde lead. Só a quarentena vive em Integrações, porque ali não há card onde pendurar marcador. Na operação, oportunidades da mesma Pessoa usam os dados disponíveis do financiamento como conjunto de discriminadores; banco isolado nunca é tratado como prova.
