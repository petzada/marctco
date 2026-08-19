# 01 — Configuração e domínio do primeiro contato

**What to build:** O gestor configura **quando** e **como** o primeiro contato automático dispara: gatilho (`Na atribuição`, `Na chegada`, `Desligado`) e texto do template com variáveis. A tela de Configurações ganha a seção; o domínio puro valida valores, resolve defaults e renderiza o texto conforme o gatilho — sem enviar mensagem ainda.

**Blocked by:** 00 — Contratos canônicos do canal

**Status:** ready-for-agent

- [ ] Migration adiciona `first_contact_trigger` e `first_contact_template_body` em configuração de workspace, usando os nomes já fechados pelo ticket 00
- [ ] Contrato canônico `v1` ganha `whatsapp_opt_in: boolean | null`; `LeadSubmission.whatsapp_opt_in` preserva a evidência e `Opportunity.whatsapp_opt_in` recebe o snapshot da submissão que criou/liberou a Oportunidade
- [ ] Domínio expõe default `ON_ASSIGNMENT`, enum de gatilhos e validação de template (vazio recusado quando gatilho ativo; variáveis inválidas para o gatilho recusadas na escrita)
- [ ] Domínio define conjuntos de variáveis: `ON_ASSIGNMENT` inclui atendente e telefone do atendente; `ON_ARRIVAL` não inclui variáveis de atendente
- [ ] Função pura de renderização de template com placeholders `{{snake_case}}` e recusa de variável ausente ou proibida
- [ ] Função pura de planejamento aplica flag → gatilho → opt-in verdadeiro → elegibilidade (`missing_phone`, status aberto e não mesclado); sem opt-in não cria efeito
- [ ] `planOpportunityPostCreationEffects` recebe o gatilho resolvido e só produz `AUTO_FIRST_CONTACT` em `ON_ARRIVAL`
- [ ] Operações nomeadas de leitura e escrita de configuração: Gestão e Direção escrevem; Atendente e Supervisor recusam escrita; workspace sem linha lê padrões do domínio
- [ ] UI em Configurações: seção "Primeiro contato automático" com select de gatilho (rótulos PT-BR), textarea de template e lista dinâmica de variáveis permitidas para o gatilho selecionado
- [ ] Seam 1: defaults, validação de gatilho e template, renderização, opt-in fail-closed, guards de flag/elegibilidade e planejador que não emite na chegada sob `ON_ASSIGNMENT`
- [ ] Seam 3: `workspace_settings` estendido sob RLS; escrita cross-workspace recusada

## Fora deste ticket

Conexão WhatsMiau, fila, worker, envio real, webhook, timeline de mensagem, hook em atribuição.
