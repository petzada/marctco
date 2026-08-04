# Pesquisa competitiva — CRMs (revisional)

**Escopo fechado** · ago/2026 · **Stack travada:** [stack-recomendada.md](../../stack-recomendada.md)  
**Guia de desenvolvimento:** [sintese-final.md](../../sintese-final.md)  
Decisões: [decisoes.md](./decisoes.md) · Síntese: [sintese.md](./sintese.md) · Pluga: [pluga.md](./pluga.md) · Manual: [sintese-manual.md](./sintese-manual.md)  
ADRs: [0001 stack](../adr/0001-stack-monolito-modular-ts.md) · [0002 workspace/tags](../adr/0002-workspace-tags-times.md) · Glossário: [CONTEXT.md](../../CONTEXT.md)

---

## Documentos

| Arquivo | Papel |
|---------|--------|
| [decisoes.md](./decisoes.md) | Decisões travadas + orquestração jurídico + riscos VoIP |
| [sintese.md](./sintese.md) | Base de produto MVP (espelho) |
| [sintese-manual.md](./sintese-manual.md) | Análise arquitetural Pluga + multi-tenant |
| [pluga.md](./pluga.md) | Integração Meta/Google via Pluga |
| [ploomes.md](./ploomes.md) · [clieent.md](./clieent.md) · [advbox.md](./advbox.md) · [piperun.md](./piperun.md) · [pipedrive.md](./pipedrive.md) | Referências de mercado |

---

## MVP em uma frase

Pluga/LP → WhatsMiau (template) → funil comercial por produto → assinatura (Clicksign/DocuSign) → handoff idempotente ao funil jurídico · score LLM opcional (OpenRouter) · 1 workspace/grupo + tags de time/filial.

---

## Fora do MVP

Inbox WhatsApp · calling Meta/WhatsMiau · VoIP · intimações/controladoria · CAPI Ads · LLM no 1º contato · billing in-app · analytics in-app (Himetrica = pós) · workspace por filial · compliance LGPD completa
