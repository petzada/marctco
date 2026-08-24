# clieent® CRM — Referência de produto

> Pesquisa competitiva para inspirar um CRM de vendas focado em **revisional de juros abusivos** (veículos, imóveis e empréstimo pessoal), com captação via Meta Ads e Google Ads.  
> Fonte: [clieent.com](https://clieent.com/) · Relatório sintetizado em ago/2026.

---

## Posicionamento

O clieent® é o CRM **comercial vertical para advocacia**: propostas de honorários, tracking de leitura em tempo real e assinatura eletrônica com validade jurídica — tudo no mesmo lugar, feito para advogados.

- Slogan operacional: *“Saiba quando seu cliente leu a proposta. Feche o contrato antes que ele esfrie.”*
- Claim social: +1.200 escritórios · 4,9/5 no site
- Escopo claro: **não** é gestão processual e **não** gera leads/tráfego pago
- Estratégia: comercial no clieent → jurídico no ASTREA (Aurum)

**Para revisional:** é a referência mais próxima do domínio jurídico-consumer brasileiro. O blueprint vencedor é um **sistema de fechamento**, não um Pipedrive genérico.

---

## ICP

| Dimensão | Perfil |
|----------|--------|
| Primário | Escritórios e advogados autônomos com atividade comercial ativa |
| Especialidades | Trabalhista, previdenciário, empresarial, consumidor, setores com LPs dedicadas |
| Tamanho (formulários) | Até 10 → 100+ novos clientes/mês · autônomo → 20+ advogados |
| Persona compradora | Sócio comercial, advogado-empreendedor, gestor de pré-vendas |
| Anti-ICP | Escritórios sem comercial estruturado |

---

## Fluxo de negócio modelado

```
Campanha / site / rede
 → Landing page / formulário de captura
 → Lead no funil + atribuição de origem
 → Triagem (pré-venda ↔ advogado)
 → Formulário de coleta de dados/documentos
 → Proposta de honorários (link rastreável)
 → Tracking de abertura → alerta WhatsApp → follow-up
 → Contrato / procuração → assinatura digital
 → Ganho → automações pós-fechamento
 → Handoff automático para ASTREA
```

**Estágios sugeridos pelo conteúdo próprio:** novo lead → triagem → caso em análise → proposta enviada → negociação → contrato fechado → não convertido. Funis por canal e por tipo de demanda.

---

## Funcionalidades-padrão

| Módulo | O que entrega |
|--------|---------------|
| Propostas de honorários | Templates, personalização, envio por link, status em tempo real |
| Tracking de leitura | Sabe quando a proposta foi visualizada — “momento quente” |
| Assinatura digital | Contratos/documentos online com validade jurídica |
| Documentos jurídicos | Proposta, contrato, **procuração** no mesmo pacote |
| Formulários | Link para o lead; dados caem no CRM; alerta de preenchimento |
| Páginas de captura | LPs por campanha/serviço; atribuição automática ao time |
| Funil Kanban | Oportunidades por estágio + valor previsto |
| Dashboard | Status de propostas, valor de contratos, métricas do funil |
| Tarefas / automações | Follow-ups e mensagens por etapa |
| WhatsApp | Alertas (atração → aprovação → assinatura) + funis automatizados |
| ASTREA | Cadastro automático de cliente/caso no software jurídico |

---

## Monetização

| Elemento | Sinal público |
|----------|---------------|
| Trial | **30 dias** (homepage/landings VIP); blog às vezes cita 7 dias |
| Entry | “Advogado Guerreiro Solitário” — **R$ 105/mês** (5 LPs, 5 propostas, 10 docs, 1 usuário) |
| Tiers superiores | Não transparentes no site; Reclame Aqui cita ~R$ 195/mês |
| Billing | Cartão recorrente pré-pago |
| Garantia | Cancelamento gratuito em 7 dias (CDC); depois, só não renovação |

**Leitura:** entry barato para solo; upsell implícito para multi-usuário/volume.

---

## Distribuição (GTM)

1. PLG + trial na homepage
2. Demo assistida
3. Parceria de canal **Aurum/Astrea** (cross-sell na base jurídica)
4. Influencer/afiliado jurídico (landings Natália, Raphael, Mariana Gonçalves)
5. Blog inbound + YouTube/treinamentos
6. Comunidade “Caixa Preta” (VIP)

**Empresa:** Aquino & Gonçalves Indústria de Software Ltda (Passos/MG, 2017); ~6 colaboradores; sem funding declarado (Tracxn).

---

## Stack e plataforma (público)

- Marketing site: WordPress + Elementor (Hostinger)
- Analytics: GTM, gtag, pixels Meta
- Chat: Crisp
- Produto: cloud SaaS; org GitHub com TypeScript
- Assinatura: provedor externo (nome não divulgado)
- WhatsApp: integração com ferramenta do cliente (não necessariamente WABA própria)

---

## Integrações

### ASTREA (diferencial #1)
- Conexões → login Astrea → automação por etapa → “Enviar para o Astrea”
- Pode criar **contato** e opcionalmente **caso**
- Campos: nome, CPF/CNPJ, telefone, endereço, e-mail, linha do tempo

### Outras
- Site do escritório, WhatsApp, LPs/formulários nativos
- Sem marketplace horizontal amplo — verticalização &gt; abertura

---

## O que clientes valorizam

- LPs **por campanha/setor** e métricas da prospecção à assinatura
- Controle do fluxo atendimento → fechamento com **procuração e contrato** no mesmo lugar
- Funis com **WhatsApp automatizado**
- Propostas “impactantes e bonitas” — estética como arma de conversão
- Cases de blog: +25% conversão; proposta de 3 dias → &lt;24h

**Ruído:** Reclame Aqui com reclamações de cobrança pós-trial/cancelamento — risco de PLG agressivo.

---

## Insights para CRM de revisional

### Blueprint a copiar
1. **LP nativa por campanha e produto** (veículo / imóvel / EP) com UTM gravado no lead
2. Funil multi-produto e multi-canal
3. Formulário curto na entrada + **formulário longo de documentos** após qualificação
4. Proposta rastreável (abriu / reabriu / tempo) + alerta WhatsApp no momento da abertura
5. Envelope de fechamento: proposta + contrato de honorários + procuração + termo LGPD
6. Automação pós-assinatura → cria pasta do caso + sync com software jurídico
7. WhatsApp como sistema nervoso (novo lead, docs, proposta aberta, assinado)

### Funil sugerido para revisional
1. Lead Ads / formulário  
2. Contato WhatsApp / triagem  
3. Documentos pendentes  
4. Análise de viabilidade / cálculo de abusividade  
5. Proposta de honorários enviada  
6. Proposta visualizada / negociação  
7. Contrato + procuração assinados  
8. Handoff jurídico / protocolo  
9. Perdido (motivo estruturado)

### Campos críticos no formulário documental
Tipo de contrato · credor/banco · valor da parcela · taxa · saldo · uploads (contrato, extratos, CNH) · consentimento LGPD · opt-in WhatsApp.

### O que não copiar cegamente
- Escopo só “honorários de advocacia” — factories de revisional precisam de SLA de docs, scoring de viabilidade, fila de analistas e ROAS de Ads
- Dependência de um único jurídico — preferir **conectores múltiplos / webhooks**
- Opacidade de pricing — volume de leads exige tabela clara
- Fricção de billing pós-trial

### Prioridade de backlog
1. LP + UTM + Lead Ads → CRM  
2. Funil Kanban multi-produto  
3. Formulário/upload de documentos com status  
4. Proposta rastreável + alerta WhatsApp  
5. Assinatura digital do pacote jurídico  
6. Automação pós-assinatura → software jurídico  
7. Dashboard: CPL, taxa de docs, taxa de assinatura, ticket, ROAS  

### Tese em uma frase
No Brasil jurídico-consumer, o CRM vencedor é um **sistema de fechamento**: captura por campanha → coleta → proposta com tracking → assinatura válida → handoff jurídico → WhatsApp no timing. Para revisional, verticalize ainda mais: docs financeiros, scoring de abusividade e ROAS de Ads.

---

## Fontes

- [Homepage](https://clieent.com/) · [Feito para escritórios](https://clieent.com/feito-para-escritorios/) · [Blog](https://blog.clieent.com/)
- [Integração Aurum](https://www.aurum.com.br/blog/aurum-e-clieent-crm/) · [Help Astrea](https://astrea.aurum.com.br/pt-BR/articles/8239501-como-integrar-o-astrea-e-o-clieent-crm)
- [Reclame Aqui](https://www.reclameaqui.com.br/empresa/clieent-crm/) · [Tracxn](https://tracxn.com/d/companies/clieent/)
