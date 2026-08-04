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

A Pluga faz um `POST` por lead. O CRM responde **202 imediatamente**, guarda o payload cru antes de interpretá-lo, e processa em fila. O worker normaliza telefone, CPF e e-mail, decide se a pessoa já existe no workspace, e cria a **Oportunidade** na etapa de entrada do funil comercial do produto. O gestor abre a tela de **Leads** e vê a lista chegando, paginada.

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

### Produtos e funis

8. Como dono da assessoria, quero que cada produto (veículo, imóvel, empréstimo pessoal) tenha seu próprio funil comercial, porque a jornada de venda é diferente em cada um.
9. Como dono da assessoria, quero que um funil comercial já venha com etapas razoáveis pré-criadas, para não configurar nada antes de receber o primeiro lead.
10. Como sistema, quero que todo funil comercial em uso tenha exatamente uma etapa de entrada, para que o lead ingerido sempre tenha destino.
11. Como gestor, quero que a etapa tenha rótulo e ordem que eu controle, sem que renomear quebre nada.

### Recebimento de lead

12. Como Pluga, quero enviar um `POST` por lead a uma URL fixa com um token no cabeçalho, e receber uma resposta rápida, para não acumular fila do meu lado.
13. Como Pluga, quero receber `202` sempre que o corpo for JSON válido — inclusive em retransmissão e em lead incompleto — para que meu painel não acuse falha em situação normal.
14. Como Pluga, quero receber `401` quando o token for inválido, para que o cliente saiba revisar o segredo.
15. Como Pluga, quero receber `400` quando o corpo não for JSON, para que o erro apareça no meu log.
16. Como dono da assessoria, quero que o CRM identifique meu workspace pelo token, e nunca por um campo do corpo da requisição, para que ninguém consiga escrever no meu workspace conhecendo apenas o formato do JSON.
17. Como dono da assessoria, quero que o payload cru de cada recebimento fique guardado antes de qualquer interpretação, para que um erro de programação no conversor não me custe o lead.
18. Como dono de landing page própria, quero um endpoint genérico com o mesmo comportamento, para que leads de LP entrem no mesmo funil que os de Ads.
19. Como sistema, quero responder 5xx quando não conseguir enfileirar, deixando o evento registrado como pendente, para que a origem retente e nada se perca.

### Normalização e identidade

20. Como gestor, quero que todo telefone seja gravado em formato internacional, para que o mesmo número escrito de cinco jeitos diferentes seja reconhecido como um só.
21. Como gestor, quero que o CPF seja gravado só com dígitos e validado, para que dado inválido não contamine o cadastro.
22. Como gestor, quero que o e-mail seja gravado em minúsculas, para que variação de caixa não crie pessoa duplicada.
23. Como gestor, quero que uma pessoa que já existe no meu workspace seja reconhecida quando volta, mesmo que o formulário novo traga um telefone novo e o CPF antigo.
24. Como gestor, quero que o CRM não dependa de CPF para reconhecer alguém, porque o formulário do anúncio raramente traz CPF.
25. Como gestor, quero que a identificação por e-mail sozinho seja tratada como provável duplicata e não como certeza, porque e-mail é chave fraca.

### Criação da oportunidade

26. Como gestor, quero que cada lead novo vire uma Oportunidade na etapa de entrada do funil do produto, para que ele apareça no fluxo de trabalho imediatamente.
27. Como gestor, quero que o mesmo cliente com um novo financiamento em outra data gere uma **nova** Oportunidade, porque é um negócio novo.
28. Como gestor, quero que um lead de produto diferente gere uma Oportunidade separada, porque a jornada e o funil são outros.
29. Como gestor, quero que uma nova submissão do mesmo produto, quando já existe negócio aberto para aquela pessoa, **não** crie um segundo card, para que dois atendentes não liguem para o mesmo cliente.
30. Como gestor, quero ver na linha do tempo do card quando houve re-entrada daquela pessoa, para saber que ela buscou contato de novo.
31. Como sistema, quero registrar o momento exato da chegada do lead, porque esse instante é o começo do relógio de atendimento e não pode ser reconstruído depois.

### Duplicidade e retransmissão

32. Como dono da assessoria, quero que uma retransmissão da Pluga do mesmo lead não crie uma segunda Oportunidade.
33. Como gestor, quero que uma retransmissão **nunca** mova meu card de volta para o início, nem reabra negócio perdido, nem troque o responsável, porque um card que volta sozinho destrói a confiança da equipe no funil.
34. Como gestor, quero que a retransmissão fique registrada na linha do tempo, para saber que houve reenvio.
35. Como dono de landing page, quero que um formulário reenviado pelo navegador não gere lead duplicado, mesmo que meu formulário não mande identificador nenhum.

