> **Documento de entrada (análise arquitetural).** Decisões consolidadas em [sintese-final.md](../../sintese-final.md).

> **Supersessão:** deduplicação por telefone, payload livre e publicação direta em fila são apenas hipóteses históricas. Valem hoje: múltiplos contatos e revisão manual, `IntegrationEvent` como outbox ([ADR-0007](../adr/0007-ingestao-idempotencia.md)) e contrato canônico `v1` com LP servidor-servidor ([ADR-0008](../adr/0008-fronteira-conector-dominio.md)).

É viável — principalmente para começar com esse escritório específico. Você consegue construir seu CRM, deixar a autenticação com Meta e Google dentro da Pluga e receber os leads no seu backend por HTTP Request, sem criar inicialmente um aplicativo próprio na Meta Developers nem um projeto OAuth próprio no Google.

Arquitetura recomendada
Meta Lead Ads
      └── Pluga ──► POST /v1/integrations/pluga/leads

Google Lead Form
      └── Pluga ──► POST /v1/integrations/pluga/leads

                         │
                         ▼
               Seu CRM / Banco de dados
                         │
          distribuição, funil, tarefas,
          WhatsApp, métricas e atendimento

A Pluga autentica as contas do cliente e permite mapear as informações capturadas para outro sistema. Para sistemas proprietários como o seu CRM, ela oferece Webhooks e HTTP Request com POST, GET, PUT, PATCH e DELETE. O HTTP Request também permite enviar JSON e cabeçalhos personalizados, inclusive um Authorization: Bearer ....

Fluxo de onboarding
O dono do escritório cria ou utiliza uma conta da Pluga.
Ele autentica a própria conta da Meta e seleciona Página, formulário e conta de anúncios.
Ele autentica a conta Google relacionada ao Google Lead Form.
Você configura como destino um endpoint do seu CRM.
A Pluga envia cada lead para sua API.
Seu CRM identifica o escritório, cria ou atualiza o lead e inicia o fluxo comercial.

A Pluga documenta exatamente o cenário de enviar cada resposta do Facebook Lead Ads para um sistema próprio por Webhook ou HTTP Request. Também possui integração com Google Lead Form como origem de leads.

Você não precisa criar um app próprio?

Para esse fluxo inicial, não.

Quem mantém o aplicativo, a autorização OAuth e a integração com as APIs da Meta e do Google é a Pluga. O cliente apenas concede à Pluga acesso às contas dele. Seu CRM nunca precisa receber a senha, o access token da Meta ou as credenciais Google do cliente.

Na prática, você terceiriza para a Pluga:

OAuth e consentimento;
renovação e manutenção das integrações;
captura do evento;
transformação e envio dos dados;
logs e reprocessamento básicos.

Seu CRM fica responsável apenas por receber e processar o payload.

A diferença importante entre “Google Ads” e “Google Lead Form”

Na Meta, isso funciona diretamente para Facebook/Instagram Lead Ads, ou seja, campanhas com formulário instantâneo dentro da própria plataforma. A Pluga também possui uma integração separada de Facebook Ads Insights para coletar métricas de campanhas.

No Google, a integração encontrada é especificamente com Google Lead Form, o formulário incorporado ao anúncio.

Portanto:

Anúncio Meta com formulário instantâneo: funciona.
Anúncio Google com Google Lead Form: funciona.
Anúncio que manda para uma landing page: você deve integrar o formulário da landing page.
Anúncio que manda diretamente para WhatsApp: você precisa capturar o lead pela API/provedor do WhatsApp.
Anúncio que gera apenas ligação telefônica: não surge automaticamente um lead estruturado no CRM.
Importação completa de métricas do Google Ads: não encontrei evidência de um conector geral de Google Ads Insights na Pluga, apenas do Google Lead Form.

A Pluga não transforma qualquer clique de anúncio em lead. Ela precisa de um evento estruturado vindo do formulário, site, WhatsApp ou outro canal de conversão.

Endpoint que eu criaria
POST /v1/integrations/pluga/leads
Authorization: Bearer plg_cliente_xxxxxxxxx
Content-Type: application/json

Payload normalizado:

