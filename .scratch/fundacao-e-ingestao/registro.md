# Registro de execução — fundação e ingestão

> **Retomada (2026-08-05):** gate 04/05/06 fechado — PR `ticket/04-05-06-auth-pipelines-integration` empacota migrations 002–009, auth web, funis seedados e `IntegrationConnection`. Ticket 17 permanece na fronteira seguinte.
## Ticket 01 — Esqueleto vivo: monorepo, Docker local, CI e deploy — BLOQUEADO

- **O que foi construído:** Nenhum código de produção foi escrito, conforme a parada obrigatória do ticket.<br>A leitura integral da spec, correções arquiteturais, ADRs aplicáveis e skills foi concluída.<br>A inspeção somente leitura identificou todas as dependências externas pendentes.
- **Arquivos-chave criados/alterados:** Nenhum. `PROMPT-GOAL-IMPLEMENTACAO.md` permanece não rastreado e intocado.
- **Critérios de aceite:** 0 de 39 marcados. Todos permanecem desmarcados: Monorepo, Ambiente local, A7, Papéis/autoverificação, PII, Rate limit, Guards, Push/PR e Release dependem da parada externa; os dois itens deliberadamente adiados também só serão marcados quando codificados como regras.
- **Testes:** Nenhum teste executado; ainda não há implementação. Inspeções reais: Docker, Railway CLI e Supabase CLI ausentes; GitHub autenticado; repositório privado; branch correta e baseada em `origin/main`.
- **Branch / PR:** `ticket/01-esqueleto-vivo-monorepo-ci-deploy`; PR ainda não aberto; CI inexistente.
- **Decisões que tomei sozinho:** Nenhuma decisão arquitetural. Preservei o working tree e não escrevi antes do gate humano obrigatório.
- **Descobertas que afetam tickets seguintes:** O repositório privado não permite branch protection no plano GitHub atual: a API devolveu 403 exigindo GitHub Pro ou repositório público. Não existe GitHub Environment `production`, nem secrets configurados. Docker não está instalado; portanto as quatro verificações A7 ainda não podem ser executadas.
- **Documentos emendados:** Nenhum.
- **Precisa de mão humana:** 1. Instale e inicie Docker Desktop com backend WSL2; confirme que `docker version` e `docker compose version` funcionam. 2. Mantenha o repositório privado e faça upgrade para GitHub Pro/Team, recomendado, ou torne-o público; o plano atual bloqueia branch protection. Após o upgrade, Luna configurará a proteção e o check obrigatório quando o workflow existir. 3. Crie o projeto Supabase de produção e anote região, project ref, URL e endpoints direto/session e pooler; não envie senhas no chat. 4. Crie um projeto Railway na mesma região, com serviços separados `web`, `worker` e Redis, conectados ao repositório, e habilite Wait for CI para app e worker. 5. Crie o GitHub Environment `production` e armazene nele somente a connection string owner de migrations; nenhuma credencial de produção pode ficar em secret de repositório ou `.env` local. 6. Gere e guarde três senhas distintas para `marctco_migrator`, `marctco_app` e `marctco_worker`; os papéis nascerão na migration e as senhas serão aplicadas depois por `ALTER ROLE`, nunca versionadas. As URLs runtime de app/worker deverão usar seus respectivos papéis, pooler transaction-mode e `pgbouncer=true`; a URL de migration será distinta. 7. Confirme que o Supabase está vazio de leads reais. Se já houver o primeiro lead real, providencie backup restaurável antes de qualquer migration. Responda apenas com: Docker funcionando; GitHub atualizado; refs/URLs não secretas e regiões de Supabase/Railway; serviços criados; Environment criado; senhas guardadas; e “produção vazia” ou localização do backup restaurável.

### Segunda tentativa — BLOQUEADO

- **O que foi construído:** Nenhum código de produção foi escrito nesta segunda tentativa.<br>Os sete gates externos foram revalidados por inspeção real e somente leitura.<br>Os pré-requisitos continuam ausentes ou não verificáveis, portanto a implementação não pode começar.
- **Arquivos-chave criados/alterados:** Nenhum. `PROMPT-GOAL-IMPLEMENTACAO.md` permanece não rastreado e intocado.
- **Critérios de aceite:** 0 de 39 marcados. Todos permanecem desmarcados porque a fundação local, a infraestrutura externa e o fluxo protegido de entrega continuam bloqueados.
- **Testes:** Nenhum teste executado; Docker não está instalado e não existe ambiente local para migrations, RLS ou A7.
- **Branch / PR:** `ticket/01-esqueleto-vivo-monorepo-ci-deploy` existe em `afb94b6`, ainda não atualizada com a `main` local em `f67a255`; PR inexistente; CI inexistente.
- **Decisões que tomei sozinho:** Nenhuma. Mantive a proibição de escrever produção enquanto os gates obrigatórios estiverem pendentes.
- **Descobertas que afetam tickets seguintes:** GitHub continua recusando branch protection no repositório privado com HTTP 403 por falta de plano compatível. Não existe GitHub Environment `production`. Nenhuma configuração verificável de Supabase, Railway, credenciais dos papéis ou backup foi disponibilizada.
- **Documentos emendados:** Nenhum.
- **Precisa de mão humana:** 1. Instalar e iniciar Docker Desktop com Compose; `docker version` e `docker compose version` precisam funcionar. 2. Habilitar branch protection para repositório privado mediante GitHub Pro/Team, ou tornar o repositório público; hoje a API continua respondendo 403. 3. Criar o projeto Supabase de produção e informar seus metadados não secretos e região. 4. Criar o projeto Railway na mesma região, com serviços separados `web`, `worker` e Redis, além de Wait for CI. 5. Criar o GitHub Environment `production` e guardar nele a connection string owner de migrations. 6. Gerar e guardar senhas distintas para `marctco_migrator`, `marctco_app` e `marctco_worker`, sem enviá-las no chat ou versioná-las. 7. Confirmar que produção está vazia de leads reais ou indicar um backup restaurável existente.

### Retomada após ação humana — 2026-08-05

- O repositório foi tornado público; GitHub Environments e branch protection passaram a estar disponíveis no plano atual.
- O GitHub Environment `production` foi criado via API, restrito a branches protegidas e ainda sem secrets; o nome exato do secret será definido pelo workflow do ticket 01.
- O projeto Supabase existe e a produção foi confirmada vazia de leads reais; o gate A6 não exige backup nesta primeira migration.
- O Railway registrou um deployment falho do commit documental `c377f30`; ainda não existe código deployável nem workflow com `push`, portanto Wait for CI ainda não pode ser habilitado.
- Docker Desktop 29.6.2 e Compose v5.3.1 estão instalados, mas o engine Linux permanece `stopped`: `docker version` recebe HTTP 500 no named pipe `dockerDesktopLinuxEngine`. Windows 10 build 19045 e virtualização de firmware estão aptos; a habilitação/conclusão do WSL2 exige PowerShell elevado e reinício da máquina.

### Implementação local e CI — BLOQUEADO

- **O que foi construído:** Monorepo pnpm com web, worker, domínio puro e banco encapsulado.<br>Docker local descartável com Postgres, PgBouncer transaction-mode e Redis.<br>Migration inicial com roles, `Workspace`, `WorkspaceMember`, schema `private`, RLS forçada e grants.<br>Telemetria com allowlist central, rate limiter fail-open e abort de boot para roles inseguras.<br>CI com build, testes, migration do zero, drift, varredura de DDL e release serializada.
- **Arquivos-chave criados/alterados:** `package.json`, `pnpm-workspace.yaml`, `docker-compose.yml`.<br>`packages/db/prisma/migrations/20260805000100_foundation/migration.sql`.<br>`packages/db/src/boot-check.ts` e `packages/db/tests/`.<br>`packages/domain/src/telemetry.ts` e `packages/domain/src/rate-limit.ts`.<br>`apps/web/`, `apps/worker/` e `.github/workflows/ci.yml`.<br>`.scratch/fundacao-e-ingestao/issues/01-esqueleto-vivo-monorepo-ci-deploy.md`.
- **Critérios de aceite:** 35 de 39 marcados. Não marcados: 1. Secrets de migration somente no GitHub Environment e strings runtime somente no Railway — ainda não configurados externamente. 2. Release pós-merge aplicada e verificada — PR ainda não foi mesclado. 3. Web e worker separados no Railway com Wait for CI — exige configuração no painel. 4. Railway e Supabase na mesma região — exige confirmação/configuração no painel.
- **Testes:** três seams verdes; 18/18 testes na última suíte integral. A7 confirmou `SET LOCAL`, PgBouncer com `pgbouncer=true`, aborto após erro capturado, continuidade com `ON CONFLICT` e ausência de drift pelo schema `private`. Typecheck, lint, scanner de migration, build e drift passaram. Containers reais responderam `/health` com roles seguras e abortaram com `postgres`. CI remoto final verde em Quality, Database e `CI`.
- **Branch / PR:** `ticket/01-esqueleto-vivo-monorepo-ci-deploy`, https://github.com/petzada/marctco/pull/1, HEAD `6d46640`, CI verde. `main` protegida, inclusive para administradores, exigindo o check `CI`.
- **Decisões que tomei sozinho:** portas locais altas para evitar colisões; wrapper de inicialização que verifica a role antes de iniciar o Next.js; criação bootstrap do schema `private` com DDL concedido ao migrator; passwords locais atribuídos por script fora da migration.
- **Descobertas que afetam tickets seguintes:** `@marctco/domain` exporta `sanitizeTelemetry`, `createMemoryRateLimiter` e `checkSuspiciousRequestLimit`. `@marctco/db` exporta somente `assertSafeDatabaseRole`; o Prisma Client permanece interno. Toda tabela de negócio deve entrar na matriz automática de RLS. `private` não entra no datamodel nem no drift. Violações Prisma capturadas abortam a transação; `ON CONFLICT DO NOTHING RETURNING` permite continuar. Runtime usa `marctco_app` ou `marctco_worker`; migrations usam `marctco_migrator`.
- **Documentos emendados:** nenhum ADR ou spec. O checklist do ticket foi atualizado para 35/39.
- **Precisa de mão humana:** 1. No GitHub Environment `production`, criar o secret `MIGRATION_DATABASE_URL` com a URL Supabase da role `postgres` apenas para o primeiro bootstrap. Use conexão Direct quando acessível pelo runner ou Session pooler na porta 5432; nunca Transaction pooler. 2. No Railway, criar dois serviços separados, `web` e `worker`, ligados à `main`, com contexto na raiz do monorepo e arquivos de configuração `apps/web/railway.json` e `apps/worker/railway.json`. Colocá-los na mesma região do Supabase e habilitar **Wait for CI**. 3. Escolher senhas fortes distintas, sem enviá-las no chat. Preparar no Railway `DATABASE_URL` do web com `marctco_app` e do worker com `marctco_worker`, usando o pooler transaction-mode e `pgbouncer=true`. 4. Mesclar o PR 1 e aguardar o job `Production migration` ficar verde. A migration criará as três roles e as tabelas. 5. No SQL Editor do Supabase, executar com os valores escolhidos: `ALTER ROLE marctco_migrator WITH PASSWORD '<senha>';` `ALTER ROLE marctco_app WITH PASSWORD '<senha>';` `ALTER ROLE marctco_worker WITH PASSWORD '<senha>';` 6. Substituir `MIGRATION_DATABASE_URL` pela URL de sessão/direct da role `marctco_migrator`, removendo a credencial bootstrap `postgres`. 7. Reiniciar os serviços Railway, criar o domínio público do web e confirmar `/health` com HTTP 200; confirmar também worker saudável, Wait for CI ativo e nomes das regiões. Ao retomar, validarei release, tabela no Supabase e os dois serviços, marcarei os quatro critérios e concluirei o ticket.

### Recuperação da release Supabase — PARCIAL

- **O que foi construído:** Recuperação fail-closed para a migration inicial falha no Supabase, autorizada somente para o erro exato e ausência comprovada de artefatos residuais. A migration foi corrigida para o modelo de permissões do Supabase, incluindo `SET ROLE`, ownership e acesso ao histórico Prisma. O release recuperou a tentativa falha, reaplicou a migration em produção e confirmou o schema atualizado. A regressão gerenciada prova uma migration subsequente real executada como `marctco_migrator`.
- **Arquivos-chave criados/alterados:** `.github/workflows/ci.yml` — regressão de Postgres gerenciado, shadow database e recuperação no release.<br>`packages/db/prisma/migrations/20260805000100_foundation/migration.sql` — memberships, grants e ownership compatíveis com Supabase.<br>`packages/db/src/foundation-recovery.ts` e `recover-foundation-cli.ts` — auditoria e recuperação fail-closed.<br>`packages/db/tests/managed-migration.test.ts` — bootstrap e migration subsequente pelo papel migrador.<br>`docs/adr/0010-migrations-e-ci-cd.md` — detalhes descobertos sobre bootstrap gerenciado e recuperação.
- **Critérios de aceite:** 36 de 39 marcados. Não marcados: credenciais runtime exclusivas no Railway e troca do secret bootstrap pelo migrador; serviços web/worker separados com Wait for CI; Railway e Supabase na mesma região.
- **Testes:** suíte integral local 26/26; recuperação 9/9; regressão gerenciada 1/1; A7 5/5. Typecheck, lint, build, scanner de migrations, shadow migration e drift verdes. CI remoto verde em Quality, Database, CI e Production migration.
- **Branch / PR:** `ticket/01-recover-supabase-release`; https://github.com/petzada/marctco/pull/2, mesclado. Release verde: https://github.com/petzada/marctco/actions/runs/31005080294.
- **Decisões que tomei sozinho:** A recuperação aceita somente a migration e o erro exatos, abortando diante de qualquer estado divergente. O teste gerenciado cria uma migration temporária subsequente para provar escrita real no histórico pelo migrador. Mantive `postgres` apenas como credencial bootstrap.
- **Descobertas que afetam tickets seguintes:** O `postgres` gerenciado pelo Supabase não é superusuário e precisa receber membership com `SET` para `marctco_migrator`. Grants e default privileges precisam ocorrer antes de `RESET ROLE`. O grant em `_prisma_migrations` precisa ser condicional porque a tabela não existe durante replay no shadow database. Produção está com `20260805000100_foundation` aplicada e schema atualizado.
- **Documentos emendados:** ADR-0010 — bootstrap sob papel gerenciado, membership sem inherit, ordem dos grants, compatibilidade com shadow database e recuperação fail-closed.
- **Precisa de mão humana:** 1. No SQL Editor do Supabase, definir senhas fortes distintas com `ALTER ROLE` para `marctco_migrator`, `marctco_app` e `marctco_worker`; não enviar as senhas no chat. 2. Trocar `MIGRATION_DATABASE_URL` no GitHub Environment `production` pela URL session/direct de `marctco_migrator`. 3. Configurar no Railway serviços separados `web` e `worker`, URLs runtime de seus respectivos papéis via pooler transaction-mode com `pgbouncer=true`, Wait for CI e mesma região do Supabase. 4. Reiniciar os serviços e confirmar `/health` HTTP 200 no web e worker saudável.

### Diagnóstico do deploy Railway — PARCIAL

- **O que foi construído:** Nenhuma alteração foi necessária. O problema está exclusivamente no painel Railway: os manifests aninhados não foram selecionados, então o serviço caiu no Railpack e procurou um comando de início. Os Dockerfiles de web e worker funcionam corretamente com contexto na raiz do monorepo.
- **Arquivos-chave criados/alterados:** Nenhum.
- **Critérios de aceite:** 36 de 39 marcados. Restam: serviços separados com Wait for CI; credenciais runtime exclusivamente no Railway; confirmação de Railway e Supabase na mesma região.
- **Testes:** `docker build -f apps/web/Dockerfile .` e `docker build -f apps/worker/Dockerfile .` passaram. As duas imagens foram executadas com os papéis seguros: web `/health` retornou 200 e worker `/health` retornou 200.
- **Branch / PR:** Nenhuma nova branch ou PR. A correção anterior permanece mesclada no PR https://github.com/petzada/marctco/pull/2, com CI e migration de produção verdes.
- **Decisões que tomei sozinho:** Nenhuma. Mantive o contexto compartilhado na raiz e os dois serviços independentes definidos pelo ticket.
- **Descobertas que afetam tickets seguintes:** `railpack-v0.35.0` seguido de `No start command detected` prova que o manifest customizado não foi carregado. Railway exige cadastrar no serviço o caminho absoluto do arquivo; configurações carregadas aparecem com ícone de arquivo nos detalhes do deployment. Documentação oficial: https://docs.railway.com/config-as-code.
- **Documentos emendados:** Nenhum.
- **Precisa de mão humana:** 1. No projeto Railway, criar dois serviços a partir do mesmo repositório GitHub `petzada/marctco`: `web` e `worker`, ambos na branch `main`. 2. Em **Settings → Source**, deixar **Root Directory vazio**, mantendo o contexto na raiz do repositório. 3. Em **Config as Code → Custom Config File Path**, configurar web como `/apps/web/railway.json` e worker como `/apps/worker/railway.json`. 4. No web, configurar `DATABASE_URL` com o pooler transaction-mode da role `marctco_app`, incluindo `pgbouncer=true`; no worker, usar a role `marctco_worker`. Não colocar `MIGRATION_DATABASE_URL` no Railway. 5. Colocar ambos na mesma região do Supabase, gerar domínio público somente para web, habilitar **Wait for CI** nos dois e redeployar o último commit de `main`. 6. Confirmar builder **Dockerfile**, web `/health` HTTP 200 e worker saudável.

