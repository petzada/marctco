# 04 — Desatrelar e desligar

**What to build:** Gestão tira o colaborador só deste workspace; Direção tira a pessoa do quadro dela — os vínculos ativos em todos os tenants em que **o ator** é dono. Leads em aberto voltam à fila daquele tenant, guardando quem os tinha; ganho e perda ficam. Login, membro e Oportunidade não são apagados. Ninguém se desliga sozinho nem derruba a Direção daquele workspace.

**Blocked by:** 03a — Equipe: schema, tags e operações · 03b — Equipe: tela e convite (os botões moram nessa tela)

**Status:** ready-for-agent

## Acceptance criteria

- [ ] Desatrelar é da Gestão ou da Direção, **neste** workspace: marca `DETACHED`; a pessoa deixa de resolver aquele slug (404 uniforme, igual a slug inexistente) e pode continuar em outro tenant ([ADR-0023](../../../docs/adr/0023-desligamento-desativa-o-vinculo.md), [ADR-0012](../../../docs/adr/0012-contexto-de-tenant-na-url.md))
- [ ] Oportunidades `OPEN` daquele responsável naquele tenant voltam à fila sem dono; `WON`/`LOST` permanecem com o responsável histórico; contexto do card e linha do tempo intactos
- [ ] **`previous_assigned_user_id` guarda quem tinha o lead.** Devolver à fila é um `UPDATE` em massa e silencioso — quem tinha 200 abertos larga 200 cards sem dono, e a `Activity` só nasce na Fase 3. Sem esta coluna, "de quem eram estes leads" não existe em lugar nenhum do sistema ([ADR-0023](../../../docs/adr/0023-desligamento-desativa-o-vinculo.md))
- [ ] Desligar é só da Direção. A operação recebe o contexto do workspace onde o botão foi clicado (prova que o ator é `OWNER` **ali**) e, via a lista de workspaces do próprio ator, aplica o desatrelamento em cada tenant em que ele é Direção. Gestão da Hugs não atravessa a ACR
- [ ] **O alcance é o do ator, e a UI não promete mais que isso.** Um vínculo dessa pessoa em workspace de outro cliente da marctco não é alcançado — e não deve ser. Nenhum texto de tela diz "ela não entra em workspace nenhum"; o que se diz é que ela sai de todos os seus e não ganha workspace novo
- [ ] Desligar revoga o direito de provisionar no Auth. Sem vínculo `ACTIVE` restante e sem direito, a próxima sessão cai na **tela de erro** do ticket 01 — não numa sala de espera e não num redirect mudo para o login
- [ ] Não nasce função `SECURITY DEFINER` nova: cada tenant abre o próprio contexto de acesso
- [ ] Recusa desatrelar ou desligar a si mesmo
- [ ] Recusa desatrelar o `OWNER` daquele workspace — o vínculo do provisionamento não se desfaz pela Equipe
- [ ] Não apaga login, linha de membro nem Oportunidade
- [ ] `listUserWorkspaces` omite `DETACHED` (o filtro do 03a passa a ter consumidor de escrita)
- [ ] Costura principal: desatrelar neste tenant devolve `OPEN` à fila e preserva fechados; `previous_assigned_user_id` fica com quem saiu; Direção dona de dois tenants desativa os dois vínculos; Gestão não atravessa o outro
- [ ] Atendente continua recusado na Equipe; Supervisor ainda não desatrela (matriz: desatrelar é Gestão para cima)

## Fora deste ticket

Escopo do Supervisor (ticket 05). UI de atribuir e reatribuir (ticket 06) — os testes desta operação podem semear responsável.
