# Mapeamento Pluga → CRM (inventário para refatorar as telas)

> Trabalho em andamento. Cada tela da Pluga entra aqui quando a captura chegar.
> Objetivo: alinhar o que o CRM mostra em **Pluga** e **Configurações** com o
> que o cliente precisa colar no passo a passo da Pluga.
>
> **Não é autoridade de produto.** O contrato canônico continua em
> [ADR-0008](../../docs/adr/0008-fronteira-conector-dominio.md). Este arquivo
> só registra o De→Para operacional tela a tela.

Atualizado em: 2026-08-17 (teste Meta → HTTP Request **funcionou** depois do conserto das aspas em `financing_type`).

---

## Como preenchemos

Para cada captura da Pluga:

1. Anotar o passo (ferramenta, gatilho, destino, campo da UI).
2. Listar o que a Pluga pede naquela tela.
3. Consultar o CRM e gravar o valor correto (ou "não existe / confirmar no editor").
4. Marcar o gap na tela atual do marctco (rótulo diferente, valor placeholder, campo ausente).

O inventário **Meta** está completo o bastante para decidir a tela. Google e landing page ainda não. A refatoração de código só começa depois de você aprovar a seção "Decisões para a tela Pluga (Meta)" abaixo.

---

## O que o CRM já expõe hoje

| Tela no menu | Rota | O que o cliente encontra |
|---|---|---|
| **Pluga** | `/workspace/[slug]/integrations/pluga` | URL do webhook, segredo, modelo JSON Meta, cabeçalhos, aviso de plano pago, histórico, quarentena, fila morta |
| **Configurações** | `/workspace/[slug]/integrations/landing-page` | Na verdade é a tela de **landing page**: URL, segredo, receitas WordPress/builders, payload `v1`. O rótulo do menu não diz "Landing page" |

Fontes: `apps/web/app/workspace/[slug]/workspace-shell.tsx`, `integrations/pluga/page.tsx`, `integrations/landing-page/page.tsx`.

### Credenciais que o cliente cola na Pluga (HTTP Request)

| O que a Pluga pede | Valor no CRM | Onde nasce |
|---|---|---|
| Método | `POST` | Tela 05 da Pluga; o route handler só exporta POST |
| URL de API | `https://<host>/v1/integrations/pluga/leads` (só a URL, sem `POST`) | `PLUGA_LEADS_ENDPOINT_PATH`. A tela do CRM ainda mostra `POST https://SEU-CRM.example…`. Piloto atual: `https://web-production-33d67.up.railway.app/v1/integrations/pluga/leads` |
| Cabeçalhos (JSON) | `{"Authorization":"Bearer <segredo>","Content-Type":"application/json"}` | Segredo da tela Pluga. O CRM hoje copia **linhas HTTP**, não JSON — formato errado para este campo da Pluga |
| Corpo da requisição (JSON) | Contrato `v1` (`metaHttpRequestTemplate`) | Tela Pluga, bloco "Corpo da requisição" |
| Parâmetros de busca (JSON) | Vazio | Tenant vem do Bearer, nunca da query |
| Tipo de preenchimento | Deixar em branco / JSON cru. Não usar form-urlencoded | `acceptIntegrationLead` faz `request.json()`; outro content-type vira 400 |

Landing page **não** passa pela Pluga no desenho atual: endpoint e token são outros (`/v1/integrations/webhooks/leads`, conexão `LANDING_PAGE`). Se alguma captura da Pluga for de LP, registrar o desvio aqui.

### Contrato `v1` (chaves que o CRM entende)

Fonte: `packages/domain/src/intake/inbound-lead.ts`. Nenhum campo de negócio é obrigatório no HTTP. Sem telefone e sem e-mail o lead vai para quarentena.

| Chave no JSON | Significado | Obrigatório? |
|---|---|---|
| `schema_version` | Sempre `"v1"` | Esperado; ausente ainda entra |
| `source` | `META_LEAD_ADS` \| `GOOGLE_LEAD_FORM` \| `LANDING_PAGE` | Esperado; o conector infere se faltar |
| `external_lead_id` | Id estável da origem (idempotência) | Esperado; se faltar, o conector usa o id do evento |
| `occurred_at` | Data/hora ISO | Não |
| `name` | Nome | Não |
| `phone` / `phones` | Telefone (singular ou lista) | Não (sem contato → quarentena) |
| `email` / `emails` | E-mail | Não (sem contato → quarentena) |
| `cpf` | CPF | Não |
| `financing_type` | Tipo de financiamento | Não |
| `financial_institution` | Instituição | Não |
| `installment_amount` | Valor da parcela (texto bruto) | Não |
| `form_id`, `form_name` | Formulário | Não |
| `campaign_id`, `campaign_name` | Campanha | Não |
| `adset_id`, `adset_name` | Conjunto | Não |
| `ad_id`, `ad_name` | Anúncio | Não |
| `platform` | `fb` / `ig` / etc. | Não |
| `is_organic` | Orgânico | Não |
| `answers` | Perguntas extras do form | Não |

