# Contexto de acesso e leitor escopado

`packages/db` **não devolve o client do Prisma**. Ele expõe leituras e escritas **nomeadas**, cada uma recebendo um `AccessContext` — união de `UserContext` (workspace, usuário, papel) e `JobContext` (workspace, evento), construída num ponto só por requisição ou por job. O `SET LOCAL`, o escopo do perfil de acesso, a paginação keyset e o índice de cada consulta ficam do lado de dentro.

**Status:** accepted · 2026-08-05

> **Emendado pelo [ADR-0019](./0019-resolucao-pre-contexto-e-executor-privado.md):** a exceção pré-contexto inclui a quarta função `resolve_user_workspaces`, e `UserContext` é construído somente pelo resolvedor que usa seu resultado. As operações com `AccessContext` e suas garantias permanecem inalteradas.

## O problema

O [ADR-0015](./0015-perfis-de-acesso-e-escopo.md) promete que *"nenhuma consulta consegue ser escrita sem que o autor decida, ali, o que aquele papel enxerga"*, e a issue 03 repete a promessa como critério de aceite. Um helper com a forma `withWorkspace(workspaceId, role, tx => …)` **não consegue cumpri-la**.

Ele garante o `SET LOCAL` e nada mais. Entregue o client transacional ao chamador e o `role` vira parâmetro inerte: nenhum tipo, nenhum lint e nenhum teste obriga o `tx.opportunity.findMany` da tela a filtrar por `assigned_user_id`. A frase do ADR-0015 passa a descrever uma intenção, não uma interface — e intenção não reprova build.

O mesmo buraco engole tudo que o [ADR-0013](./0013-fluxo-de-dados-no-app.md) decidiu e deixou como convenção. Uma tela que escrever `skip:` em vez de cursor passa no CI inteiro, e o defeito não é lentidão: é lead deslocando entre uma página e outra e sumindo da triagem em silêncio, que aquele ADR chama de *"o mesmo pecado do ADR-0007 reaparecendo pela camada de apresentação"*.

## A decisão

**1. `AccessContext` é união discriminada, com dois construtores e nenhum literal.**

| Variante | Construída em | Carrega | Quem a produz |
|---|---|---|---|
| `UserContext` | `apps/web` | `workspace_id`, `user_id`, `role` | `resolveWorkspaceAccess` chama `resolveUserContextForSlug`: sessão Supabase + validação do `slug` contra `WorkspaceMember` ([ADR-0012](./0012-contexto-de-tenant-na-url.md), [ADR-0019](./0019-resolucao-pre-contexto-e-executor-privado.md)) |
| `JobContext` | `apps/worker` | `workspace_id`, `integration_event_id` | o `workspace_id` que o handler autenticado escreveu no job ([ADR-0007](./0007-ingestao-idempotencia.md)) |

**Duas variantes e não uma, porque o worker não tem usuário nem papel.** Um contexto único obrigaria o job a inventar um papel para preencher o campo — e papel sem escopo declarado é exatamente o que o [ADR-0015](./0015-perfis-de-acesso-e-escopo.md) proíbe ao fechar o enum em quatro. A alternativa, deixar `role` opcional, quebraria o fail-closed da regra 4 no único processo que toca todos os tenants.

O que as duas têm em comum é o `workspace_id`, que é o que alimenta o `SET LOCAL` — o isolamento do [ADR-0006](./0006-rls-duas-camadas-guc-worker.md) vale igual para as duas. O que **não** têm em comum é o escopo de papel, e por isso `listLeads(jobCtx)` não compila: um job nunca lê a tela de leads por acidente.

**2. `packages/db` expõe operações nomeadas, não um client.** Nesta fatia:

| Leitura | Aceita | Escrita | Aceita |
|---|---|---|---|
| `listLeads(ctx, cursor, filters)` | `UserContext` | `assignLead(ctx, id)` | `UserContext` |
| `countLeadsByMarker(ctx)` | `UserContext` | `resolveIntakeReview(ctx, id, resolution)` | `UserContext` |
| `getLead(ctx, id)` | `UserContext` | `applyIntakePlan(ctx, plan)` | ambos |
| `listIntegrationEvents(ctx, cursor)` | `UserContext` | | |
| `findPersonCandidates(ctx, plan)` | ambos | | |
| `getQuarantinedEvent(ctx, id)` | `UserContext` | | |

Cada uma abre a transação, faz o `SET LOCAL`, aplica o escopo do papel quando ele existe, e usa o cursor keyset e o índice parcial que lhe corresponde.

Duas aceitam as duas variantes, e as duas são do caminho de ingestão ([ADR-0017](./0017-ingestao-como-decisao-e-plano.md)): `findPersonCandidates`, que executa o `PersonLookupPlan`, e `applyIntakePlan`. É a consequência direta de a ingestão ter dois chamadores — o job e o "completar e liberar" do gestor.

