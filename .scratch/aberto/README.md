# Aberto — a fila viva

**Esta é a única fila de trabalho do repositório.** Todo ticket que já fechou
está congelado na branch [`docs/arquivo-fases-0-4`](https://github.com/petzada/marctco/tree/docs/arquivo-fases-0-4).
Se um ticket não está nesta pasta, ele não é trabalho pendente.

Cinco tickets sobreviveram às Fases 0–4, por dois motivos diferentes. A distinção
importa: um grupo é decisão aceita que o código ainda não cumpre, o outro é
trabalho pronto travado em terceiro.

## Dívida contra ADR aceito

O ADR está aceito e na árvore; o código diverge dele. Cada um destes é um
compromisso que o repositório já assumiu e ainda não pagou.

| Ticket | ADR | O que falta, verificado no código |
|---|---|---|
| ~~[19 — N conexões por provedor](./19-conexoes-multiplas-por-provedor.md)~~ | [0031](../../docs/adr/0031-conexao-na-chave-idempotente.md) | **Entregue em 2026-08-24.** A conexão entrou na chave e `UNIQUE(workspace_id, provider)` caiu. Aguarda arquivamento |
| [08 — Empresa agrupa equipes](./08-empresa-agrupa-equipes.md) | [0029](../../docs/adr/0029-empresa-e-agrupamento-de-equipe.md) | não existe model `Company` nem coluna `Tag.company_id` |
| [09 — Supervisor não alcança Supervisor](./09-supervisor-nao-alcanca-supervisor.md) | [0028](../../docs/adr/0028-tag-e-o-time-supervisor-nao-alcanca-supervisor.md) | o conjunto do time em `packages/db/src/team.ts` ainda é simétrico entre supervisores |

**O 19 tem precedência sobre a Fase 5.** É o único aberto que corrompe dado em
produção sem avisar: duas landing pages com numeração própria colidem na chave
`source` + `external_lead_id`, e a segunda vira retransmissão inerte — sem card,
sem erro, sem quarentena. Hoje só está seguro por acidente, porque nenhuma LP do
piloto numera, e **nada avisa quando esse acidente termina.** Corrigir antes da
segunda LP custa uma migration; depois custa reconciliar envio de produção à mão,
que é o que o [ADR-0007](../../docs/adr/0007-ingestao-idempotencia.md) chama de
ponto mais irreversível do sistema.

Os tickets 08 e 09 não têm gatilho equivalente: 08 entrega dimensão de leitura
que só vira número na Fase 7, e 09 é vazamento de escopo entre pares que só
aparece com dois supervisores na mesma tag.

## Travado em terceiro

Implementação feita; falta prova que exige conta paga da Pluga com Google Lead
Form conectado. Não são trabalho de código — são `needs-info`.

| Ticket | O que falta |
|---|---|
| [13 — Google Lead Form e webhook de landing page](./13-google-lead-form-e-webhook-de-landing-page.md) | dois critérios do modelo Google |
| [14 — Tela Integrações Pluga](./14-tela-integracoes-pluga.md) | um critério do modelo Google |

## Convenção

O `Status:` no topo de cada arquivo segue [docs/agents/triage-labels.md](../../docs/agents/triage-labels.md).
Ticket que fecha sai desta pasta e vai para o arquivo — **não fica aqui com
`Status: done`**, porque foi exatamente isso que fez oito tickets da Fase 3
parecerem fila aberta durante dias.
