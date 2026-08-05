# Ações manuais pendentes — fundação e ingestão

> Atualizado no fechamento do gate 04/05/06 (2026-08-05).

## Adiável para tickets 07 / 15

- **Redis no Railway:** o projeto Railway atual tem apenas `web` e `worker`. BullMQ e o dispatcher (tickets 07 e 15) precisarão de um serviço Redis provisionado na mesma região (`us-west-1`, alinhado ao Supabase).

## Adiável para ticket 17

- **Supabase `app_metadata`:** marcar usuários aptos a provisionar workspace via `app_metadata` no painel Supabase (nunca `user_metadata`). O direito é consumido no provisionamento e só é gravável com `service_role`.

## Já resolvido (referência)

- Papéis `marctco_*` com senhas locais via `pnpm db:roles:local` após `migrate deploy`.
- Variáveis `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` no `.env` local quando for exercitar login de ponta a ponta (não versionar `.env`).
