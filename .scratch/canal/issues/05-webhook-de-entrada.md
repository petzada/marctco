# 05 — Webhook de entrada

**What to build:** Mensagens que o cliente envia de volta ao número da empresa viram **linha na timeline** do card — sem inbox. Um adapter normaliza o evento real do provedor, ignora ecos outbound, autentica por token opaco, deduplica e resolve a Oportunidade sem atravessar tenant.

**Blocked by:** 02 — Conexão WhatsMiau; 03a — Tentativa outbound e outbox transacional

**Status:** done

> Contrato externo: [Webhooks e Eventos — Whatsmiau Cloud API v2](https://whatsmiau.dev/docs/getting-started). Apenas `messages.upsert` e `connection.update` são configurados.

- [x] `POST /webhook/set/:instanceName` configura `Authorization: Bearer <token>`; route handler compara o segredo em tempo constante, resolve conexão/workspace pelo hash e retorna 401 sem fato quando inválido
- [x] Depois da resolução, toda escrita usa `JobContext.origin.channel_inbound` com `integration_connection_id`; não fabrica evento nem tentativa outbound
- [x] Envelope aceito segue `{ event, instance, data, date_time }`; `instance` precisa corresponder ao `instanceName`; em mensagem, validar também `data.instanceId` quando presente; em conexão, validar `data.instance`
- [x] `messages.upsert` extrai `data.key.id`, `remoteJid`, `fromMe`, `message`, `messageType` e `messageTimestamp`; `fromMe: true`, grupos (`@g.us`) e eventos não configurados são ignorados
- [x] Texto simples usa `message.conversation`; para imagem, vídeo, áudio, documento ou reação, não baixar/storear mídia — gravar tipo genérico e caption quando existir
- [x] `connection.update` mapeia `open → CONNECTED` e `close → DISCONNECTED`, preservando `statusReason` sem inventar catálogo de códigos; `ERROR` é só falha HTTP, payload inválido ou estado desconhecido
- [x] Resolver transforma `remoteJid` individual em telefone normalizado e escolhe primeiro a Oportunidade ligada à tentativa daquele telefone; sem tentativa, aceita apenas a única Oportunidade aberta não mesclada; ambiguidade é ignorada com log seguro
- [x] Fato `WHATSAPP_INBOUND_RECEIVED` na timeline com preview truncado e identificador externo
- [x] Idempotência por `(integration_connection_id, data.key.id)`: retentativa do provedor não duplica fato
- [x] `first_contact_at` usa `messageTimestamp` Unix validado; valor ausente/fora de faixa usa `date_time` ISO válido como fallback; ambos escrevem com `WHERE first_contact_at IS NULL`
- [x] Inbound não cria inbox, não notifica atendente por push nesta fase
- [x] Handler responde 200 após persistência ou descarte seguro como política local; a idempotência não depende de retry, ordenação ou semântica de resposta do provedor, que não são documentados
- [x] Logs não incluem token, telefone puro, corpo integral ou `apikey` eventualmente presente no envelope
- [x] Testes com fixtures oficiais: token inválido, instância divergente, eco outbound, grupo, texto, mídia sem download, conexão open/close, duplicata, match pela tentativa, fallback único, ambiguidade e timestamp em segundos

## Fora deste ticket

Envio outbound (03b/03c/04), copy PT-BR final no card (06), Seam 4 (07).

## Evidence

- Route `POST /api/webhooks/whatsmiau`: Bearer opaco, `resolveWorkspaceByIntegrationToken` devolve `(workspace_id, integration_connection_id)` pela função privada existente (sem oitava), miss compara digest com dummy em tempo constante, 401 sem fato. JSON inválido e descarte seguro respondem 200. OPTIONS 405 sem CORS.
- Persistência `recordWhatsAppInbound` constrói `JobContext.origin.channel_inbound` com o `integration_connection_id` real desde o início e revalida sob RLS. Sem placeholder. Parser fechado. Fato `WHATSAPP_INBOUND_RECEIVED` com preview ≤140, `external_message_id` e dedupe `ON CONFLICT`. `first_contact_at` write-once. Sem inbox, push, evento de integração ou tentativa outbound.
- Migrations: `20260819010500_channel_inbound_webhook` (colunas, CHECK, FK, unique parcial) e `20260820010100_token_resolver_returns_connection` (retorno mínimo da função existente). ADR-0005, ADR-0006 e ADR-0019 (emenda 2026-08-20) mapeiam os dois IDs técnicos.
- Testes: domain parser (10), HTTP (5), db inbound (17, inclusive ID fabricado, cross-workspace e outro provider), RLS/Seam 3 (81). Typecheck, lint, migration-safety e drift verdes.
- Revisão Composer 2.5 (`d9afb14c-267c-4d9c-935c-552dd11278f5`): approve da implementação inicial. Revisão da correção de origem (`eead93ac-a4fc-49cc-b60d-390aaf993f01`): approve-with-fixes — só reordenou a emenda do ADR-0019. Gates reexecutados verdes. Sem commit.
