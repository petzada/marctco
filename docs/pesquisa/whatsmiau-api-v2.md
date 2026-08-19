# WhatsMiau Cloud API v2 — confronto com a Fase 4 (Canal)

**Data da verificação:** 19 ago. 2026  
**Fonte primária exclusiva:** [Documentação oficial da WhatsMiau Cloud — Referência da API v2](https://whatsmiau.dev/docs/getting-started)  
**Material confrontado:** `.scratch/canal/spec.md`, `README.md` e tickets `00` a `07`.

## Escopo e método

Este documento verifica somente afirmações e pressupostos da spec/tickets que atravessam o contrato da WhatsMiau Cloud. Regras internas do CRM — RLS, outbox Postgres, gatilhos, opt-in, template, perfis, timeline e rate limit próprio — só aparecem quando dependem de um comportamento externo.

“Documentado” abaixo significa explicitamente garantido pela referência oficial consultada. “Não documentado” não significa necessariamente que o provedor não faça; significa que a Fase 4 não pode fixar fixture ou semântica como contrato oficial sem confirmação primária adicional.

## Resumo executivo

O desenho geral é compatível com a API v2: autenticação por `apikey`, instâncias identificadas por `instanceName`, pareamento por QR, consulta de estado, logout sem exclusão, envio de texto e webhooks por instância existem nos endpoints esperados.

> **Follow-up aplicado em 19 ago. 2026:** a spec e os tickets 00, 02, 03a, 03b, 05, 06 e 07 foram ajustados contra esta auditoria. Em especial: rotas/payloads oficiais, estados divergentes, Bearer customizado, fixtures separadas por origem, ausência de ID/idempotência documentados e política de no máximo uma invocação `sendText`.

Há, porém, seis ajustes importantes antes de implementar os adapters:

1. O endpoint de texto é `POST /message/sendText/:instance`, com corpo `{ number, text }`; `number` é documentado com DDI/DDD e **sem `+`**, então o adapter precisa converter o E.164 persistido para dígitos.
2. A documentação não publica o corpo da resposta de sucesso do `sendText`. Não é possível fixar hoje de qual campo virá o “identificador externo” nem provar “aceite do provedor” além de uma resposta HTTP bem-sucedida.
3. Não existe chave de idempotência documentada no `sendText`. O outbox impede duplicação lógica na maior parte do fluxo, mas não garante exatamente uma entrega se o processo cair depois de o provedor enviar e antes de o CRM persistir `SENT`.
4. Webhook com token opaco é viável por `webhook.headers`, mas isso é um **Bearer secret definido pelo próprio CRM**, não uma assinatura/HMAC nativa da WhatsMiau. Headers customizados só estão documentados em `POST /webhook/set/:instance`.
5. A fixture de webhook deve configurar `byEvents: true`, `base64: false` e filtrar pelo menos `messages.upsert` e `connection.update`. Sem isso, os tickets pressupõem um envelope unitário que a configuração não garante.
6. Os estados divergem entre superfícies oficiais: polling usa `open | closed | connecting | qr-code`; o webhook usa `open | close`. `ERROR` não é estado oficial e precisa ser uma normalização local, sem inventar classificação por `statusReason`.

## Contrato oficial aplicável

### Base URL, versão, autenticação e escopo

Fonte: [Referência da API v2 — Introdução e Autenticação](https://whatsmiau.dev/docs/getting-started#autenticação)

- Base URL REST: `https://api.whatsmiau.dev/v2`.
- Todas as requisições REST usam o header `apikey`.
- A chave é escopada por **conta** e alcança as instâncias dessa conta.
- A API não conhece `workspace`. O isolamento workspace → conexão é responsabilidade do marctco.
- O nome escolhido em `instanceName` é o identificador público usado nas rotas seguintes. Não é necessário consultar um ObjectID interno.

Consequências para os tickets:

- A credencial server-side da conta pode atender vários workspaces, mas tem blast radius de todas as instâncias da conta. Ela nunca pode chegar ao browser ou a logs.
- `instanceName` precisa ser único dentro da conta da WhatsMiau, não apenas dentro de um workspace do CRM. A geração deve incluir componente globalmente não colidente e o valor exato deve ser persistido.
- A constraint de “uma instância WhatsMiau não desligada por workspace” é regra de produto; não é imposta pela API.

### Instâncias, QR, estado, logout e reconexão

Fonte: [Referência da API v2 — Instâncias](https://whatsmiau.dev/docs/getting-started#instâncias)

Endpoints relevantes:

- `POST /instance/create`
  - obrigatório: `instanceName`;
  - opcional: `qrcode`;
  - aceita configuração inicial de webhook, mas a lista publicada nessa operação não inclui headers customizados;
  - o exemplo de criação mostra estado inicial `connecting`, mas não publica um schema completo de resposta.
- `GET /instance/fetchInstances`
  - lista todas as instâncias da conta e o estado atual;
  - não há endpoint individual “obter instância” documentado.
- `GET /instance/connect/:name`
  - inicia a conexão;
  - resposta exemplificada: `id`, `connected`, `base64` e `pairingCode`.
- `GET /instance/connect/:name/image`
  - devolve PNG puro;
  - responde `204 No Content` quando a instância já está conectada.
- `GET /instance/connectionState/:name`
  - estados: `open`, `closed`, `connecting`, `qr-code`;
  - instância suspensa retorna `closed` com `suspended: true`.
- `DELETE /instance/logout/:name`
  - encerra a sessão, preserva a instância;
  - a reconexão posterior usa novamente `/instance/connect/:name`.
- `DELETE /instance/delete/:name`
  - remove permanentemente e não é necessário para o escopo atual.

Normalização segura:

| Contrato oficial | Estado local canônico | Observação |
|---|---|---|
| `open` | `CONNECTED` | Conectado. |
| `connecting` | `CONNECTING` | Pareamento em andamento. |
| `qr-code` | `QR_PENDING` | Aguardando leitura do QR — distinto de `CONNECTING` ([CONTEXT.md](../../CONTEXT.md), [ADR-0005](../adr/0005-idioma-codigo-en-ui-pt-br.md)). |
| `closed` | `DISCONNECTED` | Webhook usa `close` para a mesma desconexão. |
| `suspended: true` (com `closed`) | `SUSPENDED` | Suspensão da conta; não inferir pelo `statusReason`. |
| falha HTTP, payload inválido ou estado desconhecido | `ERROR` | `ERROR` é local, não valor da API. |

A expiração temporal do QR não é especificada. O ticket 02 pode tratá-lo como dado efêmero do produto, mas não deve fixar TTL atribuído ao provedor. O polling deve consultar `connectionState`; chamar repetidamente `connect` como polling não é comportamento documentado.

### Envio de texto

Fonte: [Referência da API v2 — Mensagens, Enviar Texto](https://whatsmiau.dev/docs/getting-started#enviar-texto)

Contrato publicado:

```text
POST /message/sendText/:instance
headers:
  apikey: <chave>
  Content-Type: application/json
body:
  number: string   # obrigatório; DDI + DDD, exemplo 551199998888
  text: string     # obrigatório
  delay?: number   # milissegundos, máximo 300000
```

Também existem campos opcionais `linkPreview`, `mentionsEveryOne`, `mentioned` e `quoted`, não necessários no MVP.

Pontos para o adapter:

- O banco usa `whatsapp_phone_e164`; os exemplos oficiais usam somente dígitos. O adapter deve remover o `+` e qualquer formatação depois de validar E.164, sem alterar o número semântico.
- O delay de 30 segundos dos tickets é da fila interna. Não é necessário enviar também `delay` ao provedor; fazer ambos duplicaria o atraso.
- A referência não documenta limite de tamanho do texto.
- A referência não mostra o corpo nem os headers da resposta de sucesso do `sendText`.
- A referência não documenta chave de idempotência, correlação fornecida pelo cliente ou consulta posterior por ID da requisição.
- A referência não documenta códigos/formatos de erro do envio, `429`, política de retry ou timeout recomendado.

Portanto, fixtures de resposta, extração de ID externo e taxonomia transitório/terminal não podem ser apresentadas como contrato oficial neste momento. A implementação pode adotar uma política local conservadora, mas deve nomeá-la como tal e manter o parser de sucesso estrito e substituível.

### Configuração de webhook e autenticação inbound

Fonte: [Referência da API v2 — Webhooks, Configurar e Consultar](https://whatsmiau.dev/docs/getting-started#webhooks)

Endpoints:

- `POST /webhook/set/:instance`
- `GET /webhook/find/:instance`

Corpo publicado para configuração:

```text
webhook.enabled?: boolean
webhook.url?: string
webhook.events?: string[]
webhook.headers?: object
webhook.byEvents?: boolean
webhook.base64?: boolean
```

A API permite headers customizados e o exemplo oficial usa:

```text
Authorization: Bearer meu_token
```

Configuração recomendada para o contrato dos tickets:

```json
{
  "webhook": {
    "enabled": true,
    "url": "https://<host-publico>/api/webhooks/whatsmiau",
    "events": ["messages.upsert", "connection.update"],
    "headers": {
      "Authorization": "Bearer <token-opaco-gerado-pelo-crm>"
    },
    "byEvents": true,
    "base64": false
  }
}
```

A URL precisa ser HTTPS pública. Na criação/atualização de instância, a documentação bloqueia localhost, IPs privados e redes internas. Isso precisa ser atendido nos ambientes em que webhook real for configurado.

Limites do contrato oficial:

- Não há assinatura HMAC, timestamp assinado, rotação coordenada ou header nativo de autenticação de webhook documentado.
- O token opaco é autenticação por segredo compartilhado configurada pelo marctco via header customizado.
- Não estão documentados retries, timeout de entrega, resposta HTTP esperada, ordenação nem garantia de entrega.
- O ticket 05 pode responder `200` após persistência/descarte como política interna, mas não deve atribuir à WhatsMiau a garantia de “evitar retry inútil”.
- Em `create`/`instance/update`, `webhook.headers` não consta entre os campos publicados. Para autenticação inbound, usar explicitamente `/webhook/set/:instance`.
- A descrição de `base64` varia na própria página: nas operações de instância fala em mídia em base64; em `/webhook/set` fala em payload codificado. Como mídia está fora do MVP, fixar `false` evita depender dessa ambiguidade.

### Envelope e mensagem inbound

Fonte: [Referência da API v2 — Eventos de Webhook e `messages.upsert`](https://whatsmiau.dev/docs/getting-started#eventos-de-webhook)

Envelope padrão:

```text
event: string
instance: string
data: T
date_time: string
sender?: string
server_url?: string
```

Para `messages.upsert`, os campos aplicáveis são:

- `data.key.remoteJid`: JID do chat;
- `data.key.fromMe`: distingue mensagem enviada pela própria instância;
- `data.key.id`: identificador único da mensagem;
- `data.pushName`: nome de exibição;
- `data.status`: `sent` ou `received`;
- `data.message.conversation`: texto simples;
- `data.messageType`: por exemplo `conversation`;
- `data.messageTimestamp`: Unix timestamp em segundos;
- `data.instanceId`: identificador da instância.

Consequências:

- O eco outbound deve ser descartado primariamente por `data.key.fromMe === true`. `status` pode ser validação adicional, não substituto.
- A chave oficial para dedupe inbound é `data.key.id`.
- O telefone de um chat individual vem em `remoteJid` no formato exemplificado `5511...@s.whatsapp.net`; o adapter deve aceitar somente o sufixo individual suportado e extrair/normalizar os dígitos.
- JIDs de grupo terminam em `@g.us`. Como grupos estão fora do escopo, precisam ser descartados explicitamente; hoje o ticket 05 não registra essa guarda.
- O instante mais próximo da mensagem é `data.messageTimestamp`; `date_time` é o timestamp ISO do envelope. O contrato interno deve escolher `messageTimestamp` para `first_contact_at`, validando faixa e usando `date_time` apenas como fallback seguro.
- Como o token da rota resolve uma conexão, o handler deve também conferir se `envelope.instance` (e, quando presente, `data.instanceId`) coincide com o `instanceName` persistido. Isso impede que um payload válido para um token seja atribuído a outra instância.
- O evento inclui mensagens recebidas **e enviadas**, justificando o filtro de eco.

O ticket fala apenas em registrar que houve resposta, não em inbox. Para texto simples, o preview pode vir de `data.message.conversation`. A referência também prevê mídia e outros tipos; como estão fora do escopo, o normalizador deve produzir preview genérico ou descartar tipos não suportados de forma explícita, sem presumir que todo evento tenha `conversation`.

### Atualização de conexão por webhook

Fonte: [Referência da API v2 — Evento `connection.update`](https://whatsmiau.dev/docs/getting-started#connectionupdate)

Campos:

- `data.instance`;
- `data.wuid`, presente quando conectado;
- `data.profileName`, presente quando conectado;
- `data.profilePictureUrl`, opcional;
- `data.state`: `open | close`;
- `data.statusReason`: `200` para sucesso; outros valores são descritos apenas como erro.

Há uma diferença literal entre as superfícies:

- polling: `closed`;
- webhook: `close`.

Mapear ambos para `DISCONNECTED`. A documentação não fornece catálogo de `statusReason`; portanto, não se deve inventar quais códigos significam logout, suspensão, falha transitória ou erro terminal. `wuid`, nome e foto também não devem ser tratados como segredos de autenticação, mas são dados pessoais/operacionais e não precisam ir ao browser no MVP.

### Estado de entrega

Fonte: [Referência da API v2 — Evento `messages.update`](https://whatsmiau.dev/docs/getting-started#messagesupdate)

O evento oficial `messages.update` informa mudanças para:

- `DELIVERY_ACK`;
- `READ`.

O escopo atual não assina nem usa esse evento. Assim, `SENT` nos tickets significa no máximo “chamada de envio considerada bem-sucedida pelo adapter”, não entrega ao dispositivo nem leitura pelo cliente. A copy da timeline deve evitar “entregue” ou “lida”.

### Pool/histórico

Fonte: [Referência da API v2 — MCP, instância, pool e slot](https://whatsmiau.dev/docs/getting-started#mcp--model-context-protocol)

A documentação afirma que criar, conectar, enviar mensagens e configurar webhook funcionam sem pool; pool/slot serve à retenção e consulta de histórico no MCP. A Fase 4 não precisa contratar ou modelar pool para o fluxo REST proposto.

## Matriz requisito/ticket → contrato oficial → ajuste necessário

| Requisito ou ticket | Contrato oficial | Ajuste necessário |
|---|---|---|
| Spec/02: API v2 e credencial server-side | Base `https://api.whatsmiau.dev/v2`; header `apikey`; escopo por conta | Fixar base URL e nome do header na fixture. Tratar a chave como segredo com alcance sobre todas as instâncias da conta. |
| Spec/02: uma instância por workspace | API permite listar várias instâncias; `instanceName` é único dentro da conta | Manter constraint local. Gerar `instanceName` sem colisão entre workspaces e persistir exatamente esse nome. |
| 02: criar instância | `POST /instance/create` com `instanceName` obrigatório e `qrcode` opcional | Fixar request. Não pressupor schema completo da resposta além dos campos efetivamente observados/documentados. |
| 02: “obter instância” | Não há GET individual documentado; há `fetchInstances` e `connectionState/:name` | Renomear internamente a operação para listar/filtrar ou consultar estado; não criar endpoint fictício. |
| 02: QR | `GET /instance/connect/:name` retorna exemplo com `base64`; `/image` retorna PNG e 204 se conectado | Escolher uma superfície. Para JSON server-side, usar `connect/:name` e não expor `apikey`; não fixar TTL de QR não documentado. |
| 02: polling de estado | `GET /instance/connectionState/:name`: `open`, `closed`, `connecting`, `qr-code`, e possível `suspended` | Polling deve usar esse endpoint. Mapear estado por tabela explícita. |
| 02: estado local `ERROR` | Não existe `ERROR` oficial | Reservar `ERROR` para falha local/contrato inválido; não serializar como se viesse do provedor. |
| 02: desconectar/reconectar | `DELETE /instance/logout/:name` preserva instância; `connect/:name` reconecta | Compatível, sem ajuste estrutural. Não usar `delete` para “desconectar”. |
| 02/05: configurar webhook autenticado | `POST /webhook/set/:instance` aceita `headers` customizados | Usar esse endpoint depois da criação e enviar `Authorization: Bearer <token>`. Não depender do webhook embutido em `create/update` para headers. |
| 05: “webhook autenticado do WhatsMiau” | Não há assinatura nativa documentada; há header customizado configurável | Corrigir a interpretação: autenticação por bearer secret do CRM, comparar em tempo constante e armazenar só hash. |
| 05: envelope unitário | `byEvents` controla POST por evento versus agrupamento | Fixar `byEvents: true`; sem isso, a fixture de um envelope por request é pressuposição. |
| 05: eventos necessários | Eventos oficiais `messages.upsert` e `connection.update` | Configurar filtro explícito para esses dois; não omitir `events`, pois omissão envia todos. |
| 05: mensagem inbound | `messages.upsert` traz recebidas e enviadas; `key.fromMe` identifica eco | Filtrar `fromMe`, usar `key.id` no dedupe e validar `instance`/`instanceId`. |
| 05: resolução por telefone | `key.remoteJid` usa JID, exemplo `número@s.whatsapp.net`; grupos usam `@g.us` | Criar parser fechado para chat individual; descartar grupo e JID desconhecido. |
| 05: timestamp do contato | `messageTimestamp` é Unix em segundos; envelope tem `date_time` ISO | Usar `messageTimestamp` validado como principal e `date_time` como fallback documentado. |
| 05: preview | Texto simples fica em `data.message.conversation`; outros tipos têm estruturas distintas | Não acessar `conversation` sem discriminar `messageType`; definir preview genérico/descarte para mídia e interativos. |
| 05: resposta 200 evita retry | Retry e semântica de status do receptor não são documentados | Manter como política local, sem afirmar comportamento do provedor; testar idempotência independentemente de retry. |
| 02/05: conexão via webhook | `connection.update.state` é `open | close`; polling usa `closed` | Normalizar `close` e `closed`; não depender de igualdade entre contratos. |
| 03b/07: `sendText` | `POST /message/sendText/:instance`, corpo obrigatório `{ number, text }` | Fixar endpoint/método/body na interface e fixture. |
| 03b: destino E.164 | API exemplifica DDI/DDD apenas com dígitos | Converter `+551...` para `551...` no limite do adapter após validação. |
| 03b: delay de 30 segundos | API oferece `delay` opcional em ms, mas tickets já atrasam na fila | Usar apenas delay interno; omitir `delay` do request para não somar atrasos. |
| 03a/03b: ID externo no sucesso | Resposta de sucesso do `sendText` não possui schema publicado | Não inventar campo. Tornar ID opcional e bloquear fixture “real” até confirmação primária; 2xx pode ser política de aceite local claramente nomeada. |
| 03a: `first_contact_at` no aceite | A API não define “aceite”; entrega/leitura chegam em `messages.update` | Definir que, no MVP, o instante é o 2xx do envio, não entrega. Evitar copy de “entregue”. |
| 03b: 4xx terminal, retry/backoff | Códigos e formatos de erro de envio não são publicados | Classificação é política local. Tratar `429`, 5xx, timeout e conexão como candidatos transitórios, mas não atribuir essa regra à docs; guardar erro sanitizado. |
| 03b/07: reprocessar nunca chama `sendText` duas vezes | Não há idempotency key documentada | Reduzir a garantia para “não repete após `SENT` persistido”. Documentar janela de duplicação em crash pós-envio/pré-commit ou obter garantia primária do provedor antes de prometer exatamente uma entrega. |
| 03b: rate limit 6/min/workspace | Nenhum limite oficial de envio é publicado | Manter como mitigação interna, não como limite do provedor. Preparar tratamento de `429` sem presumir headers específicos. |
| 06: timeline de envio | `messages.update` separa entrega (`DELIVERY_ACK`) e leitura (`READ`) | Rotular o fato atual como “envio solicitado/aceito”, não “entregue” nem “lido”, salvo futura assinatura de `messages.update`. |
| Spec: sem pool/histórico | Envio, conexão e webhook funcionam sem pool | Nenhum ajuste; não adicionar pool ao schema da Fase 4. |

## Lacunas que impedem uma fixture “real” completa

Fonte: [Referência oficial da API v2](https://whatsmiau.dev/docs/getting-started)

Os tickets 02 e 03b pedem fixtures versionadas de requests, responses e erros. Requests e webhooks podem ser fixados com a documentação atual; estas partes de response/error continuam sem contrato publicado:

1. corpo e headers da resposta bem-sucedida de `POST /message/sendText/:instance`;
2. campo do identificador externo retornado sincronicamente, se houver;
3. formatos de erro e códigos específicos de `sendText`;
4. semântica de `429` e eventual `Retry-After`;
5. timeout recomendado;
6. chave de idempotência ou garantia equivalente;
7. política de retry/ordenação dos webhooks;
8. catálogo de `connection.update.statusReason`;
9. TTL/rotação do QR.

Até haver fonte primária para esses itens, as fixtures devem separar:

- **fixture oficial:** somente campos publicados;
- **fixture de política local:** respostas sintéticas do fake para testar sucesso, timeout, retry e falha;
- **fixture observada:** somente depois de captura contra conta de teste e registrada explicitamente como observação, não garantia documental.

## Veredito por ticket

- **00:** sem dependência direta de endpoint; a separação entre conta WhatsMiau e workspace precisa constar no vocabulário de conexão.
- **01:** sem conflito com a API. Opt-in, template e gatilho são domínio interno.
- **02:** viável após fixar rotas, `instanceName`, mapeamento de estados e configuração de webhook via `/webhook/set`; não há “obter instância” individual nem TTL oficial do QR.
- **03a:** persistência é interna, mas “identificador externo” deve permanecer opcional; “aceite do provedor” precisa ser definido como sucesso HTTP local, não entrega.
- **03b:** endpoint e payload estão confirmados. Resposta de sucesso, erros, retry e idempotência externa não estão documentados; é o ticket com maior ajuste contratual.
- **03c:** sem novo contrato externo; depende de 03b não prometer exatamente uma entrega onde a API não oferece idempotência documentada.
- **04:** sem novo contrato externo; reutiliza o mesmo `sendText`.
- **05:** viável com Bearer customizado, `byEvents: true`, validação de instância, parser de JID e timestamp explícito. Retry de webhook não pode ser presumido.
- **06:** copy deve dizer “enviada” no sentido operacional do CRM, nunca “entregue/lida” sem usar `messages.update`.
- **07:** o seam prova idempotência interna depois de `SENT`, mas não consegue provar ausência de duplicata na janela crash pós-HTTP/pré-commit sem suporte idempotente do provedor.

## Contrato mínimo recomendado para implementação

1. Criar instância com `POST /instance/create` e `instanceName` globalmente não colidente.
2. Configurar webhook em chamada separada a `POST /webhook/set/:instance`, com Bearer customizado, `byEvents: true`, `base64: false` e eventos filtrados.
3. Parear por `GET /instance/connect/:name`; consultar estado por `GET /instance/connectionState/:name`.
4. Considerar apta a enviar somente quando o estado consultado/normalizado for `CONNECTED`.
5. Enviar texto por `POST /message/sendText/:instance` com `{ number: digitsOnly, text }`, omitindo `delay`.
6. Considerar qualquer semântica de sucesso além de HTTP 2xx como não definida até obter resposta oficial; manter `external_message_id` opcional.
7. No inbound, autenticar Bearer, validar identidade da instância, aceitar somente `messages.upsert`, `fromMe === false` e JID individual, deduplicar por `key.id`.
8. Normalizar conexão aceitando `open`, `close` e `closed`; tratar estados desconhecidos/falhas como erro local observável.
9. Não afirmar exatamente uma entrega: a garantia implementável com o contrato publicado é no máximo “uma tentativa lógica persistida”, com janela residual de duplicação externa.

