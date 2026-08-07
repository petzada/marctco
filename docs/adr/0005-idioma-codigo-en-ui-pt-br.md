# Código em inglês, UI e glossário em PT-BR

Todo identificador de código — models Prisma, colunas, tipos, funções, enums — é escrito em **inglês**. A UI é **PT-BR only** e `CONTEXT.md` continua sendo a linguagem ubíqua em PT-BR. A ponte entre os dois é a tabela de mapeamento abaixo, que é **canônica**: traduz-se consultando, nunca improvisando.

**Status:** accepted · 2026-08-04

**Considered options (rejeitada):** domínio em PT-BR no código (`Pessoa`, `Oportunidade`, `EnvioLead`) com EN só para encanamento — o que os docs de pesquisa já faziam organicamente em `sintese-final.md` §10. Rejeitada porque o ecossistema (Prisma, libs, mensagens de erro) fala EN, schemas de idioma misto são um cheiro conhecido, e agentes de código são mensuravelmente mais precisos sobre identificadores EN — e este projeto será majoritariamente escrito por agentes.

**Custo assumido:** existe agora uma tradução entre glossário e código. Tradução improvisada é como termos proibidos reaparecem — `CONTEXT.md` proíbe explicitamente `Deal` para Oportunidade, que é exatamente o que um dev ou agente de fala inglesa escreveria por reflexo. A tabela abaixo existe para eliminar a improvisação.

## Mapeamento canônico PT-BR → EN

