# 06 — Atribuir e reatribuir

**What to build:** Na tabela, o lead sem dono ganha responsável. Supervisor só atribui a quem compartilha tag. Dois cliques no mesmo card: um ganha, o outro falha limpo. Passar o card de quem saiu de férias é outra ação — mostra o dono atual, pede confirmação, só Gestão e Direção. A linha some da fila na hora. O possível duplicado mostra o nome do responsável, não um identificador.

**Blocked by:** 03 — Equipe: cadastro com tag; 05 — Escopo real do Supervisor

**Status:** ready-for-agent

## Acceptance criteria

- [ ] Atribuir e reatribuir são operações **diferentes** ([ADR-0013](../../../docs/adr/0013-fluxo-de-dados-no-app.md)): atribuir exige `assigned_user_id` nulo no `WHERE`; reatribuir exige o dono atual no `WHERE`
- [ ] `assignLead` já arbitra a corrida e já recusa Atendente — este ticket estreita o destino: membro `ACTIVE` deste workspace; Supervisor só para quem está no time; recusa destino `DETACHED`
- [ ] Gestão e Direção atribuem a qualquer membro `ACTIVE` do tenant
- [ ] Supervisor atribui **só** da fila sem dono para o time; sem tag, não atribui ([ADR-0022](../../../docs/adr/0022-workspace-e-fronteira-de-captacao.md))
- [ ] Atendente sem tag só é destino de Gestão e Direção
- [ ] Dois gestores no mesmo lead sem dono: um ganhador, falha limpa para o outro — a UI diz que já tem dono, não o último escreve em silêncio
- [ ] Reatribuir: só Gestão e Direção; UI mostra o responsável atual (nome, não id) e pede confirmação; recusa se o dono atual não casa
- [ ] Supervisor **não** reatribui
- [ ] Nenhuma das duas dispara WhatsApp
- [ ] Escrita em route handler sob o slug, não Server Action
- [ ] Remoção otimista da linha atribuída via TanStack Query — é o lugar que o [ADR-0013](../../../docs/adr/0013-fluxo-de-dados-no-app.md) reservou para cache de cliente nesta fase. A tabela geral continua Server Component + refresh
- [ ] Card de possível duplicado mostra o **nome** do responsável da outra Oportunidade, não o identificador opaco (A2)
- [ ] Costura principal: corrida de atribuir; recusa Atendente; recusa Supervisor fora do time; recusa `DETACHED`; reatribuir recusa dono atual divergente

## Fora deste ticket

Kanban e mover etapa (ticket 07). Tag na oportunidade. Mensagem de primeiro contato.
