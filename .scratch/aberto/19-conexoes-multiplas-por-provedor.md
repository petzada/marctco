# 19 — N conexões por provedor e a conexão na chave idempotente

**What to build:** A chave idempotente do envio passa a incluir a conexão, e o `UNIQUE(workspace_id, provider)` da `IntegrationConnection` cai. Um workspace passa a ter quantas conexões precisar de cada provedor — cada landing page e cada conta de anúncio com nome, segredo e destino de funil próprios ([ADR-0031](../../docs/adr/0031-conexao-na-chave-idempotente.md)).

**Blocked by:** nada. **Não** faz parte da Fase 2.

**Status:** done

## O defeito que ele fecha: lead engolido em silêncio

Toda landing page tem `source = LANDING_PAGE`, e a LP pode declarar o próprio `external_lead_id` (`packages/domain/src/intake/inbound-lead.ts`). A chave de hoje é `source` + `external_lead_id`.

Duas LPs com numeração própria colidem: a da ACR manda o lead `1`, a da REAL manda o lead `1`, e a segunda vira **retransmissão inerte** — sem card, sem erro, sem quarentena, sem linha na fila. Ninguém percebe até alguém reclamar que um anúncio "não traz lead".

Hoje o sistema só está seguro por acidente: nenhuma LP do piloto numera, então cada envio cai no `IntegrationEvent.id`, que é único. **Nada avisa quando esse acidente termina.**

## Por que a urgência é antes da segunda LP, não antes da Fase 2

A colisão é da **chave**, não da quantidade de conexões: duas LPs que compartilham o mesmo token e numeram o próprio `1` já se engolem hoje ([ADR-0031](../../docs/adr/0031-conexao-na-chave-idempotente.md)). Separar conexões sem corrigir a chave não fecha o furo. O gatilho operacional continua sendo a segunda landing page — é quando a numeração independente deixa de ser teórica. Fazer antes disso é barato; depois, é reconciliar envio de produção à mão, que é exatamente o que o [ADR-0007](../../docs/adr/0007-ingestao-idempotencia.md) chama de ponto mais irreversível do sistema.

## Acceptance criteria

- [x] `LeadSubmission.integration_connection_id` nasce **anulável**, é preenchida por backfill e só então entra na constraint — expand/contract ([ADR-0010](../../docs/adr/0010-migrations-e-ci-cd.md))
- [x] Backfill derivado do dado existente: `LeadSubmission.last_integration_event_id` → `IntegrationEvent.integration_connection_id`. Não há envio órfão; a migration prova isso antes de tornar a coluna obrigatória
- [x] `UNIQUE(workspace_id, integration_connection_id, source, external_lead_id)` substitui `UNIQUE(workspace_id, source, external_lead_id)`
- [x] `SubmissionKey` em `packages/domain` ganha a conexão. É valor puro; quem a fornece é quem já resolveu o token
- [x] `UNIQUE(workspace_id, provider)` da `IntegrationConnection` **cai**
- [x] `IntegrationConnection.name`: texto obrigatório, dado pelo cliente ("LP institucional", "Pluga ACR"). Unicidade por `(workspace_id, lower(name))`
- [x] As três operações que hoje resolvem por `provider` — resumo, rotação de segredo, ativar/desativar (`packages/db/src/integration-connection-operations.ts`) — passam a resolver por `connection_id`, validado contra o workspace do `UserContext`
- [x] A tela de Integrações lista conexões do provedor em vez de assumir uma. Criar conexão nova é da **Direção**, como o segredo já é ([ADR-0015](../../docs/adr/0015-perfis-de-acesso-e-escopo.md))
- [x] A ingestão **não muda**: `apps/web/lib/integration-lead-endpoint.ts` já resolve pelo token e não conhece provedor nem origem. Se este ticket precisar tocar o endpoint, algo saiu do lugar
- [x] `resolve_workspace_by_token_hash` continua na lista fechada de funções `SECURITY DEFINER` e continua devolvendo o mínimo — nenhuma sexta função nasce ([ADR-0006](../../docs/adr/0006-rls-duas-camadas-guc-worker.md) regra 9)
- [x] Seam 2: duas conexões do mesmo provedor, mesmo `external_lead_id`, produzem **dois** cards; o reenvio na mesma conexão continua retransmissão inerte
- [x] Seam 3: a coluna nova sob as varreduras de sempre; nenhum `SECURITY DEFINER` fora da lista

