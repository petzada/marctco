# Fase 4 — Canal

Status da fatia: **especificada; ticket 00 (contratos canônicos) fechado.** Spec em [spec.md](./spec.md), tickets em [issues/](./issues/). Implementação a partir do [01](./issues/01-configuracao-e-dominio-do-primeiro-contato.md) e do [02](./issues/02-conexao-whatsmiau.md).

Fase 4 de [docs/plano-de-construcao.md](../../docs/plano-de-construcao.md). Estado de partida: Fases 0–3 entregues — [PROMPT-HANDOFF da Fase 3](../tempo/PROMPT-HANDOFF.md).

## O que esta fase entrega

O canal de primeiro contato: **uma instância WhatsMiau por workspace**, template editável, disparo automático no gatilho configurado (default na atribuição ao Atendente), e **mensagens na linha do tempo do card** — sem inbox. O CRM não vira conversa; registra o envio automático e a resposta inbound.

Contrato externo: [Whatsmiau Cloud API v2](https://whatsmiau.dev/docs/getting-started). Recorte usado: instância/QR/estado/logout, `sendText`, configuração de webhook, `messages.upsert` e `connection.update`. Todo o restante da API fica fora.

## Ordem e dependências

```
00 ─┬─ 01 ── 03a ─┬─ 03b ─┐
    └─ 02 ────────┼─ 03c ─┴─ 07
                  ├─ 04
        02 ───────┴─ 05 ── 06
                       03a ─┘
```

| Ticket | Depende de | Pode ir em paralelo com |
|---|---|---|
| [00 — Contratos canônicos do canal](./issues/00-contratos-canonicos-do-canal.md) | — | — |
| [01 — Configuração e domínio do primeiro contato](./issues/01-configuracao-e-dominio-do-primeiro-contato.md) | 00 | 02 |
| [02 — Conexão WhatsMiau](./issues/02-conexao-whatsmiau.md) | 00 | 01 |
| [03a — Tentativa outbound e outbox transacional](./issues/03a-tentativa-outbound-e-outbox.md) | 01 | 02 |
| [03b — Dispatcher, worker e adapter WhatsMiau](./issues/03b-dispatcher-worker-e-adapter.md) | 02, 03a | — |
| [03c — Disparo na atribuição](./issues/03c-disparo-na-atribuicao.md) | 02, 03a | 03b, 04, 05 |
| [04 — Gatilho na chegada e quarentena](./issues/04-gatilho-na-chegada-e-quarentena.md) | 02, 03a | 03b, 03c, 05 |
| [05 — Webhook de entrada](./issues/05-webhook-de-entrada.md) | 02, 03a | 03b, 04 |
| [06 — Mensagem na linha do tempo do card](./issues/06-mensagem-na-linha-do-tempo-do-card.md) | 03a, 05 | 03b, 03c, 04 |
| [07 — Seam 4: atribuição até evidência persistida](./issues/07-seam4-atribuicao-ate-evidencia.md) | 03b, 03c | 04, 05, 06 |

**00 fechou os contratos canônicos**, sem migration nem runtime. Os tickets 01 e 02 podem seguir em paralelo.

**03a–03c substituem o antigo ticket 03.** O módulo de despacho continua único; a execução foi dividida por risco de merge: persistência recuperável, I/O externo e hook de produto.

**01 e 02 podem seguir em paralelo** depois do 00. O Seam 4 depende apenas do caminho outbound completo (03c), não da copy do card nem do webhook inbound.

## Decisões que a spec fechou

- **Default `ON_ASSIGNMENT`**, disparando só quando o destino é **Atendente** — atribuir ao Supervisor não envia.
- **Uma mensagem automática outbound por Oportunidade** — reatribuir não reenvia se já houve envio ou tentativa terminal.
- **Postgres-first:** a tentativa/outbox nasce no commit da atribuição ou da Oportunidade; Redis nunca é a única cópia da intenção.
- **Uma tentativa, no máximo um `sendText`:** outbox/fila recuperam antes do HTTP; depois que a chamada começa, qualquer resultado ambíguo termina sem reenvio porque a API não documenta idempotency key.
- **WhatsMiau como gateway não oficial** — opt-in explícito, delay e rate limit obrigatórios; variação automática de texto fica pós-MVP.
- **Ordem de guards:** flag → gatilho → opt-in → elegibilidade → dedupe → pré-condições operacionais.
- **`first_contact_at`** preenchido no envio bem-sucedido ou na primeira resposta inbound — nunca na atribuição nem no agendamento.
- **Seam 4** como costura principal: atribuição real → fila → WhatsMiau mockado → timeline + `first_contact_at`.

## Antes do código

O ticket 00 materializa, sem escolha remanescente:

- ADR-0016: `JobOrigin.channel_outbound` carrega `attempt_id`; `channel_inbound` carrega `integration_connection_id`;
- ADR-0019: `private.claim_pending_channel_attempts` é a sétima função, retorno `(attempt_id, workspace_id)`;
- ADR-0005 e `CONTEXT.md`: nomes de opt-in, conexão, tentativa, estados e fatos;
- ADR-0031: N conexões em geral, mas no máximo uma conexão WhatsMiau não desligada por workspace;
- plano A5: fechado assumindo gateway não oficial.
