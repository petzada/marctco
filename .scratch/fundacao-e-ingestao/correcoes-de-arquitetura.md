# Correções de arquitetura — fatia de fundação e ingestão

Status: accepted · 2026-08-05

> Origem: revisão de arquitetura sobre a especificação, antes de existir código. Os cinco candidatos
> foram lidos dos ADRs 0004–0015, do [CONTEXT.md](../../CONTEXT.md) e das 17 issues desta fatia.
> Nenhum deles é refatoração: são módulos que **ainda não existem** e que, como estão especificados,
> nascem rasos. O custo de corrigir agora é uma linha de spec; depois é reescrever chamada.

Os cinco candidatos condensam em **três decisões**, porque dois pares são a mesma decisão aplicada
duas vezes:

| Candidato da revisão | Decisão | ADR |
|---|---|---|
| 3 · helper recebe o papel e não o exige · 4 · workspace, papel e flags viajam separados | Contexto de acesso e leitor escopado | [0016](../../docs/adr/0016-contexto-de-acesso-e-leitor-escopado.md) |
| 1 · o módulo de ingestão não existe · 2 · a regra de identidade vaza pelo seam | Ingestão é decisão pura; o plano de escrita é dado | [0017](../../docs/adr/0017-ingestao-como-decisao-e-plano.md) |
| 5 · "um lead, um ícone" sem módulo | Marcador é módulo de domínio | [0018](../../docs/adr/0018-marcador-como-modulo.md) |

Os candidatos 3+4 e 1+2 foram fundidos porque **um é parâmetro do outro**: `AccessContext` é o argumento
do leitor escopado, e `PersonLookupPlan` é uma fase da mesma interface de ingestão. Separá-los produziria
ADRs que ninguém consegue ler sozinhos.

---

## Ordem de execução, e por que ela é esta

A ordem é a das dependências, não a da gravidade.

**1º — ADR-0016 (contexto de acesso e leitor escopado).** É a interface que a issue 03 cria e que todas as
issues de 04 a 17 consomem. O executor do plano de ingestão (`applyIntakePlan`) mora atrás do mesmo seam,
então o ADR-0017 depende deste. Corrigir na ordem inversa faria o módulo de ingestão nascer contra uma
interface que muda logo depois.

**2º — ADR-0017 (ingestão como decisão e plano).** Depende do leitor escopado existir. Fecha o único
critério de aceite da fatia que hoje **não tem onde morar** — a issue 14 exige que "completar e liberar"
use literalmente o mesmo caminho da ingestão, e esse chamador está em `apps/web` enquanto o roteiro está
em `apps/worker`.

**3º — ADR-0018 (marcador como módulo).** Consome o que os dois anteriores produzem: os marcadores nascem
no `IntakePlan` e são lidos pelo leitor escopado. É também o de menor risco — errar aqui custa uma tela,
não um lead.

---

## Decisão 1 — Contexto de acesso e leitor escopado

### Comportamento escopado hoje

- **Issue 03**: *"Helper de transação em `packages/db` faz `SET LOCAL` (nunca `SET`) e é o único caminho
  de acesso a dado"* + *"O helper recebe o papel do usuário junto com o `workspace_id`. É o ponto único
  onde o escopo por perfil mora — nenhuma consulta consegue ser escrita sem que o autor decida ali o que
  aquele papel enxerga"*.
- **ADR-0013**: leitura em Server Component chamando o helper direto; paginação keyset por `(arrived_at, id)`;
  índices parciais por marcador; escrita concorrente arbitrada por condição no `WHERE`.
- **ADR-0015**: uma regra implementada nesta fatia — `ATTENDANT` enxerga apenas oportunidade atribuída a si.
- **ADR-0006 regra 11**: nenhum estado mutável em escopo de módulo, nem no app nem no worker.
- **ADR-0004 regra 3**: leitura de flag exige `workspace_id` explícito, sempre.

### O defeito

