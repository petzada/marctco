# 20 — Os backfills que não backfillaram

**What to build:** Uma migration de correção que preencha em produção o que dois
backfills de 2026-08-17 acharam que tinham preenchido. Ambos rodaram contra
tabelas com `FORCE ROW LEVEL SECURITY` sem suspender a política, então tocaram
**zero linhas** e reportaram sucesso.

**Blocked by:** nada.

**Status:** ready-for-agent

## O defeito

Toda tabela de negócio carrega `FORCE ROW LEVEL SECURITY`, e as policies nomeiam
`marctco_app` e `marctco_worker`. As migrations rodam como `marctco_migrator`,
que nenhuma policy cobre — e sob `FORCE` nem o dono da tabela é exceção.

O efeito é assimétrico e por isso passa despercebido:

- **DML** (`UPDATE`, `SELECT`) enxerga zero linhas e **reporta sucesso**
- **DDL** (`ALTER TABLE`) não passa por RLS e enxerga tudo

Um backfill seguido de `SET NOT NULL` quebra: o `UPDATE` não preenche nada e o
`ALTER` encontra os nulos. Foi assim que o ticket 19 derrubou o release de
2026-08-24. **O CI não reproduz** — lá o banco está vazio, então não há linha
para o backfill deixar para trás.

Um backfill **sem** `SET NOT NULL` depois não quebra nada. Só mente.

## As duas migrations afetadas

Já aplicadas em produção, com checksum congelado: não dá para consertar no
lugar. Estão declaradas como exceção em `scripts/check-migration-safety.mjs`,
que desde o ticket 19 recusa qualquer migration nova que repita o padrão.

| Migration | O que achava que fazia | Estado real em produção |
|---|---|---|
| `20260817010300_opportunity_first_contact_at` | `closed_at = updated_at` nas oportunidades `WON`/`LOST` | Vazio, mas **inofensivo por ora**: a operação que produz `WON`/`LOST` é da Fase 6 e não existe linha assim |
| `20260817010400_opportunity_last_movement_at` | `last_movement_at = arrived_at` | **Vazio e relevante:** toda Oportunidade anterior a 2026-08-17 segue com `NULL` |

## O que investigar antes de escrever a correção

1. **Quantas linhas** têm `last_movement_at IS NULL` em produção. Se forem zero,
   o ticket fecha com uma nota — o piloto pode não ter oportunidade tão antiga.
2. **O que a estagnação faz com `NULL`.** `packages/domain/src/stagnation.ts` e
   `packages/db/src/opportunity-clock.ts` decidem se o lead entra na varredura;
   um `NULL` pode estar sendo tratado como "nunca parado" (some do alerta) ou
   como "parado desde sempre" (alerta falso). Os dois são erros diferentes e o
   ticket precisa saber qual.
3. **O índice parcial** `opportunities_workspace_id_last_movement_at_open_idx`
   não indexa `NULL`, então essas linhas estão fora da varredura por índice.

## Acceptance criteria

- [ ] Uma migration nova preenche `last_movement_at = arrived_at` onde está
      `NULL`, suspendendo `FORCE` pela duração do backfill e restaurando na
      mesma transação — o padrão que o ticket 19 estabeleceu
- [ ] Um bloco `DO` prova que sobrou zero `NULL` antes de a migration terminar,
      em vez de assumir
- [ ] O mesmo para `closed_at`, **se** a investigação achar linha `WON`/`LOST`;
      se não achar, o ticket registra a ausência e não escreve DDL à toa
- [ ] `check-migration-safety.mjs` continua verde, e as duas entradas
      grandfathered ganham nota de que a dívida foi paga
- [ ] Nenhuma linha é sobrescrita onde o valor já não é `NULL` — o backfill é
      reparo, não recálculo

## Fora deste ticket

Reescrever as duas migrations antigas. Elas estão aplicadas; a correção é uma
migration nova, como manda o expand/contract do
[ADR-0010](../../docs/adr/0010-migrations-e-ci-cd.md).
