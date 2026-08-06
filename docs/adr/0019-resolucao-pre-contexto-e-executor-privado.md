# Resolução pré-contexto e executor privado sob `FORCE RLS`

Uma sessão de navegador resolve a associação entre o usuário autenticado e o `slug` da URL por `private.resolve_user_workspaces`, a quarta e última função sem `AccessContext`. A função roda como um papel técnico `NOLOGIN`, sem `BYPASSRLS`, que as policies permitem apenas para as tabelas e os comandos indispensáveis às quatro funções privadas. `UserContext` nasce somente do resolvedor nomeado que consome esse resultado; o `SET LOCAL app.workspace_id` acontece só depois da validação.

**Status:** accepted · 2026-08-05

**Emenda:** este ADR supersede parcialmente o [ADR-0006](./0006-rls-duas-camadas-guc-worker.md), o [ADR-0010](./0010-migrations-e-ci-cd.md), o [ADR-0012](./0012-contexto-de-tenant-na-url.md) e o [ADR-0016](./0016-contexto-de-acesso-e-leitor-escopado.md): a lista fechada deixa de ter três funções e passa a ter quatro; policies do app e do worker continuam keiadas exclusivamente em `app.workspace_id`, mas o executor técnico das funções privadas recebe policies próprias e mínimas. As notas de supersessão nesses documentos apontam para esta decisão.

## O problema

`Workspace.slug` é o UUIDv4 que chega na URL, enquanto a RLS de `Workspace` e `WorkspaceMember` compara `app.workspace_id` com o `Workspace.id`. Antes de validar a associação, não existe um `workspace_id` que possa alimentar o GUC; setar o próprio slug no GUC não encontra a associação. Portanto, a frase "validar o slug contra `WorkspaceMember` antes de setar o GUC" não tinha uma consulta que pudesse executá-la sob as policies vigentes.

Também não basta criar uma função `SECURITY DEFINER` pertencente ao migrador. `FORCE ROW LEVEL SECURITY` sujeita inclusive o proprietário da tabela à policy. A função precisa de um executor que a policy reconheça, sem dar bypass ao processo do app, ao worker ou à conexão de migrations.

## A decisão

### 1. Quatro funções sem contexto, lista fechada

As únicas funções `SECURITY DEFINER` do banco continuam no schema `private`, com `search_path` fixado e `EXECUTE` revogado de `PUBLIC`. São exatamente estas:

| Função | Chamador autorizado | Por que não tem `AccessContext` | Retorno permitido |
|---|---|---|---|
| `resolve_workspace_by_token_hash` | app | O hash do token é o que descobre o tenant da ingestão | `workspace_id` |
| `claim_pending_events` | app | O dispatcher ainda não tem job nem tenant para setar | Somente `(id, workspace_id)` |
| `provision_workspace` | app | O Workspace ainda não existe | `workspace_id` |
| `resolve_user_workspaces` | app | A sessão precisa validar o slug contra `WorkspaceMember` antes de ter `workspace_id` | Para associações do próprio usuário: `workspace_id`, `slug`, `name` e `role`; ausência de associação não devolve detalhe do workspace |

`resolve_user_workspaces(authenticated_user_id, requested_slug nullable)` tem dois modos, sob a mesma interface SQL estreita:

- com `requested_slug`, retorna no máximo a associação daquele usuário àquele slug; ausência é tratada pelo chamador como 404 uniforme;
- sem `requested_slug`, retorna somente as associações do próprio usuário, para o redirecionamento de associação única e o seletor multi-workspace.

O `authenticated_user_id` vem exclusivamente de uma verificação server-side da sessão Supabase; nunca de corpo, query string, cookie livre ou argumento de client component. A função não devolve payload de integração, Pessoa, contato, token, nem qualquer linha de um workspace sem associação.

### 2. Executor técnico, não bypass de processo

`resolve_user_workspaces` é de propriedade de `marctco_private_definer`, papel técnico com `NOLOGIN`, `NOSUPERUSER`, `NOBYPASSRLS` e sem associação que `marctco_app` ou `marctco_worker` possam assumir. Ele não é connection string, não executa jobs e não é papel de migrations. Cada uma das outras três funções, quando materializada, precisa de executor técnico com as mesmas propriedades, grants e policies mínimos; pode reutilizar ou não esse papel somente se o Seam 3 provar a mesma contenção. Esta decisão não congela prematuramente o ownership dessas funções ainda inexistentes.

Para cada tabela/comando que uma função privada realmente usa, a migration concede ao seu executor técnico apenas o privilégio SQL correspondente e cria policy explícita para esse papel. As policies normais de `marctco_app` e `marctco_worker` continuam usando somente `app.workspace_id`; não nasce `app.user_id`, policy baseada em JWT, nem bypass amplo. O papel técnico não pode fazer login, e o único caminho que o aciona são as quatro funções enumeradas acima.

**Emenda de 2026-08-06 — executor de `provision_workspace`.** A terceira função materializou-se com executor próprio, `marctco_provisioner`, e não reusa `marctco_private_definer`: esse papel é dono dos dois resolvedores somente-leitura, e dar-lhe `INSERT` em `workspaces` transformaria duas leituras pré-tenant em caminhos de escrita — contenção que o Seam 3 não conseguiria provar igual. `marctco_provisioner` recebe `SELECT`+`INSERT` em `workspaces`, `workspace_members` e `pipelines`, `INSERT` em `stages`, e policy por comando em cada uma dessas tabelas; nunca `UPDATE` nem `DELETE`, e nenhum acesso a `integration_connections`. As invariantes diferidas do funil rodam no `COMMIT`, fora do contexto `SECURITY DEFINER`: por isso a função fixa `app.workspace_id` no workspace que acabou de criar — o mesmo do qual o chamador já é `OWNER` — para que os gatilhos enxerguem as linhas que precisam validar.

