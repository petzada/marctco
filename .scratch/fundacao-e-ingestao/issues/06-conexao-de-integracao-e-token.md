# 06 — Conexão de integração e token

**Blocked by:** 03

**Status:** done

## What to build

Cada workspace ganha uma conexão de integração com um token próprio. O token é o que identifica o tenant quando a Pluga faz o `POST` — **nunca** um campo do corpo da requisição. Sem isso, qualquer um que conheça o formato do JSON escreveria no workspace alheio.

Este ticket contém uma das quatro consultas do sistema que legitimamente **não têm contexto de tenant**: descobrir a qual workspace um token pertence acontece necessariamente antes de saber qual é o workspace. Resolver isso dando bypass de RLS ao app destruiria a rede inteira por causa de uma consulta — daí a função `SECURITY DEFINER` estreita descrita no [ADR-0007](../../../docs/adr/0007-ingestao-idempotencia.md). As outras são a descoberta de pendências (ticket 15), o provisionamento (ticket 17) e a resolução navegador → associação/workspace (ticket 04); a lista é fechada, executada pelo papel técnico `NOLOGIN` e verificada no Seam 3 ([ADR-0006](../../../docs/adr/0006-rls-duas-camadas-guc-worker.md) regra 9, [ADR-0019](../../../docs/adr/0019-resolucao-pre-contexto-e-executor-privado.md)).

## Acceptance criteria

- [x] `IntegrationConnection` com `provider`, `contract_version`, `token_hash`, `status` e `target_pipeline_id` anulável
- [x] `target_pipeline_id` nulo significa "usar o funil comercial padrão do workspace"; preenchido, precisa apontar para funil comercial do mesmo workspace
- [x] Token gerado com **256 bits de CSPRNG**, em base64url, com prefixo `mtco_` para o cliente reconhecer e para varredura de segredo vazado
- [x] O valor em claro é exibido **uma única vez**, na geração
- [x] Só o hash é persistido; o valor em claro nunca é armazenado nem registrado em log
- [x] Os **últimos 4 caracteres** ficam em claro, apenas para a exibição mascarada da tela (ticket 14)
- [x] O hash é **SHA-256 determinístico**, com índice único — **não** bcrypt nem argon2. Hash adaptativo é salgado por linha e torna a busca por índice impossível: restaria carregar todas as conexões e verificar uma a uma, na rota mais quente do sistema, com cache proibido. Salt e key-stretching existem contra segredo de baixa entropia escolhido por humano, e não há o que forçar num valor de 256 bits aleatórios
- [x] Função `SECURITY DEFINER` em schema `private` resolve o workspace a partir do hash, com `search_path` fixado
- [x] A função tem executor técnico `NOLOGIN`, sem `BYPASSRLS` e sem membership assumível pelo app/worker, com apenas grants/policies mínimos do ADR-0019
- [x] `EXECUTE` revogado de todo papel que não seja o do app
- [x] Busca por índice sobre o hash, **sem cache** — token revogado precisa parar de funcionar imediatamente
- [x] Token de workspace desativado não resolve
- [x] Pluga e LP usam conexões/tokens distintos; a origem confiável vem da conexão autenticada, não do body
- [x] Script de seed cria uma conexão utilizável pelos tickets seguintes
- [x] A interface de gerenciamento está fora deste ticket (é o 14)

## Comments

### Gate de fechamento 04/05/06 — 2026-08-05

- Migration corretiva `20260805000900_target_pipelines_stay_commercial`: trigger `BEFORE UPDATE OF type` em `pipelines` impede que funil referenciado por `integration_connections.target_pipeline_id` vire `LEGAL` — a mutação reversa que quebraria o destino da ingestão.
- Teste Seam 3 verde: `"prevents a targeted commercial pipeline from becoming legal later"` (`packages/db/tests/rls.test.ts`).
- Encoding `Conclusão` confirmado em `rls.test.ts` (sem mojibake `ConclusÃ£o`).
- Suíte DB integral: **54/54** (`pnpm test:db`); unit **22/22**, A7 **5/5**, lint e typecheck verdes localmente.
- Empacotado com tickets 04 e 05 em branch `ticket/04-05-06-auth-pipelines-integration` (PR #10).
- Recoveries de produção (#11 CREATE ROLE, #12 GRANT membership, #13 ALTER SCHEMA owner) — Production migration verde em https://github.com/petzada/marctco/actions/runs/31031305105 (`002`–`009` aplicadas; schema up to date). Gate 06 fechado 7/7.
