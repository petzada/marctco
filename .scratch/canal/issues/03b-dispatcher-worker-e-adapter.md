# 03b — Dispatcher, worker e adapter WhatsMiau

**What to build:** Tentativas pendentes chegam ao WhatsMiau sem depender de um `queue.add` frágil. Dispatcher/fila recuperam antes do HTTP; depois que `sendText` começa, o worker nunca repete a chamada porque a API não documenta idempotency key.

**Blocked by:** 02 — Conexão WhatsMiau; 03a — Tentativa outbound e outbox transacional

**Status:** ready-for-agent

> Contrato externo: [Enviar Texto — Whatsmiau Cloud API v2](https://whatsmiau.dev/docs/getting-started). Somente `sendText` pertence a esta fase.

- [ ] Fila BullMQ dedicada ao canal, com `attempt_id` como `jobId` e payload mínimo `(attempt_id, workspace_id)`
- [ ] Dispatcher reivindica outbox pelo contrato privado, publica e marca `DISPATCHED`; queda entre claim/publicação/mark é recuperável sem segundo envio lógico
- [ ] Worker constrói `JobContext.origin.channel_outbound` por workspace e lê flags resolvidas no contexto
- [ ] `MessagingProvider.sendText` chama `POST /message/sendText/:instanceName` com header `apikey` e JSON `{ number, text }`; `number` é E.164 sem `+`/formatação e `text` é o template renderizado
- [ ] O campo opcional `delay` da API é omitido: os 30 segundos acontecem antes do HTTP na fila, para `SENT`/`first_contact_at` não antecederem o disparo
- [ ] Pela política local do MVP, HTTP 2xx grava `SENT`; isso não significa entrega/leitura. O adapter não exige ID externo porque `sendText` não publica shape de resposta
- [ ] HTTP acontece fora de transação: transação curta marca `PROCESSING`, uma única chamada externa, nova transação para `SENT` ou `FAILED`
- [ ] Transporte não usa retry automático. Depois de iniciar o HTTP, 4xx, 5xx, timeout, erro de rede ou crash terminam em `FAILED`; resultado ambíguo fica explícito e não volta a `PENDING`
- [ ] Defaults server-side: delay inicial de 30 segundos e rate limit de 6 envios/minuto por `workspace_id`; concorrência permite progresso de outro workspace
- [ ] Logs usam allowlist e não incluem credencial, token, telefone puro nem corpo integral da mensagem
- [ ] Variação automática do texto não é implementada; worker envia exatamente o template renderizado e a dívida fica registrada na spec
- [ ] Testes do dispatcher: passada idempotente, Redis indisponível, lease vencido e um workspace falhando sem bloquear outro
- [ ] Fixtures separam contrato oficial (request/campos publicados) de política local (2xx sintético, 4xx, 5xx, timeout); não inventam corpo de sucesso, códigos específicos, `Retry-After` ou ID externo
- [ ] Testes provam request exato, 2xx, 4xx, 5xx, timeout e crash pós-HTTP sem segunda chamada; nenhuma transação fica aberta durante HTTP

## Fora deste ticket

Criar tentativas a partir da atribuição/chegada, webhook inbound, UI e Seam 4 completo.
