/implement Continuar a fatia "fundação e ingestão" até os 17 tickets em
`.scratch/fundacao-e-ingestao/issues/` estarem `Status: done`, com critérios
marcados e o aceite da fatia em `.scratch/fundacao-e-ingestao/README.md`
verificável.

Substitua/continue sob as regras de `PROMPT-GOAL-IMPLEMENTACAO.md`; este
handoff é o ponto de retomada oficial da sessão anterior.

# Quem é você

Você é o ORQUESTRADOR (Grok 4.5). Você NÃO implementa ticket do zero.
Despacha cada ticket a Composer 2.5 via Task (`composer-2.5-fast`,
`generalPurpose` ou `best-of-n-runner` em paralelo com worktrees).
Formato de resumo fixo; self-review; confrontar critérios/ADRs; só então
atualizar Status/registro.

# Atualização de 2026-08-07 — ticket 08 concluído E DEPLOY RESTABELECIDO

## Leia isto antes de qualquer coisa

**O deploy do Railway estava quebrado desde 2026-08-05 e ninguém tinha visto.**
Produção rodava `26a7843` (era do ticket 03) enquanto o banco já tinha 12
migrations: as migrations sobem pelo job de release do GitHub, que é
independente do Railway, então o schema andou e o código não. Os tickets 06, 07,
17 e 08 **nunca tinham subido**. Corrigido e deployado — produção está em
`a1681e4`, com os quatro tickets no ar.

Duas lições que valem para toda sessão seguinte:

1. **CI verde não é entrega.** Nada no pipeline construía imagem. Agora constrói
   — job `Image`, matriz web/worker — e o gate `CI` exige o resultado.
2. **Build que passa não é processo que sobe.** O `node_modules` ausente do
   `packages/domain` passou por um `docker build` local e morreu no boot. O job
   `Image` **executa** o container, não só o constrói.

**A fila está ligada.** `REDIS_URL` foi setada nos dois serviços por referência
(`${{Redis.REDIS_URL}}`) em 2026-08-07; faltava nos dois, não só no `web`. O
worker conecta e o dispatcher sobe. O que **ainda não foi exercitado** é o
caminho ponta a ponta em produção — `POST → outbox → dispatcher → BullMQ →
worker → Person` —, porque não há lead nem workspace lá. Depende da marcação em
`app_metadata`. Ver `acoes-manuais-pendentes.md`.

## O ticket

- **08 contrato v1 + Pessoa: done** (16/18 critérios; os dois restantes exigem
  escrita e são do 09, com o motivo escrito ao lado no arquivo da issue).
  Migration `20260807000100_persons_and_contacts` aplicada em produção,
  `pnpm test` 285 passando (1 pulado). Resumo completo em `registro.md`.
- **Branches:** todas as mescladas foram apagadas; o remoto tem só `main`.
- **O ticket 09 ganhou três critérios novos**, carregados do 08 e do review:
  `IntakeReview` com `IDENTITY_CONFLICT` (nenhum critério o mencionava — só o
  `POSSIBLE_DUPLICATE`), a escrita de contatos por `ON CONFLICT DO NOTHING`, e
  `Opportunity.missing_phone`, que estava na spec e em critério nenhum.
- **Próximo despacho: ticket 09** (Pessoa vira Oportunidade — o tracer bullet
  fecha). Ordem restante: `09 → (10 · 11 · 13 · 16 em paralelo se worktrees) →
  12 · 14 → 15`.
- **Mão humana pendente:** marcar um usuário apto em `app_metadata` para nascer
  o primeiro workspace, e então o lead de teste ponta a ponta. As duas
  `REDIS_URL` já foram setadas.
- **Descobertas do 08 para os próximos:** `readIntegrationEventForProcessing`
  já devolve o `provider` da conexão (o `target_pipeline_id` do 09 cabe no
  mesmo `SELECT`); `processIntegrationEventJob` devolve `person_decision_kind` (nunca a decisão — o BullMQ guarda o retorno em Redis) e o
  09 troca esse retorno pelo `IntakePlan`; `PersonContacts` é sempre o conjunto
  completo do envio, nunca um delta; `NO_CONTACT` é o gatilho de quarentena do
  ticket 10, já decidido; `PROVIDER_DEFAULT_SOURCE` rotula Pluga como
  `META_LEAD_ADS`, então o 13 precisa fazer o Google declarar `source`;
  a varredura de lápide do Seam 3 foi reescrita em `pg_catalog` e aceita
  `merged_into_opportunity_id` sem edição.

# Atualização de 2026-08-06 — ticket 17 concluído

- **17 provisionamento: done.** Branch `ticket/17-provisionamento-de-workspace`,
  migration `20260806000100_provision_workspace`, `pnpm test` 128/128.
  Resumo completo em `registro.md`.
- **Próximo despacho: ticket 07** (endpoint recebe e enfileira). Ordem restante:
  `07 → 08 → 09 → (10 · 11 · 13 · 16 em paralelo se worktrees) → 12 · 14 → 15`.
