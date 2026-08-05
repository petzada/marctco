# Workspace único do grupo + tags para times/filiais

O cliente piloto (dono da consultoria comercial/jurídica) opera como **empresa mãe / grupo** com filiais e times. O tenant SaaS é **um Workspace** por grupo — não um workspace por filial. Organização interna: funis operacionais de áreas comercial/jurídica, **tipo de financiamento como atributo da Oportunidade**, **tags** em membros (e opcionalmente oportunidades) para filial/time/carteira, mais atribuição por usuário e roles.

**Status:** accepted · 2026-08-04

**Why not workspace-per-filial:** multiplicaria contas Pluga, flags, integrações WhatsMiau/assinatura e onboarding sem ganho no piloto.

**Consequences:** filtros Kanban/lista por tag e assignee; Supabase Auth com `workspace_members` + switcher só se o usuário tiver mais de um workspace (caso raro no piloto; comum para staff interno).
