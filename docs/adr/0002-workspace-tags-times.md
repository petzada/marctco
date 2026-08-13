# Workspace é a fronteira de captação; tags organizam times

O cliente piloto (dono da consultoria comercial/jurídica) opera como **empresa mãe / grupo** com várias assessorias, times e, em alguns casos, campanhas compartilhadas. O tenant SaaS **não** é um workspace por assessoria nem automaticamente um por grupo: é a **fronteira de captação** ([ADR-0022](./0022-workspace-e-fronteira-de-captacao.md)). Quem anuncia junto compartilha o workspace; quem tem Pluga ou LP próprios ganha workspace próprio. Organização interna: funis operacionais de áreas comercial/jurídica, **tipo de financiamento como atributo da Oportunidade**, **tags em membros** para marca/time dentro do workspace compartilhado, mais atribuição por usuário e roles.

> **Emendado pelo [ADR-0020](./0020-tag-no-membro-define-o-time.md):** a tag que define o time de um Supervisor vive no membro. Tag na oportunidade, se existir, é rótulo operacional digitado — nunca herdada do responsável. O “opcionalmente em oportunidades” desta frase original não computa escopo.
>
> **Emendado pelo [ADR-0022](./0022-workspace-e-fronteira-de-captacao.md):** “um workspace por grupo” cede à fronteira de captação. Workspace por filial/assessoria continua rejeitado **quando elas compartilham a campanha**.

**Status:** accepted · 2026-08-04

**Why not workspace-per-filial:** quem **anuncia junto** precisa da mesma fila — um tenant por assessoria esconderia o lead da outra marca. Quem tem Pluga ou LP próprios **já** ganha workspace próprio ([ADR-0022](./0022-workspace-e-fronteira-de-captacao.md)). Multiplicar tenant só porque existe filial, sem fronteira de captação distinta, duplicaria contas Pluga, flags, WhatsMiau/assinatura e onboarding sem ganho.

**Consequences:** filtros Kanban/lista por tag de membro e assignee; Supabase Auth com `workspace_members` + switcher quando o usuário tiver mais de um workspace. No piloto isso é o caso esperado da Direção (Hugs + ACR), não exceção nem só staff interno.