{
  "source": "meta_lead_ads",
  "externalLeadId": "123456789",
  "externalFormId": "987654321",
  "campaignName": "Revisional de financiamento",
  "adName": "Reduza sua parcela",
  "receivedAt": "2026-08-03T22:30:00-03:00",
  "lead": {
    "name": "João da Silva",
    "phone": "5511999999999",
    "email": "joao@email.com",
    "vehicleType": "Automóvel",
    "financingBank": "Banco X"
  }
}

Eu criaria um token diferente para cada escritório:

integration_credentials
- id
- tenant_id
- provider: PLUGA
- token_hash
- active
- last_event_at
- created_at

E salvaria o identificador externo do lead com restrição única:

UNIQUE(tenant_id, source, external_lead_id)

Isso evita leads duplicados quando um evento for reenviado.

O que acontece quando a Pluga falha

Seu endpoint deve:

responder 2xx rapidamente;
gravar primeiro o evento bruto;
processar o lead posteriormente em fila;
implementar idempotência;
registrar erros de normalização;
permitir reprocessamento;
manter um log visível no painel administrativo.

Exemplo:

integration_events
- id
- tenant_id
- provider
- external_event_id
- payload_json
- status: RECEIVED | PROCESSED | FAILED
- error_message
- received_at
- processed_at

A Pluga informa que não captura dados retroativos anteriores à criação da automação. Também cobra conforme o número de eventos transferidos; quando o limite do plano é excedido, as automações são pausadas e os eventos ficam disponíveis para reenvio posteriormente.

Quem deve pagar e possuir a conta da Pluga?

Minha recomendação: a conta da Pluga deve pertencer ao escritório.

Você pode incluir o custo na sua mensalidade, mas contratualmente a integração deveria ficar vinculada ao cliente. Assim:

ele autoriza as contas dele;
você não recebe credenciais;
a revogação de acesso fica clara;
se o contrato terminar, você desativa o token do CRM;
você não concentra todas as contas de anúncios dos clientes em uma única conta operacional.

A Pluga tem plano gratuito e planos pagos a partir de R$ 89 mensais, mas Webhooks e HTTP Request são funcionalidades Premium, então esse cenário provavelmente exigirá plano pago. Os planos variam por número de automações, eventos e intervalo de processamento.

Você pode comercializar desta forma:

CRM Revisional — R$ 497/mês
+ integração Meta/Google
+ configuração inicial
+ distribuição automática de leads
+ acompanhamento comercial
+ relatórios de conversão

Infraestrutura Pluga:
contratada pelo cliente ou repassada no plano
Limitação para transformar isso em SaaS escalável

Para um ou poucos escritórios, essa arquitetura é excelente: rápida, barata e com baixo risco técnico.

Para dezenas ou centenas de clientes, surgem problemas:

cada cliente precisa de onboarding dentro da Pluga;
cada conta precisa de automações próprias;
alterações de campos podem exigir manutenção manual;
o custo cresce por automação e evento;
você depende da disponibilidade e das mudanças da Pluga;
a experiência não fica totalmente white-label;
desconexões de OAuth precisam ser corrigidas fora do seu CRM;
você não controla diretamente os tokens e permissões da Meta ou Google.

Minha avaliação:

1 a 10 clientes: Pluga é uma escolha muito boa.
10 a 30 clientes: ainda funciona, mas você precisa padronizar fortemente o onboarding.
30+ clientes: começaria a planejar integração própria ou parceria oficial com uma plataforma de integração.
Produto nacional altamente escalável: posteriormente, vale criar os aplicativos Meta/Google e trazer o OAuth para dentro do CRM.
O principal recurso que ficará faltando

A entrada de leads estará resolvida. Porém, um CRM realmente valioso para tráfego pago deveria devolver à plataforma o resultado comercial:

Lead recebido
→ Contatado
→ Documentação enviada
→ Análise concluída
→ Contrato assinado
→ Receita gerada

Enviar “contrato assinado” e “receita” de volta para Meta/Google como conversão offline permite que as campanhas sejam otimizadas pelos leads que realmente viraram clientes, e não apenas pelos formulários preenchidos.

Essa parte pode exigir Conversions API, offline conversions ou uma integração mais específica. Eu não colocaria isso no primeiro MVP, mas consideraria como a segunda fase estratégica.

