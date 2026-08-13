# 04 — Desatrelar e desligar

**What to build:** Gestão tira o colaborador só deste workspace; Direção tira a pessoa do quadro — todos os vínculos ativos, em todos os tenants em que ela é dona. Leads em aberto voltam à fila daquele tenant; ganho e perda ficam. Login, membro e Oportunidade não são apagados. Ninguém se desliga sozinho nem derruba a Direção daquele workspace.

**Blocked by:** 03 — Equipe: cadastro com tag

**Status:** ready-for-agent

## Acceptance criteria

- [ ] Desatrelar é da Gestão ou da Direção, **neste** workspace: marca `DETACHED`; a pessoa deixa de resolver aquele slug (404 uniforme, igual a slug inexistente) e pode continuar em outro tenant ([ADR-0023](../../../docs/adr/0023-desligamento-desativa-o-vinculo.md), [ADR-0012](../../../docs/adr/0012-contexto-de-tenant-na-url.md))
- [ ] Oportunidades `OPEN` daquele responsável naquele tenant voltam à fila sem dono; `WON`/`LOST` permanecem com o responsável histórico; contexto do card e linha do tempo intactos
- [ ] Desligar é só da Direção. A operação recebe o contexto do workspace onde o botão foi clicado (prova que o ator é `OWNER` **ali**) e, via a lista de workspaces do próprio ator, aplica o desatrelamento em cada tenant em que ele é Direção. Gestão da Hugs não atravessa a ACR
- [ ] Desligar revoga o direito de provisionar no Auth. Sem vínculo `ACTIVE` restante e sem direito, a próxima sessão é o login
- [ ] Não nasce função `SECURITY DEFINER` nova: cada tenant abre o próprio contexto de acesso
- [ ] Recusa desatrelar ou desligar a si mesmo
- [ ] Recusa desatrelar o `OWNER` daquele workspace — o vínculo do provisionamento não se desfaz pela Equipe
- [ ] Não apaga login, linha de membro nem Oportunidade
- [ ] `listUserWorkspaces` omite `DETACHED` (o filtro do ticket 03 passa a ter consumidor de escrita)
- [ ] Costura principal: desatrelar neste tenant devolve `OPEN` à fila e preserva fechados; Direção dona de dois tenants desativa os dois vínculos; Gestão não atravessa o outro
- [ ] Atendente continua recusado na Equipe; Supervisor ainda não desatrela (matriz: desatrelar é Gestão para cima)

## Fora deste ticket

Escopo do Supervisor (ticket 05). UI de atribuir (ticket 06) — os testes desta operação podem semear responsável; o demo completo na tabela vem depois, mas a aresta de bloqueio genuína é só o 03.
