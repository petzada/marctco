# 04 — Gatilho na chegada e quarentena

**What to build:** Quando o gestor configura gatilho **na chegada**, a mesma transação que cria a Oportunidade registra a tentativa/outbox — na ingestão e na liberação da quarentena. O engate `post_creation_effects` deixa de ser só planejamento, sem chamar Redis diretamente.

**Blocked by:** 02 — Conexão WhatsMiau; 03a — Tentativa outbound e outbox transacional

**Status:** done

- [x] Worker de ingestão consome `AUTO_FIRST_CONTACT` **somente** com gatilho `ON_ARRIVAL` e registra tentativa na transação de criação — não duplica lógica fora do módulo profundo do 03a
- [x] Operação nomeada em `packages/db` encapsula flags, configuração e planejamento para a liberação de quarentena; o handler web não importa o catálogo de feature flags
- [x] Template renderizado sem variáveis de atendente; recusa de template que exija variáveis proibidas neste gatilho
- [x] Mesmas regras de opt-in, dedupe e elegibilidade do 03a; `first_contact_at` só nasce depois no worker
- [x] Com gatilho `ON_ASSIGNMENT`, ingestão e quarentena **não** registram tentativa
- [x] Testes: `ON_ARRIVAL` registra outbox na ingestão; `ON_ASSIGNMENT` não; release de quarentena registra quando aplicável; falta de opt-in falha fechado

## Fora deste ticket

Hook de atribuição (03c), webhook inbound, UI da timeline (06), Seam 4 (07).

## Evidence

- `planArrivalChannelOutboundInTransaction` em `packages/db/src/channel-outbound.ts` lê flags, gatilho, pairing e snapshot da Oportunidade na transação do chamador e consome `AUTO_FIRST_CONTACT` só em `ON_ARRIVAL`, reusando `planAndRecordChannelOutboundAttemptInTransaction` com `attendant_phone_present: false`.
- `applyIntakePlanInTransaction` registra a tentativa depois do claim da submission, na mesma transação da criação. `decideAndApplyIntake` devolve `post_creation_effects` só quando nasceu tentativa (`QUEUED` ou `FAILED`). Worker só encaminha; não remonta flags nem chama Redis. `apps/web/lib/release-quarantined-lead.ts` continua em `decideAndApplyIntake` sem importar o catálogo.
- `ON_ASSIGNMENT`, flag off, `DISABLED`, opt-in ausente/falso e lead sem telefone não criam intenção. Instância desconectada nasce `FAILED` observável. `first_contact_at` permanece null.
- Testes em `packages/db/tests/channel-outbound-arrival.test.ts` (8), worker/domain/release adapter, intake, quarentena, atribuição 03c, RLS, Seam 2. Typecheck, lint, migration-safety e drift verdes. Sem migration nova. Sem commit.
- Revisão Composer 2.5 (`1a02383f-ffde-4f6c-a4f3-afb07ea4e748`): approve, nenhum defeito confirmado. Gates reexecutados verdes.
