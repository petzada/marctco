# 01 — Configuração e domínio do primeiro contato

**What to build:** O gestor configura **quando** e **como** o primeiro contato automático dispara: gatilho (`Na atribuição`, `Na chegada`, `Desligado`) e texto do template com variáveis. A tela de Configurações ganha a seção; o domínio puro valida valores, resolve defaults e renderiza o texto conforme o gatilho — sem enviar mensagem ainda.

**Blocked by:** 00 — Contratos canônicos do canal

**Status:** done

- [x] Migration adiciona `first_contact_trigger` e `first_contact_template_body` em configuração de workspace, usando os nomes já fechados pelo ticket 00
- [x] Contrato canônico `v1` ganha `whatsapp_opt_in: boolean | null`; `LeadSubmission.whatsapp_opt_in` preserva a evidência e `Opportunity.whatsapp_opt_in` recebe o snapshot da submissão que criou/liberou a Oportunidade
- [x] Domínio expõe default `ON_ASSIGNMENT`, enum de gatilhos e validação de template (vazio recusado quando gatilho ativo; variáveis inválidas para o gatilho recusadas na escrita)
- [x] Domínio define conjuntos de variáveis: `ON_ASSIGNMENT` inclui atendente e telefone do atendente; `ON_ARRIVAL` não inclui variáveis de atendente
- [x] Função pura de renderização de template com placeholders `{{snake_case}}` e recusa de variável ausente ou proibida
- [x] Função pura de planejamento aplica flag → gatilho → opt-in verdadeiro → elegibilidade (`missing_phone`, status aberto e não mesclado); sem opt-in não cria efeito
- [x] `planOpportunityPostCreationEffects` recebe o gatilho resolvido e só produz `AUTO_FIRST_CONTACT` em `ON_ARRIVAL`
- [x] Operações nomeadas de leitura e escrita de configuração: Gestão e Direção escrevem; Atendente e Supervisor recusam escrita; workspace sem linha lê padrões do domínio
- [x] UI em Configurações: seção "Primeiro contato automático" com select de gatilho (rótulos PT-BR), textarea de template e lista dinâmica de variáveis permitidas para o gatilho selecionado
- [x] Seam 1: defaults, validação de gatilho e template, renderização, opt-in fail-closed, guards de flag/elegibilidade e planejador que não emite na chegada sob `ON_ASSIGNMENT`
- [x] Seam 3: `workspace_settings` estendido sob RLS; escrita cross-workspace recusada

## Fora deste ticket

Conexão WhatsMiau, fila, worker, envio real, webhook, timeline de mensagem, hook em atribuição.

## Evidence

- Migration `20260819010100_first_contact_settings_and_opt_in`: enum `first_contact_trigger`, colunas anuláveis em `workspace_settings`, `lead_submissions.whatsapp_opt_in` e `opportunities.whatsapp_opt_in`; `GRANT USAGE` do enum; RLS existente cobre as colunas novas.
- Domínio em `packages/domain/src/first-contact.ts`: default `ON_ASSIGNMENT`, conjuntos de variáveis, `parseFirstContactTemplate`, `renderFirstContactTemplate`, `planFirstContactDispatch` (flag → gatilho → opt-in `true` → elegibilidade).
- Contrato `v1`: `whatsapp_opt_in` em `InboundLead` / `NormalizedLead` / `IntakePlan.NEW_OPPORTUNITY`; INSERT da submissão não sobrescreve no duplicate; snapshot na Oportunidade.
- `planOpportunityPostCreationEffects` só emite `AUTO_FIRST_CONTACT` em `ON_ARRIVAL`; o worker de ingestão lê a flag antes das settings e não dispara no default.
- UI em Configurações: seção "Primeiro contato automático", POST `/settings/first-contact`, rótulos PT-BR, lista dinâmica de variáveis.
- Revisão Composer 2.5 (`composer-2.5-fast`): nenhum defeito confirmado; gates reexecutados verdes. Sem commit.
