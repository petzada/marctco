# Síntese de produto — CRM de vendas para revisional

> Espelho enxuto — **fonte de verdade:** [sintese-final.md](../../sintese-final.md)  
> Decisões: [decisoes.md](./decisoes.md) · Pluga: [pluga.md](./pluga.md) · Manual: [sintese-manual.md](./sintese-manual.md)  
> Escopo fechado ago/2026.

---

## 1. Decisões (resumo)

| Tema | Escolha |
|------|---------|
| Comercial | Funil até Ganho / “Necessário jurídico” |
| Jurídico | Funil separado orquestrado (handoff sem duplicar) |
| Ads | Pluga (Meta + Google Lead Form) |
| LP | Webhook genérico |
| Funis produto | Separados + editáveis |
| SLA | Desde **chegada no CRM** |
| 1º contato | Template fixo WhatsMiau (sem LLM) |
| Score | LLM **opcional** (DeepSeek V4 / Gemini Flash via OpenRouter) na tela Análise |
| WhatsApp | WhatsMiau; sem inbox; sem calling |
| Assinatura | Clicksign **e** DocuSign (cliente escolhe) |
| Monetização | `workspace_flags` no código; preço fora |
| Organização | 1 workspace/grupo; **tags** filial/time; funis por produto |
| Stack | Travada — [stack-recomendada.md](../../stack-recomendada.md) |
| Trial | 30 dias, liberação manual |

---

## 2. Tese

CRM para assessoria de revisional: captura (Pluga/LP) → aquecimento WA → funil comercial por produto → assinatura → **handoff para funil jurídico** com histórico intacto. Score por IA é ferramenta opcional do closer, não gargalo do funil.

---

## 3. Fluxo canônico

```
Meta / Google (Pluga)  ─┐
LP (webhook genérico)  ─┴─► Normalização CRM
                              │
                    Template fixo WhatsMiau (opcional)
                              │
                    Atribuição + SLA (chegou_em)
                              │
                    Funil COMERCIAL (por produto, editável)
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
         Docs/proposta   [Opcional]      Assinatura
                         Análise LLM     Clicksign|
                         score           DocuSign
                              │
                    Ganho  ou  Necessário jurídico
                              │
                    Funil JURÍDICO (1 card / handoff)
                    + resumo comercial + docs
                              │
                    Gestor jurídico atribui
```

### Orquestração comercial → jurídico
- Gatilho: status `ganho` ou etapa `necessario_juridico`.
- Reutiliza **mesma Pessoa**; cria **uma** oportunidade jurídica por origem comercial (idempotente).
- Payload: dados normalizados + links de docs/contrato + resumo do atendimento comercial.
- Se funil jurídico não existir: não duplica; notifica admin.
- Detalhe das regras: [decisoes.md](./decisoes.md).

### Análise de cliente (score opcional)
1. Abre tela → seleciona lead (pré-fill do form Ads/LP).  
2. Completa faltantes → envia payload via OpenRouter (DeepSeek V4 / Gemini Flash).  
3. LLM devolve score + justificativa.  
4. Uso 100% voluntário.

---

## 4. Captação

- **Pluga:** ver [pluga.md](./pluga.md) — tela = URL, secret, teste, logs, sync.  
- **LP:** `POST /v1/integrations/webhooks/leads`.  
- **Normalização:** CRM é fonte de verdade; retransmissão Ads não duplica deal; novo negócio do mesmo CPF em outra data = nova oportunidade.

---

## 5. WhatsApp (WhatsMiau)

- Instância por workspace, `sendText` / mídia, webhooks → timeline no card.  
- Template de 1º contato configurável.  
- **Sem** inbox UI no MVP.  
- **Sem** ligação nativa (atendente usa app/telefone). VoIP = depois; riscos em [decisoes.md](./decisoes.md).

---

## 6. Assinatura

Adaptador dual: workspace conecta Clicksign e/ou DocuSign.  
Eventos: enviado → visualizou → assinou → recusou → completo → atualiza Kanban.

---

## 7. Núcleo de produto

- Funis por produto + funil jurídico (flags).  
- Kanban atividade-first + estagnação (SLA desde `chegou_em` / etapa).  
- Atribuição comercial e jurídica separadas.  
- Docs, proposta rastreável, motivo de perda.  
- Dashboard comercial (canal, form, tempo 1º contato, assinatura).  
- Feature flags (`workspace_flags`) por módulo/workspace.

---

## 8. Modelo de dados

```
Workspace (flags, trial, timezone America/Sao_Paulo)
 ├── WorkspaceMembers (role, tags[])
 ├── Funis[] (tipo: comercial|juridico, produto?, etapas[])
 ├── Integrações (Pluga, LP webhook, WhatsMiau, Clicksign, DocuSign, OpenRouter/LLM)
 ├── Pessoa
 └── Oportunidade
      ├── area: comercial | juridica
      ├── origem_comercial_id?   ← handoff
      ├── tags[]?
      ├── score_cabimento?
      ├── atividades, docs, propostas, envelopes
      └── status
```

Organização: um workspace = grupo/empresa mãe; filiais/times = tags — [ADR-0002](../adr/0002-workspace-tags-times.md).

---

## 9. Prioridade de construção

| # | Entrega |
|---|---------|
| 1 | Workspace, tags, flags, funis editáveis (comercial por produto + jurídico) |
| 2 | Pluga + webhook LP + normalização |
| 3 | WhatsMiau + template 1º contato + SLA + atribuição comercial |
| 4 | Kanban comercial + docs + proposta |
| 5 | Assinatura Clicksign + DocuSign + eventos |
| 6 | Handoff → funil jurídico (idempotente + resumo) |
| 7 | Tela Análise de cliente + LLM score (OpenRouter) |
| 8 | Dashboard comercial |
| 9 | Pós: inbox WA · VoIP · Himetrica |

---

## 10. Princípios

1. Comercial alimenta jurídico — nunca o contrário no piloto.  
2. Uma pessoa, N oportunidades; um handoff, um card jurídico.  
3. Pluga para Ads; LP por webhook.  
4. Score e LLM não bloqueiam venda.  
5. Template segura o lead; humano fecha.  
6. Assinatura com eventos no funil.  
7. Módulos por flag; preço fora do app.  

---

## 11. Sucesso do piloto (30 dias)

1. Leads Ads/LP no CRM.  
2. Template WA + SLA + funil comercial por produto.  
3. Contrato assinado (Clicksign ou DocuSign).  
4. Ganho gera card no funil jurídico sem duplicar.  
5. (Opcional) Análise LLM usada pelo time em alguns leads.  

Escopo de pesquisa/síntese: **fechado**. Stack: **travada** ([stack-recomendada.md](../../stack-recomendada.md)).  
**Guia único:** [sintese-final.md](../../sintese-final.md)