**3. As quatro consultas sem tenant são a exceção, e ela já é fechada.** `resolve_workspace_by_token_hash`, `claim_pending_events`, `provision_workspace` e `resolve_user_workspaces` acontecem **antes** de existir workspace para pôr num contexto — são justamente as que produzem ou validam o `workspace_id` com que o contexto é construído ([ADR-0006](./0006-rls-duas-camadas-guc-worker.md) regra 9). Elas não recebem `AccessContext` e não podem receber. A lista é fechada em quatro, o Seam 3 reprova qualquer `SECURITY DEFINER` fora dela, e nenhuma devolve payload. Sem esta cláusula escrita, a regra 2 pareceria ter um furo — e uma quinta função entraria por ele. O owner técnico e os retornos mínimos são do ADR-0019.

**4. O client cru continua existindo, e continua interno.** Um módulo só dentro de `packages/db` o alcança. `no-restricted-imports` barra o resto e o CI reprova o import de fora — na mesma família das varreduras do Seam 3, que existem porque nenhuma rota exercita a combinação.

**5. Fail-closed.** Papel ausente ou desconhecido num `UserContext` faz a operação recusar, nunca devolver tudo. Operação que exige `UserContext` e recebe `JobContext` **não compila** — o fail-closed dessa metade é do compilador, não de tempo de execução. É a mesma regra do catálogo de flags ([ADR-0004](./0004-fronteira-flag-configuracao-estado.md) regra 4), pelo mesmo motivo: o modo de falha barato é o que nega.

**6. Na Fase 4, as flags resolvidas entram no mesmo objeto.** Hoje nenhuma tem consumidor — a issue 16 constrói só o engate, desligado. O que se decide agora é que workspace e papel já viajam juntos, deixando o terceiro fato com lugar para nascer. Ler flag continua exigindo `workspace_id` explícito ([ADR-0004](./0004-fronteira-flag-configuracao-estado.md) regra 3); a diferença é que ele passa a chegar por um argumento que já é obrigatório.

## Por que não basta disciplina

O [ADR-0006](./0006-rls-duas-camadas-guc-worker.md) já respondeu isto num degrau abaixo: *"RLS-sozinha não elimina a disciplina, apenas muda o lugar onde ela falha"*. Um client cru na mão do chamador reintroduz a mesma disciplina uma camada acima — e desta vez sem rede, porque a RLS **não pega** escopo de papel: a leitura de um atendente vendo a carteira inteira é legítima dentro do tenant certo.

Este ADR não substitui camada nenhuma. A RLS continua sendo a rede; o leitor escopado é o "caminho normal" que aquele ADR nomeia — só que agora ele existe num lugar, em vez de em cada `where` que alguém escrever.

Vale também para o [ADR-0006 regra 11](./0006-rls-duas-camadas-guc-worker.md): com o contexto como argumento obrigatório de toda operação, não há como um valor em escopo de módulo servir de default silencioso. A regra vira tipo em vez de vigilância.

## Considered options (rejeitadas)

- **Manter o client cru e cobrir com lint e revisão de código.** É a disciplina que o ADR-0006 já declarou frágil, aplicada ao ponto onde não há segunda camada. Mantém a promessa do ADR-0015 como comentário.
- **Um repositório por model (`OpportunityRepository`, `PersonRepository`).** Módulo raso: a interface fica tão larga quanto o client, com o mesmo problema de escopo e uma indireção a mais. O que este ADR quer não é envolver o Prisma — é que a unidade exposta seja a **consulta que a tela precisa**, com o escopo já dentro.
- **Resolver por policy de RLS por papel, keiando num segundo GUC.** Duas fontes de verdade para escopo, e o ADR-0006 recusa isso pelo mesmo motivo que recusou policies em `auth.jwt()`. Além disso o escopo do `SUPERVISOR` depende de tags, que a Fase 2 ainda vai definir; migrar policy é caro, mudar uma função não.

## Consequences

Cada leitura nova exige uma função nova em `packages/db` — não dá para "só escrever um `findMany` na tela". É o pedágio que torna o escopo verificável, e nesta fatia a lista tem nove operações: seis leituras e três escritas.

Em troca, três coisas deixam de depender de alguém lembrar: o escopo do `ATTENDANT`, o cursor keyset e o índice parcial de cada contador. Quando o `SUPERVISOR` ganhar escopo real na Fase 2, ele entra numa função e vale em toda tela que já existe — que é a razão pela qual o ADR-0015 quis o lugar único antes da matriz.

O ADR-0013 é **emendado**: continua valendo que Server Component lê chamando `packages/db` direto, sem endpoint por tela; muda o que a chamada devolve.
