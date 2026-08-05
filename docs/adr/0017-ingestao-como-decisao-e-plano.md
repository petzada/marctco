# Ingestão é decisão pura; o plano de escrita é dado

A ingestão passa a ser um **módulo** em `packages/domain` com três funções puras — `planSubmission`, `planPersonLookup` e `decideIntake` — que devolvem, respectivamente, a chave idempotente, quais chaves buscar e o **`IntakePlan`**: o conjunto de escritas descrito como dado. `packages/db` aplica o plano numa transação. Os dois chamadores são o job do worker e o "completar e liberar" da tela de Integrações.

**Status:** accepted · 2026-08-05

## O problema

O [ADR-0011](./0011-monorepo-pnpm-e-dominio-puro.md) travou que o domínio recebe dado e devolve decisão, e o [ADR-0008](./0008-fronteira-conector-dominio.md) travou onde fica o conector. Nenhum dos dois disse **quem sequencia** — e a sequência acabou, por omissão, dentro do job do worker. Três defeitos saem daí.

### O "mesmo caminho" da issue 14 não tem onde morar

A issue 14 exige, ao pé da letra: *"Liberar um lead da quarentena cria Pessoa e Oportunidade pelo mesmo caminho da ingestão — literalmente o mesmo, sem desvio que crie `Person` sem chave"*. Esse chamador está em `apps/web`. O roteiro está em `apps/worker`. Um app não importa outro app, e `packages/domain` não escreve. **Hoje não existe lugar onde esse caminho compartilhado possa existir** — o critério de aceite é insatisfazível como a fatia está desenhada.

Não é detalhe de organização. É o desvio que a própria issue proíbe: quem reimplementa "criar Pessoa e Oportunidade" numa segunda tela é quem esquece o `IntakeReview`, ou grava `arrived_at` errado, ou aceita liberar sem contato.

### As invariantes moram na sequência, e a sequência só tem o teste mais caro

*"Retransmissão não altera etapa, responsável, situação nem `arrived_at`"*. *"Negócio perdido não reabre."* *"Card que já avançou permanece na etapa em que estava."* São as regras que a issue 11 mais protege, e a razão delas é operacional: **um card que volta sozinho destrói a confiança da equipe no funil mais rápido que um lead perdido.**

Com o roteiro no worker, provar qualquer uma exige o Seam 2 inteiro — Postgres, Redis e BullMQ reais. O teste mais caro do projeto acaba encarregado da regra mais fácil de errar, e o Seam 1, que é rápido o bastante para cobrir borda em volume, não a alcança.

### A escolha das chaves de busca está fora do domínio

O ADR-0011 escreve a assinatura como `decideReuseOfPerson(candidates, normalizedLead)` — candidatas **já buscadas**. Mas "CPF válido é o mais forte quando presente, telefone só identifica sem contradição, e-mail isolado é chave fraca" ([ADR-0007](./0007-ingestao-idempotencia.md) §Identidade) decide **o que buscar**, não apenas como arbitrar depois.

Com a consulta escrita no worker, metade da regra de identidade fica fora do módulo que a documenta. Um worker que busque só por telefone reconhece menos gente do que a issue 08 promete — e **todo teste do Seam 1 continua verde**, porque é o teste que escolhe as candidatas que passa. O sintoma aparece meses depois como "o cliente de março voltou e virou pessoa nova": exatamente o defeito que a issue 08 chama de coração do ticket.

## A decisão

Um módulo `intake` em `packages/domain`. Três fases, todas puras:

```
planSubmission(inbound)      → SubmissionKey       // source + external_lead_id
planPersonLookup(normalized) → PersonLookupPlan    // quais chaves, e com que força
decideIntake(input)          → IntakePlan          // o que escrever
```

**Três fases e não uma**, porque o resultado do `INSERT … ON CONFLICT DO NOTHING RETURNING id` é **entrada** da decisão, não saída dela: sem ele não se sabe se o envio é novo ou retransmissão, e o ADR-0007 é explícito que só a constraint arbitra. O chamador insere entre a primeira fase e a terceira.

`decideIntake` recebe o resultado do insert (`inserted | duplicate`), as candidatas que o lookup devolveu, o `NormalizedLead`, o funil de destino e o instante. **`now` é argumento**, nunca `Date.now()` por dentro — relógio lido internamente é I/O disfarçado, e mataria o teste puro do mesmo jeito que uma consulta mataria.

### `IntakePlan` é união discriminada

Cada variante é um caso do ADR-0007, e a exaustividade é do compilador:

| Variante | O que descreve |
|---|---|
| `Quarantine` | Sem telefone **e** sem e-mail: nenhuma `Person`, nenhuma `Opportunity`, evento em `QUARANTINED` |
| `Retransmission` | Aponta `last_integration_event_id` para o evento novo, incrementa tentativas, registra "reenvio recebido" na timeline |
| `NewOpportunity` | `Person` (reúso ou nova) + `Opportunity` na etapa `ENTRY` + `arrived_at` + `missing_phone` + `IntakeReview[]` |

**A variante `Retransmission` não tem campo de etapa, responsável, situação nem `arrived_at`.** É a parte mais valiosa desta decisão: "retransmissão não rebobina o funil" deixa de ser disciplina e vira ausência de campo no tipo. Não há como escrever o bug — não há onde escrevê-lo.

