# Contexto de acesso e leitor escopado

`packages/db` **não devolve o client do Prisma**. Ele expõe leituras e escritas **nomeadas**, cada uma recebendo um `AccessContext` — união de `UserContext` (workspace, usuário, papel) e `JobContext` (workspace e origem do trabalho), construída num ponto só por requisição ou por job. O `SET LOCAL`, o escopo do perfil de acesso, a paginação keyset e o índice de cada consulta ficam do lado de dentro.

**Status:** accepted · 2026-08-05

> **Emendado pelo [ADR-0019](./0019-resolucao-pre-contexto-e-executor-privado.md):** a exceção pré-contexto inclui a quarta função `resolve_user_workspaces`, e `UserContext` é construído somente pelo resolvedor que usa seu resultado. As operações com `AccessContext` e suas garantias permanecem inalteradas.

> **Emendado em 2026-08-11 pelo [ADR-0017](./0017-ingestao-como-decisao-e-plano.md):**
> `decideAndApplyIntake(ctx, input)` é a operação nomeada que mantém lookup,
> decisão pura e aplicação no mesmo snapshot transacional. Aceita ambas as
> variantes de contexto pelos mesmos dois chamadores da ingestão e não devolve
> o client transacional.

> **Emendado em 2026-08-19.** A origem do `JobContext` deixa de ser sempre um `integration_event_id` e vira união discriminada: evento de integração **real** ou passada agendada **nomeada**. Continua havendo só duas variantes de `AccessContext`. A varredura de payload do ticket 15 usou um evento âncora para caber na forma antiga; a varredura de SLA da Fase 3 não tem âncora possível e não fabrica uma. Isolamento por workspace e `SET LOCAL` não mudam.

## O problema

O [ADR-0015](./0015-perfis-de-acesso-e-escopo.md) promete que *"nenhuma consulta consegue ser escrita sem que o autor decida, ali, o que aquele papel enxerga"*, e a issue 03 repete a promessa como critério de aceite. Um helper com a forma `withWorkspace(workspaceId, role, tx => …)` **não consegue cumpri-la**.

Ele garante o `SET LOCAL` e nada mais. Entregue o client transacional ao chamador e o `role` vira parâmetro inerte: nenhum tipo, nenhum lint e nenhum teste obriga o `tx.opportunity.findMany` da tela a filtrar por `assigned_user_id`. A frase do ADR-0015 passa a descrever uma intenção, não uma interface — e intenção não reprova build.

O mesmo buraco engole tudo que o [ADR-0013](./0013-fluxo-de-dados-no-app.md) decidiu e deixou como convenção. Uma tela que escrever `skip:` em vez de cursor passa no CI inteiro, e o defeito não é lentidão: é lead deslocando entre uma página e outra e sumindo da triagem em silêncio, que aquele ADR chama de *"o mesmo pecado do ADR-0007 reaparecendo pela camada de apresentação"*.

## A decisão

**1. `AccessContext` é união discriminada, com dois construtores e nenhum literal.**

| Variante | Construída em | Carrega | Quem a produz |
|---|---|---|---|
| `UserContext` | `apps/web` | `workspace_id`, `user_id`, `role` | `resolveWorkspaceAccess` chama `resolveUserContextForSlug`: sessão Supabase + validação do `slug` contra `WorkspaceMember` ([ADR-0012](./0012-contexto-de-tenant-na-url.md), [ADR-0019](./0019-resolucao-pre-contexto-e-executor-privado.md)) |
| `JobContext` | `apps/worker` (ingestão) e `apps/web` (passada agendada) | `workspace_id` e `origin: JobOrigin` | ingestão: o `workspace_id` que o handler autenticado escreveu no job, com origem `integration_event` e o `integration_event_id` real ([ADR-0007](./0007-ingestao-idempotencia.md)); manutenção: o `workspace_id` que a função privada de descoberta devolveu, com origem `scheduled_sweep` e o nome da passada |

**A origem do `JobContext` é união discriminada, não um campo opcional.**

