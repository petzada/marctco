# 05 — Funis e etapas seedados

**Blocked by:** 03

**Status:** done

## What to build

Um workspace novo já nasce com funil comercial utilizável, para que o primeiro lead tenha onde cair sem depender do tipo de financiamento. Funil é fluxo operacional; veículo, imóvel e empréstimo pessoal são classificações opcionais da Oportunidade.

Nesta fatia os funis são **semeados, não editáveis pela interface** — mas o schema precisa suportar edição desde já, conforme o [ADR-0009](../../../docs/adr/0009-etapas-editaveis-papeis-e-status.md). A separação que faz isso funcionar: **rótulo e ordem pertencem ao cliente; papel pertence ao sistema.** Sem essa separação, renomear uma etapa quebraria a ingestão.

## Acceptance criteria

- [x] `FinancingType` é enum opcional da Oportunidade e não possui `Pipeline`
- [x] `Pipeline` com `type: COMMERCIAL | LEGAL` e `is_default`
- [x] `Stage` com `position` mutável e `role: ENTRY | CLOSING | LEGAL_HANDOFF | NORMAL`
- [x] Invariante validável: todo funil em uso tem **exatamente uma** `ENTRY` e **ao menos uma** `CLOSING`
- [x] Invariante validável: **exatamente um** funil comercial por workspace tem `is_default = true`
- [x] `CLOSING` é papel de fluxo, não de resultado — não confunde com `status: WON | LOST`
- [x] A **definição** dos funis padrão vive em `packages/domain`, como dado puro testável no Seam 1
- [x] Essa definição tem **dois consumidores e uma cópia só**: o `db seed` de desenvolvimento e o provisionamento de produção (ticket 17). `prisma db seed` é script de desenvolvimento e **não roda quando um cliente real cria workspace** — semear só por ele deixaria todo workspace de verdade sem funil
- [x] Seed cria funil comercial marcado como padrão, com etapas razoáveis incluindo `ENTRY` e `CLOSING`
- [x] Nenhuma FK ou regra escolhe funil a partir de `FinancingType`
- [x] O seed é script de seed do Prisma, **não** migração
- [x] **Nada no código busca etapa por nome** — só por identificador
- [x] Renomear uma etapa não afeta comportamento nenhum
- [x] Reordenação é atualização em lote transacional, de modo que duas etapas nunca empatem em `position` (schema e regra; a UI vem depois)
- [x] Apagar a última `ENTRY`, a última `CLOSING` ou o funil padrão só é permitido se outra assumir o papel na mesma operação
- [x] Editor de funis na interface está fora deste ticket e da fatia

## Comments

### Implementação — 2026-08-05

- A migration cria `Pipeline` e `Stage` com RLS, FK composta por workspace, índice de tenant, unicidades parciais e constraint triggers diferidos. Assim `ENTRY`, `CLOSING`, funil comercial padrão e posições só precisam estar válidos no commit da operação completa.
- `defaultCommercialPipeline` é dado puro de `packages/domain`; o `prisma/seed.ts` de desenvolvimento o consome. A mesma exportação pública é a única definição que o provisionamento do ticket 17 deverá passar a consumir, sem copiar etapas em SQL ou no seed.
- `reorderStages`, `replaceStageRoles`, `deleteStage` e `deletePipeline` são operações nomeadas em `packages/db`, transacionais e limitadas a Gestão/Direção. Não há editor de interface nesta entrega.
- Provas executadas: migration limpa do zero, `prisma db seed` duas vezes, `pnpm test:unit`, `pnpm test:db`, `pnpm test:a7`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm db:drift` e `pnpm check:migrations`.
