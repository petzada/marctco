# Plano de construção — MVP

> Ordem canônica de construção. **Supersede `sintese-final.md` §13**, que desconhecia Agenda, Atividade, Equipe, Contratos, Documentos, Analytics, Ranking, Metas, alerta de SLA (Q10), resumo LLM do handoff (Q12), tabela paginada vs Kanban e tags.
> Travado em 2026-08-04. Os ADRs referenciam estas fases pelo número.

---

## As 8 fases

| Fase | Entrega | ADRs relevantes |
|---|---|---|
| **0 · Fundação** | Monorepo, Prisma, Supabase, RLS, Workspace, `workspace_members` + roles, `workspace_flags`, auth, Pipeline + Stage **seedados** | [0006](./adr/0006-rls-duas-camadas-guc-worker.md) · [0010](./adr/0010-migrations-e-ci-cd.md) · [0011](./adr/0011-monorepo-pnpm-e-dominio-puro.md) |
| **1 · Ingestão** ⬅ *fatia vertical* | `IntegrationConnection` + token → `POST` Pluga → 202 → `IntegrationEvent` → BullMQ → worker → Person + Opportunity → **lista de Leads (tabela paginada)** + prova de RLS. Webhook LP e tela Integrações > Pluga colam aqui | [0007](./adr/0007-ingestao-idempotencia.md) · [0008](./adr/0008-fronteira-conector-dominio.md) |
| **2 · Operação do lead** | Atribuição (`assigned_user_id`) + tela **Equipe** + **Tags** + card do Lead (formulário estruturado editável) + **Kanban "Meus leads"** + motivo de perda + `amount` opcional | [0002](./adr/0002-workspace-tags-times.md) · [0009](./adr/0009-etapas-editaveis-papeis-e-status.md) |
| **3 · Tempo** | **Activity** (`due_at`, tipo, responsável) + SLA desde `arrived_at` + estagnação + **Agenda** + alerta ao gestor + **Dashboard operacional** | — |
| **4 · Canal** | WhatsMiau + template de 1º contato + timeline no card | [0003](./adr/0003-whatsapp-instancia-unica-gatilho-atribuicao.md) |
| **5 · Papel** | Docs/proposta no card + upload R2 + Clicksign/DocuSign + eventos no funil + vistas globais **Contratos** e **Documentos** | — |
| **6 · Jurídico** | Handoff idempotente + funil jurídico + notas/tags + **resumo LLM** (`resumo_handoff_llm`) | [0004](./adr/0004-fronteira-flag-configuracao-estado.md) |
| **7 · Números** | Análise de cliente/score (`score_cabimento_llm`) + Analytics > Operação + Ranking + **Metas** | — |

### Divergências deliberadas contra `sintese-final.md` §13

1. **SLA descolado do WhatsMiau.** §13 #4 os empacotava; SLA é `arrived_at` + configuração + estado derivado, e não pode ficar refém de uma integração externa com pareamento por QR.
2. **`Activity` virou fase própria.** §13 nem a nomeia, mas Agenda, alerta de SLA, "Kanban atividade-first" e Dashboard operacional dependem dela. É a keystone escondida do MVP.
3. **A fatia termina em tabela, não em Kanban.** `decisao-features-concorrentes.md` §4: a lista geral *é* tabela paginada. Isso tira dnd-kit da Fase 1 inteira.
4. **Atribuição antes de Kanban.** "Meus leads" é filtro por responsável; sem `assigned_user_id` e sem Equipe, não há o que filtrar.
5. **Contratos e Documentos globais não são módulos** — são vistas sobre dados que a Fase 5 já escreveu (princípio D5: fonte de verdade no Lead).
6. **WhatsMiau desceu para a Fase 4**, por dependência dura da atribuição ([ADR-0003](./adr/0003-whatsapp-instancia-unica-gatilho-atribuicao.md)).
7. **Pipeline/Stage: seed na Fase 0, editor depois.** O schema aguenta edição desde o início; a UI do editor pode esperar.

