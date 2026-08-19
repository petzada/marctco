# 02 — Conexão WhatsMiau

**What to build:** Direção conecta **uma instância WhatsMiau por workspace** em Integrações > WhatsApp; Gestão acompanha o status. O adapter fixa o contrato do provedor para pareamento por QR, estado e desconexão. Segredos ficam server-side e isolados — ainda sem enviar mensagem.

**Blocked by:** 00 — Contratos canônicos do canal

**Status:** ready-for-agent

> Contrato externo: [Instâncias e Webhooks — Whatsmiau Cloud API v2](https://whatsmiau.dev/docs/getting-started).

- [ ] Adapter fixa base URL `https://api.whatsmiau.dev/v2` e envia `apikey` em toda chamada; a chave de conta vem de configuração server-side e nunca do tenant/browser
- [ ] Provedor e `IntegrationSurface` WhatsMiau registrados; constraint parcial garante no máximo uma conexão não desligada por workspace sem restaurar a unicidade global removida pelo ADR-0031
- [ ] `instanceName` estável e globalmente único é derivado do workspace e persistido como identificador usado em todas as rotas
- [ ] Estado de pareamento normaliza `open → CONNECTED`, `closed → DISCONNECTED`, `connecting → CONNECTING`, `qr-code → QR_PENDING`, `suspended: true → SUSPENDED`; erro/resposta inválida → `ERROR`
- [ ] Adapter implementa exatamente `POST /instance/create`, `GET /instance/connect/:name`, `GET /instance/connectionState/:name`, `DELETE /instance/logout/:name`, `GET /instance/fetchInstances` e `POST /webhook/set/:instance`
- [ ] Sequência segura: criar com `qrcode: false`, `groupsIgnore: true`, `syncFullHistory: false` → configurar webhook autenticado por `/webhook/set` → chamar `/instance/connect/:name` para obter QR; a instância não conecta antes de o webhook ter header secreto
- [ ] Webhook é configurado com URL HTTPS pública, `byEvents: true`, `base64: false` e header `Authorization: Bearer <token opaco>`; o tenant guarda apenas o hash
- [ ] UI lê `base64` e `pairingCode` opcionais de `connect/:name`; não assume TTL não documentado e atualiza por polling de `connectionState/:name`
- [ ] Tela Integrações > WhatsApp: Direção inicia pareamento, exibe QR e desconecta/reconecta; Gestão e Direção veem status
- [ ] Atendente e Supervisor não acessam a tela de Integrações
- [ ] `apikey` nunca retorna ao browser; token do webhook é mostrado somente no instante interno de configuração e depois permanece apenas como hash
- [ ] Operações nomeadas: Gestão/Direção leem status; somente Direção cria, pareia, desconecta/reconecta e rotaciona token
- [ ] Testes de contrato usam fixtures oficiais para criação, QR, estados `open/closed/connecting/qr-code`, suspensão, logout e configuração de webhook
- [ ] Seam 3: tabela de conexão sob RLS; leitura e escrita cross-workspace recusadas

## Fora deste ticket

Template, gatilho, envio, fila, webhook handler, timeline.
