# 05 — Linha do tempo no card

**Status:** ready-for-agent

**Blocked by:** 04 (os fatos de movimento precisam existir antes de serem lidos)

**What to build:** quem assume um lead reatribuído deixa de começar do zero. O card passa a mostrar o que aconteceu antes: quem atribuiu e para quem, as reatribuições com o responsável que saiu junto do fato, os movimentos de etapa, as atividades concluídas, e os fatos de ingestão que a Fase 1 já grava.

Até a Fase 2 esse histórico não existia em lugar nenhum — havia `previous_assigned_user_id`, que diz de quem era o lead e nada sobre o que foi feito nele. Depois deste ticket o atendente que recebe um lead às 14h sabe que ele chegou de manhã, que ficou duas horas na fila, que o supervisor o repassou e que já houve uma ligação sem resposta.

- [x] Operação nomeada que lista a linha do tempo de um lead recebendo `UserContext`, no escopo de perfil que a Fase 2 já aplica
- [x] O card mostra os fatos em ordem, com o responsável anterior legível **pelo nome** dentro do fato de reatribuição, e não como identificador opaco
- [x] Os fatos de ingestão que já existiam continuam aparecendo, sem virar model genérico das fases futuras
- [x] Os fatos são imutáveis: nenhuma tela os edita
- [x] A mesclagem transfere os fatos para a Oportunidade canônica, e nenhuma leitura segue a lápide
- [x] Paginação ou teto de leitura: um lead com anos de histórico não carrega a linha do tempo inteira num render
- [x] Segue o `DESIGN.md`; nenhum texto de tela desce para o domínio
