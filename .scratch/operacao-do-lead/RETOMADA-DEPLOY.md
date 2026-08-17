# Retomada — deploy da Fase 2 travado na migration

Escrito em 2026-08-14, ao fim da sessão que mergeou o PR #39. Ponto de partida
para quem for destravar o deploy. O handoff de **implementação** é
[PROMPT-HANDOFF.md](./PROMPT-HANDOFF.md); este trata só do deploy.

## Estado — leia antes de tocar em qualquer coisa

**Produção NÃO está quebrada.** Código e banco estão consistentes, ambos
anteriores à Fase 2:

- **Railway (`web` e `worker`): `4d1665f`** — o merge do PR #38, docs. O deploy
  do merge da Fase 2 (`12e5e98`) ficou **SKIPPED** nas duas services, porque o
  job `Production migration` falhou e o Railway não promoveu o build. O
  encadeamento funcionou como devia.
- **Banco de produção: sem nenhuma migration da Fase 2.** A que falhou roda em
  transação, então reverteu inteira.
- `/health` responde 200 e `/access` responde 307 — **`/access` não prova nada**
  sobre a Fase 2: `apps/web/app/access/page.tsx` já existia em `4d1665f`. Uma
  sessão anterior concluiu o contrário a partir dessa rota e errou.

**Não faça rollback.** O build no ar já é o anterior à Fase 2; trocá-lo por
outro mais antigo não conserta nada.

## O que falhou

```
Applying migration `20260814000100_equipe_member_tags`
ERROR: permission denied for schema auth        (SQLSTATE 42501)
CONTEXT: PL/pgSQL function inline_code_block line 3 at IF
```

Run: `31820833855`, job `Production migration`.

O backfill de `display_name`/`email` da Direção lia `auth.users` protegido por
`IF to_regclass('auth.users') IS NOT NULL`. **Esse guard não é um guard.**
`to_regclass` devolve `NULL` para nome inexistente, mas quando o schema existe e
o papel não tem `USAGE` nele — o caso do Supabase gerenciado — ela **levanta**
`permission denied for schema auth`. A linha que deveria proteger é a que mata.

Passou local e no CI porque lá o schema `auth` não existe: `to_regclass` devolve
`NULL` e o bloco é pulado. Só produção tem `auth`.

## O que a branch `fix/fase2-auth-backfill-permission` já faz

1. **Troca o guard** por `pg_catalog.pg_class`/`pg_namespace` (responde "existe?"
   sem tocar no schema) mais `has_schema_privilege` / `has_table_privilege`
   (respondem "posso ler?" sem levantar). Os dois são **aninhados**, não unidos
   por `AND`: o Postgres não promete curto-circuito, e `has_table_privilege`
   sobre tabela inexistente levanta.
   Sem permissão, emite `RAISE WARNING` e segue. Pular o backfill é seguro — as
   colunas são anuláveis e a Equipe mostra a linha da Direção em branco até
   alguém preencher. Perder a migration, e com ela todas as tabelas da Fase 2,
   não é.
2. **Acrescenta duas regras ao `check:migrations`**, para os dois defeitos desta
   série não voltarem: DDL sem `SET ROLE marctco_migrator`, e `to_regclass` sobre
   o schema `auth`.

Verificado localmente, contra o caso exato que falhou: schema `auth` existindo
**sem** `USAGE` para um papel não-superusuário reproduz o mesmo erro com o guard
antigo, e com o novo emite o warning e segue. Com `USAGE` + `SELECT`, entra no
backfill. A série inteira aplica limpa num banco novo.

## O que FALTA, e é o bloqueio real

**A linha da migration falha continua em `_prisma_migrations` de produção**, com
`finished_at` nulo. O Prisma recusa qualquer `migrate deploy` futuro com **P3018**
até alguém resolvê-la:

```bash
pnpm --filter @marctco/db exec prisma migrate resolve \
  --rolled-back 20260814000100_equipe_member_tags
```

Com `DATABASE_URL` = a connection string de produção (o secret
`MIGRATION_DATABASE_URL`). Marcar como *rolled-back* é o correto e é seguro: a
transação de fato reverteu, nada dela ficou no banco.

`pnpm db:recover:foundation`, que roda antes no job de release, **não** resolve
este caso — ele só trata a falha da migration de fundação
(`packages/db/src/foundation-recovery.ts`, `FOUNDATION_MIGRATION_NAME`).

### Ordem para destravar

1. Rodar o `migrate resolve --rolled-back` acima contra produção. Quem tem o
   secret é o CI; localmente exige a URL de produção em mão.
2. Mergear `fix/fase2-auth-backfill-permission`.
3. O job `Production migration` reaplica a série inteira; o Railway então
   promove o build da Fase 2.
4. Confirmar: `prisma migrate status` sem pendência, `railway deployment list`
   com `SUCCESS` no commit novo, e a tela de Leads abrindo logada — ela lê
   `campaign_id`, `campaign_name`, `form_id`, `form_name` e `display_name` **sem
   condição**, então é o teste que prova as migrations da Fase 2 no ar.
5. Preencher `display_name`/`email` da Direção pela Equipe, se o backfill tiver
   sido pulado por falta de permissão.

Alternativa a (1), se preferir não manusear a URL: acrescentar um passo ao job
`release` que roda o `resolve` antes do `migrate deploy`, usando o secret que o
CI já tem. Foi deliberadamente **não** feito nesta sessão — mexer no pipeline de
release sob pressão, para um caso que acontece uma vez, troca um problema
conhecido por um desconhecido.

## Pendência de ambiente

Editar uma migration já aplicada **quebra o checksum nos bancos de dev** que já
a rodaram (as worktrees). Em produção não há problema: lá ela nunca completou. Em
CI não há problema: o banco é efêmero. Quem tiver banco local com a versão antiga
precisa recriá-lo. Foi o preço aceito — a migration **tem** que ser corrigida no
lugar, porque em produção ela vai reexecutar.

## PR aberto

**#41** — `docs/adr-0028-0031-empresa-tag-e-tenant`, os ADRs 0028–0031 e os
tickets 08, 09 e 19. Não foi mergeado: é inofensivo, mas o merge dispararia outro
run de `main` que falha na mesma migration. Mergear depois de destravar, ou
antes, aceitando um run vermelho no job de release.