### Modelo Meta já publicado na tela Pluga

Campo da Pluga → chave `v1` (de `metaHttpRequestTemplate` + ADR-0008):

| Campo no editor da Pluga (confirmado na doc pública) | Colar no JSON como |
|---|---|
| ID do Lead | `external_lead_id` |
| Data/hora de criação — variante **ISO** | `occurred_at` |
| `form_id` / `form_name` | iguais |
| `campaign_id` / `campaign_name` | iguais |
| `adset_id` / `adset_name` | iguais |
| `ad_id` / `ad_name` | iguais |
| `platform` | igual |
| `is_organic` | igual (sem aspas, boolean) |
| Nome / telefone / e-mail | `name` / `phone` / `email` — **não estão na lista pública**; confirmar no editor com o formulário real |

`schema_version` e `source` são literais: `"v1"` e `"META_LEAD_ADS"`. Não vêm do gatilho.

---

## Inventário das telas da Pluga

> Cada seção abaixo é uma captura. Preencher na ordem em que chegarem.

### Tela 01 — Origem da automação (Meta)

Captura: criar automatização → primeiro passo, antes de conectar a conta.

| | |
|---|---|
| **Passo na Pluga** | Origem. Título: "Selecione a ferramenta e como ela irá iniciar sua automatização" |
| **O que a tela pede** | 1. Nome da automação (editável no topo, lápis). 2. **Ferramenta**. 3. **Gatilho**. Depois "SALVAR E CONTINUAR" |
| **Valor correto no CRM** | Ferramenta = **Facebook Lead Ads**. Gatilho = **Nova resposta em um anúncio**. Nome da automação é livre (não entra no contrato `v1`; no print estava "CRM Marct Teste") |
| **Onde o CRM mostra hoje** | Só de passagem, na tela Pluga: "Na automação Facebook Lead Ads → HTTP Request". Não lista Ferramenta/Gatilho como passo 1, nem usa o rótulo exato do gatilho |
| **Gap para a refatoração** | O passo a passo do CRM precisa abrir com estes dois valores literais. Não misturar com Google Ads Insights nem com "Facebook Ads". O `source` do JSON (`META_LEAD_ADS`) ainda não aparece nesta tela da Pluga — entra no corpo HTTP, mais à frente |

Conferido contra `docs/pesquisa/pluga.md` §Meta Ads ("Nova resposta em um anúncio"), `metaHttpRequestTemplate` (`source: "META_LEAD_ADS"`) e o copy em `apps/web/app/workspace/[slug]/integrations/pluga/page.tsx`.

### Tela 02 — Conecte sua conta (sem captura própria)

Vista só na sidebar da tela 03, já com check verde. Sem print do OAuth.

| | |
|---|---|
| **Passo na Pluga** | "Conecte sua conta" (Facebook Lead Ads) |
| **O que a tela pede** | Autorizar a conta Facebook. A pesquisa exige **admin da Página** |
| **Valor correto no CRM** | Nenhum. O CRM **nunca** recebe OAuth da Meta ([sintese-final.md](../../sintese-final.md) §5.1). A Pluga autentica |
| **Onde o CRM mostra hoje** | Não menciona este passo |
| **Gap para a refatoração** | O passo a passo deve dizer: conectar a conta Facebook na Pluga, com permissão de admin da Página da campanha. Sem captura, o texto fica genérico até chegar um print |

### Tela 03 — Ajustes: Página e Formulário

Captura: "Ajuste as opções do Facebook Lead Ads". Teste com Página `ACR Assessoria` e formulário `VEICULO ACR 1` (qualquer form ativo, só para avançar).

