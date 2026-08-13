# Atribuição em massa é a mesma operação, N linhas, um destino

Gestão/Direção na fila e Supervisor no time atribuem **um a um ou em massa**. A massa é o gesto preferido da manhã: selecionar vários leads na tabela e entregar a **um** destino. Não é rateio automático nem destino diferente por linha. As regras de quem pode, para quem e com qual condição são as do caso unitário — [ADR-0024](./0024-fila-sem-dono-e-da-gestao.md), [ADR-0025](./0025-destino-da-fila-e-supervisor-ou-ator.md), reatribuição dentro do time. Sem isso, a manhã vira trinta cliques, ou alguém inventa um motor de distribuição que a Gestão precisaria conhecer o organograma para usar.

**Status:** accepted · 2026-08-13

**Considered options (rejeitadas):**

- **Só 1 a 1.** Recusada: o volume da fila única do grupo não cabe em clique por card.
- **Rateio automático entre atendentes/supervisores.** Recusada: quem atende é decisão de capacidade na hora, não da campanha nem de um algoritmo ([ADR-0022](./0022-workspace-e-fronteira-de-captacao.md)).
- **Tudo ou nada no lote.** Recusada: dois gestores na mesma tabela se bloqueariam o lote inteiro porque um colega pegou cinco no meio tempo.

**Consequences:** um gesto, uma escrita, N ids, um destino. Cada linha leva a mesma condição do 1 a 1 (`assigned_user_id IS NULL` ao atribuir; dono atual ao reatribuir). **O lote é parcial:** quem ainda satisfaz a condição vai; quem não satisfaz recusa com o motivo — na corrida da fila, “já tem dono”, pelo **nome** do responsável, não pelo id. As linhas que ganharam saem da vista; as que recusaram ficam. Não é N requests disparados pelo cliente. A UI de 1 a 1 permanece. Last-write-wins continua proibido.
