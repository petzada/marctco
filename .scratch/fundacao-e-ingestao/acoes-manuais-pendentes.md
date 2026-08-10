# Ações manuais pendentes — fundação e ingestão

> Atualizado em 2026-08-07, na recuperação do build Docker. Production migration
> verde com 12/12 migrations aplicadas.

## Resolvido — 2026-08-07, `REDIS_URL` nos dois serviços

Estava ausente em **ambos**, não só no `web` como o item antigo dizia. Setado
por **referência**, não por valor colado, nos dois serviços:

```bash
railway variables --service web    --set 'REDIS_URL=${{Redis.REDIS_URL}}'
railway variables --service worker --set 'REDIS_URL=${{Redis.REDIS_URL}}'
```

Referência e não literal por três motivos: a senha não passa por clipboard nem
por print, rotação de credencial acompanha sozinha, e `redis.railway.internal` é
a rede privada, que não conta egress.

- [x] **`REDIS_URL` no `web`.** O log passou a registrar
  `integration_event_dispatch result="started"`, que só acontece depois de
  `createIngestionQueue()` — a função lança se a variável faltar.
- [x] **`REDIS_URL` no `worker`.** O aviso `REDIS_URL is absent; integration
  events will not be consumed` **sumiu**; o log diz só `worker ready`, e não há
  nenhum `ECONNREFUSED`/`ENOTFOUND` depois de dois minutos no ar.
- **Nota sobre `family`:** não foi preciso mexer no código. A rede privada do
  Railway é IPv6-only e o padrão histórico do ioredis era `family: 4`, mas o
  ioredis 5.9.3 já vem com **`family: 0`** (aceita as duas pilhas). Se um dia a
  versão for fixada para baixo, isto volta a importar.

## Resolvido — 2026-08-07, login em produção

`NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` **não existiam no
serviço `web`**, o que derrubava toda rota autenticada antes de chegar ao
`/onboarding` — e também o consumo do direito, porque
`createSupabaseAdminClient()` exige a URL além da service role key.

- [x] **As duas variáveis setadas no Railway** (pelo dono do projeto).
- [x] **O Dockerfile passou a inliná-las no build.** Setar no serviço não
  bastava: `NEXT_PUBLIC_*` é inlinado pelo Next **no build**, não lido em
  runtime, e o formulário de login é client component. Sem `ARG`/`ENV` no
  Dockerfile, o bundle do browser saía com string vazia e só estourava quando
  alguém clicasse em "Entrar". Só o par público entra ali; a
  `SUPABASE_SERVICE_ROLE_KEY` é lida em runtime e nunca é assada numa camada.
- [x] **O CI prova o inline**, não a existência da variável: constrói a imagem
  com placeholders reconhecíveis e faz `grep` neles em
  `apps/web/.next/static`. Verificado nos dois sentidos antes de subir — a
  imagem corrigida contém os valores, a anterior não.

## 🟡 O que falta — nesta ordem

**O domínio de produção é `https://web-production-33d67.up.railway.app`.** O
endereço com `613e6` que aparece no registro do ticket 01 é antigo e responde
404 do edge do Railway em tudo. Confirme sempre com
`railway variables --service web | grep RAILWAY_PUBLIC_DOMAIN`.

### 1. Marcar o usuário em `app_metadata`

No SQL Editor do Supabase (mais confiável que o campo do painel):

```sql
update auth.users
set raw_app_meta_data =
  coalesce(raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object(
       'can_provision_workspace', true,
       'workspace_name', 'Assessoria Exemplo'
     )
where email = 'pessoa@exemplo.com';
```

- [ ] `can_provision_workspace` é **booleano `true`**, não a string `"true"` — a
  checagem é estrita e aspas anulam a marcação.
- [ ] `workspace_name` é **obrigatório** e não pode ser só espaço; o nome é
  trimado e vazio nega o direito. Marcação sem nome não concede nada.
- [ ] Sempre `app_metadata`, **nunca** `user_metadata` — os dois viajam no mesmo
  JWT, mas `user_metadata` é reescrevível pelo browser com
  `supabase.auth.updateUser()`.
- [ ] **O usuário precisa sair e entrar de novo.** As claims vêm de
  `getClaims()`, do JWT, e `app_metadata` é assado no token na emissão; com o
  token antigo a tela continua dizendo "seu acesso está sendo preparado".
- [ ] Só funciona para um login **sem nenhuma associação** — quem já pertence a
  um workspace é mandado para `/access` e nunca provisiona.
- [ ] O direito é **gasto antes** de o workspace nascer. Se o provisionamento
  falhar depois disso, o log diz `right_spent_without_workspace` e **a marcação
  precisa ser refeita**.

### 2. Lead de teste ponta a ponta

- [ ] `POST → outbox → dispatcher → BullMQ → worker → Person` nunca rodou em
  produção, porque o código dos tickets 07 e 08 só chegou lá em 2026-08-07. O
  que está provado é que o worker **conecta** no Redis e o dispatcher **sobe**;
  o caminho de publicação só é exercitado quando existe evento pendente — numa
  passada com zero eventos o dispatcher nem abre a conexão. **Depende do passo
  1**, porque sem workspace não há conexão de integração e portanto não há token.

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

## Ticket 13 — modelo Google Lead Form (adiável)

- [ ] Conectar uma conta Google real à Pluga e selecionar o gatilho de Google Lead Form.
- [ ] Enviar um lead de teste real e registrar os campos exatos entregues pela Pluga, começando por nome, telefone, e-mail e identificador do lead; não presumir nomes nem IDs a partir da documentação pública truncada.
- [ ] Montar o modelo do contrato `v1` apenas com os campos observados e declarar `GOOGLE_LEAD_FORM` como origem, pois conexões Pluga sem origem explícita usam Meta como padrão.
- [ ] Repetir o envio com o mesmo identificador estável e confirmar que nasce uma única Oportunidade.

Impacto: o endpoint de landing page, as receitas e o caminho compartilhado de ingestão estão prontos; somente o modelo Google permanece indisponível até o teste em conta real.
