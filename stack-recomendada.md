# Stack travada — CRM Revisional (MVP)

> **Fonte de verdade técnica** · travada em **2026-08-04**  
> Produto: [sintese-final.md](./sintese-final.md) · Decisões: [docs/pesquisa/decisoes.md](./docs/pesquisa/decisoes.md)  
> ADRs: [docs/adr/0001-stack-monolito-modular-ts.md](./docs/adr/0001-stack-monolito-modular-ts.md) · [docs/adr/0002-workspace-tags-times.md](./docs/adr/0002-workspace-tags-times.md)  
> Rota: **monólito modular TypeScript** (app Next.js + worker Node no mesmo monorepo).

Status: **travada**. Alternativas rejeitadas (NestJS split, Clerk, Better Auth, Drizzle, Inngest/pg-boss como default, Vercel-only, PostHog no MVP, analytics in-app) **não** devem reaparecer como “opção aberta” nos docs.

> ⚠️ **Pontos refinados na sessão de 2026-08-04.** A stack em si continua travada; o que mudou foi o *como*:
>
> | Aqui | Vale hoje |
> |---|---|
> | §1 e §8 "analytics in-app / analytics produto: fora do MVP" | Refere-se a **telemetria** (PostHog/Amplitude/Himetrica), que segue fora. O **módulo Analytics** do cliente (Operação, Ranking, Metas) entra no MVP — [plano-de-construcao.md](./docs/plano-de-construcao.md#analytics-no-mvp-resolve-o-conflito-c1) |
> | §2 "`service_role` só no servidor (app/worker)" | O **worker roda sob RLS**, com claim por job. `service_role` fica restrito a migrations, ferramenta interna e DLQ — [ADR-0006](./docs/adr/0006-rls-duas-camadas-guc-worker.md) |
> | §1 "Isolamento: RLS por `workspace_id`" | RLS **não encaixa sozinha** com Prisma: policies keiam em GUC `app.workspace_id`, exigem `FORCE ROW LEVEL SECURITY` e papéis separados — [ADR-0006](./docs/adr/0006-rls-duas-camadas-guc-worker.md) |
> | §7 flags por workspace | Flag só onde **custa dinheiro ou chama terceiro por uso**; três entradas no catálogo. Configuração do gestor e estado de dado são outros dois mecanismos — [ADR-0004](./docs/adr/0004-fronteira-flag-configuracao-estado.md) |
> | §9 `@supabase/supabase-js` no cliente | Supabase Auth é **autenticação e só**. O browser nunca acessa o Postgres direto — [ADR-0006](./docs/adr/0006-rls-duas-camadas-guc-worker.md) |
> | §3 “um Workspace (tenant)” / “um workspace por grupo” | Workspace é a fronteira do **dono**. Todo o grupo do mesmo dono cabe num tenant, campanha exclusiva inclusive — ela ganha conexão própria, não workspace. A mesma Direção ainda pode ser dona de vários — [ADR-0030](./docs/adr/0030-workspace-e-fronteira-do-dono.md), [ADR-0031](./docs/adr/0031-conexao-na-chave-idempotente.md) |
> | §3 Tag “aplica-se a membros e, se útil, a oportunidades” | Tag que define o time vive no **membro** e nomeia o **time**, nunca a marca; o time exclui os outros Supervisores. Tag na oportunidade, se existir, não computa escopo e não se herda; fica fora da Fase 2 — [ADR-0020](./docs/adr/0020-tag-no-membro-define-o-time.md), [ADR-0028](./docs/adr/0028-tag-e-o-time-supervisor-nao-alcanca-supervisor.md) |
> | §3 marca/filial como recorte | A empresa do grupo é `Company` + `Tag.company_id`: agrupa equipes **para leitura** e nunca isola dado, decide escopo, roteia lead ou vira coluna da Oportunidade — [ADR-0029](./docs/adr/0029-empresa-e-agrupamento-de-equipe.md) |
> | §1 uma conexão de integração por provedor | Um provedor admite **N conexões** no mesmo workspace, e a conexão entra na chave idempotente do envio — sem isso, duas LPs que numeram por conta própria engolem lead uma da outra — [ADR-0031](./docs/adr/0031-conexao-na-chave-idempotente.md) |
> | §10 item 7 / §11 “tags filtram oportunidades” · “um workspace por grupo cliente” | Time filtra por tag no **membro**. Workspace = fronteira do **dono** — [ADR-0020](./docs/adr/0020-tag-no-membro-define-o-time.md) · [ADR-0022](./docs/adr/0022-workspace-e-fronteira-de-captacao.md) · [ADR-0030](./docs/adr/0030-workspace-e-fronteira-do-dono.md) |

---

## 1. Decisões travadas (tabela)

| Camada | Decisão |
|--------|---------|
| Linguagem | **TypeScript** |
| App / UI | **Next.js** (App Router) |
| Worker | **Node.js separado** (mesmo monorepo) |
| Banco | **PostgreSQL** via **Supabase** |
| Auth | **Supabase Auth** + roles no app (**sem** Clerk / Better Auth) |
| Isolamento | **RLS** por `workspace_id` |
| ORM | **Prisma** |
| Fila | **Redis + BullMQ** (Redis gerenciado no **Railway**, se custo/ops for melhor) |
| Validação | **Zod** (FE + BE compartilhados) |
| UI kit | **Tailwind + shadcn/ui** — na implementação, seguir skill **design-taste-frontend** |
| Kanban DnD | **@dnd-kit** |
| Forms | **React Hook Form** + `@hookform/resolvers` + Zod |
| Data fetching | **TanStack Query** |
| Storage | **Cloudflare R2** |
| E-mail | **Resend** (+ **React Email** para templates) |
| Observabilidade | **Sentry** |
| Analytics produto | **Fora do MVP** · pós-MVP: considerar **Himetrica** |
| Feature flags | Catálogo no código + liberação por workspace (`workspace_flags`); atribuição manual comercial/técnico |
| Deploy app | **Railway** |
| Deploy worker + Redis | **Railway** |
| LLM score | **DeepSeek V4** (preferencial) ou **Gemini Flash**; via **OpenRouter** (ou gateway similar) |
| Idioma UI | **PT-BR only** |
| Timezone | **America/Sao_Paulo** sempre (`date-fns-tz`) |

---

## 2. Arquitetura (monólito modular)

```
Pluga / LP / WhatsMiau / Clicksign / DocuSign / OpenRouter
        │  POST (Bearer / apikey / HMAC)
        ▼
Next.js (Railway)  ──► commit integration_events/outbox ──► 200
                              │
                              ▼
                    dispatcher independente
                              │
                              ▼
                    Redis (Railway) + BullMQ
        │
        ▼
   Worker Node (Railway)
   normaliza → Pessoa/Oportunidade → WA → assinatura → handoff → score (opcional)
        │
        ▼
Supabase Postgres (RLS)     Cloudflare R2 (arquivos)
```

- Webhooks **nunca** processam regra de negócio de forma síncrona: autenticam, persistem a outbox e respondem. O dispatcher enfileira depois.
- Tenant identificado pelo **token** da integração — nunca aceitar `workspace_id` livre no JSON.
- App e worker usam papel PostgreSQL sem bypass e rodam sob RLS. `service_role` fica restrito a ferramenta administrativa interna, nunca ao fluxo normal nem ao browser.

---

## 3. Workspace, funis, financiamento e tags

**Modelo do piloto:** o cliente (dono da consultoria) tem **uma empresa mãe / grupo**. Dentro do grupo há filiais e times comerciais/jurídicos. Tudo isso vive em **um Workspace** (tenant).

| Conceito | Papel no MVP |
|----------|--------------|
| **Workspace** | Tenant do grupo (empresa mãe). Isolamento RLS, Pluga, trial, flags. |
| **Funil** | Fluxo operacional criado pelo cliente, sempre tipado como Comercial ou Jurídico, com etapa de entrada e de conclusão. Um comercial por workspace é o padrão da ingestão. Não pertence ao tipo de financiamento. |
| **Tipo de financiamento** | Veículo, imóvel, empréstimo pessoal ou outro; atributo opcional da Oportunidade, sem bloquear a ingestão. |
| **Área** | Comercial vs jurídica = funis + `area` na oportunidade + roles — **não** workspaces separados. |
| **Tag** | Rótulo livre no workspace para **filial / time / carteira**; aplica-se a membros e, se útil, a oportunidades. Ex.: `Filial Campinas`, `Comercial Veículos`, `Jurídico EP`. |
| **Roles** | ~~OWNER · ADMIN · MANAGER · ATTENDANT · VIEWER~~ — **superado pelo [ADR-0015](./docs/adr/0015-perfis-de-acesso-e-escopo.md)**: quatro perfis, `ATTENDANT · SUPERVISOR · MANAGER · OWNER`. `ADMIN` sobrepunha `MANAGER` sem fronteira e `VIEWER` não tinha consumidor |

**Lógica:** filiais e “times” **não** viram workspaces no MVP (explodiria Pluga, flags e onboarding). Tags + atribuição (`assigned_user_id`) + filtros no Kanban bastam para o dono organizar gestores/atendentes por filial/time. Multi-workspace no SaaS = **várias consultorias clientes**, não filiais do mesmo grupo.

**Supabase Auth + UX multi-workspace:** viável. Membro com 1 workspace entra direto; switcher só se `workspace_members` > 1 (ex.: staff Marctco). Comercial e jurídico compartilham o mesmo workspace.

Detalhe: [ADR-0002](./docs/adr/0002-workspace-tags-times.md) · glossário: [CONTEXT.md](./CONTEXT.md).

---

## 4. Bibliotecas de construção

### Backend / shared

| Lib | Uso |
|-----|-----|
| `zod` | Contrato canônico `v1` de Pluga/LP, WA, assinatura e forms |
| `bullmq` + `ioredis` | Filas; Redis Railway |
| `jose` | Só se necessário (JWT/JWE de integração) |
| `pino` | Logs estruturados no worker/app (se útil) |
| `date-fns` + `date-fns-tz` | Datas/SLA; timezone **Brasil** sempre |
| `@prisma/client` + Prisma | ORM |
| `libphonenumber-js` | Telefone E.164 |
| `cpf-cnpj-validator` ou `brazilian-core` | CPF/CNPJ |
| Zod `.email()` | E-mail + normalização **lowercase** |

### Frontend

| Lib | Uso |
|-----|-----|
| shadcn/ui + Tailwind | UI — **obrigatório** seguir [design-taste-frontend](./.claude/skills/design-taste-frontend/SKILL.md) na implementação |
| `@dnd-kit/core` + `sortable` + `utilities` | Kanban |
| `react-hook-form` + `@hookform/resolvers` + Zod | Forms |
| `@tanstack/react-query` | Fetch/cache — **[ADR-0013](./docs/adr/0013-fluxo-de-dados-no-app.md) supersede seu uso como padrão de leitura**: quem lê é Server Component. Entra na Fase 2, no Kanban e na atualização otimista |
| `nuqs` | Estado de URL (filtros/etapa) — usar se agregar valor sem complexidade |
| `recharts` | Dashboard comercial |
| `lucide-react` | Ícones |

### Produto / integrações

| Peça | Uso |
|------|-----|
| Resend + React Email | Convites / e-mail transacional |
| `@react-pdf/renderer` | PDF gerado no CRM **só onde automatizar fizer sentido** |
| Upload PDF externo → R2 | Preferir quando o doc já existe fora; evita complexidade |
| Textarea + `{{variaveis}}` | Template WhatsApp 1º contato |
| OpenRouter (DeepSeek V4 / Gemini Flash) | Score opcional — **única** exceção “manual” no fluxo (humano dispara na tela Análise) |

---

## 5. Auth, segurança e LGPD (MVP enxuto)

**Auth:** Supabase Auth + roles no app. Sem Clerk / Better Auth.

**Segurança (obrigatório mesmo no MVP de validação):**

- Segredos só em env Railway / Supabase — nunca no repo nem no client
- Tokens de integração: hash em banco; workspace pelo token
- Webhooks Clicksign / DocuSign: validar **HMAC** antes de enfileirar
- RLS em tabelas de negócio; não expor `service_role` no browser
- Rotação de secrets quando vazarem

**LGPD no MVP:** o mínimo absoluto para o piloto fluir — **sem** ROPA, portal de titulares, DPIA tooling ou compliance platform. Coletar só o necessário ao funil; roles limitam quem vê o quê. Endurecer LGPD **depois** da validação do produto. Prioridade agora = segurança de acesso/invasão (webhooks, segredos, RLS).

---

## 6. Integrações

| Integração | Papel |
|------------|--------|
| **Pluga** | Meta + Google Lead Form → De→Para → HTTP Request para o contrato `v1` do CRM (Bearer por conexão) |
| **Webhook LP** | Servidor-servidor, token próprio e o mesmo contrato canônico de dados |
| **WhatsMiau** | Instância por workspace; send + webhooks → timeline (sem inbox) |
| **Clicksign** | Envelope + eventos HMAC |
| **DocuSign** | Envelope + Connect HMAC |
| **LLM score** | DeepSeek V4 (pref.) / Gemini Flash via OpenRouter; flag `score_cabimento_llm` |

Adapters conceituais: `LeadSourceConnector` · `MessagingProvider` · `SignatureProvider` · `ScoreProvider`.

---

## 7. Feature flags

- Flags **definidas no código** (catálogo estável).
- Liberação por workspace em `workspace_flags` (ou equivalente simples).
- Com poucos clientes de consultoria, **comercial/técnico** liga/desliga — sem Flagsmith/LaunchDarkly/Unleash.

---

## 8. Explicitamente fora / rejeitado no MVP

| Item | Motivo |
|------|--------|
| NestJS como API separada no D0 | Rota A: Next + worker no monorepo |
| Clerk / Better Auth | Supabase Auth travado |
| Drizzle | Prisma travado |
| Inngest / Trigger.dev / pg-boss como default | BullMQ + Redis Railway |
| Deploy Vercel-only / Fly / Render como default | Railway (app + worker + Redis) |
| Supabase Storage como storage de docs | Cloudflare R2 |
| PostHog / Amplitude / analytics in-app | Pós-MVP → Himetrica |
| OpenAI/Anthropic como default do score | DeepSeek V4 / Gemini Flash via OpenRouter |
| Kafka, K8s, microserviços, GraphQL federation | Overengineering |
| Inbox WA, VoIP, OAuth Ads nativo, billing in-app | Escopo produto |
| Compliance LGPD completa | Adiado pós-validação |
| Workspace por filial | Tags + funis operacionais no workspace |

---

## 9. Pacotes de bootstrap (referência — não instalar neste passo)

```
next react react-dom typescript
zod
@supabase/supabase-js @supabase/ssr
prisma @prisma/client
bullmq ioredis
@tanstack/react-query
react-hook-form @hookform/resolvers
@dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
tailwindcss lucide-react
libphonenumber-js
cpf-cnpj-validator
date-fns date-fns-tz
@sentry/nextjs
resend @react-email/components
@react-pdf/renderer
# opcional: jose pino nuqs
```

UI: `npx shadcn@latest init` + componentes sob demanda · skill **design-taste-frontend**.

---

## 10. Checklist de validação técnica (quando implementar)

1. Pluga fake → commit da outbox → 200 → dispatcher/BullMQ → Pessoa ou revisão → Oportunidade + UNIQUE idempotente
2. RLS: workspace A não lê B  
3. WhatsMiau sendText + webhook → timeline  
4. Clicksign ou DocuSign sandbox → HMAC → Kanban  
5. Kanban dnd-kit persiste etapa  
6. Flag desliga módulo sem deploy  
7. Tags de time/filial filtram membros/oportunidades  
8. Score via OpenRouter (DeepSeek/Gemini) só na tela Análise  

---

## 11. Veredito

**Monólito modular TS:** Next.js + worker + Prisma + Supabase (Auth/Postgres/RLS) + BullMQ/Redis no Railway + R2 + shadcn/dnd-kit/Zod — com Pluga, WhatsMiau, Clicksign, DocuSign e score DeepSeek/Gemini via OpenRouter. Um workspace por grupo cliente; filiais/times via **tags**; funis operacionais Comercial/Jurídico; tipo de financiamento como atributo opcional.

---

*Qualquer mudança de stack exige atualizar este arquivo, [sintese-final.md §11](./sintese-final.md), [decisoes.md](./docs/pesquisa/decisoes.md) e ADR correspondente.*
