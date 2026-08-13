# 01 — Login fechado e workspace adicional

**What to build:** A Direção que já é dona de um workspace, quando a marctco marca de novo o direito e o nome, nasce um tenant novo sem perder o primeiro. Quem autentica sem vínculo ativo e sem direito sai para o login — não fica numa sala de espera. Colaborador nunca provisiona.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

## Acceptance criteria

- [ ] Direito presente (booleano estrito em `app_metadata`, com nome não vazio) autoriza provisionar **mesmo com vínculo ativo** — a Hugs já associada não bloqueia a ACR ([ADR-0022](../../../docs/adr/0022-workspace-e-fronteira-de-captacao.md), [ADR-0021](../../../docs/adr/0021-dois-caminhos-de-nascimento-login-fechado.md))
- [ ] `provision_workspace` **cria** o tenant novo; deixa de devolver o vínculo existente. O teste que exigia “quem já pertence recebe o workspace antigo” inverte o critério
- [ ] Uma transação só, como hoje: workspace + vínculo `OWNER` + funil comercial padrão com `ENTRY` e `CLOSING`. Ou nasce inteiro, ou não nasce
- [ ] O gasto do direito continua **antes** da criação: só gasta quando `can_provision_workspace` é o booleano `true`; se já é falso, a rota não provisiona
- [ ] Sem direito e com vínculo ativo → entra como membro (seletor se houver mais de um)
- [ ] Sem direito e sem vínculo ativo → **login**, não espera. O estado `wait` deixa de ser destino de sessão
- [ ] Colaborador sem o direito não provisiona, mesmo que já pertença a um workspace — o cadastro da Equipe (ticket 03) nunca concede o direito; este ticket não espera o 03 para travar o caminho
- [ ] Direção com dois workspaces usa o seletor; cada aba permanece no seu tenant ([ADR-0012](../../../docs/adr/0012-contexto-de-tenant-na-url.md))
- [ ] Nenhuma função `SECURITY DEFINER` nova. O lock consultivo na função permanece só para serializar criações concorrentes. Dois POSTs com o mesmo JWT ainda vivo são corrida residual nomeada na spec — não se abre sexta função privada para fechá-la
- [ ] Seam 1: a decisão de onboarding cobre direito + vínculo existente → provisiona; sem direito e sem vínculo → não é espera
- [ ] Costura principal: segundo `provisionWorkspace` do mesmo `OWNER` nasce tenant novo; gasto já falso não chama a função
- [ ] Seam 3: a lista fechada de funções privadas continua fechada

## Fora deste ticket

Equipe, convite, tags, atribuição, Kanban. Campanha/valor no lead (ticket 02). Desatrelar/desligar (ticket 04) — este ticket só fecha o nascimento do segundo tenant e a porta de quem ninguém cadastrou.
