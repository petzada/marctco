# 06 — Agenda

**Status:** done

**Blocked by:** 01 (a Agenda é uma vista sobre a Atividade)

**What to build:** o atendente ganha a vista do próprio dia, e o supervisor ganha como saber se a semana do time tem trabalho marcado ou está vazia. Dia e semana, no escopo do perfil, filtrável por responsável, por equipe e por funil. Criar pela Agenda exige escolher o Lead — **não há evento órfão**, por decisão registrada em `decisao-features-concorrentes.md` §6.

A atividade criada no card aparece aqui e vice-versa: é a mesma coisa vista de dois lugares, e não duas superfícies com dados próprios.

O filtro **estreita** o escopo do perfil e nunca o alarga — o supervisor que filtra por uma equipe que não é a dele recebe vazio, não recusa. É a mesma regra que a tabela de Leads da Fase 2 já aplica.

- [x] Rota de Agenda sob `/workspace/:slug`, com item na barra lateral para quem a matriz do [ADR-0015](https://github.com/petzada/marctco/blob/main/docs/adr/0015-perfis-de-acesso-e-escopo.md) alcança
- [x] Operação nomeada única que responde a vista inteira, recebendo intervalo e filtros — a tela não monta `where`
- [x] Intervalo obrigatório e com janela máxima: calendário sem teto é `OFFSET` com outro nome
- [x] Escopo: Atendente vê as atividades dos leads dele; Supervisor com tag vê o time; Gestão e Direção veem tudo
- [x] Filtro por responsável, por equipe (tag) e por funil, sempre estreitando — filtro fora do escopo devolve vazio e não recusa
- [x] Vista de dia e vista de semana, alternadas por `{component.toggle-segmented}`
- [x] Intervalo e filtros na URL, para voltar à mesma vista e mandar o link ao supervisor
- [x] Criar atividade pela Agenda com busca de lead; a operação recusa a criação sem `opportunity_id`
- [x] Atividade vencida e não concluída em destaque, não escondida quando a data passa
- [x] Supervisor **sem** tag recebe estado vazio que nomeia a causa ("você ainda não tem uma tag de equipe") e quem resolve (a Direção, na Equipe) — o padrão que a Fase 2 estabeleceu
- [x] Usável em uma coluna no celular
- [x] Conclusão otimista pelo `@tanstack/react-query`, no limite exato do que o [ADR-0013](https://github.com/petzada/marctco/blob/main/docs/adr/0013-fluxo-de-dados-no-app.md) autoriza; escrita por route handler, sem Server Action

## Implementation evidence

**12 de 12 critérios marcados**, nenhum em aberto. Entregue em `04b0862` — dia/semana, filtros na URL, escopo por Oportunidade e conclusão otimista.

**Status reconciliado em 2026-08-24.** A execução já estava registrada nos
checkboxes e no fechamento da fase; a linha `Status:` continuava com o rótulo
de triagem anterior (`ready-for-agent`), que o
[PROMPT-HANDOFF.md](../PROMPT-HANDOFF.md) já apontava como não reescrito. A
Fase 3 fechou em `039af31`; não reabrir este ticket.
