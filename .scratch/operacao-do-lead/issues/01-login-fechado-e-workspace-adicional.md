# 01 — Login fechado e workspace adicional

**What to build:** A Direção que já é dona de um workspace, quando a marctco marca de novo o direito e o nome, nasce um tenant novo sem perder o primeiro. Quem autentica sem vínculo ativo e sem direito encontra uma tela de erro que diz o que aconteceu e quem resolve — não uma sala de espera que promete, nem um chute mudo para o login. Colaborador nunca provisiona.

**Blocked by:** None — can start immediately

**Status:** done

## Acceptance criteria

- [x] Direito presente (booleano estrito em `app_metadata`, com nome não vazio) autoriza provisionar **mesmo com vínculo ativo** — a Hugs já associada não bloqueia a ACR ([ADR-0022](../../../docs/adr/0022-workspace-e-fronteira-de-captacao.md), [ADR-0021](../../../docs/adr/0021-dois-caminhos-de-nascimento-login-fechado.md))
- [x] `provision_workspace` **cria** o tenant novo em vez de devolver "o primeiro vínculo que houver". A consulta dentro do lock consultivo deixa de procurar qualquer vínculo do usuário e passa a procurar **vínculo `OWNER` num workspace com este mesmo nome** — o teste que exigia “quem já pertence recebe o workspace antigo” inverte o critério
- [x] Uma transação só, como hoje: workspace + vínculo `OWNER` + funil comercial padrão com `ENTRY` e `CLOSING`. Ou nasce inteiro, ou não nasce
- [x] O gasto do direito continua **antes** da criação: só gasta quando `can_provision_workspace` é o booleano `true`; se já é falso, a rota não provisiona
- [x] Sem direito e com vínculo ativo → entra como membro (seletor se houver mais de um)
- [x] Sem direito e sem vínculo ativo → **tela de erro terminal**: "sua conta não tem acesso a nenhum workspace; a Direção da sua empresa faz o cadastro", com botão de sair. O estado `wait` deixa de ser sala de espera e deixa de prometer que algo está sendo preparado — mas **não** vira redirect mudo para o login, que faz quem foi desatrelado achar que errou a senha ([ADR-0021](../../../docs/adr/0021-dois-caminhos-de-nascimento-login-fechado.md))
- [x] Colaborador sem o direito não provisiona, mesmo que já pertença a um workspace — o cadastro da Equipe (ticket 03a) nunca concede o direito; este ticket não espera o 03a para travar o caminho
- [x] Direção com dois workspaces usa o seletor; cada aba permanece no seu tenant ([ADR-0012](../../../docs/adr/0012-contexto-de-tenant-na-url.md))
- [x] Nenhuma função `SECURITY DEFINER` nova, nenhuma constraint nova. O `pg_advisory_xact_lock(hashtextextended(owner_user_id::text, 0))` que já existe (`20260806000100_provision_workspace/migration.sql:134`) continua serializando por dono; muda só o `SELECT` que roda dentro dele. Dois POSTs simultâneos com a mesma marcação carregam o mesmo `workspace_name`, então o segundo lê o tenant que o primeiro criou e o devolve — o duplo clique volta a ser idempotente sem sexta função privada
- [x] Preço aceito e declarado: a mesma Direção não cria dois workspaces de nome idêntico — recebe o primeiro de volta. Nome igual para dois tenants do mesmo dono é duplo clique, não intenção
- [x] Seam 1: a decisão de onboarding cobre direito + vínculo existente → provisiona; sem direito e sem vínculo → erro terminal, e o teste afirma que **não** é `wait` nem redirect para login
- [x] Costura principal: `provisionWorkspace` com nome **novo** para o mesmo `OWNER` nasce tenant novo; com o **mesmo nome** devolve o tenant existente; gasto já falso não chama a função
- [x] Seam 3: a lista fechada de funções privadas continua fechada

## Implementation evidence

**13 de 13 critérios marcados.** Auditoria em 2026-08-17 sobre o código já entregue — não pelo implementador.

**Como cada critério foi verificado.** A decisão de onboarding e a idempotência do provisionamento estão cobertas por teste automatizado. Gasto do direito, tela `denied` e ausência de sexta função privada foram conferidos por leitura de código contra o critério. **Nenhuma verificação em navegador foi feita**: o copy da tela terminal e o botão Sair estão marcados pela conformidade do JSX, não por inspeção da tela renderizada.

**A decisão:** `apps/web/lib/onboarding-decision.ts`. Direito presente → `provision` mesmo com vínculo ativo; sem direito e com vínculo → `member`; sem direito e sem vínculo → `denied`. O tipo não tem `wait`. `apps/web/lib/onboarding-decision.test.ts` afirma direito + vínculo existente → provisiona, e que a porta fechada **não** é `wait` nem redirect para login.

**A tela:** `apps/web/app/onboarding/page.tsx` — estado `denied` renderiza "Sua conta não tem acesso a nenhum workspace" / "A Direção da sua empresa faz o cadastro" com POST para `/auth/logout`. `member` redireciona para `/access` (seletor). `apps/web/app/onboarding/provision/route.ts` só chama `provisionWorkspace` quando a decisão é `provision`.

**A função:** migration `packages/db/prisma/migrations/20260814000100_provision_workspace_by_owner_name/migration.sql` — o lock consultivo permanece por dono; o `SELECT` dentro dele procura vínculo `OWNER` num workspace com o mesmo nome. `packages/db/tests/rls.test.ts` prova que o mesmo nome devolve o tenant existente e que um nome novo para o mesmo `OWNER` nasce tenant novo.

## Fora deste ticket

Equipe, convite, tags, atribuição, Kanban. Campanha/valor no lead (ticket 02). Desatrelar/desligar (ticket 04) — este ticket só fecha o nascimento do segundo tenant e a porta de quem ninguém cadastrou.