```
JobOrigin =
  | { type: "integration_event"; integration_event_id }
  | { type: "scheduled_sweep"; sweep: ScheduledSweepName }

ScheduledSweepName = PAYLOAD_EXPIRY | OPPORTUNITY_CLOCK
```

`PAYLOAD_EXPIRY` é a retenção de 90 dias ([ADR-0014](./0014-copia-unica-e-retencao-do-payload.md)). `OPPORTUNITY_CLOCK` é a varredura dos relógios de SLA e estagnação (Fase 3). A lista de nomes é fechada: passada nova entra aqui antes de nascer no código.

O ticket 09 da Fase 3 materializa o tipo `JobOrigin` e a varredura `OPPORTUNITY_CLOCK` com origem `scheduled_sweep`. A varredura de payload já implementada pode continuar abrindo transação com evento âncora até migrar para `PAYLOAD_EXPIRY` — fora do escopo do ticket 09; os dois mecanismos coexistem enquanto o código da retenção não acompanha o tipo ([ADR-0014](./0014-copia-unica-e-retencao-do-payload.md)).

A forma original desta tabela carregava `workspace_id` + `integration_event_id` e dizia que o contexto nascia só em `apps/worker`. Isso era verdade para a ingestão e ficou incompleto quando o ticket 15 colocou a varredura de payload no processo web, preenchendo o campo com um evento âncora. A âncora era um contorno para não criar um terceiro tipo de `AccessContext`. **Esse contorno não se estende:** um lead liberado da quarentena, e amanhã um lead criado à mão, não têm evento de integração para apontar. Fabricar um grava no banco uma causalidade que não existe.

O `kind` do `AccessContext` continua sendo `"user" | "job"`. `type` na origem evita colidir com esse discriminante. Não nasce `MaintenanceContext`, `SweepContext` nem `role` opcional no job.

**Duas variantes e não uma, porque o worker não tem usuário nem papel.** Um contexto único obrigaria o job a inventar um papel para preencher o campo — e papel sem escopo declarado é exatamente o que o [ADR-0015](./0015-perfis-de-acesso-e-escopo.md) proíbe ao fechar o enum em quatro. A alternativa, deixar `role` opcional, quebraria o fail-closed da regra 4 no único processo que toca todos os tenants.

O que as duas têm em comum é o `workspace_id`, que é o que alimenta o `SET LOCAL` — o isolamento do [ADR-0006](./0006-rls-duas-camadas-guc-worker.md) vale igual para as duas, **por um workspace de cada vez**. Uma passada que cobre vários tenants abre um `JobContext` por workspace; não atravessa a fronteira numa transação só. O que **não** têm em comum é o escopo de papel, e por isso `listLeads(jobCtx)` não compila: um job nunca lê a tela de leads por acidente.

**2. `packages/db` expõe operações nomeadas, não um client.** Nesta fatia:

| Leitura | Aceita | Escrita | Aceita |
|---|---|---|---|
| `listLeads(ctx, cursor, filters)` | `UserContext` | `assignLead(ctx, id)` | `UserContext` |
| `countLeadsByMarker(ctx)` | `UserContext` | `resolveIntakeReview(ctx, id, resolution)` | `UserContext` |
| `getLead(ctx, id)` | `UserContext` | `applyIntakePlan(ctx, plan)` | ambos |
| `listIntegrationEvents(ctx, cursor)` | `UserContext` | `recordLeadSubmission(ctx, input)` | ambos |
| `findPersonCandidates(ctx, plan)` | ambos | | |
| `resolveIntakeDestination(ctx, target)` | ambos | | |
| `findOpenOpportunitiesOfPerson(ctx, id)` | ambos | | |
| | | `decideAndApplyIntake(ctx, input)` | ambos |
| `getQuarantinedEvent(ctx, id)` | `UserContext` | | |

Cada uma abre a transação, faz o `SET LOCAL`, aplica o escopo do papel quando ele existe, e usa o cursor keyset e o índice parcial que lhe corresponde.

