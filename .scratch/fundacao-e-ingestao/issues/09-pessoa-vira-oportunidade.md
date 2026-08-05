# 09 — Pessoa vira Oportunidade (o tracer bullet fecha)

**Blocked by:** 08, 05

**Status:** ready-for-agent

## What to build

O lead completa o caminho: a Pessoa do ticket 08 ganha uma **Oportunidade** na etapa `ENTRY` do funil comercial de destino. Tipo de financiamento, instituição e parcela são opcionais e não selecionam o funil.

**Todo envio com contato vira Oportunidade, inclusive os que carregam pendência.** Conflito de identidade e possível duplicado são marcadores no card, não portões. O único envio que não vira Oportunidade é o sem telefone e sem e-mail, que vai para quarentena (ticket 10).

**`arrived_at` é gravado agora, mesmo sem tela de SLA.** SLA é da Fase 3, mas o instante de chegada **não é reconstruível depois**: se não for capturado aqui, todo lead recebido até a Fase 3 nasce permanentemente sem relógio.

A idempotência tem um dono só: a constraint mais o worker. Nunca um pré-check no request — sob concorrência, duas retransmissões simultâneas passam ambas por um `SELECT` e só o banco arbitra. Ver [ADR-0007](../../../docs/adr/0007-ingestao-idempotencia.md).

## Acceptance criteria

- [ ] `LeadSubmission` com `source`, `external_lead_id`, `raw` e `received_at`
- [ ] `external_lead_id` é `NOT NULL` — em Postgres `NULL` não colide com `NULL`, e sem valor a constraint não deduplicaria nada
- [ ] `UNIQUE(workspace_id, source, external_lead_id)`
- [ ] Implementado como **insert-and-catch**, nunca check-then-insert; violação de constraint é caminho normal, não erro
- [ ] `Opportunity` criada com `status: OPEN`, `area: COMMERCIAL`, na etapa de papel `ENTRY` do funil de destino
- [ ] Funil de destino é `IntegrationConnection.target_pipeline_id` quando presente, senão o `Pipeline` comercial com `is_default = true`
- [ ] `FinancingType` **não** participa da escolha do funil, em nenhuma hipótese
- [ ] Mesma Pessoa + financiamento semelhante cria a Oportunidade **e** um `IntakeReview(POSSIBLE_DUPLICATE)` ligando-a à anterior — nunca impede a criação
- [ ] `arrived_at` gravado no momento da ingestão, sempre igual ao `received_at` do envio
- [ ] `assigned_user_id` nasce nulo — atribuição é da Fase 2
- [ ] `financing_type`, `financial_institution` e `installment_amount` são anuláveis e não bloqueiam criação
- [ ] Nenhuma Oportunidade jurídica é criada pela ingestão
- [ ] Duas submissões simultâneas do mesmo `external_lead_id` produzem **uma** Oportunidade
- [ ] **Seam 2 ponta a ponta**: lead inequívoco e lead com pendência resultam ambos em Pessoa + Oportunidade, o segundo com marcador; isolamento por workspace permanece provado
