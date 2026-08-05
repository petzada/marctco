# Pluga — Referência de integração Ads → CRM

> Análise da [Pluga](https://pluga.co/) como ponte no-code para o CRM de vendas de **revisional de juros abusivos**.  
> Foco: **Meta Lead Ads** + **Google Lead Form** → webhook/HTTP do CRM.  
> Relatório sintetizado em ago/2026.

> ⚠️ **Documento de degrau 5** ([escada de precedência](../../AGENTS.md#precedência-entre-documentos)): **evidência, nunca autoridade.** Descreve o que a Pluga faz; o que o CRM responde está nos ADRs. Divergências deliberadas:
>
> | Aqui | Vale hoje |
> |---|---|
> | §Respostas HTTP: **409 = duplicata** e **"200/201/202 = aceito"** | O CRM **nunca responde 409** e responde **200 sempre**; só 401 e 400 são síncronos. A tabela abaixo afirmava que a Pluga aceita qualquer 2xx — isso **não se confirmou** em pesquisa e não deve ser usado como base — [ADR-0007](../adr/0007-ingestao-idempotencia.md) |
> | §Tela item 6: "campos obrigatórios (nome + telefone ou CPF)" | **Nenhum campo de negócio é obrigatório no HTTP.** Sem contato vai para quarentena; conflitos/possíveis duplicados vão para revisão; o restante entra no Comercial — [ADR-0007](../adr/0007-ingestao-idempotencia.md) |
> | §Campos mínimos: CPF no formulário | CPF raramente chega. Pessoa preserva múltiplos contatos e qualquer conflito vai para revisão; telefone não vence — [ADR-0007](../adr/0007-ingestao-idempotencia.md) |
> | §Contrato: `Idempotency-Key` no header | Aceito se vier, mas a chave autoritativa é `source` + `external_lead_id` no corpo |
> | Exemplos de payload | O CRM é dono do contrato canônico `v1`; a Pluga faz De→Para via HTTP Request. Não existe “payload universal da Pluga” — [ADR-0008](../adr/0008-fronteira-conector-dominio.md) |
> | LP por POST do navegador | Superado: somente servidor-servidor, com token separado e segredo fora do JavaScript — [ADR-0008](../adr/0008-fronteira-conector-dominio.md) |
>
> §Tela Integrações > Pluga e §Pricing permanecem válidos como referência.

> **Verificação em documentação pública (2026-08-04).** O que foi confirmado com fonte, o que não foi, e o que só se resolve em conta real:
>
> | Item | Situação |
> |---|---|
> | HTTP Request monta o JSON livremente, sem envelope da Pluga | **Confirmado.** Campos "Corpo da requisição (JSON)", "Cabeçalhos (JSON)", "Parâmetros de busca (JSON)"; métodos POST/GET/PUT/PATCH/DELETE — [doc](https://pluga.co/ferramentas/http-request/integracao/) |
> | HTTP Request é **recurso Premium**, exige plano pago | **Confirmado.** Tier mínimo = **Basic**, verificado manualmente na conta (2026-08-04) — ver §Custo abaixo |
> | Campos do gatilho são fixos por ferramenta, independentes do destino | **Confirmado** comparando páginas de integração com destinos diferentes |
> | Campos Meta Lead Ads: lead id, `ad_id`/`ad_name`, `adset_id`/`adset_name`, `campaign_id`/`campaign_name`, `form_id`/`form_name`, `platform`, `is_organic`, data em 3 formatos | **Confirmado.** Base do modelo de mapeamento — [ADR-0008](../adr/0008-fronteira-conector-dominio.md) |
> | Nome, telefone, e-mail e perguntas do formulário Meta | **Não confirmado.** Ausentes da lista pública; provavelmente dinâmicos por formulário, visíveis só com conta conectada. Primeira coisa a verificar no teste de onboarding |
> | Campos Google Lead Form | **Não confiável.** Lista pública truncada (3 itens, sem IDs e sem contato). Nenhum campo Google é presumido |
> | Tratamento de códigos de resposta; retry de 5xx | **Não encontrado em fonte pública**, em duas rodadas de pesquisa. Por isso o CRM responde **200**, não 202 — decisão fechada em [ADR-0007](../adr/0007-ingestao-idempotencia.md), que remove a dependência em vez de testá-la |
> | Preços e limites de evento; ao estourar, automação **pausa** e dados ficam retidos | **Confirmado** — ver §Custo abaixo, com valores verificados na conta |
> | 1 lead = 1 evento | **Confirmado pela definição da Pluga**: evento é "o ato de transferir um dado da Ferramenta A para a B". No desenho do CRM — uma automação, uma ação, um POST — cada lead consome exatamente um |
>
> Nota metodológica: parte da central de ajuda da Pluga bloqueia acesso direto (403), então alguns pontos vieram de snippets de busca. O que não pôde ser confirmado está marcado como tal, sem inferência.

---

## Posicionamento

A Pluga é a iPaaS brasileira no-code (~130+ ferramentas, +10.000 empresas) que conecta o stack local (ERPs, boleto/PIX, WhatsApp, Clicksign) com UX mais simples que Make/n8n e cobrança em R$.

| Vs | Quando a Pluga ganha |
|----|----------------------|
| Zapier | Ferramentas BR, Real, suporte PT/WhatsApp |
| Make / n8n | Velocidade no-code sem curva de fluxo complexo |
| Conector nativo Meta/Google no CRM | Time-to-market: não reinventar OAuth/Lead Ads no MVP |

**Decisão atual:** o CRM não precisa de conector nativo Meta/Google no dia 1. Expõe endpoints autenticados; a Pluga mapeia Ads para o contrato `v1` e LPs usam conexão servidor-servidor separada. Decisões vinculantes: [ADR-0007](../adr/0007-ingestao-idempotencia.md) e [ADR-0008](../adr/0008-fronteira-conector-dominio.md).

**Tela Integrações > Pluga (MVP):** URL do webhook · secret · teste · logs · última sync. **Sem** wizard De→Para no CRM (mapeamento fica na Pluga). UX para usuário não técnico.

---

## Pricing (impacto no cliente do CRM)

Fonte: [pluga.co/precos](https://pluga.co/precos/)

## Custo da Pluga para o cliente (dimensionamento)

**Valores verificados manualmente na conta em 2026-08-04.** Divergem dos que aparecem em leitura automática da página pública (R$89 / R$209 / R$359) — prevalecem os verificados.

| Plano | Mensal | Eventos/mês | Custo por lead | HTTP Request |
|-------|--------|-------------|----------------|--------------|
| Free | R$ 0 | 100 | — | ❌ **não tem** |
| Basic | R$ 73,87 | 1.000 | R$ 0,074 | ✅ |
| Pro | R$ 173,47 | 4.000 | R$ 0,043 | ✅ |
| Ultimate | R$ 297,97 | 12.000 | R$ 0,025 | ✅ |
| Enterprise | sob consulta | >12.000 | — | ✅ |

**O Free não serve para este CRM.** Ele não inclui HTTP Request, webhooks, agendador, formatador, roteador nem automatizações premium. **O piso de entrada do cliente é o Basic** — sem plano pago, não há ingestão de Ads.

**1 lead = 1 evento.** A Pluga define evento como "o ato de transferir um dado da Ferramenta A para a B"; no desenho do CRM (uma automação, uma ação, um POST) cada lead consome exatamente um. Meta e Google em automações separadas não dobram o custo: cada lead passa por uma só.

**Ao estourar a quota, a automação PAUSA** — os dados ficam retidos e são reenviados após upgrade. Não há perda, mas há atraso, e lead de mídia paga esfria. Para operação com investimento relevante em mídia, vale margem de eventos em vez do plano justo.

Trial de 7 dias com recursos Ultimate. Log de eventos: 90 dias.

> **Insumo comercial, não decisão técnica** (item A16). A monetização do CRM é negociada fora do app pelo time comercial. O que precisa estar claro na proposta: este custo é do cliente, é recorrente, o CRM não o controla, e o piso é o Basic. Ver também [sintese-manual.md § Qual plano](./sintese-manual.md).

---

## Meta Ads / Facebook Lead Ads

### O que a Pluga entrega
- Ferramenta: [Facebook Lead Ads](https://pluga.co/ferramentas/facebook-lead-ads/)
- **Somente gatilhos** (não cria campanha/form pela Pluga)
- Gatilho principal: **“A cada resposta em um anúncio” / Nova resposta em um anúncio**
- Destino típico para CRM próprio: [Facebook Lead Ads → Pluga Webhooks](https://pluga.co/ferramentas/facebook-lead-ads/integracao/pluga-webhooks/) (**ação premium**)

### Metadados oficiais disponíveis no mapeamento
| Campo Pluga | Uso no CRM |
|-------------|------------|
| ID do Lead | `external_lead_id` (idempotência) |
| `ad_id`, `ad_name` | Atribuição de criativo |
| `adset_id`, `adset_name` | Atribuição de conjunto |
| `campaign_id`, `campaign_name` | Atribuição de campanha |
| `form_id`, `form_name` | Qual formulário converte |
| `is_organic`, `platform` | fb / ig / orgânico |
| Datas (ISO + BR + US) | SLA / timeline |
| ID do produto clicado | Se aplicável |
| Perguntas do formulário | nome, telefone, e-mail, CPF, banco… (dinâmicos) |

### Configuração
1. Automação → origem Facebook Lead Ads → gatilho  
2. Conta Facebook com **admin da Página**  
3. Selecionar **Página + Formulário** (1 página + 1 form por automação típica)  
4. Destino Webhooks/HTTP → mapear campos  
5. Filtros/Roteador opcionais  

### Limitações reais
| Tema | Realidade |
|------|-----------|
| Tempo real | Marketing “tempo real”; na prática **polling 5 min (pago) / até 15 min (Free/help)** |
| Escopo | N formulários ≈ N automações (ou Roteador depois) |
| Campanha nativa | Sim — Lead Ads in-app, sem landing obrigatória |
| Ações na Meta | Não há |

---

## Google Ads / Google Lead Form

### O que a Pluga entrega de fato
- Ferramenta nativa: **[Google Lead Form](https://pluga.co/ferramentas/google-lead-form/)** — asset de formulário no anúncio Google Ads
- **Não confundir** com Facebook/Google Ads Insights (métricas) — Insights ≠ ingestão de lead
- Destino CRM: [Google Lead Form → Webhooks](https://pluga.co/ferramentas/google-lead-form/integracao/pluga-webhooks/)

### Caminho oficial (Google → Pluga → CRM)
1. Na Pluga: criar automação Google Lead Form → destino; Pluga gera **URL de webhook**  
2. No Google Ads: Lead Form → **Exportar leads** → Webhook → colar URL (+ chave, ex. `Pluga`)  
3. **Enviar dados de teste** no Google Ads (obrigatório)  
4. Mapear campos na Pluga → HTTP do CRM  

Docs: [Google Ads Help – webhook](https://support.google.com/google-ads/answer/16729613?hl=pt) · [PipeRun via Pluga](https://ajuda.crmpiperun.com/integracao-com-o-google-ads-via-pluga)

### Comportamento
- Google faz **HTTP POST imediato** (push) → Pluga  
- Perguntas do form (nome, telefone, CPF custom) vêm no payload e entram no mapeamento  
- Meta e Google ficam **simétricos no CRM** se ambos terminam no mesmo endpoint normalizado  

---

## Primitivas de workflow úteis ao CRM

| Primitiva | Papel Ads → CRM |
|-----------|-----------------|
| **Filtros** | Só segue se tem telefone/CPF; campanha X; produto Y |
| **Roteador** | Meta vs Google; veículo/imóvel/EP; UF → fila |
| **Formatador** | Telefone BR, CPF só dígitos, datas ISO |
| **Delay** | WhatsApp 2–5 min após criar lead |
| **Code** (JS/Python) | Score simples, validação regex |
| **Webhooks (in)** | Google Lead Form e outros forms POST na Pluga |
| **Webhooks (out) / HTTP Request** | **Contrato principal com o CRM** (POST/PUT…) |
| **Kit IA** | Classificar banco/produto; extrair CPF de texto |
| **Multi-action** | CRM + Sheets (auditoria) + Slack + WhatsApp |

Todas exigem plano pago.

---

## Fluxo recomendado

```
Meta Lead Ads ──(polling 5–15 min)──┐
                                    ├──► Pluga
Google Lead Form ─(webhook push)───┘
                                    │
                         Formatador (tel / CPF / data)
                                    │
                         Filtros (mínimos OK?)
                                    │
                    Mapeamento (origem / tipo de financiamento)
                                    │
              ┌─────────────────────┼─────────────────────┐
              ▼                     ▼                     ▼
     HTTP POST → CRM         Sheets (audit)      WhatsApp (Delay)
     /integrations/pluga/leads
```

Sheets é trilha de auditoria — **não** substitui o CRM.

---

## Contrato que o CRM precisa expor

### Endpoint
```
POST https://api.{crm}/v1/integrations/pluga/leads
Authorization: Bearer <secret>   # ou X-Webhook-Secret / HMAC
Content-Type: application/json
Idempotency-Key: {source}:{external_lead_id}
```

### Payload normalizado (sugerido)
```json
{
  "source": "meta_lead_ads | google_lead_form",
  "external_lead_id": "string",
  "form_id": "string",
  "form_name": "string",
  "campaign_id": "string",
  "campaign_name": "string",
  "adset_id": "string",
  "ad_id": "string",
  "platform": "fb | ig | google",
  "name": "string",
  "email": "string",
  "phone_e164": "+5511999999999",
  "cpf": "00000000000",
  "product": "veiculo | imovel | emprestimo_pessoal",
  "bank": "string",
  "consent": true,
  "utm": {
    "source": "",
    "medium": "",
    "campaign": "",
    "content": "",
    "term": ""
  },
  "raw": {},
  "received_at": "ISO-8601"
}
```

### Respostas HTTP

> ⚠️ **Esta tabela é hipótese de 2026, não achado verificado.** Duas rodadas de pesquisa na documentação pública da Pluga não encontraram nada sobre quais códigos ela considera sucesso, se retenta, quantas vezes, nem se pausa a automação. A coluna "Efeito" abaixo era suposição razoável e **não deve embasar decisão**. O que vale hoje: o CRM responde **200** sempre, justamente para não depender disto — [ADR-0007](../adr/0007-ingestao-idempotencia.md).

| Código | Significado | Efeito (SUPOSTO, não verificado) |
|--------|-------------|--------|
| 200 / 201 / 202 | Aceito | Sucesso na Pluga |
| 409 | Duplicata (idempotente) | Tratar como sucesso no CRM |
| 400 / 422 | Validação | Falha corrigível no log Pluga |
| 401 / 403 | Auth | Revisar secret |
| 429 / 5xx | Temporário | Retentativa inteligente Pluga |

### Regras de ingestão no CRM
1. Idempotência primária: `source + external_lead_id` — retransmissão Pluga atualiza **EnvioLead**, não cria segunda oportunidade  
2. Mesma Pessoa (CPF/telefone normalizado), **novo** `external_lead_id` (nova submissão) → nova **Oportunidade** comercial  
3. Lead novo → Pessoa (cria ou reutiliza) + Oportunidade etapa **Novo lead** + roteamento  
4. Persistir `raw` + status da sync + último erro  
5. Endpoint canônico: `POST /v1/integrations/pluga/leads` (workspace identificado pelo token Bearer)  

---

## Campos mínimos no formulário Ads (criativo)

Nome · WhatsApp · E-mail · CPF · Banco · Tipo de contrato/produto (veículo/imóvel/EP) · checkbox LGPD / opt-in WhatsApp.

Na Pluga, mapear também: ID do lead, form, campaign/adset/ad (Meta) ou ids equivalentes (Google), timestamp.

---

## Confiabilidade

| Tema | Prática |
|------|---------|
| Retries | Pluga retenta erros temporários; reenvio manual de Falhou/Guardado |
| Logs Pluga | 90 dias; status Sucesso / Falhou / Guardado / Processando |
| Quota | Excesso → Guardado (reenviável ~90 dias) |
| Telefone BR | Formatador + Code → E.164 (`+55` + DDD + número) |
| CPF | Só dígitos; validar DV no CRM |
| Dedupe | **Pluga não deduplica Ads→CRM** — responsabilidade do CRM |
| SLA comercial | Orçar 1º contato com buffer da latência Meta (5–15 min) |

---

## Stack adjacente via Pluga (pós-lead)

| Ferramenta | Uso |
|------------|-----|
| [WhatsApp Business API](https://pluga.co/ferramentas/whatsapp-business/integracao/) / [Z-API](https://pluga.co/ferramentas/z-api/integracao/) | Follow-up após criar lead |
| [Clicksign](https://pluga.co/ferramentas/clicksign/) | Envelope de assinatura; gatilhos assinou/recusou |
| Google Sheets | Auditoria paralela |
| Pipedrive / Ploomes / PipeRun / RD | Referência de mapeamento (não destino final) |

Padrão revisional (pós-decisões): **Lead no CRM (Pluga/LP) → template WhatsMiau → funil comercial → Clicksign/DocuSign → handoff jurídico**. Ver [decisoes.md](./decisoes.md).

---

## O que o CRM precisa ter (tela Integrações > Pluga)

1. Toggle ativar integração + status  
2. **URL do webhook** (copiar; prod/sandbox)  
3. **Secret** (gerar, rotacionar, mascarar)  
4. Tipo de auth (Bearer / header)  
5. Campos esperados documentados (contrato JSON — **sem** De→Para visual no CRM)  
6. Campos obrigatórios (nome + telefone ou CPF)  
7. Idempotência documentada (`source + external_lead_id`)  
8. Botão **enviar lead de teste** (payload exemplo Meta e Google)  
9. **Última sync:** timestamp, status, lead_id, HTTP code, erro  
10. Histórico recente (~20 eventos)  
11. Docs embutidos: passo a passo Meta + Google Lead Form (linguagem não técnica)  
12. Badges de origem (Meta / Google)  
13. Fila morta + reprocessar  
14. LGPD: flag consentimento + retenção do `raw`  
15. Alerta admin: N falhas em 15 min  

> Mapeamento De→Para dos campos do formulário Ads é feito **na Pluga**.

---

## Implicações para o backlog do CRM

| Prioridade | Entrega | Por quê |
|------------|---------|---------|
| P0 | `POST /v1/integrations/pluga/leads` autenticado + idempotente | Sem isso a Pluga não entrega valor |
| P0 | Normalização telefone/CPF no CRM (fonte de verdade) | Eventos iguais; novo negócio do mesmo CPF permitido |
| P0 | Tela Integrações > Pluga (URL, secret, teste, logs, sync) | Onboarding não técnico |
| P0 | Webhook genérico LP (além da Pluga) | Decisão 3B / 15C |
| P1 | Origem Meta vs Google simétrica no card e no dashboard | Atribuição e ROAS |
| P1 | SLA desde `chegou_em` + auto WhatsMiau | Lead quente |
| P2 | Offline conversions / CAPI | Fase posterior |

---

## Fontes

- [pluga.co](https://pluga.co/) · [Preços](https://pluga.co/precos/) · [Webhooks](https://pluga.co/webhooks/)
- [Facebook Lead Ads](https://pluga.co/ferramentas/facebook-lead-ads/) · [→ Webhooks](https://pluga.co/ferramentas/facebook-lead-ads/integracao/pluga-webhooks/)
- [Google Lead Form](https://pluga.co/ferramentas/google-lead-form/) · [→ Webhooks](https://pluga.co/ferramentas/google-lead-form/integracao/pluga-webhooks/)
- [HTTP Request](https://blog.pluga.co/http-request-pluga/) · [Roteador](https://blog.pluga.co/roteador-pluga/) · [CRM + Facebook](https://blog.pluga.co/crm-facebook/)
- [Google Ads webhook](https://support.google.com/google-ads/answer/16729613?hl=pt) · [PipeRun + Google via Pluga](https://ajuda.crmpiperun.com/integracao-com-o-google-ads-via-pluga)
- Help: [Histórico/Log](https://pluga.zendesk.com/hc/pt-br/articles/360021076033) · [Status](https://pluga.zendesk.com/hc/pt-br/articles/360020882454) · [Corrigir falha](https://pluga.zendesk.com/hc/pt-br/articles/360021077973)