### Runtime database URL validada e web em produção — PARCIAL

- **O que foi construído:** `inspectRuntimeDatabaseUrl` recusa no boot uma URL Supavisor em transaction mode sem `pgbouncer=true` e um usuário de pooler fora do formato `<role>.<project-ref>`.<br>`assertSafeDatabaseRole` passou a validar a URL resolvida antes de abrir conexão e a relatar falhas com `host`, `port`, `username`, `query_keys` e a razão do driver, com a senha redigida nas formas codificada e decodificada.<br>No Railway, `DATABASE_URL` de web e worker receberam `pgbouncer=true&connection_limit=1`; nenhuma senha foi alterada nem exposta.
- **Arquivos-chave criados/alterados:** `packages/db/src/runtime-database-url.ts` e `runtime-database-url.test.ts` — validação e redação.<br>`packages/db/src/boot-check.ts` — validação antes da conexão e mensagem saneada.<br>`packages/db/tests/boot-check.test.ts` e `vitest.config.ts` — cobertura no projeto `db`.
- **Critérios de aceite:** 37 de 39 marcados. Marquei o deploy do web: `/health` responde HTTP 200 em produção. Restam: worker saudável (bloqueado pela senha de `marctco_worker`) e confirmação de Railway e Supabase na mesma região.
- **Testes:** projeto `db` 27/27; suíte integral 34 passando — `a7` estourou o timeout de 5s apenas sob paralelismo e passa isolado em 3,2s. Typecheck, lint e CI remoto verdes no PR 3.<br>Reprodução real: contra o PgBouncer transaction-mode local, a query de boot falha sem `pgbouncer=true` e conecta com a flag.<br>Verificação em produção via `railway run`, sem copiar credenciais para o disco: `marctco_app` conecta e passa na autoverificação; `marctco_worker` recebe `Authentication failed`. `pg_roles` confirma os três papéis existentes, com LOGIN e sem expiração.
- **Branch / PR:** `ticket/01-validate-runtime-database-url`; https://github.com/petzada/marctco/pull/3, CI verde, ainda não mesclado.
- **Decisões que tomei sozinho:** Editei `DATABASE_URL` dos dois serviços no Railway pela CLI, com `--set-from-stdin` para não expor o valor, porque era exatamente a correção pedida e é reversível. Anexei a razão do driver à mensagem de falha porque "connection failed" sozinho não separa senha errada de host inacessível.
- **Descobertas que afetam tickets seguintes:** O pooler compartilhado do Supabase é `aws-0-us-west-1.pooler.supabase.com:6543` e exige usuário `<role>.<project-ref>`; os dois serviços já usavam o formato correto. Prisma relata apenas o papel base na falha de autenticação, o que esconde o sufixo do tenant. O `configFile` aparece no `latestDeployment.meta` dos dois serviços, provando que os manifests aninhados carregam. O último deploy dos dois é `main@6595f26`.
- **Documentos emendados:** Nenhum.
- **Precisa de mão humana:** 1. No SQL Editor do Supabase, executar `ALTER ROLE marctco_worker WITH PASSWORD '<senha>';` e gravar a mesma senha no `DATABASE_URL` do serviço worker no Railway, preservando `?pgbouncer=true&connection_limit=1`; a senha atual no Railway não corresponde à do papel. 2. Decidir sobre o merge do PR 3. 3. Confirmar a região do projeto Railway contra `us-west-1` do Supabase e o estado de Wait for CI, que a API da CLI não expõe.

### Deploy Railway concluído — CONCLUÍDO

- **O que foi construído:** Nada além do que já estava mesclado. Esta entrada fecha a validação externa do ticket 01.
- **Arquivos-chave criados/alterados:** `.scratch/fundacao-e-ingestao/issues/01-esqueleto-vivo-monorepo-ci-deploy.md` — dois critérios marcados.
- **Critérios de aceite:** 38 de 39 marcados. Marquei a colocação das credenciais e o deploy separado com Wait for CI. Resta apenas a confirmação de que Railway e Supabase estão na mesma região, que a CLI do Railway não expõe.
- **Testes:** Deploy de `main@b68c1fc` verde nos dois serviços. Web `/health` responde HTTP 200 em `https://web-production-613e6.up.railway.app` (**domínio antigo — o atual é `web-production-33d67`; ver a nota de 2026-08-07**). Worker registra `worker ready` e o healthcheck passa. CI de `main` verde, incluindo `Production migration`.
- **Branch / PR:** `ticket/01-close-railway-deploy`, sobre `main` em `b68c1fc`, que mesclou https://github.com/petzada/marctco/pull/3.
- **Decisões que tomei sozinho:** Nenhuma além das já registradas.
- **Descobertas que afetam tickets seguintes:** A senha de `marctco_worker` no Railway não correspondia à do papel no Supabase; o `ALTER ROLE` corrigiu e o papel passa na autoverificação. Os dois serviços entram em `WAITING` no commit de merge antes de construir, o que prova Wait for CI ativo. Não existe serviço Redis no projeto Railway — os tickets de fila precisarão provisioná-lo.
- **Documentos emendados:** Nenhum.
- **Precisa de mão humana:** 1. Confirmar no painel do Railway, em Settings de cada serviço, que a região é `us-west-1`, igual à do Supabase; a CLI não expõe esse campo.

### Fechamento do ticket 01 — CONCLUÍDO

- **O que foi construído:** Nada de novo. Esta entrada registra o último gate externo e fecha o ticket.
- **Arquivos-chave criados/alterados:** `.scratch/fundacao-e-ingestao/issues/01-esqueleto-vivo-monorepo-ci-deploy.md` — último critério marcado e `Status: done`.
- **Critérios de aceite:** 39 de 39 marcados. O critério de mesma região foi confirmado pelo usuário no painel do Railway; a CLI não expõe o campo — `railway status --json` devolve `multiRegionConfig.region: null` nos dois serviços, o que reflete ausência de override em config-as-code, não a região efetiva.
- **Testes:** Nenhuma execução nova. O último estado verificado permanece: `main` verde incluindo `Production migration`, web `/health` HTTP 200 em produção, worker `ready`.
- **Branch / PR:** `ticket/01-close-ticket`, sobre `main` em `9a2bfc0`.
- **Decisões que tomei sozinho:** Aceitei o marcador de região como confirmação humana, registrando aqui a procedência para que fique auditável.
- **Descobertas que afetam tickets seguintes:** Nenhuma além das já registradas. Continua valendo: não existe serviço Redis no projeto Railway, e os tickets de fila (07, 15) precisarão provisioná-lo.
- **Documentos emendados:** Nenhum.
- **Precisa de mão humana:** Nada.

## Ticket 02 — Tokens de design a partir do DESIGN.md — CONCLUÍDO

- **O que foi construído:** `apps/web/app/globals.css` com um bloco `@theme` do Tailwind v4 extraindo, sem inventar valor algum, todos os tokens de cor (29), tipografia (16 entradas da hierarquia, tracking em `em`), espaçamento (base 4px mais nove passos), raio (gramática 8/12/16/pill) e as duas sombras do sistema, direto do `DESIGN.md`. Os namespaces padrão do Tailwind que colidiriam com a cardinalidade fechada do guia são resetados e redeclarados só com os valores documentados. `apps/web/postcss.config.mjs` liga o Tailwind ao Next.
- **Arquivos-chave criados/alterados:** `apps/web/app/globals.css` (novo).<br>`apps/web/postcss.config.mjs` (novo).<br>`apps/web/package.json` — dependências.<br>`DESIGN.md` — Known Gaps.<br>`.scratch/fundacao-e-ingestao/issues/02-tokens-de-design.md`.
- **Critérios de aceite:** 10 de 10 marcados.
- **Testes:** `pnpm typecheck`, `pnpm lint` e `pnpm test:unit` verdes na raiz. Nenhum seam formal se aplica: o ticket não toca banco nem domínio. Verificação real feita compilando `globals.css` com o `@tailwindcss/cli` contra uma folha que cobre toda classe derivada de todo token — todas resolveram, nenhuma silenciosamente ignorada; `bg-transparent` e `text-current` sobrevivem ao reset de `--color-*` por serem palavras-chave do motor.
- **Branch / PR:** `ticket/02-tokens-de-design`, https://github.com/petzada/marctco/pull/6, CI verde, mesclado na `main` em `0dbef34`.
- **Decisões que tomei sozinho:** Resetar os namespaces padrão do Tailwind (`--color-*`, `--text-*`, `--radius-*`, `--shadow-*`, `--font-weight-*`) antes de redeclarar só os tokens do `DESIGN.md`, para que a paleta genérica não fique disponível ao lado do conjunto fechado — `bg-blue-600` acessível é a mesma violação que hex inline, só disfarçada. Manter o multiplicador `--spacing` no padrão do Tailwind (0.25rem, já 4px) em vez de trocar a escala numérica inteira de rem para px sem pedido do `DESIGN.md`.
- **Descobertas que afetam tickets seguintes:** Componente consome token **somente por classe Tailwind**, nunca por `var(--color-x)` no CSS. O mapeamento: `{colors.foo}` → `bg-foo`/`text-foo`/`border-foo`/`ring-foo`; `{typography.foo}` → classe única `text-foo`, que já embute size, line-height, letter-spacing e peso, e portanto **não** se combina com `leading-*`/`tracking-*`; `{spacing.foo}` → `p-foo`/`gap-foo`/`m-foo`; `{rounded.foo}` → `rounded-foo`; `{shadow.foo}` → `shadow-foo`. `tabular-nums` é utilitário nativo, sem token. **O ticket 12 precisa criar o layout raiz importando `./globals.css` antes do primeiro componente** — hoje nada o importa, porque não existe `layout.tsx` nesta fatia.
- **Documentos emendados:** `DESIGN.md`, seção Known Gaps — nova entrada sobre a ausência de `popover`/`tooltip` como superfície de divulgação, deixando a escolha (reusar `dropdown-menu` ou criar `{component.popover}`) para o ticket 12 decidir e documentar ali, não dentro do componente.
- **Precisa de mão humana:** Nada.

## Ticket 03 — Isolamento por RLS, provado — CONCLUÍDO no seu escopo, com pendências carregadas

- **O que foi construído:** `AccessContext` como união discriminada branded (`UserContext | JobContext`), com dois construtores e nenhum literal possível, e `withAccessContext` como o único caminho de transação em `packages/db` — `SET LOCAL app.workspace_id`, nunca `SET`, fail-closed diante de papel desconhecido ou UUID inválido. O client cru do Prisma segue interno, agora com `internal/` coberto pelo mesmo boundary. Nova regra de ESLint bane `let`/`var` em escopo de módulo em `apps/web` e `apps/worker` (ADR-0006 regra 11). O Seam 3 ganhou seis provas novas.
- **Arquivos-chave criados/alterados:** `packages/db/src/access-context.ts` e `access-context.test.ts`.<br>`packages/db/src/internal/scoped-transaction.ts`.<br>`packages/db/tests/rls.test.ts` e `access-context.type-check.ts`.<br>`eslint.config.mjs`, `scripts/check-prisma-imports.mjs`, `vitest.config.ts`, `packages/db/src/index.ts`.
- **Critérios de aceite:** 23 de 29 marcados. Os seis restantes não são dívida de qualidade: cada um cita uma tabela ou função que só nasce num ticket posterior. Ver "Pendências carregadas" abaixo.
- **Testes:** `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`, `pnpm test:db`, `pnpm test:a7` e `pnpm build` verdes localmente e no PR. Seam 3 prova `withAccessContext` ponta a ponta sob os papéis de runtime, que `SET LOCAL` não sobrevive à transação, o fail-closed duplo, que tabela sem RLS é pega pela varredura, e a varredura genérica de registro ativo apontando para mesclado. CI do PR verde; `Production migration` pós-merge verde como no-op, sem migration nova.
- **Branch / PR:** `ticket/03-isolamento-rls-provado`, https://github.com/petzada/marctco/pull/8, CI verde, mesclado em `cfaa86e`.
- **Decisões que tomei sozinho:** Manter `client.ts` onde estava e criar `internal/` só para o novo helper, reduzindo churn sem violar o cliente interno. Branding com `unique symbol` privado, para "nenhum literal" ser fato do compilador e não documentação. `withAccessContext` recebe o `PrismaClient` como parâmetro em vez de manter singleton, evitando ambiguidade com a regra de nada de estado mutável em módulo. Regra de ESLint contra `let`/`var` em escopo de módulo, para o critério correspondente deixar de ser convenção. Reuso do enum `WorkspaceRole` gerado pelo Prisma como fonte única de papéis válidos.
- **Descobertas que afetam tickets seguintes — parcialmente supersedidas pelo ADR-0019:** `JobContext` continua nascendo só por `createJobContext({ workspace_id, integration_event_id })`, e toda operação normal de `packages/db` continua abrindo transação por `withAccessContext(client, ctx, async (tx, ctx) => ...)` — import relativo de `./internal/scoped-transaction.js`, só de dentro de `packages/db/src`, nunca `prisma.$transaction` direto. A construção de `UserContext` deixa de ser exportada: `resolveWorkspaceAccess` chama `resolveUserContextForSlug` após sessão Supabase e associação validada, e é o único resolvedor web. Uma tabela nova entra na matriz de RLS **automaticamente** pelo scan de `packages/db/tests/rls.test.ts`: não se edita o teste, só se escreve a migration com `ENABLE` + `FORCE` + policy + índice. O mesmo vale para `merged_into_<x>_id`, que a varredura de mesclagem já reconhece por convenção de nome. O Seam 3 passa a aceitar exatamente quatro funções `SECURITY DEFINER` — `resolve_workspace_by_token_hash`, `claim_pending_events`, `provision_workspace`, `resolve_user_workspaces` — e prova o executor técnico `NOLOGIN`, em vez de reprovar a quarta automaticamente. Operações no formato de `listLeads` devem ser tipadas `(ctx: UserContext, ...)` para herdar a rejeição de `JobContext` em tempo de compilação.
- **Documentos emendados:** O próprio ticket 03 ganhou uma "Nota de escopo" e o motivo ao lado de cada critério desmarcado. O `Status:` foi normalizado por mim para `done`, valor canônico do tracker; o subagente havia escrito `done — parcial`, que não existe no vocabulário de `docs/agents/triage-labels.md`.
- **Precisa de mão humana:** Nada.

### Pendências carregadas do ticket 03 — quem fecha cada uma

O ticket 03 entregou a infraestrutura; estes seis critérios só podem ser marcados quando a tabela ou função que citam existir. Cada Luna seguinte recebe esta lista e marca o que lhe couber **no arquivo do ticket 03**, além do seu próprio.

| Critério desmarcado no ticket 03 | Quem tem de fechar |
|---|---|
| As nove operações nomeadas (`listLeads`, `countLeadsByMarker`, `getLead`, `listIntegrationEvents`, `findPersonCandidates`, `getQuarantinedEvent`, `assignLead`, `resolveIntakeReview`, `applyIntakePlan`) | Nascem entre 07 e 12; verificação final no **12** |
| `listLeads(jobCtx)` não compila | **12** |
| Cada operação aplica `SET LOCAL`, escopo do papel, cursor keyset e índice | **12** |
| `ATTENDANT` enxerga apenas oportunidade atribuída a si | **12** (depende de `Opportunity`, do 09) |
| Nenhuma transação envolve chamada de rede externa | **07** introduz o risco (BullMQ); confirmação no **15** |
| Schema `private` com `EXECUTE` revogado de todo papel exceto o do app e `search_path` fixado por função | **04**, **06**, **15** e **17** criam uma função cada; o 04 materializa `resolve_user_workspaces`, e o 15 fecha a verificação depois da quarta |

## Ticket 04 — Autenticação e associação ao workspace — CONCLUÍDO

- **O que foi construído:** Login/logout Supabase Auth; rotas autenticadas sob `/workspace/:slug` com `slug` UUIDv4; resolvedor pré-contexto `private.resolve_user_workspaces` (quarta função fechada, ADR-0019) executado por `marctco_private_definer`; `resolveUserContextForSlug` como único construtor de `UserContext` com `React.cache()` por requisição; 404 uniforme e telemetria estruturada sem PII para tentativas de workspace alheio; seletor multi-workspace em `/access`; onboarding stub em `/onboarding`; rótulos PT-BR dos quatro papéis.
- **Arquivos-chave criados/alterados:** migrations `20260805000200_authentication_workspace_context` e `20260805000300_empty_workspace_guc_fails_closed`; `packages/db/src/workspace-context.ts` e testes; `apps/web/app/login/`, `access/`, `onboarding/`, `workspace/[slug]/`, `auth/logout/`; `apps/web/lib/workspace-access.ts`, `workspace-entry.ts`, `workspace-role.ts`; `apps/web/proxy.ts`; `docs/adr/0019-resolucao-pre-contexto-e-executor-privado.md` (novo); ADRs 0005/0006/0012/0016 emendados.
- **Critérios de aceite:** 16 de 16 marcados na issue 04.
- **Testes:** `pnpm test:db` 54/54 (inclui ACL/RLS de `resolve_user_workspaces` e fail-closed de GUC vazio); `pnpm test:unit` 22/22 (`workspace-access`, `workspace-entry`, `workspace-role`); A7 5/5; lint, typecheck, build verdes.
- **Branch / PR:** `ticket/04-05-06-auth-pipelines-integration` (empacotado com 05 e 06).
- **Decisões que tomei sozinho:** `proxy.ts` no lugar de middleware legado Next 16; rate limit em memória fail-open reutilizando `@marctco/domain`.
- **Descobertas que afetam tickets seguintes:** Ticket 17 consome `/onboarding` e deve redirecionar para o `slug` provisionado. Qualquer operação nomeada futura recebe `UserContext` tipado — `JobContext` não compila. Supabase URL/anon key locais necessários para login E2E manual.
- **Documentos emendados:** issue 04, ADR-0019 (novo), ADRs citados, este registro.
- **Precisa de mão humana:** Configurar `NEXT_PUBLIC_SUPABASE_*` no `.env` local e no Railway quando for exercitar auth em staging/produção.

