# Arquivo — Fases 0 a 4

**Branch congelada. Não recebe merge, não sai daqui para a `main`, e nada aqui é autoridade.**

Este é o material das quatro fatias que já fecharam do CRM marctco: as specs, os
tickets, os registros de execução e a pesquisa de mercado que precedeu as
decisões. Saiu da `main` em 2026-08-24 para que o repositório de trabalho
contenha código e as decisões vivas, e não o histórico de como se chegou nelas.

O ponto exato da árvore quando as Fases 0–4 fecharam está na tag
[`fases-0-4`](https://github.com/petzada/marctco/releases/tag/fases-0-4)
(commit `22852ab`), que era idêntica ao que rodava em produção na Railway.

## O que existe aqui

| Pasta | Fatia | Estado |
|---|---|---|
| [`.scratch/fundacao-e-ingestao/`](./.scratch/fundacao-e-ingestao/) | Fases 0 e 1 — monorepo, RLS, workspace, contrato `v1`, outbox, tela de Leads | fechada |
| [`.scratch/operacao-do-lead/`](./.scratch/operacao-do-lead/) | Fase 2 — atribuição em dois níveis, Equipe, escopo do Supervisor, Kanban | fechada |
| [`.scratch/tempo/`](./.scratch/tempo/) | Fase 3 — Atividade, SLA, estagnação, Agenda, Dashboard, notificações | fechada |
| [`.scratch/canal/`](./.scratch/canal/) | Fase 4 — WhatsMiau, template de 1º contato, timeline no card | fechada |
| [`.scratch/fechamento-fases-0-2.md`](./.scratch/fechamento-fases-0-2.md) | fechamento consolidado das Fases 0–2 | histórico |
| [`docs/pesquisa/`](./docs/pesquisa/) | concorrentes (advbox, clieent, pipedrive, piperun, ploomes) e as sínteses de mercado | evidência |
| [`PROMPT-INICIAL.md`](./PROMPT-INICIAL.md) · [`PROMPT-GOAL-IMPLEMENTACAO.md`](./PROMPT-GOAL-IMPLEMENTACAO.md) | prompts que abriram fatias já encerradas | histórico |

A pesquisa aqui é **degrau 5** da escada de precedência: evidência, nunca
autoridade. As decisões que ela produziu viraram ADRs, e os ADRs ficaram na
`main`.

## O que **não** veio para cá

Continua na `main`, viva:

- `CONTEXT.md`, `docs/adr/`, `DESIGN.md`, `stack-recomendada.md`,
  `decisao-features-concorrentes.md`, `sintese-final.md`,
  `docs/pesquisa/decisoes.md` — a escada de precedência inteira
- `docs/plano-de-construcao.md` — as 8 fases e os itens abertos
- `docs/pesquisa/pluga.md` e `docs/pesquisa/whatsmiau-api-v2.md` — referência
  técnica de integrações **em produção**, não histórico
- `.scratch/pluga-onboarding-ux/` — o De→Para das telas da Pluga, operacional

**Os cinco tickets que ainda não fecharam também não estão aqui**, de propósito:
um ticket aberto não é arquivo, e duas cópias produzem divergência. Eles vivem em
[`.scratch/aberto/`](https://github.com/petzada/marctco/tree/main/.scratch/aberto)
na `main`:

| Ticket | Origem | Por que continua aberto |
|---|---|---|
| `19 — N conexões por provedor` | fundação e ingestão | ADR-0031 não implementado; `UNIQUE(workspace_id, provider)` ainda no schema |
| `08 — Empresa agrupa equipes` | operação do lead | ADR-0029 não implementado; não há `Company` nem `Tag.company_id` |
| `09 — Supervisor não alcança Supervisor` | operação do lead | ADR-0028 não implementado |
| `13 — Google Lead Form` | fundação e ingestão | `needs-info` — exige conta Pluga paga |
| `14 — Tela Integrações Pluga` | fundação e ingestão | `needs-info` — mesmo bloqueio |

## Links

Links relativos que apontavam para arquivos que ficaram na `main` foram
reescritos para URLs absolutas do GitHub (270 deles). Os links entre arquivos
desta branch continuam relativos e funcionam aqui dentro.
