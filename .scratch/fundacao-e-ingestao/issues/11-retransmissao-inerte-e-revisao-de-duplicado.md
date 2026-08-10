# 11 — Retransmissão inerte e revisão de possível duplicado

**Blocked by:** 09

**Status:** done

## What to build

Duas proteções distintas, que os documentos antigos confundiam.

A primeira: quando a Pluga **retransmite** um lead já recebido, nada no funil se mexe. Não é só "não duplicar" — é não rebobinar. Se o card já avançou de etapa, ele permanece onde está; se o negócio foi perdido, ele **não** reabre; o responsável não muda. Um card que volta sozinho destrói a confiança da equipe no funil mais rápido do que um lead perdido.

A segunda: uma submissão **genuinamente nova** da mesma Pessoa nunca é anexada nem retida. Ela cria Oportunidade e nasce **ligada** à outra que estiver em aberto, com marcador visível nos dois cards. O gestor resolve quando quiser, e o atendimento pode começar antes disso.

Isto **não** é constraint de banco, deliberadamente: uma pessoa pode ter dois financiamentos de veículo legítimos, e um índice único parcial tornaria o segundo impossível de cadastrar até à mão, travando a operação sem saída. Ver [ADR-0007](../../../docs/adr/0007-ingestao-idempotencia.md).

## Acceptance criteria

**Retransmissão**

- [x] A duplicata é detectada por **`INSERT ... ON CONFLICT DO NOTHING RETURNING id`**, não capturando a violação: em Postgres um erro aborta a transação inteira, e todos os critérios abaixo são comandos que vêm **depois** da detecção, na mesma transação. Capturar a exceção faria o caminho normal deste ticket quebrar com um erro que nem menciona duplicata ([ADR-0007](../../../docs/adr/0007-ingestao-idempotencia.md))
- [x] `RETURNING` vazio é o sinal de retransmissão
- [x] Retransmissão aponta `last_integration_event_id` para o evento novo e incrementa a contagem de tentativas — **não** reescreve payload. Além de eliminar a segunda cópia, evita reescrever um blob JSON a cada reenvio ([ADR-0014](../../../docs/adr/0014-copia-unica-e-retencao-do-payload.md))
- [x] Retransmissão registra "reenvio recebido" na linha do tempo da Oportunidade
- [x] Retransmissão **não** altera etapa, responsável, situação nem `arrived_at`
- [x] Card que já avançou permanece na etapa em que estava
- [x] Negócio perdido **não** reabre por retransmissão
- [x] **As quatro linhas acima são garantidas pelo tipo, não pela atenção**: a variante `Retransmission` do `IntakePlan` não tem campo de etapa, responsável, situação nem `arrived_at`. Não há como escrever o bug porque não há onde escrevê-lo ([ADR-0017](../../../docs/adr/0017-ingestao-como-decisao-e-plano.md))
- [x] Provado no **Seam 1**, sobre o plano, e não só ponta a ponta: é a regra mais fácil de errar e não pode depender do teste mais caro do projeto

**Possível duplicado**

- [x] O gatilho é **mesma Person + Oportunidade em aberto não mesclada** — não semelhança de financiamento. Vale inclusive quando não veio dado nenhum de financiamento, que é o caso mais comum e exatamente onde dois atendentes ligariam para o mesmo cliente sem aviso
- [ ] Dado de financiamento aparece na tela como **discriminador** entre os dois cards, nunca como condição para ligar
- [x] Detectado o gatilho, **cria a Oportunidade** e registra `IntakeReview(type: POSSIBLE_DUPLICATE)` ligando as duas
- [x] Nenhum envio fica retido esperando decisão humana; `arrived_at` é o `received_at` real, salvo lead liberado da quarentena, cujo relógio começa na liberação (ticket 10)
- [x] O marcador é visível nos dois cards, e ambos podem ser atribuídos e atendidos antes da resolução
- [x] `NEW_FINANCING` desfaz a ligação; as duas Oportunidades seguem independentes
- [x] `SAME_FINANCING` mescla: a mais nova recebe `merged_into_opportunity_id`, sai das vistas ativas, e seu `LeadSubmission` é **repontado** para a canônica, onde vira reentrada na timeline
- [x] `INVALID_OR_SPAM` arquiva com motivo, sem exclusão física
- [x] As três resoluções preservam `LeadSubmission`, autor, instante e motivo; nenhuma exclui dados
- [x] Toda listagem ativa de Oportunidades filtra as que têm `merged_into_opportunity_id` preenchido
- [x] Não existe índice único parcial por Pessoa + tipo de financiamento

**Mesclagem é transferência**

- [x] Mesclar **reaponta as FKs** para a canônica na mesma transação; o registro absorvido para de ser alvo de escrita
- [x] O ponteiro de mesclagem é **lápide**, nunca indireção de leitura — nenhuma consulta persegue `merged_into_*`. Sem isso, a retransmissão de uma submissão mesclada gravaria "reenvio recebido" na timeline de um card que a tabela de Leads acabou de esconder
- [x] Retransmissão que chega depois de uma mesclagem aparece na timeline da **canônica**
- [x] Mesclar **Pessoas** reavalia a duplicidade: se a canônica passa a ter duas Oportunidades em aberto que nunca estiveram ligadas, o `POSSIBLE_DUPLICATE` é registrado ali. Sem isso, a mesclagem produz o par mudo que este ticket existe para eliminar
- [x] Invariante no Seam 3: **nenhum registro ativo aponta para um registro mesclado**

## Implementation evidence

- Regras puras e tipo da retransmissão: `packages/domain/src/intake/*.test.ts`.
- Persistência, resoluções, transferências, merge de Pessoas e retransmissão pós-merge: `packages/db/tests/intake-review-resolution.test.ts`.
- RLS e varredura genérica de lápides/FKs do Seam 3: `packages/db/tests/rls.test.ts`.
- Caminho HTTP → fila → worker → banco e fato de timeline: `tests/seam2-ingestion.test.ts`.
- O critério de apresentação dos discriminadores financeiros permanece sem marcar: a superfície visual é o ticket 12, que declara este ticket como dependência. Esta entrega preserva os campos e não os usa como gatilho.
