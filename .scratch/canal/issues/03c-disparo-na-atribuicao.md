# 03c — Disparo na atribuição

**What to build:** O caminho canônico do ADR-0003. Quando o segundo nível da distribuição entrega o lead a um Atendente, a mesma transação da atribuição registra uma tentativa outbound. Entregar ao Supervisor não registra; lote cria uma tentativa por lead elegível; reatribuição posterior não cria segunda.

**Blocked by:** 02 — Conexão WhatsMiau; 03a — Tentativa outbound e outbox transacional

**Status:** ready-for-agent

- [ ] `assignLeads` / `reassignLeads` chamam a operação profunda do 03a dentro da mesma transação somente quando o destino efetivo é `ATTENDANT` e o gatilho é `ON_ASSIGNMENT`
- [ ] Entregar da fila ao Supervisor cria apenas o fato `ASSIGNED`; nenhum outbox de canal
- [ ] Sem intenção: flag off, `DISABLED`/`ON_ARRIVAL`, opt-in ausente/falso, `missing_phone` ou Oportunidade fechada/mesclada produzem zero tentativa
- [ ] Falha operacional observável: instância desconectada ou Atendente sem `whatsapp_phone_e164` produzem tentativa terminal `FAILED` e fato de timeline, sem envio nem `first_contact_at`
- [ ] Lote de N oportunidades para um Atendente cria uma tentativa por linha elegível e preserva o resultado parcial da atribuição
- [ ] Reatribuir entre Atendentes encontra a tentativa existente e não cria nova, esteja ela pendente, em retry, enviada ou falha
- [ ] Atribuição continua sem I/O externo e sem depender de Redis para commitar
- [ ] Testes DB: caminho Gestão → Supervisor sem tentativa; Supervisor → Atendente com tentativa; massa; corrida de atribuição; todos os guards; reatribuição sem reenvio

## Fora deste ticket

`ON_ARRIVAL`, webhook inbound, copy da timeline e Seam 4 E2E.