Um helper com a forma `withWorkspace(workspaceId, role, tx => …)` que devolve o client transacional do
Prisma cumpre o `SET LOCAL` — e nada mais. O `role` fica **inerte**: nenhum tipo, nenhum lint e nenhum
teste obriga o `tx.opportunity.findMany` do chamador a filtrar por `assigned_user_id`. A frase da issue 03
afirma um resultado que a interface descrita não consegue produzir.

O mesmo vale para tudo que o ADR-0013 decidiu e deixou como convenção: uma tela que escrever `skip:` em
vez de cursor passa no CI, e o defeito não é lentidão — é lead sumindo da triagem em silêncio.

### A correção

1. **`AccessContext` é união discriminada**, com dois construtores e nenhum literal:
   - `UserContext` (`workspace_id`, `user_id`, `role`) — construído no `apps/web` pela validação do `slug`
     contra `WorkspaceMember`;
   - `JobContext` (`workspace_id`, `integration_event_id`) — construído no `apps/worker` a partir do
     `workspace_id` que o handler autenticado escreveu no job.

   **Duas variantes porque o worker não tem usuário nem papel** — ver a nota de validação no fim deste
   documento. Na Fase 4 as flags resolvidas entram nas duas.
2. **`packages/db` deixa de exportar o client transacional.** Exporta **leituras nomeadas** que recebem
   `AccessContext` — `listLeads`, `countLeadsByMarker`, `getLead`, `listIntegrationEvents`,
   `findPersonCandidates`, `getQuarantinedEvent` — e **escritas nomeadas** — `assignLead`,
   `resolveIntakeReview`, `applyIntakePlan`. Cada uma aplica o GUC, o escopo do papel, o keyset e o índice
   correspondente do lado de dentro. Só `findPersonCandidates` e `applyIntakePlan` aceitam as duas variantes,
   e ambas são do caminho de ingestão: `listLeads(jobCtx)` não compila.
3. **As três consultas sem tenant são exceção declarada.** `resolve_workspace_by_token_hash`,
   `claim_pending_events` e `provision_workspace` acontecem antes de existir workspace e são justamente as
   que produzem o `workspace_id` do contexto. Não recebem `AccessContext`; a lista é fechada em três e o
   Seam 3 reprova qualquer `SECURITY DEFINER` fora dela ([ADR-0006](../../docs/adr/0006-rls-duas-camadas-guc-worker.md) regra 9).
4. **O client cru continua existindo, interno.** Um módulo só dentro de `packages/db` o alcança;
   `no-restricted-imports` barra o resto, e o CI reprova o import fora.
5. **Fail-closed**: papel ausente ou desconhecido num `UserContext` faz o leitor recusar, nunca devolver
   tudo. A outra metade é do compilador — operação que exige `UserContext` não aceita `JobContext`.

### Por que é isto e não vigilância

A RLS continua sendo a rede — o leitor escopado é a *outra* camada, a que o ADR-0006 chama de "caminho
correto". A diferença é que agora a aplicação escopa **num lugar só**, em vez de em cada `where` que alguém
escrever. O próprio ADR-0006 já sentenciou por que a disciplina não basta: *"RLS-sozinha não elimina a
disciplina, apenas muda o lugar onde ela falha"*. Um client cru na mão do chamador reintroduz exatamente
essa disciplina, uma camada acima.

E resolve a regra 11 por tipo em vez de por atenção: se o contexto é argumento obrigatório de toda leitura,
não há como um valor de escopo de módulo servir de default silencioso.

### Considered options (rejeitadas)

- **Manter o client cru e cobrir com lint e revisão.** É a mesma disciplina que o ADR-0006 já declarou
  frágil, e mantém a promessa do ADR-0015 como comentário.
- **Um repositório por model (`OpportunityRepository`).** Módulo raso: interface tão larga quanto o client,
  com o mesmo problema de escopo e uma indireção a mais.

### Custo assumido

Cada leitura nova exige uma função nova em `packages/db` — não dá para "só escrever um `findMany` na tela".
É deliberado: é o pedágio que torna o escopo verificável. Nesta fatia a lista tem nove operações: seis
leituras e três escritas.

