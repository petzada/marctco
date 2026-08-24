# 03 — Isolamento por RLS, provado

**Blocked by:** 01

**Status:** done

> **Nota de supersessão — ADR-0019:** a lista final de `SECURITY DEFINER` agora tem quatro funções; `resolve_user_workspaces` usa o executor técnico `marctco_private_definer`, e as demais precisam de executor equivalente ao serem materializadas. O estado `done` registra a fundação entregue neste ticket; a implementação e a prova dessa emenda pertencem ao ticket 04 e aos tickets que materializam as funções, sem marcar seus critérios como concluídos antes da validação.

## Nota de escopo (registrada ao fechar o ticket)

O ticket 01 já entregou boa parte da base SQL desta issue (papéis prefixados, `FORCE ROW LEVEL SECURITY`, policies keiadas em `app.workspace_id` com subselect, índice em `workspace_id`, a varredura de `pg_tables`/`pg_policies`, a enumeração de `SECURITY DEFINER` e a checagem de atributos de papel) — ver "Descobertas do ticket 01". O que faltava, e que este ticket constrói, é a camada TypeScript em `packages/db`: `AccessContext` (união discriminada, dois construtores, nenhum literal) e `withAccessContext`, o único caminho de transação que os named operations futuros vão usar.

Nenhuma tabela de negócio além de `Workspace`/`WorkspaceMember` existe ainda nesta fatia — `Person`, `Opportunity`, `IntegrationEvent` e `IntakeReview` nascem nos tickets 06 a 11. Por isso, os critérios que citam operações nomeadas específicas (`listLeads`, `countLeadsByMarker`, etc.) ou a regra de escopo do `ATTENDANT` **não podem ser código ainda** — não há tabela para consultar. Ficam desmarcados de propósito, com o motivo explicado ao lado de cada um, e a infraestrutura que os tickets 04–17 vão usar para implementá-los está pronta e testada.

**Sobre o drift check:** ele compara `schema.prisma` com o banco migrado e não modela policy, função, papel, grant nem GUC — exatamente o SQL que carrega o modelo de segurança fica fora do alcance dele (ADR-0010 guard 7). Quem cobre essa superfície é este Seam 3: a varredura de `pg_tables`/`pg_policies`, a lista fechada de `SECURITY DEFINER`, os atributos de papel e a ausência de referência ativa a registro mesclado. As duas verificações não se substituem.

## What to build

A garantia, **no banco**, de que um workspace não lê nem escreve dados de outro — e a prova automática de que isso continua verdadeiro a cada alteração.

O dado em questão é CPF, telefone e situação financeira de pessoas reais. A garantia não pode depender de alguém lembrar de filtrar por `workspace_id` numa consulta.