| Glossário (`CONTEXT.md`) | Código | Nota |
|---|---|---|
| Workspace | `Workspace` | — |
| Associação ao workspace | `WorkspaceMember` | Onde vive o perfil de acesso. **Nunca** `Membership` solto nem `User` do workspace |
| Perfil de acesso | `WorkspaceMember.role` | `ATTENDANT \| SUPERVISOR \| MANAGER \| OWNER` — quatro, e nenhum a mais ([ADR-0015](./0015-perfis-de-acesso-e-escopo.md)) |
| Contexto de acesso | `AccessContext` = `UserContext \| JobContext` | `UserContext`: `workspace_id` + `user_id` + `role`, construído somente por `resolveUserContextForSlug` após validar a associação. `JobContext`: `workspace_id` + `integration_event_id` — o worker não tem usuário nem papel ([ADR-0016](./0016-contexto-de-acesso-e-leitor-escopado.md), [ADR-0019](./0019-resolucao-pre-contexto-e-executor-privado.md)). **Nunca** `Session` nem `RequestContext` |
| Provisionamento | `private.provision_workspace` | Workspace + vínculo do dono + funil padrão, num commit ([ADR-0006](./0006-rls-duas-camadas-guc-worker.md) regra 9) |
| Tag | `Tag` | Define o time de um `SUPERVISOR` |
| Tipo de financiamento | `FinancingType` | `VEHICLE \| REAL_ESTATE \| PERSONAL_LOAN \| OTHER`; opcional na Oportunidade |
| Funil | `Pipeline` | Sempre tipado: `type: COMMERCIAL \| LEGAL` |
| Funil padrão do workspace | `Pipeline.is_default` | Exatamente um comercial por workspace; destino da ingestão ([ADR-0009](./0009-etapas-editaveis-papeis-e-status.md)) |
| Destino da conexão | `IntegrationConnection.target_pipeline_id` | Sobrescreve o funil padrão; nulo significa usar o padrão |
| Etapa (do funil) | `Stage` | FK `stage_id`. **Nunca** `pipeline_stage_id` — a etapa tem um nome só |
| Papel da etapa | `Stage.role: ENTRY \| CLOSING \| LEGAL_HANDOFF \| NORMAL` | Papel é do sistema; rótulo e ordem são do cliente ([ADR-0009](./0009-etapas-editaveis-papeis-e-status.md)) |
| Ordem da etapa | `Stage.position` | Coluna própria e mutável |
| Situação da oportunidade | `Opportunity.status: OPEN \| WON \| LOST` | Ortogonal à etapa; ganho/perdido não são colunas do Kanban |
| Pessoa | `Person` | Cobre física e jurídica. **Nunca** `Contact` |
| Telefone da Pessoa | `PersonPhone` | Múltiplos por Pessoa; valor normalizado em `phone_e164` |
| E-mail da Pessoa | `PersonEmail` | Múltiplos por Pessoa; valor normalizado em `email` |
| Oportunidade | `Opportunity` | **Nunca** `Deal` (proibido no glossário), **nunca** `Lead` |
| **Lead** (rótulo de UI) | — | Não tem model. É `Opportunity` com `area = COMMERCIAL` |
| EnvioLead | `LeadSubmission` | A submissão de formulário, não a oportunidade |
| Transmissão mais recente do envio | `LeadSubmission.last_integration_event_id` | Substitui `LeadSubmission.raw`: o payload é guardado **uma vez**, no evento ([ADR-0014](./0014-copia-unica-e-retencao-do-payload.md)) |
| Payload bruto recebido | `IntegrationEvent.raw` | Cópia única. Anulável, e **nulo só pode significar expirado**: o payload é gravado no recebimento, antes do 200 ([ADR-0014](./0014-copia-unica-e-retencao-do-payload.md)) |
| Atendente | `WorkspaceMember.role = ATTENDANT` | Enxerga apenas oportunidade atribuída a si ([ADR-0015](./0015-perfis-de-acesso-e-escopo.md)) |
| Supervisor | `WorkspaceMember.role = SUPERVISOR` | Escopo do time/filial, computado por tag. Até a Fase 2, escopo efetivo de `MANAGER` |
| Gestão | `WorkspaceMember.role = MANAGER` | Operação inteira do workspace |
| Direção | `WorkspaceMember.role = OWNER` | Operação **e** conta: membros, papéis, segredo de integração. É o papel criado no provisionamento |
| Plano de ingestão | `IntakePlan` | União discriminada `Quarantine \| Retransmission \| NewOpportunity`; decidido puro, aplicado por `applyIntakePlan` ([ADR-0017](./0017-ingestao-como-decisao-e-plano.md)) |
| Contrato canônico de entrada | `InboundLead` | O contrato `v1` já interpretado, com `source` e `external_lead_id` resolvidos. Zod é a fonte única e o tipo é inferido ([ADR-0008](./0008-fronteira-conector-dominio.md)). **Nunca** `LeadPayload` como tipo de domínio |
| Lead normalizado | `NormalizedLead` | Saída de `normalize()`. Value object, não entidade. Telefone em `phones[]` E.164, e-mail em `emails[]` minúsculo, `cpf` só dígitos, `installment_amount` decimal com `installment_amount_raw` ao lado |
| Origem do lead | `LeadSource` | `META_LEAD_ADS \| GOOGLE_LEAD_FORM \| LANDING_PAGE`. Metade da `SubmissionKey`. **Nunca** confundir com `IntegrationProvider` (por qual conexão entrou) nem com `platform` (`fb`/`ig`) |
| Diagnóstico de normalização | `NormalizationDiagnostic` | `{ field, reason }` e **nenhum valor**: é a única parte do envio que sai do tenant ([ADR-0006](./0006-rls-duas-camadas-guc-worker.md) regra 12) |
| Plano de busca de Pessoa | `PersonLookupPlan` | Quais chaves buscar e com que força; dado inerte — o domínio descreve a busca, `findPersonCandidates` a executa |
| Força da chave de busca | `PersonLookupStrength` | `STRONG \| MODERATE \| WEAK` — CPF válido, telefone, e-mail isolado, nessa ordem ([ADR-0007](./0007-ingestao-idempotencia.md) §Identidade) |
| Decisão de Pessoa | `PersonDecision` | União discriminada `NO_CONTACT \| REUSE_PERSON \| NEW_PERSON \| NEW_PERSON_WITH_IDENTITY_CONFLICT`; entra em `decideIntake` como a metade "quem é" do `IntakePlan`. **Nunca** `decideReuseOfPerson` devolvendo um id anulável — a variante do conflito precisa carregar as candidatas |
| Candidata a Pessoa | `PersonCandidate` | O que `findPersonCandidates` devolve: `person_id`, o `cpf` já gravado e quais tipos de chave casaram |
| Chave idempotente do envio | `SubmissionKey` | `source` + `external_lead_id`; o que a constraint `UNIQUE(workspace_id, source, external_lead_id)` arbitra ([ADR-0007](./0007-ingestao-idempotencia.md)) |
| Revisão de ingestão | `IntakeReview` | Pendência **marcada na Oportunidade já criada**, nunca bloqueio; `type: IDENTITY_CONFLICT \| POSSIBLE_DUPLICATE` |
| Marcador | `IntakeReview` + `Opportunity.missing_phone` | Não é um model: é o conjunto de pendências de um lead. Na UI, **um ícone só** os reúne ([ADR-0007](./0007-ingestao-idempotencia.md)) |
| Marcadores de um lead | `markersFor(opportunity, reviews)` | Função pura de `packages/domain`; quem responde "o que este lead tem". Os contadores por tipo **não** passam por ela ([ADR-0018](./0018-marcador-como-modulo.md)) |
| Possível duplicado | `IntakeReview.type = POSSIBLE_DUPLICATE` | Gatilho: mesma Pessoa + Oportunidade **em aberto** não mesclada. Financiamento é discriminador na tela, nunca gatilho |
| Mesclagem | — | Não tem model. É a operação que **reaponta** as FKs para a canônica e deixa a lápide na absorvida; o ponteiro nunca redireciona leitura |
| Resolução da revisão | `IntakeReview.resolution` | Tipada pelo `type`; para `POSSIBLE_DUPLICATE`: `NEW_FINANCING \| SAME_FINANCING \| INVALID_OR_SPAM`; nulo enquanto pendente |
| Oportunidade mesclada | `Opportunity.merged_into_opportunity_id` | Resultado de `SAME_FINANCING`; sai das vistas ativas sem exclusão física |
| Pessoa mesclada | `Person.merged_into_person_id` | Resultado da resolução de `IDENTITY_CONFLICT`; preserva histórico e identificadores |
| Handoff | `Handoff` | — |
| Score de cabimento | `EligibilityScore` | "Cabimento" = admissibilidade da revisional |
| Feature flag | `FeatureFlag` / `WorkspaceFlag` | Tabela `workspace_flags` |
| Configuração de workspace | `WorkspaceSettings` | — |
| Área (comercial/jurídica) | `area: COMMERCIAL \| LEGAL` | **Nunca** `department` (ADR-0002 evita "departamento") |
| Atividade | `Activity` | Campo `due_at` |
| Etapa de entrada | `Stage.role = ENTRY` | Onde o lead ingerido nasce |
| Etapa de conclusão | `Stage.role = CLOSING` | Fim do fluxo em aberto; não é ganho nem perdido |
| Conector de origem | `LeadSourceConnector` | — |
| Conexão de integração | `IntegrationConnection` | — |
| Evento de integração | `IntegrationEvent` | — |
| Estado de despacho do evento | `IntegrationEvent.dispatch_status` | `PENDING \| DISPATCHED`; outbox PostgreSQL → BullMQ |
| Estado do evento | `IntegrationEvent.status` | `RECEIVED \| PROCESSED \| QUARANTINED \| FAILED`. Fonte única da tela de Integrações: `RECEIVED` no commit que aceita o lead, `PROCESSED` quando o worker conclui, `QUARANTINED` sem contato, `FAILED` quando o processamento esgota as tentativas |
| Instante do recebimento | `IntegrationEvent.received_at` | Verdade sobre a origem; não é o `arrived_at` da Oportunidade |
| Instante do despacho | `IntegrationEvent.dispatched_at` | Gravado **depois** da confirmação do BullMQ; nulo enquanto `PENDING` |
| Instante do processamento | `IntegrationEvent.processed_at` | Nulo até o worker concluir |
| Conexão do evento | `IntegrationEvent.integration_connection_id` | Por qual conexão o lead entrou; FK composta com `workspace_id` |
| Envelope de assinatura | `Envelope` | — |
| Quarentena | `IntegrationEvent.status = QUARANTINED` | Estado do evento, não da oportunidade |
| Marcador "sem telefone" | `Opportunity.missing_phone` | Significa uma coisa só: não dá WhatsApp nem ligação |
| Gatilho do 1º contato | `WorkspaceSettings.first_contact_trigger: ON_ASSIGNMENT \| ON_ARRIVAL \| DISABLED` | Configuração do gestor ([ADR-0003](./0003-whatsapp-instancia-unica-gatilho-atribuicao.md)) |
| Valor (da oportunidade) | `amount` | `value` é genérico demais para coluna monetária |
| Instituição financeira | `financial_institution` | Dado opcional do financiamento; não identifica Pessoa |
| Valor da parcela | `installment_amount` | Decimal monetário normalizado; entrada preserva também o valor bruto |
| Chegada | `arrived_at` | Início do relógio de SLA. Instante em que a Oportunidade passa a existir — igual ao recebimento no caminho direto, igual à liberação para lead ex-quarentena ([ADR-0007](./0007-ingestao-idempotencia.md)) |
| Recebido em | `received_at` | Verdade sobre a origem; permanece no `LeadSubmission` mesmo quando difere de `arrived_at` |
| Responsável | `assigned_user_id` | Atribuir exige `IS NULL` no `WHERE`; reatribuir é operação distinta ([ADR-0013](./0013-fluxo-de-dados-no-app.md)) |
| Identificador do workspace na URL | `Workspace.slug` | UUIDv4, único. Não legível, não enumerável ([ADR-0012](./0012-contexto-de-tenant-na-url.md)) |
| Origem comercial (handoff) | `source_opportunity_id` | — |
| Motivo de perda | `loss_reason` | — |

## Regras

- **Colunas em `snake_case`, sempre EN, sem acento em nenhum identificador** — nem em model, coluna, enum, arquivo ou branch.
- **Valores de enum em `SCREAMING_SNAKE_CASE` e EN** (`COMMERCIAL`, `LEGAL`, `META_LEAD_ADS`). A tradução para PT-BR acontece na camada de apresentação, nunca no banco.
- **Strings visíveis ao usuário são PT-BR** e vivem na UI, não no domínio. Nenhum model carrega texto de tela.
- **Termo novo entra primeiro no `CONTEXT.md` em PT-BR e depois nesta tabela.** Model sem linha aqui é model com nome improvisado.

**Consequences:** o glossário e o schema deixam de ser legíveis um contra o outro sem consulta. Esta tabela vira leitura obrigatória antes de qualquer migration, e `AGENTS.md` aponta para ela.