| | |
|---|---|
| **Passo na Pluga** | Ajustes do gatilho. Sidebar: Ferramenta ✓ → Conta ✓ → **Ajustes** (atual) → Adicionar filtro (ainda bloqueado) |
| **O que a tela pede** | 1. **Selecionar página** (obrigatório). 2. **Selecionar formulário** (obrigatório). "Adicionar filtro" é opcional e só libera depois |
| **Valor correto no CRM** | Não há valor para colar. Página e formulário são da conta Meta do cliente, não do marctco. Uma automação = **1 Página + 1 formulário**. N forms = N automações (ou Roteador depois). Os nomes escolhidos não vão no JSON; o editor depois oferece `form_id` / `form_name` para o contrato `v1` |
| **Onde o CRM mostra hoje** | Não instrui escolher Página nem Formulário. O modelo JSON já reserva `form_id` e `form_name`, e o card do lead mostra "Formulário" (`form_name`) |
| **Gap para a refatoração** | Explicar este passo com os rótulos da Pluga, deixar claro que o CRM não lista Páginas/forms (isso é da Meta via Pluga), e avisar: um form por automação. Filtro pode pular no onboarding |

Conferido contra `docs/pesquisa/pluga.md` §Configuração (admin da Página; 1 página + 1 form), ADR-0008 (sem OAuth no CRM) e `metaHttpRequestTemplate` (`form_id`, `form_name`).

### Tela 04 — Destino: HTTP Request

Captura: "Selecione a ferramenta e a ação". Origem Facebook Lead Ads já fechada na sidebar.

| | |
|---|---|
| **Passo na Pluga** | Destino da automação (passo 2 do fluxo) |
| **O que a tela pede** | 1. **Ferramenta**. 2. **Ação** |
| **Valor correto no CRM** | Ferramenta = **HTTP Request**. Ação = **Enviar uma mensagem via HTTP Request**. É o único destino que o marctco aceita: o endpoint `POST /v1/integrations/pluga/leads` espera o JSON `v1` montado pelo cliente, sem envelope da Pluga (ADR-0008) |
| **Onde o CRM mostra hoje** | Aviso de plano pago + "Na automação Facebook Lead Ads → HTTP Request". Não usa o rótulo exato da ação |
| **Gap para a refatoração** | Copiar os dois rótulos literais. Avisar para **não** escolher Pluga Webhooks, outro CRM, Sheets ou WhatsApp como destino. HTTP Request exige plano pago (piso Basic) |

**Não é Pluga Webhooks.** A pesquisa cita webhooks como destino genérico; o CRM precisa do HTTP Request porque o corpo é o contrato `v1` digitado no editor, com `Authorization: Bearer`. Webhooks da Pluga teriam outro envelope e não batem com o endpoint.

Conferido contra ADR-0008, `apps/web/app/v1/integrations/pluga/leads/route.ts` (só `POST`) e o copy em `integrations/pluga/page.tsx`.

### Tela 05 — Ajustes do HTTP Request

Captura: "Ajuste as opções do HTTP Request". Nome de teste `marct.co CRM`. Sidebar já aponta o próximo passo: "Personalize as infos" (URL, corpo, cabeçalhos).

| | |
|---|---|
| **Passo na Pluga** | Ajustes da ação HTTP Request |
| **O que a tela pede** | 1. **Nome da Ferramenta** (obrigatório). 2. **Método** (opcional, default POST). 3. **Modelo de retorno dos dados** (opcional, JSON) |
| **Valor correto no CRM** | Ver tabela abaixo |
| **Onde o CRM mostra hoje** | O copy do painel e o bloco de cabeçalhos falam em POST, mas não listam estes três campos nem o JSON de resposta |
| **Gap para a refatoração** | Incluir este passo com: nome livre, método `POST (Padrão)`, modelo de retorno vazio no onboarding (ou `{"status":"accepted"}` se quiserem encadear outra ação). URL e JSON do lead **não** são desta tela |

