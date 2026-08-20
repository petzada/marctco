# Registro de execução — Fase 4 · Canal

## Fechamento

- **Status:** entregue em 2026-08-20.
- **Escopo:** instância WhatsMiau por workspace, configuração de gatilho/template, uma tentativa outbound durável por Oportunidade, dispatcher/worker, gatilhos de atribuição e chegada, webhook inbound, timeline no card e Seam 4.
- **Contrato externo:** Whatsmiau Cloud API v2; `sendText` sem idempotency key documentada. A garantia local é uma tentativa lógica e no máximo uma invocação depois de `PROCESSING`, não exatamente uma entrega externa.

## Commits

- `c1f5dda` — contratos canônicos, spec, tickets e auditoria da API.
- `02ede2f` — gatilho/template e opt-in.
- `06dd485` — conexão, QR e estado de pareamento.
- `e6f1da1` — tentativa outbound e outbox Postgres.
- `84f9ffa` — dispatcher, fila, worker e adapter `sendText`.
- `de0f42a` — disparo na atribuição ao Atendente.
- `3d34833` — disparo na chegada e na liberação da quarentena.
- `50e17f1` — webhook inbound autenticado e deduplicado.
- `d403a21` — fatos de mensagem e indicador no card.
- `2f368eb` — Seam 4 e gate de CI.
- `42385ec` — correções da revisão final: `fetchInstances`, nomenclatura canônica e hook profundo de atribuição.

## Gates finais

- `pnpm typecheck` — passou.
- `pnpm lint` — passou.
- `pnpm test:unit` — 103 arquivos, 681 testes.
- `pnpm test:db` — 31 arquivos, 454 testes.
- `pnpm test:seam2` — 24 testes.
- `pnpm test:seam4` — 13 testes.
- `pnpm check:migrations` — passou.
- `pnpm db:drift` — sem diferença.

Depois da revisão final, os testes focados das correções passaram (24 unitários, 98 DB/RLS e Seam 4 13/13).

## Revisão final

`/code-review` foi executado desde `4d5d07b` em dois eixos.

- **Standards:** corrigidos nomes novos `Lead*` para `Opportunity*` e a duplicação do hook de atribuição; polling por route handler foi mantido porque o QR exige atualização por `connectionState`.
- **Spec:** implementado o uso real de `fetchInstances` para reconciliação. O rate limit de falhas de autenticação do webhook foi mantido como defesa fail-closed; continua respondendo 401 e não cria fato.

## Riscos e operação

- Pareamento real/QR contra produção não é gate automatizado; exige `WHATSMIAU_APIKEY` e URL HTTPS pública.
- HTTP 2xx é aceite local, nunca entrega ou leitura. `messages.update` permanece fora do escopo.
- Não há retry de `sendText` depois de o HTTP começar; timeout, rede, 5xx ou crash viram falha de resultado incerto.
- Delay padrão: 30 segundos. Rate limit local: 6 envios/minuto por workspace.
- Webhook usa Bearer opaco configurado pelo CRM; não há assinatura HMAC nativa documentada.

## Próximo

Fase 5 · Papel, conforme `docs/plano-de-construcao.md`.
