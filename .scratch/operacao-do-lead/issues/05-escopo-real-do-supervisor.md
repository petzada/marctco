# 05 — Escopo real do Supervisor

**What to build:** O Supervisor deixa de enxergar o workspace inteiro. Com tag, vê o time. Sem tag, não tem time e não reatribui. A fila sem dono sai do escopo dele — é da Gestão e da Direção ([ADR-0024](../../../docs/adr/0024-fila-sem-dono-e-da-gestao.md)). A herança da Gestão acaba, inclusive para quem ainda não recebeu tag.

**Blocked by:** 03a — Equipe: schema, tags e operações

**Status:** ready-for-agent

## Acceptance criteria

- [ ] Função pura em `packages/domain`: dadas as tags do ator e o quadro de membros, devolve o conjunto de `user_id` do time — tag compartilhada (ao menos uma), o próprio Supervisor incluso, `DETACHED` fora, várias tags, conjunto **vazio** quando não há tag ([ADR-0020](../../../docs/adr/0020-tag-no-membro-define-o-time.md), [ADR-0022](../../../docs/adr/0022-workspace-e-fronteira-de-captacao.md))
- [ ] Operações nomeadas aplicam esse conjunto no SQL. `UserContext` **não** ganha tags
- [ ] `SUPERVISOR` **deixa de ser tratado como `MANAGER`** em toda leitura e escrita que hoje herda Gestão (lista, contadores, card, edição, resolver identidade/duplicidade). A equivalência temporária do [ADR-0015](../../../docs/adr/0015-perfis-de-acesso-e-escopo.md) termina neste ticket
- [ ] Tabela de Leads: Supervisor com tag vê o time; sem tag, lista vazia. **Nenhum** Supervisor vê a fila sem dono
- [ ] Fila sem dono não é time e não entra no escopo do Supervisor (Kanban é o ticket 07; edição de card e resolução de marcador do Supervisor já são o time)
- [ ] Atendente continua vendo só o que lhe é atribuído e **não** vê fila sem dono
- [ ] Atendente sem tag não pertence a time nenhum — só Gestão e Direção o alcançam para atribuir (o recorte de destino é o ticket 06; este ticket garante que o conjunto do time não o inclui)
- [ ] Gestão e Direção continuam vendo a operação inteira, inclusive a fila sem dono
- [ ] Supervisor na Equipe passa a ver só quem compartilha tag; sem tag, Equipe vazia de colegas
- [ ] Recusa de Atendente em resolver revisão permanece; Supervisor só resolve no time
- [ ] Fail-closed: papel desconhecido continua recusando, nunca devolvendo tudo
- [ ] **Toda tela que fica vazia por falta de tag diz por quê.** Este ticket encolhe o Supervisor de "tudo" para "quase nada" de uma vez, e no dia 1 do piloto nenhum supervisor tem tag ainda — a tela vazia sem explicação vira chamado de suporte com diagnóstico errado. Equipe, Leads e Kanban trazem estado vazio nomeando a causa ("você ainda não tem uma tag de equipe") e quem resolve (a Direção, na Equipe). É texto de UI: a operação continua devolvendo conjunto vazio, sem exceção de escopo
- [ ] Seam 1 cobre a combinatória do time. Costura principal cobre Supervisor com tag vs sem tag vs Gestão na listagem — e prova que a fila sem dono não aparece para o Supervisor

## Fora deste ticket

UI de atribuir/reatribuir (ticket 06). Kanban (ticket 07). Desatrelar (ticket 04) — paralelo, não bloqueia este.
