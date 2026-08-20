# 07 — Seam 4: atribuição até evidência persistida

**What to build:** Prova ponta a ponta do caminho canônico e da durabilidade: Gestão entrega ao Supervisor (sem tentativa) → Supervisor reatribui ao Atendente (outbox no commit) → dispatcher/fila/worker com WhatsMiau fake → timeline e `first_contact_at`.

**Blocked by:** 03b — Dispatcher, worker e adapter WhatsMiau; 03c — Disparo na atribuição

**Status:** done

- [x] Novo teste Seam 4 em `tests/`, espelhando infra do Seam 2: Postgres real, fila real, worker com HTTP mockado
- [x] Caminho feliz: atribuição em dois níveis até Atendente → tentativa/outbox → um `sendText` → fato outbound → `first_contact_at`
- [x] Simular queda após commit e antes da publicação; nova passada do dispatcher entrega sem intervenção
- [x] Simular queda depois de iniciar `sendText` e antes de persistir resultado; tentativa termina ambígua/`FAILED` e não chama a API novamente
- [x] Reprocessar job após `SENT` e reatribuir depois não chamam `sendText` de novo
- [x] Variantes: flag off; `DISABLED`; atribuição só ao Supervisor; opt-in ausente/falso; `missing_phone`; mesclado; instância desconectada; template inválido; falha HTTP sem `first_contact_at`
- [x] Massa: N oportunidades elegíveis produzem N tentativas e respeitam rate limit por workspace
- [x] Corrida: Atividade concluída e WhatsApp não sobrescrevem o primeiro `first_contact_at`
- [x] CI executa o seam no job `database`, ao lado de `test:seam2`
- [x] Helpers de inspeção pós-condição estendidos para fatos de mensagem e tentativa outbound

## Fora deste ticket

Gatilho `ON_ARRIVAL` (ticket 04), webhook inbound (05), copy do card (06), pareamento QR real contra produção.

## Evidence

- `tests/seam4-assignment.test.ts`: Postgres + Redis/BullMQ + worker reais; só a porta `sendText` é fake. 13 testes. Gestão→Supervisor não nasce tentativa; Supervisor→Atendente grava outbox `PENDING`/`QUEUED` no mesmo commit; job delayed 30s; um `sendText` → `WHATSAPP_OUTBOUND_SENT` + `first_contact_at` (texto do worked example). Reprocessar SENT e reatribuir não reenviam.
- Recuperação commit→publicação: publish `ECONNREFUSED` deixa `PENDING`; o lease de 2 min (03b) é avançado no inspector e a passada real do dispatcher publica sem segundo `sendText`. Crash após início HTTP: `PROCESSING` → `FAILED`/`UNCERTAIN_EXTERNAL` sem segunda chamada.
- Negativas: flag off, `DISABLED`, opt-in ausente/falso, `missing_phone`, card mesclado (`NOT_VISIBLE`), instância desconectada (`FAILED`+`DISPATCHED`+`INSTANCE_NOT_CONNECTED` no commit), template inválido recusado no write e fail-closed no worker, HTTP 500 sem `first_contact_at`.
- Massa: 7 cards + vizinho; 6 SENT no workspace sob rate limit, 1 QUEUED, vizinho SENT, 7 `sendText`. Corrida Activity vs WhatsApp: um `first_contact_at` write-once.
- Helpers em `packages/db/tests/seam-inspection.ts`: fatos outbound (tipo/instante, sem preview), tentativas (status/timestamps, sem telefone/corpo), reviews de duplicata só com ids, fixture de lease. Job Redis carrega só `attempt_id`+`workspace_id`.
- CI: `pnpm test:seam4` no job `database` imediatamente após `test:seam2`. Projeto Vitest `seam4` com app role + `SEAM2_ADMIN_DATABASE_URL`.
- Gates: `test:seam4` 13/13, `test:seam2` 24/24, typecheck, lint, `check:migrations`, `db:drift` verdes. Sem migration nova. Sem commit.
- Revisão Composer 2.5 (`ec850ba0-03d2-4c6a-8958-24e20b308ae8`): approve with nits (reprocess SENT via função do worker como o Seam 2; filtro de workspace no worker de teste; export morto `clearWorkspaceFeatureFlag` removido). Sem correção de produção.