| Campo na Pluga | Valor | Por quê |
|---|---|---|
| Nome da Ferramenta | Livre. `marct.co CRM` serve. Não chega no endpoint | Só rótulo da conexão HTTP dentro da Pluga |
| Método | **`POST (Padrão)`** | O route handler só exporta `POST`. GET/PUT/PATCH/DELETE não existem |
| Modelo de retorno dos dados | **Deixar vazio** neste fluxo (Meta → CRM e pronto). Se houver etapa depois, colar `{"status":"accepted"}` | A Pluga só usa isso para mapear a resposta do destino em passos seguintes ([ajuda da Pluga](https://pluga.zendesk.com/hc/pt-br/articles/47397843206035-HTTP-Request-como-realizar-requisi%C3%A7%C3%B5es-em-APIs-via-Pluga)). O CRM responde **200** com esse corpo (ADR-0007) |

Conferido contra `acceptIntegrationLead` em `apps/web/lib/integration-lead-endpoint.ts` e ADR-0007.

### Tela 06 — Personalize as infos (HTTP Request)

Três capturas do mesmo passo, em scroll. Título: "Personalize as informações para que fique a sua cara :)". Há banner BETA "PREENCHER CAMPOS COM IA" — **não usar** no onboarding; o contrato `v1` é fixo e a IA não o conhece.

| | |
|---|---|
| **Passo na Pluga** | Destino HTTP Request → Personalize as infos |
| **O que a tela pede** | URL de API (obrigatório); Tipo de preenchimento (opcional); Corpo JSON (opcional na UI, **obrigatório para o CRM**); Cabeçalhos JSON (opcional na UI, **obrigatório para autenticar**); Parâmetros de busca JSON (opcional). Cada caixa tem "INSERIR INFOS" para puxar campos do gatilho Meta |
| **Valor correto no CRM** | Ver tabela abaixo |
| **Onde o CRM mostra hoje** | URL com prefixo `POST` e host placeholder; cabeçalhos em formato de linha HTTP, não JSON; corpo Meta copiável. Não menciona tipo de preenchimento, query params, INSERIR INFOS nem o aviso contra a IA |
| **Gap para a refatoração** | Copiar bloco a bloco com os rótulos da Pluga. URL sem `POST`. Cabeçalhos em JSON. Query vazia. Corpo com `<< campo >>` via INSERIR INFOS. Não sugerir o botão de IA |

| Campo na Pluga | Colar |
|---|---|
| **URL de API** | `https://web-production-33d67.up.railway.app/v1/integrations/pluga/leads` (piloto). Em geral: host do CRM + `/v1/integrations/pluga/leads`. Sem `POST ` na frente — o método já foi escolhido na tela 05. Sem `workspace_id` na URL |
| **Tipo de preenchimento dos campos da requisição** | **`Preencher campos com um JSON`**. A outra opção, `Preencher campos por chave e valor`, não monta o objeto `v1` |
| **Corpo da requisição (JSON)** | Modelo Meta (`metaHttpRequestTemplate`). Literais: `"schema_version": "v1"` e `"source": "META_LEAD_ADS"`. O resto via **INSERIR INFOS** (não digitar o nome do campo no chute). `is_organic` sem aspas (boolean). Nome/telefone/e-mail: confirmar no editor depois de conectar o form |
| **Cabeçalhos (JSON)** | Ver bloco abaixo. Token = segredo gerado na tela Pluga do CRM, não o das 4 últimas letras |
| **Parâmetros de busca (JSON)** | Vazio. `SALVAR E CONTINUAR` fica cinza até a URL ser preenchida — query vazia não é o que bloqueia |

Cabeçalhos, no formato que **este campo da Pluga** espera (JSON, não linhas HTTP):

```json
{
  "Authorization": "Bearer COLE_O_TOKEN_AQUI",
  "Content-Type": "application/json"
}
```

Corpo Meta (o mesmo já publicado na tela Pluga do CRM):

```json
{
  "schema_version": "v1",
  "source": "META_LEAD_ADS",
  "external_lead_id": "<< ID do Lead >>",
  "occurred_at": "<< Data/hora de criação — use a variante ISO >>",
  "name": "<< resposta do formulário: nome — confirmar no editor >>",
  "phone": "<< resposta do formulário: telefone — confirmar no editor >>",
  "email": "<< resposta do formulário: e-mail — confirmar no editor >>",
  "form_id": "<< form_id >>",
  "form_name": "<< form_name >>",
  "campaign_id": "<< campaign_id >>",
  "campaign_name": "<< campaign_name >>",
  "adset_id": "<< adset_id >>",
  "adset_name": "<< adset_name >>",
  "ad_id": "<< ad_id >>",
  "ad_name": "<< ad_name >>",
  "platform": "<< platform >>",
  "is_organic": << is_organic >>
}
```

Conferido contra `pluga-templates.ts`, `integration-lead-endpoint.ts` (Bearer + `request.json()`, 400 se não for JSON), `integration-token.ts` e ADR-0007 (tenant pelo token).

#### Revisão do preenchimento real (mesmo passo)

URL, tipo JSON e cabeçalhos continuam certos. O corpo agora tem os literais `v1` / `META_LEAD_ADS`, mas vários `<< … >>` foram **digitados** (`nome do form`, `telefone do form`, `Data/hora de criação — variante ISO`). Isso vai no POST como texto literal. O token certo nasce ao clicar o campo no INSERIR INFOS.

#### Catálogo INSERIR INFOS — formulário `VEICULO ACR 1` (conta real)

Fecha o buraco do ADR-0008: nome, telefone e e-mail **existem** no editor, com estes rótulos. Amostra de lead real vista no painel (PII não gravada aqui).

**Campos estáveis do gatilho Meta (iguais em qualquer form):**

| Rótulo no INSERIR INFOS | Chave `v1` | Nota |
|---|---|---|
| ID do Lead | `external_lead_id` | Idempotência |
| Data/hora de criação no formato ISO (AAAA-MM-DDTHH:mm:ssZ) | `occurred_at` | **Só esta.** Ignorar as variantes `DD/MM/YY` e `MM/DD/YYYY` |
| `form_id` / `form_name` | iguais | `form_name` desta conta = `VEICULO ACR 1` |
| `campaign_id` / `campaign_name` | iguais | |
| `adset_id` / `adset_name` | iguais | |
| `ad_id` / `ad_name` | iguais | `ad_name` desta conta = `RAT`; `platform` = `ig` |
| `platform` | igual | |
| `is_organic` | igual | Sem aspas no JSON. Pode vir vazio |
| ID do produto clicado | — | Pular neste form (vazio) |

**Campos de contato (dinâmicos, agora confirmados):**

| Rótulo no INSERIR INFOS | Chave `v1` | Por quê este |
|---|---|---|
| `nome_completo` | `name` | Não existe "nome do form" |
| `email` | `email` | Chave igual à do contrato |
| `número_do_whatsapp` | `phone` | Já vem E.164 (`+55…`). Preferir este |

Há outros telefones no form: `confirme_seu_whatsapp_!` e `qual_seu_numero_de_whatsapp?` (só DDD+número). Não usar como `phone` principal; vão em `answers` se quiser preservar.

**Perguntas do form (estrela laranja = pergunta customizada). Não são chaves `v1` de primeiro nível, salvo parcela:**

| Rótulo no INSERIR INFOS | Destino |
|---|---|
| `possui_um_financiamento_de_veiculo?` | `answers` (`SIM` não é `financing_type`) |
| `qual_seu_veiculo_?` | `answers` (`MOTO` não entra no enum; o tipo do form é veículo) |
| `qual_o_valor_da_sua_parcela_?` | `answers` (faixa de texto, não um valor único — `installment_amount` rejeitaria) |
| `possui_parcelas_em_atraso?` | `answers` |
| `confirme_seu_whatsapp_!` | `answers` |
| `qual_seu_numero_de_whatsapp?` | `answers` |
| Consentimento WhatsApp (texto longo da Meta) | `answers` ou pular |
| `financing_type` | Literal `"VEHICLE"` neste form (não vem do INSERIR INFOS) |

JSON a montar no corpo, **inserindo cada `<< >>` pelo clique no INSERIR INFOS**, não digitando o rótulo:

```json
{
  "schema_version": "v1",
  "source": "META_LEAD_ADS",
  "external_lead_id": "<< ID do Lead >>",
  "occurred_at": "<< Data/hora de criação no formato ISO (AAAA-MM-DDTHH:mm:ssZ) >>",
  "name": "<< nome_completo >>",
  "phone": "<< número_do_whatsapp >>",
  "email": "<< email >>",
  "financing_type": "VEHICLE",
  "form_id": "<< form_id >>",
  "form_name": "<< form_name >>",
  "campaign_id": "<< campaign_id >>",
  "campaign_name": "<< campaign_name >>",
  "adset_id": "<< adset_id >>",
  "adset_name": "<< adset_name >>",
  "ad_id": "<< ad_id >>",
  "ad_name": "<< ad_name >>",
  "platform": "<< platform >>",
  "is_organic": << is_organic >>,
  "answers": {
    "possui_um_financiamento_de_veiculo?": "<< possui_um_financiamento_de_veiculo? >>",
    "qual_seu_veiculo_?": "<< qual_seu_veiculo_? >>",
    "qual_o_valor_da_sua_parcela_?": "<< qual_o_valor_da_sua_parcela_? >>",
    "possui_parcelas_em_atraso?": "<< possui_parcelas_em_atraso? >>"
  }
}
```

Este catálogo é do form `VEICULO ACR 1`. Outro formulário muda `nome_completo` / perguntas. A tela do CRM deve ensinar: literais `v1` + `META_LEAD_ADS` + `VEHICLE` quando o form for de veículo; contato e atribuição pelo INSERIR INFOS; perguntas extras em `answers`.

---

## Lacunas já visíveis (antes das capturas)

Itens que o código já denuncia, para não perder quando formos desenhar:

1. **URL com placeholder.** A tela Pluga copia `POST https://SEU-CRM.example/v1/integrations/pluga/leads`, não o host real do workspace. O cliente precisa saber o domínio de produção.
2. **Rótulo "Configurações" aponta para landing page.** Quem procura "integrar Meta/Google" pode cair na receita de LP, que é outro endpoint e outro token.
3. **Modelo Google ausente de propósito.** Ticket 14 deixa isso aberto até uma conta Pluga real com Google Lead Form.
4. **Nome, telefone e e-mail do Meta confirmados** no INSERIR INFOS: `nome_completo`, `número_do_whatsapp`, `email`. O modelo da tela Pluga ainda diz "confirmar no editor" / "nome do form" — precisa passar a citar estes rótulos e o aviso: não digitar o `<< >>`, clicar o campo.
5. **Dois segredos.** Rotacionar Pluga não vale para LP, e vice-versa. Se a Pluga pedir "token" numa tela de LP/webhook, não misturar.

---

## Backlog da refatoração (acumulado tela a tela)

1. **Passo 1 da Pluga ausente no CRM.** A tela Pluga precisa dizer, com os rótulos da Pluga: Ferramenta = `Facebook Lead Ads`; Gatilho = `Nova resposta em um anúncio`. Hoje só cita "Facebook Lead Ads → HTTP Request" no meio da documentação do JSON.
2. **OAuth Facebook não está no passo a passo.** Dizer: conectar a conta na Pluga, com admin da Página. O CRM não pede login Meta.
3. **Página + Formulário não estão no passo a passo.** Usar os rótulos da Pluga ("Selecionar página", "Selecionar formulário"), ambos obrigatórios, 1 form por automação. Não construir dropdown de Páginas no CRM.
4. **Destino com rótulo exato da ação.** Ferramenta = `HTTP Request`; Ação = `Enviar uma mensagem via HTTP Request`. Explicitar que não é Pluga Webhooks nem outro app do catálogo.
5. **Ajustes do HTTP Request.** Nome livre; método `POST (Padrão)`; modelo de retorno vazio no onboarding, ou `{"status":"accepted"}` se houver etapa seguinte. Não misturar com URL/corpo.
6. **Personalize as infos — maior gap de UX.** URL só o endereço; cabeçalhos em JSON; tipo = `Preencher campos com um JSON`; corpo `v1` com INSERIR INFOS (rótulos reais: `nome_completo`, `número_do_whatsapp`, `email`, `ID do Lead`, data ISO); perguntas do form em `answers`; query vazia; não usar IA.
7. **O modelo copiável da tela Pluga está desatualizado.** Trocar `<< nome do form >>` / `<< telefone do form >>` pelos rótulos reais do editor e ensinar o clique no INSERIR INFOS. `financing_type` literal `VEHICLE` neste form; faixa de parcela em `answers`, não em `installment_amount`.

---

## Decisões para a tela Integrações > Pluga (Meta)

Travadas em 2026-08-17 com o passo a passo real da Pluga (Facebook Lead Ads → HTTP Request, form `VEICULO ACR 1`). Não reabre ADR: o mapeamento continua na Pluga, sem wizard De→Para e sem OAuth Meta no CRM ([ADR-0008](../../docs/adr/0008-fronteira-conector-dominio.md)).

**Forma da tela:** o bloco de documentação vira um passo a passo com os **rótulos literais** da Pluga, na ordem em que o cliente os vê. Cada passo mostra o valor a escolher ou o bloco a copiar. Histórico, quarentena, fila morta e painel do segredo permanecem.

### D1 — Menu

- O item **Pluga** continua sendo a tela desta integração.
- O item **Configurações** hoje aponta para landing page. Na fatia Meta não misturar as duas: Ads = Pluga; LP = outra conexão, outro token, outro endpoint. O rótulo "Configurações" fica para quando desenharmos a LP (inventário ainda não fechou).

### D2 — Passo a passo Meta (copy da tela)

| # | O que a Pluga mostra | O que o CRM deve dizer |
|---|---|---|
| 1 | Ferramenta / Gatilho | Ferramenta = `Facebook Lead Ads`. Gatilho = `Nova resposta em um anúncio`. Não é Facebook Ads, Instagram Ads nem Google Ads Insights |
| 2 | Conecte sua conta | Conectar a conta Facebook **na Pluga**, com admin da Página. O marctco não pede login Meta |
| 3 | Selecionar página / formulário | Obrigatórios. 1 Página + 1 formulário por automação. O CRM não lista Páginas. Filtro pode pular |
| 4 | Destino | Ferramenta = `HTTP Request`. Ação = `Enviar uma mensagem via HTTP Request`. Não é Pluga Webhooks nem outro app |
| 5 | Ajustes HTTP | Nome livre. Método = `POST (Padrão)`. Modelo de retorno = vazio neste fluxo |
| 6 | Personalize as infos | Ver D3–D6. Não usar "Preencher campos com IA" |

Manter o aviso: HTTP Request exige plano pago (piso Basic).

### D3 — URL copiável

- Só o endereço: `https://<host-real>/v1/integrations/pluga/leads`.
- Sem prefixo `POST` (o método é o passo 5).
- Sem `workspace_id` na URL.
- Parar de copiar `https://SEU-CRM.example`. O host tem que ser o da instalação (hoje o piloto é `web-production-33d67.up.railway.app`).

### D4 — Cabeçalhos copiáveis

Trocar o bloco em linhas HTTP pelo JSON que a Pluga pede:

```json
{
  "Authorization": "Bearer COLE_O_TOKEN_AQUI",
  "Content-Type": "application/json"
}
```

O token é o segredo gerado nesta tela (Direção), em claro uma vez. Não inserir campos do gatilho no Bearer.

### D5 — Tipo de preenchimento e query

- Tipo = `Preencher campos com um JSON`. Não `Preencher campos por chave e valor`.
- Parâmetros de busca = vazio.

### D6 — Corpo Meta copiável

Substituir `metaHttpRequestTemplate` pelo modelo confirmado na conta real. Literais digitados; o resto entra pelo **INSERIR INFOS** (clicar o campo, não escrever o `<< >>`).

| Chave `v1` | Como preenche |
|---|---|
| `schema_version` | Literal `"v1"` |
| `source` | Literal `"META_LEAD_ADS"` |
| `external_lead_id` | INSERIR INFOS → **ID do Lead** |
| `occurred_at` | INSERIR INFOS → **Data/hora de criação no formato ISO (AAAA-MM-DDTHH:mm:ssZ)**. Proibir as variantes BR/US |
| `name` | INSERIR INFOS → **`nome_completo`** (rótulo deste form; outro form pode mudar) |
| `phone` | INSERIR INFOS → **`número_do_whatsapp`** (E.164). Não usar `confirme_seu_whatsapp_!` nem `qual_seu_numero_de_whatsapp?` como `phone` |
| `email` | INSERIR INFOS → **`email`** |
| `financing_type` | Literal `"VEHICLE"` neste exemplo de form de veículo. Não mapear `qual_seu_veiculo_?` (`MOTO`) nesta chave |
| atribuição (`form_*`, `campaign_*`, `adset_*`, `ad_*`, `platform`) | INSERIR INFOS, chave igual |
| `is_organic` | INSERIR INFOS, **sem aspas** |
| perguntas com estrela | objeto `answers`, não chaves soltas. Faixa de parcela não vai em `installment_amount` |

A tela deve dizer: estes rótulos de contato são os deste form; se o INSERIR INFOS mostrar outro nome (`full_name`, etc.), usar o que aparecer. Sem os três (nome, telefone, e-mail) a automação não está pronta.

### D7 — Como testar (já existe; alinhar o texto)

1. Colar URL, cabeçalhos JSON e corpo.
2. Na Pluga, enviar a última informação do formulário (é o teste que você acabou de fazer).
3. Voltar à tela Pluga do CRM e ler a coluna **Mapeamento**: Nome, Telefone, E-mail. Sem os três, corrigir o INSERIR INFOS e reenviar.
4. Meta em produção real continua com polling de ~5 min; o envio de teste da Pluga não espera isso.

### D8 — Fora de escopo desta fatia

- Wizard De→Para no CRM.
- Dropdown de Páginas/forms da Meta.
- Modelo Google (ainda sem conta real).
- Mudar o contrato `v1` ou o endpoint.
- Implementar agora: estas decisões só viram código depois da sua aprovação. O lead de teste **já conferiu** o caminho Meta (URL, Bearer, JSON, INSERIR INFOS, `financing_type` com aspas).

### Critério de pronto do teste atual

Abrir a tela Pluga do workspace, histórico recente:

- Evento chegou → a URL e o Bearer funcionaram.
- Mapeamento com nome, telefone e e-mail marcados → o INSERIR INFOS do corpo está certo; a automação Meta pode receber lead de verdade.
- Quarentena → o POST autenticou, mas faltou contato (placeholders digitados em vez de clicados, ou o form de teste sem telefone/e-mail).
- Nada no histórico → olhar o log da Pluga (401 = token; 400 = JSON inválido).

Depois do teste que funcionar: **rotacionar o segredo** (ele apareceu em print) e colar o valor novo nos cabeçalhos da Pluga.

### Observação do teste 17 ago 2026 09:13 BRT

Painel da Pluga: grupo `Teste`, 1 evento, status **Processando**. Logs do Railway (`web`) até 12:20 UTC:

- `12:02:50Z` — `integration_connection_secret result="rotated"` no workspace piloto
- **Nenhum** `integration_event_received` (nem `accepted` nem `unauthorized`)
- Worker só `worker ready`; `/health` 200

O POST ainda não bateu no CRM. O próximo gesto é abrir o evento na Pluga (clicar a linha) e ler a resposta HTTP, não esperar o funil.

No construtor **novo** da Pluga a linha do histórico é um **grupo**, não um evento. Enquanto o status for **Processando**, não há "Ver detalhes" — o botão só aparece em **Falhou** (e o grupo deixa de ser só informativo). Não dá para clicar a linha `Teste` agora; esperar `Sucesso` ou `Falhou`, ou filtrar por status. Logs do CRM continuam sem `integration_event_received`.

### Erro real 17 ago 2026 ~09:23 BRT

O grupo saiu de Processando e virou **Falhou**. A Pluga **não chegou a disparar o HTTP**: quebrou ao montar o JSON.

```
Unexpected token 'V', ..."ng_type": VEHICLE }" is not valid JSON
Function: http_request_action_send_request
```

Causa: `financing_type` foi colado **sem aspas** (`VEHICLE` em vez de `"VEHICLE"`). JSON exige aspas em string. O CRM não vê 400/401 porque a requisição não sai.

O que já está certo no detalhe do evento (não mexer):

- URL `…/v1/integrations/pluga/leads`, método `post`, `FillingType` `json`
- Contato e IDs vieram do INSERIR INFOS (`nome_completo`, WhatsApp E.164, `email`, `external_lead_id`, `occurred_at` ISO)
- Cabeçalhos no formato JSON (não linhas HTTP)

Conserto no **corpo da automação** (editar a etapa HTTP Request, não o detalhe do evento — aquele painel é só leitura):

```json
"financing_type": "VEHICLE"
```

Manter `is_organic` **sem** aspas (boolean). Depois **Reenviar** o evento falho, ou disparar de novo a última informação do formulário.

Token do print voltou a aparecer nos Dados de entrada — rotacionar depois do teste que funcionar.

### Teste confirmado 17 ago 2026 ~09:28 BRT

Depois de `"financing_type": "VEHICLE"` (com aspas), o envio **funcionou**. Isso fecha o critério de pronto da fatia Meta: URL, Bearer, tipo JSON, INSERIR INFOS de contato/atribuição e literais do `v1`.

O plano D1–D8 permanece a forma da tela. Três acréscimos de copy que o teste mostrou e o D1–D8 ainda subestima:

1. **Aspas.** `"VEHICLE"` com aspas; `is_organic` sem aspas. Foi o único erro que impediu o POST. A tela precisa tratar isso como aviso, não nota de rodapé.
2. **Histórico da Pluga.** Grupo `Processando` não abre; `Ver detalhes` / `Reenviar` aparecem em `Falhou`. O CRM não espera o funil para saber se o POST chegou — olha o histórico desta tela.
3. **Modelo copiável no código ainda está velho.** `metaHttpRequestTemplate` não tem `financing_type` nem `answers`; cabeçalhos ainda vão em linhas HTTP. A refatoração é exatamente trocar isso pelo D3–D6.

**Limite do que o CRM mostra hoje (não muda nesta fatia):** nome, telefone, e-mail, `financing_type`, campanha e formulário viram card. `answers` fica no payload bruto (90 dias). `adset_*`, `ad_*`, `platform`, `is_organic` entram no `v1` mas **não** na Oportunidade nesta fase (ticket 02 / Fase 7).

**Ainda aberto de produto:** o modelo copiável usa literal `"VEHICLE"` porque o form piloto é de veículo. Imóvel / EP não podem colar isso. A tela precisa dizer o literal certo por tipo de form, sem virar três automações inventadas. Google e LP continuam fora.
