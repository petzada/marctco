# 07 — Dashboard operacional: os números do dia

**Status:** done

**Blocked by:** 03 (estado de SLA), 04 (estado de estagnação)

**What to build:** a Gestão passa a abrir o dia numa tela que responde "o que está queimando agora", em vez de varrer a tabela paginada, que é ordenada por chegada e serve para volume.

Quatro números em destaque: leads estourados, leads parados, leads sem responsável e atividades vencidas em aberto. **Cada um leva a algum lugar** — clicar cai na tabela de Leads ou na Agenda já filtrada por aquilo, com o filtro na URL. Número que não vira ação não entra nesta tela.

Atendente **não tem Dashboard**: o item some da barra **e** a rota recusa, porque há número de operação que ele não deve ler. É diferente do "—" de Meus leads na Fase 2, que era ausência de escopo e não recusa.

Este ticket entrega os números. Os gráficos são o ticket 08 e as notificações o 10 — os dois entram nesta mesma tela depois.

- [x] Rota de Dashboard sob `/workspace/:slug`, com item na barra para quem a matriz do [ADR-0015](https://github.com/petzada/marctco/blob/main/docs/adr/0015-perfis-de-acesso-e-escopo.md) alcança
- [x] **Uma** operação nomeada responde a tela inteira, pelo mesmo motivo que `getLeadBoard` responde o quadro inteiro: seis leituras soltas viram seis `where` de quem chamou, e o item A19 do plano já registra que consulta paralela custa conexão em pooling transaction-mode
- [x] Os quatro tiles no escopo de cada perfil: Supervisor com tag vê o time, Gestão e Direção veem tudo
- [x] O tile de leads sem responsável vem **zerado** para o Supervisor — a fila sem dono não é dele ([ADR-0024](https://github.com/petzada/marctco/blob/main/docs/adr/0024-fila-sem-dono-e-da-gestao.md))
- [x] Atendente é recusado pela rota, não só pela ausência do item na barra
- [x] Supervisor **sem** tag recebe zeros com estado vazio que nomeia a causa e quem resolve, em vez de zeros que parecem defeito
- [x] Cada tile carrega o destino do clique, com o filtro já montado na URL da tela de destino
- [x] Os números vêm das mesmas funções puras que os tickets 03 e 04 criaram — o Dashboard não recalcula SLA nem estagnação por conta própria
- [x] Legível em tela pequena: a primeira olhada do dia é no celular
- [x] Segue o `DESIGN.md`, sem cor inline e sem px inline

## Implementation evidence

**10 de 10 critérios marcados**, nenhum em aberto. Entregue em `4f14871` — quatro tiles clicáveis no escopo de perfil.

**Status reconciliado em 2026-08-24.** A execução já estava registrada nos
checkboxes e no fechamento da fase; a linha `Status:` continuava com o rótulo
de triagem anterior (`ready-for-agent`), que o
[PROMPT-HANDOFF.md](../PROMPT-HANDOFF.md) já apontava como não reescrito. A
Fase 3 fechou em `039af31`; não reabrir este ticket.