### Lead incompleto e quarentena

36. Como gestor, quero que um lead sem telefone e sem e-mail seja guardado e mostrado na tela de Integrações, e não jogado fora, porque nenhum lead pago pode sumir.
37. Como gestor, quero que um lead sem telefone e sem e-mail **não** entre no funil, porque não há como atendê-lo nem identificá-lo.
38. Como gestor, quero poder completar os dados de um lead em quarentena e liberá-lo para o funil.
39. Como gestor, quero poder liberar um lead em quarentena para o funil mesmo sem completar os dados, se eu julgar que vale a pena.
40. Como gestor, quero que um lead que só tem e-mail entre no funil normalmente, mas marcado, porque não dá para chamar no WhatsApp nem ligar.
41. Como gestor, quero que a falta de CPF, banco ou produto **não** marque nem segure o lead, porque esses campos raramente vêm e o atendimento não depende deles.
42. Como gestor, quero um contador de leads sem telefone na própria tabela de Leads, que filtre ali mesmo, para corrigir no contexto do lead e não numa tela técnica.
43. Como atendente, quero editar os dados do lead dentro do card, para corrigir o que veio torto do formulário.
44. Como atendente, quero uma ação de edição direto na linha da tabela de Leads, para corrigir sem abrir o card.

### Tela de Leads

45. Como gestor, quero uma tabela paginada com todos os leads do workspace, porque o volume é alto e um quadro Kanban global não serve para triagem.
46. Como gestor, quero ver na tabela o nome, o contato, o produto, o banco, a origem e a data de chegada, para decidir a quem atribuir.
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

### Operação e entrega

58. Como equipe técnica da marctco, quero um catálogo de feature flags no código com liberação por workspace, para ligar capacidades que custam dinheiro por cliente.
59. Como equipe técnica da marctco, quero que um evento preso na fila seja re-enfileirado automaticamente, para que uma queda momentânea do Redis não custe leads.
60. Como equipe técnica da marctco, quero que nenhuma alteração chegue à produção sem que as migrações tenham rodado do zero e o isolamento entre workspaces tenha sido provado.
61. Como equipe técnica da marctco, quero que uma tabela nova sem policy de isolamento reprove a integração contínua, para que o erro não dependa de alguém lembrar na revisão.

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
| `Product` | Linha de negócio |
| `Pipeline` | `type: COMMERCIAL \| LEGAL` |
| `Stage` | `role: ENTRY \| LEGAL_HANDOFF \| NORMAL`, `position` |
| `IntegrationConnection` | `provider`, `token_hash`, `status` |
| `IntegrationEvent` | payload cru, `status: PENDING \| PROCESSED \| QUARANTINED \| FAILED` |
| `Person` | `phone_e164`, `cpf`, `email` |
| `LeadSubmission` | `source`, `external_lead_id`, `raw`, `received_at` |
| `Opportunity` | `status: OPEN \| WON \| LOST`, `area`, `stage_id`, `arrived_at`, `assigned_user_id` (nulo), `missing_phone` |

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
| Qualquer JSON válido | 202 |
| Falha ao enfileirar | 5xx, evento gravado como `PENDING` |

Nunca 409. Nenhum campo de negócio é obrigatório. O tenant vem do token; `workspace_id` no corpo é ignorado sempre.

O handler faz exatamente três coisas, nesta ordem: **resolve o token → persiste o evento → enfileira → responde**. É provider-agnóstico: não sabe se aquilo é Meta, Google ou LP.

A resolução do token é a única consulta do sistema sem contexto de tenant — ela existe para descobrir o tenant. Resolvida por função `SECURITY DEFINER` em schema privado, com `EXECUTE` revogado de todo papel que não seja o do app. Lookup por hash indexado, **sem cache**: token revogado precisa parar de funcionar na hora.

Railway e Supabase na mesma região.

### Pipeline de processamento

Conector (no worker) produz `InboundLead` — forma crua validada por Zod. `normalize()` produz `NormalizedLead`. Dois tipos, não um: o compilador garante que a normalização aconteceu ([ADR-0008](../../docs/adr/0008-fronteira-conector-dominio.md)).

O adapter conhece a **forma**; o domínio conhece o **significado**. Adapter mapeia campos e sintetiza `external_lead_id` quando a origem não fornece. Domínio normaliza, decide quarentena, decide reúso de Person e decide criar ou anexar Opportunity.

`external_lead_id` é `NOT NULL` sempre — em Postgres `NULL` não colide com `NULL`, e sem valor a constraint não deduplicaria nada.

### Idempotência

