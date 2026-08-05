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

## Adiável para ticket 17

- **Supabase `app_metadata`:** marcar usuários aptos a provisionar workspace via `app_metadata` no painel Supabase (nunca `user_metadata`). O direito é consumido no provisionamento e só é gravável com `service_role`.

## Já resolvido (referência)

- Papéis `marctco_*` com senhas locais via `pnpm db:roles:local` após `migrate deploy`.
- Variáveis `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` no `.env` local quando for exercitar login de ponta a ponta (não versionar `.env`).
