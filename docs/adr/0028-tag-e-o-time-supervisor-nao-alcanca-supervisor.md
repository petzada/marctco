# Tag é o time; Supervisor não alcança Supervisor

A tag no membro nomeia o **time**, e nada mais. O conjunto do time de um Supervisor são os membros `ACTIVE` que compartilham ao menos uma tag com ele, **menos os outros `SUPERVISOR`** — ele próprio continua dentro. A marca do grupo sai do verbete da tag e passa a ser [ADR-0029](./0029-empresa-e-agrupamento-de-equipe.md).

**Status:** accepted · 2026-08-14

Emenda o [ADR-0020](./0020-tag-no-membro-define-o-time.md) e o verbete **Tag** do [CONTEXT.md](../../CONTEXT.md), que diziam "identifica marca ou time". Não reabre nada do [ADR-0024](./0024-fila-sem-dono-e-da-gestao.md) nem do [ADR-0025](./0025-destino-da-fila-e-supervisor-ou-ator.md): a fila sem dono continua da Gestão e da Direção, e o destino da fila continua Supervisor com tag ou o próprio ator.

## O problema

O catálogo de tags é plano e a pertinência é simétrica. "Time = quem compartilha ao menos uma tag" é um **OU**, então dois Supervisores marcados com a mesma tag ficavam no time um do outro: cada um via os leads do outro e podia **reatribuí-los**, porque a regra do [ADR-0022](./0022-workspace-e-fronteira-de-captacao.md) exige que dono atual e destino compartilhem tag com o ator — e compartilhavam.

Isso fura a história 34 da [spec da Fase 2](../../.scratch/operacao-do-lead/spec.md) ("não quero alcançar lead cujo dono atual está fora do meu time") **sem nenhuma recusa disparar**, porque tecnicamente o outro Supervisor *está* no time dele. É o modo de falha que o [ADR-0015](./0015-perfis-de-acesso-e-escopo.md) chama de vazamento interno silencioso: nada erra, o escopo só é maior do que a regra promete.

A ambiguidade "marca ou time" era a causa. Enquanto a tag pudesse significar as duas coisas, o mesmo valor decidia escopo e classificava a empresa, e a decisão sobre quem alcança quem ficava refém de como a Direção resolveu nomear o rótulo no dia do cadastro.

**Considered options (rejeitadas):**

- **Manter a simetria e chamá-la de recurso** — dois Supervisores da mesma marca cobrem férias um do outro. Recusada: cobrir ausência já é o alcance de Gestão e Direção, que reatribuem em qualquer lugar do workspace. Pagar com um furo permanente na regra "não tira lead de outra equipe" para economizar um caso que já tem dono é troca ruim.
- **Tag com dono: no máximo um Supervisor por tag,** garantido por constraint. Recusada: bloqueia dois Supervisores coexistirem na mesma equipe — turnos, ou uma equipe grande com dois responsáveis — e uma constraint é muito mais difícil de afrouxar depois do que uma linha numa função pura.
- **Semântica E em vez de OU** (time = quem compartilha *todas* as tags). Recusada: quebra a história 4 (a mesma pessoa atende mais de um time) e torna o escopo dependente da ordem em que a Direção aplicou os rótulos.

**Consequences:** a função pura do time, no ticket 05, exclui do conjunto os membros com papel `SUPERVISOR` que não sejam o ator. O `UserContext` continua sem tags ([spec](../../.scratch/operacao-do-lead/spec.md)); o join em `MemberTag` continua dentro da operação nomeada.

Um **Atendente** com duas tags continua no time de dois Supervisores, e os dois o alcançam. É consequência aceita e não defeito: os dois de fato o supervisionam, e é exatamente o que a história 4 pediu. A exclusão vale entre pares que **comandam**, não entre quem é comandado.

Supervisor sem tag continua sem time, sem reatribuição e com as telas vazias explicando por quê ([ADR-0024](./0024-fila-sem-dono-e-da-gestao.md)).