Ver [ADR-0006](https://github.com/petzada/marctco/blob/main/docs/adr/0006-rls-duas-camadas-guc-worker.md). Atenção ao modo de falha silencioso: `ENABLE ROW LEVEL SECURITY` **não** se aplica ao dono da tabela, e o dono é o papel das migrações. Sem `FORCE`, o teste ingênuo passa e não há isolamento nenhum.

## Acceptance criteria

- [x] Papéis separados: migrações (dono, DDL), app e worker (sem `BYPASSRLS`), `service_role` restrito a ferramenta interna
- [x] `ENABLE` **e** `FORCE ROW LEVEL SECURITY` em toda tabela de negócio
- [x] Policies keiam em `app.workspace_id`, com a leitura do GUC envolta em subselect — sem isso a função é avaliada por linha
- [x] Índice em `workspace_id` em toda tabela de negócio
- [x] Helper de transação em `packages/db` faz `SET LOCAL` (nunca `SET`) e é o único caminho de acesso a dado — `withAccessContext` em `packages/db/src/internal/scoped-transaction.ts`
- [x] **`AccessContext` é união discriminada com dois construtores e nenhum literal** ([ADR-0016](https://github.com/petzada/marctco/blob/main/docs/adr/0016-contexto-de-acesso-e-leitor-escopado.md)):
  - `UserContext` (`workspace_id`, `user_id`, `role`) — construído no `apps/web` pela validação do `slug` contra `WorkspaceMember`
  - `JobContext` (`workspace_id`, `integration_event_id`) — construído no `apps/worker` a partir do `workspace_id` do job
- [x] **Duas variantes porque o worker não tem usuário nem papel.** Contexto único obrigaria o job a inventar um papel — papel sem escopo declarado é o que o [ADR-0015](https://github.com/petzada/marctco/blob/main/docs/adr/0015-perfis-de-acesso-e-escopo.md) proíbe; e `role` opcional quebraria o fail-closed no único processo que toca todos os tenants
- [ ] **`packages/db` não exporta o client do Prisma.** Exporta operações **nomeadas** que recebem `AccessContext` — `listLeads`, `countLeadsByMarker`, `getLead`, `listIntegrationEvents`, `findPersonCandidates`, `getQuarantinedEvent`, `assignLead`, `resolveIntakeReview`, `applyIntakePlan`. Receber o papel não basta: um helper que devolve o client torna o `role` um parâmetro inerte, e nenhum tipo obriga o `findMany` da tela a filtrar por `assigned_user_id`
  — **Parcial.** O client cru não é exportado (verificado pelo Seam 3, item abaixo), mas as nove operações nomeadas ainda não têm código: `Person`, `Opportunity`, `IntegrationEvent` e `IntakeReview` não existem nesta fatia até os tickets 06–11. Cada operação nasce com sua tabela, sobre `withAccessContext`.
- [ ] **`listLeads(jobCtx)` não compila.** Só `findPersonCandidates` e `applyIntakePlan` aceitam as duas variantes, e as duas são do caminho de ingestão
  — **Parcial.** `listLeads` ainda não existe. O mecanismo que faz essa chamada não compilar está provado genericamente em `packages/db/tests/access-context.type-check.ts`, com uma operação representativa `UserContext`-only e `@ts-expect-error` na chamada com `JobContext`; roda em `pnpm typecheck` e quebra o build se a barreira regredir.
- [x] **Baseline superseded:** esta fundação fechou e varreu a lista então vigente de três funções sem tenant. O [ADR-0019](https://github.com/petzada/marctco/blob/main/docs/adr/0019-resolucao-pre-contexto-e-executor-privado.md) substitui-a por quatro e exige o executor técnico; a atualização verificável do Seam 3 é trabalho pendente do ticket 04.
- [x] O client cru vive num módulo interno de `packages/db`; `no-restricted-imports` barra o import de fora e o **CI reprova**
- [ ] Cada operação aplica, do lado de dentro, o `SET LOCAL`, o escopo do papel, o cursor keyset e o índice que lhe corresponde ([ADR-0013](https://github.com/petzada/marctco/blob/main/docs/adr/0013-fluxo-de-dados-no-app.md))
  — **Parcial.** `withAccessContext` aplica o `SET LOCAL`; escopo do papel, keyset e índice por operação só existem quando a operação existir (mesma razão do item acima).
- [x] **Fail-closed**: papel ausente ou desconhecido num `UserContext` faz a operação recusar, nunca devolver tudo. A outra metade do fail-closed é do compilador — operação que exige `UserContext` não aceita `JobContext`
- [x] É o ponto único onde o escopo por perfil mora — agora como interface, não como intenção ([ADR-0015](https://github.com/petzada/marctco/blob/main/docs/adr/0015-perfis-de-acesso-e-escopo.md)) — `UserContext.role` viaja obrigatoriamente por `withAccessContext`; nenhuma consulta futura em `packages/db` alcança dado sem passar por ele
- [ ] Uma regra implementada nesta fatia: **`ATTENDANT` enxerga apenas oportunidade atribuída a si**. O restante da matriz é especificação, não código
  — **Não cumprido nesta ticket.** `Opportunity` não existe até o ticket 09; a regra só pode virar código dentro de `listLeads`/`getLead` (ticket 12), sobre o ponto único já construído aqui.
- [x] **Nenhum estado mutável em escopo de módulo** em `apps/web` nem em `apps/worker`: workspace resolvido, papel e flag jamais em singleton ou cache sem chave de workspace. A RLS não pega esse vazamento — a leitura foi legítima, o que vaza é o resultado dentro do processo ([ADR-0006](https://github.com/petzada/marctco/blob/main/docs/adr/0006-rls-duas-camadas-guc-worker.md) regra 11) — regra de ESLint (`no-restricted-syntax`, `Program > VariableDeclaration[kind!='const']`) barra `let`/`var` em escopo de módulo nesses dois apps
- [x] Nenhuma transação envolve chamada de rede externa
  — **Fechado pelo ticket 15**, como a tabela de pendências previa. O único I/O externo do sistema é a publicação no BullMQ, e ela acontece fora de qualquer transação: `dispatchPendingIntegrationEvents` publica e **depois** chama `markIntegrationEventDispatched`, que é quem abre a transação. A ordem é obrigatória por outro motivo (marcar antes faria uma publicação falha parecer trabalho entregue), então as duas regras se sustentam mutuamente. O Seam 2 exercita o caminho com Redis inalcançável e prova que a transação seguinte simplesmente não acontece.
- [x] **Seam 3**: varredura de `pg_tables` e `pg_policies` reprova qualquer tabela de negócio sem RLS habilitada, sem `FORCE` ou sem policy
- [x] Teste: leitura cross-workspace devolve zero linhas
- [x] Teste: escrita cross-workspace é recusada
- [x] **Os testes de isolamento conectam com o papel do app**, não com o dono — rodar como dono com `FORCE` passa sem provar que o papel do app carece de `BYPASSRLS`
- [x] **Seam 3 assere atributos de papel**: o papel do app não é superusuário, não tem `BYPASSRLS` e não é dono de tabela de negócio
- [x] **Baseline superseded:** o Seam 3 enumera `SECURITY DEFINER` e provou a lista de três então vigente. O ADR-0019 exige expandir a prova para a lista fechada de quatro, owner técnico, grants e policies mínimos; isso permanece pendente até a implementação do ticket 04.
- [x] Schema `private` existe, com `EXECUTE` das funções revogado de todo papel exceto o do app, e `search_path` fixado em cada função
  — **Fechado pelo ticket 15.** A lista fechada materializou-se inteira (e virou cinco, ADR-0019 emendado). A verificação deixou de ser um caso escrito à mão por função: o Seam 3 varre **toda** função `SECURITY DEFINER` do schema `private` e cobra `search_path=pg_catalog`, `EXECUTE` fora de `PUBLIC` e do worker, e executor sem `LOGIN` e sem `BYPASSRLS`. A sexta função, se existir, nasce sujeita à prova.
  — **Supersessão 2026-08-19:** a sexta nasceu no [ADR-0019](https://github.com/petzada/marctco/blob/main/docs/adr/0019-resolucao-pre-contexto-e-executor-privado.md) como `claim_overdue_opportunity_workspaces`; o Seam 3 passa a esperar seis quando o ticket 09 da Fase 3 a materializar, e continua reprovando a sétima.
- [x] **Seam 3 verifica que nenhum registro ativo aponta para um registro mesclado**, em nenhuma tabela ([ADR-0007](https://github.com/petzada/marctco/blob/main/docs/adr/0007-ingestao-idempotencia.md)) — varredura genérica por coluna `merged_into_%`, provada contra uma violação sintética porque nenhuma tabela real tem essa coluna ainda
- [x] **Seam 3 reprova qualquer import do client cru do Prisma fora de `packages/db`** — é a varredura que impede o escopo de papel de virar convenção outra vez, e nenhuma rota a exercita ([ADR-0016](https://github.com/petzada/marctco/blob/main/docs/adr/0016-contexto-de-acesso-e-leitor-escopado.md))
- [x] Os testes rodam no CI e barram o merge — `pnpm test:unit` e `pnpm test:db` fazem parte dos jobs `Quality`/`Database` do `.github/workflows/ci.yml`; PR #8 com `Database`, `Quality` e o gate `CI` verdes
- [x] Uma tabela nova criada sem policy **reprova** o CI — verificado deliberadamente
- [x] Fica registrado no ticket que **o drift check não cobre policy, função, papel nem grant**: é este seam que cobre, e os dois não se substituem — ver "Nota de escopo" acima