## Fora deste ticket

Conector nativo Meta/Google. Roteamento de lead por conexão — o `target_pipeline_id` já existe e continua sendo a única sobrescrita ([ADR-0022](../../docs/adr/0022-workspace-e-fronteira-de-captacao.md): a campanha não roteia). Empresa na conexão — a empresa agrupa equipes, não campanhas ([ADR-0029](../../docs/adr/0029-empresa-e-agrupamento-de-equipe.md)).

## Implementation evidence

**12 de 12 critérios marcados** em 2026-08-24. As duas metades do ticket foram
entregues juntas porque não se separam: com `UNIQUE(workspace_id, provider)` de
pé um workspace tem no máximo uma landing page, então duas LPs necessariamente
compartilham um token — e uma chave que inclui a conexão continuaria lendo as
duas como a mesma origem. O critério do Seam 2 é inatingível sem o outro.

**Migration:** `20260824010100_connection_in_key_and_n_per_provider`.
Expand/contract: `lead_submissions.integration_connection_id` nasce anulável, é
preenchida a partir de `last_integration_event_id →
integration_events.integration_connection_id`, e um bloco `DO` **aborta o
release** se sobrar alguma linha sem conexão em vez de deixá-la cair fora da
chave. Só então a coluna vira `NOT NULL` e entra em
`UNIQUE(workspace_id, integration_connection_id, source, external_lead_id)`,
que substitui a chave antiga. `UNIQUE(workspace_id, provider)` cai; a regra de
uma única conexão WhatsMiau viva sobrevive no índice parcial que a
`20260819010300` já tinha criado prevendo esta queda (ADR-0003 × ADR-0031).
`integration_connections.name` nasce anulável, é preenchida a partir do
provedor e vira obrigatória, com unicidade por `(workspace_id, lower(name))`.

**Domínio:** `packages/domain/src/intake/intake-plan.ts` — `SubmissionKey` ganha
`integration_connection_id` e `planSubmission` passa a recebê-la. Continua valor
puro: quem fornece a conexão é quem já resolveu o token.

**Persistência:** `packages/db/src/intake.ts` (insert e leitura do duplicado),
`quarantine.ts` (`getQuarantinedEvent` devolve a conexão, para a liberação
reusar a chave em vez de recalculá-la) e
`integration-connection-operations.ts`, reescrita: `listIntegrationConnections`
substitui o resumo singular, e resumo, rotação e ativar/desativar resolvem por
`connection_id` sob RLS. Resolver por `provider` só era correto enquanto o
provedor identificava uma linha; depois da queda teria rotacionado uma
arbitrária.

**Web:** `integration-connection-routes.ts` — `generate` carrega o nome,
`rotate` e o formulário de status carregam a conexão; nome duplicado responde
409 e conexão invisível responde 404 sem confirmar que ela existe em outro
tenant. `integration-secret-panel.tsx` passou a listar conexões, cada uma com
nome, estado e as próprias ações, mais o formulário de nova conexão (Direção).

**A ingestão não mudou.** `apps/web/lib/integration-lead-endpoint.ts` e
`app/v1/` não têm uma linha alterada — `git diff` vazio nesses caminhos.
Nenhuma função `SECURITY DEFINER` nasce nesta migration.

**Testes:** `intake-plan.test.ts` (duas conexões não colapsam na mesma chave),
`integration-connection-operations.test.ts` (N por provedor, nome duplicado por
caixa, rotação e desativação que não atingem a irmã, id invisível recusado),
`integration-connection-routes.test.ts` (nome obrigatório, segunda conexão no
mesmo provedor, 409, 404, formulário sem conexão) e **Seam 2**: duas conexões
Pluga no mesmo workspace, ambas com `external_lead_id = "1"`, produzem dois
cards; o reenvio na mesma conexão continua retransmissão inerte.

Gates locais verdes: `typecheck`, `lint`, `test:unit` (698/698) e
`check:migrations`. Os projetos `db`, `seam2`, `seam4` e `a7` exigem Postgres e
Redis e foram provados pelo job **Database** do CI neste PR.
