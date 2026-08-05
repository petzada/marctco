# 15 — Recuperação da outbox e reprocessamento

**Blocked by:** 07, 14

**Status:** ready-for-agent

## What to build

Postgres e Redis não commitam juntos. O endpoint resolve isso com outbox: aceita o lead no PostgreSQL e o dispatcher continua tentando publicar. Este ticket endurece recuperação, backoff, observabilidade e reprocessamento manual.

A durabilidade não depende da Pluga nem da LP retentarem. O dispatcher lê pendências do PostgreSQL quando o Redis volta; LP é sempre servidor-servidor.

O varredor **não é peça nova**: é o mesmo mecanismo do botão "reprocessar" que a tela de Integrações já precisa ter.

## Acceptance criteria

- [ ] Dispatcher busca eventos com despacho pendente por `private.claim_pending_events`, em lotes, aplica backoff e recupera após reinício
- [ ] O botão "reprocessar" da tela de Integrações usa **o mesmo** mecanismo, não um caminho paralelo
- [ ] Evento reprocessado **não** gera Pessoa nem Oportunidade duplicada — a deduplicação do ticket 09 cobre
- [ ] Fila morta visível na tela de Integrações
- [ ] Lead Pluga ou LP recebido com o Redis fora é processado assim que o Redis volta
- [ ] **A descoberta é a única parte sem tenant, e é a função que a resolve.** "Claim por evento" é circular: para setar o claim o varredor precisaria do `workspace_id` do evento, e para ler o `workspace_id` precisaria do claim — sem GUC, a policy devolve zero linhas e o varredor nunca acha nada. `private.claim_pending_events` existe para quebrar esse ciclo, e devolve **só `(id, workspace_id)`**; o `raw`, que carrega CPF e telefone, nunca sai sem tenant ([ADR-0006](../../../docs/adr/0006-rls-duas-camadas-guc-worker.md) regra 9)
- [ ] **Todo o resto roda sob RLS**, com `SET LOCAL` a partir do `workspace_id` que a função devolveu — não com bypass
- [ ] O varredor não reprocessa evento já processado
- [ ] Evento reprocessado depois de o Redis voltar **não** cria segunda Oportunidade — o `external_lead_id` derivado do `IntegrationEvent.id` é estável sob qualquer reprocessamento (ticket 13)
- [ ] A descoberta de pendências não depende de um repeatable job armazenado no próprio Redis
