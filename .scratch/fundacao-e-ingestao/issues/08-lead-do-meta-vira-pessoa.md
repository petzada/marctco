# 08 — Contrato v1 normaliza e resolve Pessoa

**Blocked by:** 07

**Status:** done

## What to build

O worker passa a interpretar o contrato canônico `v1` preenchido pela Pluga. O domínio normaliza telefone, CPF, e-mail e valores financeiros, preserva múltiplos contatos e decide se a Pessoa é inequívoca ou se o envio precisa de revisão de identidade.

**Revisão nunca segura o lead.** Sob conflito, o caminho é criar Pessoa nova e marcar a pendência — não esperar decisão humana. Duplicar Pessoa temporariamente é reversível por mesclagem; perder a janela de contato de um lead de mídia paga não é.

O reconhecimento de pessoa recorrente é o coração deste ticket. O cliente atendido em março que volta em setembro com outro financiamento precisa ser a mesma Pessoa — inclusive quando troca de telefone e mantém o CPF, e inclusive quando o formulário do anúncio não traz CPF nenhum, que é o caso comum.

`packages/domain` é **puro**: não importa Prisma, não faz I/O. Isso não é preferência — é o que permite testar toda essa lógica no CI sem banco ([ADR-0011](../../../docs/adr/0011-monorepo-pnpm-e-dominio-puro.md)).

## Nota de escopo

Este ticket entrega a **decisão** e o **schema**; a **escrita** é do ticket 09, onde `decideIntake` monta o `IntakePlan` e `applyIntakePlan` o executa numa transação ([ADR-0017](../../../docs/adr/0017-ingestao-como-decisao-e-plano.md)). Dois critérios abaixo dependem dessa escrita e ficam desmarcados, com o motivo ao lado — o mesmo tratamento que o ticket 03 recebeu.

Isso é o que os próprios critérios dizem: todo bullet de prova aqui é **Seam 1**, e o único bullet de Seam 2 ponta a ponta da fatia está no ticket 09.

## Acceptance criteria

- [x] `packages/domain` não importa Prisma e não faz I/O — dependências novas são `zod` e `libphonenumber-js`, ambas puras; `scripts/check-prisma-imports.mjs` continua verde
- [x] O conector `v1` vive em `apps/worker`, não em `packages/domain` — `apps/worker/src/connector-v1.ts`. O *schema* do contrato fica no domínio porque o ADR-0017 exige que `apps/web` produza um `InboundLead` a partir do formulário de liberação sem importar o worker; o que o conector faz e o domínio não é conhecer a forma da origem, decidir `source` pela conexão e sintetizar `external_lead_id`
- [x] `InboundLead` → `normalize()` → `NormalizedLead`: dois tipos, com Zod como fonte única e tipo TypeScript inferido
- [x] **`planPersonLookup(normalized) → PersonLookupPlan`**: quem decide **por quais chaves buscar** é o domínio, não a consulta do worker. "CPF é forte, telefone só sem contradição, e-mail isolado é fraco" decide o que buscar, não apenas como arbitrar depois ([ADR-0017](../../../docs/adr/0017-ingestao-como-decisao-e-plano.md))
- [x] O plano é **dado inerte** — nenhuma porta, nenhum callback, nenhuma promise entra em `packages/domain`. Quem executa a busca é `findPersonCandidates(ctx, plan)` em `packages/db`, uma das duas operações que aceitam tanto `UserContext` quanto `JobContext`, porque a ingestão tem dois chamadores ([ADR-0016](../../../docs/adr/0016-contexto-de-acesso-e-leitor-escopado.md))
- [x] Telefone gravado em E.164, com Brasil como país padrão — o país padrão é conhecimento do domínio, não do conector
- [x] CPF gravado só com dígitos, com dígito verificador validado
- [x] E-mail gravado em minúsculas
- [x] `PersonPhone` e `PersonEmail` preservam múltiplos valores normalizados por Pessoa
- [x] CPF válido é forte, mas opcional; telefone só associa quando não há contradição; e-mail isolado é fraco
- [ ] Quando chaves apontam para Pessoas diferentes, cria **Pessoa nova** com os contatos do envio e registra `IntakeReview(type: IDENTITY_CONFLICT)` com as candidatas — **nunca** segura o envio
      — **decidido aqui, gravado no 09.** `decidePersonIdentity` devolve `NEW_PERSON_WITH_IDENTITY_CONFLICT` com `candidate_person_ids`, e o Seam 1 prova a regra. A linha de `IntakeReview` pendura numa Oportunidade ([ADR-0005](../../../docs/adr/0005-idioma-codigo-en-ui-pt-br.md)), que só existe a partir do ticket 09 — **quem fecha: 09**