**Configurações e Workspace não são entregas** — são gavetas que enchem a cada fase (integrações na 1, SLA na 3, template WA na 4, editor de funis, flags). Tratá-las como item de backlog produz uma tela vazia esperando conteúdo.

---

## Analytics no MVP (resolve o conflito C1)

`decisoes.md` #19, `stack-recomendada.md` §1/§8 e `sintese-final.md` §11 diziam "analytics fora do MVP"; `decisao-features-concorrentes.md` Q7/§5/§8 trazia Analytics + Ranking + Metas para dentro. **Eram duas coisas com o mesmo nome:**

- **Telemetria de produto** (PostHog, Amplitude, Himetrica) — instrumentar o CRM para a marctco saber como os clientes o usam. **Permanece FORA do MVP.**
- **Módulo Analytics** — relatório operacional que o cliente compra. **Entra no MVP**, quebrado em quatro:

| Peça | Fase | Natureza |
|---|---|---|
| Dashboard operacional | 3 | Gargalos do dia: SLA, parados, handoffs |
| Analytics > Operação | 7 | Derivado — só faz sentido com dado real no funil |
| Ranking | 7 | Derivado; mesma base, outra agregação |
| **Metas** | 7, por último | **Único write model novo do bloco.** Se algo do MVP cair por prazo, é esta |

---

## Itens registrados como abertos

Decisões conscientemente adiadas durante a grelha. Nenhuma bloqueia a fatia vertical.

| # | Item | Quando |
|---|---|---|
| A1 | **Tag em oportunidade: digitada à mão ou herdada do responsável?** Se herdada, é derivada e não deve ser armazenada — muda o schema. Inclui rediscutir se tag em oportunidade deve mesmo existir | Fase 2 |
| A2 | **UX de duas oportunidades abertas da mesma pessoa.** Mais comum em revisional do que os docs supõem. `banco` é o discriminador natural e já chega do formulário Ads. Detalhado em [ADR-0007](./adr/0007-ingestao-idempotencia.md) §Consequência de UX | Fase 2 |
| A3 | **Como a UI chama o card do funil jurídico.** "Lead" é o rótulo do funil comercial e não se aplica lá | Fase 6 |
| A4 | **Flags por módulo para packaging comercial.** Deliberadamente não pré-populadas ([ADR-0004](./adr/0004-fronteira-flag-configuracao-estado.md)); entram quando existir um segundo nível de preço real | Quando houver packaging |
| A5 | **Verificar se o WhatsMiau é gateway não-oficial.** Se for API oficial da Meta, o argumento de ban perde força e `ON_ARRIVAL` volta a ser default defensável | Antes da Fase 4 |
| A6 | **Verificar o que o plano free do Supabase garante de backup.** Sem staging, o backup é a única rede sob migration em produção; PITR é add-on pago | Antes da Fase 0 |
| A7 | **Confirmar `prisma migrate diff` e a mecânica de `SET LOCAL` dentro de `$transaction`**, além de `pgbouncer=true` para prepared statements em transaction-mode pooling | Antes da Fase 0 |
| A8 | **Confirmar se a Pluga registra 409 como sucesso ou falha.** Não muda a decisão (202 sempre), mas confirma o argumento | Antes da Fase 1 |
| A9 | **Turborepo.** Adotar quando o build de deploy do Railway incomodar; `turbo prune` é o ganho ([ADR-0011](./adr/0011-monorepo-pnpm-e-dominio-puro.md)) | Quando doer |
| A10 | **Lacunas do `DESIGN.md`**: sem paleta de dataviz (bloqueia Analytics, Fase 7), sem tokens de motion, densidade em uma altura só, e o arquivo de tokens referenciado por `{token.refs}` não existe. A Fase 1 toca UI só na tabela de Leads, que o design system já cobre | Fase 1 (tokens) · Fase 7 (dataviz) |
