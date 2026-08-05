# 05 — Funis e etapas seedados

**Blocked by:** 03

**Status:** ready-for-agent

## What to build

Um workspace novo já nasce com funil comercial utilizável, para que o primeiro lead tenha onde cair sem depender do tipo de financiamento. Funil é fluxo operacional; veículo, imóvel e empréstimo pessoal são classificações opcionais da Oportunidade.

Nesta fatia os funis são **semeados, não editáveis pela interface** — mas o schema precisa suportar edição desde já, conforme o [ADR-0009](../../../docs/adr/0009-etapas-editaveis-papeis-e-status.md). A separação que faz isso funcionar: **rótulo e ordem pertencem ao cliente; papel pertence ao sistema.** Sem essa separação, renomear uma etapa quebraria a ingestão.

## Acceptance criteria

- [ ] `FinancingType` é enum opcional da Oportunidade e não possui `Pipeline`
- [ ] `Pipeline` com `type: COMMERCIAL | LEGAL` e `is_default`
- [ ] `Stage` com `position` mutável e `role: ENTRY | CLOSING | LEGAL_HANDOFF | NORMAL`
- [ ] Invariante validável: todo funil em uso tem **exatamente uma** `ENTRY` e **ao menos uma** `CLOSING`
- [ ] Invariante validável: **exatamente um** funil comercial por workspace tem `is_default = true`
- [ ] `CLOSING` é papel de fluxo, não de resultado — não confunde com `status: WON | LOST`
- [ ] Seed cria funil comercial marcado como padrão, com etapas razoáveis incluindo `ENTRY` e `CLOSING`
- [ ] Nenhuma FK ou regra escolhe funil a partir de `FinancingType`
- [ ] O seed é script de seed do Prisma, **não** migração
- [ ] **Nada no código busca etapa por nome** — só por identificador
- [ ] Renomear uma etapa não afeta comportamento nenhum
- [ ] Reordenação é atualização em lote transacional, de modo que duas etapas nunca empatem em `position` (schema e regra; a UI vem depois)
- [ ] Apagar a última `ENTRY`, a última `CLOSING` ou o funil padrão só é permitido se outra assumir o papel na mesma operação
- [ ] Editor de funis na interface está fora deste ticket e da fatia
