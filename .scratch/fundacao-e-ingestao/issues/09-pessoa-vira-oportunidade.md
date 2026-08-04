# 09 — Pessoa vira Oportunidade (o tracer bullet fecha)

**Blocked by:** 08, 05

**Status:** ready-for-agent

## What to build

O lead completa o caminho: a Pessoa reconhecida no ticket 08 ganha uma **Oportunidade** na etapa de entrada do funil comercial do produto. Ao final deste ticket, um `POST` da Pluga produz um lead visível no banco, com dono de workspace, etapa e relógio — e o critério de aceite da fatia vertical inteira está satisfeito.

**`arrived_at` é gravado agora, mesmo sem tela de SLA.** SLA é da Fase 3, mas o instante de chegada **não é reconstruível depois**: se não for capturado aqui, todo lead recebido até a Fase 3 nasce permanentemente sem relógio.

A idempotência tem um dono só: a constraint mais o worker. Nunca um pré-check no request — sob concorrência, duas retransmissões simultâneas passam ambas por um `SELECT` e só o banco arbitra. Ver [ADR-0007](../../../docs/adr/0007-ingestao-idempotencia.md).

## Acceptance criteria

- [ ] `LeadSubmission` com `source`, `external_lead_id`, `raw` e `received_at`
- [ ] `external_lead_id` é `NOT NULL` — em Postgres `NULL` não colide com `NULL`, e sem valor a constraint não deduplicaria nada
- [ ] `UNIQUE(workspace_id, source, external_lead_id)`
- [ ] Implementado como **insert-and-catch**, nunca check-then-insert; violação de constraint é caminho normal, não erro
- [ ] `Opportunity` criada com `status: OPEN`, `area: COMMERCIAL`, na etapa de papel `ENTRY` do funil do produto
- [ ] `arrived_at` gravado no momento da ingestão
- [ ] `assigned_user_id` nasce nulo — atribuição é da Fase 2
- [ ] Submissão de produto diferente gera Oportunidade separada, mesmo com outra aberta
- [ ] Oportunidade fechada (ganha ou perdida) mais nova submissão gera **nova** Oportunidade
- [ ] Duas submissões simultâneas do mesmo `external_lead_id` produzem **uma** Oportunidade
- [ ] **Seam 2 ponta a ponta**: `POST` no endpoint resulta em Pessoa e Oportunidade no Postgres, com isolamento por workspace preservado
