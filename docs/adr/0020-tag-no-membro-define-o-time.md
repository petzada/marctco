# Tag no membro define o time; tag na oportunidade não se herda

O Supervisor responde por um time, e time neste produto é tag. A tag que computa esse escopo vive no **membro**, não na oportunidade. Tag na oportunidade, se existir, é rótulo operacional digitado à mão (carteira, campanha) — nunca copiada do responsável. Herdar seria dado derivado: reatribuir mudaria o time em silêncio, e o schema guardaria o que deveria ser calculado.

**Status:** accepted · 2026-08-12

Fecha o item A1 do [plano de construção](../plano-de-construcao.md). Emenda [ADR-0002](./0002-workspace-tags-times.md) (o “opcionalmente em oportunidades”) e a dependência aberta do [ADR-0015](./0015-perfis-de-acesso-e-escopo.md).

**Considered options (rejeitadas):**

- **Herdar a tag do responsável para a oportunidade.** O time passaria a ser um campo da Oportunidade, e reatribuir reescreveria o dado. Escopo de Supervisor ficaria refém de um campo que muda por operação distinta. Dado derivado não se armazena.
- **Computar o time do Supervisor a partir da tag da oportunidade.** Inverte a dependência: o Supervisor passaria a “possuir” cards, não gente. Um lead sem tag — o caso de todo lead recém-ingerido — ficaria fora de todo time, e a atribuição (que é da Fase 2) não teria quem a dispare no escopo do Supervisor.

**Consequences:** o catálogo `Tag` aplica-se a `WorkspaceMember` via `MemberTag` e **é gerido na tela Equipe**, no cadastro do colaborador — criar tag que ainda não existe e aplicar no membro são o mesmo gesto; não há tela de taxonomia em Configurações. **Regra de produto:** com tag, o Supervisor alcança o time; sem tag, não tem time e **não reatribui** — não herda Gestão ([ADR-0022](./0022-workspace-e-fronteira-de-captacao.md)). A fila sem dono saiu do escopo dele ([ADR-0024](./0024-fila-sem-dono-e-da-gestao.md)). O código de hoje ainda trata `SUPERVISOR` como `MANAGER` porque `MemberTag` não existe; isso é estado da fatia de fundação, **nunca fallback permanente** para quem não recebeu tag. **Tag em oportunidade fica fora da Fase 2:** não destrava Equipe, atribuição, Kanban nem o escopo do Supervisor. Se nascer depois, é write model próprio no mesmo catálogo e não participa do escopo.
