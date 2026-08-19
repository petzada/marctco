# Código em inglês, UI e glossário em PT-BR

Todo identificador de código — models Prisma, colunas, tipos, funções, enums — é escrito em **inglês**. A UI é **PT-BR only** e `CONTEXT.md` continua sendo a linguagem ubíqua em PT-BR. A ponte entre os dois é a tabela de mapeamento abaixo, que é **canônica**: traduz-se consultando, nunca improvisando.

**Status:** accepted · 2026-08-04

**Considered options (rejeitada):** domínio em PT-BR no código (`Pessoa`, `Oportunidade`, `EnvioLead`) com EN só para encanamento — o que os docs de pesquisa já faziam organicamente em `sintese-final.md` §10. Rejeitada porque o ecossistema (Prisma, libs, mensagens de erro) fala EN, schemas de idioma misto são um cheiro conhecido, e agentes de código são mensuravelmente mais precisos sobre identificadores EN — e este projeto será majoritariamente escrito por agentes.

**Custo assumido:** existe agora uma tradução entre glossário e código. Tradução improvisada é como termos proibidos reaparecem — `CONTEXT.md` proíbe explicitamente `Deal` para Oportunidade, que é exatamente o que um dev ou agente de fala inglesa escreveria por reflexo. A tabela abaixo existe para eliminar a improvisação.

## Mapeamento canônico PT-BR → EN

