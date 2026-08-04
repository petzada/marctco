# 05 — Produtos, funis e etapas seedados

**Blocked by:** 03

**Status:** ready-for-agent

## What to build

Um workspace novo já nasce com produto e funil comercial utilizáveis, para que o primeiro lead tenha onde cair sem que ninguém configure nada antes.

Nesta fatia os funis são **semeados, não editáveis pela interface** — mas o schema precisa suportar edição desde já, conforme o [ADR-0009](../../../docs/adr/0009-etapas-editaveis-papeis-e-status.md). A separação que faz isso funcionar: **rótulo e ordem pertencem ao cliente; papel pertence ao sistema.** Sem essa separação, renomear uma etapa quebraria a ingestão.

## Acceptance criteria

- [ ] `Product` representa a linha de negócio (veículo, imóvel, empréstimo pessoal)
- [ ] `Pipeline` com `type: COMMERCIAL | LEGAL`
- [ ] `Stage` com `position` mutável e `role: ENTRY | LEGAL_HANDOFF | NORMAL`
- [ ] Invariante validável: todo funil comercial em uso tem **exatamente uma** etapa `ENTRY`
- [ ] Seed cria produto e funil comercial com etapas razoáveis, incluindo a `ENTRY`
- [ ] O seed é script de seed do Prisma, **não** migração
- [ ] **Nada no código busca etapa por nome** — só por identificador
- [ ] Renomear uma etapa não afeta comportamento nenhum
- [ ] Reordenação é atualização em lote transacional, de modo que duas etapas nunca empatem em `position` (schema e regra; a UI vem depois)
- [ ] Editor de funis na interface está fora deste ticket e da fatia
