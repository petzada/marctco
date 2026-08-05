# 16 — Catálogo de feature flags

**Blocked by:** 09

**Status:** ready-for-agent

## What to build

O mecanismo que permite à marctco ligar por workspace as capacidades que **custam dinheiro ou chamam um terceiro por uso**. Nesta fatia nenhuma delas está implementada — o que se constrói é o catálogo, a leitura segura e o ponto de engate no worker de ingestão, para que a Fase 4 não exija reescrever o worker.

Três entradas, e nenhuma a mais. Assinatura digital e funil jurídico **não** são flags: são estado de dado (conexão existe? funil existe e está ativo?). Dois interruptores para a mesma lâmpada é bug garantido. Ver [ADR-0004](../../../docs/adr/0004-fronteira-flag-configuracao-estado.md).

## Acceptance criteria

- [ ] Catálogo em `packages/domain` com exatamente três entradas: `auto_primeiro_contato`, `score_cabimento_llm`, `resumo_handoff_llm`
- [ ] Uma cópia só do catálogo, compartilhada entre app e worker
- [ ] Liberação por workspace registrada em `workspace_flags`
- [ ] A leitura de flag **exige `workspace_id` explícito** como argumento — não existe leitura de ambiente
- [ ] Nenhum valor de flag resolvido em escopo de módulo, singleton ou cache sem chave de workspace: o worker processa vários tenants no mesmo processo
- [ ] O `workspace_id` chega pelo **`AccessContext`**, que já é argumento obrigatório de toda operação de `packages/db` — a exigência acima deixa de depender de cada chamador lembrar ([ADR-0016](../../../docs/adr/0016-contexto-de-acesso-e-leitor-escopado.md))
- [ ] Na **Fase 4**, as flags resolvidas passam a viajar dentro do mesmo `AccessContext` — nas duas variantes, porque o worker também consome flag. Nesta fatia o objeto nasce sem elas, com lugar para entrarem sem tocar chamada nenhuma
- [ ] Ausência de linha significa **desligado** (fail-closed) — as três flags gastam dinheiro por uso
- [ ] O catálogo **nunca** é embarcado no cliente; o browser recebe apenas o resultado resolvido para o seu workspace
- [ ] O guard é do servidor: rota, consulta ou job recusam por conta própria. Esconder elemento de interface não é controle de acesso
- [ ] O worker de ingestão emite o efeito pós-criação da Oportunidade atrás de `auto_primeiro_contato`, **desligada** — sem nenhum consumidor nesta fatia
- [ ] Nenhuma flag criada para assinatura digital ou funil jurídico
