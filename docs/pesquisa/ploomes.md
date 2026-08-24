# Ploomes CRM — Referência de produto

> Pesquisa competitiva para inspirar um CRM de vendas focado em **revisional de juros abusivos** (veículos, imóveis e empréstimo pessoal), com captação via Meta Ads e Google Ads.  
> Fonte: [ploomes.com](https://www.ploomes.com/) · Relatório sintetizado em ago/2026.

---

## Posicionamento

O Ploomes se vende como o CRM B2B que o time comercial **realmente usa**: jornada completa (lead → proposta → pedido/contrato → pós-venda), documentos no mesmo lugar do funil e integração profunda com ERP brasileiro.

- Claim: “maior empresa de CRM da América Latina”
- Escala: +3.000 empresas · +250 colaboradores · presença em +10 países
- Grupo: Sankhya (sócia majoritária desde ago/2022)
- Tom: nacional, preço em real, suporte em PT-BR, implementação consultiva

**Para revisional:** o Ploomes ensina a vencer pela **adoção do vendedor** e pela união **funil + documento**. O ICP revisional, porém, precisa de mais *inside sales + ads + WhatsApp + compliance* do que CPQ industrial.

---

## ICP

| Dimensão | Perfil |
|----------|--------|
| Segmentos | Indústria/distribuição, SaaS, serviços, seguros, consultorias; advocacia aparece no trial |
| Porte | PME a enterprise (mínimo comercial: 3 usuários) |
| Personas | Gestor comercial, coordenador de vendas, vendedor, CS/implantação, TI |

**Fit fraco:** operações WhatsApp-first (espaço do PipeRun/Kommo) e marketing attribution avançado (espaço do HubSpot).

---

## Fluxo de negócio modelado

```
Captação (formulários, Meta Lead Ads, RD/ActiveCampaign, API)
 → Pessoa / Empresa / Negócio (deduplicação)
 → Qualificação no funil (Kanban, tarefas, calendário)
 → Proposta / CPQ (templates, alçadas, notificações de abertura)
 → Assinatura digital (Clicksign / DocuSign)
 → Pedido / contrato → sync ERP
 → Pós-venda (base instalada, renovação, cross-sell)
```

---

## Funcionalidades-padrão

### Core (plano básico ~R$ 85/usuário/mês)
- Múltiplos funis personalizados
- Base de clientes + histórico/tarefas
- Campos custom (20+ tipos, obrigatoriedade, edição condicional)
- Segmentação de carteira, painéis básicos, mobile (com menção a offline)
- White-label para representantes

### Módulos sob consulta (por usuário, em toda a conta)
| Módulo | Valor de produto |
|--------|------------------|
| Workflow (BPM) | Checklists, regras, prazos, atribuição |
| Formulários externos | Entrada padronizada de leads |
| Propostas e documentos | Orçamentos, pedidos, OS, contratos |
| CPQ | Opcionais, impostos, fórmulas, consultas ERP |
| Analytics | Indicadores, metas, tabelas |
| Produtos do cliente | Base instalada / pós-venda |
| Assistente + Biblioteca com IA | Atividades, consultas, insights |

**O que o marketing mais empurra:** propostas/CPQ → ERP → adoção → visão 360º → IA → mobile/suporte local.

---

## Monetização

| Elemento | Sinal |
|----------|-------|
| Modelo | SaaS por usuário/mês + módulos a la carte |
| Entrada | ~R$ 85/usuário/mês (Básico); mínimo 3 usuários |
| Trial | 14 dias · demo consultiva |
| Pagamento | Boleto, PIX, cartão, transferência |
| Ciclo de venda | Trial PLG **ou** consultor → implementação (própria, parceiro ou self-serve via Universidade) |

---

## Distribuição (GTM)

- Site + SEO/blog + Universidade Ploomes
- Trial + demo consultiva (híbrido)
- Cases (Unimed, Truckvan, Philips, EASE)
- Ecossistema Sankhya + parceiros de implantação
- Hub de integrações + Pluga
- Marketplaces de avaliação (Capterra ~4,9)

---

## Stack e plataforma (público)

- 100% cloud · app mobile
- API **OData v4** (`api2.ploomes.com`) · auth `User-Key`
- Webhooks (criar/atualizar/ganhar/perder negócio, tarefas)
- Fórmulas com HTTPS + JSONPath para APIs externas
- Segurança: API key, SSO via Sankhya Pass, HTTPS
- BI: Power BI destacado
- Docs: [developers.ploomes.com](https://developers.ploomes.com/)

---

## Integrações relevantes para revisional

| Canal | Status |
|-------|--------|
| **Meta Lead Ads** | Nativo (quase tempo real); não traz campanha nativa — precisa campo custom |
| **Google Lead Form** | Via Pluga / Albato / Make |
| WhatsApp | Plugin + Neppo + Pluga / Callix — **não é inbox first-class** |
| Assinatura | Clicksign, DocuSign |
| ERP | Sankhya nativa; Omie/Foco/Dataplace; TOTVS/SAP via projeto |
| Marketing | RD Station, ActiveCampaign |

---

## O que clientes elogiam e pedem

**Elogios:** funil personalizável; propostas em minutos (Truckvan: &lt;5 min, ciclo 90→25–30 dias); centralização; suporte PT-BR.

**Críticas:** curva de aprendizado; mobile; preço sobe com módulos; analytics abaixo de globais; WhatsApp incompleto; atribuição de campanha Meta frágil.

---

## Insights para CRM de revisional

### Reaproveitar
1. Captação Meta em tempo real + mapeamento por formulário de origem
2. Deduplicação forte (no revisional: **telefone/CPF**, não só e-mail)
3. Funis múltiplos com workflow e SLA de próximo passo
4. Templates de proposta/contrato + alçadas de desconto
5. Assinatura digital no fluxo de fechamento
6. Visão 360º (ads → WhatsApp → docs → contrato → andamento)
7. Métricas de meta por etapa (adaptar para CAC, CPL, contato &lt;5 min, taxa de contrato)

### Não copiar cegamente
- CPQ industrial (impostos/estoque) — no revisional o “CPQ” é **honorários + elegibilidade do caso**
- ERP como diferencial #1 no MVP — o gargalo inicial é **ads → WhatsApp → conversão**
- Google Ads só via middleware — Meta e Google Lead Forms devem nascer **simétricos e nativos**

### Backlog inspirado no Ploomes (priorizado)
1. Ingestão nativa Meta + Google Lead Forms (UTM/campanha/adset/ad)
2. Router de leads (round-robin, plantão, especialidade veículo/imóvel/EP) + SLA
3. Inbox WhatsApp (API oficial) no card
4. Score de elegibilidade (taxa, IOF, garantia, atraso)
5. Gerador de proposta/contrato + assinatura
6. Checklist documental com bloqueio de etapa
7. Painel de mídia: CPL, CAC, custo por contrato, ROAS
8. Compliance LGPD (consentimento ads, opt-in WA, auditoria)

### Tese em uma frase
O Ploomes prova que no Brasil o CRM vence quando o vendedor prefere usá-lo e quando documento + processo vivem juntos. Para revisional, o equivalente é: **ads em tempo real + distribuição justa + WhatsApp com SLA + contrato/assinatura + métricas de mídia**.

---

## Fontes

- [Homepage](https://www.ploomes.com/) · [Preços](https://www.ploomes.com/precos) · [CRM de vendas](https://www.ploomes.com/produto/crm-de-vendas)
- [Integrações](https://www.ploomes.com/produto/integracoes) · [ERP](https://www.ploomes.com/produto/integracao-erp)
- [Meta Lead Ads (suporte)](https://suporte.ploomes.com/pt-BR/articles/5452431-integracao-com-facebook-lead-ads)
- [API](https://developers.ploomes.com/) · [Cases Truckvan](https://www.ploomes.com/clientes/truckvan) · [Capterra](https://www.capterra.ca/software/207290/ploomes)
