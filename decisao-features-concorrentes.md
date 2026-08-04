# Decisão: features a partir do concorrente (Wolf)

> Fonte de verdade para o que trazer da sidebar do CRM do cliente piloto (Wolf).  
> Validado contra [sintese-final.md](./sintese-final.md) e [docs/pesquisa/decisoes.md](./docs/pesquisa/decisoes.md).  
> Status: **fechado** (ago/2026) — decisões do decisor consolidadas; sem perguntas abertas.  
> Rascunhos de análise por agentes foram absorvidos aqui e removidos para evitar divergência.  
> Espelhar reaberturas em `decisoes.md` / `sintese-final.md` = rodada documental separada (opcional).

---

## 1. Mapa Wolf → marctco (sidebar do concorrente)

| Tela Wolf | Destino no marctco | Fase |
|-----------|-------------------|------|
| Dashboard | Dashboard operacional (gargalos, SLA, parados, handoffs) | MVP |
| Leads | Leads — tabela geral + Meus leads (Kanban/tabela); card no atribuído | MVP |
| Agendamentos | Agenda (vista de atividades no Lead) | MVP |
| Consultores | Equipe (roles + tags + atribuição) | MVP |
| Colaboradores | Equipe | MVP |
| Equipe Jurídica | Equipe + Funil jurídico (operação) | MVP |
| Análise de Consultores | Analytics → Ranking / Operação | MVP |
| Propostas | No card do Lead (rastreável); sem item próprio na sidebar | MVP |
| Análise de Propostas | Analytics → Operação | MVP |
| Contratos | Contratos (vista global âncora no Lead) + card | MVP |
| Análise de Contratos | Analytics → Operação (+ taxa no Dashboard) | MVP |
| Vendas | Ganhos/contagens em Analytics + valor opcional no funil; sem módulo financeiro | MVP |
| Performance Gestores | Analytics → Operação (filtros por tag/gestão) | MVP |
| Ranking | Analytics → Ranking | MVP |
| Metas | Analytics → Metas | MVP |
| Perfil da Empresa | Workspace | MVP |
| Configurações | Configurações (integrações, funis, SLA, flags, template WA) | MVP |
| Treinamento | Fora do app; pós = Academy/playbooks | Fora / Pós |

**Capacidades marctco que o Wolf não nomeia na sidebar e permanecem obrigatórias:** Pluga/webhook LP, WhatsMiau na timeline, handoff idempotente, Análise de cliente (score), resumo LLM no handoff, feature flags.

---

## 2. Princípios travados

| # | Decisão |
|---|---------|
| D1 | UX por fluxo de trabalho (“fechar um contrato”), não por departamento |
| D2 | Sem N telas “Análise de X”; um módulo **Analytics** com seções (operação, Ranking, Metas). Dashboard operacional ≠ Analytics |
| D3 | Consultores + Colaboradores + cadastro jurídico → **Equipe** (roles + tags) |
| D4 | Pluga/webhook, WhatsMiau na timeline, handoff idempotente, score + resumo handoff, feature flags |
| D5 | Fonte de verdade na **oportunidade/Lead**: contrato, documento, atividade e valor não duplicam em telas globais — globais são vistas que vinculam Lead |

---

## 3. Decisões do decisor (completas)

> Origem: grilagem de duas análises de agentes + respostas do decisor. Hipóteses divergentes não prevalecem sobre esta tabela.

