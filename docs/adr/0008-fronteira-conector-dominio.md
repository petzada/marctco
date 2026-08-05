# Fronteira entre conector de origem e domínio

O CRM é dono de um contrato canônico versionado de entrada. A Pluga mapeia Meta/Google para esse contrato, e LPs próprias o enviam servidor-servidor. O `LeadSourceConnector` conhece a **forma** recebida e a converte em dado interno; o domínio conhece o **significado**. O conector roda **no worker**, não no request HTTP. Entre os dois passam dois tipos derivados de Zod: `InboundLead` (entrada canônica interpretada) e `NormalizedLead` (saída do normalizador de domínio).

**Status:** accepted · 2026-08-04

## Por que o conector roda no worker

Decorre do 200-sempre e da outbox ([ADR-0007](./0007-ingestao-idempotencia.md)): o request autentica, persiste o bruto e responde, sem interpretar. A conexão autenticada registra a origem declarada; o worker valida e interpreta o contrato quando o dispatcher entregar o evento.

O ganho decisivo: quando um conector tiver bug, o payload bruto está guardado **não interpretado**, e a DLQ pode reprocessar com o código corrigido. Se o adapter rodasse no request, um bug de parsing perderia o lead irrecuperavelmente.

Isto é contraintuitivo o bastante para alguém tentar "consertar" parseando no handler. Não é bug — é o desenho.

## A divisão

| Conector (adapter) | Domínio |
|---|---|
| Lê as chaves estáveis do contrato `v1` e tolera extras | Normaliza telefone, CPF, e-mail e valores monetários |
| Extrai origem, campanha, adset, anúncio, formulário e respostas adicionais | Decide quarentena e necessidade de revisão |
| Sintetiza `external_lead_id` quando a origem não fornece | Decide reúso de Person |
| Não conhece funil, Person, Opportunity nem etapa | Decide criar Opportunity, associar com prova ou abrir revisão |

**Normalização é do domínio, não do adapter** — não por pureza: normalizar telefone exige país default (Brasil). Com normalização no adapter, ou a regra se repete em três lugares até divergirem, ou o adapter passa a carregar conhecimento de negócio que não é dele. `sintese-final.md` §17 já trata dado normalizado como garantia do CRM.

## Dois tipos, não um

`InboundLead` → `normalize()` → `NormalizedLead`.

**Considered option (rejeitada):** um único `NormalizedLead` que o adapter produz já chamando os normalizadores compartilhados. Menos cerimônia, mas o adapter pode esquecer de chamar um normalizador e nada percebe — o tipo *diz* "normalized" e o dado não está. O defeito aparece como telefone torto num card, semanas depois.

Com dois tipos o compilador garante que a normalização aconteceu. **Este código será escrito majoritariamente por agentes, e agentes violam convenção com muito mais facilidade do que erram tipos** — trocar "lembre de normalizar" por uma barreira de compilador é o melhor negócio disponível, ao custo de um tipo.

`NormalizedLead` é **value object**, não entidade: sem identidade, sem ciclo de vida. As entidades são `Person` e `Opportunity`. Tratá-lo como entidade vira tabela desnecessária.

## Contrato canônico `v1`

**Supersede a ideia de o CRM aceitar um “payload nativo da Pluga”. Verificado na documentação pública da Pluga**, não assumido: a ferramenta HTTP Request expõe campos brutos — "Corpo da requisição (JSON)", "Cabeçalhos (JSON)", "Parâmetros de busca (JSON)" — que o usuário preenche com o JSON que a API de destino espera. **Não existe envelope ou wrapper automático da Pluga em volta do payload.**

Isso torna o contrato canônico a única opção disponível, não uma preferência arquitetural: um conector que esperasse "a forma nativa da Pluga" não teria forma nativa nenhuma para esperar. Por isso o CRM publica o contrato e entrega modelos de mapeamento por origem.

**HTTP Request é recurso Premium da Pluga**, exigindo plano pago. Isso é pré-requisito de onboarding, não detalhe — sem plano pago não há ingestão de Ads.

O núcleo usa chaves planas e estáveis, compatíveis com o editor da Pluga:

- `schema_version`, `external_lead_id`, `occurred_at`;
- nome, telefones, e-mails e CPF;
- `financing_type`, instituição financeira e valor bruto da parcela, todos opcionais;
- `form_id`, `campaign_id`, `adset_id`, `ad_id` e plataforma, todos opcionais;
- respostas adicionais e propriedades desconhecidas, preservadas no payload bruto.

