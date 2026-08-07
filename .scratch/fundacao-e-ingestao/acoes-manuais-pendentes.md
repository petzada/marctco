# Ações manuais pendentes — fundação e ingestão

> Atualizado em 2026-08-07, na recuperação do build Docker. Production migration
> verde com 12/12 migrations aplicadas.

## URGENTE — o deploy estava parado desde 2026-08-05

Produção rodava `26a7843` (era do ticket 03) enquanto o banco já tinha 12
migrations. Os tickets **06, 07, 17 e 08 nunca subiram**: as migrations sobem
pelo job de release do GitHub, independente do Railway, então o schema andou e o
código não. Causa e correção no `registro.md`, seção "Recuperação do build
Docker".

- [ ] **Acompanhar o primeiro deploy depois do merge da recuperação.** É a
  primeira vez que quatro fatias sobem juntas. Conferir `/health` do web em
  `https://web-production-613e6.up.railway.app/health` e `worker ready` nos logs
  do worker.
- [ ] **Conferir o `REDIS_URL` do serviço `web` antes de comemorar** — o item do
  ticket 07 logo abaixo, que nunca chegou a valer porque o código do 07 nunca
  chegou a rodar em produção. Agora vai.
- [ ] **Abrir item para o tamanho da imagem do web (1.49 GB).** O runtime passou
  a copiar `/app/node_modules` inteiro, com devDependencies. `pnpm prune --prod`
  antes do runtime stage, ou `pnpm deploy`, resolve. Não foi feito junto de
  propósito: não se arrisca reabrir um deploy parado há dois dias por uma
  otimização de tamanho.
- [ ] **Vigiar entrega, não só CI.** Nada no pipeline constrói a imagem, então o
  CI ficou verde por dois dias enquanto nada era entregue. O único sinal era o
  painel do Railway. Vale um passo de `docker build` no CI, ou um alerta de
  deploy falho.

## Já resolvido — Ticket 06 / Production migration 002

Bootstrap humano + recoveries (#11/#12/#13) concluídos:

1. `CREATE ROLE marctco_private_definer ...`
2. `GRANT marctco_private_definer TO marctco_migrator WITH INHERIT FALSE, SET TRUE`
3. `ALTER SCHEMA private OWNER TO marctco_migrator`
4. Production migration aplicou migrations `002`–`009`

## Ticket 07 — antes do deploy

- [ ] **`REDIS_URL` também no serviço `web` do Railway.** O dispatcher roda no processo web, não no worker: `private.claim_pending_events` só é executável por `marctco_app`, e o worker não tem `USAGE` no schema `private`. Sem a variável no `web`, o endpoint continua aceitando lead e gravando a outbox — nada se perde —, mas nada é publicado na fila.

## Já resolvido — 2026-08-06

- **Redis no Railway:** provisionado. BullMQ e o dispatcher (tickets 07 e 15) já têm serviço.
- **Bootstrap do papel `marctco_provisioner`:** `CREATE ROLE` + `GRANT … TO marctco_migrator` executados no SQL Editor do Supabase.
- **`SUPABASE_SERVICE_ROLE_KEY`:** configurada no serviço `web` do Railway.

## Ticket 17 — bloqueante ANTES de mesclar o PR

- [x] **Bootstrap do papel `marctco_provisioner`.** Executado em 2026-08-06. O release aplica migrations como `marctco_migrator`, que não tem `CREATEROLE`. A migration `20260806000100_provision_workspace` falha de propósito, antes de qualquer DDL, com o SQL exato. Foi executado uma vez no SQL Editor do Supabase **como `postgres`**:

  ```sql
  CREATE ROLE marctco_provisioner NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  GRANT marctco_provisioner TO marctco_migrator WITH INHERIT FALSE, SET TRUE;
  ```

  Feito isso, o job Production migration passa direto. Se o merge acontecer antes, a migration fica `failed` e a retomada é `prisma migrate resolve --rolled-back 20260806000100_provision_workspace` seguida de novo `migrate deploy` — o `pnpm db:recover:foundation` só cobre as migrations `001` e `002`.

- [x] **`SUPABASE_SERVICE_ROLE_KEY` no Railway (serviço `web`).** Configurada em 2026-08-06. É com ela que o provisionamento gasta o direito em `app_metadata`. Sem a variável, `/onboarding` recusa antes de criar qualquer coisa e mostra "a equipe da marctco precisa concluir a configuração" — nenhum workspace nasce com direito pendurado. Nunca expor no cliente nem versionar.

## Ticket 17 — por cliente novo (rotina da equipe técnica)

- [ ] **Marcar o usuário apto no painel Supabase**, em `app_metadata` (nunca `user_metadata`):

  ```json
  { "can_provision_workspace": true, "workspace_name": "Assessoria Exemplo" }
  ```

  **As duas chaves são obrigatórias.** Sem `workspace_name`, a marcação não concede direito nenhum e o usuário continua vendo "seu acesso está sendo preparado" — o nome vem daqui porque as telas do wizard que coletam dados da empresa são de outro ticket. O direito é gasto no provisionamento, antes de o workspace nascer: provisionar de novo exige nova marcação.

## Já resolvido (referência)

- Papéis `marctco_*` com senhas locais via `pnpm db:roles:local` após `migrate deploy`.
- Variáveis `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` no `.env` local quando for exercitar login de ponta a ponta (não versionar `.env`).
