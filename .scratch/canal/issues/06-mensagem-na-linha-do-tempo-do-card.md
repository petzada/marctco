# 06 — Mensagem na linha do tempo do card

**What to build:** No card do lead, a linha do tempo mostra envio automático, falha definitiva e resposta do cliente com copy legível em PT-BR. O card também informa se o WhatsApp do workspace está conectado, sem expor credencial.

**Blocked by:** 03a — Tentativa outbound e outbox transacional; 05 — Webhook de entrada

**Status:** done

> Origem dos tipos inbound: [`messages.upsert` — Whatsmiau Cloud API v2](https://whatsmiau.dev/docs/getting-started).

- [x] View-model trata `WHATSAPP_OUTBOUND_SENT`, `WHATSAPP_OUTBOUND_FAILED` e `WHATSAPP_INBOUND_RECEIVED` com rótulos e descrições em PT-BR
- [x] Copy outbound diz “envio aceito pelo canal” ou equivalente; nunca “entregue” ou “lida”, pois `messages.update` não integra esta fase
- [x] Texto exibido truncado quando necessário; não expor thread completo
- [x] Inbound de mídia/reação usa copy genérica pelo `messageType` e caption opcional; URL/arquivo do provedor não é exibido nem persistido
- [x] Leitura escopada: Atendente vê só leads seus; Supervisor vê time; Gestão e Direção veem tudo — incluindo novos tipos
- [x] Fatos de mensagem ordenados com os demais por instante
- [x] Indicador booleano conectado/desconectado no card é visível a Atendente, Supervisor, Gestão e Direção dentro do escopo do lead; nunca carrega token ou identificador secreto
- [x] Testes de view-model: copy dos três tipos; truncamento; indicador sem segredo
- [x] Testes de leitura escopada na operação nomeada de timeline com fatos de mensagem

## Fora deste ticket

Novos tipos de fato (criados em 03a/05), notificação push de falha, Seam 4 E2E (07).

## Evidence

- View-model `buildLeadTimelineItemView`: outbound “Envio aceito pelo canal”, falha “Tentativa automática encerrada sem envio”, inbound “Resposta recebida no WhatsApp”; preview truncado em 140; mídia/reação com copy genérica + caption; URL `https?://` do provedor omitida. Sem composer/inbox.
- `listLeadTimeline` seleciona `message_preview` só em `WHATSAPP_INBOUND_RECEIVED`; não devolve `external_message_id`, token ou last4. Fatos WhatsApp entram na ordem por instante com os demais. Escopo ADR-0015 via `opportunityScopeSql`.
- Operação nomeada `getLeadWhatsAppConnectionIndicator` devolve só `{ connected }`. `connected` exige `pairing_state = CONNECTED` e `status = ACTIVE`. Fora do escopo do lead → “Lead not found”. `getWhatsAppConnection` permanece FORBIDDEN para Atendente/Supervisor.
- Card: `StatusBadge` “WhatsApp conectado/desconectado” visível a todos no escopo; boolean serializado, sem token/last4/instance secret/apikey.
- Testes: timeline DB (11), conexão+indicador (8), inbound (17), outbound (10), RLS (81), view-model (8), indicador UI (1), page (2). Typecheck, drift e migration-safety verdes. ESLint dos arquivos do 06 verde. `pnpm lint` do repo ainda falha em `tests/seam4-assignment.test.ts` (ticket 07; fora do ownership).
- Revisão Composer 2.5 (`4cc36163-f4fe-4f58-bcef-83745e59215d`): approve, sem correções. Gates reexecutados verdes. Sem commit.
