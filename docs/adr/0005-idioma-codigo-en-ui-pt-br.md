# Código em inglês, UI e glossário em PT-BR

Todo identificador de código — models Prisma, colunas, tipos, funções, enums — é escrito em **inglês**. A UI é **PT-BR only** e `CONTEXT.md` continua sendo a linguagem ubíqua em PT-BR. A ponte entre os dois é a tabela de mapeamento abaixo, que é **canônica**: traduz-se consultando, nunca improvisando.

**Status:** accepted · 2026-08-04

**Considered options (rejeitada):** domínio em PT-BR no código (`Pessoa`, `Oportunidade`, `EnvioLead`) com EN só para encanamento — o que os docs de pesquisa já faziam organicamente em `sintese-final.md` §10. Rejeitada porque o ecossistema (Prisma, libs, mensagens de erro) fala EN, schemas de idioma misto são um cheiro conhecido, e agentes de código são mensuravelmente mais precisos sobre identificadores EN — e este projeto será majoritariamente escrito por agentes.

**Custo assumido:** existe agora uma tradução entre glossário e código. Tradução improvisada é como termos proibidos reaparecem — `CONTEXT.md` proíbe explicitamente `Deal` para Oportunidade, que é exatamente o que um dev ou agente de fala inglesa escreveria por reflexo. A tabela abaixo existe para eliminar a improvisação.

## Mapeamento canônico PT-BR → EN

| Glossário (`CONTEXT.md`) | Código | Nota |
|---|---|---|
| Workspace | `Workspace` | — |
| Tag | `Tag` | — |
| Produto | `Product` | — |
| Funil | `Pipeline` | Sempre tipado: `type: COMMERCIAL \| LEGAL` |
| Etapa (do funil) | `Stage` | FK `stage_id`. **Nunca** `pipeline_stage_id` — a etapa tem um nome só |
| Papel da etapa | `Stage.role: ENTRY \| LEGAL_HANDOFF \| NORMAL` | Papel é do sistema; rótulo e ordem são do cliente ([ADR-0009](./0009-etapas-editaveis-papeis-e-status.md)) |
| Ordem da etapa | `Stage.position` | Coluna própria e mutável |
| Situação da oportunidade | `Opportunity.status: OPEN \| WON \| LOST` | Ortogonal à etapa; ganho/perdido não são colunas do Kanban |
| Pessoa | `Person` | Cobre física e jurídica. **Nunca** `Contact` |
| Oportunidade | `Opportunity` | **Nunca** `Deal` (proibido no glossário), **nunca** `Lead` |
| **Lead** (rótulo de UI) | — | Não tem model. É `Opportunity` com `area = COMMERCIAL` |
| EnvioLead | `LeadSubmission` | A submissão de formulário, não a oportunidade |
| Handoff | `Handoff` | — |
| Score de cabimento | `EligibilityScore` | "Cabimento" = admissibilidade da revisional |
| Feature flag | `FeatureFlag` / `WorkspaceFlag` | Tabela `workspace_flags` |
| Configuração de workspace | `WorkspaceSettings` | — |
| Área (comercial/jurídica) | `area: COMMERCIAL \| LEGAL` | **Nunca** `department` (ADR-0002 evita "departamento") |
| Atividade | `Activity` | Campo `due_at` |
| Etapa de entrada | `Stage.role = ENTRY` | Onde o lead ingerido nasce |
| Conector de origem | `LeadSourceConnector` | — |
| Conexão de integração | `IntegrationConnection` | — |
| Evento de integração | `IntegrationEvent` | — |
| Envelope de assinatura | `Envelope` | — |
| Quarentena | `IntegrationEvent.status = QUARANTINED` | Estado do evento, não da oportunidade |
| Marcador "sem telefone" | `Opportunity.missing_phone` | Significa uma coisa só: não dá WhatsApp nem ligação |
| Gatilho do 1º contato | `WorkspaceSettings.first_contact_trigger: ON_ASSIGNMENT \| ON_ARRIVAL \| DISABLED` | Configuração do gestor ([ADR-0003](./0003-whatsapp-instancia-unica-gatilho-atribuicao.md)) |
| Valor (da oportunidade) | `amount` | `value` é genérico demais para coluna monetária |
| Chegou em | `arrived_at` | Início do relógio de SLA |
| Responsável | `assigned_user_id` | — |
| Origem comercial (handoff) | `source_opportunity_id` | — |
| Motivo de perda | `loss_reason` | — |

## Regras

- **Colunas em `snake_case`, sempre EN, sem acento em nenhum identificador** — nem em model, coluna, enum, arquivo ou branch.
- **Valores de enum em `SCREAMING_SNAKE_CASE` e EN** (`COMMERCIAL`, `LEGAL`, `META_LEAD_ADS`). A tradução para PT-BR acontece na camada de apresentação, nunca no banco.
- **Strings visíveis ao usuário são PT-BR** e vivem na UI, não no domínio. Nenhum model carrega texto de tela.
- **Termo novo entra primeiro no `CONTEXT.md` em PT-BR e depois nesta tabela.** Model sem linha aqui é model com nome improvisado.

**Consequences:** o glossário e o schema deixam de ser legíveis um contra o outro sem consulta. Esta tabela vira leitura obrigatória antes de qualquer migration, e `AGENTS.md` aponta para ela.
