# 03a — Tentativa outbound e outbox transacional

**What to build:** A intenção de primeiro contato vira dado durável no Postgres. Uma única operação nomeada planeja e registra a tentativa/outbox na mesma transação do gatilho, com estados explícitos, dedupe por Oportunidade e recuperação quando Redis estiver indisponível.

**Blocked by:** 01 — Configuração e domínio do primeiro contato

**Status:** ready-for-agent

- [ ] Migration cria tentativa outbound vinculada a workspace e Oportunidade, com `dispatch_status`, `delivery_status`, erro seguro e identificador externo opcional
- [ ] Constraint única por Oportunidade + tipo automático impede segunda tentativa, independentemente de reatribuição ou recuperação da fila
- [ ] Estados seguem a máquina fechada: publicação `PENDING | DISPATCHED`; envio `QUEUED | PROCESSING | SENT | FAILED`
- [ ] Operação nomeada profunda recebe o estado da conexão como dado do chamador, aplica flag → configuração → opt-in → elegibilidade → dedupe e registra a tentativa dentro da transação
- [ ] Flag/gatilho incompatível, opt-in ausente, telefone do lead ausente e lead fechado/mesclado não criam intenção; instância desconectada ou Atendente sem telefone criam tentativa terminal `FAILED` observável
- [ ] Migration materializa `private.claim_pending_channel_attempts` com lease/recuperação e retorno apenas `(attempt_id, workspace_id)`, conforme ADR-0019 emendado no ticket 00
- [ ] Operações nomeadas sob `JobContext.origin.channel_outbound` leem a tentativa e gravam transições válidas; transição inválida recusa
- [ ] `SENT` grava fato `WHATSAPP_OUTBOUND_SENT` e `first_contact_at` no instante do HTTP 2xx, com `WHERE first_contact_at IS NULL`, no mesmo commit
- [ ] Depois de `PROCESSING`, qualquer erro ou lease vencido termina em `FAILED`; o motivo diferencia recusa conhecida de resultado externo incerto, e nunca preenche `first_contact_at`
- [ ] Seam 3: RLS/FORCE RLS, sétima função privada, owner `NOLOGIN`, grants mínimos, lease recuperável e zero PII no retorno/log
- [ ] Testes DB: dedupe concorrente, máquina de estados, lease de publicação recuperado, `PROCESSING` vencido vira `FAILED` sem voltar à fila, `SENT` idempotente e competição com Atividade

## Fora deste ticket

BullMQ, HTTP WhatsMiau, hooks de atribuição/chegada, webhook inbound e UI.
