# 06 — Atribuir e reatribuir: a distribuição em dois níveis

**What to build:** O caminho do lead até quem atende. De manhã a Gestão abre a fila sem dono e entrega cada lead ao **Supervisor** da equipe; o Supervisor repassa ao **Atendente** do seu time. Dois cliques no mesmo card: um ganha, o outro falha limpo. Passar o card de quem saiu de férias é a mesma operação de repassar, com confirmação quando o lead é de outra pessoa. A linha some da fila na hora. A tabela ganha filtro por responsável e por equipe, que é como a Gestão acompanha.

**Blocked by:** 03a — Equipe: schema, tags e operações; 05 — Escopo real do Supervisor

**Status:** ready-for-agent

> **Este ticket abre o segundo nível.** A versão anterior desta fase punha reatribuir como exclusiva de Gestão para cima e, ao mesmo tempo, descrevia a Gestão entregando o lead ao Supervisor. As duas coisas juntas travam o lead: `assignLead` exige `IS NULL`, o lead já tem dono, e nenhuma operação o move adiante. O Supervisor reatribuir dentro do time é o que faz a operação real existir ([ADR-0015](../../../docs/adr/0015-perfis-de-acesso-e-escopo.md), [ADR-0022](../../../docs/adr/0022-workspace-e-fronteira-de-captacao.md)).

## Acceptance criteria

### Atribuir — primeiro nível

- [ ] Atribuir e reatribuir são operações **diferentes** ([ADR-0013](../../../docs/adr/0013-fluxo-de-dados-no-app.md)): atribuir exige `assigned_user_id` nulo no `WHERE`; reatribuir exige o dono atual no `WHERE`
- [ ] `assignLead` já arbitra a corrida e já recusa Atendente — este ticket estreita o ator e o destino: só Gestão e Direção atribuem da fila ([ADR-0024](../../../docs/adr/0024-fila-sem-dono-e-da-gestao.md)); destino válido é `SUPERVISOR` `ACTIVE` **com ao menos uma tag** **ou** o próprio ator ([ADR-0025](../../../docs/adr/0025-destino-da-fila-e-supervisor-ou-ator.md)); recusa destino `DETACHED`, `ATTENDANT`, Supervisor sem tag, outro `MANAGER`, `OWNER` que não seja o ator; recusa `SUPERVISOR` e `ATTENDANT` como atores
- [ ] Gestão e Direção **não** atribuem da fila a Atendente. O gesto normal da manhã é entregar ao Supervisor da equipe, sem precisar saber quem são os atendentes dele. Assumir o card é o próprio `user_id`
- [ ] Supervisor **não** atribui da fila sem dono; sem tag, não reatribui e **não** é destino da fila
- [ ] Atendente sem tag só é destino de **reatribuição** da Gestão e da Direção
- [ ] A tabela permite selecionar vários leads e atribuir/reatribuir o lote a **um** destino — mesma regra do 1 a 1, N linhas ([ADR-0026](../../../docs/adr/0026-atribuicao-em-massa.md)). Não rateia. 1 a 1 permanece. **Lote parcial:** quem ainda podia ir, vai; quem já tinha dono recusa pelo **nome** e permanece na tabela; last-write-wins continua proibido
- [ ] Dois gestores no mesmo lead sem dono: um ganhador, falha limpa para o outro — a UI diz que já tem dono, não o último escreve em silêncio
- [ ] A linha atribuída sai da fila sem dono na hora

### Reatribuir — segundo nível

- [ ] `reassignLead` é operação nova: `WHERE assigned_user_id = :current`; recusa se o dono atual não casa
- [ ] Gestão e Direção reatribuem **qualquer** lead do workspace
- [ ] **Supervisor reatribui dentro do time:** o dono atual **e** o destino precisam compartilhar tag com ele. É o mesmo conjunto de `user_id` que o 05 computa no domínio, aplicado duas vezes no SQL
- [ ] Supervisor **não** alcança lead cujo dono atual está fora do seu time — não tira trabalho de outra equipe
- [ ] Supervisor sem tag não reatribui — não tem time
- [ ] Atendente continua recusado nas duas
- [ ] `previous_assigned_user_id` recebe o dono que saiu, em toda reatribuição
- [ ] **Confirmação só quando o lead não é do ator.** O diálogo existe para impedir que alguém tome o lead de um colega; quando o dono atual é o próprio ator, ele repassa direto. Um supervisor distribui trinta leads numa manhã, e um diálogo por lead transforma a rotina em fricção
- [ ] Quando há confirmação, a UI mostra o responsável atual pelo **nome**, não pelo identificador

### Tela

- [ ] Filtro por responsável e por equipe na tabela de Leads: parâmetro de busca lido no Server Component, aplicado **dentro** da operação nomeada. A tela não monta `where`
- [ ] O filtro **estreita** o escopo do papel, nunca o alarga: Supervisor filtrando por outra equipe recebe vazio, não recusa
- [ ] Filtro refletido na URL, para a Gestão voltar à mesma vista
- [ ] Escrita em route handler sob o slug, não Server Action
- [ ] Remoção otimista da linha atribuída via TanStack Query — é o lugar que o [ADR-0013](../../../docs/adr/0013-fluxo-de-dados-no-app.md) reservou para cache de cliente nesta fase. A tabela geral continua Server Component + refresh
- [ ] Card de possível duplicado mostra o **nome** do responsável da outra Oportunidade, não o identificador opaco (A2)
- [ ] Nenhuma das duas operações dispara WhatsApp

### Testes

- [ ] Costura principal: corrida de atribuir; recusa Atendente e Supervisor como atores; recusa destino `ATTENDANT`, Supervisor sem tag, outro `MANAGER`; aceita Supervisor com tag ou o próprio ator; recusa `DETACHED`; reatribuir recusa dono atual divergente
- [ ] Costura principal: Supervisor reatribui com dono atual e destino no time; recusa com dono atual fora do time; recusa com destino fora do time; recusa sem tag
- [ ] Costura principal, caminho completo: Gestão atribui da fila ao Supervisor → Supervisor reatribui ao Atendente → o lead chega. É o que a fase existe para abrir
- [ ] Costura principal: lote de N leads para um destino — cada linha com a mesma condição; não rateia; parcial (ganhadores saem, recusas pelo nome ficam)
- [ ] Seam 1: quem pode reatribuir de quem para quem — a combinatória nova desta fase

## Fora deste ticket

Kanban e mover etapa (ticket 07). Tag na oportunidade. Mensagem de primeiro contato. Campo monetário (A10, Fase 7).
