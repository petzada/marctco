# 09 — Pessoa vira Oportunidade (o tracer bullet fecha)

**Blocked by:** 08, 05

**Status:** done

## What to build

O lead completa o caminho: a Pessoa do ticket 08 ganha uma **Oportunidade** na etapa `ENTRY` do funil comercial de destino. Tipo de financiamento, instituição e parcela são opcionais e não selecionam o funil.

**Todo envio com contato vira Oportunidade, inclusive os que carregam pendência.** Conflito de identidade e possível duplicado são marcadores no card, não portões. O único envio que não vira Oportunidade é o sem telefone e sem e-mail, que vai para quarentena (ticket 10).

**`arrived_at` é gravado agora, mesmo sem tela de SLA.** SLA é da Fase 3, mas o instante de chegada **não é reconstruível depois**: se não for capturado aqui, todo lead recebido até a Fase 3 nasce permanentemente sem relógio.

A idempotência tem um dono só: a constraint mais o worker. Nunca um pré-check no request — sob concorrência, duas retransmissões simultâneas passam ambas por um `SELECT` e só o banco arbitra. Ver [ADR-0007](https://github.com/petzada/marctco/blob/main/docs/adr/0007-ingestao-idempotencia.md).

## Acceptance criteria

**O módulo de ingestão**

- [x] A ingestão é um **módulo de `packages/domain`** com três funções puras: `planSubmission(inbound)`, `planPersonLookup(normalized)` e `decideIntake(input) → IntakePlan`. O worker não sequencia regra de negócio — ele executa o plano ([ADR-0017](https://github.com/petzada/marctco/blob/main/docs/adr/0017-ingestao-como-decisao-e-plano.md))
- [x] **Três fases e não uma**, porque o resultado do `ON CONFLICT` é **entrada** de `decideIntake`, não saída: sem ele não se sabe se o envio é novo ou retransmissão
- [x] **`now` é argumento** de `decideIntake`, nunca `Date.now()` por dentro — relógio lido internamente é I/O disfarçado e mata o teste puro
- [x] `IntakePlan` é **união discriminada**: `Quarantine | Retransmission | NewOpportunity`. Campos opcionais num plano único devolveriam as invariantes ao território da disciplina
- [x] `applyIntakePlan(ctx, plan)` em `packages/db` executa numa transação: `switch` exaustivo, **nenhuma** regra de negócio ([ADR-0016](https://github.com/petzada/marctco/blob/main/docs/adr/0016-contexto-de-acesso-e-leitor-escopado.md))

**Schema e idempotência**

- [x] `LeadSubmission` com `source`, `external_lead_id`, `received_at` e **`last_integration_event_id`** — **sem `raw`**. O payload é guardado uma vez, no `IntegrationEvent`; a submissão aponta para a transmissão mais recente em vez de repetir o conteúdo ([ADR-0014](https://github.com/petzada/marctco/blob/main/docs/adr/0014-copia-unica-e-retencao-do-payload.md))
- [x] `external_lead_id` é `NOT NULL` — em Postgres `NULL` não colide com `NULL`, e sem valor a constraint não deduplicaria nada
- [x] `UNIQUE(workspace_id, source, external_lead_id)`
- [x] A constraint arbitra, nunca um `SELECT` anterior — mas o mecanismo é **`INSERT ... ON CONFLICT DO NOTHING RETURNING id`**, não capturar a violação: em Postgres o erro aborta a transação inteira e o worker precisa seguir depois ([ADR-0007](https://github.com/petzada/marctco/blob/main/docs/adr/0007-ingestao-idempotencia.md)). `RETURNING` vazio é o sinal de duplicata
- [x] `Opportunity` criada com `status: OPEN`, `area: COMMERCIAL`, na etapa de papel `ENTRY` do funil de destino
- [x] Funil de destino é `IntegrationConnection.target_pipeline_id` quando presente, senão o `Pipeline` comercial com `is_default = true`
- [x] `FinancingType` **não** participa da escolha do funil, em nenhuma hipótese
- [x] Segunda Oportunidade **em aberto** da mesma Pessoa cria a Oportunidade **e** um `IntakeReview(POSSIBLE_DUPLICATE)` ligando-a à anterior — nunca impede a criação. O gatilho **não** é semelhança de financiamento: vale inclusive quando não veio dado algum de financiamento, que é o caso mais comum
- [x] **Carregado do ticket 08** — `IntakeReview` nasce aqui, com `type: IDENTITY_CONFLICT | POSSIBLE_DUPLICATE`, e a variante `NEW_PERSON_WITH_IDENTITY_CONFLICT` de `decidePersonIdentity` grava um `IDENTITY_CONFLICT` com as `candidate_person_ids` que ela carrega. O 08 decidiu e provou a regra no Seam 1; a linha não cabia lá porque uma revisão pendura numa Oportunidade
- [x] **Carregado do ticket 08** — a escrita de contatos é `INSERT … ON CONFLICT DO NOTHING` sobre `UNIQUE(person_id, phone_e164)` e `UNIQUE(person_id, email)`, e `PersonContacts` chega como o conjunto **completo** do envio. Receber um contato que a Pessoa já tem não altera linha nenhuma; nenhum contato anterior é sobrescrito
- [x] `Opportunity.missing_phone` gravado quando o envio traz e-mail mas não traz telefone — o marcador significa uma coisa só: não dá para WhatsApp nem ligar ([ADR-0007](https://github.com/petzada/marctco/blob/main/docs/adr/0007-ingestao-idempotencia.md) §Quarentena). Sem coluna aqui, todo lead recebido até o ticket 10 nasce sem o marcador e não há como reconstruí-lo
- [x] `arrived_at` gravado no momento da ingestão, igual ao `received_at` do envio. Lead que passa pela quarentena recebe o instante da liberação (ticket 10)
- [x] `assigned_user_id` nasce nulo — atribuição é da Fase 2
- [x] `financing_type`, `financial_institution` e `installment_amount` são anuláveis e não bloqueiam criação
- [x] Nenhuma Oportunidade jurídica é criada pela ingestão
- [x] Duas submissões simultâneas do mesmo `external_lead_id` produzem **uma** Oportunidade
- [x] **Seam 1**: o `IntakePlan` de cada caso — inequívoco, com pendência, sem contato, retransmissão — sem banco e sem container. É aqui que a regra é provada
- [x] **Seam 2 ponta a ponta**: lead inequívoco e lead com pendência resultam ambos em Pessoa + Oportunidade, o segundo com marcador; isolamento por workspace permanece provado. O Seam 2 prova que o plano é **aplicado como descrito**, não qual plano é o certo

## Comments

### O envio duplicado **sem card** não é retransmissão, e a condição é quem arbitra

> **Supersessão de 2026-08-11:** a condição abaixo continua sendo a arbitragem
> do mesmo envio, mas não fecha a corrida entre **envios distintos** da mesma
> Pessoa. Esse segundo caso é coordenado por `decideAndApplyIntake`, conforme a
> emenda do ADR-0017: locks canônicos escopados pelo workspace, lookup e decisão
> refeitos na transação, duas Oportunidades legítimas e
> `POSSIBLE_DUPLICATE` entre elas.

O ADR-0017 manda o chamador inserir **entre** a primeira fase e a terceira, o que põe o insert numa transação e a aplicação do plano noutra. Entre os dois commits o envio existe com `opportunity_id` nulo — e nesse instante "duplicata" e "já está no funil" deixam de ser o mesmo fato.

`decideIntake` trata `DUPLICATE` com `opportunity_id` nulo como envio novo, porque ir inerte ali engoliria o lead para sempre: a variante `Retransmission` protege um card, e ali não há card nenhum. Isso sozinho abriria a porta oposta — dois workers na mesma chave tomariam ambos esse caminho e escreveriam dois cards. Quem fecha é a condição na escrita: `applyIntakePlan` grava `opportunity_id` com `WHERE … AND opportunity_id IS NULL`, e a transação que não afeta linha nenhuma desfaz tudo o que fez e falha alto ([ADR-0013](https://github.com/petzada/marctco/blob/main/docs/adr/0013-fluxo-de-dados-no-app.md) — condição arbitra escrita concorrente). O perdedor não deixa Pessoa órfã, e a retentativa lê o card e vai inerte. Há teste dos dois lados no Seam 2 (`packages/db/tests/intake.test.ts`).

### `IntakeReview.resolution` não existe ainda, e é do ticket 11

A tabela de mapeamento do ADR-0005 lista `IntakeReview.resolution`, e a coluna **não** foi criada aqui. Este ticket só cria pendência; as três resoluções (`NEW_FINANCING`, `SAME_FINANCING`, `INVALID_OR_SPAM`), o autor e o motivo são o ticket 11, que sabe qual é a forma delas. Coluna anulável é aditiva e não custa nada acrescentar depois — o que custa é criar agora a forma errada e ter que mudá-la com linha dentro.

O que existe é o `CHECK` que faz a união valer no banco: `IDENTITY_CONFLICT` exige `candidate_person_ids` não vazio e `related_opportunity_id` nulo; `POSSIBLE_DUPLICATE`, o inverso. Uma revisão sem a evidência do próprio tipo é revisão que ninguém consegue resolver.

### Um id de origem grande demais é lido como ausente

`external_lead_id` é `VARCHAR(255)`, e `readLeadPayload` passou a degradar para ausente um id declarado maior que isso — o conector então usa o `IntegrationEvent.id`, o mesmo caminho de toda origem que não fornece id. Sem esse limite, a constraint que existe para nenhum lead entrar duas vezes seria exatamente o que recusaria a linha e perderia um. O custo é o de sempre neste desenho: dois `POST` com um id gigante idêntico viram duas submissões ligadas e visíveis, em vez de um lead engolido.

### `markIntegrationEventProcessed` deixou de existir

O estado final do evento passou a ser gravado por `applyIntakePlan`, na mesma transação das linhas que ele descreve. Uma operação separada só poderia rodar antes ou depois daquele commit, e as duas ordens deixam um instante em que a tela de Integrações e o funil discordam — card existindo com evento ainda em `RECEIVED`, ou o contrário. `processed_at` continua sendo de `PROCESSED` e de mais nada: evento em quarentena não foi processado, está esperando alguém completá-lo.

### O que ficou para os tickets seguintes

- **Ticket 10** — a quarentena já grava `QUARANTINED` e aponta o envio para a transmissão mais recente, mas a contagem de transmissões de um envio re-quarentenado não incrementa; quem decide se ela deve é o ticket que tem a tela.
- **Ticket 11** — a linha do tempo de "reenvio recebido" não existe porque não há model de timeline nesta fatia. A variante `Retransmission` já carrega `opportunity_id` para quando houver.
