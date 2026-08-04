# 01 — Esqueleto vivo: monorepo, Prisma, CI e deploy

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

## What to build

Um monorepo que sobe de ponta a ponta. Ao final existe uma URL no Railway que responde, uma tabela no Supabase criada por migração, e um pipeline no GitHub Actions que aplica as migrações do zero num Postgres efêmero a cada PR e impede o merge se algo falhar.

Este ticket **absorve deliberadamente a verificação do item A7**. Não há ambiente local nem projeto de staging: as migrações precisam ser autoradas **sem banco**, com `prisma migrate diff`. Se esse fluxo não funcionar como o [ADR-0010](../../../docs/adr/0010-migrations-e-ci-cd.md) assume, é aqui que se descobre — e o ADR precisa ser emendado antes de qualquer outro ticket começar. Descobrir isso agora é barato; descobrir no ticket 12 não é.

## Acceptance criteria

- [ ] Monorepo pnpm com `apps/web`, `apps/worker`, `packages/domain`, `packages/db`, sem Turborepo
- [ ] Prisma vive em `packages/db`; o client é gerado **antes** do build dos apps
- [ ] Primeira migração cria `Workspace` e `WorkspaceMember`, **autorada sem banco local**
- [ ] `prisma migrate dev` e `prisma db push` registrados como proibidos no projeto — resetam o banco ao detectar drift
- [ ] Migrações rodam com a string de conexão do papel **dono**, distinta da do app
- [ ] GitHub Actions em cada PR: typecheck, lint, build, e migrações aplicadas do zero num **Postgres efêmero**
- [ ] **Redis efêmero** disponível no mesmo workflow, para os tickets seguintes
- [ ] Branch protection impede merge sem CI verde
- [ ] Railway faz deploy no push para `main`, com app e worker como serviços separados
- [ ] Railway e Supabase na **mesma região**
- [ ] String de conexão de produção existe **só** como secret do GitHub Actions e no Railway — nunca em `.env` de desenvolvimento
- [ ] Prepared statements funcionam com o pooler (`pgbouncer=true` ou porta de session mode)
- [ ] `.env.example` documenta as variáveis sem conter segredo
- [ ] Se a autoria sem banco não funcionar, o ADR-0010 é emendado e a divergência é registrada antes de encerrar o ticket