## Ticket 05 — Funis e etapas seedados — CONCLUÍDO

- **O que foi construído:** `Pipeline` e `Stage` passam a existir como fluxo operacional do workspace, separados de `FinancingType`. O funil comercial padrão e suas etapas vivem como dado puro único em `packages/domain`; o seed Prisma de desenvolvimento o consome. As operações nomeadas de reordenação, troca de papéis e exclusão encapsulam a transação e exigem Gestão/Direção.
- **Arquivos-chave criados/alterados:** `packages/domain/src/pipelines.ts` e `pipelines.test.ts`.<br>`packages/db/prisma/schema.prisma`, `prisma/seed.ts` e migration `20260805000400_seeded_pipelines_and_stages`.<br>`packages/db/src/pipeline-operations.ts` e `packages/db/tests/rls.test.ts`.
- **Critérios de aceite:** 16 de 16 marcados. A coluna anulável em `Opportunity` chega com o model no ticket 09; o enum `FinancingType` já existe, sem relação ou regra de roteamento para funil.
- **Testes:** migration limpa do zero, seed repetido idempotentemente, domain 22/22, db 46/46 e A7 5/5; lint, typecheck, build, drift e scanner de migrations verdes. O Seam 3 prova RLS das duas tabelas, as invariantes no commit e reorder/role replacement/delete por operações nomeadas.
- **Decisões que tomei sozinho:** `UNIQUE(pipeline_id, position)` é diferida até o commit. Uma constraint imediata rejeita um `UPDATE` em lote ainda que o estado final não tenha empate; a regra precisa enxergar a operação inteira, tal como a substituição de `ENTRY`, `CLOSING` e default.
- **Descobertas que afetam tickets seguintes:** Ticket 17 deve importar `defaultCommercialPipeline` de `@marctco/domain` ao chamar `private.provision_workspace`; nunca duplicar a lista em SQL. Quando `Opportunity` nascer no ticket 09, a exclusão de uma etapa com oportunidades deverá exigir a migração das oportunidades para etapa destino na mesma transação.
- **Documentos emendados:** ticket 05 e este registro. Nenhum ADR novo: ADR-0009 já decide o modelo.
- **Precisa de mão humana:** Nada.

## Ticket 06 — Conexão de integração e token — CONCLUÍDO

- **O que foi construído:** `IntegrationConnection` com conexão independente por workspace/origem (`PLUGA` e `LANDING_PAGE`), token CSPRNG de 256 bits `mtco_` em base64url, hash SHA-256 indexado e único, último quarteto para UI e estado `ACTIVE`/`DISABLED`. O destino opcional é validado no banco como funil comercial do mesmo workspace; nulo preserva o funil comercial padrão para a ingestão seguinte. Migration corretiva `20260805000900_target_pipelines_stay_commercial` impede mutação reversa: funil referenciado por `target_pipeline_id` não pode virar `LEGAL`.
- **Segurança:** `private.resolve_workspace_by_token_hash` devolve exclusivamente `workspace_id`, como exige ADR-0019. Roda como `marctco_private_definer` (`NOLOGIN`, sem superuser/bypass/membership de runtime), com `SELECT` e policy apenas em `integration_connections`; `EXECUTE` é exclusivo de `marctco_app`, `search_path` é fixo e não há cache. Token desativado não resolve.
- **Arquivos-chave criados/alterados:** migrations `20260805000700_integration_connections`, `20260805000800_narrow_token_workspace_resolver` e `20260805000900_target_pipelines_stay_commercial`; `packages/db/prisma/schema.prisma`, `prisma/seed.ts`, `src/integration-connection.ts` e testes do Seam 3; `packages/db/tests/rls.test.ts` (teste da mutação reversa e labels `Conclusão` sem mojibake).
- **Testes:** migration limpa e upgrade local, seed idempotente (segunda execução sem nova revelação), **54/54** testes DB (Seam 3 inclui quatro funções `SECURITY DEFINER`, executor `NOLOGIN`, RLS de `integration_connections`, trigger 009), **22/22** unitários, A7 **5/5**, lint, typecheck, build, drift e scanner de migrations verdes localmente.
- **Decisões que tomei sozinho:** Migration 008 estreita retorno da 007 sem reescrever histórico; trigger 009 em `BEFORE UPDATE OF type` em vez de CHECK deferível — a mutação reversa era o vetor real. Correção de `import type` em `integration-connection.ts` para lint.
- **Descobertas que afetam tickets seguintes:** Ticket 07 chama `resolveWorkspaceByIntegrationToken`, cria o contexto/GUC com o `workspace_id` devolvido e então lê provider/versão/destino sob RLS; não aceita origem nem workspace no body. Redis Railway ainda ausente — adiável para 07/15 (`acoes-manuais-pendentes.md`).
- **Documentos emendados:** issue 06 (Comments gate), `acoes-manuais-pendentes.md` (novo), este registro; ADR novo não era necessário, pois 0007/0019 já determinam o contrato.
- **Precisa de mão humana:** Merge do PR após CI verde; provisionar Redis no Railway antes do ticket 07.

### Recuperação production migration 002 — PARCIAL

- **O que foi construído:** Recovery fail-closed generalizado para a falha exata `permission denied to create role` na migration `20260805000200_authentication_workspace_context`. O CLI de release audita ausência de `private.resolve_user_workspaces` e das policies definer, exige `marctco_private_definer` pré-criado no Supabase, marca `rolled-back` e deixa o `migrate deploy` reaplicar a 002 com `IF NOT EXISTS` no `CREATE ROLE`.
- **Arquivos-chave criados/alterados:** `packages/db/src/foundation-recovery.ts` — `decideAuthWorkspaceRecovery` e `decideMigrationRecovery`.<br>`packages/db/src/recover-foundation-cli.ts` — auditoria dos artefatos da 002.<br>`packages/db/src/foundation-recovery.test.ts` — casos foundation + auth workspace.<br>`docs/adr/0010-migrations-e-ci-cd.md` — bootstrap CREATEROLE para papéis técnicos pós-foundation.<br>`.scratch/fundacao-e-ingestao/acoes-manuais-pendentes.md` — SQL humano obrigatório.
- **Critérios de aceite:** Recovery cobre o cenário de produção documentado; aborta sem o papel; resolve quando pré-condições satisfeitas; workflow `pnpm db:recover:foundation` intacto.
- **Testes:** `foundation-recovery.test.ts` expandido; suíte local a validar no PR.
- **Branch / PR:** `ticket/04-recover-private-definer-role`; https://github.com/petzada/marctco/pull/11, CI verde (Quality, Database, CI).
- **Decisões que tomei sozinho:** Foundation recovery passa a retornar `none` (não `abort`) quando a migration unresolved não é a 001, delegando à handler da 002. Mantive o nome do script `db:recover:foundation` para não quebrar o workflow.
- **Descobertas que afetam tickets seguintes:** Qualquer migration futura que crie papel `NOLOGIN` além dos três iniciais precisará do mesmo bootstrap humano enquanto o secret de release for `marctco_migrator`. O CI não reproduz essa falha porque o Postgres efêmero usa `postgres` com `CREATEROLE`.
- **Documentos emendados:** ADR-0010, `acoes-manuais-pendentes.md`, este registro.
- **Precisa de mão humana:** 1. Executar no Supabase SQL Editor como `postgres` o `CREATE ROLE marctco_private_definer ...` documentado em `acoes-manuais-pendentes.md`. 2. Mesclar o PR de recovery e re-run do job Production migration **somente depois** do passo 1.

### Recuperação production migration 002 — GRANT private_definer — PARCIAL

- **O que foi construído:** Após o merge do PR #11, produção falhou no `GRANT marctco_private_definer TO marctco_migrator` porque só quem tem `ADMIN` no papel pode concedê-lo — `marctco_migrator` não pode reexecutar o grant na migration. A 002 passou a consultar `pg_auth_members` e pular o `GRANT` quando o membership já existe; o recovery fail-closed reconhece `permission denied to grant role`, exige o papel e o membership bootstrapados manualmente, e marca `rolled-back` antes do redeploy.
- **Arquivos-chave criados/alterados:** `packages/db/prisma/migrations/20260805000200_authentication_workspace_context/migration.sql` — `GRANT` idempotente.<br>`packages/db/src/foundation-recovery.ts` — segundo erro conhecido e `PRIVATE_DEFINER_GRANT_SQL`.<br>`packages/db/src/recover-foundation-cli.ts` — auditoria de membership migrator/definer.<br>`packages/db/src/foundation-recovery.test.ts` — casos grant role.<br>`docs/adr/0010-migrations-e-ci-cd.md` — bootstrap CREATEROLE + GRANT membership.<br>`.scratch/fundacao-e-ingestao/acoes-manuais-pendentes.md` — SQL humano do passo 2.
- **Critérios de aceite:** Recovery cobre grant role; migration pula GRANT existente; aborta sem membership; resolve quando pré-condições satisfeitas.
- **Testes:** `foundation-recovery.test.ts` 21/21; typecheck, lint e migration safety verdes localmente; CI remoto verde (Quality, Database, CI).
- **Branch / PR:** `ticket/06-recover-private-definer-grant`; https://github.com/petzada/marctco/pull/12, CI verde (Quality, Database, CI).
- **Decisões que tomei sozinho:** Para falha de grant, recovery exige membership já concedido (fail-closed) em vez de confiar só no no-op da migration — o humano precisa do passo 2 antes do redeploy.
- **Descobertas que afetam tickets seguintes:** Run 31029352341 confirma que CREATE ROLE humano + recovery do PR #11 não bastam; qualquer papel técnico `NOLOGIN` criado por `postgres` precisa também do GRANT membership manual antes do redeploy enquanto o secret de release for `marctco_migrator`.
- **Documentos emendados:** ADR-0010, `acoes-manuais-pendentes.md`, este registro.
- **Precisa de mão humana:** 1. Executar como `postgres` o `GRANT marctco_private_definer TO marctco_migrator WITH INHERIT FALSE, SET TRUE` em `acoes-manuais-pendentes.md`. 2. Mesclar o PR de recovery e re-run Production migration **somente depois** do passo 1.

### Recuperação production migration 002 — schema private — PARCIAL

