# 03c — Disparo na atribuição

**What to build:** O caminho canônico do ADR-0003. Quando o segundo nível da distribuição entrega o lead a um Atendente, a mesma transação da atribuição registra uma tentativa outbound. Entregar ao Supervisor não registra; lote cria uma tentativa por lead elegível; reatribuição posterior não cria segunda.

**Blocked by:** 02 — Conexão WhatsMiau; 03a — Tentativa outbound e outbox transacional

**Status:** done

- [x] `assignLeads` / `reassignLeads` chamam a operação profunda do 03a dentro da mesma transação somente quando o destino efetivo é `ATTENDANT` e o gatilho é `ON_ASSIGNMENT`
- [x] Entregar da fila ao Supervisor cria apenas o fato `ASSIGNED`; nenhum outbox de canal
- [x] Sem intenção: flag off, `DISABLED`/`ON_ARRIVAL`, opt-in ausente/falso, `missing_phone` ou Oportunidade fechada/mesclada produzem zero tentativa
- [x] Falha operacional observável: instância desconectada ou Atendente sem `whatsapp_phone_e164` produzem tentativa terminal `FAILED` e fato de timeline, sem envio nem `first_contact_at`
- [x] Lote de N oportunidades para um Atendente cria uma tentativa por linha elegível e preserva o resultado parcial da atribuição
- [x] Reatribuir entre Atendentes encontra a tentativa existente e não cria nova, esteja ela pendente, em retry, enviada ou falha
- [x] Atribuição continua sem I/O externo e sem depender de Redis para commitar
- [x] Testes DB: caminho Gestão → Supervisor sem tentativa; Supervisor → Atendente com tentativa; massa; corrida de atribuição; todos os guards; reatribuição sem reenvio

## Fora deste ticket

`ON_ARRIVAL`, webhook inbound, copy da timeline e Seam 4 E2E.

## Evidence

- Hook fino `planAssignmentChannelOutbound` em `packages/db/src/leads.ts` delega para `planAssignmentChannelOutboundInTransaction` em `packages/db/src/channel-outbound.ts`: early return se o destino não é `ATTENDANT`; snapshot (flag, gatilho, pairing, telefone do destino, opt-in/elegibilidade) lido na mesma `withAccessContext` de `assignLeads`/`reassignLeads`; só IDs claimed pelo `UPDATE … RETURNING` vão para `planAndRecordChannelOutboundAttemptInTransaction` com `occurred_trigger: "ON_ASSIGNMENT"`. Sem Redis e sem HTTP.
- Gestão → Supervisor não chama o recorder. Supervisor → Atendente cria `PENDING`/`QUEUED` sem `first_contact_at`. Guards do 03a (`planFirstContactAttempt`) recusam flag off, `DISABLED`/`ON_ARRIVAL`, opt-in ausente/falso, `missing_phone` e fechado. Mesclado não é claimed. Instância desconectada ou Atendente sem telefone nascem `FAILED` observável + fato, sem `first_contact_at`.
- Lote parcial preserva recusas e uma tentativa por linha elegível. Corrida: a condição do `UPDATE` arbitra um vencedor e uma tentativa. Reatribuição entre Atendentes reusa a unique `(workspace_id, opportunity_id, kind)` em qualquer estado existente.
- Testes em `packages/db/tests/channel-outbound-assignment.test.ts` (9), incluídos no project `db` de `vitest.config.ts`.
- Revisão Composer 2.5 (`3ac958c4-3cbf-4cf1-bf05-6d0e1360c6bf`): approve, nenhum defeito confirmado. Gates reexecutados verdes. Sem migration nova. Sem commit.
