# Fundação e ingestão de leads

Fatia vertical cobrindo as **Fases 0 e 1** de [docs/plano-de-construcao.md](../../docs/plano-de-construcao.md). **Entregue.** Não começar por [PROMPT-INICIAL.md](../../PROMPT-INICIAL.md) — é histórico.

- **Fechamento 0–2:** [fechamento-fases-0-2.md](../fechamento-fases-0-2.md)
- **Spec:** [spec.md](./spec.md) — `Status: done`
- **Tickets:** [issues/](./issues/) — 17 na fatia original, mais o **18**, que a
  auditoria de 2026-08-12 revelou: a conexão de landing page não tinha
  superfície para nascer
- **A fazer daqui em diante:** [a-fazer-geral.md](./a-fazer-geral.md) — a fila aberta, separada por quem executa, com o que já foi conferido marcado para não reabrir
- **Correções de arquitetura:** [correcoes-de-arquitetura.md](./correcoes-de-arquitetura.md) — três decisões aplicadas à spec **antes de codar**, para que os módulos de ingestão, acesso a dado e marcador não nasçam rasos (ADRs 0016, 0017, 0018)

## Critério de aceite da fatia

Primeiro acesso provisiona workspace utilizável → `POST` autenticado → commit do `IntegrationEvent`/outbox → 200 mesmo sem Redis → dispatcher/BullMQ → worker valida o contrato `v1`, normaliza e preserva múltiplos contatos → **sempre** Pessoa + Oportunidade no funil comercial de destino, com marcador quando houver conflito de identidade ou possível duplicado → visível na tela de Leads, com RLS provando que workspace A não lê B.

## Grafo de dependências

```
01 esqueleto ──► 03 RLS ──┬──► 04 auth ───────┐
                          │                   │
02 tokens                 ├──► 05 funis ──────┼──► 17 provisionamento
                          │        │          │
                          └──► 06 conexão ──► 07 endpoint
                                   │              │
                                   │              ▼
                                   │         08 Pessoa
                                   │              │
                                   │              ▼
                                   │      09 Oportunidade ◄── 05
                                   │       (tracer bullet)
                                   │              │
                                   │      ┌───────┼────────┬──────────┐
                                   │      ▼       ▼        ▼          ▼
                                   │  10 quar. 11 retr. 13 Google  16 flags
                                   │      │       │
                                   │      └───────┴──► 12 Leads ◄── 04, 02
                                   │      │
                                   └──────┴──► 14 Integrações ◄── 04, 02
                                                     │
                                     07 ─────────────┴──► 15 varredor
```

| Ticket | Bloqueado por |
|---|---|
| 01 · 02 | — |
| 03 | 01 |
| 04 · 05 · 06 | 03 |
| **17 provisionamento** | 03, 04, 05 |
| 07 | 06 |
| 08 | 07 |
| 09 | 08, 05 |
| 10 · 11 · 13 · 16 | 09 |
| 12 | 09, 04, 02, 10, 11 |
| 14 | 06, 04, 02, 10 |
| 15 | 07, 14 |

**Podem começar imediatamente:** 01 e 02, em paralelo.

**Fronteira:** qualquer ticket cujos bloqueadores estejam todos concluídos. Em caso de empate, o menor número vence.

## Ordem sugerida

`01 · 02 → 03 → 04 · 05 · 06 → 17 → 07 → 08 → 09 → 10 · 11 · 13 · 16 → 12 · 14 → 15`

O ticket **17** vem antes do 07 porque sem ele não existe workspace com funil para o lead cair. O ticket **09** fecha o tracer bullet: um `POST` produz lead real no funil, com ou sem pendência marcada. Os tickets 10 a 16 endurecem, resolvem e tornam visível o que o 09 já faz.

## Antes de começar

O ticket **01 monta o ambiente local em Docker e o pipeline inteiro**. Com Postgres local, o item A7 encolhe: `migrate dev` roda onde foi feito para rodar e a autoria de migration deixa de ser aposta. Restam quatro confirmações mecânicas — `SET LOCAL` dentro de `$transaction`, `pgbouncer=true`, o comportamento de `$transaction` diante de erro capturado, e o schema `private` não aparecendo como drift. Se alguma falhar, o ADR correspondente precisa ser emendado antes de seguir.

O item **A6** (o que o plano free do Supabase garante de backup) é gate do primeiro `migrate deploy` em produção, não ticket de código. Sem staging, o backup é a única rede.