- **O que foi construído:** Após o merge do PR #12, produção falhou nos `GRANT`/`CREATE FUNCTION` sobre o schema `private` porque a foundation deixou o schema owned by `postgres` e o release roda como `marctco_migrator`. A 002 passou a fazer `SET ROLE marctco_migrator` antes dos grants de schema, consultar `has_schema_privilege` para pular grants já concedidos, e o recovery fail-closed reconhece `permission denied for schema private`, exige ownership de `private` por `marctco_migrator`, e marca `rolled-back` antes do redeploy.
- **Arquivos-chave criados/alterados:** `packages/db/prisma/migrations/20260805000200_authentication_workspace_context/migration.sql` — ordem SET ROLE + grants idempotentes.<br>`packages/db/src/foundation-recovery.ts` — terceiro erro conhecido e `PRIVATE_SCHEMA_OWNER_SQL`.<br>`packages/db/src/recover-foundation-cli.ts` — auditoria de ownership do schema.<br>`packages/db/src/foundation-recovery.test.ts` — casos schema private.<br>`docs/adr/0010-migrations-e-ci-cd.md` — bootstrap ownership do schema.<br>`.scratch/fundacao-e-ingestao/acoes-manuais-pendentes.md` — SQL humano do passo 3.
- **Critérios de aceite:** Recovery cobre schema private; migration pula grants existentes; aborta sem ownership; resolve quando pré-condições satisfeitas.
- **Testes:** `foundation-recovery.test.ts` expandido; suíte local e CI a validar no PR.
- **Branch / PR:** `ticket/06-recover-private-schema-grant`; https://github.com/petzada/marctco/pull/13, CI verde (Quality, Database, CI).
- **Decisões que tomei sozinho:** Preferência A (reordenar 002 + grants idempotentes) em vez de migration corretiva 010, porque a 002 ainda não aplicou. Ownership humano via `ALTER SCHEMA` é inevitável enquanto a foundation applied não puder ser reeditada.
- **Descobertas que afetam tickets seguintes:** Run 31029997919 confirma três bootstraps humanos encadeados para a 002 em Supabase gerenciado: CREATE ROLE, GRANT membership, ALTER SCHEMA OWNER. Migrations futuras que manipulem o schema `private` assumem `marctco_migrator` como owner após o passo 3.
- **Documentos emendados:** ADR-0010, `acoes-manuais-pendentes.md`, este registro.
- **Precisa de mão humana:** 1. Executar como `postgres` o `ALTER SCHEMA private OWNER TO marctco_migrator` em `acoes-manuais-pendentes.md` (passos 1–2 já feitos nos PRs #11/#12). 2. Mesclar o PR de recovery e re-run Production migration **somente depois** do passo 3.

### Gate do ticket 06 — FECHADO (2026-08-05)

- **Evidência Production migration:** https://github.com/petzada/marctco/actions/runs/31031305105 — Quality, Database, CI e Production migration verdes. Aplicadas em produção: `002` … `009`. `prisma migrate status`: **Database schema is up to date!** (9/9).
- **Checklist do gate:** 7/7 — encoding OK; teste mutação reversa; `pnpm test:db` 54/54; Standards+Spec 0/0 com 009; registro com Ticket 04 e 009; PR #10 + recoveries #11/#12/#13 mergeados; `origin/main` reflete o código.
- **Próximo:** ticket **17** (provisionamento). Ordem restante: `17 → 07 → 08 → 09 → (10·11·13·16) → 12·14 → 15`.
- Handoff de contexto em 2026-08-05 → ver `PROMPT-HANDOFF.md`.

## Ticket 17 — Provisionamento de workspace — CONCLUÍDO

- **O que foi construído:** O caminho pelo qual um workspace passa a existir. `private.provision_workspace(owner_user_id, workspace_name, default_pipeline)` cria tenant, vínculo `OWNER`, funil comercial `is_default` e suas etapas numa transação só — ou nasce inteiro e válido, ou não nasce. É a terceira operação sem contexto de tenant (ADR-0006 regra 9, ADR-0019) e roda sob executor técnico **próprio**, `marctco_provisioner`: `marctco_private_definer` é dono dos dois resolvedores somente-leitura e ganhar `INSERT` em `workspaces` transformaria duas leituras pré-tenant em caminhos de escrita — contenção que o Seam 3 não conseguiria provar igual (ADR-0019 §2 permite executor novo exatamente aí). A definição do funil viaja como argumento `jsonb`, então `packages/domain` continua sendo a cópia única compartilhada com o `db seed`. No web, `/onboarding` decide entre associação existente, direito de provisionar e espera; `POST /onboarding/provision` gasta o direito e cria o workspace; o usuário termina no `slug` recém-criado.
- **Arquivos-chave criados/alterados:** migration `20260806000100_provision_workspace`.<br>`packages/db/src/provision-workspace.ts` + teste; `packages/db/src/index.ts`; `packages/db/tests/rls.test.ts` (10 provas novas).<br>`apps/web/lib/provisioning-entitlement.ts`, `onboarding-decision.ts`, `audit-hash.ts`, `supabase/admin.ts`, `supabase/server.ts` (`getAuthenticatedSession`) — todos com teste.<br>`apps/web/app/onboarding/page.tsx` e `app/onboarding/provision/route.ts` + teste.<br>`docs/adr/0019` (emenda do executor e da fronteira do `service_role`), `docs/adr/0010` (emenda do bootstrap anunciado), `.env.example`, `vitest.config.ts`.
- **Critérios de aceite:** 12 de 13. Fica desmarcado o **Seam 2 completo**: a metade do banco está provada (workspace nasce com exatamente um funil comercial `is_default`, com `ENTRY` e `CLOSING`, num commit só), mas o `POST` de lead só existe a partir do ticket 07.
- **Testes:** banco recriado do zero (`db:down` → `db:up` → `migrate deploy` 10/10) e `migrate dev` + `db:drift` sem diferença; `pnpm test` **122/122** nos quatro projetos (db 83, unit 38 incluindo os 6 do route handler, a7 5, managed-migration 1); `check:migrations`, lint, typecheck e build verdes. O Seam 3 prova: função na lista fechada, owner/`search_path`/`EXECUTE` só do app, executor `NOLOGIN` sem bypass e não assumível por app/worker, superfície de escrita mínima (nada de `UPDATE`/`DELETE`, nada de `integration_connections`), policy por comando só em tabela que a função escreve, e o `marctco_private_definer` continuando sem `INSERT`. Prova também comportamento: commit único, duas abas em paralelo devolvendo o mesmo workspace, colaborador com vínculo não ganhando workspace novo, e definição inválida não deixando nada para trás.
- **Self-review (`/code-review`, Standards + Spec):** achados corrigidos — direito passa a ser gasto **antes** do provisionamento (era depois, com falha engolida: um direito que sobrevivesse ao provisionamento reabria justamente o buraco do ex-colaborador); formulário de nome removido (era escopo do wizard, que está fora do ticket) e o nome passou a vir da marcação; limiter em memória aplicado às tentativas sem direito (ADR-0019 §4); `hashIdentifier` extraído para `audit-hash.ts` em vez de duplicado; `GRANT CREATE ON SCHEMA private` com guarda `has_schema_privilege` como na 002; query param `?error=configuration` em inglês (ADR-0005); teste do route handler cobrindo negação, redirect e falha de configuração. **Aceitos com motivo:** o `pg_advisory_xact_lock` continua no lugar de constraint + `ON CONFLICT` — a condição é "este usuário não tem vínculo nenhum", que nenhum índice único expressa sem proibir associação múltipla, então o banco arbitra por lock; e o `app.workspace_id` fixado dentro da função sobrevive até o `COMMIT` por desenho, porque é lá que as invariantes diferidas rodam.
- **Branch / PR:** `ticket/17-provisionamento-de-workspace`; PR a abrir.
- **Decisões que tomei sozinho:** Executor técnico novo em vez de reusar `marctco_private_definer`. Retorno da função limitado a `workspace_id` (ADR-0019) — o `slug` do redirect vem de `resolve_user_workspaces`, então a URL que o usuário alcança é sempre uma que o vínculo dele justifica. Direito gasto antes de criar: se o workspace falhar depois, a marcação precisa ser refeita — é o lado seguro da troca, e o log diz `right_spent_without_workspace`. Nome obrigatório na marcação.
- **Descobertas que afetam tickets seguintes:** `provisionWorkspace` não pode ser chamado dentro de outra transação — a função fixa `app.workspace_id` no workspace criado e esse escopo dura até o commit para o qual foi escrito. Gatilho `CONSTRAINT TRIGGER` diferido roda no `COMMIT` **fora** do contexto `SECURITY DEFINER`, sob as policies do papel chamador: qualquer função privada futura que insira em tabela com invariante diferida precisa do mesmo cuidado. Papel técnico `NOLOGIN` novo continua exigindo bootstrap humano enquanto o release rodar como `marctco_migrator`; a migration falha de propósito, antes de qualquer DDL, com o SQL exato. `getAuthenticatedSession` é o caminho para claims verificadas; direito só de `app_metadata`. O ticket 07 herda o workspace provisionado como destino real de lead: funil `is_default` com `ENTRY` já existe no primeiro acesso.
- **Documentos emendados:** issue 17, ADR-0019, ADR-0010, `acoes-manuais-pendentes.md`, `.env.example`, este registro.
- **Precisa de mão humana:** 1. **Antes de mesclar** — `CREATE ROLE marctco_provisioner …` + `GRANT marctco_provisioner TO marctco_migrator WITH INHERIT FALSE, SET TRUE` no SQL Editor do Supabase como `postgres`. 2. `SUPABASE_SERVICE_ROLE_KEY` no serviço `web` do Railway. 3. Por cliente novo: marcar `app_metadata` com `can_provision_workspace` **e** `workspace_name`. Tudo em `acoes-manuais-pendentes.md`.

## Ticket 07 — Endpoint persiste outbox e dispatcher enfileira — CONCLUÍDO

- **O que foi construído:** O encanamento da ingestão, sem interpretar payload. `POST /v1/integrations/pluga/leads` resolve o token, grava o `IntegrationEvent` (payload cru + despacho `PENDING`) e só então responde **200 `{"status":"accepted"}`** — nunca 202, nunca 409. O handler não conhece Redis. Um dispatcher independente, no processo web, lê pendências de todos os workspaces por `private.claim_pending_events`, publica no BullMQ com `jobId` derivado do `IntegrationEvent.id` e **só depois** marca `DISPATCHED`. O worker consome o job, lê o evento sob RLS com o `workspace_id` que o handler autenticado pôs no job, e marca `PROCESSED`.
- **Arquivos-chave criados/alterados:** migration `20260806000200_integration_events` (tabela outbox, enums `integration_event_status`/`integration_event_dispatch_status`, RLS, `private.claim_pending_events`), `packages/db/prisma/schema.prisma`.<br>`packages/db/src/integration-event.ts` (gravar, claim, despachar, ler sob RLS, concluir, listar) e `integration-connection-operations.ts` (`createIntegrationConnection`).<br>`packages/domain/src/ingestion-jobs.ts` + teste; `telemetry.ts` passa a preservar `error_message`/`error_stack`.<br>`apps/web/app/v1/integrations/pluga/leads/route.ts` + teste, `lib/integration-token.ts` + teste, `lib/ingestion-dispatcher.ts` + teste, `lib/ingestion-queue.ts`, `instrumentation.ts`.<br>`apps/worker/src/integration-event-job.ts` + teste e `main.ts` (Worker BullMQ).<br>`tests/seam2-ingestion.test.ts` (novo projeto vitest `seam2`), `vitest.config.ts`, `.github/workflows/ci.yml`, `packages/db/tests/rls.test.ts`, `packages/db/tests/managed-migration.test.ts`.
- **Critérios de aceite:** 18 de 18.
- **Testes:** `pnpm test` **162/162** nos cinco projetos (unit, db 87, seam2 10, a7 5, managed-migration 1); migration limpa do zero, `migrate dev` + `db:drift` sem diferença, `check:migrations`, lint, typecheck e build verdes. O **Seam 2** roda com Postgres, Redis e BullMQ reais — publica, consome por Worker de verdade e prova: commit antes do 200, `workspace_id` do corpo ignorado, retransmissão recebendo 200, job carregando só identificadores, fila fora do ar mantendo o evento pendente e publicando depois, e job de outro workspace falhando alto. O **Seam 3** ganhou `integration_events` na varredura de isolamento e três provas novas: o claim devolvendo exatamente `(id, workspace_id)`, o dono/`search_path`/`EXECUTE` da função, e o executor `marctco_private_definer` continuando **sem nenhuma escrita** em nenhuma tabela.
- **Self-review (`/code-review`, Standards + Spec):** achados corrigidos — `markIntegrationEventDispatched` ignorava a contagem de linhas, então um despacho que não tocasse linha nenhuma virava sucesso e o evento seria republicado a cada passada para sempre (agora falha, simétrico ao `markProcessed`); os enums do evento eram digitados à mão e passaram a ser re-exportados do Prisma, como os vizinhos; `IntegrationEvent.status`, `received_at`, `dispatched_at`, `processed_at` e `integration_connection_id` ganharam linha na tabela canônica do ADR-0005; `claimed`, `dispatched` e `job_id` não passavam pelo `sanitizeTelemetry` — os logs do dispatcher diziam só `event` e `result`; o limiter do 401 usava o escopo `LANDING_PAGE_TOKEN` com hash de IP no campo `token_hash`, e passou a usar `AUTH_FAILURE` com `ip_address`; `requestIp` e `assertUuid` estavam duplicados e viraram `apps/web/lib/request-ip.ts` e `packages/db/src/internal/uuid.ts` (as cinco cópias dentro de `packages/db` foram convertidas); `dispatchIntervalMs` saiu do timer para ser função pura testável; o retorno do processador de job passou a ser usado no log de `completed`. **Duas correções de fundo:** a conexão do produtor BullMQ deixou de usar `maxRetriesPerRequest: null` — com ele, Redis fora do ar **pendura** o `add` em vez de recusar, ou seja, o teste de "fila indisponível" não exercitava o comportamento de produção; e o executor sem tenant passou a ter **grant por coluna** (`id, workspace_id, dispatch_status, received_at`) em vez de `SELECT` na tabela, de modo que `raw` — que carrega CPF e telefone — fica fora do alcance de uma função que roda sem workspace nenhum. O `sanitizeTelemetry` também passou a cortar a mensagem de erro no ponto em que o Postgres ecoa a linha ofensora (`DETAIL:`, `Key (`), porque para um evento de ingestão essa linha **é** o payload. O `listIntegrationEvents` nasceu sem cursor: o ADR-0016 fixa a assinatura `(ctx, cursor)` e o ADR-0013 exige keyset, então ganhou o cursor `(received_at, id)`, o índice correspondente e uma prova de que um lead chegando no meio da leitura não repete nem esconde linha.
- **Provas acrescentadas depois do review:** papel `marctco_worker` lendo `integration_events` só com GUC e incapaz de fechar evento de outro tenant; `raw` inacessível ao executor sem tenant (`has_column_privilege`); intervalo de varredura recusando valor absurdo; paginação keyset no Seam 2. O caso de timeout do A7 (`migrate diff` sobe um processo Prisma) recebeu prazo explícito de 20s — ele falhava por lentidão, não por drift.
- **Branch / PR:** `ticket/07-endpoint-recebe-e-enfileira`, empilhada sobre `ticket/17-provisionamento-de-workspace` (o 17 ainda não foi mesclado).
- **Decisões que tomei sozinho:** O dispatcher vive no processo **web**, porque `claim_pending_events` é executável só por `marctco_app` e o worker não tem `USAGE` no schema `private`; o ADR-0019 já dizia "chamador autorizado: app". Reusei `marctco_private_definer` como executor do claim em vez de criar um quinto papel — ele ganha apenas `SELECT` em `integration_events`, e o Seam 3 prova a mesma contenção (nenhuma escrita em lugar nenhum), que é a condição que o ADR-0019 exige para reuso. Sem `FOR UPDATE SKIP LOCKED` no claim: o lock morreria no fim da transação da função, e a marcação só pode acontecer depois da confirmação do BullMQ, fora de transação — o `jobId` determinístico já torna publicação dupla inofensiva. `createIntegrationConnection` e `listIntegrationEvents` nasceram aqui porque a fronteira do Prisma proíbe SQL cru fora de `packages/db`, e sem elas o Seam 2 não teria como criar conexão nem observar a outbox; o ticket 14 herda as duas. Troquei a contagem fixa de tabelas do `managed-migration` por "nenhuma tabela de negócio fora do migrator" — o número precisava ser editado a cada ticket que criasse tabela.
- **Descobertas que afetam tickets seguintes:** **Conexão de produtor e de Worker do BullMQ pedem opções opostas:** o Worker precisa de `maxRetriesPerRequest: null`, o produtor **não pode** tê-lo — com ele, Redis fora do ar pendura o `add` em vez de recusar, e a passada nunca termina. **BullMQ recusa `:` em `jobId`** — o separador é `-`, e `integrationEventJobId` é o único lugar que decide isso. O `sanitizeTelemetry` engolia silenciosamente todo campo `error`: agora extrai `error_message`/`error_stack`, e é assim que qualquer log de falha vira diagnosticável. `recordIntegrationEvent` relê a `IntegrationConnection` **dentro** da transação com GUC, então conexão desativada entre a resolução do token e a gravação não escreve evento. O ticket 08 recebe `readIntegrationEventForProcessing(context)` devolvendo `raw` já sob RLS, e `processIntegrationEventJob` é o ponto onde a interpretação entra. O ticket 15 herda o dispatcher (`dispatchPendingIntegrationEvents`) e o botão de reprocessar volta a marcar `PENDING`. O projeto vitest `seam2` roda no job `database` do CI, com Redis real.
- **Documentos emendados:** issue 07, `acoes-manuais-pendentes.md` (Redis do Railway resolvido), este registro.
- **Precisa de mão humana:** `REDIS_URL` no serviço `web` do Railway além do `worker` — o dispatcher roda no web. Merge do PR do ticket 17 antes deste, que está empilhado sobre ele.

## Ticket 08 — Contrato v1 normaliza e resolve Pessoa — CONCLUÍDO no seu escopo, com dois critérios carregados para o 09

- **O que foi construído:** O módulo `intake` de `packages/domain` e o schema de Pessoa. O contrato canônico `v1` passa a existir como schema Zod com tipo inferido: `readLeadPayload` lê o payload de forma tolerante e **nunca lança**, `connectV1` (em `apps/worker`) decide a origem e sintetiza `external_lead_id` a partir do `IntegrationEvent.id`, `normalize()` produz o `NormalizedLead` — telefone em E.164 com Brasil como padrão, CPF só dígitos com DV conferido, e-mail minúsculo, parcela em decimal com o texto original ao lado —, `planPersonLookup` diz **quais chaves buscar e com que força**, `findPersonCandidates(ctx, plan)` executa a busca sob RLS aceitando `UserContext` **ou** `JobContext`, e `decidePersonIdentity` arbitra. O worker roda a sequência inteira; a escrita é do ticket 09.
- **Arquivos-chave criados/alterados:** migration `20260807000100_persons_and_contacts` (`persons`, `person_phones`, `person_emails`, RLS + FORCE + policy nas três, FKs compostas intra-tenant, `merged_into_person_id`, `CHECK` de E.164/minúsculas/11 dígitos/auto-referência) e `packages/db/prisma/schema.prisma`.<br>`packages/domain/src/intake/`: `inbound-lead.ts`, `normalize.ts`, `phone.ts`, `cpf.ts`, `email.ts`, `money.ts`, `person-lookup.ts`, `person-identity.ts`, cada um com teste.<br>`packages/db/src/person.ts` (`findPersonCandidates`) e `packages/db/tests/person-candidates.test.ts`; `integration-event.ts` passa a devolver o `provider` da conexão.<br>`apps/worker/src/connector-v1.ts` + teste; `integration-event-job.ts` + teste.<br>`packages/db/tests/rls.test.ts`, `vitest.config.ts`, `CONTEXT.md`, `docs/adr/0005-idioma-codigo-en-ui-pt-br.md`.
- **Dependências novas:** `zod` e `libphonenumber-js` em `packages/domain` — ambas puras, ambas já travadas em `stack-recomendada.md`. O import é `libphonenumber-js/max`, não o pacote padrão: só a metadata completa carrega o *tipo* do número, e com a `min` o `getType()` devolve `undefined` sempre, o que transformaria a recusa de 0800 num no-op silencioso.
- **Critérios de aceite:** 16 de 18. Os dois desmarcados exigem escrita (`IntakeReview(IDENTITY_CONFLICT)` pendura numa Oportunidade, e "nenhum contato é sobrescrito" se fecha com o `INSERT … ON CONFLICT DO NOTHING` de `applyIntakePlan`), e ambos estão decididos e impossibilitados aqui — **quem fecha: 09**. Cada um tem o motivo escrito ao lado no arquivo do ticket, como o ticket 03 recebeu.
- **Testes:** `pnpm test` **278 passando, 1 pulado** (era 128 no fim do ticket 17 e 162 no 07). Seam 1 novo: 83 testes puros no módulo `intake`, cobrindo borda de telefone brasileiro, DV de CPF, caixa de e-mail, moeda em formato BR e US, tolerância do contrato, e as quatro variantes da decisão de identidade. Seam 3: as três tabelas novas entraram na matriz de isolamento (47 testes) e `person-candidates.test.ts` (15 testes) prova a busca sob o papel `marctco_app` real — por CPF, por qualquer um dos telefones, por e-mail, o CPF da candidata devolvido junto, duas candidatas quando as chaves discordam, Pessoa mesclada nunca devolvida, workspace vizinho com chaves idênticas invisível, e `JobContext` aceito. Migration limpa do zero, `db:drift` sem diferença, `check:migrations`, lint, typecheck verdes.
- **Correção de fundo — a varredura de lápide do Seam 3 estava furada para FK composta.** Ela pareava as colunas de uma FK juntando `key_column_usage` com `constraint_column_usage` pelo nome da constraint, o que para uma FK de duas colunas produz o **produto cartesiano**: com `person_phones (workspace_id, person_id) → persons (workspace_id, id)`, a varredura inventava um join `workspace_id = workspace_id` e contaria todo contato de um workspace que meramente *contém* uma Pessoa mesclada como violação do invariante. Reescrita em `pg_catalog`, com `unnest(conkey, confkey) WITH ORDINALITY` — que é o único pareamento que de fato é a constraint — e o join agora usa **todas** as colunas do par. A tabela-sonda continua, agora ao lado da lápide real de `persons`, porque é ela que prova que a varredura acha uma violação em vez de passar por não ter o que checar. O `Opportunity.merged_into_opportunity_id` do ticket 09 entra sem nenhuma edição.
- **Decisões que tomei sozinho:** **O schema do contrato `v1` ficou em `packages/domain`, o conector em `apps/worker`.** O ADR-0017 exige que o formulário de "completar e liberar" produza um `InboundLead` **sem** importar o worker; se o tipo morasse no worker, o defeito que aquele ADR conserta reapareceria um nível abaixo. O que o conector faz e o domínio não é conhecer a forma da origem, decidir `source` pela conexão e sintetizar `external_lead_id`. **`PersonDecision` é união discriminada de quatro variantes**, e não um resultado com `candidate_person_ids` opcional: a variante do conflito não pode ser gravada sem olhar as candidatas que carrega, que é o que impede o `IntakeReview` de ser a coisa que alguém esquece. **`persons.cpf` é `text`, não `char(11)`** — bpchar preenche com espaço na leitura, e uma chave de busca que deixa de ser igual a si mesma fora do banco não é chave. **O ponteiro de mesclagem é `NO ACTION`, não `RESTRICT`** — apagar um workspace remove lápide e canônica no mesmo comando em cascata, e `RESTRICT` é verificado por linha enquanto `NO ACTION` é verificado no fim; com `RESTRICT` a cascata falha contra si mesma. **Sem índice único em `persons.cpf`**: sob conflito de identidade duas linhas carregam o mesmo CPF até um humano mesclar, e uma constraint ali transformaria "duplicata visível" em "lead recusado". **O contrato aceita `phone`/`phones` e `email`/`emails`** — o plural é o publicado, o singular é o que quem mapeia uma pergunta de formulário Meta escreve primeiro, e recusar custaria um lead para ensinar uma lição sobre plural. **Um telefone brasileiro sem DDD é recusado**: ele parseia como um fixo válido em outro estado, e gravar um número que atende um estranho é pior que marcar o lead como sem telefone.
- **Divergência resolvida por precedência:** o critério do ticket diz "sem nenhuma das **três** chaves não cria Pessoa", o que faria um envio só com CPF criar uma. O ADR-0007 diz duas vezes que quarentena é "sem telefone **e** sem e-mail" e que sair dela "exige ao menos um contato", porque uma `Person` sem contato "nunca casará com nada". O ADR vence (degrau 1). `decidePersonIdentity` devolve `NO_CONTACT` mesmo com CPF válido presente, e o teste tem esse nome. Registrado nos Comments da issue.
- **Descobertas que afetam tickets seguintes:** **Ticket 09** — `readIntegrationEventForProcessing` já devolve o `provider` da conexão por `JOIN` na mesma transação sob RLS; o `target_pipeline_id` de que o 09 precisa cabe no mesmo `SELECT`. `processIntegrationEventJob` devolve `person_decision`, e o 09 troca esse retorno pelo `IntakePlan` sem mover nada do que já está lá. `PersonContacts` é o conjunto **completo** do envio, nunca um delta — a não-sobrescrita é da constraint, não da decisão. **Ticket 13** — `PROVIDER_DEFAULT_SOURCE` mapeia `PLUGA → META_LEAD_ADS` porque é o único destino Pluga desta fatia; o Google precisa declarar `source` no payload, senão entra rotulado como Meta. **Ticket 14** — o modelo copiável precisa incluir `source`, pelo mesmo motivo, e o formulário de liberação chama `buildInboundLead` direto, sem conector. **Ticket 10** — `NO_CONTACT` é exatamente o gatilho de quarentena, já decidido e já testado. **Todos** — `NormalizationDiagnostic` carrega `{ field, reason }` e nenhum valor, e há um teste que serializa os diagnósticos e verifica que nem CPF nem e-mail aparecem lá dentro.
- **Documentos emendados:** issue 08 (Status, critérios, Nota de escopo, Comments), `CONTEXT.md` (quatro termos novos em PT-BR), `docs/adr/0005-idioma-codigo-en-ui-pt-br.md` (oito linhas novas na tabela canônica), este registro.
- **Self-review (`/code-review`, Standards + Spec):** achados corrigidos. **O pior deles, e o mais fácil de não ver:** `processIntegrationEventJob` devolvia o `PersonDecision` inteiro, e `main.ts` devolve o resultado do processador direto ao BullMQ — que **guarda o valor de retorno em Redis** como `returnvalue` do job. Isso punha nome, telefones, e-mails e CPF da submissão fora do Postgres, fora da RLS e fora da expiração de 90 dias: uma segunda cópia do payload contra o ADR-0014, por uma conveniência que ninguém usava, já que o único consumidor da decisão é a linha seguinte da mesma função. Agora devolve `person_decision_kind` — uma das quatro strings da união — e há um teste que serializa o retorno e verifica que nenhum dado pessoal aparece nele. **Segundo achado de fundo:** uma Pessoa única encontrada **só** por e-mail virava `NEW_PERSON_WITH_IDENTITY_CONFLICT`. O ADR-0007 condiciona o `IDENTITY_CONFLICT` a "quando as chaves apontam para Pessoas **diferentes**", e uma chave apontando para uma Pessoa não é isso — do e-mail o ADR exige só que "não autorize fusão automática", que `NEW_PERSON` já cumpre. Como estava, todo `contato@empresa.com.br` e todo e-mail de família fabricava uma revisão, contra o próprio aviso do ADR de que alerta que não se resolve mata o sinal dos vizinhos. Corrigido, com teste nomeado.
- **Demais achados corrigidos:** a tabela de sinônimos de `financing_type` mapeava CARRO, CASA, EMPRESTIMO e **CONSIGNADO** — decisões de produto tomadas dentro de um `Map`, sem fonte, e consignado não é empréstimo pessoal para quem vende os dois; ficou só o valor canônico mais o termo PT-BR que o próprio glossário usa, e o resto vira diagnóstico. Um 0800 era diagnosticado como `NOT_A_PHONE`, o que manda o gestor procurar um erro de digitação num número perfeitamente válido; `readPhone` agora distingue `NOT_A_PERSONAL_PHONE` (a recusa continua — o marcador significa "não dá para ligar"). A regra de força das chaves estava escrita duas vezes, em `planPersonLookup` e de novo à mão na arbitragem; virou `PERSON_LOOKUP_STRENGTH_BY_KIND`, lida pelas duas metades. `findPersonCandidates` repetia os três predicados no `SELECT` e no `WHERE`, e — pior — partia de `persons` testando linha a linha, fazendo a leitura mais quente da ingestão crescer com o tamanho da carteira em vez de com o número de chaves do envio; reescrita para partir das buscas indexadas por valor e alcançar `persons` por id, com o plano conferido no `EXPLAIN`. `normalizeContacts` recebia cinco argumentos e empurrava num array do chamador; devolve `{ values, diagnostics }`. `connectV1` virou `connectLeadSource`, que é o nome que o ADR-0005 já dá ao conceito. Consts privadas de `inbound-lead.ts` passaram para camelCase, como as vizinhas. `PersonDecision`, `NormalizationDiagnostic` e `PersonContacts` ganharam termo em PT-BR no `CONTEXT.md` antes da linha na tabela do ADR-0005 — que é a ordem que a regra 4 daquele ADR exige e que eu tinha invertido.
- **Requisito que ia evaporar entre dois tickets:** o review do eixo Spec notou que eu adiei o `IntakeReview(IDENTITY_CONFLICT)` para o 09 — mas **nenhum critério do 09 o mencionava**, só o `POSSIBLE_DUPLICATE`. O mesmo valia para `Opportunity.missing_phone`, que está na tabela de schema da spec e em critério de ticket nenhum (nem 09, nem 10, nem 11). Os três viraram critérios explícitos do ticket 09, marcados como carregados do 08.
- **Testes depois do review:** **285 passando, 1 pulado** (eram 278).
- **Branch:** `ticket/08-contrato-v1-normaliza-e-resolve-pessoa`, a partir de `main`.
- **Precisa de mão humana:** Nada. A migration `20260807000100_persons_and_contacts` não cria papel nem toca o schema `private`, então roda como `marctco_migrator` sem bootstrap.

### Recuperação do build Docker — deploy parado desde o ticket 06

- **O sintoma:** o deploy do Railway falhava desde **2026-08-05 17:42**, e ninguém tinha visto. Produção rodava `26a7843` (era do ticket 03) enquanto o banco já tinha avançado 12 migrations. Os tickets **06, 07, 17 e 08 nunca subiram** — as migrations sobem pelo job de release do GitHub, que é independente do Railway, então o schema andou e o código não.

| Deploy | Commit | Resultado |
|---|---|---|
| 2026-08-07 | `7253d7c` ticket 08 | FAILED |
| 2026-08-07 | `ec55493` ticket 07 | FAILED |
| 2026-08-06 | `d5b0e7a` ticket 17 | FAILED |
| 2026-08-05 | `8abe548` ticket 06 | FAILED |
| 2026-08-05 | `26a7843` ticket 03 | SUCCESS ← o que estava no ar |

- **A causa:** `error TS5058: The specified path does not exist: 'tsconfig.build.json'`. O `postinstall` da raiz passou a rodar `pnpm --filter @marctco/domain build` no commit `8fd7969` (tickets 04–06). Os dois Dockerfiles rodam `pnpm install --frozen-lockfile` num ponto em que só os `package.json` foram copiados — o `tsconfig.build.json` e o `src/` de `packages/domain` só entram três linhas depois. O `postinstall` falha, o install falha, o build falha. Os Dockerfiles não mudavam desde o ticket 01, quando o `postinstall` era só `prisma generate` e funcionava com o `packages/db/prisma` já copiado.
- **Por que o CI não pegou:** o CI roda `pnpm install` num checkout completo, onde o arquivo existe. Nada no pipeline construía a imagem. **Essa é a lição desta recuperação:** um CI verde não dizia nada sobre a entrega, e o único sinal de que quatro tickets não estavam em produção era o painel do Railway, que ninguém abria.
- **A correção:** `COPY packages/domain packages/domain` **antes** do install, nos dois Dockerfiles. O custo é que mudança em `packages/domain` invalida a camada de dependência; é a troca certa, porque o pacote é pequeno e muda menos que `apps/web`, e a alternativa (`--ignore-scripts`) puliria também os scripts de ciclo de vida que esbuild, sharp e os engines do Prisma precisam.
- **Segundo defeito, esse introduzido pelo ticket 08:** `packages/domain` não tinha dependência nenhuma até o contrato `v1` trazer `zod` e `libphonenumber-js`. O runtime stage do web nunca copiou `packages/domain/node_modules` — não havia o que copiar. Com as dependências novas, `packages/domain/dist/index.js` não resolvia os próprios imports, e o container morria no boot com `Cannot find package 'zod'`. O worker tinha o mesmo buraco.
- **Por que a correção do web não foi simétrica à do worker:** o worker já copiava `/app/node_modules` inteiro, então bastou acrescentar o `node_modules` do pacote. O web só tinha o `node_modules` que o *file tracing* do Next produz, que não inclui o `.pnpm` — copiar só o `node_modules` do pacote deixaria **symlinks pendurados**, que é pior que diretório ausente: parece instalado e quebra na primeira requisição em vez de no boot. O web passou a copiar `/app/node_modules` também.
- **Erro meu no meio do caminho, registrado porque a conclusão errada era plausível:** eu tinha concluído, por `grep` no `apps/web/dist` e nos chunks do Next, que o web não carregava `packages/domain/dist` em runtime — o Next empacota o pacote nos próprios chunks, e o `libphonenumber` sai no tree-shaking do web porque quem normaliza é o worker. Estava errado: a `instrumentation` roda **fora** dos chunks e importa o pacote pelo `exports.default`. Só descobri porque subi o container em vez de confiar na leitura estática. **Build passar não é o mesmo que o processo subir**, e foi exatamente essa confusão que deixou o deploy quebrado por dois dias.
- **Como foi verificado:** `docker build` dos dois Dockerfiles; `docker run` do worker executando a pipeline inteira dentro do container (`readLeadPayload → normalize → planPersonLookup → decidePersonIdentity`, com telefone saindo em E.164 e o plano com as três forças); `docker run` do web subindo e respondendo `/health` com **200 `{"status":"ok"}`**, que é o mesmo healthcheck que o Railway usa. `pnpm test` 285/285, lint verde.
- **Pendência aceita, não bloqueante:** a imagem do web ficou em **1.49 GB** (a do worker é 1.3 GB, e já era assim). O `/app/node_modules` copiado inclui devDependencies. Um `pnpm prune --prod` antes do runtime stage, ou um `pnpm deploy`, resolveria — deliberadamente **não** foi feito agora para não arriscar reabrir um deploy que está parado há dois dias por uma otimização de tamanho. Fica como item próprio.
- **O que este merge coloca em produção:** os tickets **06, 07, 17 e 08 de uma vez**. As migrations correspondentes já estão aplicadas, então o código sobe para um schema que já o espera — mas é a primeira vez que quatro fatias sobem juntas, e vale acompanhar o primeiro deploy.
- **Precisa de mão humana:** acompanhar o deploy no Railway depois do merge, e conferir `/health` do web e `worker ready` nos logs do worker.

### Deploy restabelecido e imagem virou gate de CI — 2026-08-07

- **Deploy verde.** `6ff4724` ativo nos serviços `web` e `worker`; `/health` de produção responde 200 e o worker registra `worker ready`. É o primeiro `SUCCESS` desde 2026-08-05, e coloca os tickets **06, 07, 17 e 08** em produção de uma vez, sobre um schema que já os esperava (12/12 migrations).
- **A imagem virou gate.** Job `Image` no CI, matriz `web`/`worker`, com cache do buildx por escopo, e o gate `CI` passou a exigir o resultado dele além de `Quality` e `Database`. O job não só constrói: **executa** o container e roda `readLeadPayload → normalize` dentro dele, conferindo que o telefone sai `+5511987654321`. As duas metades são deliberadas — `pnpm install` num checkout completo não é o install que o Dockerfile roda (foi assim que a ordem de `COPY` quebrou o deploy por dois dias com o CI verde), e build que passa não é processo que sobe (foi assim que o `node_modules` ausente do `packages/domain` passou pelo meu próprio `docker build` local).
- **Tentativa que não vingou, registrada para ninguém repetir:** `pnpm prune --prod` antes do runtime stage, para tirar as devDependencies da imagem. Ele **recusa rodar sem TTY** — `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` — porque **remove e reinstala** o diretório de módulos inteiro. Com `CI=true` ele prosseguiria e levaria junto o client do Prisma gerado duas linhas acima, e essa falha só apareceria na primeira query em produção. Revertido; ficou comentário nos dois Dockerfiles e item aberto apontando para `pnpm deploy --filter … --prod`, que monta árvore auto-contida e merece passada de teste própria. **A imagem em ~1.5 GB é conhecida e aceita**; não se arrisca reabrir um deploy recém-restabelecido por otimização de tamanho.
- **Descoberta ao conferir o deploy: `REDIS_URL` falta nos DOIS serviços.** O item antigo do ticket 07 dizia "falta no `web`"; o log do worker em produção diz `REDIS_URL is absent; integration events will not be consumed`, e `railway variables --service web` também não a tem. A ingestão está **meio viva**: o endpoint aceita lead e grava a outbox — nada se perde, é o desenho do ADR-0007 —, mas nada é despachado nem consumido. Promovido a bloqueante no topo de `acoes-manuais-pendentes.md`, com o teste de ponta a ponta que deve seguir as duas variáveis.
- **Branches apagadas:** `ticket/08-contrato-v1-normaliza-e-resolve-pessoa` e `recovery/docker-build-postinstall-order`, local e remoto, agora que o código está em produção.
- **Precisa de mão humana:** as duas `REDIS_URL`, e o lead de teste depois delas.

### Fila ligada em produção — 2026-08-07

- **`REDIS_URL` setada nos dois serviços, por referência (`${{Redis.REDIS_URL}}`) e não por valor colado.** Estava ausente em ambos, não só no `web` como o item antigo registrava. O worker parou de logar `REDIS_URL is absent; integration events will not be consumed` e passou a dizer só `worker ready`, sem nenhum `ECONNREFUSED`/`ENOTFOUND` depois de dois minutos no ar; o web registrou `integration_event_dispatch result="started"`, que só acontece depois de `createIngestionQueue()`, a função que lança quando a variável falta.
- **Não foi preciso mexer no código por causa de IPv6.** A rede privada do Railway é IPv6-only e o padrão histórico do ioredis era `family: 4`, o que quebraria a conexão com `redis.railway.internal`. Fui conferir antes de escrever a correção: o **ioredis 5.9.3 já vem com `family: 0`**. Fica registrado porque a suspeita era razoável e alguém vai ter de novo — e porque volta a valer se a versão do ioredis for fixada para baixo.
- **O que está provado e o que não está.** Provado: o worker **conecta** no Redis, e o dispatcher **sobe**. Não provado: o caminho de publicação, porque o dispatcher só fala com o Redis quando há evento pendente, e não há lead nenhum em produção. O `POST → outbox → dispatcher → BullMQ → worker → Person` ponta a ponta continua pendente e depende de um workspace provisionado, que depende da marcação em `app_metadata`.
- **Precisa de mão humana:** marcar um usuário apto no Supabase para provisionar o primeiro workspace, e então o lead de teste.

### Login em produção — variáveis públicas do Supabase — 2026-08-07

- **O sintoma que ainda não tinha aparecido:** `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` não existiam no serviço `web`. Isso derrubava `createSupabaseServerClient()` e, com ele, toda rota autenticada antes de chegar ao `/onboarding` — e também `createSupabaseAdminClient()`, que exige a URL além da service role key, que é exatamente o `right_not_consumed` visto no teste local do ticket 17.
- **Setar a variável não bastava.** `NEXT_PUBLIC_*` é inlinado pelo Next **no build**, não lido do ambiente em runtime, e `login-form.tsx` é client component. Sem `ARG`/`ENV` no `apps/web/Dockerfile`, o `next build` dentro da imagem não enxerga as variáveis do serviço e o bundle do browser sai com string vazia. Como `createSupabaseBrowserClient()` é chamado dentro do `onSubmit`, e não no corpo do componente, **o build nunca quebrou** — o erro só apareceria quando alguém clicasse em Entrar. É a mesma família de defeito do `node_modules` do domain: invisível para tudo que não executa o artefato.
- **Só o par público entra na imagem.** A `SUPABASE_SERVICE_ROLE_KEY` é lida em runtime pelo servidor e não é assada em camada nenhuma. O anon key é público por desenho — vai para o browser de qualquer forma.
- **O CI passou a provar o inline, não a existência da variável.** O job `Image` constrói o web com placeholders reconhecíveis e faz `grep` neles em `apps/web/.next/static`. Verificado nos dois sentidos antes de subir: a imagem corrigida contém os valores; a imagem anterior, construída sem os `--build-arg`, não — ou seja, o gate reprova de verdade o estado que existia até hoje.
- **Precisa de mão humana:** marcar o usuário em `app_metadata` e então o lead de teste. Nada mais.

### Login provado em produção, e o domínio mudou — 2026-08-07

- **O inline foi provado no ar, não só na imagem.** Baixei o `/login` de produção, extraí os chunks que a página referencia e achei a **URL real do projeto Supabase** dentro de `/_next/static/chunks/`. É o bundle que o browser executa, então o formulário de login deixa de estourar ao clicar em "Entrar". O `/onboarding` responde 307 para o login quando não há sessão, que é o comportamento certo.
- **O domínio público do web mudou e o registro estava desatualizado.** O `registro.md` do ticket 01 gravava `web-production-613e6.up.railway.app`; o atual é **`web-production-33d67.up.railway.app`** (`RAILWAY_PUBLIC_DOMAIN` do serviço). Bati no domínio velho e recebi 404 em **todas** as rotas, inclusive `/health` — e por um instante pareceu que o deploy tinha derrubado a aplicação. O que denunciou foi o cabeçalho: `x-railway-fallback: true`, com corpo `"Application not found"`. Ou seja, 404 do **edge** do Railway, não do Next. **Lição barata:** ler corpo e cabeçalhos de um 404 antes de concluir qualquer coisa — 404 de roteador de borda e 404 de aplicação contam histórias opostas.
- **Regra prática daqui pra frente:** o domínio sai de `railway variables --service web | grep RAILWAY_PUBLIC_DOMAIN`, nunca de um endereço copiado de registro antigo.
- **Precisa de mão humana:** só a marcação em `app_metadata` e o lead de teste.

## Ticket 09 — Pessoa vira Oportunidade — CONCLUÍDO

- **O que foi construído:** o tracer bullet fecha. A ingestão virou três fases puras em `packages/domain` (`planSubmission` → o chamador insere → `planPersonLookup` → `decideIntake`), e `applyIntakePlan` executa o plano numa transação em `packages/db`. `IntakePlan` é união discriminada `QUARANTINE | RETRANSMISSION | NEW_OPPORTUNITY`, com `now` como argumento. Schema novo: `lead_submissions` (com a `UNIQUE(workspace_id, source, external_lead_id)` que arbitra a idempotência), `opportunities` e `intake_reviews`, os três com RLS forçada e policy. O worker deixou de sequenciar regra: ele carrega valores entre funções puras e aplica o plano.
- **Arquivos-chave criados/alterados:** `packages/domain/src/intake/intake-plan.ts` (+ teste), `packages/db/src/intake.ts` (+ `packages/db/tests/intake.test.ts`), `packages/db/tests/seam-inspection.ts`, migration `20260808000100_lead_submissions_and_opportunities`, `packages/db/prisma/schema.prisma`, `apps/worker/src/integration-event-job.ts`, `packages/db/src/integration-event.ts`, `tests/seam2-ingestion.test.ts`, `packages/db/tests/rls.test.ts`.
- **Critérios de aceite:** 23 de 23. Fecharam também os **dois critérios que o ticket 08 carregou** (`IntakeReview(IDENTITY_CONFLICT)` gravado, e contato antigo nunca sobrescrito).
- **Testes:** `pnpm test` **353 passando, 1 pulado** (era 285). `pnpm typecheck`, `pnpm lint`, `pnpm check:migrations` e `pnpm db:drift` verdes. Seam 1: 22 casos sobre o plano. Seam 2: 19, incluindo `POST → outbox → dispatcher → BullMQ real → worker → Person + Opportunity`.
- **Self-review:** `/code-review` em dois eixos. Standards apontou 4 itens (CONTEXT.md não emendado antes da tabela do ADR-0005; dois tipos sem linha na tabela; ADR-0016 não emendado; `markIntegrationEventProcessed` sem chamador) — **todos corrigidos**. Spec apontou 4, dos quais **um era defeito real** (janela de dois cards, abaixo) e os outros três viraram emenda de documento ou correção pequena. Nenhum ficou aceito sem conserto.

### O defeito que o review pegou, e que teria escapado de toda a suíte

O ADR-0017 manda inserir a submissão **entre** a primeira fase e a terceira, o que põe o insert numa transação e a aplicação do plano noutra. Entre os dois commits o envio existe com `opportunity_id` nulo, e nesse instante "já recebi esta transmissão" e "já está no funil" **deixam de ser o mesmo fato**.

`decideIntake` trata `DUPLICATE` sem card como envio novo — precisa tratar, senão um plano que não commitou engole o lead para sempre, já que a variante `Retransmission` existe para proteger um card e ali não há card. Sozinho, isso abria a porta oposta: dois workers na mesma chave tomariam ambos esse caminho e escreveriam **dois cards para uma submissão**. Nenhum teste sequencial veria isso.

Quem fecha é a condição na escrita: `applyIntakePlan` grava `opportunity_id` com `WHERE … AND opportunity_id IS NULL`, e a transação que não afeta linha nenhuma desfaz tudo e falha alto (ADR-0013 — condição arbitra escrita concorrente). O perdedor não deixa nem Pessoa órfã; sua retentativa lê o card e vai inerte. Há teste que roda as duas aplicações em paralelo.

**A lição:** três fases puras compram teste barato e cobram uma transação a mais. O preço não é o commit extra — é que **toda janela entre commits precisa de uma condição que a feche**, e quem escreve a fase seguinte não vê a janela.

### Decisões que tomei sozinho

- **`markIntegrationEventProcessed` foi removida.** O estado final do evento passou a ser gravado por `applyIntakePlan`, na mesma transação das linhas que ele descreve. Operação separada só rodaria antes ou depois daquele commit, e as duas ordens deixam um instante em que a tela de Integrações e o funil discordam. `processed_at` continua sendo de `PROCESSED` e de mais nada — evento em quarentena não foi processado, está esperando alguém completá-lo (o `CHECK` de `20260806000200` já dizia isso, e foi ele que me corrigiu).
- **`installment_amount` é `numeric` sem precisão.** Um campo mal mapeado carregando número absurdo não pode estourar largura de coluna e custar a escrita inteira — o valor bruto continua no payload do evento.
- **`external_lead_id` é `VARCHAR(255)`, e `readLeadPayload` degrada para ausente um id declarado maior que isso.** Sem o limite, a constraint que existe para nenhum lead entrar duas vezes seria o que recusaria a linha e perderia um. O conector cai no `IntegrationEvent.id`, o mesmo caminho de toda origem sem id.
- **`IntakeReview.resolution` não foi criada.** É do ticket 11, que sabe a forma das três resoluções; coluna anulável é aditiva. O que existe é o `CHECK` que faz a união valer no banco: cada tipo carrega a própria evidência ou a linha é recusada.
- **A inspeção do Seam 2 mora em `packages/db/tests/seam-inspection.ts`.** O teste ponta a ponta precisa olhar cards e revisões, e não existe operação nomeada que os leia até o ticket 12. Em vez de afrouxar a barreira do ADR-0016 (que proíbe `@prisma/client` fora de `packages/db`), o client cru ficou **dentro** do pacote e o teste da raiz importa leitores nomeados. Nenhuma guarda foi enfraquecida.

### Descobertas que afetam tickets seguintes

- **`applyIntakePlan(ctx, plan)` e `recordLeadSubmission(ctx, input)` são o caminho compartilhado**: o ticket 14 ("completar e liberar") chama exatamente as mesmas funções, com `now` = instante da liberação. `recordLeadSubmission` recebe `integration_event_id` como argumento (e não do contexto) justamente para o chamador que carrega `UserContext`.
- **`resolveIntakeDestination(ctx, target_pipeline_id)` não tem argumento para financiamento e não vai ter** — é assim que "a classificação nunca escolhe funil" virou propriedade da assinatura.
- **O ticket 10** herda a quarentena já funcionando: evento em `QUARANTINED`, envio apontando para a transmissão mais recente, sem Pessoa e sem card. Falta a tela e a liberação. A contagem de transmissões de um envio re-quarentenado **não** incrementa; quem decide se deve é quem tem a tela.
- **O ticket 11** herda `merged_into_opportunity_id` (já varrido pela varredura de lápide do Seam 3, sem edição nenhuma, como o ticket 08 previu) e a variante `Retransmission` carregando `opportunity_id`. Falta a linha do tempo (não há model de timeline nesta fatia) e as três resoluções.
- **`opportunities.pipeline_id` é `RESTRICT`**: um funil com cards não é apagável. O teste de operações de pipeline no Seam 3 precisou de um funil próprio para o card por causa disso. Se o ticket 12 quiser permitir apagar funil com cards, isso é regra nova e precisa de decisão.
- **A ADR-0016 foi emendada**: são **cinco** operações aceitando as duas variantes de contexto, não duas. Todas as cinco são do caminho de ingestão — as três fases puras do ADR-0017 cada uma exigem uma leitura sob o tenant, e o caminho é literalmente o mesmo para os dois chamadores. `spec.md` recebeu a nota de supersessão.
- **`processIntegrationEventJob` devolve `intake_plan_kind`** (nulo quando o evento já estava `PROCESSED`), nunca o plano: o BullMQ guarda o retorno em Redis, e um `IntakePlan` carrega nome, telefone, e-mail e CPF.

### Documentos emendados

`CONTEXT.md` (dois termos novos: Destino da ingestão, Resultado do insert do envio), `docs/adr/0005` (nove linhas novas na tabela canônica), `docs/adr/0016` (regra 2: cinco operações, com a nota de emenda), `.scratch/fundacao-e-ingestao/spec.md` (nota de supersessão), issues 08 e 09.

### Precisa de mão humana

Nada novo. Continua pendente o que já estava: marcar um usuário apto em `app_metadata` no Supabase para nascer o primeiro workspace, e então o lead de teste ponta a ponta em produção. A migration `20260808000100` sobe pelo job de release como as anteriores.

## Ticket 16 — Catálogo de feature flags — CONCLUÍDO

- **O que foi construído:** catálogo puro e único das três capacidades pagas por uso; resolução fail-closed por workspace sob `AccessContext` e RLS; guard de servidor; slot opcional para o resultado resolvido nas variantes `UserContext` e `JobContext`; e o engate pós-criação do worker, que descreve `AUTO_FIRST_CONTACT` como dado somente depois de uma `Opportunity` realmente criada. Sem linha, o resultado é OFF e o worker emite lista vazia; não existe consumidor externo nesta fatia.
- **Arquivos-chave criados/alterados:** `packages/domain/src/feature-flags.ts` (+ teste e export por subpath); `packages/db/src/feature-flags.ts` (+ teste de Postgres); `packages/db/src/access-context.ts`; migration `20260810001600_workspace_flags`; `packages/db/prisma/schema.prisma`; `apps/worker/src/integration-event-job.ts`; `packages/db/tests/rls.test.ts`; `eslint.config.mjs`; issue 16.
- **Critérios de aceite:** 12 de 12. O catálogo contém exatamente `auto_primeiro_contato`, `score_cabimento_llm` e `resumo_handoff_llm`; assinatura digital e funil jurídico não entram. O build confirmou que nenhuma chave aparece em `apps/web/.next/static`.
- **Testes:** red inicial real (módulo ausente + quatro asserts do worker falhando); domínio/worker 20/20; leitura/guard em Postgres real 4/4; Seam 3 51/51; `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm check:migrations` e `pnpm db:drift` verdes. A suíte completa foi executada uma vez: 362 passaram, 1 pulou e a única falha foi a lista estática do Seam 3 encontrar a nova 13ª tabela; corrigida, a suíte afetada passou 51/51 sem repetir o gate completo em paralelo.
- **Self-review:** Standards encontrou cobertura só do `JobContext` e ruído de `prisma format` em models alheios; ambos corrigidos (leitor testado também com `UserContext`, diff do schema reduzido ao model novo). Spec não deixou achado aberto: a flag é consultada no momento do uso, nunca fica em singleton/cache, o efeito só nasce do resultado aplicado `NEW_OPPORTUNITY`, e os papéis de runtime têm somente `SELECT` em `workspace_flags`.
- **Branch / PR:** `ticket/16-catalogo-feature-flags`; sem push e sem PR nesta etapa paralela.
- **Decisões que tomei sozinho:** `workspace_flags` é tabela de presença com PK `(workspace_id, key)`, não guarda boolean; isso torna ausência literalmente OFF. `key` permanece `TEXT`, sem duplicar as três strings num enum/check do banco; valores desconhecidos são ignorados pelo único catálogo do domínio. Os defaults de privilégios da fundação são estreitados com `REVOKE INSERT, UPDATE` para app/worker: liberação é ato da marctco, não configuração do tenant. O catálogo sai por subpath próprio e o lint impede import direto pelo web; telas recebem somente boolean resolvido pela operação nomeada de DB.
- **Descobertas que afetam tickets seguintes:** na Fase 4, o consumidor pode receber o mesmo `AccessContext` enriquecido pelo slot `feature_flags`, sem alterar as assinaturas das operações existentes. O ponto para executar WhatsApp é a lista `post_creation_effects` imediatamente após `applyIntakePlan`; ela já distingue criação real de retransmissão concorrente. Uma futura operação comercial para liberar flag precisa rodar com papel técnico próprio ou migrator escopado — app e worker não escrevem a tabela.
- **Documentos emendados:** issue 16 (Status, 12 critérios e evidências) e este registro. ADRs/CONTEXT já continham os termos e a decisão, sem conflito ou nome novo a emendar.
- **Precisa de mão humana:** Nada.

## Ticket 10 — Quarentena e marcador de lead sem telefone — CONCLUÍDO

- **O que foi construído:** `markersFor` virou a fonte única e ordenada dos marcadores. Os seams provam a quarentena visível com payload preservado e a liberação pelo caminho literal `recordLeadSubmission` → `decideIntake` → `applyIntakePlan`, reutilizando o evento e usando o instante da liberação em `arrived_at`.
- **Arquivos-chave criados/alterados:** `packages/domain/src/markers.ts` e teste; testes de plano e de persistência; issue 10.
- **Critérios de aceite:** 13 de 13.
- **Testes:** 25/25 no Seam 1, 26/26 no DB focado; na branch isolada, typecheck/lint verdes e suíte completa com 358 passando, 1 pulado. Após integração, testes puros combinados e typecheck global verdes.
- **Self-review:** nenhum achado de Standards ou Spec.
- **Branch / commit integrado:** `ticket/10-quarentena-e-marcador-sem-telefone` (`4132ef8`) → wave (`03a3f59`).
- **Descobertas que afetam tickets seguintes:** `listIntegrationEvents` já entrega a quarentena ao ticket 14; `markersFor` está disponível ao ticket 12; liberação vazia continua `QUARANTINE` e a UI do ticket 14 impede a ação.
- **Precisa de mão humana:** Nada.

## Ticket 11 — Retransmissão inerte e revisão de possível duplicado — CONCLUÍDO

- **O que foi construído:** timeline mínima de ingestão; retransmissão inerte; resoluções `NEW_FINANCING`, `SAME_FINANCING` e `INVALID_OR_SPAM`; transferência transacional de FKs; lápides; merge de Pessoas com reavaliação de duplicidade; RLS e índices.
- **Arquivos-chave criados/alterados:** migration `20260810001100_duplicate_review_resolution`; `packages/db/src/intake-review.ts`; `person-merge.ts`; decisão pura e testes de domínio, DB, Seam 2 e Seam 3; `CONTEXT.md` e ADR-0005.
- **Critérios de aceite:** 24 de 25. O discriminador financeiro na tela pertence ao ticket 12, que depende deste ticket; não é implementado antecipadamente aqui.
- **Testes:** migration em banco vazio, drift, migration safety, lint, build e typecheck verdes; suíte isolada com 362 passando e 1 teste condicional pulado. Após integração com o ticket 10, ambos os módulos puros e o typecheck global passaram.
- **Self-review:** nenhum defeito de Standards ou Spec dentro do escopo; a pendência visual foi mantida explícita.
- **Branch / commit integrado:** `ticket/11-retransmissao-e-revisao-duplicado` (`c3f9cd0`) → wave (`5153006`).
- **Descobertas que afetam tickets seguintes:** o ticket 12 deve mostrar discriminadores financeiros e consultar revisões dos dois lados; a resolução futura de conflito de identidade pode reutilizar `mergePersons`.
- **Precisa de mão humana:** Nada.

## Ticket 13 — Google Lead Form e webhook de landing page — PARCIAL

- **O que foi construído:** endpoint servidor-servidor de landing page compartilhando a fronteira HTTP durável da Pluga; CORS recusado; guia autenticado em PT-BR com contrato `v1`, segurança e receitas para WordPress, builders, Node e serverless; provas de idempotência e simetria dos conectores.
- **Arquivos-chave criados/alterados:** `apps/web/lib/integration-lead-endpoint.ts`; rota `/v1/integrations/webhooks/leads`; guia `/workspace/[slug]/integrations/landing-page`; receitas; testes de rota e conector; issue 13 e ações manuais.
- **Critérios de aceite:** 12 de 15. O modelo Google e sua validação dependem de conta real Pluga; a origem no card/tabela pertence à superfície do ticket 12.
- **Testes:** 21/21 focados; typecheck, lint, build e suíte isolada com 359 passando e 1 pulado. Após integração, 15 testes de rota/conector e typecheck global verdes.
- **Self-review:** nenhum achado; critérios não comprovados permaneceram desmarcados.
- **Branch / commit integrado:** `ticket/13-google-e-landing-page` (`3e18372`) → wave (`4275279`).
- **Descobertas que afetam tickets seguintes:** conexões `LANDING_PAGE` inferem a origem; Pluga continua Meta por padrão, então Google deve declarar `GOOGLE_LEAD_FORM`; o endpoint não depende do Redis e resolve tenant somente pelo token.
- **Precisa de mão humana:** conectar uma conta Google real à Pluga, observar campos/IDs, criar o modelo sem presunções e repetir o identificador para comprovar uma única Oportunidade.

## Consolidação da wave 10 · 11 · 13 · 16 — 2026-08-10

- Worktrees isolados e implementadores paralelos; integração na ordem 10 → 11 → 13 → 16.
- Conflitos aditivos resolvidos preservando os exports de marcadores/resoluções, as relações `OpportunityTimelineEvent`/`WorkspaceFlag`, as fixtures RLS e ambos os projetos de teste.
- Commits da wave: `03a3f59`, `5153006`, `4275279`, `842ac65` sobre o fixed point `887a8e9`.
- A wave de código está consolidada. A pendência externa do Google permanece em `acoes-manuais-pendentes.md`; os critérios visuais explicitamente atribuídos ao ticket 12 continuam desmarcados nos tickets 11 e 13.

## Correção de concorrência do mecanismo 2 — 2026-08-11

- **Achado corrigido:** dois envios distintos da mesma Pessoa podiam ler
  candidatas/cards antes de qualquer commit e criar duas Pessoas ou duas
  Oportunidades sem `POSSIBLE_DUPLICATE`.
- **Arbitragem:** `decideAndApplyIntake` trava, em ordem canônica, todas as
  chaves de identidade com `workspace_id` explícito e depois as Pessoas
  candidatas; lookup, decisões puras e `applyIntakePlan` passam a compartilhar
  a transação. A condição `LeadSubmission.opportunity_id IS NULL` continua
  intacta e dona da concorrência do mesmo envio.
- **Prova:** teste DB concorrente com dois `external_lead_id` distintos e o
  mesmo telefone exige uma Pessoa, duas Oportunidades, ambas as submissões
  ligadas e uma revisão `POSSIBLE_DUPLICATE` conectando os cards. Outra corrida
  usa dois telefones distintos já pertencentes à mesma Pessoa para provar a
  segunda trava, por `workspace + person_id`.
- **Sem migration:** a correção usa advisory locks transacionais e consultas já
  servidas pelos índices existentes.

## Consolidação pós-review da wave 10 · 11 · 13 · 16 — 2026-08-11

- **Interface e IA:** a receita de landing page permanece na mesma rota e passa
  a aparecer sob `Configurações`; o rail compacto usa ícones por subpath,
  preserva rótulos acessíveis e atende foco e alvo de toque em telas pequenas.
- **Isolamento:** as operações alteradas do intake têm predicado explícito de
  `workspace_id` além de RLS. Testes com client privilegiado provam que destino,
  duplicidade, quarentena, retransmissão, claim e settlement não atravessam o
  tenant. Erros do executor não serializam mais `IntakePlan` nem PII.
- **Concorrência:** depois dos locks canônicos por identidade e Pessoa, o
  coordenador relê as candidatas antes de decidir. O teste determinístico de
  telefones distintos e CPFs contraditórios prova que a transação que esperou
  observa o CPF recém-gravado e produz `IDENTITY_CONFLICT`.
- **Gate serial do orquestrador:** Postgres e Redis reais, banco vazio, 15/15
  migrations aplicadas; `pnpm test` com **396 passando e 1 pulado**; DB 159/159;
  Seam 2 19/19; typecheck, lint com fronteira Prisma, build de produção,
  migration safety, `migrate dev`, drift e `git diff --check` verdes.
- **Revisão independente final:** Standards **0 findings**; Spec **0 findings**.
  Critérios externos do Google/Pluga e critérios visuais do ticket 12 continuam
  explícitos e não foram falsamente marcados como concluídos.
- **Branch de hardening:** `fix/wave-review-ia-configuracoes`, sem push direto
  para `main`; entrega pelo fluxo `pnpm ship`.

<<<<<<< HEAD
## Ticket 12 — Tela de Leads — CONCLUÍDO

- **O que foi construído:** `/workspace/:slug/leads` — tabela paginada por
  keyset, card em slot interceptado, contadores-filtro por marcador, indicador
  de "novos leads" por consulta periódica, edição na linha e dentro do card, e
  a resolução de possível duplicado e de conflito de identidade acontecendo
  aqui, com comparação lado a lado.
- **Arquivos-chave:** `packages/db/src/leads.ts` (operações nomeadas da tela);
  migration `20260811001200_leads_list_indexes`; `apps/web/app/workspace/
  [slug]/leads/**`; `apps/web/components/leads/*`; `apps/web/lib/leads/*`;
  `DESIGN.md` (componente `markers-menu` e Known Gap resolvido).
- **Critérios de aceite:** 37 de 37. Os visuais estão marcados por
  conformidade de código com o `DESIGN.md`; **não houve passada em navegador**.
- **Schema:** a resolução de conflito de identidade exigiu a coluna
  `identity_conflict_resolution` e a reescrita dos dois CHECKs de
  `intake_reviews` — o CHECK do ticket 11 forçava `resolution IS NULL` para
  toda linha `IDENTITY_CONFLICT`, então metade dos marcadores não tinha como
  ser resolvida. Migration aditiva.
- **Testes:** `test:unit` 228/228, `test:db` 182/182 (22 novos em
  `leads.test.ts`), `test:seam2` 19/19, `test:a7` 5/5; typecheck, lint, build,
  `check:migrations` e `db:drift` verdes, sobre o rebase em `2fc64d3`.
- **Integração:** rebase sobre `main` com um conflito em `workspace-shell.tsx`
  — o rail compacto da PR #28 passou a exigir `icon` por item, e o branch ainda
  trazia `shortLabel`. Resolvido pela forma do `main`, com `UsersIcon` no item
  "Leads". O ticket 14 tinha o mesmo defeito, sem conflito de merge: o rebase
  auto-mesclou e só o compilador pegou.
- **Descobertas que afetam tickets seguintes:** o ticket 15 (varredor e
  reprocessar) herda a fila de quarentena já exposta pelo ticket 14 e os
  índices parciais desta tela; a observação do ticket 14 sobre submissão
  requarentenada mais de uma vez continua valendo e é dívida do dead-letter.
- **Precisa de mão humana:** uma passada visual na tela em navegador, nos
  breakpoints do `DESIGN.md` — é o único critério cuja prova não é automatizável
  aqui.

## Ticket 14 — Tela Integrações > Pluga — QUASE CONCLUÍDO (needs-info)

- **O que foi construído:** a tela `/workspace/:slug/integrations/pluga` completa — URL do webhook copiável, geração/rotação/ativação/desativação do segredo (Direção), contrato `v1` e modelo copiável de HTTP Request para Meta, aviso do plano pago, explicação não técnica do formato e da retenção de 90 dias, histórico com "reprocessar", última sincronização e a fila de quarentena com "completar e liberar". A liberação da quarentena roda literalmente a mesma sequência do job do worker — `getQuarantinedEvent` → `buildReleaseInboundLead` (sem conector) → `normalize` → `recordLeadSubmission` → `findPersonCandidates`/`decidePersonIdentity` → `resolveIntakeDestination` + `findOpenOpportunitiesOfPerson` → `decideIntake` (com `now` = instante da liberação) → `applyIntakePlan` —, reutiliza o mesmo `IntegrationEvent` e nunca enfileira um segundo. Nasceu também o primeiro conjunto de `components/ui/` (button, card, data-table, empty-state, field, modal, status-badge), cada um transcrito do `DESIGN.md`.
- **Arquivos-chave criados/alterados:** `packages/db/src/quarantine.ts` (novo); `integration-connection-operations.ts`, `integration-connection.ts`, `integration-event.ts`, `index.ts` (estendidos, bloco novo ao final); `packages/db/tests/quarantine.test.ts` e `integration-connection-operations.test.ts` (novos); `apps/web/app/workspace/[slug]/integrations/pluga/**` (tela, painel do segredo, bloco copiável, detalhe/formulário de liberação, quatro route handlers); `apps/web/components/ui/*.tsx`; `apps/web/lib/{pluga-access,mask-integration-secret,integration-payload-expiry,quarantine-release-eligibility,build-release-inbound-lead,release-quarantined-lead,quarantine-wait-time,pluga-templates}.ts` (+ testes); `apps/web/app/workspace/[slug]/workspace-shell.tsx` (item de navegação "Pluga", antes de "Landing page"); `vitest.config.ts` (dois arquivos novos no projeto `db`); issue 14.
- **Critérios de aceite:** 26 de 28 marcados. Desmarcados: o modelo Google (depende de conta Pluga real conectada a um formulário Google — nenhuma existe neste ambiente) e a coluna "erro" do histórico (`integration_events` não tem coluna de mensagem de erro, e nada nesta fatia grava `status = FAILED`; é dívida do dead-letter do ticket 15, não deste).
- **Testes:** `pnpm test:unit` 251/251 (18 arquivos novos, incluindo `release-quarantined-lead.test.ts`, que mocka só `@marctco/db` e prova a sequência de chamadas e os argumentos exatos contra as funções reais de `@marctco/domain`, e o `route.test.ts` do handler de liberação). `pnpm test:db` 171/171 (19 novos): `quarantine.test.ts` prova contra Postgres real que a liberação reutiliza o mesmo evento (contagem não muda), cria Pessoa + Oportunidade com `arrived_at` no instante da liberação, e que uma liberação sem contato permanece `QUARANTINE`; `integration-connection-operations.test.ts` prova rotação/ativação/desativação/última-sincronização/recusa por payload expirado. `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm check:migrations`, `pnpm db:drift`: verdes. Nenhuma migration foi necessária.
- **Self-review:** `/code-review` em dois eixos. Standards não encontrou violação dura; apontou duas constantes duplicadas por decisão deliberada (`PAYLOAD_RETENTION_DAYS`/`integrationEventPayloadExpiresAt` e o prefixo `mtco_`, ambas em `apps/web/lib/` para não puxar `@marctco/db` — e o `createPrismaClient()` que ele constrói no escopo do módulo — para dentro de um teste de lib pura) e uma bifurcação real de caminho: o worker chama `readWorkspaceFeatureFlags` + `planOpportunityPostCreationEffects` depois de `applyIntakePlan`, e a liberação não chama — porque não pode: `@marctco/domain/feature-flags` é banido de `apps/web` pelo próprio `eslint.config.mjs` ("Web code receives a resolved workspace boolean from a named @marctco/db operation"). Registrado abaixo como descoberta para quem ligar `auto_primeiro_contato` de verdade. Spec encontrou um achado real — o redirect de sucesso da liberação (`?released=`) não tinha leitor na tela — **corrigido** antes deste registro; os outros dois apontamentos (o botão "Reprocessar" escondido para evento em quarentena, e o `components/ui/` nascer neste ticket em vez do 12) são decisões deliberadas, explicadas abaixo.
- **Branch / PR:** `ticket/14-tela-integracoes-pluga`, commit `3b341e1` (+ o fix do `?released=` no mesmo commit antes deste registro). Sem push e sem PR — integração é manual pelo orquestrador.
- **Decisões que tomei sozinho:**
  - O segredo (URL + mascarado + gerar/rotacionar/ativar/desativar) é seção exclusiva da Direção — inclusive a leitura do resumo (`getIntegrationConnectionSummary`), não só as ações. O ADR-0015 escreve "o segredo da integração é só da Direção; o histórico e o reprocessamento são da Gestão", e li isso como toda a seção, não só os botões.
  - "Reprocessar" fica oculto na UI para evento `QUARANTINED` (esse card usa "completar e liberar"), embora `requeueIntegrationEventForReprocessing` continue aceitando reprocessar um evento em quarentena — a operação de banco é de propósito mais geral que a política que esta tela aplica sobre ela.
  - `listQuarantinedEvents` ordena do mais antigo para o mais novo (oposto de `listIntegrationEvents`, que é mais novo primeiro): numa fila que se resolve, o lead que espera há mais tempo deve aparecer primeiro.
  - Acrescentei uma coluna "Espera" (`apps/web/lib/quarantine-wait-time.ts`) na fila de quarentena — não pedida literalmente, mas é a prova mais barata de que "o tempo em quarentena continua medível pela diferença entre liberação e recebimento" é visível, não só verdadeiro no banco.
  - O painel do segredo usa `Modal` + botão `danger` só para desativar a integração (ação que para a ingestão) e `Modal` + botão `primary` para confirmar a rotação (consequente, mas não "destrutiva" no sentido do `DESIGN.md`).
  - `readLeadPayload`/`buildInboundLead` (de `@marctco/domain`) são usados na liberação e na coluna "Mapeamento" do histórico — não são o conector (`apps/worker/src/connector-v1.ts`, nunca importado aqui), são o leitor genérico do contrato `v1` que o próprio conector também usa por baixo.
- **Descobertas que afetam tickets seguintes:**
  - Quando `auto_primeiro_contato` (ou qualquer outro `post_creation_effect`) ganhar consumidor real, a liberação da quarentena também precisa dispará-lo — hoje ela não faz, porque `apps/web` não pode importar `@marctco/domain/feature-flags`. A saída provável é uma operação nomeada em `packages/db` que envolva `readWorkspaceFeatureFlags` + `planOpportunityPostCreationEffects` e devolva só o resultado resolvido, do mesmo jeito que `resolveIntakeDestination` envolve lógica de domínio para o release handler não precisar tocar no pacote errado.
  - `getQuarantinedEvent`/`listQuarantinedEvents` juntam em `lead_submissions.last_integration_event_id = event.id`: se uma submissão for requarentenada mais de uma vez, só o evento mais recente aparece como quarentena ativa; um evento de quarentena mais antigo da mesma submissão nunca mais aparece na fila (fica com `status = QUARANTINED` para sempre, sem card e sem lugar na UI). Não é regressão desta fatia — é um comportamento pré-existente de `applyIntakePlan` (ticket 09/10) que este ticket só passou a expor numa tela; registrar aqui para quem for ao dead-letter do ticket 15.
  - `packages/db/src/index.ts` recebeu um bloco novo ao final (comentário explícito de que é aditivo, para o merge com o ticket 12 não colidir).
  - `apps/web/components/ui/` nasceu neste ticket com sete primitivos (button, card, data-table, empty-state, field, modal, status-badge) no contrato exato que o prompt descreveu; o ticket 12 deve criar só os que faltarem, nos mesmos nomes/formas, sem duplicar os sete existentes.
- **Documentos emendados:** issue 14 (`Status`, 28 critérios e evidência), este registro. Nenhum ADR — nenhuma regra nova foi decidida, só aplicada. `DESIGN.md` não foi tocado (pertence ao ticket 12 nesta rodada); as duas substituições de valor sem token (14px→`px-md`, 2px→`py-xxs`) ficaram documentadas em comentário no código, não no `DESIGN.md`.
- **Precisa de mão humana:** 1. Conectar uma conta Pluga real a um Google Lead Form, disparar um lead de teste, e só então escrever o modelo Google — sem isso o critério correspondente não fecha, por desenho (ADR-0008 recusa presumir campos não confirmados). 2. Nenhuma outra ação humana: sem migration, sem variável de ambiente nova, sem serviço externo novo.

## Ticket 14 — integração pós-rebase — 2026-08-11

- Rebase sobre `2fc64d3` com conflito só no `registro.md` (aditivo, resolvido
  preservando as duas seções do hardening e a deste ticket).
- O item "Pluga" do rail nasceu com `shortLabel` e quebrou o typecheck depois
  do rebase — o rail compacto da PR #28 passou a exigir `icon` por item. O
  rebase auto-mesclou sem conflito e só o compilador pegou; corrigido com
  `PlugsConnectedIcon` no commit `235d9ac`.
- Gates depois do rebase: `test:unit` 248/248, `test:db` 178/178,
  `test:seam2` 19/19, `test:a7` 5/5, typecheck, lint, build,
  `check:migrations` e `db:drift` verdes.
- O `test:a7` só fecha localmente com `PGBOUNCER_DATABASE_URL` apontando para o
  banco `marctco`: o container do pgbouncer serve um banco fixo, e as worktrees
  usam bancos próprios. Em CI as duas URLs são o mesmo banco e o gate roda
  íntegro.
- A contagem de critérios do registro original dizia "26 de 28"; a contagem real
  dos checkboxes é **27 marcados e 2 abertos**. Os dois abertos continuam os
  mesmos (modelo Google e coluna de erro do histórico).
- **Os sete primitivos de `components/ui/` nasceram duas vezes.** Os tickets 12
  e 14 correram em paralelo e cada um transcreveu o `DESIGN.md` por conta
  própria, com implementações diferentes dos mesmos sete nomes. No rebase, o
  ticket 12 já estava no `main` (PR #29), então a versão dele ficou como fonte
  única e a deste ticket foi descartada — não por ser pior, mas porque duas
  transcrições do mesmo componente é exatamente o que o `DESIGN.md` existe para
  impedir. O único ajuste que o compilador cobrou foi o nome do tipo:
  `StatusTone` (14) → `StatusBadgeTone` (12).
- **Lição para a próxima wave:** dois tickets que tocam a mesma camada de
  primitivos não devem correr em paralelo sem que um deles seja declarado dono
  da camada. O comentário "bloco aditivo ao final" resolveu `packages/db/src/
  index.ts` sem colisão; nada equivalente protegia `components/ui/`.

## Ticket 15 — Recuperação da outbox e reprocessamento — CONCLUÍDO

- **O que foi construído:** o dispatcher passou a se auto-agendar com backoff
  exponencial (2 s → teto de 5 min, zerado na primeira passada que move algo),
  em vez de um `setInterval` que reperguntava a mesma dezena de linhas ao
  PostgreSQL a cada dois segundos enquanto o Redis estivesse fora. Nasceu a
  fila morta — `failed_at` e `failure_reason` em `integration_events`, escritas
  pelo worker **só** quando o BullMQ esgota as tentativas — e com ela a coluna
  "Erro" e a seção "Fila morta" da tela de Integrações, que o ticket 14 tinha
  deixado explicitamente em aberto. E a expiração de payload do ADR-0014 saiu
  do papel: varredura periódica que descobre tenants por função privada e apaga
  o conteúdo em lotes, sob RLS, preservando a linha e a quarentena.
- **Arquivos-chave criados/alterados:** migration
  `20260811001500_dead_letter_and_payload_expiry` (duas colunas, CHECK total,
  dois índices parciais, `private.claim_expired_payload_workspaces`);
  `packages/db/src/payload-expiry.ts` (novo), `integration-event.ts`
  (`markIntegrationEventFailed`, `listDeadLetterEvents`, requeue que limpa a
  falha), `index.ts` (bloco aditivo ao final);
  `packages/domain/src/telemetry.ts` (`describeFailureReason`);
  `apps/web/lib/payload-expiry-sweep.ts` (novo), `ingestion-dispatcher.ts`
  (backoff puro), `ingestion-queue.ts` (laço auto-agendado, remoção antes da
  republicação), `instrumentation.ts`; `apps/worker/src/dead-letter.ts` (novo)
  e `main.ts`; a tela `integrations/pluga/page.tsx`; ADRs 0007, 0014 e 0019.
- **Critérios de aceite:** 15 de 15 no ticket 15, com uma ressalva escrita no
  próprio arquivo (abaixo). Fechados também três critérios carregados de outros
  tickets: a coluna de erro do ticket 14, e os dois do ticket 03 que a tabela de
  pendências atribuía a este ("nenhuma transação envolve chamada de rede
  externa" e o contrato do schema `private`).
- **Onde eu desviei do ticket, e por quê:** o critério diz "rotina periódica no
  **worker**"; ela ficou no processo **web**. A descoberta sem tenant passa pelo
  schema `private`, e `marctco_worker` não tem `USAGE` nele — regra explícita do
  ADR-0019, que vence a issue por precedência. É o mesmo desvio, pelo mesmo
  motivo, que o ticket 07 registrou ao deixar o dispatcher no `web`. As saídas
  alternativas eram conceder ao worker o acesso privado que o Seam 3 prova que
  ele não tem, ou rotear manutenção por Redis e fazer a retenção depender da
  fila. O ADR-0014 recebeu nota de supersessão apontando para cá.
- **A lista fechada virou cinco.** `private.claim_expired_payload_workspaces`
  devolve `(workspace_id, anchor_integration_event_id)` — menos que a
  `claim_pending_events` — e **não recebeu privilégio novo nenhum**: cabe dentro
  das quatro colunas que `marctco_private_definer` já lia desde o ticket 07, e
  por isso reusa o executor em vez de criar um. O âncora existe para a varredura
  abrir a transação com um `JobContext` real, evitando um terceiro tipo de
  `AccessContext` para o único processo que toca todos os tenants.
- **Um defeito real que o ticket revelou:** o BullMQ recusa adicionar um job
  cujo id já existe, e o id é derivado do evento. Job terminado guarda esse id —
  completo por 24 h, falho para sempre, porque `removeOnFail: false` mantém a
  fila morta inspecionável. Ou seja: "reprocessar" virava a coluna para
  `PENDING`, o dispatcher "publicava" no vazio, marcava `DISPATCHED` e nada
  acontecia; a fila morta não tinha saída. O publicador passa a remover antes de
  adicionar, e o Seam 2 prova a saída ponta a ponta. Nota no ADR-0007.
- **Testes:** `test:db` 223/223 (19 novos em `outbox-recovery.test.ts` e o Seam 3
  em 58, incluindo a varredura genérica das funções privadas); `test:unit`
  278/278 (backoff, varredura de retenção, fila morta do worker,
  `describeFailureReason`); `test:seam2` 22/22, com três provas novas contra
  Postgres, Redis e BullMQ reais — lead aceito com o Redis fora chega ao funil
  quando ele volta, reprocessar não cria segunda Pessoa nem segunda
  Oportunidade, e um evento sai da fila morta pelo mesmo caminho; `test:a7`
  5/5; `typecheck`, `lint`, `build`, `check:migrations` e `db:drift` verdes;
  migration aplicada do zero no banco local.
- **Decisões que tomei sozinho:** falha de publicação **nunca** vira fila morta —
  Redis fora é motivo de backoff, não de desistir do lead; só o esgotamento das
  tentativas do BullMQ escreve `FAILED`. A fila morta não sobrescreve evento
  `PROCESSED` (o lead já está no funil) nem `QUARANTINED` (é ação humana
  pendente, e rotulá-la de falha a tiraria da fila de quarentena *e* da exceção
  de expiração — o único jeito de um lead completável virar buraco). Uma passada
  só conta como falha quando teve trabalho e não moveu nada: passada vazia é o
  caso saudável e passada parcial já é a recuperação acontecendo. A descoberta
  de expiração não testa `raw IS NOT NULL`, porque testá-lo exigiria conceder
  `SELECT (raw)` a um papel que roda sem tenant; o preço é um `UPDATE` que não
  acha nada num workspace já limpo, servido por índice parcial.
- **Descobertas que afetam tickets seguintes:** qualquer job novo do worker que
  possa falhar em definitivo deve passar por `recordDeadLetter`, ou a tela vai
  dizer que está tudo bem enquanto não está. Qualquer função privada nova nasce
  coberta pela varredura do Seam 3 — e se precisar de coluna que o executor
  atual não lê, o caminho é executor próprio, não grant novo no compartilhado.
  A varredura de retenção e o dispatcher são hoje as duas rotinas agendadas do
  processo `web`; uma terceira deve seguir o mesmo formato (`setTimeout`
  auto-agendado com backoff, ou `setInterval` com trava de reentrância).
- **Precisa de mão humana:** nada. Sem variável de ambiente obrigatória nova
  (`PAYLOAD_EXPIRY_INTERVAL_MS` é opcional e vale 1 h por padrão), sem papel
  novo no banco — portanto sem bootstrap manual no Supabase — e sem serviço
  externo novo.

## Ticket 18 — Conexão de landing page com segredo próprio — CONCLUÍDO

- **O que foi construído:** a tela de landing page ganhou o painel Direção-only
  que a da Pluga já tinha — gerar, rotacionar, ativar/desativar — agindo sobre
  o provider `LANDING_PAGE`. Fecha o item 3 de `a-fazer-geral.md`: a tela
  mandava usar "o token exclusivo da conexão de landing page" e nenhuma rota do
  produto sabia emitir esse token, porque a única que criava segredo tinha
  `const PROVIDER = "PLUGA"` fixo. A fundação não precisou de nada — enum,
  unique por `(workspace_id, provider)` e as três operações de `packages/db` já
  recebiam `provider`. Faltava só superfície.
- **Arquivos-chave criados/alterados:** `apps/web/lib/integration-surfaces.ts`
  (novo — o único lugar que liga segmento de URL a provider, com o endpoint e a
  cópia que difere entre as telas); `apps/web/lib/integration-secret-route.ts`
  (novo — fábrica dos dois handlers a partir de uma surface); as quatro rotas
  `integrations/{pluga,landing-page}/{secret,status}`, agora com seis linhas
  cada; `components/integrations/integration-secret-panel.tsx` e
  `copy-block.tsx` (movidos de `integrations/pluga/`, o painel parametrizado
  por surface); a tela de LP; `canOpenPlugaScreen` → `canOpenIntegrationScreen`.
- **A decisão que estruturou o ticket:** a causa da lacuna não foi esquecimento,
  foi forma. A rota da Pluga era um arquivo com uma constante dentro, então a
  segunda origem só existiria se alguém copiasse o arquivo e lembrasse de trocar
  a constante — exatamente o que não aconteceu. Trocar os quatro arquivos por
  uma fábrica que recebe `IntegrationSurface` tira a possibilidade: não existe
  mais lugar onde errar o provider. O teste roda `describe.each` sobre as duas
  surfaces, de modo que a conexão de landing page é provada e não presumida.
- **Duas perguntas de produto respondidas antes de codar:** painel próprio na
  tela de LP em vez de uma tela de Integrações única (o menu já tem as duas
  entradas; a tela índice mexeria em navegação, home do workspace e nos links do
  ticket 14 sem resolver mais nada), e **sem** histórico por conexão — a tela da
  Pluga segue listando os eventos do workspace inteiro, inclusive os de LP.
- **O que não precisou mudar, e por quê:** a atribuição do evento à conexão
  certa. `recordIntegrationEvent` re-seleciona a conexão por `token_hash`, não
  por provider, e filtra `status = 'ACTIVE'` naquela linha — é isso que torna
  verdadeira a promessa do painel de que desativar uma origem não desativa a
  outra. Duas conexões no mesmo workspace já eram um caso que o código
  suportava; ninguém tinha como criar a segunda.
- **Ganho que o item 3 não previa:** a origem do lead passa a estar certa por
  construção. O conector força `LANDING_PAGE` quando o provider da conexão é
  `LANDING_PAGE` (`connector-v1.ts:66-69`), enquanto um lead de LP entrando pelo
  token da Pluga só escapava do rótulo Meta se quem enviou lembrasse de declarar
  `source`.
- **Testes:** `test:unit` 303/303 em 47 arquivos (era 278 em 46) — os 25 novos
  em `integration-secret-route.test.ts` cobrem 401, 403 para os três papéis
  abaixo de Direção, 403 para workspace não associado, 400 para JSON inválido e
  ação desconhecida, 409 para segredo já existente, o provider correto em cada
  chamada de banco, o segredo ausente da linha de log, e o redirect de status
  voltando para a tela da própria origem. `lint`, `tsc --noEmit` e
  `next build` verdes; o build registra as duas rotas novas. Sem migration,
  portanto sem `check:migrations` nem `db:drift` a rodar.
- **Precisa de mão humana:** apertar o botão em produção. O workspace real tem
  uma conexão `PLUGA`; a de landing page só nasce quando a Direção abrir a tela
  e clicar em "Gerar segredo". Está incluído no item 1 de `a-fazer-geral.md`.

## Ticket 18 — passada de `/code-review` — 2026-08-12

Os dois eixos rodaram contra o commit inicial do ticket. **Um achado duro de
padrão, quatro de spec, seis juízos de valor.** O que mudou por causa deles:

- **Glossário (duro, ADR-0005).** `IntegrationSurface` era termo novo sem linha
  no `CONTEXT.md` nem na tabela de mapeamento, enquanto o vizinho
  `IntegrationConnection` tinha. Entrou nos dois, marcado como tipo da camada
  web e não model — a tabela ganhou a distinção junto, porque até aqui só
  listava nome de schema.
- **A frase que eu tinha escrito era exagerada.** O registro dizia "não há mais
  um arquivo onde esquecer a constante". Não é verdade: cada rota ainda amarra
  a surface à mão, e `pluga/secret/route.ts` passando `LANDING_PAGE_SURFACE`
  compila. Em vez de suavizar a frase, tirei a consequência: o redirect da rota
  de status passou a ser lido do caminho da requisição
  (`screenPathForStatusRoute`) e não de `surface.segment`, então uma amarração
  errada não larga mais o operador num 404 silencioso. `segment` também virou
  união fechada, o que faz um typo não compilar. O que sobra do risco está
  escrito no ticket, sem eufemismo.
- **AC meio verdadeiro.** Eu tinha marcado "403 nas rotas" para Atendente e
  Supervisor. A rota de segredo dá 403; a de status devolve 303 para a tela,
  porque é submetida por `<form>` e um JSON trocaria a página por texto cru. O
  AC foi reescrito para dizer as duas coisas, e os testes de status — que só
  exercitavam `MANAGER` — passaram a cobrir os três papéis.
- **Texto que contradizia a própria tela.** A nota para a Gestão dizia "A URL e
  o segredo são administrados pela Direção", mas a tela de LP imprime a URL
  logo abaixo, para qualquer papel. Virou só "o segredo", num componente único
  (`IntegrationSecretNotice`) em vez de um `<Card>` copiado nas duas telas —
  que era também o achado de duplicação do eixo de padrões.
- **Nomes que passaram a mentir.** `pluga-access.ts` guardava a regra de duas
  telas e `integration-secret-route.ts` guardava o handler de status, que não
  emite segredo. Viraram `integration-access.ts` e
  `integration-connection-routes.ts`.
- **`IntegrationSurface` misturava dois eixos.** Roteamento (`segment`,
  `provider`, `endpointPath`) e texto de tela estavam no mesmo nível, então
  mexer numa palavra e adicionar uma origem editavam o mesmo objeto. O texto
  desceu para `copy`. Junto foi embora a interpolação `Desativar a {noun}?`,
  que dependia de todo nome de origem ser feminino — agora cada rótulo é
  literal.
- **Recusado, com motivo:** desexportar `IntegrationRouteHandler`. É o tipo de
  retorno declarado de duas funções exportadas, e o build do web roda um
  segundo `tsc` sobre `tsconfig.server.json`; esconder o tipo é risco de emissão
  de declaração em troca de nada.
- **Confirmado pelo eixo de spec, não presumido:** as quatro operações de banco
  filtram `WHERE provider = $1`, o token em claro não aparece em log nem em
  redirect, as strings da Pluga saíram byte a byte iguais às antigas, e nenhum
  ponto do código assumia uma conexão por workspace.
- **Um erro meu no meio da correção:** rodei o rename de import com um laço
  PowerShell, e o 5.1 leu os arquivos como ANSI — nove arquivos saíram com
  mojibake (`DireÃ§Ã£o`). Restaurei os cinco afetados do commit e refiz as
  edições com ferramenta que respeita UTF-8. Vale como aviso: neste repo,
  reescrita em massa de arquivo com acento não passa por
  `Get-Content`/`Set-Content` sem `-Encoding utf8` nos dois lados.
- **Suíte depois da passada:** 47 arquivos, 309 testes (eram 303), `lint`,
  `typecheck` e `build` verdes.

## Aviso `url.parse()` nos logs do web — 2026-08-12

Anotado na passada do ticket 18 como "vem de dependência, não bloqueia nada".
Estava certo sobre o culpado e errado sobre a causa, e a causa é que dava para
corrigir.

- **O sintoma, em produção.** `railway logs --service web` traz o
  `[DEP0169] DeprecationWarning: url.parse()` na linha seguinte a
  `event="integration_event_dispatch" result="started"` — ou seja, no
  `new IORedis(redis_url)` de `createIngestionQueue()`, que o
  `instrumentation.ts` chama no boot.
- **Não é código nosso.** Zero `url.parse()` fora de `node_modules`. Quem chama
  é o `ioredis@5.9.3`, em `parseURL` (`built/utils/index.js:205`). O BullMQ
  recebe a instância pronta e nunca parseia URL.
- **Mas o aviso não deveria aparecer.** O Node suprime o DEP0169 quando a
  chamada vem de dentro de `node_modules` — `lib/url.js` guarda com
  `isInsideNodeModules(4)`, justamente para a aplicação não pagar pela chamada
  depreciada de uma dependência. Conferido nos dois sentidos: o mesmo
  `url.parse("redis://…", true, true)` chamado de um arquivo sob `node_modules`
  fica silencioso; chamado da raiz do repo, avisa.
- **O que quebrava a guarda: o bundle.** O Turbopack inlinava o ioredis dentro
  de `.next/server/chunks/[root-of-the-server]__a1f2d87f._.js`, onde o código
  deixa de estar sob `node_modules`. O `parseURL` minificado está lá
  (`let t=(0,i.parse)(e,!0,!0)`) e o módulo `92509` que ele importa é
  literalmente `t.exports=e.x("url",()=>require("url"))`.
- **A correção:** `serverExternalPackages: ["bullmq", "ioredis"]` no
  `next.config.ts`. É o que o Next documenta para pacote server-only de Node, e
  o `pino` já está na lista default dele pelo mesmo motivo. Depois do rebuild o
  `parseURL` sumiu de todo chunk de servidor, os dois pacotes passaram a
  resolver de `.next/node_modules/`, e chamar o `parseURL` dessa cópia com
  `--trace-deprecation` não emite nada.
- **A causa-raiz é upstream e ainda não dá para pegar.** O ioredis trocou
  `url.parse()` por `new URL()` no PR #2081, lançado na **5.11.0**. O
  `bullmq@5.70.1` fixa `"ioredis": "5.9.3"` **exato**, e a linha 5.x do bullmq
  nunca passou de 5.10.1 — subir só o ioredis duplicaria o pacote e divergiria
  da versão contra a qual o bullmq testa. O `bullmq@6.x` largou a dependência;
  quando essa migração for encarada, a correção vem junto e o
  `serverExternalPackages` continua valendo.
- **O worker não sofria disso.** Build é `tsc` puro, o ioredis fica em
  `node_modules`, a guarda do Node se aplica.
- **O que não deu para verificar aqui:** o build com `output: "standalone"`, que
  o `next.config.ts` desliga no win32. O risco é baixo — `pino` e
  `@prisma/client` já eram externals e já apareciam em `.next/node_modules`
  antes desta mudança, então o caminho de tracing já rodava em produção, e o
  Dockerfile ainda copia `apps/web/node_modules` e o `node_modules` raiz
  inteiros (linhas 54 e 68).
