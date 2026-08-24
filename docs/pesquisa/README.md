# Pesquisa — o que ficou vivo

**Escopo fechado** · ago/2026 · **Stack travada:** [stack-recomendada.md](../../stack-recomendada.md)  
**Guia de desenvolvimento:** [sintese-final.md](../../sintese-final.md)  
ADRs: [0001 stack](../adr/0001-stack-monolito-modular-ts.md) · [0002 workspace/tags](../adr/0002-workspace-tags-times.md) · Glossário: [CONTEXT.md](../../CONTEXT.md)

Em 2026-08-24 esta pasta foi dividida. A pesquisa competitiva que **precedeu** as
decisões foi para a branch de arquivo; ficou aqui o que ainda se lê para
trabalhar no sistema.

## Nesta pasta

| Arquivo | Papel | Por que continua na `main` |
|---------|-------|----------------------------|
| [decisoes.md](./decisoes.md) | Decisões travadas + orquestração jurídico + riscos VoIP | **Degrau 4** da [escada de precedência](../../AGENTS.md#precedência-entre-documentos), junto com `sintese-final.md`. É autoridade, não evidência |
| [pluga.md](./pluga.md) | Integração Meta/Google via Pluga; planos e dimensionamento de custo | A integração está **em produção**, e os itens A15/A16 do [plano](../plano-de-construcao.md) citam esta tabela como insumo comercial |
| [whatsmiau-api-v2.md](./whatsmiau-api-v2.md) | Recorte da Whatsmiau Cloud API v2 usado pelo canal | Contrato externo do que a **Fase 4 colocou em produção** |

## No arquivo

Na branch [`docs/arquivo-fases-0-4`](https://github.com/petzada/marctco/tree/docs/arquivo-fases-0-4/docs/pesquisa) — **degrau 5: evidência, nunca autoridade.** O que ela produziu já virou ADR.

| Arquivo | Papel |
|---------|-------|
| [sintese.md](https://github.com/petzada/marctco/blob/docs/arquivo-fases-0-4/docs/pesquisa/sintese.md) | Base de produto MVP (espelho) |
| [sintese-manual.md](https://github.com/petzada/marctco/blob/docs/arquivo-fases-0-4/docs/pesquisa/sintese-manual.md) | Análise arquitetural Pluga + multi-tenant |
| [ploomes.md](https://github.com/petzada/marctco/blob/docs/arquivo-fases-0-4/docs/pesquisa/ploomes.md) · [clieent.md](https://github.com/petzada/marctco/blob/docs/arquivo-fases-0-4/docs/pesquisa/clieent.md) · [advbox.md](https://github.com/petzada/marctco/blob/docs/arquivo-fases-0-4/docs/pesquisa/advbox.md) · [piperun.md](https://github.com/petzada/marctco/blob/docs/arquivo-fases-0-4/docs/pesquisa/piperun.md) · [pipedrive.md](https://github.com/petzada/marctco/blob/docs/arquivo-fases-0-4/docs/pesquisa/pipedrive.md) | Referências de mercado |

---

## MVP em uma frase

Pluga/LP servidor-servidor → contrato `v1` + outbox → funil comercial configurado → WhatsMiau → assinatura → handoff humano idempotente ao funil jurídico · financiamento opcional · 1 workspace/grupo + tags.

---

## Fora do MVP

Inbox WhatsApp · calling Meta/WhatsMiau · VoIP · intimações/controladoria · CAPI Ads · LLM no 1º contato · billing in-app · analytics in-app (Himetrica = pós) · workspace por filial · compliance LGPD completa