| Q | Decisão | Fase |
|---|---------|------|
| **Q1** | UI: **Leads**. Domínio: Pessoa + Oportunidade + EnvioLead | MVP |
| **Q2** | Lista geral em **tabela paginada** (alto volume). Lead **atribuído**: card com form Ads/LP, WA, atividades, proposta, contrato, score, resumo no handoff. Campos revisional = form + **formulário estruturado editável** para correção | MVP |
| **Q3** | Contrato/assinatura pode ser gerado fora do card; obriga **buscar/selecionar Lead**; pré-preenche; sem órfão/duplicidade | MVP |
| **Q4** | **Calendário interno** sem sync externo. Atividade com `due_at` no Lead = fonte; Agenda = vista filtrável; criar pela Agenda exige Lead | MVP |
| **Q5** | **Ranking** (produto): placar de atendentes — atendimentos, fechamentos, valores, aderência ao SLA. Gestor usa para gargalo, premiação e cobrança. Sem XP/medalhas | MVP |
| **Q6** | **Metas** (produto): gestor define faturamento, atendimentos ou métricas viáveis revisional (sem OKR/cascata). Filtros: período, atendente, funil/produto; comercial e jurídico | MVP |
| **Q7** | Analytics com filtros no MVP (reabre “analytics in-app fora” em `decisoes.md`) | MVP |
| **Q8** | Jurídico **enxuto**: Kanban + handoff + **notas/tags** para andamento leve. Sem prazos/audiências/intimações (ADVBOX) | MVP |
| **Q9** | Treinamento fora do app no MVP; **pós**: Academy/playbooks | Fora / Pós |
| **Q10** | Alerta ao gestor quando lead parado além do **SLA configurável** do workspace. Demais automações = pós. Sem UI Zapier | MVP |
| **Q11** | Contagem de ganhos por atendente / gestor / equipe (tag) / produto. **Valor** opcional, editável manualmente no funil por produto (ex. pós-contrato). Sem financeiro/ROAS/comissões | MVP |
| **Q12** | Score cabimento + **resumo LLM** estruturado no handoff para o jurídico. Flag `resumo_handoff_llm`. Handoff não bloqueia se LLM falhar | MVP |
| **Q13** | Menu **Documentos**: consulta rápida; mesmo registro do Lead — sem cópia desconexa | MVP |
| **Q14** | Sidebar por fluxo; análises centralizadas em Analytics | MVP |
| **Q-KANBAN** | Ver §4 (vistas por contexto) | MVP |
| **Q-NAV** | Ranking e Metas = **abas/seções dentro de Analytics** (não itens soltos de “Análise de X”) | MVP |

---

## 4. Vistas de Leads (Q2 + Q-KANBAN + T1)

Dois contextos, mesmo dataset (Oportunidade):

| Contexto | Vista principal | Vista alternada |
|----------|-----------------|-----------------|
| **Todos os leads** (gestor / fila geral / alto volume) | Tabela **paginada** | — (Kanban global não é o padrão) |
| **Meus leads** (atendente, só atribuídos a ele) | **Kanban** | Tabela paginada |

Card estruturado (Q2) aplica-se ao lead atribuído ao abrir o detalhe, independentemente da vista (Kanban ou tabela).

Funil jurídico: Kanban próprio (Q8), independente da vista comercial.

---

## 5. Analytics (Q7 + Q5 + Q6 + Q-NAV + T2)

**Um item na sidebar: Analytics.** Dentro, seções/abas de produto:

```
Analytics
├── Operação          ← desempenho comercial/jurídico (filtros: período, atendente, tag, canal, produto…)
├── Ranking           ← placar de atendentes (métricas Q5); apoio a premiação/cobrança
└── Metas             ← configuração de metas (Q6) + analytics próprios de progresso das metas
                        (separados dos gráficos gerais de Operação)
```

- **Ranking** e **Metas** são produtos (capacidade + UX própria).  
- **Não** voltam como telas “Análise de Consultores / de Propostas / …” do Wolf.  
- Dashboard continua **operacional** (gargalos do dia: SLA, parados, handoffs pendentes) — distinto de Analytics.

---

## 6. Agenda (Q4)

1. Atividade (`due_at` + Lead + responsável + tipo) = fonte de verdade.  
2. Agenda = calendário dia/semana filtrável (eu / equipe / tag / funil).  
3. Criar na Agenda exige selecionar Lead.  
4. Criar no card aparece na Agenda.  
5. Sem eventos órfãos; sem Google/Outlook no MVP.  
6. Alerta Q10 (parado > SLA) usa a mesma lógica de estagnação/SLA do workspace.

