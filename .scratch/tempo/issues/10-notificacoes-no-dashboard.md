# 10 — Notificações no Dashboard

**Status:** done

**Blocked by:** 07 (a superfície), 09 (as linhas a serem lidas)

**What to build:** o gestor lê os avisos que a varredura persistiu. No Dashboard, a lista dos leads estourados e parados que ainda não se resolveram; clicar cai no lead, com o workspace certo na URL; marcar como lida separa o que ele já olhou hoje do que não olhou — **sem** tirar o lead da lista, porque ele continua estourado.

É o fechamento da Fase 3: a partir daqui o gestor abre o CRM de manhã, vê os quatro números, os gráficos e a lista do que precisa de reação, e cada item leva ao lead.

- [x] Operação nomeada que lista as notificações **não resolvidas** recebendo `UserContext`, no escopo de perfil de sempre
- [x] Supervisor com tag vê as do time; Gestão e Direção veem tudo; **Atendente é recusado** — o sinal dele é a atividade vencida na Agenda, não gargalo de operação
- [x] Notificação de um workspace nunca aparece no outro, mesmo para a Direção que é dona dos dois
- [x] Operação nomeada para marcar como lida, gravando quem marcou
- [x] Marcar como lida **não** resolve: o aviso continua na lista, distinguível do que ainda não foi olhado
- [x] O aviso resolvido some da lista sem apagar a linha
- [x] Clicar leva ao lead sob `/workspace/:slug/...` — o link nasce com o tenant dentro ([ADR-0012](../../../docs/adr/0012-contexto-de-tenant-na-url.md))
- [x] Estado vazio dizendo que não há nada queimando, e o estado vazio do Supervisor sem tag nomeando a causa
- [x] Segue o `DESIGN.md`; escrita por route handler, sem Server Action

## Implementation evidence

**9 de 9 critérios marcados**, nenhum em aberto. Entregue em `039af31` — lista não resolvida e marcar como lida.

**Status reconciliado em 2026-08-24.** A execução já estava registrada nos
checkboxes e no fechamento da fase; a linha `Status:` continuava com o rótulo
de triagem anterior (`claimed`), que o
[PROMPT-HANDOFF.md](../PROMPT-HANDOFF.md) já apontava como não reescrito. A
Fase 3 fechou em `039af31`; não reabrir este ticket.
