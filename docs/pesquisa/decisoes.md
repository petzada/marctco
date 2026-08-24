# Decisões de produto (travadas) — CRM revisional

> Detalhamento das decisões consolidadas em [sintese-final.md](../../sintese-final.md).  
> Stack: [stack-recomendada.md](../../stack-recomendada.md). Alinha [sintese.md](https://github.com/petzada/marctco/blob/docs/arquivo-fases-0-4/docs/pesquisa/sintese.md), [README.md](./README.md), [pluga.md](./pluga.md), [sintese-manual.md](https://github.com/petzada/marctco/blob/docs/arquivo-fases-0-4/docs/pesquisa/sintese-manual.md).  
> Status: **produto + stack fechados** (ago/2026).

> ⚠️ **Documento de degrau 4** ([escada de precedência](../../AGENTS.md#precedência-entre-documentos)). Cede para `decisao-features-concorrentes.md` e para os ADRs. Pontos superados na sessão de 2026-08-04:
>
> | Aqui | Vale hoje |
> |---|---|
> | #19 Analytics fora do MVP | Só **telemetria** (PostHog/Amplitude/Himetrica) fica fora. O **módulo Analytics** do cliente entra — [plano-de-construcao.md](../plano-de-construcao.md#analytics-no-mvp-resolve-o-conflito-c1) |
> | #5b 1º contato disparado na chegada | Default é **na atribuição** — [ADR-0003](../adr/0003-whatsapp-instancia-unica-gatilho-atribuicao.md) |
> | §Handoff "Pessoa única: CPF/telefone" | Pessoa preserva múltiplos contatos; CPF é forte mas opcional; telefone não vence contradição — [ADR-0007](../adr/0007-ingestao-idempotencia.md) |
> | §Handoff gatilhos "etapa/status `ganho` ou `necessario_juridico`" | Ganho/perda são status, mas nenhum estado cria card jurídico por si só; o gestor confirma o handoff — [ADR-0009](../adr/0009-etapas-editaveis-papeis-e-status.md) |
> | #9 flags liberando módulos por packaging | Flag só onde **custa dinheiro ou chama terceiro por uso**; catálogo de três entradas — [ADR-0004](../adr/0004-fronteira-flag-configuracao-estado.md) |
> | #18 tags “opcionalmente em oportunidades” | Tag que define o time vive no **membro**. Tag na oportunidade, se existir, não computa escopo e não se herda — [ADR-0020](../adr/0020-tag-no-membro-define-o-time.md) |
> | #18 “um workspace por grupo” | Workspace é fronteira do **dono**, não uma assessoria; o grupo do mesmo dono cabe num tenant — [ADR-0022](../adr/0022-workspace-e-fronteira-de-captacao.md), [ADR-0030](../adr/0030-workspace-e-fronteira-do-dono.md) |
> | #4/#18 funis por produto | Funis são fluxos Comercial/Jurídico; tipo de financiamento é atributo opcional — [ADR-0009](../adr/0009-etapas-editaveis-papeis-e-status.md) |
> | #12 normalização/deduplicação | Múltiplos contatos por Pessoa; telefone não decide conflito; possível duplicado vira marcador na Oportunidade criada, não retenção — [ADR-0007](../adr/0007-ingestao-idempotencia.md) |
> | #16 “200 + fila” | `IntegrationEvent` é outbox: commit PostgreSQL → 200 → dispatcher/BullMQ — [ADR-0007](../adr/0007-ingestao-idempotencia.md) |
> | Handoff automático por status/etapa | Handoff é ação humana; nunca nasce da ingestão ou de inferência automática — [ADR-0009](../adr/0009-etapas-editaveis-papeis-e-status.md) |

---

## Decisões travadas

| # | Tema | Decisão |
|---|------|---------|
| 1 | Escopo comercial | Fluxo comercial completo até **Ganho** / “enviar ao jurídico”: lead → atribuição → conversão → documento → assinatura → ganho. |
| 2 | WhatsApp | **[WhatsMiau](https://whatsmiau.dev/docs/getting-started)**. Sem inbox nativo no MVP (pós). Mensagens + webhooks → timeline no card. |
| 2b | Ligação voz SDR | **Fora do MVP** — atendente usa app WhatsApp/telefone. VoIP **depois** (sem Meta Cloud API Calling). Ver riscos VoIP abaixo. |
| 3 | Captação | Meta + Google Lead Form via **Pluga HTTP Request**, mapeados para o contrato canônico `v1`; LPs usam webhook servidor-servidor com token próprio e as mesmas chaves. |
| 4 | Funis | Fluxos operacionais 100% editáveis, sempre tipados como **Comercial** ou **Jurídico**. Não pertencem ao tipo de financiamento; todo lead ingerido nasce no Comercial. |
| 5 | SLA 1º contato | Relógio = **chegada no CRM**. |
| 5b | Auto 1º contato | **Template fixo** configurável pelo cliente, disparado na chegada (segurar lead quente). **Sem LLM** nesse disparo no MVP. |
| 6 | Score de cabimento | **IA/LLM opcional** — tela “Análise de cliente”; provedor **OpenRouter** com **DeepSeek V4** (preferencial) ou **Gemini Flash**. Nunca obrigatório. |
| 7 | Assinatura | Adaptador **Clicksign + DocuSign**; cliente escolhe no workspace o que já usa. Fluxo: gerar → enviar → eventos (visualizou / assinou / recusou / completo). |
| 8 | Handoff jurídico | O atendente conclui o atendimento a partir de uma etapa de conclusão, com `WON`/`LOST` e motivo; isso **notifica o gestor in-app**; o gestor libera o envio e o card nasce/atualiza no **funil jurídico**, com dados normalizados + resumo. Nenhum status/etapa dispara sozinho. Uma oportunidade jurídica por handoff. |
| 9 | Monetização | Fora do app (negociado). MVP = módulos no código + **`workspace_flags`** (liberação comercial/técnico). |
| 10 | Trial | **30 dias**, comercial acompanha; contas liberadas manualmente. |
| 11 | ICP | Não travar. Piloto = assessoria comercial/jurídica de redução de parcelas. |
| 12 | Normalização | **CRM = fonte de verdade**. Pessoa preserva múltiplos telefones/e-mails; conflito de identidade e possível duplicado viram marcador na Oportunidade já criada, resolvido depois por mesclagem não destrutiva. Nenhum lead fica retido. |
| 13 | Tela Pluga | URL, secret, contrato `v1`, modelos Meta/Google, teste real de cada automação, logs e última sync. Sem wizard De→Para no CRM: o mapeamento acontece na Pluga. |
| 14 | Backlog WA | Assinatura antes de inbox nativo. |
| 15 | Pluga | Obrigatória para Ads; desenho assume plano pago compatível com HTTP Request. LP = webhook servidor-servidor à parte. |
| 16 | Arquitetura ingestão | Pluga = só entrada (1 evento/lead). `IntegrationEvent` é outbox: commit PostgreSQL → 200 → dispatcher independente → BullMQ. Conta Pluga **por workspace**. Token identifica tenant — sem `workspace_id` no body. |
| 17 | Stack | **Travada** — monólito modular TS: Next.js + worker + Supabase + Prisma + BullMQ/Redis Railway + R2 + OpenRouter. Ver [stack-recomendada.md](../../stack-recomendada.md) · [ADR-0001](../adr/0001-stack-monolito-modular-ts.md) |
| 18 | Organização interna | **Um workspace por grupo** (empresa mãe). Filiais/times = **tags** em membros (e opcionalmente oportunidades). Comercial ≠ jurídico via funis/área/roles — não via workspace. Tipo de financiamento é atributo, não estrutura organizacional. [ADR-0002](../adr/0002-workspace-tags-times.md) *(corpo histórico — vale o header deste arquivo e os [ADR-0020](../adr/0020-tag-no-membro-define-o-time.md) / [ADR-0022](../adr/0022-workspace-e-fronteira-de-captacao.md))* |
| 19 | Analytics | Fora do MVP. Pós: considerar **Himetrica**. |
| 20 | LGPD | MVP = segurança básica (RLS, secrets, HMAC). Sem compliance platform no piloto. |

---

## Score de cabimento (Q6D) — especificação

**Opcional.** Atendente/gestor abre **Análise de cliente**:
1. Seleciona lead/oportunidade (dados do form já pré-preenchidos: parcela, tipo de financiamento etc.).
2. Completa campos faltantes manualmente.
3. Envia requisição normalizada via **OpenRouter** — modelo **DeepSeek V4** (preferencial) ou **Gemini Flash** — com **prompt/escopo fixo** (elegibilidade revisional).
4. Recebe **score + justificativa** no card.
5. Pode ignorar a tela inteira e seguir o funil sem score.

Feature flag: `score_cabimento_llm`.

---

## Handoff comercial → jurídico (Q8C) — orquestração

**Problema do piloto:** jurídico só recebe quem passou pelo comercial. Precisa de handoff limpo.

### Regras anti-duplicação / consistência
| Regra | Comportamento |
|-------|----------------|
| Pessoa única | Jurídico reutiliza a Pessoa já resolvida; múltiplos contatos são preservados e conflitos exigem revisão |
| 1 handoff = 1 card jurídico | Idempotência: `oportunidade_comercial_id` → no máximo uma oportunidade jurídica ativa |
| Retrigger | Se já existe card jurídico aberto para essa origem, **atualiza** resumo (não cria segundo) |
| Ação | Atendente conclui → notificação in-app ao gestor → gestor libera. Ganho, perda ou etapa especial oferecem a ação, mas não criam card jurídico por inferência |
| Pré-condição | Funil jurídico deve existir e estar ativo no workspace; senão, só marca comercial e avisa admin |
| Payload | Dados da pessoa + financiamento quando disponível + docs/links + envelope assinado + **resumo** do funil comercial (etapas, atendente, notas, score se houver) |
| Atribuição | Card jurídico nasce **sem** atendente (ou fila); **gestor jurídico** atribui |
| Visibilidade | Comercial vê status “enviado ao jurídico”; jurídico vê origem comercial (somente leitura do histórico) |

Não é ADVBOX (sem intimações/prazos judiciais no MVP). É **segundo Kanban** orquestrado.

---

## Auto 1º contato (Q5bA)

- Template de texto **editável** no workspace.
- Disparo único (ou com dedupe) quando lead **chega** no CRM.
- Via WhatsMiau `sendText`.
- Sem personalização LLM no MVP.
- Feature flag: `auto_primeiro_contato`.

---

## Assinatura (Q7bC)

- Integração com **as duas** plataformas (adaptador único).
- Workspace escolhe Clicksign e/ou DocuSign (credenciais próprias do cliente).
- Preços/pesquisa: seção abaixo.

### Clicksign
Start ~R$ 39 · Plus ~R$ 59 · Automação ~R$ 85/mês · API + webhooks · [planos](https://www.clicksign.com/planos) · [API](https://developers.clicksign.com/docs/primeiros-passos)

### DocuSign
Web BR ~R$ 45–170/mês · API produção bem mais cara (centenas USD) · [APIs](https://www.docusign.com/pt-br/produtos/apis)

---

## WhatsMiau — calling e VoIP futuro

**Calling WhatsApp nativo:** WhatsMiau **não** inicia ligações ([docs](https://whatsmiau.dev/docs/getting-started)). MVP = app/telefone do atendente.

**VoIP depois (sem Meta Official API) — riscos a antecipar:**
| Risco | Detalhe |
|-------|---------|
| Click-to-call vs gravação | Precisa de provedor (TotalVoice, Zenvia, Twilio, etc.) + compliance de gravação |
| CLI / número | Número de saída diferente do WhatsApp confunde o lead |
| Correlação no CRM | Ligar call_id ↔ oportunidade exige click-to-call a partir do card |
| LGPD / OAB | Gravação e abordagem comercial com regras setoriais |
| Custo | Por minuto + números; escala de SDR encarece rápido |
| Qualidade / NAT | Firewall corporativo, mobile, áudio ruim → abandono |
| Duplo canal | Lead no WA e voz em outro número → histórico fragmentado sem inbox unificado |

---

## Fluxo MVP consolidado

```
Ads (Pluga) / LP (webhook)
 → Normalização CRM
 → Template fixo WhatsMiau (se ligado)
 → Atribuição + SLA (desde chegou_em)
 → Funil COMERCIAL configurado
 → [Opcional] Análise de cliente → LLM → score
 → Docs / proposta / contrato
 → Clicksign | DocuSign (eventos)
 → Gestor confirma handoff no fechamento ou no meio
 → Funil JURÍDICO (card único, dados + resumo comercial)
 → Gestor jurídico atribui
```

---

## Escopo fechado — checklist

- [x] Captação Pluga + LP webhook  
- [x] Funis operacionais Comercial/Jurídico + financiamento como atributo opcional
- [x] WhatsMiau mensagens (sem inbox, sem calling)  
- [x] Template 1º contato fixo  
- [x] Score LLM opcional (tela Análise)  
- [x] Assinatura dual Clicksign/DocuSign  
- [x] Feature flags / trial 30d / preço fora  
- [x] Normalização CRM + reentrada de negócio  

**Fora do MVP (explícito):** inbox WA · Meta Cloud API Calling · VoIP · controladoria/intimações · CAPI Ads · De→Para Pluga no CRM · LLM no 1º contato · analytics in-app · workspace por filial · compliance LGPD completa  
