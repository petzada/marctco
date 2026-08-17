# Fase 3 — handoff após tickets 01, 02, 03 e 06

Retome a implementação da Fase 3 (Tempo) **a partir do ticket 04**. Não reimplemente os tickets 01, 02, 03 ou 06: eles já foram implementados, revisados por um segundo agente, validados pelo orquestrador e integrados na branch `docs/fase-3-spec-e-tickets`.

## Estado integrado

HEAD do checkpoint: `9aa75b0` (`merge(fase-3): integrate first-contact clock`).

Entregues e aceitos:

- **01 — Atividade no lead:** model, operações nomeadas, card, concorrência e RLS.
- **02 — Configuração de SLA e estagnação:** padrões do domínio, escrita por Gestão/Direção e configuração no workspace.
- **03 — Relógio de primeiro contato:** `first_contact_at`, marcador de SLA e espera na tabela/card.
- **06 — Agenda:** dia/semana, filtros na URL, escopo por Oportunidade e conclusão otimista.

Decisão humana tomada durante o ticket 03:

- `Opportunity.closed_at` é o instante canônico que congela o SLA de um lead `WON`/`LOST` sem primeiro contato.
- A coluna e a invariante já estão na migration `20260817010300_opportunity_first_contact_at`.
- A futura operação de ganhar/perder da Fase 6 deverá preencher `closed_at`; não use `updated_at` como substituto.

Gates do estado combinado após integrar 03 sobre 06:

```text
pnpm typecheck          passou
pnpm lint               passou
pnpm test:unit          76 arquivos, 486 testes
pnpm test:db            22 arquivos, 324 testes
pnpm db:drift           sem diferença
pnpm check:migrations   passou
```

## Não aproveitar tentativa do ticket 04 desta sessão

O ticket 04 chegou a ser despachado em um worktree isolado, mas foi interrompido por decisão humana antes de qualquer commit, gate ou integração. O registro do worktree e o branch vazio foram removidos. **Não há commit para aproveitar:** comece o ticket 04 novamente a partir do HEAD deste checkpoint.

## Próxima fronteira

Somente:

- `.scratch/tempo/issues/04-estagnacao-e-fatos-de-movimento.md`
- Migration reservada: `20260817010400_...`

O ticket 04 depende de 01, 02 e 03, todos aceitos. O ticket 06 também já está aceito, mas não desbloqueia outra fatia sozinho.

Depois que o 04 for implementado, revisado e aceito, a fronteira será `[05, 07, 09]`. Antes de iniciar o 09, cumpra a parada humana obrigatória do `PROMPT-ORQUESTRACAO.md`: emendas do ADR-0019 e do ADR-0016/`CONTEXT.md`.

## Como retomar em outra sessão

1. Garanta que a branch `docs/fase-3-spec-e-tickets` deste checkpoint esteja disponível no outro computador.
2. Leia, nesta ordem: `AGENTS.md`, `.scratch/tempo/PROMPT-HANDOFF.md`, `.scratch/tempo/README.md`, `.scratch/tempo/spec.md`, `CONTEXT.md` e ADR-0005.
3. Execute:

```text
/implement @.scratch/tempo/PROMPT-HANDOFF.md
```

O novo agente deve agir como orquestrador: Grok 4.6 implementa o ticket 04 em worktree/banco próprios; Composer 2.5 revisa e corrige; o orquestrador repete os gates antes de aceitar e integrar.
