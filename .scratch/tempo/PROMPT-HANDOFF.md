# Fase 3 fechada — não reimplementar

A Fase 3 (Tempo) **já está no código**. Não abra os tickets 01–10 de novo, não retome pelo ticket 04, e não trate [spec.md](./spec.md) nem [PROMPT-ORQUESTRACAO.md](./PROMPT-ORQUESTRACAO.md) como fila de trabalho.

## Estado integrado

HEAD do fechamento: `039af31` (`merge(fase-3): integrate dashboard notifications`), na branch `docs/fase-3-spec-e-tickets`.

Tickets **01–10 aceitos e integrados**:

- **01 — Atividade no lead:** `3af757f` — model, operações nomeadas, card, concorrência e RLS.
- **02 — Configuração de SLA e estagnação:** `3ed5ce3` — padrões do domínio, escrita por Gestão/Direção e configuração no workspace.
- **03 — Relógio de primeiro contato:** `9aa75b0` — `first_contact_at`, marcador de SLA e espera na tabela/card.
- **04 — Estagnação, movimento e fatos na linha do tempo:** `b9876ae` — `last_movement_at`, fatos de movimento e marcador de parado.
- **05 — Linha do tempo no card:** `29b35d9` — leitura nomeada e fatos no card, com nome do responsável anterior.
- **06 — Agenda:** `04b0862` — dia/semana, filtros na URL, escopo por Oportunidade e conclusão otimista.
- **07 — Dashboard operacional: os números do dia:** `4f14871` — quatro tiles clicáveis no escopo de perfil.
- **08 — Paleta de dataviz e gráficos:** `5c5b34c` — tokens no `DESIGN.md` e séries operacionais na mesma tela.
- **09 — Notificação: model, detecção e varredura:** `3adc7e7` — persistência idempotente e varredura agendada.
- **10 — Notificações no Dashboard:** `039af31` — lista não resolvida e marcar como lida.

Não há ticket pendente nesta pasta. Os checkboxes dos tickets 01–10 registram a execução, e as linhas `Status:` foram reconciliadas para `done` em 2026-08-24 — antes disso oito delas ainda traziam o rótulo de triagem anterior, que fazia a pasta parecer uma fila de trabalho aberta.

Decisão humana tomada durante o ticket 03 (permanece):

- `Opportunity.closed_at` é o instante canônico que congela o SLA de um lead `WON`/`LOST` sem primeiro contato.
- A coluna e a invariante já estão na migration `20260817010300_opportunity_first_contact_at`.
- A futura operação de ganhar/perder da Fase 6 deverá preencher `closed_at`; não use `updated_at` como substituto.

## Gates finais

Estado combinado após integrar o ticket 10 em `039af31`:

```text
pnpm typecheck          passou
pnpm lint               passou
pnpm test:unit          87 arquivos, 546 testes
pnpm test:db            26 arquivos, 390 testes
pnpm db:drift           sem diferença
pnpm check:migrations   passou
npx @google/design.md lint DESIGN.md
                        0 erros; warning preexistente
```

## Parada humana do ticket 09 — aprovada e materializada

O ticket 09 exigia duas emendas de ADR **antes** da primeira migration. Os textos foram registrados em 2026-08-19 (`4f6eb33`, aceitos em `aad501f`); o ticket 09 as materializou (`3adc7e7`). Não reabra essa parada:

1. **ADR-0019** — a lista fechada de funções `SECURITY DEFINER` passou de cinco para seis: `private.claim_overdue_opportunity_workspaces`. O Seam 3 espera seis nomes.
2. **ADR-0016 e `CONTEXT.md`** — a origem do `JobContext` é união (evento de integração **ou** passada agendada nomeada).

## Tentativa descartada do ticket 04 (histórico)

Antes da implementação aceita, o ticket 04 chegou a ser despachado em um worktree isolado e foi interrompido por decisão humana. O registro está em `1e0a303` / `186216a`: não havia commit para aproveitar. A fatia foi implementada de novo a partir de `9aa75b0` e integrada em `b9876ae`. **Não retome o ticket 04.**

## Próximo

**Fase 4 · Canal** — WhatsMiau + template de 1º contato + timeline no card, conforme [docs/plano-de-construcao.md](../../docs/plano-de-construcao.md). Sem spec nesta pasta.

Não use `/implement` contra este arquivo nem contra [PROMPT-ORQUESTRACAO.md](./PROMPT-ORQUESTRACAO.md).
