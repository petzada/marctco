# Ações manuais pendentes — fundação e ingestão

> Atualizado em 2026-08-07, na recuperação do build Docker. Production migration
> verde com 12/12 migrations aplicadas.

## 🔴 BLOQUEANTE — `REDIS_URL` ausente nos DOIS serviços

**A ingestão está meio viva em produção.** O endpoint aceita lead e grava a
outbox no PostgreSQL — nada se perde, é o desenho do ADR-0007 —, mas **nada é
despachado nem consumido**. Os leads ficam parados com `dispatch_status = PENDING`.

Verificado em 2026-08-07, com o deploy já verde:

- `railway variables --service web` **não tem** `REDIS_URL`;
- o log do worker diz, textualmente: `REDIS_URL is absent; integration events
  will not be consumed`.

O item antigo dizia "falta no `web`". Estava incompleto: **falta nos dois**. O
serviço Redis existe no Railway desde 2026-08-06; o que falta é referenciá-lo.

- [ ] **`REDIS_URL` no serviço `web`.** O dispatcher roda no processo web, não no
  worker: `private.claim_pending_events` só é executável por `marctco_app`, e o
  worker não tem `USAGE` no schema `private`. Sem isso, nada sai da outbox.
- [ ] **`REDIS_URL` no serviço `worker`.** Sem isso o worker sobe, passa no
  healthcheck e **não consome fila nenhuma** — que é o estado de agora.
- [ ] **Depois de setar as duas:** postar um lead de teste no endpoint e conferir
  que ele vira Pessoa. Esse caminho nunca foi exercitado ponta a ponta em
  produção, porque o código do ticket 07 só chegou lá hoje.

## Resolvido — 2026-08-07, recuperação do deploy

O deploy do Railway falhava desde 2026-08-05: produção rodava `26a7843` (era do
ticket 03) enquanto o banco já tinha 12 migrations, e os tickets **06, 07, 17 e
08 nunca tinham subido**. Causa e correção no `registro.md`, seção "Recuperação
do build Docker".

- [x] **Build corrigido e deployado.** `6ff4724` ativo nos dois serviços,
  `/health` do web em 200, worker registrando `worker ready`.
- [x] **O CI passou a construir e a executar as imagens** (job `Image`, matriz
  web/worker), e o gate `CI` exige o resultado dele. Era o buraco que deixou
  quatro tickets fora do ar com o CI verde: `pnpm install` num checkout completo
  não é o install que o Dockerfile roda, e build que passa não é processo que
  sobe. O job **executa** a imagem e normaliza um telefone dentro dela.

## Item aberto — tamanho da imagem (não bloqueante)

- [ ] **Web em ~1.5 GB, worker em ~1.3 GB.** O runtime copia `/app/node_modules`
  inteiro, com devDependencies. **`pnpm prune --prod` foi tentado em 2026-08-07 e
  não serve:** recusa rodar sem TTY porque **remove e reinstala** o diretório de
  módulos, o que levaria junto o client do Prisma gerado no build — e essa falha
  apareceria na primeira query em produção, não no build. O caminho é
  `pnpm deploy --filter @marctco/web --prod` montando uma árvore auto-contida, e
  isso merece passada de teste própria.

## Já resolvido — Ticket 06 / Production migration 002

Bootstrap humano + recoveries (#11/#12/#13) concluídos:

1. `CREATE ROLE marctco_private_definer ...`
2. `GRANT marctco_private_definer TO marctco_migrator WITH INHERIT FALSE, SET TRUE`
3. `ALTER SCHEMA private OWNER TO marctco_migrator`
4. Production migration aplicou migrations `002`–`009`

## Ticket 07 — `REDIS_URL`

Promovido para o topo deste arquivo em 2026-08-07, quando se descobriu que falta
nos **dois** serviços e não só no `web`. Ver a seção bloqueante lá em cima.

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
