# 07 — Kanban Meus leads

**What to build:** O atendente conduz o dia num quadro das próprias etapas em aberto — com lista alternada. Arrastar o card persiste a etapa. Ganho e perda não são colunas. A tabela geral de Leads continua sendo tabela. O Supervisor vê o time já atribuído; Gestão e Direção, todos os em aberto daquele funil comercial.

**Blocked by:** 06 — Atribuir e reatribuir

**Status:** ready-for-agent

## Acceptance criteria

- [ ] Item **Meus leads** na barra, rota própria, além de **Leads**. A lista geral permanece tabela paginada — sem Kanban global ([decisao-features-concorrentes.md](../../../decisao-features-concorrentes.md) §4)
- [ ] Toggle Lista / Kanban (`{component.toggle-segmented}` do `DESIGN.md`)
- [ ] Colunas = etapas do funil comercial padrão; só Oportunidades `OPEN` não mescladas, no escopo do papel ([ADR-0009](../../../docs/adr/0009-etapas-editaveis-papeis-e-status.md), [ADR-0015](../../../docs/adr/0015-perfis-de-acesso-e-escopo.md))
- [ ] Atendente: só os atribuídos a ele. Supervisor: o time já atribuído — **não** a fila sem dono. Gestão e Direção: todos os em aberto deste funil comercial
- [ ] Arrastar persiste via route handler que chama operação nomeada `moveLeadStage`. Condição no `WHERE`: etapa atual, mesmo funil, `status = OPEN`, não mesclado. Destino tem de ser etapa desse funil
- [ ] Dois arrastes concorrentes: o banco arbitra pela etapa atual, não uma leitura anterior
- [ ] Recusa mover ganho, perdido, mesclado, ou para funil alheio
- [ ] Mover etapa **não** toca `arrived_at`
- [ ] Ganho, perda e motivo **não** aparecem como colunas e não entram neste ticket
- [ ] Card do quadro: `{component.kanban-card}` — nome, valor se houver (ticket 02), responsável. Numerais tabulares no valor
- [ ] Abaixo de 768px: faixa com scroll-snap, não colunas lado a lado
- [ ] TanStack Query no quadro (atualização otimista do arraste). Teste não verifica evento de biblioteca de DnD — verifica o que a operação aceita ou recusa e o que o banco ficou
- [ ] Leitura em Server Component; a tela não monta consulta
- [ ] Costura principal: `moveLeadStage` arbitra pela etapa atual; recusa fechado, mesclado e funil alheio; não mexe `arrived_at`
- [ ] Seam 1: se a etapa é móvel (aberta, mesmo funil, não mesclada)

## Fora deste ticket

Editor de funis. Ganho/perda/handoff (Fase 6). Atividade e estagnação no card (Fase 3). Kanban jurídico.