### Arquivos

Novo: `docs/adr/0016`. Emendados: ADR-0006 regra 11 · ADR-0013 · ADR-0015 · ADR-0005 (mapeamento) ·
`CONTEXT.md` · issues 03, 04, 12, 14, 16 · `spec.md`.

---

## Decisão 2 — Ingestão é decisão pura; o plano de escrita é dado

### Comportamento escopado hoje

- **ADR-0011**: `packages/domain` é puro; recebe as candidatas **já buscadas** e devolve decisão —
  `decideReuseOfPerson(candidates, normalizedLead)`. Quem foi ao banco foi o worker.
- **ADR-0008**: o conector vive em `apps/worker`; `InboundLead` → `normalize()` → `NormalizedLead`.
- **Issues 08–11**: o worker sequencia — busca candidatas, decide identidade, insere submissão com
  `ON CONFLICT`, decide quarentena, cria `Person`, cria `Opportunity`, grava `arrived_at`, cria `IntakeReview`.
- **Issue 14**: *"Liberar um lead da quarentena cria Pessoa e Oportunidade pelo mesmo caminho da ingestão —
  literalmente o mesmo, sem desvio que crie `Person` sem chave"*.

### Os três defeitos

**Não há onde o "mesmo caminho" more.** O roteiro só existe dentro de `apps/worker`; o segundo chamador
está em `apps/web`; um app não importa outro app. O critério de aceite da issue 14 é hoje insatisfazível.

**As invariantes moram na sequência, não nas decisões.** "Retransmissão não toca etapa, responsável, situação
nem `arrived_at`", "negócio perdido não reabre", "`arrived_at` do lead liberado é o da liberação" — todas
só são exercitáveis pelo Seam 2, com Postgres, Redis e BullMQ reais. É o teste mais caro do projeto provando
a regra mais fácil de errar.

**A escolha das chaves de busca está fora do domínio.** "CPF é forte, telefone só sem contradição, e-mail
isolado é fraco" decide **o que buscar**, não só como arbitrar. Com a consulta escrita no worker, um worker
que busque só por telefone reconhece menos gente do que a issue 08 promete — e todo teste do Seam 1 continua
verde, porque o teste escolhe as candidatas que passa.

### A correção

Um módulo `intake` em `packages/domain`, com interface de três fases, todas puras:

```
planSubmission(inbound)      → SubmissionKey       // source + external_lead_id
planPersonLookup(normalized) → PersonLookupPlan    // quais chaves buscar, e em que força
decideIntake(input)          → IntakePlan          // o que escrever
```

`decideIntake` recebe o resultado do `ON CONFLICT` (`inserted | duplicate`), as candidatas que o lookup
devolveu, o `NormalizedLead`, o funil de destino e o instante — **`now` é argumento**, nunca `Date.now()`
por dentro, que é I/O disfarçado e mataria o teste puro.

`IntakePlan` é união discriminada, e cada variante é um caso do ADR-0007:

| Variante | O que descreve |
|---|---|
| `Quarantine` | Sem telefone e sem e-mail: nenhuma `Person`, nenhuma `Opportunity` |
| `Retransmission` | Aponta `last_integration_event_id`, incrementa tentativas, entrada de timeline |
| `NewOpportunity` | `Person` (reúso ou nova) + `Opportunity` + `arrived_at` + `missing_phone` + `IntakeReview[]` |

**A variante `Retransmission` não tem campo de etapa, responsável, situação nem `arrived_at`.** É a parte
mais valiosa da correção: "retransmissão não rebobina o funil" deixa de ser disciplina e vira ausência de
campo no tipo. Não há como escrever o bug.

`applyIntakePlan(ctx, plan)` em `packages/db` executa numa transação: um `switch` exaustivo, nenhuma regra
de negócio.

### Os dois chamadores

