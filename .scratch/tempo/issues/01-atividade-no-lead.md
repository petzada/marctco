# 01 — Atividade no lead

**Status:** done

**Blocked by:** None — can start immediately.

**What to build:** o atendente passa a registrar o que faz. No card do lead ele cria uma atividade com tipo, data e hora de vencimento, responsável e descrição; vê a lista de tudo que já foi marcado e concluído naquele lead; conclui o que executou; reagenda o que o cliente pediu para adiar; e cancela o que não vai acontecer. Concluir e cancelar são resultados diferentes e o registro os distingue. A atividade vencida e não concluída fica em destaque, não some.

Toda atividade tem um Lead — não existe evento órfão. Quem pode marcar trabalho para quem é regra de perfil: Atendente só para si, Supervisor para o time, Gestão e Direção para qualquer membro ativo, e nunca para alguém que não alcança aquele lead.

Esta é a keystone da Fase 3: sem ela não há Agenda, não há relógio de primeiro contato e não há Dashboard. O ticket entrega o model, as operações nomeadas e a superfície no card — o resto da fase pendura nele.

**Antes da migration:** `Activity` já tem linha no mapeamento do [ADR-0005](https://github.com/petzada/marctco/blob/main/docs/adr/0005-idioma-codigo-en-ui-pt-br.md), mas `ActivityType` e `ActivityStatus` não. Acrescentar os dois lá, e o verbete de Atividade no [CONTEXT.md](https://github.com/petzada/marctco/blob/main/CONTEXT.md), antes de escrever SQL.

- [x] `Activity` existe com `opportunity_id` **obrigatório**, responsável, `type`, `title`, `notes` opcional, `due_at`, `status`, os campos de conclusão e de cancelamento, e o autor
- [x] `ActivityType` é `CALL | MESSAGE | MEETING | TASK` — nenhum valor amarrado a canal, porque `MESSAGE` precisa cobrir WhatsApp na Fase 4 sem migration de enum
- [x] `ActivityStatus` é `OPEN | DONE | CANCELED`
- [x] Operações nomeadas de `packages/db` recebendo `UserContext`: criar, reagendar, concluir, cancelar e listar as atividades de um lead — a tela não monta `where`
- [x] Criar recusa lead `WON`, `LOST` ou mesclado
- [x] Criar recusa responsável que não alcança aquele lead
- [x] Atendente cria só para si; Supervisor com tag para o time e não fora dele; Supervisor **sem** tag só para si; Gestão e Direção para qualquer membro `ACTIVE`
- [x] A combinatória de "quem pode marcar para quem" é função pura em `packages/domain`, no formato de `teamUserIds`
- [x] Concluir grava quem concluiu e quando; concluir de novo recusa; duas conclusões simultâneas produzem um ganhador e uma recusa limpa arbitrada pelo banco
- [x] Cancelar não é concluir e não conta como atendimento
- [x] Reagendar muda `due_at` sem tocar em conclusão
- [x] Leitura no escopo do perfil pela mesma regra que a Fase 2 já aplica às Oportunidades: o escopo da atividade é o escopo do lead a que ela pertence, e não uma segunda regra baseada no responsável
- [x] Supervisor sem tag recebe conjunto vazio, não recusa
- [x] O card do lead lista as atividades em ordem, com a vencida em destaque, seguindo o `DESIGN.md`
- [x] Índices: `(workspace_id, due_at, id)`, `(workspace_id, opportunity_id, due_at)` e o parcial de atividade em aberto por responsável
- [x] Seam 3 verde: `activities` com RLS habilitada e forçada, policy de isolamento, índice começando por `workspace_id`, leitura e escrita cross-workspace recusadas
- [x] Nenhum import do client cru do Prisma fora de `packages/db`

## Fora deste ticket

SLA/`first_contact_at`, Agenda, estagnação, Dashboard, notificações, linha do tempo. Emendas de ADR-0016/0019. Não toca `private.provision_workspace`.

## Implementation evidence

**17 de 17 critérios marcados** em 2026-08-17. Verificado por testes de domínio, de banco e de rota; Seam 3 inclui `activities`. **Nenhuma verificação em navegador:** destaque da vencida e formulário no card foram conferidos no código contra o `DESIGN.md`.

**Domínio:** `packages/domain/src/activity.ts` — `activityAssigneeUserIds`, `decideActivityCreate`, `decideActivityTransition`. **Operações:** `packages/db/src/activities.ts`. **Migration:** `packages/db/prisma/migrations/20260817010100_activity/`. **Card:** `apps/web/components/leads/lead-card-activities.tsx`; escrita em route handlers sob `/workspace/:slug/leads/:opportunityId/activities`.

**Testes:** `packages/domain/src/activity.test.ts`, `packages/db/tests/activities.test.ts` (concorrência na conclusão, WON/LOST/mesclado, escopo, cancelamento distinto, reagendamento), varredura RLS de `activities`.