**Seis aceitam as duas variantes, e as seis são do caminho de ingestão** ([ADR-0017](./0017-ingestao-como-decisao-e-plano.md)): `findPersonCandidates`, `recordLeadSubmission`, `resolveIntakeDestination`, `findOpenOpportunitiesOfPerson`, `applyIntakePlan` e `decideAndApplyIntake`. As duas primeiras leituras e o executor permanecem seams nomeados, mas o caminho público usa o coordenador para que decisão e escrita compartilhem o snapshot. É a consequência direta de a ingestão ter dois chamadores — o job e o "completar e liberar" do gestor.

> **Emendado pelo ticket 09.** Esta tabela dizia **duas**, escrita antes de o ADR-0017 quebrar a ingestão em três fases puras. Cada fase precisa de uma leitura executada sob o tenant, e o caminho compartilhado é literalmente o mesmo para os dois chamadores — então toda operação dele aceita as duas variantes, ou o "mesmo caminho" que a issue 14 exige não existe. O número não é o que a regra protege: o que ela protege é **por que** uma operação aceita `JobContext`, e a resposta continua sendo uma só. Nada fora do caminho de ingestão ganhou a segunda variante, e `listLeads(jobCtx)` continua não compilando.

**3. As consultas sem tenant são a exceção, e ela já é fechada.** `resolve_workspace_by_token_hash`, `claim_pending_events`, `provision_workspace` e `resolve_user_workspaces` acontecem **antes** de existir workspace para pôr num contexto — são justamente as que produzem ou validam o `workspace_id` com que o contexto é construído ([ADR-0006](./0006-rls-duas-camadas-guc-worker.md) regra 9). Elas não recebem `AccessContext` e não podem receber. A lista é fechada, o Seam 3 reprova qualquer `SECURITY DEFINER` fora dela, e nenhuma devolve payload. Sem esta cláusula escrita, a regra 2 pareceria ter um furo.

> **Emenda de 2026-08-19.** A redação original fechava em **quatro**; o [ADR-0019](./0019-resolucao-pre-contexto-e-executor-privado.md) passou a cinco no ticket 15 (`claim_expired_payload_workspaces`) e a seis na Fase 3 (`claim_overdue_opportunity_workspaces`). O owner técnico e os retornos mínimos continuam naquele ADR. Esta regra não enumerava a lista para congelá-la aqui — enumerava para impedir que uma função extra entrasse pelo furo. O número vive no ADR-0019.

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
- **Resolver por policy de RLS por papel, keiando num segundo GUC.** Duas fontes de verdade para escopo, e o ADR-0006 recusa isso pelo mesmo motivo que recusou policies em `auth.jwt()`. Além disso o escopo do `SUPERVISOR` depende de tags — à época a Fase 2 ainda ia definir tags; hoje o escopo vive na operação nomeada, não em policy. Migrar policy é caro, mudar uma função não.
- **Terceiro tipo de `AccessContext` para manutenção (2026-08-19).** `SweepContext` ou `MaintenanceContext` espalharia a união que toda operação nomeada já discrimina, e o job de manutenção isolaria por outro caminho que o Seam 3 não prova. O trabalho agendado é `JobContext`; o que muda é a origem, não a variante.
- **Evento âncora fabricado para a varredura de SLA (2026-08-19).** Apontar para um `IntegrationEvent` qualquer do workspace grava causalidade que não existe e envenena auditoria. A varredura de payload pôde apontar para um evento real da retenção; a de SLA, não. A origem nomeada é o que torna o âncora desnecessário sem abrir um terceiro tipo.

## Consequences

Cada leitura nova exige uma função nova em `packages/db` — não dá para "só escrever um `findMany` na tela". É o pedágio que torna o escopo verificável, e nesta fatia a lista tem treze operações: oito leituras e cinco escritas.

Em troca, três coisas deixam de depender de alguém lembrar: o escopo do `ATTENDANT`, o cursor keyset e o índice parcial de cada contador. O escopo do `SUPERVISOR` entrou nas operações nomeadas na Fase 2 e vale em toda tela que já existe — que é a razão pela qual o ADR-0015 quis o lugar único antes da matriz.

O ADR-0013 é **emendado**: continua valendo que Server Component lê chamando `packages/db` direto, sem endpoint por tela; muda o que a chamada devolve.
