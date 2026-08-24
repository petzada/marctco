# 04 — Estagnação, movimento e fatos na linha do tempo

**Status:** done

**Blocked by:** 01, 02, 03

> **Por que 03 bloqueia:** os dois tickets estendem `markersFor` e a união de tipos do marcador. Em paralelo, os dois agentes colidem exatamente ali. O 03 entra primeiro e o 04 acrescenta o segundo marcador em cima.

**What to build:** o segundo relógio da fase, o que mede **movimento** e não chegada. Um card na etapa de entrada há nove dias hoje tem a mesma aparência de um que chegou agora; depois deste ticket ele é um lead **parado**, no card e no cálculo que o Dashboard vai ler.

Toda operação que mexe no lead passa a carimbar `last_movement_at` e a gravar um fato na linha do tempo da Oportunidade: mover etapa, atribuir, reatribuir, devolver à fila pelo desatrelamento, criar e concluir atividade. Editar campo do card, ler o lead e receber retransmissão inerte **não** são movimento — a retransmissão em particular não pode reanimar o relógio, ou o lead abandonado parece vivo porque a origem reenviou o mesmo formulário.

O lead que nunca teve movimento nenhum ancora na chegada, e é assim que o mais esquecido de todos aparece como o mais parado, e não como o menos.

**Antes da migration:** os tipos novos de evento entram no mapeamento do [ADR-0005](https://github.com/petzada/marctco/blob/main/docs/adr/0005-idioma-codigo-en-ui-pt-br.md). O [CONTEXT.md](https://github.com/petzada/marctco/blob/main/CONTEXT.md) já autoriza a expansão — *"atividade, mensagem e documento entram nas fases que os possuem"* —, e esta é a fase que possui atividade.

- [x] `Opportunity.last_movement_at` existe, anulável, com **backfill** para `arrived_at` na mesma migration — nenhum lead antigo nasce parado desde 1970 nem movido agora
- [x] `OpportunityTimelineEventType` ganha `STAGE_CHANGED | ASSIGNED | REASSIGNED | RETURNED_TO_QUEUE | ACTIVITY_CREATED | ACTIVITY_COMPLETED`

> **Supersessão.** A lista original deste checkbox omitia `ACTIVITY_CREATED`. Criar atividade é movimento e concluir é outro fato; o mapeamento já aceito em [CONTEXT.md](https://github.com/petzada/marctco/blob/main/CONTEXT.md) e [ADR-0005](https://github.com/petzada/marctco/blob/main/docs/adr/0005-idioma-codigo-en-ui-pt-br.md) inclui os dois. Esta linha segue esses documentos.
- [x] `integration_event_id` do evento de linha do tempo passa a ser anulável, e a unicidade `(workspace_id, type, integration_event_id)` vira índice parcial sobre as **duas** variantes de ingestão — que continuam deduplicando exatamente como antes
- [x] Fato de movimento **não** deduplica: dois movimentos iguais em instantes diferentes são dois fatos
- [x] Mover etapa, atribuir (1 a 1 e em massa), reatribuir (1 a 1 e em massa), devolver à fila no desatrelamento, criar atividade e concluir atividade carimbam `last_movement_at` e gravam o fato, tudo na transação que a operação já abre
- [x] Editar campo do card e retransmissão inerte **não** carimbam — teste explícito para os dois
- [x] O estado de estagnação é **função pura** em `packages/domain`, ancorando em `arrived_at` quando não houve movimento, e chamada tanto pela tela quanto pela varredura do ticket 09
- [x] Lead `WON`, `LOST` ou mesclado nunca conta como parado
- [x] `markersFor` ganha o marcador de lead parado, ao lado do de SLA que o ticket 03 acrescentou
- [x] `previous_assigned_user_id` **permanece**: é a resposta barata numa linha de tabela; a linha do tempo é a resposta cara e completa, e uma não substitui a outra
- [x] Índice parcial só na migration: `(workspace_id, last_movement_at) WHERE status = 'OPEN' AND merged_into_opportunity_id IS NULL`
- [x] Seam 3 continua verde com o índice de unicidade reformulado, e o drift check passa

## Implementation evidence

**12 de 12 critérios marcados**, nenhum em aberto. Entregue em `b9876ae` — `last_movement_at`, fatos de movimento e marcador de parado.

**Status reconciliado em 2026-08-24.** A execução já estava registrada nos
checkboxes e no fechamento da fase; a linha `Status:` continuava com o rótulo
de triagem anterior (`ready-for-agent`), que o
[PROMPT-HANDOFF.md](../PROMPT-HANDOFF.md) já apontava como não reescrito. A
Fase 3 fechou em `039af31`; não reabrir este ticket.
