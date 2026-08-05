# 01 — Esqueleto vivo: monorepo, Docker local, CI e deploy

**Blocked by:** None — can start immediately.

**Status:** needs-info

## What to build

Um monorepo que sobe de ponta a ponta. Ao final existe um ambiente local em Docker onde migrações são autoradas em segundos, uma URL no Railway que responde, uma tabela no Supabase criada por migração, e um pipeline no GitHub Actions que — sem receber nenhum secret de produção — prova a migração do zero, checa drift, varre DDL destrutiva, impede o merge se algo falhar, e só libera o Railway depois da migration de produção pós-merge.

O item **A7 deixa de ser risco de premissa**: com Postgres local, `prisma migrate dev` roda onde foi feito para rodar e o shadow database funciona. O que ainda precisa ser confirmado aqui é mecânico, não arquitetural — e são quatro coisas, não duas.

## Acceptance criteria

**Monorepo**

- [x] Monorepo pnpm com `apps/web`, `apps/worker`, `packages/domain`, `packages/db`, sem Turborepo
- [x] Prisma vive em `packages/db`; o client é gerado **antes** do build dos apps
- [x] `.env.example` documenta as variáveis sem conter segredo

**Ambiente local**

- [x] `docker-compose.yml` sobe Postgres e Redis descartáveis, com um comando
- [x] `prisma migrate dev` funciona contra o Postgres local, com shadow database
- [x] Primeira migração cria `Workspace` (com `slug` UUIDv4 único) e `WorkspaceMember`
- [x] Testes puros e prova de RLS rodam localmente antes do push

**Verificações mecânicas (A7)**

- [x] `SET LOCAL` funciona dentro de `$transaction` do Prisma
- [x] Prepared statements funcionam com o pooler em transaction mode (`pgbouncer=true` ou porta de session mode)
- [x] **Comportamento de `$transaction` diante de erro capturado**: confirmar que a violação de unicidade aborta a transação e que `INSERT ... ON CONFLICT DO NOTHING RETURNING id` permite seguir na mesma transação. É o que sustenta o ticket 11 — melhor descobrir aqui ([ADR-0007](../../../docs/adr/0007-ingestao-idempotencia.md))
- [x] **Schema `private` não declarado na datasource não aparece como drift** no `migrate diff` ([ADR-0010](../../../docs/adr/0010-migrations-e-ci-cd.md) guard 6)

Se algum falhar, emende o ADR correspondente registrando o que foi descoberto **antes** de seguir.

**Papéis e autoverificação**

- [x] Papéis criados **dentro das migrations**, idempotentes e prefixados: `marctco_migrator` (dono, DDL), `marctco_app` e `marctco_worker` (sem `BYPASSRLS`)
- [x] **Nenhuma senha em arquivo de migration** — o repositório é público ao time; a senha é definida por `ALTER ROLE`, fora do versionamento
- [x] O mesmo caminho de criação vale para Docker local, CI e produção — uma fonte, três ambientes
- [x] **App e worker abortam o boot** se o papel conectado for superusuário, tiver `BYPASSRLS` ou for dono de tabela de negócio ([ADR-0006](../../../docs/adr/0006-rls-duas-camadas-guc-worker.md) regra 10). É a única defesa contra a connection string errada no Railway, porque nenhum CI sabe qual string está lá
- [x] A mensagem de recusa diz **qual** condição falhou, para o diagnóstico não virar adivinhação

**PII fora da telemetria**

- [x] Serializador central com **lista de permissão**, não de bloqueio: passam `workspace_id`, `integration_event_id`, `source`, `external_lead_id`, mensagem e stack. Bloqueio falharia no primeiro campo desconhecido, e o contrato `v1` preserva de propósito "propriedades desconhecidas" ([ADR-0006](../../../docs/adr/0006-rls-duas-camadas-guc-worker.md) regra 12)
- [x] `beforeSend` do Sentry e serializers/`redact` do `pino` usam esse serializador — **uma configuração, dois consumidores**
- [x] Configurado **antes da primeira rota existir**: depois, cada lugar novo é uma chance de esquecer
- [x] Teste que **falha** se payload cru, `Person` ou submissão inteira aparecerem num evento de erro

**Rate limit**

- [x] Contador **em memória do processo**, sem Redis — limiter com Redis faria a queda da fila recusar lead, derrotando a outbox por um controle acessório ([ADR-0012](../../../docs/adr/0012-contexto-de-tenant-na-url.md))
- [x] **Falha aberta**: erro no próprio limiter deixa a requisição passar
- [x] Aplicado só em falha de autenticação (por IP), endpoint de LP (por token) e tentativa de workspace alheio. Tráfego autenticado da Pluga **não** é limitado, e **nenhum caminho novo devolve 429**
- [x] Ponto de chamada é **uma função só**, para trocar a implementação sem caçar chamadas

**Guards**

- [x] `prisma migrate dev`, `prisma db push` e `--force-reset` proibidos contra qualquer banco remoto; produção aceita apenas `prisma migrate deploy`
- [x] Migrações rodam com a string de conexão do papel **dono**, distinta da do app
- [x] String do papel de migrations existe **só** no GitHub Environment de produção e nunca é exposta a workflow de PR; string da aplicação existe só no Railway; nenhuma vive em `.env` de desenvolvimento

**Push e PR**

- [x] Script de push abre o PR automaticamente na mesma ação
- [x] Branch protection na `main`: push direto bloqueado, merge exige CI verde
- [x] GitHub Actions em cada PR, **sem qualquer secret de produção**: typecheck, lint, build, testes puros
- [x] Postgres efêmero no CI: `prisma migrate deploy` aplica o histórico inteiro do zero
- [x] **Drift check**: `migrate diff` entre `schema.prisma` e o banco migrado retorna vazio
- [x] Varredura de DDL destrutiva no SQL das migrations reprova `DELETE`, `TRUNCATE`, `DROP COLUMN`, `DROP TABLE` e alteração destrutiva de tipo
- [x] **Redis efêmero** disponível no mesmo workflow, para os tickets seguintes

**Release**

- [x] Após merge na `main`, job exclusivo e serializado por `concurrency` aplica `prisma migrate deploy` uma única vez e verifica o resultado
- [x] Railway usa **Wait for CI** e faz deploy de app e worker como serviços separados; migration **não** roda no startup dos serviços
- [ ] Railway e Supabase na **mesma região**

**Fora deste ticket, por decisão registrada**

- [x] Fixtures sintéticas e caminho de upgrade da `main` ficam adiados até produção ter dado real do piloto ([ADR-0010](../../../docs/adr/0010-migrations-e-ci-cd.md) §Riscos aceitos)
- [x] Preflight existe como **regra** (guard 8), não como infraestrutura: a primeira migration que depender de dados existentes constrói o seu