| Glossário (`CONTEXT.md`) | Código | Nota |
|---|---|---|
| Workspace | `Workspace` | Fronteira de captação, não “uma assessoria” nem automaticamente o grupo ([ADR-0022](./0022-workspace-e-fronteira-de-captacao.md)) |
| Associação ao workspace | `WorkspaceMember` | Onde vive o perfil de acesso e o `status` do vínculo. **Nunca** `Membership` solto nem `User` do workspace |
| Perfil de acesso | `WorkspaceMember.role` | `ATTENDANT \| SUPERVISOR \| MANAGER \| OWNER` — quatro, e nenhum a mais ([ADR-0015](./0015-perfis-de-acesso-e-escopo.md)) |
| Contexto de acesso | `AccessContext` = `UserContext \| JobContext` | `UserContext`: `workspace_id` + `user_id` + `role`, construído somente por `resolveUserContextForSlug` após validar a associação. `JobContext`: `workspace_id` + `integration_event_id` — o worker não tem usuário nem papel ([ADR-0016](./0016-contexto-de-acesso-e-leitor-escopado.md), [ADR-0019](./0019-resolucao-pre-contexto-e-executor-privado.md)). **Nunca** `Session` nem `RequestContext` |
| Provisionamento | `private.provision_workspace` | Workspace + vínculo do dono + funil padrão, num commit ([ADR-0006](./0006-rls-duas-camadas-guc-worker.md) regra 9) |
| Tag | `Tag` | Catálogo do workspace, gerido na Equipe no mesmo gesto do cadastro. Na oportunidade fica **fora da Fase 2**; se nascer depois, é o mesmo catálogo e não computa escopo ([ADR-0020](./0020-tag-no-membro-define-o-time.md)) |
| Tag no membro | `MemberTag` | Aplicação da tag ao `WorkspaceMember`. É o que computa o time de um `SUPERVISOR`. **Nunca** `Team` nem herança para a Oportunidade |
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
| Contagem de transmissões do envio | `LeadSubmission.transmission_count` | Incrementada pela retransmissão, que não move mais nada no funil |
| Oportunidade do envio | `LeadSubmission.opportunity_id` | Nula enquanto o envio não produziu card: quarentena, ou plano ainda não aplicado |
| Payload bruto recebido | `IntegrationEvent.raw` | Cópia única. Anulável, e **nulo só pode significar expirado**: o payload é gravado no recebimento, antes do 200 ([ADR-0014](./0014-copia-unica-e-retencao-do-payload.md)) |
| Atendente | `WorkspaceMember.role = ATTENDANT` | Enxerga apenas oportunidade atribuída a si ([ADR-0015](./0015-perfis-de-acesso-e-escopo.md)) |
| Supervisor | `WorkspaceMember.role = SUPERVISOR` | Com tag: o time. Sem tag: não reatribui — não herda Gestão. **Não vê a fila sem dono** ([ADR-0024](./0024-fila-sem-dono-e-da-gestao.md)). `MemberTag` existe desde a Fase 2 ([ADR-0015](./0015-perfis-de-acesso-e-escopo.md), [ADR-0022](./0022-workspace-e-fronteira-de-captacao.md)) |
| Gestão | `WorkspaceMember.role = MANAGER` | Operação inteira do workspace |
| Direção | `WorkspaceMember.role = OWNER` | Operação **e** conta: membros, papéis, segredo de integração. É o papel criado no provisionamento |
| Cadastro de colaborador | — | Ato da Direção na Equipe: login + `WorkspaceMember` no mesmo ato, sem direito de provisionar. E-mail já existente só atrela ([ADR-0021](./0021-dois-caminhos-de-nascimento-login-fechado.md), [ADR-0023](./0023-desligamento-desativa-o-vinculo.md)). **Nunca** `SignUp` |
| Estado do vínculo | `WorkspaceMember.status: ACTIVE \| DETACHED` | Desatrelar e desligar **desativam** o vínculo; não apagam a linha. Desligamento não é um terceiro valor — é a operação que marca `DETACHED` em todos os vínculos e tira o direito de provisionar ([ADR-0023](./0023-desligamento-desativa-o-vinculo.md)) |
| Desatrelamento | — | Gestão ou Direção marca `DETACHED` só naquele workspace ([ADR-0023](./0023-desligamento-desativa-o-vinculo.md)) |
| Desligamento | — | Direção marca `DETACHED` em todos os vínculos; pessoa fora do quadro ([ADR-0023](./0023-desligamento-desativa-o-vinculo.md)) |
| Plano de ingestão | `IntakePlan` | União discriminada `Quarantine \| Retransmission \| NewOpportunity`; decidido puro, aplicado por `applyIntakePlan` ([ADR-0017](./0017-ingestao-como-decisao-e-plano.md)) |
| Plano de ingestão aplicado | `AppliedIntakePlan` | O que `applyIntakePlan` gravou — a variante e os ids que nasceram. Nunca sai do processo: o retorno do job leva só a variante ([ADR-0014](./0014-copia-unica-e-retencao-do-payload.md)) |
| Limite do id da origem | `MAX_EXTERNAL_LEAD_ID_LENGTH` | Largura de `LeadSubmission.external_lead_id`. Acima dela o id declarado é lido como ausente e o conector cai no `IntegrationEvent.id` — a constraint que existe para não perder lead não pode ser o que recusa um |
| Contrato canônico de entrada | `InboundLead` | O contrato `v1` já interpretado, com `source` e `external_lead_id` resolvidos. Zod é a fonte única e o tipo é inferido ([ADR-0008](./0008-fronteira-conector-dominio.md)). **Nunca** `LeadPayload` como tipo de domínio |
| Lead normalizado | `NormalizedLead` | Saída de `normalize()`. Value object, não entidade. Telefone em `phones[]` E.164, e-mail em `emails[]` minúsculo, `cpf` só dígitos, `installment_amount` decimal com `installment_amount_raw` ao lado |
| Origem do lead | `LeadSource` | `META_LEAD_ADS \| GOOGLE_LEAD_FORM \| LANDING_PAGE`. Metade da `SubmissionKey`. **Nunca** confundir com `IntegrationProvider` (por qual conexão entrou) nem com `platform` (`fb`/`ig`) |
| Diagnóstico de normalização | `NormalizationDiagnostic` | `{ field, reason }` e **nenhum valor**: é a única parte do envio que sai do tenant ([ADR-0006](./0006-rls-duas-camadas-guc-worker.md) regra 12) |
| Plano de busca de Pessoa | `PersonLookupPlan` | Quais chaves buscar e com que força; dado inerte — o domínio descreve a busca, `findPersonCandidates` a executa |
| Força da chave de busca | `PersonLookupStrength` | `STRONG \| MODERATE \| WEAK` — CPF válido, telefone, e-mail isolado, nessa ordem ([ADR-0007](./0007-ingestao-idempotencia.md) §Identidade) |
| Decisão de Pessoa | `PersonDecision` | União discriminada `NO_CONTACT \| REUSE_PERSON \| NEW_PERSON \| NEW_PERSON_WITH_IDENTITY_CONFLICT`; entra em `decideIntake` como a metade "quem é" do `IntakePlan`. **Nunca** `decideReuseOfPerson` devolvendo um id anulável — a variante do conflito precisa carregar as candidatas |
| Candidata a Pessoa | `PersonCandidate` | O que `findPersonCandidates` devolve: `person_id`, o `cpf` já gravado e quais tipos de chave casaram |
| Contatos da Pessoa | `PersonContacts` | O conjunto **completo** que a submissão traz — nunca um delta. A não-sobrescrita é da constraint `UNIQUE(person_id, phone_e164)`, não da decisão |
| Chave idempotente do envio | `SubmissionKey` | `source` + `external_lead_id`; o que a constraint `UNIQUE(workspace_id, source, external_lead_id)` arbitra ([ADR-0007](./0007-ingestao-idempotencia.md)) |
| Revisão de ingestão | `IntakeReview` | Pendência **marcada na Oportunidade já criada**, nunca bloqueio; `type: IDENTITY_CONFLICT \| POSSIBLE_DUPLICATE` |
| Candidatas da revisão de identidade | `IntakeReview.candidate_person_ids` | As Pessoas para quem as chaves apontaram; vazio em `POSSIBLE_DUPLICATE`, e o `CHECK` recusa a combinação errada |
| Oportunidade ligada pela revisão | `IntakeReview.related_opportunity_id` | A outra Oportunidade em aberto da mesma Pessoa; nula em `IDENTITY_CONFLICT` |
| Marcador dentro do plano | `IntakeReviewPlan` | A variante da pendência no `IntakePlan`, antes de virar linha |
| Destino da ingestão | `IntakeDestination` | `pipeline_id` + `entry_stage_id`, resolvido **antes** de `decideIntake`. Não tem campo para tipo de financiamento, e é assim que a classificação não escolhe funil |
| Resultado do insert do envio | `SubmissionInsert` | `INSERTED \| DUPLICATE`; o que o `ON CONFLICT DO NOTHING RETURNING id` respondeu. É **entrada** de `decideIntake`, não saída ([ADR-0017](./0017-ingestao-como-decisao-e-plano.md)) |
| Marcador | `IntakeReview` + `Opportunity.missing_phone` | Não é um model: é o conjunto de pendências de um lead. Na UI, **um ícone só** os reúne ([ADR-0007](./0007-ingestao-idempotencia.md)) |
| Marcadores de um lead | `markersFor(opportunity, reviews)` | Função pura de `packages/domain`; quem responde "o que este lead tem". Os contadores por tipo **não** passam por ela ([ADR-0018](./0018-marcador-como-modulo.md)) |
| Possível duplicado | `IntakeReview.type = POSSIBLE_DUPLICATE` | Gatilho: mesma Pessoa + Oportunidade **em aberto** não mesclada. Financiamento é discriminador na tela, nunca gatilho |
| Mesclagem | — | Não tem model. É a operação que **reaponta** as FKs para a canônica e deixa a lápide na absorvida; o ponteiro nunca redireciona leitura |
| Resolução da revisão | `IntakeReview.resolution` | Tipada pelo `type`; para `POSSIBLE_DUPLICATE`: `NEW_FINANCING \| SAME_FINANCING \| INVALID_OR_SPAM`; nulo enquanto pendente |
| Autor da resolução | `IntakeReview.resolved_by_user_id` | Usuário do `UserContext`; job nunca resolve revisão |
| Instante da resolução | `IntakeReview.resolved_at` | Argumento da operação, preservado com a decisão |
| Motivo da resolução | `IntakeReview.resolution_reason` | Texto obrigatório nas três resoluções; nunca substitui a enumeração da decisão |
| Oportunidade mesclada | `Opportunity.merged_into_opportunity_id` | Resultado de `SAME_FINANCING`; sai das vistas ativas sem exclusão física |
| Pessoa mesclada | `Person.merged_into_person_id` | Resultado da resolução de `IDENTITY_CONFLICT`; preserva histórico e identificadores |
| Evento da linha do tempo da Oportunidade | `OpportunityTimelineEvent` | Fato imutável. Ingestão: `RETRANSMISSION_RECEIVED \| SUBMISSION_REENTERED`. Movimento (Fase 3 ticket 04): `STAGE_CHANGED \| ASSIGNED \| REASSIGNED \| RETURNED_TO_QUEUE \| ACTIVITY_CREATED \| ACTIVITY_COMPLETED`. Fato de movimento não tem evento de integração e não deduplica |
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
| Superfície de integração | `IntegrationSurface` | Tipo da camada web, não model: liga o segmento de URL da tela ao `IntegrationProvider` que ela administra, para que as duas não voltem a divergir |
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
| Campanha | `Opportunity.campaign_id` | Campo do contrato `v1` ([ADR-0008](./0008-fronteira-conector-dominio.md)), persistido na ingestão. Não roteia o lead — é atribuição de mídia e discriminador de duplicado ([ADR-0022](./0022-workspace-e-fronteira-de-captacao.md)) |
| Nome da campanha | `Opportunity.campaign_name` | Idem. É o valor legível; `campaign_id` do Meta é numérico. Gravado na ingestão porque o payload bruto expira em 90 dias ([ADR-0014](./0014-copia-unica-e-retencao-do-payload.md)) |
| Formulário | `Opportunity.form_id` | Idem `campaign_id` |
| Nome do formulário | `Opportunity.form_name` | Idem `campaign_name` |
| Responsável anterior | `Opportunity.previous_assigned_user_id` | Quem tinha o lead antes da reatribuição ou do desatrelamento. Trilha mínima até a `Activity` da Fase 3 ([ADR-0023](./0023-desligamento-desativa-o-vinculo.md)); nunca decide escopo |
| Estado do vínculo | `WorkspaceMember.status` | `ACTIVE \| DETACHED`, default `ACTIVE`. Não há terceiro valor “desligado” ([ADR-0023](./0023-desligamento-desativa-o-vinculo.md)) |
| Nome de exibição do membro | `WorkspaceMember.display_name` | Denormalizado, para a Equipe e o nome do responsável listarem sem consultar a Auth por linha |
| E-mail do membro | `WorkspaceMember.email` | Idem `display_name` |
| WhatsApp do membro | `WorkspaceMember.whatsapp_phone_e164` | Opcional; mesmo leitor de telefone da ingestão. O disparo é Fase 4 ([ADR-0003](./0003-whatsapp-instancia-unica-gatilho-atribuicao.md)) |
| Tag | `Tag` | Catálogo do workspace; unicidade por `(workspace_id, nome)` sem distinguir maiúscula |
| Tag do membro | `MemberTag` | Aplicação da tag ao membro. É o que computa o time do Supervisor; nunca herdada pela Oportunidade ([ADR-0020](./0020-tag-no-membro-define-o-time.md)) |
| Instituição financeira | `financial_institution` | Dado opcional do financiamento; não identifica Pessoa |
| Valor da parcela | `installment_amount` | Decimal monetário normalizado; entrada preserva também o valor bruto |
| Chegada | `arrived_at` | Início do relógio de SLA. Instante em que a Oportunidade passa a existir — igual ao recebimento no caminho direto, igual à liberação para lead ex-quarentena ([ADR-0007](./0007-ingestao-idempotencia.md)) |
| Recebido em | `received_at` | Verdade sobre a origem; permanece no `LeadSubmission` mesmo quando difere de `arrived_at` |
| Responsável | `assigned_user_id` | Atribuir exige `IS NULL` no `WHERE`; reatribuir é operação distinta ([ADR-0013](./0013-fluxo-de-dados-no-app.md)) |
| Identificador do workspace na URL | `Workspace.slug` | UUIDv4, único. Não legível, não enumerável ([ADR-0012](./0012-contexto-de-tenant-na-url.md)) |
| Origem comercial (handoff) | `source_opportunity_id` | — |
| Motivo de perda | `loss_reason` | — |
| Tipo da atividade | `ActivityType` | `CALL \| MESSAGE \| MEETING \| TASK`. `MESSAGE` cobre WhatsApp e e-mail sem antecipar a Fase 4; um valor `WHATSAPP` amarraria o tipo ao canal |
| Situação da atividade | `ActivityStatus` | `OPEN \| DONE \| CANCELED`. Concluir prova atendimento; cancelar não |
| SLA de primeiro contato | `WorkspaceSettings.first_contact_sla_minutes` | Minutos até a primeira evidência de atendimento. Anulável: nulo (ou linha ausente) resolve para o padrão do domínio, nunca desliga o relógio. Sem `first_contact_trigger` nesta fase |
| Limite de estagnação | `WorkspaceSettings.stagnation_days` | Dias sem movimento. Anulável pela mesma regra do SLA |
| Primeiro contato | `Opportunity.first_contact_at` | Instante da primeira evidência de atendimento. Anulável; escrito uma vez com `WHERE first_contact_at IS NULL`. Nesta fase a evidência é a primeira Atividade concluída; a Fase 4 preenche a mesma coluna com a mensagem de WhatsApp |
| Fechamento | `Opportunity.closed_at` | Instante em que a Oportunidade passa a `WON` ou `LOST`. Anulável enquanto `OPEN`; obrigatório quando fechada (`CHECK` no banco). Encerra o relógio de SLA sem primeiro contato. A operação de concluir atendimento da Fase 6 preenche; caminhos que já fecham o card (ex.: arquivar spam) também gravam |
| Estado de SLA de primeiro contato | `FirstContactSlaState: PENDING \| MET \| BREACHED` | Função pura `firstContactSla` em `packages/domain`. Relógio corrido. `WON`/`LOST` sem contato nunca é `MET` |
| Duração da espera de primeiro contato | `FirstContactSla.duration_ms` | Milissegundos corridos de `arrived_at` até `first_contact_at`, ou até `closed_at` quando `WON`/`LOST` sem contato, ou até `now` enquanto `OPEN` sem contato |
| Marcador de SLA estourado | `Marker = … \| FIRST_CONTACT_SLA_BREACHED` | `markersFor` passa a receber o estado de SLA e devolve o estourado como mais um marcador. Os contadores do topo da tabela **não** passam por ela ([ADR-0018](./0018-marcador-como-modulo.md)) |
| Último movimento | `Opportunity.last_movement_at` | Carimbo do último movimento do lead. Anulável; backfill para `arrived_at` na migration, para que lead nunca tocado seja o mais parado e não o menos. Editar campo, ler o lead e retransmissão inerte **não** escrevem |
| Fato de ingestão na linha do tempo | `OpportunityTimelineEvent.integration_event_id` | Obrigatório só nas duas variantes de ingestão. Anulável a partir do ticket 04: fato de movimento nasce sem evento de integração. A unicidade `(workspace_id, type, integration_event_id)` é índice parcial sobre `RETRANSMISSION_RECEIVED` e `SUBMISSION_REENTERED` |
| Envio do fato de ingestão | `OpportunityTimelineEvent.lead_submission_id` | Obrigatório só nas duas variantes de ingestão. Anulável no fato de movimento, que não tem EnvioLead |
| Tipo do fato de movimento | `OpportunityTimelineEventType` | `STAGE_CHANGED` (mover etapa), `ASSIGNED` (atribuir), `REASSIGNED` (reatribuir), `RETURNED_TO_QUEUE` (devolver à fila no desatrelamento), `ACTIVITY_CREATED` (marcar atividade nova — movimento sem ser atendimento), `ACTIVITY_COMPLETED` (concluir atividade) |
| Estado de estagnação | `StagnationState: MOVING \| STAGNANT` | Função pura `stagnation` em `packages/domain`. Ancora em `arrived_at` quando `last_movement_at` é nulo. `WON`/`LOST`/mesclado nunca é `STAGNANT` |
| Duração sem movimento | `Stagnation.duration_ms` | Milissegundos corridos do âncora (`last_movement_at` ou `arrived_at`) até `now` |
| Marcador de lead parado | `Marker = … \| STAGNANT` | `markersFor` recebe o estado de estagnação ao lado do de SLA e devolve o parado como mais um marcador. Os contadores do topo **não** passam por ela ([ADR-0018](./0018-marcador-como-modulo.md)) |

## Regras

- **Colunas em `snake_case`, sempre EN, sem acento em nenhum identificador** — nem em model, coluna, enum, arquivo ou branch.
- **Valores de enum em `SCREAMING_SNAKE_CASE` e EN** (`COMMERCIAL`, `LEGAL`, `META_LEAD_ADS`). A tradução para PT-BR acontece na camada de apresentação, nunca no banco.
- **Strings visíveis ao usuário são PT-BR** e vivem na UI, não no domínio. Nenhum model carrega texto de tela.
- **Termo novo entra primeiro no `CONTEXT.md` em PT-BR e depois nesta tabela.** Model sem linha aqui é model com nome improvisado.

**Consequences:** o glossário e o schema deixam de ser legíveis um contra o outro sem consulta. Esta tabela vira leitura obrigatória antes de qualquer migration, e `AGENTS.md` aponta para ela.