A rejeição de `service_role` acima continua valendo onde foi escrita: **nenhuma conexão de banco do web usa `service_role`**, e a associação continua sendo resolvida por `resolve_user_workspaces` sob RLS. O único uso de `service_role` no processo web é a Auth Admin API do Supabase, para gastar o direito de provisionamento em `app_metadata` — metade que só ela pode escrever, fora do Postgres do produto e sem tocar em tabela de negócio.

Na função entregue no ticket 04, o conjunto mínimo é explícito: `marctco_private_definer` recebe somente `SELECT` em `public.workspaces` e `public.workspace_members`, mais policies `FOR SELECT TO marctco_private_definer USING (true)` nessas mesmas tabelas. O `CREATE` no schema `private`, necessário apenas durante a transferência de ownership, é revogado antes do fim da migration. `marctco_app` recebe `USAGE` no schema `private` e `EXECUTE` somente em `resolve_user_workspaces`; `marctco_worker` não recebe `USAGE`, `EXECUTE` nem membership nesse schema. Cada função mantém `search_path` fixado, argumentos tipados e retorno mínimo; grants e policies são por função/tabela, nunca um `GRANT ALL` ou policy `PUBLIC` para o schema inteiro.

### 3. Um único resolvedor de `UserContext`

`packages/db` expõe `listUserWorkspaces({ authenticated_user_id, requested_slug })` para o seletor e `resolveUserContextForSlug(authenticated_user_id, slug)` para a rota ativa. Ambas chamam `private.resolve_user_workspaces`; a segunda aceita no máximo uma associação encontrada e constrói o `UserContext` que acompanha o resultado. A construção de `UserContext` passa a ser detalhe interno de `packages/db`; tipos `UserContext`/`AccessContext` seguem públicos para que leituras e escritas nomeadas possam recebê-los, mas nenhum chamador externo cria o contexto com um literal ou com três campos livres.

Em `apps/web`, uma única função de resolução por requisição verifica a sessão Supabase no servidor e chama essa operação. Ela é envolta em `React.cache()` e recebe o `slug` como argumento: o cache morre com a requisição e duas abas, em workspaces distintos, continuam independentes. Server Components e route handlers obtêm o mesmo `UserContext` desse resolvedor; nenhum deles seta GUC ou consulta `WorkspaceMember` diretamente.

### 4. Recusa uniforme e auditoria sem PII

Slug malformado, inexistente e não associado sempre terminam em 404, nunca 403. Antes de responder, a tentativa sem associação é registrada como evento estruturado de auditoria: `event`, `result`, hashes SHA-256 de `authenticated_user_id` e `slug`, e `request_id` quando fornecido. Não contém e-mail, nome, IP, token, payload, `Person`, submissão nem identificadores puros. A resposta não revela qual dos dois motivos de 404 ocorreu.

O limiter em memória do [ADR-0012](./0012-contexto-de-tenant-na-url.md) continua sendo aplicado a essas tentativas. A auditoria não é motivo para acrescentar Redis, I/O externo dentro de transação ou estado mutável em escopo de módulo.

### 5. Provas obrigatórias no Seam 3 e no fluxo web

O Seam 3 passa a reprovar:

- qualquer `SECURITY DEFINER` fora das quatro funções acima, overload incluso;
- `resolve_user_workspaces` cujo owner não seja `marctco_private_definer`, cujo `search_path` não seja fixado, ou cujo `EXECUTE` alcance `PUBLIC`/worker; e qualquer função futura sem executor técnico equivalente;
- executor técnico com `LOGIN`, `BYPASSRLS`, superuser ou membership assumível por app/worker;
- policy de executor técnico que não seja associada a uma tabela/comando exigidos por uma das quatro funções;
- app ou worker que obtenha dado sem o GUC, fora de uma das interfaces privadas permitidas.

O fluxo do ticket 04 prova que uma associação válida produz exatamente um `UserContext`; slug de outro workspace e slug inexistente devolvem o mesmo 404; ambos não produzem contexto; e o evento de auditoria não carrega PII. A prova da função precisa rodar com `FORCE RLS` ativo, para não confundir sucesso do owner com sucesso do executor técnico.

## Alternativas rejeitadas

- **Adicionar `app.user_id` e policies pré-tenant.** Criaria uma segunda fonte de autorização e espalharia a exceção por tabelas de negócio; o app/worker deixariam de depender apenas do GUC que o desenho consegue provar.
- **Usar `service_role`, a conexão de migrations ou Supabase Data API privilegiada no web.** Uma consulta de associação ganharia bypass global e anularia a segunda camada justamente no processo que atende o navegador.
- **Criar a quarta função pertencente ao migrador.** Sob `FORCE RLS`, ela continua sujeita à policy e retorna zero linhas sem GUC.
- **Deixar `createUserContext` público e pedir disciplina.** Qualquer rota poderia construir um contexto a partir de entrada não validada; a regra voltaria a ser comentário, não interface.

## Consequências

Há um único caminho pré-contexto no navegador e uma lista pequena, auditável e testável de escapes sem tenant. O custo é manter grants, policies e testes adicionais para o executor técnico a cada nova função privada — exatamente o pedágio que impede que a exceção vire um bypass genérico.

As operações normais de `packages/db` continuam recebendo `AccessContext`, abrindo transação e fazendo `SET LOCAL app.workspace_id`; esta decisão não cria um terceiro tipo de contexto nem altera o escopo dos quatro perfis de acesso.
