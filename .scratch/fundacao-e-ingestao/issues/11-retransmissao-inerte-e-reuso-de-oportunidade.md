# 11 — Retransmissão inerte e reúso de oportunidade aberta

**Blocked by:** 09

**Status:** ready-for-agent

## What to build

Duas proteções distintas, que os documentos antigos confundiam.

A primeira: quando a Pluga **retransmite** um lead já recebido, nada no funil se mexe. Não é só "não duplicar" — é não rebobinar. Se o card já avançou de etapa, ele permanece onde está; se o negócio foi perdido, ele **não** reabre; o responsável não muda. Um card que volta sozinho destrói a confiança da equipe no funil mais rápido do que um lead perdido.

A segunda: quando chega uma submissão **genuinamente nova** da mesma pessoa, para o mesmo produto, com negócio já aberto, o caminho automático **anexa** em vez de criar um segundo card — porque dois cards abertos significam dois atendentes ligando para o mesmo cliente.

Isto **não** é constraint de banco, deliberadamente: uma pessoa pode ter dois financiamentos de veículo legítimos, e um índice único parcial tornaria o segundo impossível de cadastrar até à mão, travando a operação sem saída. Ver [ADR-0007](../../../docs/adr/0007-ingestao-idempotencia.md).

## Acceptance criteria

- [ ] Retransmissão atualiza `raw` e a contagem de tentativas no registro de submissão
- [ ] Retransmissão registra "reenvio recebido" na linha do tempo da Oportunidade
- [ ] Retransmissão **não** altera etapa, responsável, situação nem `arrived_at`
- [ ] Card que já avançou permanece na etapa em que estava
- [ ] Negócio perdido **não** reabre por retransmissão
- [ ] Submissão nova, mesma pessoa, mesmo produto, com oportunidade aberta → **anexa** e marca re-entrada, sem criar segundo card
- [ ] A decisão de anexar ou criar usa lock na Pessoa, de modo que duas submissões simultâneas não produzam dois cards
- [ ] **Não** existe índice único parcial impedindo duas oportunidades abertas da mesma pessoa e produto
- [ ] Nada no schema impede duas oportunidades abertas da mesma pessoa e produto — a criação manual chega na Fase 2 e não pode encontrar o caminho fechado
