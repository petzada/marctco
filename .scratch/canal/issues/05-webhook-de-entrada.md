# 05 — Webhook de entrada

**What to build:** Mensagens que o cliente envia de volta ao número da empresa viram **linha na timeline** do card — sem inbox. Um adapter normaliza o evento real do provedor, ignora ecos outbound, autentica por token opaco, deduplica e resolve a Oportunidade sem atravessar tenant.

**Blocked by:** 02 — Conexão WhatsMiau; 03a — Tentativa outbound e outbox transacional

**Status:** ready-for-agent

> Contrato externo: [Webhooks e Eventos — Whatsmiau Cloud API v2](https://whatsmiau.dev/docs/getting-started). Apenas `messages.upsert` e `connection.update` são configurados.

- [ ] `POST /webhook/set/:instanceName` configura `Authorization: Bearer <token>`; route handler compara o segredo em tempo constante, resolve conexão/workspace pelo hash e retorna 401 sem fato quando inválido
- [ ] Depois da resolução, toda escrita usa `JobContext.origin.channel_inbound` com `integration_connection_id`; não fabrica evento nem tentativa outbound
- [ ] Envelope aceito segue `{ event, instance, data, date_time }`; `instance` precisa corresponder ao `instanceName`; em mensagem, validar também `data.instanceId` quando presente; em conexão, validar `data.instance`
- [ ] `messages.upsert` extrai `data.key.id`, `remoteJid`, `fromMe`, `message`, `messageType` e `messageTimestamp`; `fromMe: true`, grupos (`@g.us`) e eventos não configurados são ignorados
- [ ] Texto simples usa `message.conversation`; para imagem, vídeo, áudio, documento ou reação, não baixar/storear mídia — gravar tipo genérico e caption quando existir
- [ ] `connection.update` mapeia `open → CONNECTED` e `close → DISCONNECTED`, preservando `statusReason` sem inventar catálogo de códigos; `ERROR` é só falha HTTP, payload inválido ou estado desconhecido
- [ ] Resolver transforma `remoteJid` individual em telefone normalizado e escolhe primeiro a Oportunidade ligada à tentativa daquele telefone; sem tentativa, aceita apenas a única Oportunidade aberta não mesclada; ambiguidade é ignorada com log seguro
- [ ] Fato `WHATSAPP_INBOUND_RECEIVED` na timeline com preview truncado e identificador externo
- [ ] Idempotência por `(integration_connection_id, data.key.id)`: retentativa do provedor não duplica fato
- [ ] `first_contact_at` usa `messageTimestamp` Unix validado; valor ausente/fora de faixa usa `date_time` ISO válido como fallback; ambos escrevem com `WHERE first_contact_at IS NULL`
- [ ] Inbound não cria inbox, não notifica atendente por push nesta fase
- [ ] Handler responde 200 após persistência ou descarte seguro como política local; a idempotência não depende de retry, ordenação ou semântica de resposta do provedor, que não são documentados
- [ ] Logs não incluem token, telefone puro, corpo integral ou `apikey` eventualmente presente no envelope
- [ ] Testes com fixtures oficiais: token inválido, instância divergente, eco outbound, grupo, texto, mídia sem download, conexão open/close, duplicata, match pela tentativa, fallback único, ambiguidade e timestamp em segundos

## Fora deste ticket

Envio outbound (03b/03c/04), copy PT-BR final no card (06), Seam 4 (07).
