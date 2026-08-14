# A conexão entra na chave idempotente; N conexões por provedor

A chave idempotente do envio passa a ser `UNIQUE(workspace_id, integration_connection_id, source, external_lead_id)`, e o `UNIQUE(workspace_id, provider)` da `IntegrationConnection` cai. Um workspace passa a ter **N conexões por provedor**, cada uma com nome, token e `target_pipeline_id` próprios.

**Status:** accepted · 2026-08-14

**Emenda o [ADR-0007](./0007-ingestao-idempotencia.md)** na chave de identidade do envio e o [ADR-0008](./0008-fronteira-conector-dominio.md) na superfície da conexão. Sustenta o [ADR-0030](./0030-workspace-e-fronteira-do-dono.md): é o que permite campanha exclusiva sem tenant novo.

## O problema: perda silenciosa de lead

Toda landing page tem `source = LANDING_PAGE`, e a LP pode **declarar o próprio** `external_lead_id` (`packages/domain/src/intake/inbound-lead.ts`). A chave de hoje é `source` + `external_lead_id`.

Duas landing pages com numeração própria — a da ACR mandando `1` e a da REAL mandando `1` — colidem. A segunda é tratada como **retransmissão inerte**: o lead é engolido sem card, sem erro, sem quarentena e sem linha na fila. Ninguém percebe até alguém reclamar que um anúncio "não traz lead".

Hoje o sistema só está seguro **por acidente**: nenhuma LP do piloto numera, então cada envio cai no `IntegrationEvent.id`, que é único. Deixa de estar seguro no dia em que uma numerar — e nada no sistema avisa que esse dia chegou.

É o modo de falha que o [ADR-0007](./0007-ingestao-idempotencia.md) foi escrito para não ter. A colisão acontece **com ou sem** conexões separadas, porque a chave não conhece a conexão; separar conexões sem corrigir a chave não resolveria nada.

## Por que N conexões vêm junto

A mesma mudança atende um requisito que a operação já tem: o grupo pode ter mais de uma landing page, e uma sub-empresa pode querer a própria conta Pluga. Hoje o `UNIQUE(workspace_id, provider)` limita o workspace a **duas conexões no total** — uma Pluga e uma LP.

A ingestão não precisa mudar. `apps/web/lib/integration-lead-endpoint.ts` já resolve pelo token e deliberadamente não sabe o provedor nem a origem — *"the token selects"*. O que custa é a camada de Integrações, que hoje resolve resumo, rotação de segredo e ativar/desativar por `provider` (`packages/db/src/integration-connection-operations.ts`).

**Considered options (rejeitadas):**

- **Só corrigir a chave, mantendo uma conexão por provedor.** Fecha a perda de lead e deixa o workspace com uma LP só — que é justamente o que a operação diz precisar de mais.
- **Ignorar o `external_lead_id` declarado pela LP** e usar sempre o `IntegrationEvent.id`. Zero schema novo, mas a LP perde a idempotência de reenvio: um retry dela vira card duplicado em vez de retransmissão inerte. Troca perda silenciosa por duplicata silenciosa, que é o outro lado da mesma moeda que o ADR-0007 recusou.
- **Um token de LP compartilhado entre as landing pages.** Não resolve nada — a colisão é na chave, não na conexão — e faz a rotação de um segredo derrubar todas as LPs de uma vez.

**Consequences:** a **Superfície de integração** do [CONTEXT.md](../../CONTEXT.md) deixa de ser uma tela por provedor e passa a listar conexões, cada uma com nome dado pelo cliente. `IntegrationConnection` ganha nome; o `token_hash` continua globalmente único e continua sendo o que resolve o tenant ([ADR-0006](./0006-rls-duas-camadas-guc-worker.md), regra 9).

O backfill é derivável do dado existente: toda `LeadSubmission` chega à conexão pelo `last_integration_event_id` → `IntegrationEvent.integration_connection_id`. Não há envio órfão, então a coluna nova nasce anulável, é preenchida e só então entra na constraint — expand/contract do [ADR-0010](./0010-migrations-e-ci-cd.md).

**Fica fora da Fase 2.** Não bloqueia Equipe, escopo do Supervisor, atribuição nem Kanban, e o piloto começa com uma LP. Vira ticket próprio, e é o primeiro candidato depois que a Fase 2 fechar — antes de o cliente conectar a segunda landing page, que é quando o risco deixa de ser teórico.
