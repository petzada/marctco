# Fundação e ingestão de leads

Fatia vertical cobrindo as **Fases 0 e 1** de [docs/plano-de-construcao.md](../../docs/plano-de-construcao.md).

- **Começar aqui:** [PROMPT-INICIAL.md](../../PROMPT-INICIAL.md) — na raiz do repo; prompt para abrir a sessão de implementação
- **Spec:** [spec.md](./spec.md)
- **Tickets:** [issues/](./issues/) — 16, numerados em ordem de dependência

## Critério de aceite da fatia

`POST` autenticado → commit do `IntegrationEvent`/outbox → 200 mesmo sem Redis → dispatcher/BullMQ → worker valida o contrato `v1`, normaliza e preserva múltiplos contatos → **sempre** Pessoa + Oportunidade no funil comercial de destino, com marcador quando houver conflito de identidade ou possível duplicado → visível na tela de Leads, com RLS provando que workspace A não lê B.

## Grafo de dependências

```
01 esqueleto ──┬─► 03 RLS ──┬─► 04 auth ─────────────────┐
               │            │                            │
02 tokens ─────┼────────────┼─► 05 funis ────────┐       │
               │            │                    │       │
               │            └─► 06 conexão ──► 07 endpoint
               │                     │              │
               │                     │              ▼
               │                     │         08 Pessoa
               │                     │              │
               │                     │              ▼
               │                     │      09 Oportunidade ◄── 05
               │                     │       (tracer bullet)
               │                     │              │
               │                     │      ┌───────┼────────┬──────────┐
               │                     │      ▼       ▼        ▼          ▼
               │                     │  10 quar. 11 retr. 13 Google  16 flags
               │                     │      │
               │                     │      ├──────────► 12 Leads ◄── 04, 02
               │                     │      │
               │                     └──────┴──────────► 14 Integrações ◄── 04, 02
                                                              │
                                              07 ─────────────┴──► 15 varredor
```

**Podem começar imediatamente:** 01 e 02, em paralelo.

**Fronteira:** qualquer ticket cujos bloqueadores estejam todos concluídos. Em caso de empate, o menor número vence.

## Ordem sugerida

`01 · 02 → 03 → 04 · 05 · 06 → 07 → 08 → 09 → 10 · 11 · 13 · 16 → 12 · 14 → 15`

O ticket **09** fecha o tracer bullet: um `POST` produz lead real no funil, com ou sem pendência marcada. Os tickets 10 a 16 endurecem, resolvem e tornam visível o que o 09 já faz.

## Antes de começar

O ticket **01 monta o ambiente local em Docker e o pipeline inteiro**. Com Postgres local, o item A7 encolhe: `migrate dev` roda onde foi feito para rodar e a autoria de migration deixa de ser aposta. Resta confirmar `SET LOCAL` dentro de `$transaction` e `pgbouncer=true` — se algum falhar, o [ADR-0010](../../docs/adr/0010-migrations-e-ci-cd.md) precisa ser emendado antes de seguir.

O item **A6** (o que o plano free do Supabase garante de backup) é gate do primeiro `migrate deploy` em produção, não ticket de código. Sem staging, o backup é a única rede.