Dois mecanismos, em duas tabelas, respondendo perguntas diferentes ([ADR-0007](../../docs/adr/0007-ingestao-idempotencia.md)):

1. **`UNIQUE(workspace_id, source, external_lead_id)` em `LeadSubmission`** — "já recebi esta transmissão?". Implementado como **insert-and-catch**, nunca check-then-insert: sob concorrência só a constraint arbitra.
2. **Regra de aplicação para reúso de Opportunity** — "esta pessoa já tem negócio aberto neste produto?". Fechada → nova; produto diferente → nova; aberta mesmo produto → anexa. **Não é constraint**: uma pessoa pode ter dois financiamentos de veículo legítimos, e um índice único parcial tornaria o segundo impossível de cadastrar até à mão. Concorrência resolvida com lock na `Person`.

Identidade da Person: casa por **qualquer chave presente** (telefone, CPF, e-mail); **telefone decide** quando duas chaves apontam para pessoas diferentes. Sem nenhuma das três, não cria Person.

Retransmissão atualiza `raw` e tentativas, registra na linha do tempo, e **não toca** etapa, responsável, status nem `arrived_at`.

### Quarentena

Sem telefone **e** sem e-mail → `QUARANTINED`, sem Person e sem Opportunity, visível em Integrações. Sem telefone (só e-mail) → entra no funil com `missing_phone`. Falta de CPF, produto ou banco → entra normalmente, sem marcador.

`IntegrationEvent.status` é a fonte única da tela de Integrações — última sync, histórico e fila morta leem o mesmo campo. Sem estado paralelo no Redis para a UI consultar.

Varredor de `PENDING` como job repetível, sendo a mesma peça do botão "reprocessar". Existe porque o webhook de LP é um `POST` de navegador que não retenta.

### Feature flags

Catálogo de três entradas ([ADR-0004](../../docs/adr/0004-fronteira-flag-configuracao-estado.md)): `auto_primeiro_contato`, `score_cabimento_llm`, `resumo_handoff_llm`. Só as duas últimas têm consumidor fora desta fatia; a primeira existe aqui porque o worker de ingestão nasce com o ponto de engate para efeitos pós-criação, atrás dela, desligada.

Leitura de flag **exige `workspace_id` explícito** — no worker, valor de flag em escopo de módulo ou cache sem chave de workspace aplica a decisão de um tenant a outro. Ausência de linha significa desligado. Catálogo em `packages/domain`, uma cópia só.

### Migrações e entrega

Prisma Migrate é dono único do schema; policies são SQL escrito à mão dentro das migrações ([ADR-0010](../../docs/adr/0010-migrations-e-ci-cd.md)).

Sem ambiente local e sem projeto de staging: um banco Supabase, o de produção. `prisma migrate dev` é **proibido** — ele reseta o banco ao detectar drift. Migrações são autoradas com `prisma migrate diff`, que gera SQL sem banco. A string de conexão de produção existe só como segredo do GitHub Actions e no Railway.

Expand/contract é regra dura: nunca `NOT NULL` sem default em um passo, nunca constraint única sem verificar duplicata antes, nunca remover coluna na mesma release que para de usá-la.

Fluxo: branch → PR → GitHub Actions (Postgres e Redis efêmeros) → branch protection impede merge sem CI verde → merge na `main` → Railway detecta o push e faz deploy.

Prisma Client é gerado em `packages/db`; o `postinstall` precisa garantir `prisma generate` antes do build dos apps.

### UI

`DESIGN.md` é a lei visual. A tabela de Leads usa o componente de tabela de dados documentado, com numerais tabulares nas colunas de data. **O arquivo de tokens referenciado por `{token.refs}` não existe** e precisa ser criado a partir dos valores já documentados no `DESIGN.md`, antes do primeiro componente — o guia proíbe hex e px inline.

---

## Testing Decisions

Um bom teste aqui verifica **comportamento externo**: o que entra pelo endpoint e o que sai no banco ou na tela. Não verifica que uma função interna foi chamada, nem o formato de um objeto intermediário. Não há código anterior no repo, portanto não há arte prévia — estes três seams são a arte prévia para tudo que vier depois.

Ferramenta: Vitest.

### Seam 1 — API pública de `packages/domain`

Funções puras, sem container, sem banco. Rápido o bastante para cobrir casos de borda em volume.

Cobre: normalização de telefone brasileiro em suas várias grafias; validação de dígito verificador de CPF; caixa de e-mail; decisão de quarentena; decisão de reúso de Person, incluindo o caso de telefone novo com CPF antigo e o caso de duas chaves discordando; síntese determinística de `external_lead_id`; schemas Zod aceitando e rejeitando o que devem.