Veredito

Eu faria desse jeito. Para vender o primeiro CRM ao escritório, criar app na Meta e no Google agora seria complexidade prematura.

A primeira versão seria:

Meta Lead Ads ──┐
                ├─ Pluga ─ HTTP Request ─ Seu CRM
Google Lead Form┘

No CRM, eu focaria em:

inbox de leads;
distribuição entre atendentes;
funil específico de revisional;
tarefas e lembretes;
detecção de lead parado;
histórico de contatos;
documentos solicitados;
origem, campanha e anúncio;
taxa de contato, qualificação e fechamento;
tempo médio até o primeiro atendimento;
integração com WhatsApp;
permissões e auditoria;
exportação e conformidade LGPD.

Como você estará processando telefone, informações financeiras e dados ligados a contratos, implemente finalidade clara, minimização, controle de acesso, retenção e segurança. Esses são princípios expressamente associados ao tratamento de dados sob a LGPD.

Limites atuais da Pluga

Atualmente, os planos informados pela Pluga são:

Plano	Eventos/mês	Automações
Basic	1.000	6
Pro	4.000	15
Ultimate	12.000	ilimitadas
Enterprise	acima de 12.000	ilimitadas

Os planos pagos informam intervalo mínimo de busca de cinco minutos. A Pluga define evento como cada transferência de dados entre ferramentas.

Isso significa que este fluxo:

Meta Lead Ads → Seu CRM

consome aproximadamente:

1 lead = 1 evento

Mas este fluxo:

Meta Lead Ads
  → Seu CRM
  → Google Sheets
  → WhatsApp
  → E-mail

pode consumir vários eventos para o mesmo lead. A documentação da Pluga explica que cada ação de um fluxo multi-action gera sua própria transferência contabilizada.

A arquitetura correta para economizar eventos

Use a Pluga exclusivamente como uma camada de entrada:

Meta Lead Ads ───────┐
                     ├── Pluga ──► API do seu CRM
Google Lead Form ────┘                     │
                                           ▼
                                   Fila interna do CRM
                                           │
                    ┌──────────────────────┼──────────────────────┐
                    ▼                      ▼                      ▼
               Criar lead             Notificar equipe      Enviar WhatsApp
                    ▼                      ▼                      ▼
              Lead scoring            Distribuir lead       Criar tarefas

A Pluga deve fazer apenas:

POST /v1/integrations/pluga/leads

Todo o restante deve acontecer dentro do seu sistema.

Assim:

1 lead recebido = aproximadamente 1 evento Pluga

Você não deve usar a Pluga para atualizar cada estágio, enviar cada notificação ou executar toda a operação comercial. Isso multiplicaria consumo, custo e pontos de falha.

Qual plano eu escolheria
Pro

Pode funcionar quando o cliente gera até aproximadamente 3.000 leads mensais e você mantém o fluxo em um evento por lead.

Embora o limite seja de 4.000 eventos, eu não operaria continuamente próximo dos 4.000. Você precisa de margem para:

testes;
leads duplicados;
mudanças de automação;
novos formulários;
eventuais ações adicionais;
crescimento das campanhas.
Ultimate

Para esse cliente, eu começaria no Ultimate.

O plano mensal informado é de R$ 359 e possui 12.000 eventos. Isso equivale a aproximadamente 0,6% dos R$ 60 mil investidos mensalmente em mídia.

Mesmo que o volume atual caiba no Pro, o Ultimate reduz o risco de a automação ser interrompida em um mês excepcional. Quando o limite de eventos é excedido, a Pluga informa que as automações são pausadas; os eventos ficam armazenados para posterior reenvio após upgrade ou renovação do ciclo.

Para uma operação que investe R$ 60 mil por mês, economizar R$ 150 no integrador e correr o risco de interromper a entrada dos leads não faz sentido.

Atenção ao tempo de atendimento

A página de preços informa um intervalo mínimo de busca de cinco minutos nos planos pagos. Isso não necessariamente significa que todo lead sempre demorará cinco minutos, mas você não deve vender a promessa de “lead instantâneo” antes de testar o comportamento real dos conectores Meta e Google.

