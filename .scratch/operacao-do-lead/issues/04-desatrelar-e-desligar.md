# 04 — Desatrelar e desligar

**What to build:** Gestão tira o colaborador só deste workspace; Direção tira a pessoa do quadro dela — os vínculos ativos em todos os tenants em que **o ator** é dono. Leads em aberto voltam à fila daquele tenant, guardando quem os tinha; ganho e perda ficam. Login, membro e Oportunidade não são apagados. Ninguém se desliga sozinho nem derruba a Direção daquele workspace.

**Blocked by:** 03a — Equipe: schema, tags e operações · 03b — Equipe: tela e convite (os botões moram nessa tela)

**Status:** done

## Acceptance criteria

- [x] Desatrelar é da Gestão ou da Direção, **neste** workspace: marca `DETACHED`; a pessoa deixa de resolver aquele slug (404 uniforme, igual a slug inexistente) e pode continuar em outro tenant ([ADR-0023](https://github.com/petzada/marctco/blob/main/docs/adr/0023-desligamento-desativa-o-vinculo.md), [ADR-0012](https://github.com/petzada/marctco/blob/main/docs/adr/0012-contexto-de-tenant-na-url.md))
- [x] Oportunidades `OPEN` daquele responsável naquele tenant voltam à fila sem dono; `WON`/`LOST` permanecem com o responsável histórico; contexto do card e linha do tempo intactos
- [x] **`previous_assigned_user_id` guarda quem tinha o lead.** Devolver à fila é um `UPDATE` em massa e silencioso — quem tinha 200 abertos larga 200 cards sem dono, e a `Activity` só nasce na Fase 3. Sem esta coluna, "de quem eram estes leads" não existe em lugar nenhum do sistema ([ADR-0023](https://github.com/petzada/marctco/blob/main/docs/adr/0023-desligamento-desativa-o-vinculo.md))
- [x] Desligar é só da Direção. A operação recebe o contexto do workspace onde o botão foi clicado (prova que o ator é `OWNER` **ali**) e, via a lista de workspaces do próprio ator, aplica o desatrelamento em cada tenant em que ele é Direção. Gestão da Hugs não atravessa a ACR
- [x] **O alcance é o do ator, e a UI não promete mais que isso.** Um vínculo dessa pessoa em workspace de outro cliente da marctco não é alcançado — e não deve ser. Nenhum texto de tela diz "ela não entra em workspace nenhum"; o que se diz é que ela sai de todos os seus e não ganha workspace novo
- [x] Desligar revoga o direito de provisionar no Auth. Sem vínculo `ACTIVE` restante e sem direito, a próxima sessão cai na **tela de erro** do ticket 01 — não numa sala de espera e não num redirect mudo para o login
- [x] Não nasce função `SECURITY DEFINER` nova: cada tenant abre o próprio contexto de acesso
- [x] Recusa desatrelar ou desligar a si mesmo
- [x] Recusa desatrelar o `OWNER` daquele workspace — o vínculo do provisionamento não se desfaz pela Equipe
- [x] Não apaga login, linha de membro nem Oportunidade
- [x] `listUserWorkspaces` omite `DETACHED` (o filtro do 03a passa a ter consumidor de escrita)
- [x] Costura principal: desatrelar neste tenant devolve `OPEN` à fila e preserva fechados; `previous_assigned_user_id` fica com quem saiu; Direção dona de dois tenants desativa os dois vínculos; Gestão não atravessa o outro
- [x] Atendente continua recusado na Equipe; Supervisor ainda não desatrela (matriz: desatrelar é Gestão para cima)

## Fora deste ticket

Escopo do Supervisor (ticket 05). UI de atribuir e reatribuir (ticket 06) — os testes desta operação podem semear responsável.

## Implementation evidence

**13 de 13 critérios marcados** em 2026-08-17. Verificado por testes de banco e leitura de código contra o critério. **Nenhuma verificação em navegador:** botões, recusas e o texto de alcance foram conferidos no código da Equipe, não na tela renderizada.

**Operações:** `packages/db/src/team.ts` — `detachWorkspaceMember` e `terminateWorkspaceMember`. Desatrelar marca `DETACHED` neste workspace e devolve `OPEN` à fila com `previous_assigned_user_id`; desligar aplica o mesmo em cada tenant em que o ator é Direção. Sem `SECURITY DEFINER` nova: cada tenant abre o próprio contexto.

**Schema:** `packages/db/prisma/migrations/20260814000200_detach_and_terminate/migration.sql`.

**UI e Auth:** `apps/web/app/workspace/[slug]/team/member-lifecycle-actions.tsx`; `members/route.ts` chama `revokeProvisioningEntitlement` quando não resta vínculo `ACTIVE`.

**Testes:** `packages/db/tests/team-membership-lifecycle.test.ts` — recusa a si mesmo e ao `OWNER`, preservação de `WON`/`LOST`, alcance do ator, `listUserWorkspaces` omitindo `DETACHED`.
