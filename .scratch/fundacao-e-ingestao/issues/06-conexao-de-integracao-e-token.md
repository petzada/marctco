# 06 — Conexão de integração e token

**Blocked by:** 03

**Status:** ready-for-agent

## What to build

Cada workspace ganha uma conexão de integração com um token próprio. O token é o que identifica o tenant quando a Pluga faz o `POST` — **nunca** um campo do corpo da requisição. Sem isso, qualquer um que conheça o formato do JSON escreveria no workspace alheio.

Este ticket contém uma das três consultas do sistema que legitimamente **não têm contexto de tenant**: descobrir a qual workspace um token pertence acontece necessariamente antes de saber qual é o workspace. Resolver isso dando bypass de RLS ao app destruiria a rede inteira por causa de uma consulta — daí a função `SECURITY DEFINER` estreita descrita no [ADR-0007](../../../docs/adr/0007-ingestao-idempotencia.md). As outras duas são a descoberta de pendências (ticket 15) e o provisionamento (ticket 17); a lista é fechada e verificada no Seam 3 ([ADR-0006](../../../docs/adr/0006-rls-duas-camadas-guc-worker.md) regra 9).

## Acceptance criteria

- [ ] `IntegrationConnection` com `provider`, `contract_version`, `token_hash`, `status` e `target_pipeline_id` anulável
- [ ] `target_pipeline_id` nulo significa "usar o funil comercial padrão do workspace"; preenchido, precisa apontar para funil comercial do mesmo workspace
- [ ] Token gerado com **256 bits de CSPRNG**, em base64url, com prefixo `mtco_` para o cliente reconhecer e para varredura de segredo vazado
- [ ] O valor em claro é exibido **uma única vez**, na geração
- [ ] Só o hash é persistido; o valor em claro nunca é armazenado nem registrado em log
- [ ] Os **últimos 4 caracteres** ficam em claro, apenas para a exibição mascarada da tela (ticket 14)
- [ ] O hash é **SHA-256 determinístico**, com índice único — **não** bcrypt nem argon2. Hash adaptativo é salgado por linha e torna a busca por índice impossível: restaria carregar todas as conexões e verificar uma a uma, na rota mais quente do sistema, com cache proibido. Salt e key-stretching existem contra segredo de baixa entropia escolhido por humano, e não há o que forçar num valor de 256 bits aleatórios
- [ ] Função `SECURITY DEFINER` em schema `private` resolve o workspace a partir do hash, com `search_path` fixado
- [ ] `EXECUTE` revogado de todo papel que não seja o do app
- [ ] Busca por índice sobre o hash, **sem cache** — token revogado precisa parar de funcionar imediatamente
- [ ] Token de workspace desativado não resolve
- [ ] Pluga e LP usam conexões/tokens distintos; a origem confiável vem da conexão autenticada, não do body
- [ ] Script de seed cria uma conexão utilizável pelos tickets seguintes
- [ ] A interface de gerenciamento está fora deste ticket (é o 14)