Faça um teste de carga operacional:

Horário de envio do formulário na Meta
↓
Horário em que a Pluga identificou
↓
Horário do POST no seu CRM
↓
Horário em que o atendente foi notificado

Registre esses quatro horários durante alguns dias.

Se a operação precisar responder em segundos, e não em minutos, futuramente você poderá trocar a integração da Meta por webhooks próprios. A própria Meta disponibiliza notificações em tempo real para Lead Ads, mas isso exige configurar seu próprio aplicativo e permissões.

Como deixar o CRM multi-workspace desde o primeiro cliente

Sim, você consegue iniciar com apenas esse escritório e já desenvolver a base para vários clientes.

O erro seria colocar campos como:

client_id = 1
nome_escritorio = "Escritório X"

espalhados pelo sistema.

Desde o início, trate o cliente como um workspace.

Estrutura principal
workspaces
- id
- name
- slug
- status
- timezone
- created_at
users
- id
- name
- email
- created_at
workspace_members
- workspace_id
- user_id
- role
- status

Papéis possíveis:

OWNER
ADMIN
MANAGER
ATTENDANT
VIEWER

Todas as tabelas de negócio devem possuir:

workspace_id

Exemplo:

leads
- id
- workspace_id
- assigned_user_id
- pipeline_stage_id
- name
- phone
- email
- source
- status
- created_at

No Supabase/PostgreSQL, use RLS para garantir que um usuário somente acesse dados dos workspaces aos quais pertence.

Integrações separadas por workspace

Crie uma entidade específica:

integration_connections
- id
- workspace_id
- provider
- name
- status
- public_key
- secret_hash
- last_event_at
- last_error_at
- created_at

Exemplo:

provider = PLUGA
name = Meta Lead Ads - Campanhas Revisionais

Cada workspace recebe uma credencial exclusiva:

POST /v1/integrations/pluga/leads

Authorization: Bearer crm_pluga_xxxxxxxxx
Content-Type: application/json

O backend identifica o workspace pelo token.

Não aceite um workspace_id enviado livremente no JSON:

{
  "workspaceId": "cliente-qualquer"
}

Isso permitiria que uma configuração incorreta ou maliciosa enviasse leads para outro cliente.

O correto é:

token recebido
→ localizar integration_connection
→ descobrir workspace_id internamente
→ processar o lead
Entrada assíncrona e resiliente

O endpoint não deve executar todo o fluxo de vendas durante a requisição da Pluga.

Faça:

1. Validar token
2. Salvar evento bruto
3. Responder HTTP 202 rapidamente
4. Colocar evento em fila
5. Processar assincronamente
6. Criar ou atualizar lead
7. Executar notificações internas

Tabela recomendada:

integration_events
- id
- workspace_id
- integration_connection_id
- provider
- external_event_id
- event_type
- payload_json
- status
- attempts
- error_message
- received_at
- processed_at

Status:

RECEIVED
PROCESSING
PROCESSED
FAILED
DISCARDED

Adicione também uma fila de falhas ou dead-letter queue para eventos que não puderem ser processados após várias tentativas.

Evitando leads duplicados

Crie uma restrição única:

UNIQUE (
  workspace_id,
  source_provider,
  external_lead_id
)

Assim, se a Pluga reenviar um evento, você não cria dois leads.

Também recomendo deduplicação secundária por telefone:

workspace_id + telefone normalizado

Mas telefone igual não deve necessariamente impedir um novo negócio. O mesmo consumidor pode preencher outro formulário meses depois. A melhor modelagem é:

contacts
- pessoa única

opportunities
- nova oportunidade comercial

lead_submissions
- cada formulário recebido

Dessa forma:

João da Silva
├── Formulário recebido em janeiro
├── Oportunidade encerrada
└── Novo formulário recebido em agosto
Conta da Pluga por cliente

Para escalar, eu usaria uma conta Pluga por workspace/cliente, não uma conta única contendo todos os escritórios.

Isso separa:

autenticações Meta e Google;
consumo de eventos;
faturamento;
permissões;
logs;
desligamento do cliente;
responsabilidade sobre as contas publicitárias.

Os valores da Pluga são apresentados por conta, por mês.

Seu onboarding pode gerar:

