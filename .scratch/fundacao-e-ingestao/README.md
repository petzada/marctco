# Fundação e ingestão de leads

Fatia vertical cobrindo as **Fases 0 e 1** de [docs/plano-de-construcao.md](../../docs/plano-de-construcao.md).

- **Spec:** [spec.md](./spec.md)
- **Tickets:** [issues/](./issues/) — 16, numerados em ordem de dependência

## Critério de aceite da fatia

`POST` autenticado por token da Pluga → 202 → evento cru persistido → BullMQ → worker normaliza (telefone E.164, CPF, e-mail em minúsculas) → Pessoa criada ou reutilizada + Oportunidade na etapa de entrada do funil comercial do produto → visível na tela de Leads do workspace, com RLS provando que workspace A não lê B.

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

O ticket **09** fecha o tracer bullet: a partir dele, um `POST` da Pluga produz lead real no banco. Os tickets 10 a 16 endurecem e tornam visível o que o 09 já faz.

## Antes de começar

O ticket **01 absorve a verificação do item A7**: as migrações precisam ser autoradas sem banco local. Se `prisma migrate diff` não funcionar como o [ADR-0010](../../docs/adr/0010-migrations-e-ci-cd.md) assume, a premissa "sem ambiente local" racha e o ADR precisa ser emendado **antes** de qualquer outro ticket.

O item **A6** (o que o plano free do Supabase garante de backup) é gate do primeiro `migrate deploy` em produção, não ticket de código. Sem staging, o backup é a única rede.
