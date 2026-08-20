# 00 — Contratos canônicos do canal

**What to build:** Fechar no vocabulário e nos ADRs os contratos irreversíveis da Fase 4 antes da primeira migration: origem real do job outbound, outbox pré-contexto, opt-in, nomes de conexão/tentativa/fatos e a exceção de instância única WhatsMiau dentro do modelo de N conexões.

**Blocked by:** None — can start immediately.

**Status:** done

> Contrato externo: [Whatsmiau Cloud API v2](https://whatsmiau.dev/docs/getting-started). Nomes do domínio não devem reproduzir campos que o adapter já normaliza.

- [x] `CONTEXT.md` define em PT-BR: opt-in de WhatsApp, conexão WhatsMiau, tentativa outbound, estado de publicação, estado de entrega e fato de mensagem
- [x] ADR-0005 mapeia os nomes de código: `LeadSubmission.whatsapp_opt_in` (evidência) e `Opportunity.whatsapp_opt_in` (snapshot); provider WhatsMiau; `first_contact_template_body`; estado de pareamento; tentativa outbound; `dispatch_status`; `delivery_status`; fatos `WHATSAPP_OUTBOUND_SENT | WHATSAPP_OUTBOUND_FAILED | WHATSAPP_INBOUND_RECEIVED`
- [x] Estado de pareamento canônico inclui `DISCONNECTED | CONNECTING | QR_PENDING | CONNECTED | SUSPENDED | ERROR`, mapeado dos valores oficiais `closed | connecting | qr-code | open` e `suspended`
- [x] ADR-0016 ganha `JobOrigin.channel_outbound` com `attempt_id` e `JobOrigin.channel_inbound` com `integration_connection_id`; continua havendo apenas `UserContext | JobContext`, sem evento de integração fabricado
- [x] ADR-0019 passa de seis para sete funções privadas com `private.claim_pending_channel_attempts`, chamada pelo app dispatcher e retornando somente `(attempt_id, workspace_id)`; Seam 3 passa a reprovar a oitava
- [x] ADR-0031 recebe nota de composição: N conexões por provedor continua canônico, enquanto ADR-0003 impõe no máximo uma conexão WhatsMiau não desligada por workspace por constraint parcial específica
- [x] ADR-0015 permanece sem emenda: Gestão/Direção leem status; somente Direção pareia, desconecta/reconecta e toca segredo/ativação
- [x] `docs/plano-de-construcao.md` marca A5 como fechado pela premissa de gateway não oficial desta spec
- [x] Nenhuma migration ou código de runtime entra neste ticket

## Fora deste ticket

Schema, UI, adapter HTTP, fila e worker. Este ticket fecha nomes e contratos para os tickets seguintes não improvisarem.

## Evidence

- `CONTEXT.md` ganhou os verbetes de canal (opt-in, conexão WhatsMiau, estado de pareamento, tentativa outbound, estados de publicação/entrega, fato de mensagem) e atualizou origem do job, contexto de acesso, contrato `v1`, primeiro contato e linha do tempo. Conta Whatsmiau ≠ workspace.
- ADR-0005 mapeia `LeadSubmission.whatsapp_opt_in` / `Opportunity.whatsapp_opt_in`, `WHATSMIAU`, `first_contact_template_body`, `WhatsAppPairingState`, `ChannelOutboundAttempt.dispatch_status` / `delivery_status` e os três fatos `WHATSAPP_*`.
- Pareamento: `open → CONNECTED`, `closed → DISCONNECTED`, `connecting → CONNECTING`, `qr-code → QR_PENDING`, `suspended: true → SUSPENDED`; webhook `close` também `DISCONNECTED`; `ERROR` é local.
- ADR-0016: `JobOrigin` com `channel_outbound` (`attempt_id`) e `channel_inbound` (`integration_connection_id`); só `UserContext | JobContext`.
- ADR-0019: sétima função `private.claim_pending_channel_attempts`, retorno `(attempt_id, workspace_id)`, Seam 3 reprova a oitava. Webhook inbound não ganha função nova.
- ADR-0031 + ADR-0003: N conexões no geral; WhatsMiau por constraint parcial. A5 fechado como gateway não oficial. Revisão 19 ago. 2026: ADR-0005 SLA ortogonal a `first_contact_trigger`; ADR-0003 tira variação de texto das mitigações obrigatórias; ADR-0016 rule 3 aponta enumeração completa no ADR-0019; pesquisa whatsmiau alinha `qr-code → QR_PENDING`.
- ADR-0015 não foi emendado. `git diff` não toca `*.ts`, `*.prisma` nem `migrations/`.
