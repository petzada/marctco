# 16 — Catálogo de feature flags

**Blocked by:** 09

**Status:** done

## What to build

O mecanismo que permite à marctco ligar por workspace as capacidades que **custam dinheiro ou chamam um terceiro por uso**. Nesta fatia nenhuma delas está implementada — o que se constrói é o catálogo, a leitura segura e o ponto de engate no worker de ingestão, para que a Fase 4 não exija reescrever o worker.

Três entradas, e nenhuma a mais. Assinatura digital e funil jurídico **não** são flags: são estado de dado (conexão existe? funil existe e está ativo?). Dois interruptores para a mesma lâmpada é bug garantido. Ver [ADR-0004](../../../docs/adr/0004-fronteira-flag-configuracao-estado.md).

## Acceptance criteria

- [x] Catálogo em `packages/domain` com exatamente três entradas: `auto_primeiro_contato`, `score_cabimento_llm`, `resumo_handoff_llm`
- [x] Uma cópia só do catálogo, compartilhada entre app e worker
- [x] Liberação por workspace registrada em `workspace_flags`
- [x] A leitura de flag **exige `workspace_id` explícito** como argumento — não existe leitura de ambiente
- [x] Nenhum valor de flag resolvido em escopo de módulo, singleton ou cache sem chave de workspace: o worker processa vários tenants no mesmo processo
- [x] O `workspace_id` chega pelo **`AccessContext`**, que já é argumento obrigatório de toda operação de `packages/db` — a exigência acima deixa de depender de cada chamador lembrar ([ADR-0016](../../../docs/adr/0016-contexto-de-acesso-e-leitor-escopado.md))
- [x] Na **Fase 4**, as flags resolvidas passam a viajar dentro do mesmo `AccessContext` — nas duas variantes, porque o worker também consome flag. Nesta fatia o objeto nasce sem elas, com lugar para entrarem sem tocar chamada nenhuma
- [x] Ausência de linha significa **desligado** (fail-closed) — as três flags gastam dinheiro por uso
- [x] O catálogo **nunca** é embarcado no cliente; o browser recebe apenas o resultado resolvido para o seu workspace
- [x] O guard é do servidor: rota, consulta ou job recusam por conta própria. Esconder elemento de interface não é controle de acesso
- [x] O worker de ingestão emite o efeito pós-criação da Oportunidade atrás de `auto_primeiro_contato`, **desligada** — sem nenhum consumidor nesta fatia
- [x] Nenhuma flag criada para assinatura digital ou funil jurídico

## Evidence

- `packages/domain/src/feature-flags.ts` é o único catálogo; o subpath dedicado é consumido no servidor e bloqueado em `apps/web` pelo lint. O build do web não contém as três chaves em `.next/static`.
- A migration `20260810001600_workspace_flags` cria a tabela de presença, chave primária por workspace, `FORCE RLS`, policy para app/worker e revoga escrita dos dois papéis de runtime.
- `readWorkspaceFeatureFlags(context)` abre a transação escopada, filtra também por `context.workspace_id` e resolve toda ausência como `false`; `assertWorkspaceFeatureEnabled` é o guard de servidor.
- `UserContext` e `JobContext` têm o slot opcional `feature_flags`, e os dois construtores continuam nascendo sem valor resolvido.
- O worker lê a flag somente depois de `applyIntakePlan` realmente devolver `NEW_OPPORTUNITY`; desligada, emite `[]`; ligada, planeja `AUTO_FIRST_CONTACT` como dado sem executar consumidor externo.
- Testes focados: domínio/worker 20/20; Postgres real sob `marctco_app` 4/4, incluindo tenants vizinhos no mesmo processo e as duas variantes de `AccessContext`.
- O Seam 3 passou 51/51 depois de incluir `workspace_flags` na matriz genérica de RLS, índice, ownership e isolamento de escrita.
