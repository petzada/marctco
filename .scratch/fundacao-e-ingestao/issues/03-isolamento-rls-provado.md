# 03 — Isolamento por RLS, provado

**Blocked by:** 01

**Status:** ready-for-agent

## What to build

A garantia, **no banco**, de que um workspace não lê nem escreve dados de outro — e a prova automática de que isso continua verdadeiro a cada alteração.

O dado em questão é CPF, telefone e situação financeira de pessoas reais. A garantia não pode depender de alguém lembrar de filtrar por `workspace_id` numa consulta.

Ver [ADR-0006](../../../docs/adr/0006-rls-duas-camadas-guc-worker.md). Atenção ao modo de falha silencioso: `ENABLE ROW LEVEL SECURITY` **não** se aplica ao dono da tabela, e o dono é o papel das migrações. Sem `FORCE`, o teste ingênuo passa e não há isolamento nenhum.

## Acceptance criteria

- [ ] Papéis separados: migrações (dono, DDL), app e worker (sem `BYPASSRLS`), `service_role` restrito a ferramenta interna
- [ ] `ENABLE` **e** `FORCE ROW LEVEL SECURITY` em toda tabela de negócio
- [ ] Policies keiam em `app.workspace_id`, com a leitura do GUC envolta em subselect — sem isso a função é avaliada por linha
- [ ] Índice em `workspace_id` em toda tabela de negócio
- [ ] Helper de transação em `packages/db` faz `SET LOCAL` (nunca `SET`) e é o único caminho de acesso a dado
- [ ] **`AccessContext` é união discriminada com dois construtores e nenhum literal** ([ADR-0016](../../../docs/adr/0016-contexto-de-acesso-e-leitor-escopado.md)):
  - `UserContext` (`workspace_id`, `user_id`, `role`) — construído no `apps/web` pela validação do `slug` contra `WorkspaceMember`
  - `JobContext` (`workspace_id`, `integration_event_id`) — construído no `apps/worker` a partir do `workspace_id` do job
- [ ] **Duas variantes porque o worker não tem usuário nem papel.** Contexto único obrigaria o job a inventar um papel — papel sem escopo declarado é o que o [ADR-0015](../../../docs/adr/0015-perfis-de-acesso-e-escopo.md) proíbe; e `role` opcional quebraria o fail-closed no único processo que toca todos os tenants
- [ ] **`packages/db` não exporta o client do Prisma.** Exporta operações **nomeadas** que recebem `AccessContext` — `listLeads`, `countLeadsByMarker`, `getLead`, `listIntegrationEvents`, `findPersonCandidates`, `getQuarantinedEvent`, `assignLead`, `resolveIntakeReview`, `applyIntakePlan`. Receber o papel não basta: um helper que devolve o client torna o `role` um parâmetro inerte, e nenhum tipo obriga o `findMany` da tela a filtrar por `assigned_user_id`
- [ ] **`listLeads(jobCtx)` não compila.** Só `findPersonCandidates` e `applyIntakePlan` aceitam as duas variantes, e as duas são do caminho de ingestão
- [ ] **As três funções sem tenant não recebem `AccessContext` e não podem receber** — elas acontecem antes de existir workspace, e são justamente as que produzem o `workspace_id` que o constrói. Lista fechada de três, varrida pelo Seam 3 ([ADR-0006](../../../docs/adr/0006-rls-duas-camadas-guc-worker.md) regra 9)
- [ ] O client cru vive num módulo interno de `packages/db`; `no-restricted-imports` barra o import de fora e o **CI reprova**
- [ ] Cada operação aplica, do lado de dentro, o `SET LOCAL`, o escopo do papel, o cursor keyset e o índice que lhe corresponde ([ADR-0013](../../../docs/adr/0013-fluxo-de-dados-no-app.md))
- [ ] **Fail-closed**: papel ausente ou desconhecido num `UserContext` faz a operação recusar, nunca devolver tudo. A outra metade do fail-closed é do compilador — operação que exige `UserContext` não aceita `JobContext`
- [ ] É o ponto único onde o escopo por perfil mora — agora como interface, não como intenção ([ADR-0015](../../../docs/adr/0015-perfis-de-acesso-e-escopo.md))
- [ ] Uma regra implementada nesta fatia: **`ATTENDANT` enxerga apenas oportunidade atribuída a si**. O restante da matriz é especificação, não código
- [ ] **Nenhum estado mutável em escopo de módulo** em `apps/web` nem em `apps/worker`: workspace resolvido, papel e flag jamais em singleton ou cache sem chave de workspace. A RLS não pega esse vazamento — a leitura foi legítima, o que vaza é o resultado dentro do processo ([ADR-0006](../../../docs/adr/0006-rls-duas-camadas-guc-worker.md) regra 11)
- [ ] Nenhuma transação envolve chamada de rede externa
- [ ] **Seam 3**: varredura de `pg_tables` e `pg_policies` reprova qualquer tabela de negócio sem RLS habilitada, sem `FORCE` ou sem policy
- [ ] Teste: leitura cross-workspace devolve zero linhas
- [ ] Teste: escrita cross-workspace é recusada
- [ ] **Os testes de isolamento conectam com o papel do app**, não com o dono — rodar como dono com `FORCE` passa sem provar que o papel do app carece de `BYPASSRLS`
- [ ] **Seam 3 assere atributos de papel**: o papel do app não é superusuário, não tem `BYPASSRLS` e não é dono de tabela de negócio
- [ ] **Seam 3 enumera `SECURITY DEFINER`** e reprova qualquer função fora da lista fechada de três do [ADR-0006](../../../docs/adr/0006-rls-duas-camadas-guc-worker.md) regra 9 — sem isso a lista é comentário
- [ ] Schema `private` existe, com `EXECUTE` das funções revogado de todo papel exceto o do app, e `search_path` fixado em cada função
- [ ] **Seam 3 verifica que nenhum registro ativo aponta para um registro mesclado**, em nenhuma tabela ([ADR-0007](../../../docs/adr/0007-ingestao-idempotencia.md))
- [ ] **Seam 3 reprova qualquer import do client cru do Prisma fora de `packages/db`** — é a varredura que impede o escopo de papel de virar convenção outra vez, e nenhuma rota a exercita ([ADR-0016](../../../docs/adr/0016-contexto-de-acesso-e-leitor-escopado.md))
- [ ] Os testes rodam no CI e barram o merge
- [ ] Uma tabela nova criada sem policy **reprova** o CI — verificado deliberadamente
- [ ] Fica registrado no ticket que **o drift check não cobre policy, função, papel nem grant**: é este seam que cobre, e os dois não se substituem
