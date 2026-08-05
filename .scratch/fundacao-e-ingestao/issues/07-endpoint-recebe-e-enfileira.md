# 07 — Endpoint persiste outbox e dispatcher enfileira

**Blocked by:** 06

**Status:** ready-for-agent

## What to build

A Pluga faz um `POST` por lead e recebe **200 depois do commit PostgreSQL**. O payload cru é guardado como outbox antes de qualquer interpretação. Um dispatcher independente publica no BullMQ; indisponibilidade do Redis não muda o aceite nem perde o evento.

Neste ticket o payload ainda **não é interpretado** — nada de Pessoa, Oportunidade ou normalização. O que se prova aqui é o encanamento: autenticação, persistência antes da resposta, fila, e o worker rodando **sob RLS**.

O handler é provider-agnóstico: ele não sabe se aquilo é Meta, Google ou landing page. Isso é o desenho, não uma pendência — quem descobre a origem é o worker, e é o que permite reprocessar da fila morta com o conector corrigido quando houver bug. Ver [ADR-0007](../../../docs/adr/0007-ingestao-idempotencia.md) e [ADR-0008](../../../docs/adr/0008-fronteira-conector-dominio.md).

## Acceptance criteria

- [ ] `POST` no endpoint da Pluga responde **200** com corpo `{"status":"accepted"}` para qualquer corpo que seja JSON válido — **não 202**, porque a Pluga não documenta quais códigos aceita ([ADR-0007](../../../docs/adr/0007-ingestao-idempotencia.md) §Por que 200 e não 202)
- [ ] **401** quando o token é inválido ou desconhecido
- [ ] **400** quando o corpo não é JSON
- [ ] **Nunca 409** — duplicata também recebe 200
- [ ] Nenhum campo de negócio é obrigatório
- [ ] `workspace_id` presente no corpo é **ignorado**; o tenant vem do token
- [ ] `IntegrationEvent` persiste payload cru e despacho `PENDING` em commit **antes** do 200
- [ ] A ordem do handler é: resolve token → persiste/commit → responde 200; ele não conecta ao Redis
- [ ] Dispatcher independente busca pendências no PostgreSQL por `private.claim_pending_events` e publica no BullMQ. A função é necessária porque o dispatcher procura pendência de **todos** os workspaces, sem sessão e sem job prévio: "claim por evento" é circular — para setar o claim ele precisaria do `workspace_id` que só a leitura revela, e sem GUC a policy devolve zero linhas ([ADR-0006](../../../docs/adr/0006-rls-duas-camadas-guc-worker.md) regra 9)
- [ ] `claim_pending_events` devolve **só `(id, workspace_id)`** — nunca o `raw`, que carrega CPF e telefone. Função sem tenant que devolvesse payload seria vazamento cross-tenant com cara de recurso
- [ ] Redis indisponível mantém o evento pendente e o endpoint continua respondendo 200
- [ ] `jobId` determinístico derivado de `IntegrationEvent.id`; job carrega IDs, não payload com PII
- [ ] Evento só é marcado `DISPATCHED` depois da confirmação do BullMQ
- [ ] O worker consome o job **sob RLS**, com o claim vindo do `workspace_id` do job
- [ ] O `workspace_id` do job vem do handler autenticado, nunca de campo livre do payload
- [ ] Job cujo evento pertence a outro workspace lê zero linhas e **falha alto**
- [ ] Evento processado passa a `PROCESSED`
- [ ] **Seam 2** com BullMQ e Redis reais no CI — não com processor executado inline