`applyIntakePlan(ctx, plan)` em `packages/db` executa o plano numa transação, sob o contexto de acesso do [ADR-0016](./0016-contexto-de-acesso-e-leitor-escopado.md): um `switch` exaustivo, nenhuma regra de negócio, nenhuma decisão.

### Os dois chamadores

| Chamador | `now` | Evento |
|---|---|---|
| `apps/worker` — job de ingestão | `received_at` do envio | despachado pelo dispatcher |
| `apps/web` — route handler "completar e liberar" | instante da **liberação** | o evento em quarentena, completado pelo gestor |

É literalmente a mesma função, que é o que a issue 14 pede. E o `arrived_at` divergente do ADR-0007 §Quarentena — *"para lead liberado da quarentena, `arrived_at` é o instante da liberação"* — deixa de ser exceção escondida dentro de um caminho: é o mesmo argumento com valor diferente, e o Seam 1 cobre os dois lado a lado.

O conector continua em `apps/worker` ([ADR-0008](./0008-fronteira-conector-dominio.md)) e continua sendo quem sintetiza `external_lead_id` a partir do `IntegrationEvent.id`. Nada nesta decisão move o adapter.

### O `InboundLead` da liberação vem do formulário, não do conector

`planPersonLookup` precisa de um `NormalizedLead`, e chegar nele exige um `InboundLead`. No worker quem o produz é o conector — que fica em `apps/worker` e que `apps/web` não pode importar. Sem resolver isto, o mesmo defeito que este ADR conserta reapareceria um nível abaixo.

A saída não é mover o conector: é notar que **ali não há forma de origem para interpretar**. O conector existe para converter o formato de uma origem no contrato `v1`; na liberação, quem preenche o contrato é o gestor, lendo o payload cru ao lado e digitando o que está vendo. O formulário de "completar e liberar" coleta campos `v1` — nome, telefone, e-mail, CPF — e **produz `InboundLead` diretamente**, com `external_lead_id` e `source` preservados do envio original.

Isso mantém o ADR-0008 intacto nas duas pontas: o conector continua sendo o único que conhece forma de origem, e continua não conhecendo funil, Person nem Opportunity. E é coerente com o que a issue 14 já dizia sobre o caso real — *"o contato ter chegado num campo que o mapeamento não mapeou, e a resposta certa para isso é digitar o que se está lendo"*. Um payload que precisou de humano para ser lido não tem mapeamento automático a executar.

## Por que isto não afrouxa o ADR-0011

O domínio continua **sem consultar**. `PersonLookupPlan` é dado inerte que descreve a busca — quais chaves, com que força — e quem a executa é `packages/db`, que é onde mora o `SET LOCAL`. O efeito colateral de segurança que o ADR-0011 registra permanece exatamente como está: *"um `domain` que não consegue consultar não consegue consultar sem escopo"*.

O que muda é o inverso do afrouxamento: mais regra passa a caber no módulo puro, e portanto no Seam 1 sem banco que o [ADR-0010](./0010-migrations-e-ci-cd.md) exige.

## Considered options (rejeitadas)

- **Injetar um port `findPersonsBy` no domínio.** Resolveria o vazamento da busca, e quebraria as duas propriedades pelas quais o ADR-0011 existe: um domínio que consegue consultar consegue consultar fora de escopo, e o Seam 1 passaria a exigir fake de I/O — perdendo justamente o que o desenho de CI compra ao travar teste sem banco.
- **"Completar e liberar" enfileirar um evento novo para o worker processar.** Criaria um segundo `IntegrationEvent` para a mesma submissão, contra a cópia única do [ADR-0014](./0014-copia-unica-e-retencao-do-payload.md); e o gestor, que acabou de ler o payload cru e digitar o telefone que o mapeamento perdeu, perderia a resposta síncrona. "Literalmente o mesmo caminho" viraria "mesmo destino por outro caminho", que é a diferença que a issue 14 escreveu para proibir.
- **Um `IntakePlan` único, com campos opcionais em vez de variantes.** Menos cerimônia, e devolve "retransmissão não rebobina" ao território da disciplina: o campo `stage_id` existiria no plano de retransmissão, e um dia alguém o preencheria. É a mesma armadilha que o ADR-0008 recusou ao separar `InboundLead` de `NormalizedLead` — um tipo que *diz* uma coisa e permite a outra.
- **Deixar o roteiro no worker e duplicar o mínimo no app.** É o desvio que a issue 14 nomeia. O mínimo duplicado é sempre o que esquece o `IntakeReview`.

## Consequences

Três chamadas em vez de uma, e dois tipos a mais. É o mesmo negócio que o ADR-0008 já fez: trocar convenção por barreira de compilador, porque **este código será escrito majoritariamente por agentes, e agentes violam convenção com muito mais facilidade do que erram tipos**.

O Seam 1 absorve o que hoje só o Seam 2 alcança: retransmissão inerte, `arrived_at` da liberação, quarentena, marcadores e as três resoluções. O Seam 2 **não perde cobertura — perde responsabilidade**, e volta a provar o que só ele prova: que o aceite durável no PostgreSQL e o despacho no BullMQ são independentes, e que o worker roda sob RLS.

O `IntakePlan` carrega dado normalizado de pessoa real e por isso **nunca entra em telemetria**: a lista de permissão do [ADR-0006](./0006-rls-duas-camadas-guc-worker.md) regra 12 não tem entrada para ele, e não ganha uma.
