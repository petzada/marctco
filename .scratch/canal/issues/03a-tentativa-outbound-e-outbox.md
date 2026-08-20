# 03a — Tentativa outbound e outbox transacional

**What to build:** A intenção de primeiro contato vira dado durável no Postgres. Uma única operação nomeada planeja e registra a tentativa/outbox na mesma transação do gatilho, com estados explícitos, dedupe por Oportunidade e recuperação quando Redis estiver indisponível.

**Blocked by:** 01 — Configuração e domínio do primeiro contato

**Status:** done

- [x] Migration cria tentativa outbound vinculada a workspace e Oportunidade, com `dispatch_status`, `delivery_status`, erro seguro e identificador externo opcional
- [x] Constraint única por Oportunidade + tipo automático impede segunda tentativa, independentemente de reatribuição ou recuperação da fila
- [x] Estados seguem a máquina fechada: publicação `PENDING | DISPATCHED`; envio `QUEUED | PROCESSING | SENT | FAILED`
- [x] Operação nomeada profunda recebe o estado da conexão como dado do chamador, aplica flag → configuração → opt-in → elegibilidade → dedupe e registra a tentativa dentro da transação
- [x] Flag/gatilho incompatível, opt-in ausente, telefone do lead ausente e lead fechado/mesclado não criam intenção; instância desconectada ou Atendente sem telefone criam tentativa terminal `FAILED` observável
- [x] Migration materializa `private.claim_pending_channel_attempts` com lease/recuperação e retorno apenas `(attempt_id, workspace_id)`, conforme ADR-0019 emendado no ticket 00
- [x] Operações nomeadas sob `JobContext.origin.channel_outbound` leem a tentativa e gravam transições válidas; transição inválida recusa
- [x] `SENT` grava fato `WHATSAPP_OUTBOUND_SENT` e `first_contact_at` no instante do HTTP 2xx, com `WHERE first_contact_at IS NULL`, no mesmo commit
- [x] Depois de `PROCESSING`, qualquer erro ou lease vencido termina em `FAILED`; o motivo diferencia recusa conhecida de resultado externo incerto, e nunca preenche `first_contact_at`
- [x] Seam 3: RLS/FORCE RLS, sétima função privada, owner `NOLOGIN`, grants mínimos, lease recuperável e zero PII no retorno/log
- [x] Testes DB: dedupe concorrente, máquina de estados, lease de publicação recuperado, `PROCESSING` vencido vira `FAILED` sem voltar à fila, `SENT` idempotente e competição com Atividade

## Fora deste ticket

BullMQ, HTTP WhatsMiau, hooks de atribuição/chegada, webhook inbound e UI.

## Evidence

- Migration `20260819010400_channel_outbound_attempt`: tabela `channel_outbound_attempts` (RLS/FORCE RLS), unique `(workspace_id, opportunity_id, kind)`, máquina de estados via CHECK, fatos `WHATSAPP_OUTBOUND_SENT | WHATSAPP_OUTBOUND_FAILED | WHATSAPP_INBOUND_RECEIVED`, sétima função `private.claim_pending_channel_attempts` owned by `marctco_channel_claimer` (`NOLOGIN`, sem bypass), retorno `(attempt_id, workspace_id)`. Lease `PROCESSING` vencido vira `FAILED` e grava `WHATSAPP_OUTBOUND_FAILED` na mesma função, usando `opportunity_id` só internamente.
- Domínio em `packages/domain/src/channel-outbound.ts`: `planFirstContactAttempt` (flag → gatilho → opt-in → elegibilidade → dedupe → pré-condições) e `decideChannelOutboundTransition`.
- Persistência em `packages/db/src/channel-outbound.ts`: `planAndRecordChannelOutboundAttempt` abre transação; `planAndRecordChannelOutboundAttemptInTransaction` fica fora do barrel para o 03c importar no commit do gatilho. Transições nomeadas sob `JobContext.origin.channel_outbound`. `SENT` escreve fato + `first_contact_at` write-once no instante informado pelo chamador; `provider_message_id` permanece null a menos que o adapter (03b) o forneça. Falha via transição nomeada e falha no nascimento continuam com um único fato.
- Claimer é papel próprio: `marctco_private_definer` continua read-only; UPDATE de lease/`PROCESSING` vencido não alarga os resolvers existentes (ADR-0019). INSERT no timeline é só do claimer, sem SELECT em Pessoa, contatos, `raw` ou corpo.
- Seam 3 e testes DB verdes; typecheck/lint/drift/migration-safety verdes. Sem commit.
- Revisão Composer 2.5 da correção do fato em lease vencido: nenhum defeito confirmado; gates reexecutados verdes. Sem commit.
