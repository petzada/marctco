# 15 — Recuperação da outbox e reprocessamento

**Blocked by:** 07, 14

**Status:** done

## What to build

Postgres e Redis não commitam juntos. O endpoint resolve isso com outbox: aceita o lead no PostgreSQL e o dispatcher continua tentando publicar. Este ticket endurece recuperação, backoff, observabilidade e reprocessamento manual.

A durabilidade não depende da Pluga nem da LP retentarem. O dispatcher lê pendências do PostgreSQL quando o Redis volta; LP é sempre servidor-servidor.

O varredor **não é peça nova**: é o mesmo mecanismo do botão "reprocessar" que a tela de Integrações já precisa ter.

## Acceptance criteria

- [x] Dispatcher busca eventos com despacho pendente por `private.claim_pending_events`, em lotes, aplica backoff e recupera após reinício
- [x] O botão "reprocessar" da tela de Integrações usa **o mesmo** mecanismo, não um caminho paralelo
- [x] Evento reprocessado **não** gera Pessoa nem Oportunidade duplicada — a deduplicação do ticket 09 cobre
- [x] Fila morta visível na tela de Integrações
- [x] Lead Pluga ou LP recebido com o Redis fora é processado assim que o Redis volta
- [x] **A descoberta é a única parte sem tenant, e é a função que a resolve.** "Claim por evento" é circular: para setar o claim o varredor precisaria do `workspace_id` do evento, e para ler o `workspace_id` precisaria do claim — sem GUC, a policy devolve zero linhas e o varredor nunca acha nada. `private.claim_pending_events` existe para quebrar esse ciclo, e devolve **só `(id, workspace_id)`**; o `raw`, que carrega CPF e telefone, nunca sai sem tenant ([ADR-0006](../../../docs/adr/0006-rls-duas-camadas-guc-worker.md) regra 9)
- [x] **Todo o resto roda sob RLS**, com `SET LOCAL` a partir do `workspace_id` que a função devolveu — não com bypass
- [x] O varredor não reprocessa evento já processado
- [x] Evento reprocessado depois de o Redis voltar **não** cria segunda Oportunidade — o `external_lead_id` derivado do `IntegrationEvent.id` é estável sob qualquer reprocessamento (ticket 13)
- [x] A descoberta de pendências não depende de um repeatable job armazenado no próprio Redis

**Expiração do payload**

- [x] Rotina periódica no **worker** (não `pg_cron`, que o plano do Supabase não tem) apaga o conteúdo de `IntegrationEvent.raw` com mais de **90 dias** — *entregue no processo `web`, não no worker; ver o Comment abaixo e a emenda do [ADR-0014](../../../docs/adr/0014-copia-unica-e-retencao-do-payload.md)*
- [x] A **linha permanece**: origem, instante, estado de despacho e de processamento continuam respondendo "quantos leads entraram, de onde, quantos falharam"
- [x] **Evento em quarentena não expira** enquanto estiver em quarentena — é o payload que o gestor precisa ler para completar e liberar
- [x] A rotina roda **sob RLS**, em lotes, sem prender transação longa
- [x] Sem esta rotina, um cliente de 1.000 leads/dia acumula ~1 GB/ano de JSON sem consumidor ([ADR-0014](../../../docs/adr/0014-copia-unica-e-retencao-do-payload.md))

## Comments

**2026-08-11 — implementado.** Migration `20260811001500_dead_letter_and_payload_expiry`; `markIntegrationEventFailed`, `listDeadLetterEvents` e a expiração em `packages/db`; backoff e varredura de retenção em `apps/web`; fila morta escrita pelo worker; seção "Fila morta" e coluna "Erro" na tela de Integrações.

**A rotina de expiração roda no processo `web`, não no worker.** A descoberta de trabalho sem tenant passa pelo schema `private`, e `marctco_worker` não tem `USAGE` nele — regra explícita do [ADR-0019](../../../docs/adr/0019-resolucao-pre-contexto-e-executor-privado.md), que vence este critério por precedência (ADR sobre issue). É o mesmo desvio, pelo mesmo motivo, que o ticket 07 registrou ao deixar o dispatcher no `web`. As alternativas eram conceder ao worker o acesso privado que o Seam 3 prova que ele não tem, ou rotear manutenção por Redis e fazer a retenção depender da fila. O ADR-0014 recebeu nota de supersessão apontando para cá.

**A lista fechada de funções privadas passou de quatro para cinco.** `private.claim_expired_payload_workspaces(cutoff)` devolve `(workspace_id, anchor_integration_event_id)` — menos do que a `claim_pending_events` — e não recebeu privilégio novo: cabe dentro das colunas que `marctco_private_definer` já lia. O Seam 3 passou a cobrar o contrato por varredura de **toda** função `SECURITY DEFINER` do schema, o que fecha a pendência carregada do ticket 03.

**"Reprocessar" precisou de mais do que virar a coluna.** O BullMQ recusa adicionar um job cujo id já existe, e o id é derivado do evento: um job terminado — completo por 24h, falho para sempre — bloqueava a republicação. O evento voltava a `PENDING`, o dispatcher "publicava", marcava `DISPATCHED` e nada acontecia. O publicador passou a remover antes de adicionar; a nota está no [ADR-0007](../../../docs/adr/0007-ingestao-idempotencia.md).

**A fila morta só é escrita quando o BullMQ esgota as tentativas**, e nunca por cima de evento `PROCESSED` (o lead já está no funil) ou `QUARANTINED` (é ação humana pendente, e rotulá-la de falha a tiraria da fila de quarentena *e* da exceção de expiração). Falha de publicação nunca vira fila morta — Redis fora é motivo de backoff, não de desistir do lead.
