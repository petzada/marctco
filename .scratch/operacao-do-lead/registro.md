# Registro de execução — Operação do lead

**2026-08-17.** Fatia implementada; tickets 01–07 `done`.

## Entrega

- **Migrations:** `20260814*` — `equipe_member_tags`, `opportunity_campaign_and_form`, `provision_workspace_by_owner_name`, `detach_and_terminate`, `lead_assignment`.
- **Módulos:** `packages/db/src/team.ts`, atribuição em `packages/db/src/leads.ts`, `packages/db/src/lead-board.ts`, `packages/domain/src/team-scope.ts`, `packages/domain/src/lead-assignment.ts`.
- **Superfícies:** `/workspace/[slug]/team`, atribuição em `/workspace/[slug]/leads`, `/workspace/[slug]/my-leads`.
- **Testes:** `packages/db/tests/{team,team-membership-lifecycle,leads,lead-board}.test.ts` e domínio `team-scope` / `lead-assignment` / `lead-stage-move`.

A spec da fase foi o [PR #37](https://github.com/petzada/marctco/pull/37). ADRs 0024–0027 estão na árvore e aplicados no código.

## Produção (2026-08-17)

- **Migrations `20260814*`:** aplicadas. Job Production migration na `main` (run 32033449984): 22 migrations, schema up to date.
- **Piloto:** Supervisor com tag, atribuir da fila e reatribuir ao Atendente conferidos.
- **Meus leads do Supervisor:** o quadro passou a filtrar `assigned_user_id` do ator — card roteado some do quadro e fica na tabela. Código no [PR #47](https://github.com/petzada/marctco/pull/47); prova no browser depois do deploy.