| Chamador | `now` | Origem do evento | `InboundLead` vem de |
|---|---|---|---|
| `apps/worker` — job de ingestão | `received_at` do envio | evento despachado pelo dispatcher | conector, em `apps/worker` |
| `apps/web` — route handler "completar e liberar" | instante da **liberação** | evento em quarentena, completado pelo gestor | **formulário**, sem conector |

É literalmente a mesma função, que é o que a issue 14 pede ao pé da letra. E o `arrived_at` divergente do
ADR-0007 §Quarentena deixa de ser um caso especial escondido num caminho: é o mesmo argumento com valor
diferente.

A coluna da direita saiu da validação: sem ela, o app precisaria do conector que vive em `apps/worker`, e o
defeito que esta decisão conserta reapareceria um nível abaixo. A saída não é mover o conector — é notar que
**na liberação não há forma de origem para interpretar**: o gestor lê o payload cru e preenche campos `v1`,
com `source` e `external_lead_id` preservados do envio. O ADR-0008 fica intacto nas duas pontas.

### Por que não contradiz o ADR-0011

O domínio continua **sem consultar**. `PersonLookupPlan` é dado inerte que descreve a busca; quem a executa
é `packages/db`, que é onde mora o `SET LOCAL`. O efeito colateral de segurança que o ADR-0011 registra
permanece intacto: *"um `domain` que não consegue consultar não consegue consultar sem escopo"*.

### Considered options (rejeitadas)

- **Injetar um port `findPersonsBy` no domínio.** Um domínio que consegue consultar consegue consultar fora
  de escopo, e o Seam 1 passaria a exigir fake de I/O — perdendo justamente a propriedade que o ADR-0010
  compra ao travar testes de CI sem banco.
- **"Completar e liberar" enfileirar um evento novo para o worker.** Criaria um segundo `IntegrationEvent`
  para a mesma submissão, contra a cópia única do ADR-0014; e o gestor, que acabou de digitar o telefone que
  leu no payload cru, perderia a resposta síncrona. "Mesmo caminho" viraria "mesmo destino por outro caminho".
- **Um `IntakePlan` único e não discriminado, com campos opcionais.** Devolveria a "retransmissão não rebobina"
  ao território da disciplina: o campo existiria e alguém o preencheria.

### Custo assumido

Três chamadas em vez de uma, e dois tipos a mais. É o mesmo negócio que o ADR-0008 já fez ao separar
`InboundLead` de `NormalizedLead`: trocar convenção por barreira de compilador, porque **este código será
escrito majoritariamente por agentes, e agentes violam convenção com muito mais facilidade do que erram tipos**.

### Arquivos

Novo: `docs/adr/0017`. Emendados: ADR-0007 · ADR-0008 · ADR-0011 · ADR-0005 (mapeamento) · `CONTEXT.md` ·
issues 08, 09, 10, 11, 13, 14 · `spec.md` (Seam 1 e Seam 2).

---

## Decisão 3 — Marcador é módulo de domínio

### Comportamento escopado hoje

- **ADR-0007 §UX**: *"Um lead, um ícone"* — todos os avisos alcançados por um único ponto de entrada;
  três avisos são um ícone com contagem, nunca três rótulos.
- **ADR-0013 §Índices**: registra que os marcadores **não moram no mesmo lugar** — `missing_phone` é coluna
  da `Opportunity`, identidade e duplicidade são linhas de `IntakeReview`.
- **Issue 12**: repete a regra e declara que ela *"vale para todo aviso futuro, não só para os desta fatia"*.
- **ADR-0005**: já mapeia Marcador como `IntakeReview` + `Opportunity.missing_phone`, e anota que não é model.

### O defeito

A regra é de produto e não tem módulo. Três superfícies consomem — linha da tabela, card do lead,
contadores-filtro — e cada uma remonta a agregação a partir de duas fontes. A quarta pendência, que a
Fase 2 vai acrescentar, precisa que três lugares se lembrem dela.

### A correção

