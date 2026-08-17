# Plano de construção — MVP

> Ordem canônica de construção. **Supersede `sintese-final.md` §13**, que desconhecia Agenda, Atividade, Equipe, Contratos, Documentos, Analytics, Ranking, Metas, alerta de SLA (Q10), resumo LLM do handoff (Q12), tabela paginada vs Kanban e tags.
> Travado em 2026-08-04. Os ADRs referenciam estas fases pelo número.

---

## As 8 fases

| Fase | Entrega | ADRs relevantes |
|---|---|---|
| **0 · Fundação · entregue** | Monorepo, Prisma, Supabase, RLS, Workspace, `workspace_members` + roles, `workspace_flags`, auth, **provisionamento no 1º acesso**, Pipeline + Stage comerciais/jurídicos **seedados** | [0006](./adr/0006-rls-duas-camadas-guc-worker.md) · [0009](./adr/0009-etapas-editaveis-papeis-e-status.md) · [0010](./adr/0010-migrations-e-ci-cd.md) · [0011](./adr/0011-monorepo-pnpm-e-dominio-puro.md) · [0012](./adr/0012-contexto-de-tenant-na-url.md) |
| **1 · Ingestão · entregue** ⬅ *fatia vertical* | Contrato `v1` + `IntegrationConnection` → commit `IntegrationEvent`/outbox → 200 → dispatcher → BullMQ → worker → Person ou revisão → Opportunity comercial → **lista de Leads** + **Pendências de ingestão** + prova de RLS. LP servidor-servidor e tela Integrações colam aqui | [0007](./adr/0007-ingestao-idempotencia.md) · [0008](./adr/0008-fronteira-conector-dominio.md) |
| **2 · Operação do lead · entregue** | Distribuição em dois níveis (Gestão → Supervisor → Atendente): atribuir (fila só a Supervisor **com tag** ou ao próprio ator; 1 a 1 ou em massa, um destino) + reatribuir + filtro por responsável/equipe na tabela + tela **Equipe** (cadastro, tags no cadastro, atrelar, desatrelar, desligar) + escopo do `SUPERVISOR` (time; fila sem dono é Gestão/Direção) + campanha/formulário persistidos na Oportunidade + **Kanban "Meus leads"** (mover etapa em aberto; quadro de quem atende). Tag na oportunidade, campo monetário novo (A10), ganho, perda e motivo ficam para depois. Workspace adicional para `OWNER` já associado = nova marcação da marctco | [0002](./adr/0002-workspace-tags-times.md) · [0013](./adr/0013-fluxo-de-dados-no-app.md) · [0015](./adr/0015-perfis-de-acesso-e-escopo.md) · [0020](./adr/0020-tag-no-membro-define-o-time.md) · [0021](./adr/0021-dois-caminhos-de-nascimento-login-fechado.md) · [0022](./adr/0022-workspace-e-fronteira-de-captacao.md) · [0023](./adr/0023-desligamento-desativa-o-vinculo.md) · [0024](./adr/0024-fila-sem-dono-e-da-gestao.md) · [0025](./adr/0025-destino-da-fila-e-supervisor-ou-ator.md) · [0026](./adr/0026-atribuicao-em-massa.md) |
| **3 · Tempo** | **Activity** (`due_at`, tipo, responsável) + SLA desde `arrived_at` + estagnação + **Agenda** + alerta ao gestor + **Dashboard operacional** | — |
| **4 · Canal** | WhatsMiau + template de 1º contato + timeline no card | [0003](./adr/0003-whatsapp-instancia-unica-gatilho-atribuicao.md) |
| **5 · Papel** | Docs/proposta no card + upload R2 + Clicksign/DocuSign + eventos no funil + vistas globais **Contratos** e **Documentos** | — |
| **6 · Jurídico** | Concluir atendimento (`WON`/`LOST` + motivo de perda) + handoff idempotente + funil jurídico + notas/tags + **resumo LLM** (`resumo_handoff_llm`) | [0004](./adr/0004-fronteira-flag-configuracao-estado.md) · [0009](./adr/0009-etapas-editaveis-papeis-e-status.md) |
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
| A1 | **Fechado:** a tag que define o time de um `SUPERVISOR` vive no membro (`MemberTag`). Tag na oportunidade, se existir, é rótulo operacional digitado à mão — nunca herdada do responsável. **Regra:** com tag = time; sem tag = não reatribui (não herda Gestão). Fila sem dono = Gestão e Direção ([ADR-0024](./adr/0024-fila-sem-dono-e-da-gestao.md)). `MemberTag` e o escopo do Supervisor existem desde a Fase 2 — [ADR-0020](./adr/0020-tag-no-membro-define-o-time.md) · [ADR-0022](./adr/0022-workspace-e-fronteira-de-captacao.md) | Fechado |
| A2 | **Fechado:** conflito de identidade e possível duplicado viram marcador na Oportunidade já criada, visível na própria tela de Leads, com resolução por mesclagem não destrutiva. Nada é retido. A Fase 1 implementa marcador e resolução; Fase 2 entregue: campanha/formulário persistidos e discriminadores visíveis na operação | Fases 1–2 |
| A3 | **Como a UI chama o card do funil jurídico.** "Lead" é o rótulo do funil comercial e não se aplica lá | Fase 6 |
| A4 | **Flags por módulo para packaging comercial.** Deliberadamente não pré-populadas ([ADR-0004](./adr/0004-fronteira-flag-configuracao-estado.md)); entram quando existir um segundo nível de preço real | Quando houver packaging |
| A5 | **Verificar se o WhatsMiau é gateway não-oficial.** Se for API oficial da Meta, o argumento de ban perde força e `ON_ARRIVAL` volta a ser default defensável | Antes da Fase 4 |
| A6 | **Fechado com gatilho:** produção segue **sem rede de backup** enquanto estiver vazia — não há o que perder, e migration ruim se corrige com outra. **Gatilho: o primeiro lead real de cliente em produção.** A partir dele, nenhuma migration nova sem backup restaurável (`pg_dump` no job de release ou PITR pago) — [ADR-0010](./adr/0010-migrations-e-ci-cd.md) §Riscos aceitos | Gatilho declarado |
| A7 | **Reduzido:** com Postgres em Docker local, `migrate dev` e o shadow database resolvem a autoria e o item deixa de ser risco de premissa. Restam quatro confirmações mecânicas: `SET LOCAL` dentro de `$transaction` do Prisma · `pgbouncer=true` para prepared statements em transaction-mode pooling · comportamento de `$transaction` diante de erro capturado, que é o que motiva `ON CONFLICT DO NOTHING` em vez de capturar a violação ([ADR-0007](./adr/0007-ingestao-idempotencia.md)) · o schema `private` não declarado na datasource não aparecer como drift ([ADR-0010](./adr/0010-migrations-e-ci-cd.md) guard 6) | Ticket 01 |
| A8 | **Fechado por irrelevância.** O CRM nunca responde 409, e agora responde 200 — o código universalmente aceito. Como a Pluga trata 409 deixou de importar para qualquer caminho do sistema | Fechado |
| A9 | **Turborepo.** Adotar quando o build de deploy do Railway incomodar; `turbo prune` é o ganho ([ADR-0011](./adr/0011-monorepo-pnpm-e-dominio-puro.md)) | Quando doer |
| A10 | **Qual grandeza monetária a Oportunidade guarda além da parcela.** Estavam em disputa saldo devedor, economia estimada e honorários. **Adiado deliberadamente:** o motivo de criar o campo na Fase 2 era dar a Ranking e Metas o que agregar, e agregar uma coluna cujo significado cada empresa do grupo preenche de um jeito produz número errado com aparência de certo. A grandeza que interessa é **honorários**, e ela deriva da economia estimada — que é saída da análise de cabimento. Decidir junto com ela: enquanto isso, `installment_amount` é o único sinal de tamanho do caso, e nº de contratos fechados (`count` de `WON`) é uma meta que não precisa de coluna nenhuma | Fase 7 |
| A10 | **Endereçado pelo ticket 02**, que cria o arquivo de tokens referenciado por `{token.refs}` e registra as lacunas conhecidas em comentário. Fica aberto só o que a Fase 1 não usa: paleta de dataviz (bloqueia Analytics), tokens de motion e densidade em uma altura só | Ticket 02 · dataviz na Fase 7 |
| A11 | **Fechado:** um funil comercial por workspace com `is_default`, sobrescrevível por `IntegrationConnection.target_pipeline_id`. `FinancingType` nunca participa da escolha — [ADR-0009](./adr/0009-etapas-editaveis-papeis-e-status.md) | Fechado |
| A12 | **Fechado:** o atendente conclui o atendimento a partir de uma etapa `CLOSING`, registrando `WON`/`LOST` com motivo; isso notifica o gestor in-app; o gestor libera o envio ao Jurídico. A etapa `LEGAL_HANDOFF` oferece a saída antecipada — [ADR-0009](./adr/0009-etapas-editaveis-papeis-e-status.md) | Fechado |
| A13 | **Fixtures sintéticas e caminho de upgrade no CI.** Adiados por decisão registrada: ativar quando produção tiver dado real do piloto — [ADR-0010](./adr/0010-migrations-e-ci-cd.md) §Riscos aceitos | Quando houver dado real |
| A14 | **Fechado:** o endpoint responde **200** com corpo `{"status":"accepted"}`, não 202. Duas rodadas de pesquisa não acharam como a Pluga trata código de resposta, e verificar exigiria conta paga. Como 202 só traz pureza semântica e errar significa 100% dos leads aparecendo como falha no painel do cliente, a escolha elimina a dependência em vez de administrá-la — [ADR-0007](./adr/0007-ingestao-idempotencia.md) §Por que 200 e não 202 | Fechado |
| A15 | **Fechado (verificado na conta, 2026-08-04):** o plano **Free não tem** HTTP Request, webhooks, agendador, formatador, roteador nem automatizações premium. O recurso começa no **Basic** e segue em Pro, Ultimate e Enterprise. Piso de entrada do cliente: Basic — [pluga.md](./pesquisa/pluga.md) | Fechado |
| A16 | **Fechado como insumo comercial:** tabela de dimensionamento por volume registrada em [pluga.md](./pesquisa/pluga.md#custo-da-pluga-para-o-cliente-dimensionamento). 1 lead = 1 evento; ao estourar, a automação **pausa** com dados retidos. A monetização do CRM é negociada fora do app pelo time comercial — este item é insumo de proposta, não decisão técnica | Time comercial |
| A17 | **Plano de assinatura não é feature flag.** Quando houver cobrança no app, "este workspace está pago?" é `Subscription`/`plan_expires_at` em model próprio, verificado em runtime, com histórico de pagamento. `WorkspaceFlag` continua significando "capacidade que custa dinheiro por uso, liberada pela marctco" — [ADR-0004](./adr/0004-fronteira-flag-configuracao-estado.md). Responder direito de acesso com flag espalha estado de assinatura numa tabela desenhada para outra coisa, e o retrofit é caro | Quando houver cobrança |
| A19 | **Conexões de banco sob carga.** `async-parallel` pede consultas simultâneas; a regra 5 do [ADR-0006](./adr/0006-rls-duas-camadas-guc-worker.md) pede toda leitura em transação com `SET LOCAL`. Em pooling transaction-mode cada transação prende uma conexão, então quatro consultas paralelas são quatro conexões por render. Com dezenas de usuários simultâneos vira demanda relevante. Saída, se apertar: uma transação por render com as consultas serializadas dentro, trocando conexões por latência. **Medir antes de agir** — [ADR-0013](./adr/0013-fluxo-de-dados-no-app.md) | Quando doer |
| A20 | **Cliente de alto volume estoura a tabela de preços da Pluga.** 1.000 leads/dia = 30.000 eventos/mês, contra 12.000 do plano Ultimate, o teto publicado — cai em Enterprise sob consulta. Neste porte o custo da Pluga vira argumento comercial a favor do conector nativo (A18), não mais um detalhe de onboarding | Insumo comercial |
| A18 | **Conector nativo Meta/Google é pré-requisito de auto-billing.** Cobrança automática pressupõe onboarding sem intervenção; hoje o onboarding exige que o cliente compre plano pago da Pluga (A15), configure um De→Para em ferramenta de terceiro e pague por evento, com a automação pausando ao estourar cota (A16). Ninguém se cadastra sozinho através disso — [sintese-manual.md](./pesquisa/sintese-manual.md) já apontava integração nativa a partir de ~30 clientes. A fronteira do [ADR-0008](./adr/0008-fronteira-conector-dominio.md) é o que torna a troca barata: adapter novo contra o mesmo contrato `v1`, sem tocar domínio, schema ou worker | Antes de vender self-serve |
