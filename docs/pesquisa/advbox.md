# ADVBOX — Referência de produto

> Pesquisa competitiva para inspirar um CRM de vendas focado em **revisional de juros abusivos** (veículos, imóveis e empréstimo pessoal), com captação via Meta Ads e Google Ads.  
> Fonte: [advbox.com.br/software-juridico](https://advbox.com.br/software-juridico) · Relatório sintetizado em ago/2026.

---

## Posicionamento

A ADVBOX é o **sistema operacional do escritório jurídico digital**: CRM + processos + prazos + financeiro + IA + community — não um CRM de performance de Ads.

- Origem: nascida dentro de escritório (Koetz Advocacia); lançamento oficial 2017; Florianópolis
- Escala: +5.000 escritórios · +80.000 usuários · +5 mi processos · +R$ 1 bi em honorários cobrados
- Promessa: **mais clientes com a mesma equipe** — automação previsível + métricas de produção
- Narrativa cultural: escritório digital/inteligente vs. físico tradicional

**Para revisional:** o ouro está no pós-lead (Kanban com estagnação, Taskscore, estoque, IA no gargalo, financeiro). O gap a explorar é a **porta de entrada Ads** (triagem, score, SLA, ROAS).

---

## ICP

| Dimensão | Perfil |
|----------|--------|
| Primário | Escritórios digitais/híbridos de **volume** (consumer, bancário, previdenciário, trabalhista, família) |
| Sinais de fit | Processos repetitivos, captação online, equipes remotas, risco de prazo, funil comercial + carteira juntos |
| Especialidades | Previdenciário, consumidor, **bancário/revisionais**, trabalhista, trânsito, família |
| Enterprise | Big Offices (20k+ processos) com API dedicada e DB exclusivo |

---

## Fluxo de negócio modelado

```
Marketing (RD Station / Ads / site / parceiros)
 → Lead / oportunidade (origem rastreada)
 → CRM Kanban (atendimento → contratação)
 → Contrato / honorários estimados no card
 → Processo (adm / judicial / recursal / execução)
 → Intimações + Justin-e (interpreta, prazo, sugere tarefa)
 → Workflow / Flowter
 → Taskscore (pontua entrega)
 → Financeiro (Asaas: boleto/PIX/cartão, inadimplência)
 → BI / Estoque & Prospecção (conversão, safra, +120 dias parados)
 → Comunicação proativa (SMS/e-mail/WhatsApp ao mover etapa)
```

**SLA implícito:** alerta de processos estagnados; **+120 dias sem tarefa**; contadores de recebidos no mês e estagnados no Kanban.

---

## Funcionalidades-padrão

### CRM nativo
- Kanban por fase; cards com cliente, CNJ, tipo de ação, valor, responsável
- Contadores: processos · recebidos · honorários estimados · estagnados
- Movimentação em massa; notificações SMS/e-mail ao mudar fase
- Origem do cliente obrigatória → ranking “Top Origem”
- Disponível em Essencial/CRM, Banca Max, Elite (Banca Jurídica **sem** menu CRM)

### Taskscore®
- Pontuação por tarefa com peso/complexidade
- Metas, bonificação, visão individual + gestão
- Integrado à Donna (“quem bateu meta?”, “custo por ponto”)
- Narrativa: produtividade por **entrega**, não por horas

### IA
| Produto | Papel | Preço sinalizado |
|---------|-------|------------------|
| **Donna** | Copiloto: consulta, ações, relatórios em linguagem natural | ~R$ 200/mês |
| **Justin-e** | Interpreta intimações; prazo; % confiança; sugere tarefas | ~R$ 200/mês |
| **Agentes de petição** | 20+ áreas; BANC-1 cobre revisional / busca e apreensão | ~R$ 200/mês |
| **Flowter** | Gatilho → ação → HTTP externo | ~R$ 280/mês |

### Outros
- Controladoria digital, editor de docs, Kanban de tarefas, BI de safras/rentabilidade
- Parcerias entre escritórios no mesmo sistema
- Agenda Google / Apple / Outlook

---

## Monetização

| Plano | Preço | Perfil |
|-------|-------|--------|
| Essencial | R$ 220/mês | CRM Kanban; até 2.000 processos; 50 GB |
| Banca Jurídica | R$ 450/mês | Controladoria + financeiro; processos ilimitados |
| Banca Max | R$ 900/mês | Workflow, Kanban tarefas, 25 termos DJEN |
| Elite | R$ 1.800/mês | BI completo, CS personalizado, 100 termos DJEN |
| Big Offices | a partir de R$ 5.000/mês | 20k+ processos, API dedicada |

- **Usuários ilimitados** — monetiza por processo/features, não por seat
- Add-ons de volume de andamentos + pacotes de IA
- Trial: **7 dias**, sem cartão · sem fidelidade · PIX ou cartão

---

## Distribuição (GTM)

Modelo **community-led + conteúdo + eventos**:

| Alavanca | Detalhe |
|----------|---------|
| ADVBOX Nation | Evento presencial (600+ advogados em 2025) |
| Top 100 Advogados Digitais | Votação + mídia (Estadão, iG, R7) |
| LegalBoss | Consultoria de gestão (7 fases) |
| Blog / YouTube / LinkedIn | Conteúdo denso de gestão e IA |
| Cases de influenciadores | Tretas Jurídicas, Koetz, ADV10X |
| Trial + migração assistida | Reduz atrito de troca |

---

## Stack e plataforma (público)

- 100% nuvem; browser em desktop/tablet/mobile — **sem app nativo obrigatório**
- API REST `https://app.advbox.com.br/api/v1` — 22 endpoints (processos, contatos, tarefas, financeiro)
- Docs: [api.softwareadvbox.com.br/docs](https://api.softwareadvbox.com.br/docs)
- LGPD / segurança; Big Offices com DB dedicado

---

## Integrações

| Categoria | Exemplos |
|-----------|----------|
| WhatsApp / leads | Atende Direito, Chatguru, Idvzap, Briefing Jurídico Ria, Touchworks… |
| Marketing | RD Station |
| Financeiro | Asaas |
| Agenda | Google, Apple, Outlook |
| Automação | API + Flowter + n8n (comunidade) |

**Gap crítico:** não há Meta Ads / Google Ads nativos — caminho = Ads → RD Station / WhatsApp tools → ADVBOX.

---

## Diferenciais vs CRM puro

| ADVBOX | CRM de vendas puro |
|--------|--------------------|
| CRM acoplado a processo, intimação e prazo fatal | Funil para no contrato |
| Taskscore = RH operacional jurídico | Win rate / SQL |
| IA de controladoria | IA de copy/chatbot |
| Estoque processual como ativo | Pipeline $ apenas |
| Monetização por processo | Por seat / lead |

---

## Features mais usadas (evidência)

1. Taskscore + gestão de tarefas/prazos  
2. Controladoria / intimações / Justin-e  
3. CRM Kanban + estagnação  
4. Financeiro + Asaas  
5. Estoque & Prospecção / BI  
6. Editor / agentes de petição  
7. Workflow / Flowter  
8. Origem do cliente + RD Station  

---

## Insights para CRM de revisional

### Copiar da ADVBOX
1. **Funil único comercial + jurídico** — Lead Ads → Triagem → Docs → Proposta → Contrato → Ajuizamento → Controle → Execução/acordo
2. **Origem obrigatória** × tipo de ação (veículo/imóvel/EP) — painel de CAC/LTV
3. **Estagnação por etapa = SLA** (lead sem retorno em 15 min; docs &gt;24h; contrato sem ajuizamento &gt;7 dias)
4. **Taskscore-like** para comercial + jurídico (triagem, ligação, análise, docs, petição, protocolo)
5. **Honorários no card + financeiro real** (entrada + êxito)
6. **Movimentação em massa** para volume Ads
7. **IA no gargalo** — ADVBOX coloca em intimação; revisional Ads precisa de espelho na **triagem de contrato/CET**

### Fazer melhor que a ADVBOX
| Necessidade | Oportunidade |
|-------------|--------------|
| Meta / Google Lead Forms nativos | Hoje via RD Station/API |
| Score de cabimento (taxa, IOF, RMC, consignado) | Não é core |
| OCR/upload de contrato no pipeline Ads | Parcial |
| SLA de first response WhatsApp em minutos | Via parceiros |
| Round-robin / capacidade do closer | Routing de lead fraco |
| Unit economics por campanha/criativo | Origem sim; Ads granular não |
| Parecer rápido pré-venda (BANC-1-like na entrada) | Agentes são pós-contrato |

### Como volume opera (síntese)
```
Ads (CAC alto)
 → WhatsApp/IA triagem
 → Closer humano (SLA curto)
 → Coleta de contrato + análise de cabimento
 → Contrato digital + honorários
 → Produção massificada (modelos/IA)
 → Controladoria de prazos
 → Cobrança de êxito
 → Feedback: origem → conversão → LTV → pausar criativo
```

### Prioridade de backlog
1. Kanban revisional com SLA/estagnação  
2. Origem Ads + conversão por produto  
3. Distribuição de leads + Taskscore comercial  
4. IA de triagem de contrato (espelho Justin-e na entrada)  
5. Financeiro de honorários/êxito  
6. Handoff limpo para jurídico (ou API ADVBOX se o cliente já usa)

### Tese em uma frase
ADVBOX é o SO do escritório de volume — extrair Kanban com estagnação, origem→conversão, Taskscore e IA no gargalo; construir além dela o **pipeline Ads-nativo, score de cabimento e SLA de atendimento**.

---

## Fontes

- [Software jurídico](https://advbox.com.br/software-juridico) · [Planos](https://advbox.com.br/planos) · [IA](https://advbox.com.br/ia-para-escritorio-de-advocacia)
- [Integrações](https://advbox.com.br/blog/integracoes-advbox/) · [API](https://api.softwareadvbox.com.br/docs)
- [Guia CRM](https://guia.advbox.com.br/entenda-primeiro-crm/entendendo-o-menu-crm) · [Taskscore](https://advbox.com.br/blog/taskscore-e-produtividade-com-ia-em-escritorios-inteligentes/)
- [Nation](https://advboxnation.com.br/) · [Sobre](https://advbox.com.br/sobre-nos)
