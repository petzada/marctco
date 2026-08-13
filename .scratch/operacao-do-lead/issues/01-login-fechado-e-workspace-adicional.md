# 01 — Login fechado e workspace adicional

**What to build:** A Direção que já é dona de um workspace, quando a marctco marca de novo o direito e o nome, nasce um tenant novo sem perder o primeiro. Quem autentica sem vínculo ativo e sem direito encontra uma tela de erro que diz o que aconteceu e quem resolve — não uma sala de espera que promete, nem um chute mudo para o login. Colaborador nunca provisiona.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

## Acceptance criteria

- [ ] Direito presente (booleano estrito em `app_metadata`, com nome não vazio) autoriza provisionar **mesmo com vínculo ativo** — a Hugs já associada não bloqueia a ACR ([ADR-0022](../../../docs/adr/0022-workspace-e-fronteira-de-captacao.md), [ADR-0021](../../../docs/adr/0021-dois-caminhos-de-nascimento-login-fechado.md))
- [ ] `provision_workspace` **cria** o tenant novo em vez de devolver "o primeiro vínculo que houver". A consulta dentro do lock consultivo deixa de procurar qualquer vínculo do usuário e passa a procurar **vínculo `OWNER` num workspace com este mesmo nome** — o teste que exigia “quem já pertence recebe o workspace antigo” inverte o critério
- [ ] Uma transação só, como hoje: workspace + vínculo `OWNER` + funil comercial padrão com `ENTRY` e `CLOSING`. Ou nasce inteiro, ou não nasce
- [ ] O gasto do direito continua **antes** da criação: só gasta quando `can_provision_workspace` é o booleano `true`; se já é falso, a rota não provisiona
- [ ] Sem direito e com vínculo ativo → entra como membro (seletor se houver mais de um)
- [ ] Sem direito e sem vínculo ativo → **tela de erro terminal**: "sua conta não tem acesso a nenhum workspace; a Direção da sua empresa faz o cadastro", com botão de sair. O estado `wait` deixa de ser sala de espera e deixa de prometer que algo está sendo preparado — mas **não** vira redirect mudo para o login, que faz quem foi desatrelado achar que errou a senha ([ADR-0021](../../../docs/adr/0021-dois-caminhos-de-nascimento-login-fechado.md))
- [ ] Colaborador sem o direito não provisiona, mesmo que já pertença a um workspace — o cadastro da Equipe (ticket 03a) nunca concede o direito; este ticket não espera o 03a para travar o caminho
- [ ] Direção com dois workspaces usa o seletor; cada aba permanece no seu tenant ([ADR-0012](../../../docs/adr/0012-contexto-de-tenant-na-url.md))
- [ ] Nenhuma função `SECURITY DEFINER` nova, nenhuma constraint nova. O `pg_advisory_xact_lock(hashtextextended(owner_user_id::text, 0))` que já existe (`20260806000100_provision_workspace/migration.sql:134`) continua serializando por dono; muda só o `SELECT` que roda dentro dele. Dois POSTs simultâneos com a mesma marcação carregam o mesmo `workspace_name`, então o segundo lê o tenant que o primeiro criou e o devolve — o duplo clique volta a ser idempotente sem sexta função privada
- [ ] Preço aceito e declarado: a mesma Direção não cria dois workspaces de nome idêntico — recebe o primeiro de volta. Nome igual para dois tenants do mesmo dono é duplo clique, não intenção
- [ ] Seam 1: a decisão de onboarding cobre direito + vínculo existente → provisiona; sem direito e sem vínculo → erro terminal, e o teste afirma que **não** é `wait` nem redirect para login
- [ ] Costura principal: `provisionWorkspace` com nome **novo** para o mesmo `OWNER` nasce tenant novo; com o **mesmo nome** devolve o tenant existente; gasto já falso não chama a função
- [ ] Seam 3: a lista fechada de funções privadas continua fechada

## Fora deste ticket

Equipe, convite, tags, atribuição, Kanban. Campanha/valor no lead (ticket 02). Desatrelar/desligar (ticket 04) — este ticket só fecha o nascimento do segundo tenant e a porta de quem ninguém cadastrou.
