# 01 — Esqueleto vivo: monorepo, Docker local, CI e deploy

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

## What to build

Um monorepo que sobe de ponta a ponta. Ao final existe um ambiente local em Docker onde migrações são autoradas em segundos, uma URL no Railway que responde, uma tabela no Supabase criada por migração, e um pipeline no GitHub Actions que — sem receber nenhum secret de produção — prova a migração do zero, checa drift, varre DDL destrutiva, impede o merge se algo falhar, e só libera o Railway depois da migration de produção pós-merge.

O item **A7 deixa de ser risco de premissa**: com Postgres local, `prisma migrate dev` roda onde foi feito para rodar e o shadow database funciona. O que ainda precisa ser confirmado aqui é mecânico, não arquitetural: `SET LOCAL` dentro de `$transaction` do Prisma e prepared statements com o pooler em transaction mode.

## Acceptance criteria

**Monorepo**

- [ ] Monorepo pnpm com `apps/web`, `apps/worker`, `packages/domain`, `packages/db`, sem Turborepo
- [ ] Prisma vive em `packages/db`; o client é gerado **antes** do build dos apps
- [ ] `.env.example` documenta as variáveis sem conter segredo

**Ambiente local**

- [ ] `docker-compose.yml` sobe Postgres e Redis descartáveis, com um comando
- [ ] `prisma migrate dev` funciona contra o Postgres local, com shadow database
- [ ] Primeira migração cria `Workspace` e `WorkspaceMember`
- [ ] Testes puros e prova de RLS rodam localmente antes do push

**Guards**

- [ ] `prisma migrate dev`, `prisma db push` e `--force-reset` proibidos contra qualquer banco remoto; produção aceita apenas `prisma migrate deploy`
- [ ] Migrações rodam com a string de conexão do papel **dono**, distinta da do app
- [ ] String do papel de migrations existe **só** no GitHub Environment de produção e nunca é exposta a workflow de PR; string da aplicação existe só no Railway; nenhuma vive em `.env` de desenvolvimento

**Push e PR**

- [ ] Script de push abre o PR automaticamente na mesma ação
- [ ] Branch protection na `main`: push direto bloqueado, merge exige CI verde
- [ ] GitHub Actions em cada PR, **sem qualquer secret de produção**: typecheck, lint, build, testes puros
- [ ] Postgres efêmero no CI: `prisma migrate deploy` aplica o histórico inteiro do zero
- [ ] **Drift check**: `migrate diff` entre `schema.prisma` e o banco migrado retorna vazio
- [ ] Varredura de DDL destrutiva no SQL das migrations reprova `DELETE`, `TRUNCATE`, `DROP COLUMN`, `DROP TABLE` e alteração destrutiva de tipo
- [ ] **Redis efêmero** disponível no mesmo workflow, para os tickets seguintes

**Release**

- [ ] Após merge na `main`, job exclusivo e serializado por `concurrency` aplica `prisma migrate deploy` uma única vez e verifica o resultado
- [ ] Railway usa **Wait for CI** e faz deploy de app e worker como serviços separados; migration **não** roda no startup dos serviços
- [ ] Railway e Supabase na **mesma região**
- [ ] Prepared statements funcionam com o pooler (`pgbouncer=true` ou porta de session mode)

**Fora deste ticket, por decisão registrada**

- [ ] Fixtures sintéticas e caminho de upgrade da `main` ficam adiados até produção ter dado real do piloto ([ADR-0010](../../../docs/adr/0010-migrations-e-ci-cd.md) §Riscos aceitos)
- [ ] Preflight existe como **regra** (guard 8), não como infraestrutura: a primeira migration que depender de dados existentes constrói o seu