URL do endpoint
Token secreto
Modelo JSON
Tutorial de configuração Meta
Tutorial de configuração Google
Botão “Enviar lead de teste”

Exemplo:

{
  "source": "meta_lead_ads",
  "external_lead_id": "{{lead_id}}",
  "form_id": "{{form_id}}",
  "campaign_id": "{{campaign_id}}",
  "campaign_name": "{{campaign_name}}",
  "ad_id": "{{ad_id}}",
  "ad_name": "{{ad_name}}",
  "name": "{{full_name}}",
  "phone": "{{phone_number}}",
  "email": "{{email}}",
  "submitted_at": "{{created_time}}"
}
Prepare uma camada de conectores

Não acople suas regras de negócio diretamente à Pluga.

Crie uma interface conceitual:

interface LeadSourceConnector {
  normalize(payload: unknown): Promise<NormalizedLead>;
  identifyExternalId(payload: unknown): string;
  validate(payload: unknown): Promise<void>;
}

Implementações:

PlugaMetaConnector
PlugaGoogleConnector
LandingPageWebhookConnector
MetaDirectConnector
GoogleDirectConnector
CsvImportConnector

Seu domínio recebe sempre o mesmo formato:

type NormalizedLead = {
  externalId: string;
  source: "META" | "GOOGLE" | "LANDING_PAGE";
  name: string;
  phone: string;
  email?: string;
  campaign?: {
    id?: string;
    name?: string;
    adId?: string;
    adName?: string;
  };
  submittedAt: Date;
  rawPayload: unknown;
};

Com isso, você inicia com Pluga e, no futuro, troca apenas o conector, sem reescrever:

funil;
distribuição;
relatórios;
WhatsApp;
tarefas;
automações;
permissões;
dashboards.
Caminho de evolução
Fase 1 — um cliente
Meta/Google
→ Pluga do cliente
→ HTTP Request
→ CRM multi-workspace
Fase 2 — vários escritórios
Workspace A → Pluga A ─┐
Workspace B → Pluga B ─┼─► Endpoint único multi-tenant
Workspace C → Pluga C ─┘

Cada integração possui seu próprio token.

Fase 3 — integração nativa na Pluga

Você pode tentar transformar seu CRM em um aplicativo listado no catálogo da Pluga. A própria Pluga informa que a integração nativa depende de contato e formulário para desenvolvedores; atualmente não existe um processo completamente autônomo para publicar a integração.

Fase 4 — integrações diretas

Quando houver clientes e receita suficientes:

Meta OAuth próprio
Google OAuth próprio
Webhooks diretos
Conversões offline
Meta Conversions API
Sincronização de campanhas
Minha recomendação objetiva

> **Atualização 2026-08-04:** decisões de stack **travadas**. Fonte de verdade: [stack-recomendada.md](../../stack-recomendada.md) · [ADR-0001](../adr/0001-stack-monolito-modular-ts.md). Organização do cliente (1 workspace/grupo + tags): [ADR-0002](../adr/0002-workspace-tags-times.md).

Stack travada (resumo): TypeScript · Next.js + worker · Supabase (Postgres/Auth/RLS) · Prisma · BullMQ/Redis Railway · Cloudflare R2 · Resend · Sentry · Zod/shadcn/dnd-kit · score DeepSeek V4 / Gemini Flash via OpenRouter.

---

Texto histórico (supersedido):

Eu construiria assim:

Next.js
Node.js/worker separado
Supabase PostgreSQL
Supabase Auth
RLS por workspace
Redis + BullMQ ou fila equivalente
Endpoint único de ingestão
Credenciais por integração
Log de eventos
Idempotência
Dead-letter queue
Auditoria

E começaria com:

Pluga Ultimate na conta do cliente
1 evento por lead
Meta e Google em automações separadas
Toda a inteligência dentro do seu CRM

Portanto: sim, essa arquitetura suporta tranquilamente esse cliente e pode ser preparada desde o início para vários workspaces e usuários. O cuidado central é não transformar a Pluga no motor do seu CRM. Ela deve ser apenas o adaptador de entrada enquanto seu produto mantém toda a regra de negócio, isolamento multi-tenant e processamento interno.