Este seam só existe porque `packages/domain` é puro. Se ele passar a importar Prisma, o seam morre.

### Seam 2 — Ingestão ponta a ponta

`POST` no endpoint com token válido → 202 → evento persistido → BullMQ real → worker → asserção de `Person` e `Opportunity` no Postgres. Postgres e Redis como service containers do GitHub Actions.

Cobre: 202 em payload válido; 401 em token inválido; 400 em corpo inválido; workspace resolvido pelo token e `workspace_id` do corpo ignorado; evento cru persistido antes do processamento; Opportunity nascendo na etapa de papel `ENTRY`; retransmissão do mesmo `external_lead_id` não criando segunda Opportunity **e** não movendo card já avançado; nova submissão da mesma pessoa em produto diferente criando Opportunity separada; submissão do mesmo produto com negócio aberto anexando em vez de duplicar; lead sem telefone e sem e-mail indo para quarentena sem criar Person; lead só com e-mail entrando marcado; lead sem CPF entrando sem marcador; falha ao enfileirar deixando o evento `PENDING`; varredor re-enfileirando o pendente.

Redis real, e não processor inline, porque a ordem `persiste → enfileira → responde` é decisão deliberada e um processor inline não a prova.

### Seam 3 — Invariantes de RLS e schema

Direto no banco, sem passar pela aplicação.

Cobre: varredura de `pg_tables` e `pg_policies` exigindo, para **toda** tabela de negócio, RLS habilitada, RLS **forçada** e ao menos uma policy; leitura cross-workspace devolvendo zero linhas; escrita cross-workspace recusada; migrações aplicando limpas do zero.

Este seam é deliberadamente independente da fatia: seu propósito é reprovar a tabela que alguém criar daqui a meses e esquecer a policy. Um teste de feature nunca pega isso, porque nenhuma rota toca a tabela nova.

---

## Out of Scope

WhatsMiau e mensagem automática de primeiro contato · atribuição de lead a atendente · tela de Equipe · tags · Kanban e arrastar-e-soltar · Atividade, `due_at`, Agenda · SLA e detecção de estagnação · alerta ao gestor · Dashboard operacional · Analytics, Ranking, Metas · documentos, propostas e upload · assinatura digital · handoff e funil jurídico · resumo LLM · score de cabimento · motivo de perda e fechamento de negócio · editor de funis e etapas na UI · `amount` na oportunidade · Contratos e Documentos como vistas globais · billing.

Nesta fatia os funis são **seedados**, não editáveis pela interface — o schema suporta edição desde já ([ADR-0009](../../docs/adr/0009-etapas-editaveis-papeis-e-status.md)), a tela vem depois.

Também fora: telemetria de produto (PostHog, Amplitude, Himetrica), conector nativo Meta/Google, mapeamento De→Para no CRM, compliance LGPD além do mínimo de segurança de acesso.

---

## Further Notes

**Verificações pendentes que precisam virar ticket antes de codar** (registradas em [docs/plano-de-construcao.md](../../docs/plano-de-construcao.md#itens-registrados-como-abertos)):

- **A7 é a mais urgente.** Se `prisma migrate diff` não gerar migração sem banco como assumido, a premissa "sem ambiente local" do ADR-0010 racha e é preciso um Postgres em algum lugar para autorar. Deve ser o **primeiro ticket**: descobrir isso no ticket 1 é barato, no ticket 12 não. Junto: confirmar `SET LOCAL` dentro de `$transaction` do Prisma e `pgbouncer=true` para prepared statements em pooling transaction-mode.
- **A6 é gate de deploy, não ticket de código.** Sem staging, o backup do Supabase é a única rede sob migração em produção — e PITR é add-on pago. Confirmar o que o plano free garante antes do primeiro `migrate deploy`.
- **A10 (tokens do `DESIGN.md`) toca esta fatia**, porque há UI. Ticket mecânico, mas anterior ao primeiro componente.
- A8 (se a Pluga registra 409 como sucesso) confirma o argumento sem mudar a decisão.

**Riscos aceitos conscientemente:** migração é aplicada em produção sem ensaio contra dado real, e o Postgres efêmero ensaia contra banco vazio — pega sintaxe, ordem e policy faltando, mas não pega `NOT NULL` sobre tabela populada nem índice único sobre dado já duplicado. A mitigação é a disciplina de expand/contract. Reavaliar quando o volume do piloto tornar a restauração custosa.

**Itens de UX registrados para a Fase 2** que nascem aqui: duas oportunidades abertas da mesma pessoa precisam ser distinguíveis na tabela, e `banco` é o discriminador natural porque já chega do formulário de anúncio.
