# 07 — Endpoint recebe e enfileira

**Blocked by:** 06

**Status:** ready-for-agent

## What to build

A Pluga faz um `POST` por lead e recebe **202 imediatamente**. O payload cru é guardado antes de qualquer interpretação, um job é enfileirado, e o worker consome marcando o evento como processado.

Neste ticket o payload ainda **não é interpretado** — nada de Pessoa, Oportunidade ou normalização. O que se prova aqui é o encanamento: autenticação, persistência antes da resposta, fila, e o worker rodando **sob RLS**.

O handler é provider-agnóstico: ele não sabe se aquilo é Meta, Google ou landing page. Isso é o desenho, não uma pendência — quem descobre a origem é o worker, e é o que permite reprocessar da fila morta com o conector corrigido quando houver bug. Ver [ADR-0007](../../../docs/adr/0007-ingestao-idempotencia.md) e [ADR-0008](../../../docs/adr/0008-fronteira-conector-dominio.md).

## Acceptance criteria

- [ ] `POST` no endpoint da Pluga responde **202** para qualquer corpo que seja JSON válido
- [ ] **401** quando o token é inválido ou desconhecido
- [ ] **400** quando o corpo não é JSON
- [ ] **Nunca 409** — duplicata também recebe 202
- [ ] Nenhum campo de negócio é obrigatório
- [ ] `workspace_id` presente no corpo é **ignorado**; o tenant vem do token
- [ ] `IntegrationEvent` persiste o payload cru com status `PENDING` **antes** de enfileirar
- [ ] A ordem é: resolve token → persiste → enfileira → responde
- [ ] Falha ao enfileirar deixa o evento em `PENDING` e responde 5xx
- [ ] O worker consome o job **sob RLS**, com o claim vindo do `workspace_id` do job
- [ ] O `workspace_id` do job vem do handler autenticado, nunca de campo livre do payload
- [ ] Job cujo evento pertence a outro workspace lê zero linhas e **falha alto**
- [ ] Evento processado passa a `PROCESSED`
- [ ] **Seam 2** com BullMQ e Redis reais no CI — não com processor executado inline
