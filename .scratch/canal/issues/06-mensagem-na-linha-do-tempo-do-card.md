# 06 — Mensagem na linha do tempo do card

**What to build:** No card do lead, a linha do tempo mostra envio automático, falha definitiva e resposta do cliente com copy legível em PT-BR. O card também informa se o WhatsApp do workspace está conectado, sem expor credencial.

**Blocked by:** 03a — Tentativa outbound e outbox transacional; 05 — Webhook de entrada

**Status:** ready-for-agent

> Origem dos tipos inbound: [`messages.upsert` — Whatsmiau Cloud API v2](https://whatsmiau.dev/docs/getting-started).

- [ ] View-model trata `WHATSAPP_OUTBOUND_SENT`, `WHATSAPP_OUTBOUND_FAILED` e `WHATSAPP_INBOUND_RECEIVED` com rótulos e descrições em PT-BR
- [ ] Copy outbound diz “envio aceito pelo canal” ou equivalente; nunca “entregue” ou “lida”, pois `messages.update` não integra esta fase
- [ ] Texto exibido truncado quando necessário; não expor thread completo
- [ ] Inbound de mídia/reação usa copy genérica pelo `messageType` e caption opcional; URL/arquivo do provedor não é exibido nem persistido
- [ ] Leitura escopada: Atendente vê só leads seus; Supervisor vê time; Gestão e Direção veem tudo — incluindo novos tipos
- [ ] Fatos de mensagem ordenados com os demais por instante
- [ ] Indicador booleano conectado/desconectado no card é visível a Atendente, Supervisor, Gestão e Direção dentro do escopo do lead; nunca carrega token ou identificador secreto
- [ ] Testes de view-model: copy dos três tipos; truncamento; indicador sem segredo
- [ ] Testes de leitura escopada na operação nomeada de timeline com fatos de mensagem

## Fora deste ticket

Novos tipos de fato (criados em 03a/05), notificação push de falha, Seam 4 E2E (07).
