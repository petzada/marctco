# CRM Revisional — Síntese final de produto (MVP)

> **Fonte de verdade** para iniciar o desenvolvimento · ago/2026  
> Consolida [decisões travadas](docs/pesquisa/decisoes.md), [síntese de mercado](docs/pesquisa/sintese.md), [análise Pluga](docs/pesquisa/pluga.md) e [síntese manual](docs/pesquisa/sintese-manual.md).

> ⚠️ **Documento de degrau 4** ([escada de precedência](./AGENTS.md#precedência-entre-documentos)). Cede para `decisao-features-concorrentes.md` e para os ADRs. Superado na sessão de 2026-08-04:
>
> | Aqui | Vale hoje |
> |---|---|
> | **§13 Prioridade de construção** | **Substituída** por [docs/plano-de-construcao.md](docs/plano-de-construcao.md) — 8 fases, incluindo Agenda, Atividade, Equipe, Contratos, Documentos, Analytics e tags, que §13 desconhecia |
> | §3 e §11 "analytics in-app fora do MVP" | Só **telemetria** fica fora; o módulo Analytics do cliente entra |
> | §5.3 "responder 202, idempotência `UNIQUE`" | Correto, e detalhado: **202 sempre, nunca 409**, com dois mecanismos de idempotência distintos — [ADR-0007](docs/adr/0007-ingestao-idempotencia.md) |
> | §5.4 Deduplicação | Refinada: identidade **telefone → CPF → e-mail**, quarentena, retransmissão inerte ao funil — [ADR-0007](docs/adr/0007-ingestao-idempotencia.md) |
> | §6 1º contato "disparo na chegada do lead" | Default é **na atribuição** — [ADR-0003](docs/adr/0003-whatsapp-instancia-unica-gatilho-atribuicao.md) |
> | **§10 Modelo de dados** | Nomes em PT-BR e mistos (`pipeline_stage_id`, `assigned_user_id`, `chegou_em`). O schema real é **EN**, com mapeamento canônico em [ADR-0005](docs/adr/0005-idioma-codigo-en-ui-pt-br.md). `Oportunidade` ganha `status: OPEN\|WON\|LOST` ortogonal à etapa |
> | §12 "todos os módulos no código, liberação via `workspace_flags`" | Flags só onde custa dinheiro ou chama terceiro; sem flag por módulo para packaging — [ADR-0004](docs/adr/0004-fronteira-flag-configuracao-estado.md) |

---

## 1. Visão

CRM de vendas para assessorias de **revisional de juros abusivos** (financiamento veicular, imobiliário e empréstimo pessoal) que captam leads via **Meta Lead Ads** e **Google Lead Form**, com operação comercial e jurídica no mesmo workspace.

**Tese:** capturar lead quente → aquecer via WhatsApp → converter no funil comercial por produto → assinar contrato → entregar ao funil jurídico com histórico intacto. A Pluga é apenas o adaptador de entrada de Ads; toda a inteligência comercial fica no CRM.

**Referências de mercado:** [Ploomes](docs/pesquisa/ploomes.md) · [clieent](docs/pesquisa/clieent.md) · [ADVBOX](docs/pesquisa/advbox.md) · [PipeRun](docs/pesquisa/piperun.md) · [Pipedrive](docs/pesquisa/pipedrive.md)

---

## 2. ICP e piloto

| Item | Definição |
|------|-----------|
| ICP formal | Não travado no MVP — time comercial vende caso a caso |
| Cliente piloto | Assessoria comercial + jurídica de redução de parcelas (veículo, imóvel, EP) |
| Captação | Meta Ads + Google Ads (Lead Form) via Pluga; LPs nativas/externas via webhook |
| Trial | 30 dias, acompanhado pelo comercial; contas liberadas manualmente pelo dono |
| Organização | **1 workspace = grupo/empresa mãe**; filiais/times via **tags**; funis por produto; comercial/jurídico no mesmo workspace |

---

## 3. Escopo MVP

### Dentro

- Multi-workspace desde o primeiro cliente (tenant = workspace = **grupo/empresa mãe**; filiais/times = **tags**, não workspaces)
- Captação: Pluga (Meta + Google Lead Form) + webhook genérico para landing pages
- Funis **separados por produto**, 100% editáveis (Comercial e Jurídico)
- Fluxo comercial até **Ganho** ou etapa **“Necessário setor jurídico”**
- Handoff idempotente comercial → jurídico (1 card jurídico por origem comercial)
- WhatsApp via [WhatsMiau](https://whatsmiau.dev/docs/getting-started): mensagens + webhooks → timeline (sem inbox nativo)
- Template fixo de 1º contato (configurável; sem LLM no disparo)
- SLA de 1º contato desde **chegada no CRM**
- Assinatura digital: **Clicksign** e **DocuSign** (cliente escolhe no workspace)
- Score de cabimento por **LLM opcional** (DeepSeek V4 / Gemini Flash via OpenRouter; tela Análise de cliente)
- Feature flags no código + `workspace_flags`; liberação manual comercial/técnico; preço **fora do app**
- Um **workspace por grupo** (empresa mãe); filiais/times via **tags** + funis por produto
- Normalização de dados no CRM como fonte de verdade absoluta
- Tela Integrações > Pluga: URL, secret, teste, logs, última sync (sem De→Para no CRM)

### Fora do MVP

Inbox WhatsApp nativo · ligação WhatsApp/VoIP · Meta Cloud API Calling · intimações/controladoria jurídica (ADVBOX-like) · offline conversions / CAPI Ads · LLM no 1º contato · billing in-app · analytics in-app (Himetrica = pós) · conector nativo Meta/Google OAuth no CRM · wizard De→Para Pluga no CRM · workspace por filial

Detalhes e riscos VoIP futuro: [decisoes.md](docs/pesquisa/decisoes.md)

---

## 4. Fluxo canônico

```
Meta Lead Ads ──┐
                ├── Pluga ──► POST /v1/integrations/pluga/leads
Google Lead Form┘              │
LP (webhook) ──────────────────┤
                               ▼
                    Normalização + fila assíncrona
                               │
              Template fixo WhatsMiau (opcional, feature flag)
                               │
                    Atribuição + SLA (desde chegou_em)
                               │
                    Funil COMERCIAL (por produto, editável)
                               │
         ┌─────────────────────┼─────────────────────┐
         ▼                     ▼                     ▼
    Docs/proposta      [Opcional] Análise LLM    Assinatura
                       → score cabimento         Clicksign | DocuSign
                               │
              Ganho  ou  Necessário setor jurídico
                               │
              Funil JURÍDICO (1 card / handoff idempotente)
              + dados normalizados + resumo comercial + docs
                               │
                    Gestor jurídico atribui atendente
```

### Handoff comercial → jurídico

| Regra | Comportamento |
|-------|---------------|
| Gatilhos | Status `ganho` ou etapa `necessario_juridico` (configurável) |
| Pessoa | Reutiliza mesma Pessoa (CPF/telefone normalizado) |
| Idempotência | `oportunidade_comercial_id` → no máximo 1 oportunidade jurídica ativa |
| Retrigger | Se card jurídico aberto existe → atualiza resumo, não duplica |
| Pré-condição | Funil jurídico ativo no workspace; senão notifica admin |
| Atribuição | Card jurídico nasce sem atendente; gestor jurídico atribui |

Especificação completa: [decisoes.md § Handoff](docs/pesquisa/decisoes.md#handoff-comercial--jurídico-q8c--orquestração)

---

## 5. Captação e integrações

### 5.1 Pluga (obrigatória para Ads)

A Pluga autentica Meta/Google do cliente; o CRM **nunca** recebe credenciais OAuth do cliente.

**Arquitetura correta:** Pluga faz **apenas** POST no CRM (1 lead ≈ 1 evento Pluga). WhatsApp, notificações, funil e assinatura rodam **dentro do CRM** — não na Pluga.

```
Meta Lead Ads ───────┐
                     ├── Pluga ──► CRM (1 POST/lead)
Google Lead Form ────┘                │
                                      ▼
                              Fila interna → funil, WA, tarefas
```

**Conta Pluga:** uma conta **por workspace/cliente** (não centralizar todos os escritórios). Onboarding gera URL, token, modelo JSON e tutoriais Meta/Google.

**Plano Pluga:** depende do volume — ver [pluga.md § Pricing](docs/pesquisa/pluga.md#pricing-impacto-no-cliente-do-crm). Operações com alto investimento em mídia devem preferir margem de eventos (Ultimate) para evitar pausa de automação.

**Latência:** Meta via Pluga = polling ~5 min (planos pagos); Google Lead Form = push imediato para Pluga. Não prometer “lead instantâneo” sem teste operacional. SLA comercial conta desde `chegou_em` no CRM.

**Limitações de canal (Pluga):**

| Canal | Funciona via Pluga? |
|-------|---------------------|
| Meta Lead Ads (formulário instantâneo) | Sim |
| Google Lead Form | Sim |
| Landing page externa | Webhook genérico do CRM |
| Anúncio → WhatsApp direto | Via API/provedor WA, não Pluga |
| Anúncio só ligação | Sem lead estruturado automático |
| Métricas Google Ads Insights | Não (só Lead Form para ingestão) |

Contrato HTTP, payload, tela de integração: [pluga.md](docs/pesquisa/pluga.md)

### 5.2 Landing pages (webhook genérico)

```
POST /v1/integrations/webhooks/leads
Authorization: Bearer <secret_por_workspace>
```

Mesma camada de normalização (`LeadSourceConnector`); origem `LANDING_PAGE`.

### 5.3 Endpoint canônico Pluga

```
POST /v1/integrations/pluga/leads
Authorization: Bearer <token_por_integration_connection>
Content-Type: application/json
```

- Workspace identificado **pelo token** — nunca aceitar `workspace_id` livre no JSON
- Responder **202** rapidamente; processar em fila
- Idempotência: `UNIQUE(workspace_id, source, external_lead_id)`
- Persistir evento bruto antes de processar (`integration_events`)

Camada de conectores (desacoplar domínio da Pluga):

```
PlugaMetaConnector · PlugaGoogleConnector · LandingPageWebhookConnector
→ NormalizedLead → domínio (funil, distribuição, relatórios)
```

Evolução futura: `MetaDirectConnector`, `GoogleDirectConnector`, `CsvImportConnector` — [sintese-manual § Caminho de evolução](docs/pesquisa/sintese-manual.md)

### 5.4 Deduplicação

| Cenário | Comportamento |
|---------|---------------|
| Retransmissão Pluga (mesmo `external_lead_id`) | Atualiza envio; **não** cria segunda oportunidade |
| Nova submissão (novo `external_lead_id`), mesma pessoa | Nova **Oportunidade**; reutiliza **Pessoa** |
| Mesmo CPF em datas diferentes | Permitido — novo negócio comercial |

Modelo: **Pessoa** (única) · **Oportunidade** (negócio) · **EnvioLead** (cada formulário recebido)

---

## 6. WhatsApp (WhatsMiau)

- Instância por workspace; `sendText` / mídia; webhooks → timeline no card da oportunidade
- **1º contato automático:** template fixo editável, disparo na chegada do lead (feature flag `auto_primeiro_contato`); sem LLM
- **Sem inbox nativo** no MVP (backlog pós-assinatura)
- **Sem ligação nativa** — atendente usa app WhatsApp/telefone próprio; VoIP avaliado depois

Riscos VoIP futuro: [decisoes.md § WhatsMiau](docs/pesquisa/decisoes.md#whatsmiau--calling-e-voip-futuro)

---

## 7. Assinatura digital

Adaptador único com duas implementações; workspace conecta **Clicksign** e/ou **DocuSign** (credenciais do cliente).

Fluxo: gerar contrato → enviar envelope → webhooks (visualizou / assinou / recusou / completo) → atualiza Kanban comercial.

Referência de preços/API: [decisoes.md § Assinatura](docs/pesquisa/decisoes.md#assinatura-q7bc)

---

## 8. Score de cabimento (LLM — opcional)

Tela **Análise de cliente** (feature flag `score_cabimento_llm`):

1. Seleciona lead/oportunidade (pré-fill dos dados do form Ads/LP)
2. Completa campos faltantes manualmente
3. Envia payload normalizado via **OpenRouter** — **DeepSeek V4** (preferencial) ou **Gemini Flash** (escopo revisional fixo)
4. Recebe score + justificativa no card
5. Uso 100% voluntário — nunca bloqueia o funil

Especificação: [decisoes.md § Score](docs/pesquisa/decisoes.md#score-de-cabimento-q6d--especificação)

---

## 9. Núcleo de produto

| Módulo | Descrição |
|--------|-----------|
| Funis | Por produto; tipos `comercial` e `juridico`; etapas editáveis |
| Kanban | Atividade-first; detecção de estagnação; SLA desde `chegou_em` |
| Atribuição | Comercial e jurídica separadas; gestor atribui |
| Documentos | Solicitação, proposta rastreável, contrato |
| Perdas | Motivo de perda obrigatório |
| Dashboard | Canal, formulário, tempo até 1º contato, taxa assinatura, conversão |
| Permissões | OWNER · ADMIN · MANAGER · ATTENDANT · VIEWER; tags de filial/time nos membros |
| Auditoria | Log de ações sensíveis (mínimo no MVP; LGPD completa pós-validação) |
| Feature flags | Catálogo no código + `workspace_flags`; liberação comercial/técnico |

Inspirações por concorrente: CPQ/docs [Ploomes](docs/pesquisa/ploomes.md) · proposta rastreável + ASTREA-like handoff [clieent](docs/pesquisa/clieent.md) · kanban intuitivo [Pipedrive](docs/pesquisa/pipedrive.md) · case revisional [PipeRun](docs/pesquisa/piperun.md) · pós-venda jurídico (fase futura) [ADVBOX](docs/pesquisa/advbox.md)

---

## 10. Modelo de dados (conceitual)

```
Workspace (flags, trial, timezone America/Sao_Paulo)
 ├── WorkspaceMembers (role, tags[])     ← tags = filial / time / carteira
 ├── Tags[] (rótulos do workspace)
 ├── IntegrationConnection (provider, token_hash, status)
 │    └── IntegrationEvent (payload_json, status, attempts)
 ├── Funis[] (tipo: comercial|juridico, produto?, etapas[])
 ├── Integrações (Pluga, LP, WhatsMiau, Clicksign, DocuSign, LLM/OpenRouter)
 ├── Pessoa (CPF, telefone E.164, email lowercase)
 ├── EnvioLead (external_lead_id, source, raw, received_at)
 └── Oportunidade
      ├── area: comercial | juridica
      ├── produto, pipeline_stage_id, assigned_user_id
      ├── tags[]?                       ← opcional (filial/carteira)
      ├── origem_comercial_id?  ← handoff
      ├── score_cabimento?
      ├── atividades, docs, propostas, envelopes
      └── status, chegou_em
```

Isolamento: `workspace_id` em todas as tabelas de negócio; RLS no PostgreSQL.  
Organização interna do grupo: **um workspace** + funis por produto + **tags** (filial/time) — ver [ADR-0002](docs/adr/0002-workspace-tags-times.md).

---

## 11. Stack travada

| Camada | Decisão |
|--------|---------|
| Linguagem | TypeScript |
| App / UI | Next.js (App Router) |
| Worker | Node.js separado (monorepo) |
| Banco + Auth | Supabase PostgreSQL + Supabase Auth |
| Isolamento | RLS por `workspace_id` |
| ORM | Prisma |
| Fila | Redis + BullMQ (Railway) |
| Storage | Cloudflare R2 |
| Validação / UI | Zod · Tailwind + shadcn/ui · dnd-kit · RHF · TanStack Query |
| E-mail / erros | Resend · Sentry |
| Deploy | Railway (app + worker + Redis) |
| LLM score | DeepSeek V4 (pref.) / Gemini Flash via OpenRouter |
| Analytics | Fora do MVP · pós: Himetrica |
| Resiliência | Dead-letter queue; reprocessamento manual |

Fonte de verdade técnica: [stack-recomendada.md](./stack-recomendada.md) · [ADR-0001](docs/adr/0001-stack-monolito-modular-ts.md)

---

## 12. Monetização

- Preço **negociado fora do app** (time comercial); sem billing in-app no MVP
- MVP expõe **todos os módulos no código**; liberação via **`workspace_flags`** (comercial/técnico)
- Infra Pluga: contratada pelo cliente (ou repassada no plano comercial)
- Exemplo de packaging comercial (referência, não travado): CRM + integração + configuração — ver [sintese-manual § Monetização](docs/pesquisa/sintese-manual.md)

---

## 13. Prioridade de construção

| # | Entrega | Referência |
|---|---------|------------|
| 1 | Workspace, RLS, roles, tags (filial/time), feature flags, funis editáveis | [sintese.md §9](docs/pesquisa/sintese.md) · [ADR-0002](docs/adr/0002-workspace-tags-times.md) |
| 2 | Endpoint Pluga + webhook LP + normalização + fila + `integration_events` | [pluga.md](docs/pesquisa/pluga.md) |
| 3 | Tela Integrações > Pluga (URL, secret, teste, logs, sync) | [pluga.md § Tela](docs/pesquisa/pluga.md#o-que-o-crm-precisa-ter-tela-integrações--pluga) |
| 4 | WhatsMiau + template 1º contato + SLA + atribuição comercial | [decisoes.md](docs/pesquisa/decisoes.md) |
| 5 | Kanban comercial + docs + proposta + motivo perda | [sintese.md](docs/pesquisa/sintese.md) |
| 6 | Assinatura Clicksign + DocuSign + eventos no funil | [decisoes.md § Assinatura](docs/pesquisa/decisoes.md#assinatura-q7bc) |
| 7 | Handoff → funil jurídico (idempotente + resumo comercial) | [decisoes.md § Handoff](docs/pesquisa/decisoes.md#handoff-comercial--jurídico-q8c--orquestração) |
| 8 | Tela Análise de cliente + LLM score (opcional) | [decisoes.md § Score](docs/pesquisa/decisoes.md#score-de-cabimento-q6d--especificação) |
| 9 | Dashboard comercial | [sintese.md](docs/pesquisa/sintese.md) |
| 10 | Pós-MVP: inbox WA · VoIP · CAPI/offline conversions · Himetrica | [sintese-manual § Fase 4](docs/pesquisa/sintese-manual.md) |

---

## 14. Sucesso do piloto (30 dias)

1. Leads Meta/Google/LP chegam no CRM com atribuição de campanha
2. Template WA + SLA + funil comercial por produto operando
3. Contrato assinado (Clicksign ou DocuSign) reflete no Kanban
4. Ganho ou “Necessário jurídico” gera card no funil jurídico **sem duplicar**
5. (Opcional) Time usa Análise de cliente / score em leads selecionados

---

## 15. Caminho de evolução

| Fase | Escopo |
|------|--------|
| 1 | 1 cliente · Pluga · CRM multi-workspace |
| 2 | N workspaces · 1 conta Pluga/workspace · endpoint multi-tenant |
| 3 | App nativo no catálogo Pluga (se viável comercialmente) |
| 4 | OAuth Meta/Google próprio · webhooks diretos · offline conversions / CAPI |

Escala Pluga: excelente para 1–10 clientes; padronizar onboarding até ~30; 30+ considerar integração nativa. Detalhe: [sintese-manual § Limitação SaaS](docs/pesquisa/sintese-manual.md)

---

## 16. Mapa de documentos

| Documento | Papel |
|-----------|--------|
| **sintese-final.md** (este) | Guia único para desenvolvimento |
| [stack-recomendada.md](./stack-recomendada.md) | Stack técnica **travada** |
| [CONTEXT.md](./CONTEXT.md) | Glossário de domínio |
| [docs/adr/](./docs/adr/) | ADRs (stack, workspace/tags) |
| [docs/pesquisa/decisoes.md](docs/pesquisa/decisoes.md) | Decisões travadas + specs handoff/score/assinatura |
| [docs/pesquisa/sintese.md](docs/pesquisa/sintese.md) | Síntese de produto (espelho enxuto) |
| [docs/pesquisa/pluga.md](docs/pesquisa/pluga.md) | Contrato HTTP, pricing, tela integração |
| [docs/pesquisa/sintese-manual.md](docs/pesquisa/sintese-manual.md) | Análise arquitetural Pluga + multi-tenant |
| [docs/pesquisa/README.md](docs/pesquisa/README.md) | Índice da pesquisa competitiva |
| Concorrentes | [ploomes](docs/pesquisa/ploomes.md) · [clieent](docs/pesquisa/clieent.md) · [advbox](docs/pesquisa/advbox.md) · [piperun](docs/pesquisa/piperun.md) · [pipedrive](docs/pesquisa/pipedrive.md) |

---

## 17. Princípios de produto

1. Pluga = entrada; CRM = motor operacional  
2. Comercial alimenta jurídico — nunca o contrário no piloto  
3. Uma Pessoa, N Oportunidades; um handoff, um card jurídico  
4. Score e LLM não bloqueiam venda  
5. Template segura o lead quente; humano fecha  
6. Assinatura com eventos refletidos no funil  
7. Módulos por feature flag; preço fora do app  
8. CRM = fonte de verdade dos dados normalizados  

---

*Escopo de pesquisa e produto: **fechado**. Stack técnica: **travada** ([stack-recomendada.md](./stack-recomendada.md)). Próximo passo: spec de implementação / issues em `.scratch/`.*
