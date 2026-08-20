# Fase 4 fechada — não reimplementar

A Fase 4 (Canal) **já está no código**. Não reabra os tickets 00–07 nem trate [spec.md](./spec.md) como fila de trabalho.

## Estado integrado

Tickets concluídos:

- **00 — Contratos canônicos:** vocabulário, ADRs, `JobOrigin` e sétima função privada.
- **01 — Configuração e domínio:** opt-in, gatilho, template e guards puros.
- **02 — Conexão WhatsMiau:** instância, QR, polling, logout e reconciliação `fetchInstances`.
- **03a — Tentativa/outbox:** persistência, leases, RLS e máquina de estados.
- **03b — Dispatcher/worker/adapter:** BullMQ, delay, rate limit e `sendText`.
- **03c — Atribuição:** tentativa no mesmo commit que entrega ao Atendente.
- **04 — Chegada/quarentena:** tentativa no mesmo commit que cria a Oportunidade.
- **05 — Webhook inbound:** autenticação pela conexão real, dedupe, timeline e `first_contact_at`.
- **06 — Timeline no card:** copy PT-BR, preview e indicador sem segredo.
- **07 — Seam 4:** atribuição → outbox → Redis → worker → WhatsMiau fake → fato + primeiro contato.

O último commit de runtime/revisão é `42385ec`. O commit de fechamento documental vem depois deste arquivo.

## Gates finais

```text
pnpm typecheck          passou
pnpm lint               passou
pnpm test:unit          103 arquivos, 681 testes
pnpm test:db            31 arquivos, 454 testes
pnpm test:seam2         24 testes
pnpm test:seam4         13 testes
pnpm check:migrations   passou
pnpm db:drift           sem diferença
```

## Contratos que não devem ser reabertos

1. Default `ON_ASSIGNMENT`, apenas quando o destino efetivo é Atendente.
2. Uma tentativa automática por Oportunidade.
3. Tentativa/outbox nasce no mesmo commit do gatilho; Redis não é fonte de verdade.
4. Depois de `PROCESSING`, não existe segundo `sendText`.
5. HTTP 2xx preenche `first_contact_at` como política local; não significa entrega/leitura.
6. Opt-in precisa ser explicitamente `true`.
7. WhatsMiau é gateway não oficial: delay e rate limit são obrigatórios.
8. Webhook inbound usa `JobOrigin.channel_inbound` com `integration_connection_id` real.
9. A lista pré-contexto continua com sete funções; não criar uma oitava para webhook.
10. O CRM registra fatos de mensagem, mas não é inbox.

## Operação externa

- Configurar `WHATSMIAU_APIKEY` somente no servidor.
- O pareamento real exige URL HTTPS pública; localhost e rede privada são recusados.
- QR real e envio contra produção não fazem parte dos testes automatizados.
- A API não documenta idempotency key, corpo de sucesso do `sendText`, TTL do QR nem política de retry.

## Próximo

**Fase 5 · Papel** — documentos/proposta no card, upload R2, assinatura e vistas globais de Contratos/Documentos, conforme [docs/plano-de-construcao.md](../../docs/plano-de-construcao.md).
