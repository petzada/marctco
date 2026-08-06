# Ações manuais pendentes — fundação e ingestão

> Atualizado no fechamento do gate 06 (2026-08-05). Production migration verde:
> https://github.com/petzada/marctco/actions/runs/31031305105 — schema up to date (9/9).

## Já resolvido — Ticket 06 / Production migration 002

Bootstrap humano + recoveries (#11/#12/#13) concluídos:

1. `CREATE ROLE marctco_private_definer ...`
2. `GRANT marctco_private_definer TO marctco_migrator WITH INHERIT FALSE, SET TRUE`
3. `ALTER SCHEMA private OWNER TO marctco_migrator`
4. Production migration aplicou migrations `002`–`009`

## Adiável para tickets 07 / 15

- **Redis no Railway:** o projeto Railway atual tem apenas `web` e `worker`. BullMQ e o dispatcher (tickets 07 e 15) precisarão de um serviço Redis provisionado na mesma região (`us-west-1`, alinhado ao Supabase).

## Ticket 17 — bloqueante ANTES de mesclar o PR

- [ ] **Bootstrap do papel `marctco_provisioner`.** O release aplica migrations como `marctco_migrator`, que não tem `CREATEROLE`. A migration `20260806000100_provision_workspace` falha de propósito, antes de qualquer DDL, com o SQL exato. Executar uma vez no SQL Editor do Supabase **como `postgres`**:

  ```sql
  CREATE ROLE marctco_provisioner NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  GRANT marctco_provisioner TO marctco_migrator WITH INHERIT FALSE, SET TRUE;
  ```

  Feito isso, o job Production migration passa direto. Se o merge acontecer antes, a migration fica `failed` e a retomada é `prisma migrate resolve --rolled-back 20260806000100_provision_workspace` seguida de novo `migrate deploy` — o `pnpm db:recover:foundation` só cobre as migrations `001` e `002`.

- [ ] **`SUPABASE_SERVICE_ROLE_KEY` no Railway (serviço `web`).** É com ela que o provisionamento gasta o direito em `app_metadata`. Sem a variável, `/onboarding` recusa antes de criar qualquer coisa e mostra "a equipe da marctco precisa concluir a configuração" — nenhum workspace nasce com direito pendurado. Nunca expor no cliente nem versionar.

## Ticket 17 — por cliente novo (rotina da equipe técnica)

- [ ] **Marcar o usuário apto no painel Supabase**, em `app_metadata` (nunca `user_metadata`):

  ```json
  { "can_provision_workspace": true, "workspace_name": "Assessoria Exemplo" }
  ```

  **As duas chaves são obrigatórias.** Sem `workspace_name`, a marcação não concede direito nenhum e o usuário continua vendo "seu acesso está sendo preparado" — o nome vem daqui porque as telas do wizard que coletam dados da empresa são de outro ticket. O direito é gasto no provisionamento, antes de o workspace nascer: provisionar de novo exige nova marcação.

## Já resolvido (referência)

- Papéis `marctco_*` com senhas locais via `pnpm db:roles:local` após `migrate deploy`.
- Variáveis `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` no `.env` local quando for exercitar login de ponta a ponta (não versionar `.env`).
