# CRM Revisional — Síntese final de produto (MVP)

> **Fonte de verdade** para iniciar o desenvolvimento · ago/2026  
> Consolida [decisões travadas](docs/pesquisa/decisoes.md), [síntese de mercado](docs/pesquisa/sintese.md), [análise Pluga](docs/pesquisa/pluga.md) e [síntese manual](docs/pesquisa/sintese-manual.md).

> ⚠️ **Documento de degrau 4** ([escada de precedência](./AGENTS.md#precedência-entre-documentos)). Cede para `decisao-features-concorrentes.md` e para os ADRs. Superado na sessão de 2026-08-04:
>
> | Aqui | Vale hoje |
> |---|---|
> | **§13 Prioridade de construção** | **Substituída** por [docs/plano-de-construcao.md](docs/plano-de-construcao.md) — 8 fases, incluindo Agenda, Atividade, Equipe, Contratos, Documentos, Analytics e tags, que §13 desconhecia |
> | §3 e §11 "analytics in-app fora do MVP" | Só **telemetria** fica fora; o módulo Analytics do cliente entra |
> | §5.3 "responder 202, idempotência `UNIQUE`" | Idempotência correta, código não: é **200 sempre, nunca 409**. A Pluga não documenta quais códigos aceita, e 202 traria só ganho semântico contra risco de todo lead virar falha no painel — [ADR-0007](docs/adr/0007-ingestao-idempotencia.md) |
> | §5.4 Deduplicação | Telefone não vence conflitos; múltiplos contatos por Pessoa; conflito e possível duplicado viram marcador na Oportunidade já criada, nunca retenção — [ADR-0007](docs/adr/0007-ingestao-idempotencia.md) |
> | “Funis por produto” | **Superado.** Funil é fluxo Comercial/Jurídico; tipo de financiamento é atributo opcional da Oportunidade — [ADR-0009](docs/adr/0009-etapas-editaveis-papeis-e-status.md) |
> | §5 processamento “202 + fila” | `IntegrationEvent` é a outbox: commit PostgreSQL → 200 → dispatcher independente → BullMQ — [ADR-0007](docs/adr/0007-ingestao-idempotencia.md) |
> | §6 1º contato "disparo na chegada do lead" | Default é **na atribuição** — [ADR-0003](docs/adr/0003-whatsapp-instancia-unica-gatilho-atribuicao.md) |
> | **§10 Modelo de dados** | Nomes em PT-BR e mistos (`pipeline_stage_id`, `assigned_user_id`, `chegou_em`). O schema real é **EN**, com mapeamento canônico em [ADR-0005](docs/adr/0005-idioma-codigo-en-ui-pt-br.md). `Oportunidade` ganha `status: OPEN\|WON\|LOST` ortogonal à etapa |
> | §12 "todos os módulos no código, liberação via `workspace_flags`" | Flags só onde custa dinheiro ou chama terceiro; sem flag por módulo para packaging — [ADR-0004](docs/adr/0004-fronteira-flag-configuracao-estado.md) |

---

## 1. Visão

CRM de vendas para assessorias de **revisional de juros abusivos** (financiamento veicular, imobiliário e empréstimo pessoal) que captam leads via **Meta Lead Ads** e **Google Lead Form**, com operação comercial e jurídica no mesmo workspace.

**Tese:** capturar lead quente → entrar no funil comercial configurado → aquecer via WhatsApp → classificar o financiamento quando disponível → assinar contrato → realizar handoff humano ao funil jurídico com histórico intacto. A Pluga é apenas a camada de entrada e De→Para de Ads; toda a inteligência comercial fica no CRM.

**Referências de mercado:** [Ploomes](docs/pesquisa/ploomes.md) · [clieent](docs/pesquisa/clieent.md) · [ADVBOX](docs/pesquisa/advbox.md) · [PipeRun](docs/pesquisa/piperun.md) · [Pipedrive](docs/pesquisa/pipedrive.md)

---

## 2. ICP e piloto

| Item | Definição |
|------|-----------|
| ICP formal | Não travado no MVP — time comercial vende caso a caso |
| Cliente piloto | Assessoria comercial + jurídica de redução de parcelas (veículo, imóvel, EP) |
| Captação | Meta Ads + Google Ads (Lead Form) via Pluga; LPs nativas/externas via webhook servidor-servidor |
| Trial | 30 dias, acompanhado pelo comercial; contas liberadas manualmente pelo dono |
| Organização | **1 workspace = grupo/empresa mãe**; filiais/times via **tags**; funis operacionais Comercial/Jurídico; financiamento como atributo |

---

## 3. Escopo MVP

### Dentro

- Multi-workspace desde o primeiro cliente (tenant = workspace = **grupo/empresa mãe**; filiais/times = **tags**, não workspaces)
- Captação: Pluga (Meta + Google Lead Form) + webhook servidor-servidor para landing pages
- Funis operacionais editáveis dos tipos Comercial e Jurídico, independentes do tipo de financiamento
- Contrato canônico de entrada `v1`, com modelos de mapeamento Meta/Google na Pluga
- Revisão manual de conflitos de identidade e possíveis duplicados como marcador na Oportunidade, sem reter lead
- Fluxo comercial até **Ganho** ou etapa **“Necessário setor jurídico”**
- Handoff idempotente comercial → jurídico (1 card jurídico por origem comercial)
- WhatsApp via [WhatsMiau](https://whatsmiau.dev/docs/getting-started): mensagens + webhooks → timeline (sem inbox nativo)
- Template fixo de 1º contato (configurável; sem LLM no disparo)
- SLA de 1º contato desde **chegada no CRM**
- Assinatura digital: **Clicksign** e **DocuSign** (cliente escolhe no workspace)
- Score de cabimento por **LLM opcional** (DeepSeek V4 / Gemini Flash via OpenRouter; tela Análise de cliente)
- Feature flags no código + `workspace_flags`; liberação manual comercial/técnico; preço **fora do app**
- Um **workspace por grupo** (empresa mãe); filiais/times via **tags** + funis operacionais
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
LP (backend/provedor) ─ servidor-servidor ─┤
                               ▼
               commit outbox → 200 → dispatcher/BullMQ
                               │
                 normalização + revisão se necessária
                               │
              Template fixo WhatsMiau (opcional, feature flag)
                               │
                    Atribuição + SLA (desde chegou_em)
                               │
                    Funil COMERCIAL configurado
                               │
         ┌─────────────────────┼─────────────────────┐
         ▼                     ▼                     ▼
    Docs/proposta      [Opcional] Análise LLM    Assinatura
                       → score cabimento         Clicksign | DocuSign
                               │
       Gestor confirma handoff (no fechamento ou no meio)
                               │
              Funil JURÍDICO (1 card / handoff idempotente)
              + dados normalizados + resumo comercial + docs
                               │
                    Gestor jurídico atribui atendente
```

### Handoff comercial → jurídico

| Regra | Comportamento |
|-------|---------------|
| Ação | Handoff confirmado por um gestor; nunca nasce da ingestão nem de inferência automática |
| Pessoa | Reutiliza a Pessoa da Oportunidade comercial; se houver revisão de identidade pendente, o gestor a resolve como parte da decisão de enviar — ela não bloqueou o atendimento até aqui |
| Idempotência | `oportunidade_comercial_id` → no máximo 1 oportunidade jurídica ativa |
| Retrigger | Se card jurídico aberto existe → atualiza resumo, não duplica |
| Pré-condição | Funil jurídico ativo no workspace; senão notifica admin |
| Atribuição | Card jurídico nasce sem atendente; gestor jurídico atribui |

Especificação completa: [decisoes.md § Handoff](docs/pesquisa/decisoes.md#handoff-comercial--jurídico-q8c--orquestração)

---

## 5. Captação e integrações

### 5.1 Pluga (obrigatória para Ads)

A Pluga autentica Meta/Google do cliente; o CRM **nunca** recebe credenciais OAuth do cliente.

**Arquitetura correta:** Pluga captura Meta/Google, faz o De→Para e usa HTTP Request para enviar o contrato `v1` ao CRM (1 lead ≈ 1 evento Pluga). WhatsApp, notificações, funil e assinatura rodam **dentro do CRM** — não na Pluga.

```
Meta Lead Ads ───────┐
                     ├── Pluga ──► CRM (1 POST/lead)
Google Lead Form ────┘                │
                                      ▼
                       Outbox → dispatcher/BullMQ → funil, WA, tarefas
```

**Conta Pluga:** uma conta **por workspace/cliente** (não centralizar todos os escritórios). Onboarding gera URL, token, contrato `v1`, dois modelos de mapeamento e teste real de cada automação Meta/Google.

**Plano Pluga:** **piso é o Basic** — o Free não tem HTTP Request nem webhooks, então sem plano pago não há ingestão de Ads. Basic R$73,87/mês (1.000 eventos), Pro R$173,47 (4.000), Ultimate R$297,97 (12.000); 1 lead = 1 evento. Ao estourar, a automação **pausa** e os dados ficam retidos até upgrade. Operações com alto investimento em mídia devem preferir margem de eventos. Como a monetização do CRM é negociada fora do app, esse custo do cliente precisa estar explícito na proposta — dimensionamento em [pluga.md](docs/pesquisa/pluga.md#custo-da-pluga-para-o-cliente-dimensionamento).

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

### 5.2 Landing pages (webhook servidor-servidor)

```
POST /v1/integrations/webhooks/leads
Authorization: Bearer <secret_por_workspace>
```

Mesma camada de normalização (`LeadSourceConnector`); origem `LANDING_PAGE`. A chamada é exclusivamente servidor-servidor: segredo nunca fica no navegador. LP e Pluga usam as mesmas chaves de dados, mas endpoint/token separados preservam autenticação e origem.

A tela de Integrações entrega **receitas por plataforma** para o dev da LP — snippet PHP para WordPress (que é backend PHP, com hook em Contact Form 7, WPForms e Elementor Forms), webhook nativo para builders modernos, e exemplo server-side/serverless para stack própria.

### 5.3 Endpoint canônico Pluga

```
POST /v1/integrations/pluga/leads
Authorization: Bearer <token_por_integration_connection>
Content-Type: application/json
```

- Workspace identificado **pelo token** — nunca aceitar `workspace_id` livre no JSON
- Persistir `IntegrationEvent`/outbox e responder **200** sem depender do Redis
- Idempotência: `UNIQUE(workspace_id, source, external_lead_id)`
- Persistir evento bruto antes de processar (`integration_events`)
- Dispatcher independente publica no BullMQ com `jobId` determinístico

Camada de conectores (desacoplar domínio da Pluga):

```
PlugaV1Connector · LandingPageV1Connector
→ InboundLead → NormalizedLead → domínio (identidade, revisão, funil)
```

Evolução futura: `MetaDirectConnector`, `GoogleDirectConnector`, `CsvImportConnector` — [sintese-manual § Caminho de evolução](docs/pesquisa/sintese-manual.md)

### 5.4 Deduplicação

| Cenário | Comportamento |
|---------|---------------|
| Retransmissão Pluga (mesmo `external_lead_id`) | Atualiza envio; **não** cria segunda oportunidade |
| Nova submissão, identificação confiável do mesmo financiamento | Associa à Oportunidade existente e registra reentrada |
| Mesma Pessoa/tipo, sem prova do mesmo financiamento | Cria a Oportunidade **e** liga à semelhante como **possível duplicado** |
| Identificadores apontam para Pessoas diferentes | Cria Pessoa nova + Oportunidade, marca **revisão de identidade**; telefone não decide |
| Gestor confirma financiamento distinto | Desfaz a ligação; as duas Oportunidades seguem independentes |
| Gestor confirma o mesmo financiamento | Mescla sem excluir; a mais nova aponta para a canônica e vira reentrada |
| Gestor confirma inválido/spam | Arquiva com motivo, sem apagar o envio |

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
| Funis | Tipos `comercial` e `juridico`; etapas editáveis com entrada e conclusão; um comercial padrão por workspace; independentes do financiamento |
| Pendências | Revisão de identidade e possível duplicado como marcador na tela de Leads; só quarentena vive em Integrações |
| Kanban | Atividade-first; detecção de estagnação; SLA desde `chegou_em` |
| Atribuição | Comercial e jurídica separadas; gestor atribui |
| Documentos | Solicitação, proposta rastreável, contrato |
| Perdas | Motivo de perda obrigatório |
| Dashboard | Canal, formulário, tempo até 1º contato, taxa assinatura, conversão |
| Permissões | ~~OWNER · ADMIN · MANAGER · ATTENDANT · VIEWER~~ — **superado pelo [ADR-0015](docs/adr/0015-perfis-de-acesso-e-escopo.md)**: Atendente · Supervisor · Gestão · Direção, com escopo por tela; tags de filial/time nos membros definem o time do Supervisor |
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
 │    └── IntegrationEvent/outbox (payload_json, status, dispatch_status, attempts)
 ├── Funis[] (tipo: comercial|juridico, etapas[])
 ├── Integrações (Pluga, LP, WhatsMiau, Clicksign, DocuSign, LLM/OpenRouter)
 ├── Pessoa (CPF?, telefones[], emails[], merged_into_person_id?)
 ├── EnvioLead (external_lead_id, source, raw, received_at)
 │    └── RevisãoIngestão? (conflito_identidade|possível_duplicado, resolução, motivo)
 └── Oportunidade
      ├── area: comercial | juridica
      ├── financing_type?, financial_institution?, installment_amount?
      ├── stage_id, assigned_user_id, merged_into_opportunity_id?
      ├── tags[]?                       ← opcional (filial/carteira)
      ├── origem_comercial_id?  ← handoff
      ├── score_cabimento?
      ├── atividades, docs, propostas, envelopes
      └── status, chegou_em
```

Isolamento: `workspace_id` em todas as tabelas de negócio; RLS no PostgreSQL.  
Organização interna do grupo: **um workspace** + funis operacionais + **tags** (filial/time); tipo de financiamento não organiza o tenant — ver [ADR-0002](docs/adr/0002-workspace-tags-times.md).

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
2. Template WA + SLA + funil comercial configurado operando
3. Contrato assinado (Clicksign ou DocuSign) reflete no Kanban
4. Handoff confirmado pelo gestor gera/atualiza card jurídico **sem duplicar**
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
9. Nenhum conflito de identidade ou financiamento é resolvido por atalho destrutivo

---

*Escopo de pesquisa e produto: **fechado**. Stack técnica: **travada** ([stack-recomendada.md](./stack-recomendada.md)). Próximo passo: spec de implementação / issues em `.scratch/`.*
