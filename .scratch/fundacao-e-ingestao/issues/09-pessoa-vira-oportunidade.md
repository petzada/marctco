# 09 — Pessoa vira Oportunidade (o tracer bullet fecha)

**Blocked by:** 08, 05

**Status:** ready-for-agent

## What to build

O lead completa o caminho: a Pessoa do ticket 08 ganha uma **Oportunidade** na etapa `ENTRY` do funil comercial de destino. Tipo de financiamento, instituição e parcela são opcionais e não selecionam o funil.

**Todo envio com contato vira Oportunidade, inclusive os que carregam pendência.** Conflito de identidade e possível duplicado são marcadores no card, não portões. O único envio que não vira Oportunidade é o sem telefone e sem e-mail, que vai para quarentena (ticket 10).

**`arrived_at` é gravado agora, mesmo sem tela de SLA.** SLA é da Fase 3, mas o instante de chegada **não é reconstruível depois**: se não for capturado aqui, todo lead recebido até a Fase 3 nasce permanentemente sem relógio.

A idempotência tem um dono só: a constraint mais o worker. Nunca um pré-check no request — sob concorrência, duas retransmissões simultâneas passam ambas por um `SELECT` e só o banco arbitra. Ver [ADR-0007](../../../docs/adr/0007-ingestao-idempotencia.md).

## Acceptance criteria

- [ ] `LeadSubmission` com `source`, `external_lead_id`, `received_at` e **`last_integration_event_id`** — **sem `raw`**. O payload é guardado uma vez, no `IntegrationEvent`; a submissão aponta para a transmissão mais recente em vez de repetir o conteúdo ([ADR-0014](../../../docs/adr/0014-copia-unica-e-retencao-do-payload.md))
- [ ] `external_lead_id` é `NOT NULL` — em Postgres `NULL` não colide com `NULL`, e sem valor a constraint não deduplicaria nada
- [ ] `UNIQUE(workspace_id, source, external_lead_id)`
- [ ] A constraint arbitra, nunca um `SELECT` anterior — mas o mecanismo é **`INSERT ... ON CONFLICT DO NOTHING RETURNING id`**, não capturar a violação: em Postgres o erro aborta a transação inteira e o worker precisa seguir depois ([ADR-0007](../../../docs/adr/0007-ingestao-idempotencia.md)). `RETURNING` vazio é o sinal de duplicata
- [ ] `Opportunity` criada com `status: OPEN`, `area: COMMERCIAL`, na etapa de papel `ENTRY` do funil de destino
- [ ] Funil de destino é `IntegrationConnection.target_pipeline_id` quando presente, senão o `Pipeline` comercial com `is_default = true`
- [ ] `FinancingType` **não** participa da escolha do funil, em nenhuma hipótese
- [ ] Segunda Oportunidade **em aberto** da mesma Pessoa cria a Oportunidade **e** um `IntakeReview(POSSIBLE_DUPLICATE)` ligando-a à anterior — nunca impede a criação. O gatilho **não** é semelhança de financiamento: vale inclusive quando não veio dado algum de financiamento, que é o caso mais comum
- [ ] `arrived_at` gravado no momento da ingestão, igual ao `received_at` do envio. Lead que passa pela quarentena recebe o instante da liberação (ticket 10)
- [ ] `assigned_user_id` nasce nulo — atribuição é da Fase 2
- [ ] `financing_type`, `financial_institution` e `installment_amount` são anuláveis e não bloqueiam criação
- [ ] Nenhuma Oportunidade jurídica é criada pela ingestão
- [ ] Duas submissões simultâneas do mesmo `external_lead_id` produzem **uma** Oportunidade
- [ ] **Seam 2 ponta a ponta**: lead inequívoco e lead com pendência resultam ambos em Pessoa + Oportunidade, o segundo com marcador; isolamento por workspace permanece provado