- [x] Nenhum vínculo com cadastro existente é criado sob conflito, e nenhuma chave vence por prioridade fixa
- [x] `Person.merged_into_person_id` permite mesclagem posterior não destrutiva, preservando histórico e identificadores — coluna, FK composta intra-tenant e `CHECK` contra auto-referência; o invariante "nenhum registro ativo aponta para um registro mesclado" é varrido pelo Seam 3
- [x] Submissão com telefone novo e CPF conhecido reconhece a mesma Pessoa — não cria segunda
- [x] Casamento apenas por e-mail não funde cadastros automaticamente
- [ ] Nenhum contato anterior é sobrescrito ao receber um novo
      — **impossibilitado aqui, exercido no 09.** `UNIQUE(person_id, phone_e164)` e `UNIQUE(person_id, email)` existem e o Seam 3 prova que a segunda gravação do mesmo par é recusada em vez de substituir; não há caminho de `UPDATE` de valor de contato no schema. A escrita `INSERT … ON CONFLICT DO NOTHING` que fecha o critério é de `applyIntakePlan` — **quem fecha: 09**
- [x] Sem nenhuma das três chaves, **não** cria Pessoa — único caso em que a ingestão não produz Oportunidade (ver Comments: o critério foi lido pelo ADR-0007, que é mais estrito)
- [x] **Seam 1**: casos de borda de telefone brasileiro, CPF inválido, caixa de e-mail e conflito de chaves, sem banco e sem container
- [x] **Seam 1 cobre também o `PersonLookupPlan`**: qual conjunto de chaves cada envio produz. Sem isso, um worker que busque só por telefone reconhece menos gente do que este ticket promete e **todo teste puro continua verde**, porque é o teste que escolhe as candidatas que passa

## Comments

### Divergência resolvida: "sem nenhuma das três chaves" vs. "sem telefone e sem e-mail"

O critério deste ticket diz que sem **nenhuma das três** chaves não se cria Pessoa, o que faria um envio só com CPF criar uma. O [ADR-0007](../../../docs/adr/0007-ingestao-idempotencia.md) diz outra coisa, duas vezes: quarentena é "sem telefone **e** sem e-mail", e sair dela "exige ao menos um contato", porque uma `Person` sem contato "nunca casará com nada" e produz "uma Oportunidade que nenhum atendente consegue atender, com relógio correndo".

O ADR vence (degrau 1 da escada de `AGENTS.md`). `decidePersonIdentity` devolve `NO_CONTACT` quando não há telefone nem e-mail, **inclusive com CPF válido presente**, e há um teste com esse nome exato. O CPF continua entrando como chave de busca quando há contato — ele identifica, mas não é por onde se liga para alguém.

### O que o conector ficou sendo, exatamente

`readLeadPayload` (domínio) lê o payload de forma tolerante e nunca lança: campo do tipo errado degrada para ausente, propriedade desconhecida é ignorada e continua no bruto, e um corpo que nem é objeto vira um envio vazio. `connectV1` (worker) é quem decide `source` — declarado no payload, senão pela conexão — e sintetiza `external_lead_id` a partir do `IntegrationEvent.id`.

O contrato aceita `phone`/`phones` e `email`/`emails`. O plural é o publicado; o singular existe porque é o que quem mapeia uma pergunta de formulário Meta escreve primeiro, e recusar custaria um lead para ensinar uma lição sobre plural.

### Achados para os tickets seguintes

- **`PROVIDER_DEFAULT_SOURCE` em `connector-v1.ts` mapeia `PLUGA → META_LEAD_ADS`.** É o único destino Pluga desta fatia. O **ticket 13** precisa fazer o Google declarar `source` no payload (e o **14** precisa pôr `source` no modelo copiável), senão lead do Google entra rotulado como Meta.
- **`readIntegrationEventForProcessing` agora devolve `provider`**, lido por `JOIN` com `integration_connections` na mesma transação sob RLS. O ticket 09 precisa do `target_pipeline_id` da mesma conexão — cabe no mesmo `SELECT`.
- **`processIntegrationEventJob` devolve `person_decision`.** O ticket 09 troca esse retorno pelo `IntakePlan` de `decideIntake`, sem mover nada do que já está aqui.
- **A varredura de lápide do Seam 3 estava furada para FK composta** e foi reescrita em `pg_catalog` com pareamento por ordinal. Com `information_schema`, a FK `person_phones (workspace_id, person_id) → persons (workspace_id, id)` produzia o produto cartesiano e inventava um join `workspace_id = workspace_id`, contando todo contato de um workspace que apenas *contém* uma Pessoa mesclada como violação. O `Opportunity.merged_into_opportunity_id` do ticket 09 entra na varredura sem nenhuma edição.
- **`persons.cpf` é `text`, não `char(11)`** — bpchar preenche com espaço na leitura, e uma chave de busca que deixa de ser igual a si mesma fora do banco não é chave.
- **O ponteiro de mesclagem é `NO ACTION`, não `RESTRICT`.** Apagar um workspace remove lápide e canônica no mesmo comando em cascata, e `RESTRICT` é verificado por linha enquanto `NO ACTION` é verificado no fim — com `RESTRICT` a cascata falha contra si mesma.
- **`libphonenumber-js/max`, não o pacote padrão.** Só a metadata completa carrega o *tipo* do número; com a `min`, `getType()` devolve `undefined` sempre e a recusa de 0800 vira no-op silencioso.