---

## 7. Contratos, Documentos, Valor

| Superfície | Regra |
|------------|--------|
| Contratos | Ações/lista global; criar/enviar exige Lead; registro na oportunidade |
| Documentos | Menu de consulta; arquivo pertence a Pessoa/Oportunidade |
| Valor | Opcional na oportunidade; alimenta Ranking/Metas/Analytics quando preenchido |

---

## 8. Sidebar MVP final

```
Dashboard
Leads                     ← tabela geral; “Meus leads” = Kanban (+ tabela)
Funil jurídico            ← Kanban + handoff + notas/tags
Agenda
Contratos
Documentos
Analytics                 ← Operação | Ranking | Metas
Análise de cliente        ← score LLM (flag)
Equipe
Workspace
Configurações             ← integrações, funis, SLA, flags, template WA
```

**Fora da sidebar no MVP:** Treinamento/Academy · Performance Gestores / Análise de X soltas · Financeiro · Automações UI · Sync calendário externo.

**Pós (registrado):** Academy/playbooks · mais automações · Himetrica (BI externo, se ainda fizer sentido) · sync calendário · Kanban global de todos os leads (se demandado).

---

## 9. Jurídico (Q8)

- Handoff idempotente comercial → jurídico.  
- Card com docs + **resumo LLM** (Q12).  
- Gestor atribui atendente.  
- Andamento leve via **notas e tags** (não timeline processual, não prazos judiciais).  
- ADVBOX (intimações, audiências, controladoria) = **fora**.

---

## 10. Resumo handoff LLM (Q12)

**Entrada:** origem → pessoa/produto → trajetória comercial → tratativas/WA → propostas/contrato/score/status.  
**Saída:** seções fixas no card jurídico; regenerável; falha da LLM não bloqueia o handoff.  
Flags: `score_cabimento_llm`, `resumo_handoff_llm`.

---

## 11. Descartes mantidos

Inbox omnichannel · IA além de score+resumo · UI de fluxos Zapier · ADVBOX · ERP financeiro/ROAS/comissões · Billing in-app · OAuth Ads nativo · Academy no MVP · Gamificação XP/medalhas · Sync Google/Outlook

---

## 12. Checagem de inconsistências

| Tema | Avaliação |
|------|-----------|
| Lista geral paginada vs Kanban do atendente | **Coerente** — contextos diferentes (§4) |
| Ranking/Metas “como produto” vs Analytics único | **Coerente** — produto = seções dentro de Analytics (§5); T2 resolvido |
| Q8 “A” + notas/tags | **Coerente** — enxuto com andamento leve mínimo; não é ADVBOX nem log processual completo |
| Ranking usa “valores” + valor opcional (Q11) | **Aceito** — Ranking/Metas devem tolerar valor vazio (exibir “—” / excluir de médias de ticket ou documentar regra na spec de Analytics) |
| Metas de faturamento sem valor preenchido | **Aceito** — meta de faturamento só é mensurável onde valor existir; metas de atendimento/fechamento não dependem de R$ |
| Q10 alerta SLA vs Agenda | **Coerente** — mesma base de estagnação/SLA |
| Q3/Q13/Q4 âncora no Lead | **Coerente** com D5 |
| Reabertura Analytics/Ranking/Metas vs `decisoes.md` antigo | **Não é incoerência interna** deste doc — é delta a espelhar na doc de produto depois |
| “Punições” via Ranking | **Decisão de uso** do gestor (processo humano); produto só expõe métricas — sem workflow de punição no app |

**Nenhuma inconsistência bloqueante.** Objetivo deste documento: **concluído**.

---

## 13. Próximo passo (fora deste arquivo)

Opcional, em rodada própria: atualizar `docs/pesquisa/decisoes.md` e/ou `sintese-final.md` com Analytics no MVP, Ranking/Metas como seções, lista paginada + Kanban do atendente, resumo handoff LLM, Agenda/Contratos/Documentos como vistas, valor opcional, alerta SLA gestor.
)