`markersFor(opportunity, reviews) → Marker[]` em `packages/domain`, puro: recebe o que já foi lido e devolve
a lista **ordenada e tipada** — `MISSING_PHONE | IDENTITY_CONFLICT | POSSIBLE_DUPLICATE`. A UI mapeia
`Marker` para rótulo PT-BR e ícone; ordem e critério de "o que conta como aviso" são do domínio.
Acrescentar um aviso na Fase 2 é uma variante no tipo — e o `switch` da UI quebra no compilador.

**Os contadores-filtro continuam por tipo e continuam fora deste módulo.** São pergunta diferente: o contador
responde "quais leads têm este aviso" e é servido pelo índice parcial do ADR-0013; o ícone responde "o que
este lead tem". Registrar a separação evita que alguém "unifique" os dois e volte a contar a tabela inteira.

### Arquivos

Novo: `docs/adr/0018`. Emendados: ADR-0005 (nota no mapeamento) · `CONTEXT.md` (afiar Marcador) · issue 12.

---

## O que estas três decisões mudam nos seams

| | Antes | Depois |
|---|---|---|
| **Seam 1** (domain puro) | normalização, quarentena, identidade, duplicidade | \+ plano de busca de Pessoa · \+ plano de escrita completo · \+ retransmissão inerte · \+ `arrived_at` da liberação · \+ agregação de marcadores |
| **Seam 2** (ponta a ponta, Postgres + Redis + BullMQ) | ~20 comportamentos, incluindo regra de negócio | encanamento: aceite durável, despacho independente, RLS no worker, e que o plano é aplicado como descrito |
| **Seam 3** (invariantes de banco) | policies, papéis, `SECURITY DEFINER`, mesclagem | \+ nenhum import do client cru fora de `packages/db` |

O Seam 2 não perde cobertura — perde **responsabilidade**. Ele volta a provar o que só ele prova.

---

## Nota de validação — o que a revisão das próprias correções encontrou

As três decisões foram revisadas contra o corpus depois de aplicadas. Quatro defeitos apareceram, e os
quatro já estão corrigidos acima. Ficam registrados porque três deles são armadilhas que voltariam.

**1 · O worker não tem usuário nem papel.** A primeira redação do ADR-0016 dava ao `AccessContext` um
`role` obrigatório e mandava o worker construí-lo. Não fecha: o job não age em nome de ninguém. As duas
saídas ruins eram inventar um papel — `SYSTEM` no enum, exatamente o *"papel sem escopo declarado"* que o
ADR-0015 fechou em quatro para evitar — ou tornar `role` opcional, o que derruba o fail-closed **no único
processo que toca todos os tenants**. A união discriminada resolve as duas de uma vez, e ainda torna
`listLeads(jobCtx)` um erro de compilação em vez de uma consulta que devolve o que não deveria.

**2 · Três consultas não podem ter contexto, por definição.** "Toda operação recebe `AccessContext`"
colidia de frente com a lista fechada do ADR-0006 regra 9: a resolução do token, a descoberta de pendências
e o provisionamento acontecem **antes** de existir workspace — são as que produzem o `workspace_id` com que
o contexto é construído. Sem a cláusula escrita, a regra parece ter um furo, e é por furo aparente que a
quarta função entra.

**3 · A liberação da quarentena precisava do conector.** `planPersonLookup` exige `NormalizedLead`, que
exige `InboundLead`, que só o conector produzia — e o conector vive em `apps/worker`, que `apps/web` não
importa. O defeito que a decisão 2 conserta estava reaparecendo um nível abaixo. Resolvido sem mover o
adapter: o formulário coleta campos `v1` e produz o `InboundLead` direto.

**4 · Contagem errada.** "Seis entradas" contra uma tabela de oito operações, que a validação levou a nove
ao acrescentar `findPersonCandidates`. Corrigido nos dois lugares.

Os três primeiros têm a mesma forma: **uma regra escrita como universal que tem exceção legítima**. Vale
como aviso para as próximas — quando um ADR disser "toda X faz Y", procure primeiro quem não pode.
