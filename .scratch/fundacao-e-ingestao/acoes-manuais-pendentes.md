# Ações manuais pendentes — fundação e ingestão

> Atualizado no fechamento do gate 04/05/06 (2026-08-05).

## Ticket 04/06 — Production migration 002 (CRÍTICO)

A migration `20260805000200_authentication_workspace_context` falhou em produção porque `marctco_migrator` não tem `CREATEROLE`. A foundation (001) já está aplicada; o histórico Prisma deixou a 002 como failed/unresolved.

**Ordem obrigatória:**

1. No **Supabase SQL Editor**, autenticado como `postgres`, executar **uma vez** (se o papel já existir, não recriar):

```sql
CREATE ROLE marctco_private_definer NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
```

2. Mesclar o PR de recovery (`ticket/04-recover-private-definer-role`) **ou** re-executar o job **Production migration** na `main` já com o recovery mergeado.

3. O job roda `pnpm db:recover:foundation` (recovery generalizado), marca a 002 como `rolled-back` somente se o papel existir e não houver artefatos residuais da 002, e então `pnpm db:migrate:deploy` reaplica a 002 — o bloco `IF NOT EXISTS` pula o `CREATE ROLE` e conclui grants, policies e `private.resolve_user_workspaces`.

**Sem o SQL do passo 1**, o recovery aborta fail-closed e o deploy não prossegue.

## Adiável para tickets 07 / 15

- **Redis no Railway:** o projeto Railway atual tem apenas `web` e `worker`. BullMQ e o dispatcher (tickets 07 e 15) precisarão de um serviço Redis provisionado na mesma região (`us-west-1`, alinhado ao Supabase).

## Adiável para ticket 17

- **Supabase `app_metadata`:** marcar usuários aptos a provisionar workspace via `app_metadata` no painel Supabase (nunca `user_metadata`). O direito é consumido no provisionamento e só é gravável com `service_role`.

## Já resolvido (referência)

- Papéis `marctco_*` com senhas locais via `pnpm db:roles:local` após `migrate deploy`.
- Variáveis `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` no `.env` local quando for exercitar login de ponta a ponta (não versionar `.env`).
