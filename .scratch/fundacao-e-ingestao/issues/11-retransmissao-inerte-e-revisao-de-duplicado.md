# 11 — Retransmissão inerte e revisão de possível duplicado

**Blocked by:** 09

**Status:** ready-for-agent

## What to build

Duas proteções distintas, que os documentos antigos confundiam.

A primeira: quando a Pluga **retransmite** um lead já recebido, nada no funil se mexe. Não é só "não duplicar" — é não rebobinar. Se o card já avançou de etapa, ele permanece onde está; se o negócio foi perdido, ele **não** reabre; o responsável não muda. Um card que volta sozinho destrói a confiança da equipe no funil mais rápido do que um lead perdido.

A segunda: uma submissão **genuinamente nova** da mesma Pessoa nunca é anexada só porque tem o mesmo tipo de financiamento — e também nunca é retida por isso. Ela cria Oportunidade e nasce **ligada** à semelhante, com marcador visível nos dois cards. O gestor resolve quando quiser, e o atendimento pode começar antes disso.

Isto **não** é constraint de banco, deliberadamente: uma pessoa pode ter dois financiamentos de veículo legítimos, e um índice único parcial tornaria o segundo impossível de cadastrar até à mão, travando a operação sem saída. Ver [ADR-0007](../../../docs/adr/0007-ingestao-idempotencia.md).

## Acceptance criteria

**Retransmissão**

- [ ] Retransmissão atualiza `raw` e a contagem de tentativas no registro de submissão
- [ ] Retransmissão registra "reenvio recebido" na linha do tempo da Oportunidade
- [ ] Retransmissão **não** altera etapa, responsável, situação nem `arrived_at`
- [ ] Card que já avançou permanece na etapa em que estava
- [ ] Negócio perdido **não** reabre por retransmissão

**Possível duplicado**

- [ ] Mesmo Person + financiamento semelhante **cria a Oportunidade** e registra `IntakeReview(type: POSSIBLE_DUPLICATE)` ligando as duas
- [ ] Nenhum envio fica retido esperando decisão humana; `arrived_at` é sempre o `received_at` real
- [ ] O marcador é visível nos dois cards, e ambos podem ser atribuídos e atendidos antes da resolução
- [ ] `NEW_FINANCING` desfaz a ligação; as duas Oportunidades seguem independentes
- [ ] `SAME_FINANCING` mescla: a mais nova recebe `merged_into_opportunity_id`, sai das vistas ativas, e seu `LeadSubmission` vira reentrada na timeline da canônica
- [ ] `INVALID_OR_SPAM` arquiva com motivo, sem exclusão física
- [ ] As três resoluções preservam `LeadSubmission`, autor, instante e motivo; nenhuma exclui dados
- [ ] Toda listagem ativa de Oportunidades filtra as que têm `merged_into_opportunity_id` preenchido
- [ ] Não existe índice único parcial por Pessoa + tipo de financiamento
