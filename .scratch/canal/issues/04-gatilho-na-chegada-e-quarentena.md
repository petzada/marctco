# 04 — Gatilho na chegada e quarentena

**What to build:** Quando o gestor configura gatilho **na chegada**, a mesma transação que cria a Oportunidade registra a tentativa/outbox — na ingestão e na liberação da quarentena. O engate `post_creation_effects` deixa de ser só planejamento, sem chamar Redis diretamente.

**Blocked by:** 02 — Conexão WhatsMiau; 03a — Tentativa outbound e outbox transacional

**Status:** ready-for-agent

- [ ] Worker de ingestão consome `AUTO_FIRST_CONTACT` **somente** com gatilho `ON_ARRIVAL` e registra tentativa na transação de criação — não duplica lógica fora do módulo profundo do 03a
- [ ] Operação nomeada em `packages/db` encapsula flags, configuração e planejamento para a liberação de quarentena; o handler web não importa o catálogo de feature flags
- [ ] Template renderizado sem variáveis de atendente; recusa de template que exija variáveis proibidas neste gatilho
- [ ] Mesmas regras de opt-in, dedupe e elegibilidade do 03a; `first_contact_at` só nasce depois no worker
- [ ] Com gatilho `ON_ASSIGNMENT`, ingestão e quarentena **não** registram tentativa
- [ ] Testes: `ON_ARRIVAL` registra outbox na ingestão; `ON_ASSIGNMENT` não; release de quarentena registra quando aplicável; falta de opt-in falha fechado

## Fora deste ticket

Hook de atribuição (03c), webhook inbound, UI da timeline (06), Seam 4 (07).
