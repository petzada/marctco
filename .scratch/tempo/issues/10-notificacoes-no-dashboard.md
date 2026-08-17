# 10 — Notificações no Dashboard

**Status:** ready-for-agent

**Blocked by:** 07 (a superfície), 09 (as linhas a serem lidas)

**What to build:** o gestor lê os avisos que a varredura persistiu. No Dashboard, a lista dos leads estourados e parados que ainda não se resolveram; clicar cai no lead, com o workspace certo na URL; marcar como lida separa o que ele já olhou hoje do que não olhou — **sem** tirar o lead da lista, porque ele continua estourado.

É o fechamento da Fase 3: a partir daqui o gestor abre o CRM de manhã, vê os quatro números, os gráficos e a lista do que precisa de reação, e cada item leva ao lead.

- [ ] Operação nomeada que lista as notificações **não resolvidas** recebendo `UserContext`, no escopo de perfil de sempre
- [ ] Supervisor com tag vê as do time; Gestão e Direção veem tudo; **Atendente é recusado** — o sinal dele é a atividade vencida na Agenda, não gargalo de operação
- [ ] Notificação de um workspace nunca aparece no outro, mesmo para a Direção que é dona dos dois
- [ ] Operação nomeada para marcar como lida, gravando quem marcou
- [ ] Marcar como lida **não** resolve: o aviso continua na lista, distinguível do que ainda não foi olhado
- [ ] O aviso resolvido some da lista sem apagar a linha
- [ ] Clicar leva ao lead sob `/workspace/:slug/...` — o link nasce com o tenant dentro ([ADR-0012](../../../docs/adr/0012-contexto-de-tenant-na-url.md))
- [ ] Estado vazio dizendo que não há nada queimando, e o estado vazio do Supervisor sem tag nomeando a causa
- [ ] Segue o `DESIGN.md`; escrita por route handler, sem Server Action
