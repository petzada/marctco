# 08 — Contrato v1 normaliza e resolve Pessoa

**Blocked by:** 07

**Status:** ready-for-agent

## What to build

O worker passa a interpretar o contrato canônico `v1` preenchido pela Pluga. O domínio normaliza telefone, CPF, e-mail e valores financeiros, preserva múltiplos contatos e decide se a Pessoa é inequívoca ou se o envio precisa de revisão de identidade.

**Revisão nunca segura o lead.** Sob conflito, o caminho é criar Pessoa nova e marcar a pendência — não esperar decisão humana. Duplicar Pessoa temporariamente é reversível por mesclagem; perder a janela de contato de um lead de mídia paga não é.

O reconhecimento de pessoa recorrente é o coração deste ticket. O cliente atendido em março que volta em setembro com outro financiamento precisa ser a mesma Pessoa — inclusive quando troca de telefone e mantém o CPF, e inclusive quando o formulário do anúncio não traz CPF nenhum, que é o caso comum.

`packages/domain` é **puro**: não importa Prisma, não faz I/O. Isso não é preferência — é o que permite testar toda essa lógica no CI sem banco ([ADR-0011](../../../docs/adr/0011-monorepo-pnpm-e-dominio-puro.md)).

## Acceptance criteria

- [ ] `packages/domain` não importa Prisma e não faz I/O
- [ ] O conector `v1` vive em `apps/worker`, não em `packages/domain`
- [ ] `InboundLead` → `normalize()` → `NormalizedLead`: dois tipos, com Zod como fonte única e tipo TypeScript inferido
- [ ] **`planPersonLookup(normalized) → PersonLookupPlan`**: quem decide **por quais chaves buscar** é o domínio, não a consulta do worker. "CPF é forte, telefone só sem contradição, e-mail isolado é fraco" decide o que buscar, não apenas como arbitrar depois ([ADR-0017](../../../docs/adr/0017-ingestao-como-decisao-e-plano.md))
- [ ] O plano é **dado inerte** — nenhuma porta, nenhum callback, nenhuma promise entra em `packages/domain`. Quem executa a busca é `findPersonCandidates(ctx, plan)` em `packages/db`, uma das duas operações que aceitam tanto `UserContext` quanto `JobContext`, porque a ingestão tem dois chamadores ([ADR-0016](../../../docs/adr/0016-contexto-de-acesso-e-leitor-escopado.md))
- [ ] Telefone gravado em E.164, com Brasil como país padrão — o país padrão é conhecimento do domínio, não do conector
- [ ] CPF gravado só com dígitos, com dígito verificador validado
- [ ] E-mail gravado em minúsculas
- [ ] `PersonPhone` e `PersonEmail` preservam múltiplos valores normalizados por Pessoa
- [ ] CPF válido é forte, mas opcional; telefone só associa quando não há contradição; e-mail isolado é fraco
- [ ] Quando chaves apontam para Pessoas diferentes, cria **Pessoa nova** com os contatos do envio e registra `IntakeReview(type: IDENTITY_CONFLICT)` com as candidatas — **nunca** segura o envio
- [ ] Nenhum vínculo com cadastro existente é criado sob conflito, e nenhuma chave vence por prioridade fixa
- [ ] `Person.merged_into_person_id` permite mesclagem posterior não destrutiva, preservando histórico e identificadores
- [ ] Submissão com telefone novo e CPF conhecido reconhece a mesma Pessoa — não cria segunda
- [ ] Casamento apenas por e-mail não funde cadastros automaticamente
- [ ] Nenhum contato anterior é sobrescrito ao receber um novo
- [ ] Sem nenhuma das três chaves, **não** cria Pessoa — único caso em que a ingestão não produz Oportunidade
- [ ] **Seam 1**: casos de borda de telefone brasileiro, CPF inválido, caixa de e-mail e conflito de chaves, sem banco e sem container
- [ ] **Seam 1 cobre também o `PersonLookupPlan`**: qual conjunto de chaves cada envio produz. Sem isso, um worker que busque só por telefone reconhece menos gente do que este ticket promete e **todo teste puro continua verde**, porque é o teste que escolhe as candidatas que passa