- **Mão humana antes de mesclar o 17:** `CREATE ROLE marctco_provisioner` +
  `GRANT … TO marctco_migrator` no Supabase, e `SUPABASE_SERVICE_ROLE_KEY` no
  Railway — `acoes-manuais-pendentes.md`.
- **Descobertas do 17 para os próximos:** `provisionWorkspace` não pode ser
  chamado dentro de outra transação; `CONSTRAINT TRIGGER` diferido roda no
  `COMMIT` fora do contexto `SECURITY DEFINER`, sob as policies do chamador;
  papel técnico `NOLOGIN` novo exige bootstrap humano enquanto o release rodar
  como `marctco_migrator`; claims verificadas vêm de `getAuthenticatedSession`.

# Estado validado ao fechar a sessão anterior (2026-08-05)

## Gate do ticket 06 — FECHADO (7/7)

- [x] 06 tratado como em revisão até evidência real
- [x] Encoding `Conclusão` OK em `packages/db/tests/rls.test.ts`
- [x] Teste mutação reversa verde (`prevents a targeted commercial pipeline from becoming legal later`)
- [x] Suíte DB 54/54 (Seam 3 + 009)
- [x] Standards + Spec com 009: 0/0 findings
- [x] `registro.md` com Ticket 04, Ticket 06+009, recuperações; Comments issue 06
- [x] 04→05→06 em PR #10 + recuperações #11/#12/#13; **Production migration verde**
      — run https://github.com/petzada/marctco/actions/runs/31031305105
      — `Database schema is up to date!` (9/9 migrations aplicadas em produção)

## origin/main

- HEAD inclui tickets **01–06** (código + docs) e recoveries.
- Migrations de produção: `001` … `009` aplicadas.
- Issues: **01–06 = done**; **07–17 = ready-for-agent** (17 ainda não despachado).

## Próximo despacho exato

**Ticket 17 — Provisionamento de workspace** (antes do 07).

Ordem canônica restante:
`17 → 07 → 08 → 09 → (10 · 11 · 13 · 16 em paralelo se worktrees) → 12 · 14 → 15`

Bloqueadores do 17: 03, 04, 05 — todos done. Fronteira: 17.

## Descobertas acumuladas (colar no briefing do Composer)

- `@marctco/db` não exporta Prisma cru; `withAccessContext` + `AccessContext` branded.
- `UserContext` só via `resolveUserContextForSlug` / `resolve_user_workspaces` (ADR-0019).
- Ticket 17: `private.provision_workspace` + importar `defaultCommercialPipeline` de `@marctco/domain` (nunca duplicar em SQL); direito em `app_metadata` (nunca `user_metadata`); onboarding em `/onboarding`.
- Ticket 07: `resolveWorkspaceByIntegrationToken` → GUC → leitura sob RLS; body sem workspace/origem.
- Migrations pós-foundation em Supabase: release como `marctco_migrator`; papéis `NOLOGIN` novos podem exigir bootstrap humano (CREATE ROLE + GRANT membership) se o migrator não tiver CREATEROLE; schema `private` agora owned by `marctco_migrator`.
- Redis Railway provisionado; `REDIS_URL` setada em `web` e `worker` por
  referência (`${{Redis.REDIS_URL}}`) em 2026-08-07. A fila roda; falta só
  exercitá-la com um lead real.
- Vitest unit precisa alias `@marctco/db` → source no CI.

## Ações manuais pendentes

Arquivo: `.scratch/fundacao-e-ingestao/acoes-manuais-pendentes.md`

- Crítico 002: **resolvido** (CREATE ROLE + GRANT + ALTER SCHEMA + Production migration verde).
- `REDIS_URL` nos serviços `web` e `worker`: **resolvido** em 2026-08-07.
- Por cliente novo: marcar usuário apto em Supabase `app_metadata` (painel; nunca `user_metadata`).

## PRs recentes

| PR | Conteúdo | Estado |
|----|----------|--------|
| #10 | tickets 04–06 | merged |
| #11 | recovery CREATE ROLE | merged |
| #12 | recovery GRANT membership | merged |
| #13 | recovery schema private owner | merged; Production migration verde |

## Regras preservadas

- Orquestrador não implementa do zero; Composer 2.5 implementa.
- Formato de resumo do briefing; paradas legítimas da lista fechada.
- Arquivo único de manuais; nunca push direto na main.
- Loop de contexto: aos ≤20% restante, gravar novo PROMPT-HANDOFF.md e parar.

# Briefing padrão ao Composer (ticket 17)

Leia PROMPT-INICIAL → AGENTS+CONTEXT → spec → issue 17 + ADRs citados
(0005, 0006, 0012, 0019, 0009) → supabase-postgres-best-practices antes de SQL.
TDD; branch `ticket/17-…` a partir de main atualizada; nunca push na main.
Cole as descobertas acima. Devolva o resumo no formato fixo do GOAL.
