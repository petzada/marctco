# Workspace é a fronteira de captação; tags organizam times

O cliente piloto (dono da consultoria comercial/jurídica) opera como **empresa mãe / grupo** com várias assessorias, times e, em alguns casos, campanhas compartilhadas. O tenant SaaS **não** é um workspace por assessoria nem automaticamente um por grupo: é a **fronteira de captação** ([ADR-0022](./0022-workspace-e-fronteira-de-captacao.md)). Quem anuncia junto compartilha o workspace; quem tem Pluga ou LP próprios ganha workspace próprio. Organização interna: funis operacionais de áreas comercial/jurídica, **tipo de financiamento como atributo da Oportunidade**, **tags em membros** para marca/time dentro do workspace compartilhado, mais atribuição por usuário e roles.

> **Emendado pelo [ADR-0020](./0020-tag-no-membro-define-o-time.md):** a tag que define o time de um Supervisor vive no membro. Tag na oportunidade, se existir, é rótulo operacional digitado — nunca herdada do responsável. O “opcionalmente em oportunidades” desta frase original não computa escopo.
>
> **Emendado pelo [ADR-0022](./0022-workspace-e-fronteira-de-captacao.md):** “um workspace por grupo” cede à fronteira de captação. Workspace por filial/assessoria continua rejeitado **quando elas compartilham a campanha**.
>
> **Emendado pelo [ADR-0030](./0030-workspace-e-fronteira-do-dono.md):** a fronteira volta a ser o grupo — mas por ser o **dono**, não por ser grupo. "Quem tem Pluga ou LP próprios ganha workspace próprio" deixa de valer: campanha exclusiva ganha **conexão** própria no mesmo tenant ([ADR-0031](./0031-conexao-na-chave-idempotente.md)). Workspace por filial continua rejeitado, agora em todos os casos.
>
> **Emendado pelo [ADR-0028](./0028-tag-e-o-time-supervisor-nao-alcanca-supervisor.md) e pelo [ADR-0029](./0029-empresa-e-agrupamento-de-equipe.md):** "tags em membros para **marca/time**" se divide — a tag é o time; a marca é `Company`, que a tag aponta e que nunca computa escopo.

**Status:** accepted · 2026-08-04

**Why not workspace-per-filial:** quem **anuncia junto** precisa da mesma fila — um tenant por assessoria esconderia o lead da outra marca. Quem tem Pluga ou LP próprios ganha **conexão** própria dentro do mesmo tenant, não workspace ([ADR-0030](./0030-workspace-e-fronteira-do-dono.md), [ADR-0031](./0031-conexao-na-chave-idempotente.md)). Multiplicar tenant só porque existe filial, sem fronteira de captação distinta, duplicaria contas Pluga, flags, WhatsMiau/assinatura e onboarding sem ganho.

**Consequences:** filtros Kanban/lista por tag de membro e assignee; Supabase Auth com `workspace_members` + switcher quando o usuário tiver mais de um workspace. No piloto isso é o caso esperado da Direção (Hugs + ACR), não exceção nem só staff interno.
