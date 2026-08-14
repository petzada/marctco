# 19 — N conexões por provedor e a conexão na chave idempotente

**What to build:** A chave idempotente do envio passa a incluir a conexão, e o `UNIQUE(workspace_id, provider)` da `IntegrationConnection` cai. Um workspace passa a ter quantas conexões precisar de cada provedor — cada landing page e cada conta de anúncio com nome, segredo e destino de funil próprios ([ADR-0031](../../../docs/adr/0031-conexao-na-chave-idempotente.md)).

**Blocked by:** nada. **Não** faz parte da Fase 2.

**Status:** ready-for-agent

## O defeito que ele fecha: lead engolido em silêncio

Toda landing page tem `source = LANDING_PAGE`, e a LP pode declarar o próprio `external_lead_id` (`packages/domain/src/intake/inbound-lead.ts`). A chave de hoje é `source` + `external_lead_id`.

Duas LPs com numeração própria colidem: a da ACR manda o lead `1`, a da REAL manda o lead `1`, e a segunda vira **retransmissão inerte** — sem card, sem erro, sem quarentena, sem linha na fila. Ninguém percebe até alguém reclamar que um anúncio "não traz lead".

Hoje o sistema só está seguro por acidente: nenhuma LP do piloto numera, então cada envio cai no `IntegrationEvent.id`, que é único. **Nada avisa quando esse acidente termina.**

## Por que a urgência é antes da segunda LP, não antes da Fase 2

Enquanto houver uma conexão por provedor, a colisão não tem como acontecer. O risco nasce no minuto em que o cliente conecta a segunda landing page — e é esse o gatilho, não o calendário. Fazer antes disso é barato; depois, é reconciliar envio de produção à mão, que é exatamente o que o [ADR-0007](../../../docs/adr/0007-ingestao-idempotencia.md) chama de ponto mais irreversível do sistema.

## Acceptance criteria

- [ ] `LeadSubmission.integration_connection_id` nasce **anulável**, é preenchida por backfill e só então entra na constraint — expand/contract ([ADR-0010](../../../docs/adr/0010-migrations-e-ci-cd.md))
- [ ] Backfill derivado do dado existente: `LeadSubmission.last_integration_event_id` → `IntegrationEvent.integration_connection_id`. Não há envio órfão; a migration prova isso antes de tornar a coluna obrigatória
- [ ] `UNIQUE(workspace_id, integration_connection_id, source, external_lead_id)` substitui `UNIQUE(workspace_id, source, external_lead_id)`
- [ ] `SubmissionKey` em `packages/domain` ganha a conexão. É valor puro; quem a fornece é quem já resolveu o token
- [ ] `UNIQUE(workspace_id, provider)` da `IntegrationConnection` **cai**
- [ ] `IntegrationConnection.name`: texto obrigatório, dado pelo cliente ("LP institucional", "Pluga ACR"). Unicidade por `(workspace_id, lower(name))`
- [ ] As três operações que hoje resolvem por `provider` — resumo, rotação de segredo, ativar/desativar (`packages/db/src/integration-connection-operations.ts`) — passam a resolver por `connection_id`, validado contra o workspace do `UserContext`
- [ ] A tela de Integrações lista conexões do provedor em vez de assumir uma. Criar conexão nova é da **Direção**, como o segredo já é ([ADR-0015](../../../docs/adr/0015-perfis-de-acesso-e-escopo.md))
- [ ] A ingestão **não muda**: `apps/web/lib/integration-lead-endpoint.ts` já resolve pelo token e não conhece provedor nem origem. Se este ticket precisar tocar o endpoint, algo saiu do lugar
- [ ] `resolve_workspace_by_token_hash` continua na lista fechada de funções `SECURITY DEFINER` e continua devolvendo o mínimo — nenhuma sexta função nasce ([ADR-0006](../../../docs/adr/0006-rls-duas-camadas-guc-worker.md) regra 9)
- [ ] Seam 2: duas conexões do mesmo provedor, mesmo `external_lead_id`, produzem **dois** cards; o reenvio na mesma conexão continua retransmissão inerte
- [ ] Seam 3: a coluna nova sob as varreduras de sempre; nenhum `SECURITY DEFINER` fora da lista

## Fora deste ticket

Conector nativo Meta/Google. Roteamento de lead por conexão — o `target_pipeline_id` já existe e continua sendo a única sobrescrita ([ADR-0022](../../../docs/adr/0022-workspace-e-fronteira-de-captacao.md): a campanha não roteia). Empresa na conexão — a empresa agrupa equipes, não campanhas ([ADR-0029](../../../docs/adr/0029-empresa-e-agrupamento-de-equipe.md)).