IDs entram como strings. Valores monetários chegam como string bruta e só viram decimal no normalizador. Campo opcional ausente, desconhecido ou inválido gera diagnóstico assíncrono e preservação do bruto; não transforma um JSON autenticado em rejeição HTTP nem bloqueia a entrada no funil quando ainda há identidade suficiente.

### Os campos de origem são fixos por ferramenta

Embora o **formato de saída** seja montado pelo usuário, o **conjunto de campos que o gatilho oferece** é fixo por ferramenta de origem e independe do destino escolhido — verificado comparando páginas de integração da Pluga com destinos diferentes, que exibem listas idênticas.

**Meta Lead Ads** — campos confirmados na documentação pública, base do modelo de mapeamento:

| Campo na Pluga | Destino no contrato `v1` |
|---|---|
| ID do Lead | `external_lead_id` |
| Data/hora de criação (ISO) | `occurred_at` — usar a variante ISO, nunca as `DD/MM/YY` ou `MM/DD/YYYY` |
| `form_id`, `form_name` | `form_id`, `form_name` |
| `campaign_id`, `campaign_name` | `campaign_id`, `campaign_name` |
| `adset_id`, `adset_name` | `adset_id`, `adset_name` |
| `ad_id`, `ad_name` | `ad_id`, `ad_name` |
| `platform` | `platform` |
| `is_organic` | `is_organic` |

A lista pública **não inclui nome, telefone, e-mail nem as perguntas do formulário** — o mais provável é que apareçam dinamicamente no editor quando a conta real é conectada e a Pluga lê o schema daquele formulário. Isso não está confirmado, e é o que o teste de onboarding precisa verificar primeiro: sem esses campos não há lead, só metadados de campanha.

**Google Lead Form** — a lista pública voltou truncada e não confiável (três itens, sem IDs de campanha e sem campos de contato). **Nenhum campo Google é presumido disponível sem teste em conta real.** O modelo de mapeamento Google só se escreve depois dessa verificação.

Por isso o onboarding executa um lead de teste de cada automação e registra o que a conta real expõe.

## Landing page: servidor-servidor, com receita por plataforma

LP própria usa as mesmas chaves, mas endpoint e token próprios para manter autenticação e proveniência. **Chamada direta do navegador é proibida** — token de workspace embarcado em JavaScript público é token vazado, e quem instala a LP costuma ser um gestor de tráfego terceiro, não o dono do CRM.

A objeção de que "LP antiga não tem backend" não se sustenta no caso real desta operação: **WordPress é backend PHP**. Contact Form 7, WPForms e Elementor Forms têm todos hook/webhook server-side; o POST sai do servidor do site, não do navegador. O mesmo vale para builders modernos, que expõem webhook nativo.

Por isso a saída não é uma "ponte server-side" genérica — abstração que ninguém sabe instalar — e sim **receitas prontas por plataforma**, entregues na tela de Integrações para o dev da LP copiar:

- **WordPress**: snippet PHP para o hook do plugin de formulário em uso;
- **Builders com webhook nativo** (Framer, Webflow, typebot e similares): apontar o webhook para a URL, com o token no header;
- **Stack própria**: exemplo de POST server-side, mais um exemplo serverless para quem só tem front.

A tela também precisa explicar, em linguagem não técnica, **por que** o token não pode ir para o navegador — senão alguém "resolve" colando no JavaScript. Se nenhuma receita servir, a integração fica pela Pluga; não se afrouxa o token.

## Regras

- **O schema Zod é a fonte única**; o tipo TypeScript é inferido, nunca escrito à mão em paralelo.
- **Validar na fronteira uma vez.** Não revalidar dado interno já confiável — o custo do Zod é irrelevante por lead, mas vira real se `.parse()` aparecer em toda camada.
- **Parser tolerante a evolução.** Propriedades desconhecidas não quebram o processamento; permanecem no bruto para compatibilidade futura.

**Consequences:** o pacote compartilhado do monorepo é menor do que parece. Como o adapter vive no worker, o app **não** precisa dos schemas dos conectores — precisa dos tipos de domínio para leitura e do catálogo de flags. Insumo direto para a decisão de estrutura do monorepo.
