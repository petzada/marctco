# 07 — Kanban Meus leads

**What to build:** O atendente conduz o dia num quadro das próprias etapas em aberto — com lista alternada. Arrastar o card persiste a etapa. Ganho e perda não são colunas. A tabela geral de Leads continua sendo tabela. O Supervisor vê o time já atribuído. **Gestão e Direção não têm quadro:** elas distribuem e acompanham, não atendem.

**Blocked by:** 06 — Atribuir e reatribuir

**Status:** ready-for-agent

## Acceptance criteria

- [x] Item **Meus leads** na barra para quem atende (`ATTENDANT` e `SUPERVISOR`), rota própria, além de **Leads**. A lista geral permanece tabela paginada — sem Kanban global ([decisao-features-concorrentes.md](../../../decisao-features-concorrentes.md) §4)
- [x] Toggle Lista / Kanban (`{component.toggle-segmented}` do `DESIGN.md`)
- [x] Colunas = etapas do funil comercial padrão; só Oportunidades `OPEN` não mescladas, no escopo do papel ([ADR-0009](../../../docs/adr/0009-etapas-editaveis-papeis-e-status.md), [ADR-0015](../../../docs/adr/0015-perfis-de-acesso-e-escopo.md))
- [x] Atendente: só os atribuídos a ele. Supervisor: o time já atribuído — **não** a fila sem dono
- [x] **Gestão e Direção não têm o quadro.** O item some da barra e a rota as manda para Leads. Dar-lhes "todos os leads em aberto" dentro de uma tela chamada *Meus leads* criava o Kanban global que o §4 recusou, sob um nome que mentia. Isto **não é recusa de acesso** — nada no quadro está fora do que a tabela já lhes mostra; é ausência de escopo, e a matriz do ADR-0015 traz "—", não bloqueio. O acompanhamento delas é o filtro por responsável/equipe na tabela (ticket 06)
- [x] Arrastar persiste via route handler que chama operação nomeada `moveLeadStage`. Condição no `WHERE`: etapa atual, mesmo funil, `status = OPEN`, não mesclado. Destino tem de ser etapa desse funil
- [x] Dois arrastes concorrentes: o banco arbitra pela etapa atual, não uma leitura anterior
- [x] Recusa mover ganho, perdido, mesclado, ou para funil alheio
- [x] Mover etapa **não** toca `arrived_at`
- [x] Ganho, perda e motivo **não** aparecem como colunas e não entram neste ticket
- [x] Card do quadro: `{component.kanban-card}` — nome, etapa, responsável. **Sem campo monetário:** `amount` saiu da Fase 2 (item A10 do plano)
- [x] Abaixo de 768px: faixa com scroll-snap, não colunas lado a lado
- [x] TanStack Query no quadro (atualização otimista do arraste). Teste não verifica evento de biblioteca de DnD — verifica o que a operação aceita ou recusa e o que o banco ficou
- [x] Leitura em Server Component; a tela não monta consulta
- [x] Costura principal: `moveLeadStage` arbitra pela etapa atual; recusa fechado, mesclado e funil alheio; não mexe `arrived_at`
- [x] Seam 1: se a etapa é móvel (aberta, mesmo funil, não mesclada)

## Fora deste ticket

Editor de funis. Ganho/perda/handoff (Fase 6). Atividade e estagnação no card (Fase 3). Kanban jurídico.
