# Ações manuais pendentes — fundação e ingestão

> Atualizado após run 31029997919 (2026-08-05).

## Ticket 06 — Production migration 002 (CRÍTICO)

A migration `20260805000200_authentication_workspace_context` falhou em produção com `permission denied for schema private`. Os passos 1 e 2 (CREATE ROLE + GRANT membership) já foram bootstrapados manualmente; o schema `private` continua owned by `postgres` porque a foundation o criou antes de `SET ROLE marctco_migrator`.

**Ordem obrigatória:**

1. No **Supabase SQL Editor**, autenticado como `postgres`, confirmar que o papel existe (passo do PR #11 — **não recriar** se já existir):

```sql
CREATE ROLE marctco_private_definer NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
```

2. Ainda como `postgres`, confirmar o membership (passo do PR #12 — **não reexecutar** se já existir):

```sql
GRANT marctco_private_definer TO marctco_migrator WITH INHERIT FALSE, SET TRUE;
```

3. Ainda como `postgres`, executar **uma vez** a transferência de ownership do schema:

```sql
ALTER SCHEMA private OWNER TO marctco_migrator;
```

4. Mesclar o PR de recovery (`ticket/06-recover-private-schema-grant`) e re-executar o job **Production migration** na `main` já com o recovery mergeado.

5. O job roda `pnpm db:recover:foundation`, marca a 002 como `rolled-back` somente se o papel existir, o membership estiver concedido, `private` for owned by `marctco_migrator`, e não houver artefatos residuais da 002; então `pnpm db:migrate:deploy` reaplica a 002 — os blocos idempotentes pulam role/membership já bootstrapados, e concluem grants de schema, policies e `private.resolve_user_workspaces`.

**Sem o SQL do passo 3**, o recovery aborta fail-closed e o deploy não prossegue.

## Adiável para tickets 07 / 15

- **Redis no Railway:** o projeto Railway atual tem apenas `web` e `worker`. BullMQ e o dispatcher (tickets 07 e 15) precisarão de um serviço Redis provisionado na mesma região (`us-west-1`, alinhado ao Supabase).

## Adiável para ticket 17

- **Supabase `app_metadata`:** marcar usuários aptos a provisionar workspace via `app_metadata` no painel Supabase (nunca `user_metadata`). O direito é consumido no provisionamento e só é gravável com `service_role`.

## Já resolvido (referência)

- Papéis `marctco_*` com senhas locais via `pnpm db:roles:local` após `migrate deploy`.
- Variáveis `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` no `.env` local quando for exercitar login de ponta a ponta (não versionar `.env`).
