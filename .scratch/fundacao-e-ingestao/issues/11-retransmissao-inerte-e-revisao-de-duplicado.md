# 11 — Retransmissão inerte e revisão de possível duplicado

**Blocked by:** 09

**Status:** ready-for-agent

## What to build

Duas proteções distintas, que os documentos antigos confundiam.

A primeira: quando a Pluga **retransmite** um lead já recebido, nada no funil se mexe. Não é só "não duplicar" — é não rebobinar. Se o card já avançou de etapa, ele permanece onde está; se o negócio foi perdido, ele **não** reabre; o responsável não muda. Um card que volta sozinho destrói a confiança da equipe no funil mais rápido do que um lead perdido.

A segunda: uma submissão **genuinamente nova** da mesma Pessoa nunca é anexada nem retida. Ela cria Oportunidade e nasce **ligada** à outra que estiver em aberto, com marcador visível nos dois cards. O gestor resolve quando quiser, e o atendimento pode começar antes disso.

Isto **não** é constraint de banco, deliberadamente: uma pessoa pode ter dois financiamentos de veículo legítimos, e um índice único parcial tornaria o segundo impossível de cadastrar até à mão, travando a operação sem saída. Ver [ADR-0007](../../../docs/adr/0007-ingestao-idempotencia.md).

## Acceptance criteria

**Retransmissão**

- [ ] A duplicata é detectada por **`INSERT ... ON CONFLICT DO NOTHING RETURNING id`**, não capturando a violação: em Postgres um erro aborta a transação inteira, e todos os critérios abaixo são comandos que vêm **depois** da detecção, na mesma transação. Capturar a exceção faria o caminho normal deste ticket quebrar com um erro que nem menciona duplicata ([ADR-0007](../../../docs/adr/0007-ingestao-idempotencia.md))
- [ ] `RETURNING` vazio é o sinal de retransmissão
- [ ] Retransmissão atualiza `raw` e a contagem de tentativas no registro de submissão
- [ ] Retransmissão registra "reenvio recebido" na linha do tempo da Oportunidade
- [ ] Retransmissão **não** altera etapa, responsável, situação nem `arrived_at`
- [ ] Card que já avançou permanece na etapa em que estava
- [ ] Negócio perdido **não** reabre por retransmissão

**Possível duplicado**

- [ ] O gatilho é **mesma Person + Oportunidade em aberto não mesclada** — não semelhança de financiamento. Vale inclusive quando não veio dado nenhum de financiamento, que é o caso mais comum e exatamente onde dois atendentes ligariam para o mesmo cliente sem aviso
- [ ] Dado de financiamento aparece na tela como **discriminador** entre os dois cards, nunca como condição para ligar
- [ ] Detectado o gatilho, **cria a Oportunidade** e registra `IntakeReview(type: POSSIBLE_DUPLICATE)` ligando as duas
- [ ] Nenhum envio fica retido esperando decisão humana; `arrived_at` é o `received_at` real, salvo lead liberado da quarentena, cujo relógio começa na liberação (ticket 10)
- [ ] O marcador é visível nos dois cards, e ambos podem ser atribuídos e atendidos antes da resolução
- [ ] `NEW_FINANCING` desfaz a ligação; as duas Oportunidades seguem independentes
- [ ] `SAME_FINANCING` mescla: a mais nova recebe `merged_into_opportunity_id`, sai das vistas ativas, e seu `LeadSubmission` é **repontado** para a canônica, onde vira reentrada na timeline
- [ ] `INVALID_OR_SPAM` arquiva com motivo, sem exclusão física
- [ ] As três resoluções preservam `LeadSubmission`, autor, instante e motivo; nenhuma exclui dados
- [ ] Toda listagem ativa de Oportunidades filtra as que têm `merged_into_opportunity_id` preenchido
- [ ] Não existe índice único parcial por Pessoa + tipo de financiamento

**Mesclagem é transferência**

- [ ] Mesclar **reaponta as FKs** para a canônica na mesma transação; o registro absorvido para de ser alvo de escrita
- [ ] O ponteiro de mesclagem é **lápide**, nunca indireção de leitura — nenhuma consulta persegue `merged_into_*`. Sem isso, a retransmissão de uma submissão mesclada gravaria "reenvio recebido" na timeline de um card que a tabela de Leads acabou de esconder
- [ ] Retransmissão que chega depois de uma mesclagem aparece na timeline da **canônica**
- [ ] Mesclar **Pessoas** reavalia a duplicidade: se a canônica passa a ter duas Oportunidades em aberto que nunca estiveram ligadas, o `POSSIBLE_DUPLICATE` é registrado ali. Sem isso, a mesclagem produz o par mudo que este ticket existe para eliminar
- [ ] Invariante no Seam 3: **nenhum registro ativo aponta para um registro mesclado**
