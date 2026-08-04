# 06 — Conexão de integração e token

**Blocked by:** 03

**Status:** ready-for-agent

## What to build

Cada workspace ganha uma conexão de integração com um token próprio. O token é o que identifica o tenant quando a Pluga faz o `POST` — **nunca** um campo do corpo da requisição. Sem isso, qualquer um que conheça o formato do JSON escreveria no workspace alheio.

Este ticket contém a única consulta do sistema que legitimamente **não tem contexto de tenant**: descobrir a qual workspace um token pertence acontece necessariamente antes de saber qual é o workspace. Resolver isso dando bypass de RLS ao app destruiria a rede inteira por causa de uma consulta — daí a função `SECURITY DEFINER` estreita descrita no [ADR-0007](../../../docs/adr/0007-ingestao-idempotencia.md).

## Acceptance criteria

- [ ] `IntegrationConnection` com `provider`, `token_hash` e `status`
- [ ] O token é gerado com entropia adequada e o valor em claro é exibido **uma única vez**
- [ ] Só o hash é persistido; o valor em claro nunca é armazenado nem registrado em log
- [ ] Função `SECURITY DEFINER` em schema privado resolve o workspace a partir do hash
- [ ] `EXECUTE` revogado de todo papel que não seja o do app
- [ ] Busca por índice sobre o hash, **sem cache** — token revogado precisa parar de funcionar imediatamente
- [ ] Token de workspace desativado não resolve
- [ ] Script de seed cria uma conexão utilizável pelos tickets seguintes
- [ ] A interface de gerenciamento está fora deste ticket (é o 14)
