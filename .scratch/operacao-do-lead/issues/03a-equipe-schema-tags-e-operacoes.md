# 03a — Equipe: schema, tags e operações

**What to build:** O catálogo que tudo nesta fase espera — estado do vínculo, dados denormalizados do membro, `Tag`, `MemberTag` — e as operações nomeadas que gravam e leem a Equipe. Sem tela: é a metade do antigo ticket 03 que os tickets 04, 05 e 06 realmente bloqueiam.

**Blocked by:** None — can start immediately

**Status:** done

> Por que separado: o ticket 03 original juntava schema, `Tag`/`MemberTag`, Auth Admin, convite, mudança na `resolve_user_workspaces` e a tela inteira — e 4 dos 7 tickets da fase esperavam por ele. Racha em dois: o que destrava os outros (este) e o que é superfície (03b). O 05 pode começar assim que este fechar.

## Acceptance criteria

- [x] Mapeamento do [ADR-0005](../../../docs/adr/0005-idioma-codigo-en-ui-pt-br.md) **antes** da migration: `WorkspaceMember.status` (`ACTIVE | DETACHED`, default `ACTIVE`), `display_name`, `email`, `whatsapp_phone_e164`, `Tag`, `MemberTag`. Tag na oportunidade **não** nasce
- [x] **Backfill na mesma migration que cria as colunas.** O `OWNER` da Hugs já existe em produção e nunca passou por cadastro: sem `UPDATE ... FROM auth.users` preenchendo `display_name`/`email`, a Equipe abre com a linha da Direção em branco. Isto não é opcional — é o único vínculo real que o sistema tem hoje
- [x] `resolve_user_workspaces` devolve só vínculo `ACTIVE` — a quarta função da lista fechada ganha o filtro; não nasce sexta ([ADR-0019](../../../docs/adr/0019-resolucao-pre-contexto-e-executor-privado.md), [ADR-0023](../../../docs/adr/0023-desligamento-desativa-o-vinculo.md))
- [x] Operação nomeada que grava o vínculo: papel `ATTENDANT | SUPERVISOR | MANAGER`, tags, telefone opcional, `ACTIVE`. Recebe o `user_id` **já resolvido** — a Auth Admin fica na rota (03b), e testes de banco não sobem o Supabase
- [x] Nunca grava `can_provision_workspace`. Nunca cria papel `OWNER` ([ADR-0021](../../../docs/adr/0021-dois-caminhos-de-nascimento-login-fechado.md))
- [x] Atrelar de novo o mesmo `user_id` neste workspace com vínculo `DETACHED` volta a `ACTIVE` com papel e tags novos — **não** cria segunda linha
- [x] Criar tag inexistente e aplicá-la ao membro são a mesma operação; várias tags no mesmo membro ([ADR-0020](../../../docs/adr/0020-tag-no-membro-define-o-time.md))
- [x] Unicidade de tag por workspace e nome, sem distinguir maiúscula
- [x] Operação nomeada de leitura da Equipe, com o escopo do papel aplicado dentro dela. Neste ticket o Supervisor ainda lê o quadro inteiro — o recorte de time é o 05, que precisa deste catálogo para computá-lo
- [x] Telefone WhatsApp opcional, normalizado pelo mesmo leitor da ingestão; o disparo permanece Fase 4
- [x] `UserContext` **não** ganha tags. O catálogo existe para o 05 computar o time **dentro** da operação, não para reconstruir o contexto a cada edição da Equipe
- [x] Seam 3: `Tag` e `MemberTag` com RLS habilitada e forçada, policy de isolamento, índice começando por `workspace_id`; nenhum import do client cru; nenhum `SECURITY DEFINER` além da lista fechada
- [x] Costura principal: cadastro atrela `user_id` já existente; reativa `DETACHED` sem segunda linha; nunca grava direito de provisionar; nunca cria `OWNER`; `listUserWorkspaces` omite `DETACHED`; o backfill preencheu o vínculo pré-existente

## Implementation evidence

**13 de 13 critérios marcados.** Auditoria em 2026-08-17 sobre o código já entregue — não pelo implementador.

**Como cada critério foi verificado.** Cadastro, reativação de `DETACHED`, recusa de `OWNER`/direito de provisionar, unicidade de tag e RLS de `Tag`/`MemberTag` estão cobertos por teste contra Postgres. Mapeamento do ADR-0005, backfill na mesma migration, filtro `ACTIVE` em `resolve_user_workspaces` e ausência de tags no `UserContext` foram conferidos por leitura de código. **Nenhuma verificação em navegador foi feita** — este ticket não tem tela.

**Schema (migration `packages/db/prisma/migrations/20260814000100_equipe_member_tags/migration.sql`):** `WorkspaceMember.status` (`ACTIVE | DETACHED`, default `ACTIVE`), `display_name`, `email`, `whatsapp_phone_e164`; tabelas `Tag` e `MemberTag` com RLS habilitada e forçada, policy de isolamento, índice começando por `workspace_id`. Unicidade de tag por workspace e nome, sem distinguir maiúscula. Tag na oportunidade não nasce. Backfill de `display_name`/`email` a partir de `auth.users` na mesma migration. `private.resolve_user_workspaces` passa a filtrar `status = ACTIVE` — quarta função da lista fechada, sem sexta.

**Operações:** `packages/db/src/team.ts` — `attachWorkspaceMember` recebe `user_id` já resolvido, grava `ATTENDANT | SUPERVISOR | MANAGER`, tags e telefone opcional, `ACTIVE`; recusa `OWNER` e nunca toca `can_provision_workspace`. Mesmo `user_id` com vínculo `DETACHED` volta a `ACTIVE` sem segunda linha. Criar tag inexistente e aplicá-la são a mesma operação. `listTeam` aplica o escopo do papel dentro da operação; neste ticket o Supervisor ainda lê o quadro inteiro.

**Testes:** `packages/db/tests/team.test.ts` (costura principal) e `packages/db/tests/rls.test.ts` (`Tag`/`MemberTag` sob RLS).

## Fora deste ticket

Tela, convite e edição pela UI (03b). Desatrelar e desligar (04). Escopo do Supervisor (05). Atribuição (06). Disparo WhatsApp.
