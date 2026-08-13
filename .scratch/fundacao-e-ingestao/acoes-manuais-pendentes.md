# Ações manuais pendentes — fundação e ingestão

> Atualizado em **2026-08-12**, depois da prova ponta a ponta. O provisionamento
> e o caminho `POST → Person/Opportunity` estão **confirmados em produção**.
> Ver [a-fazer-geral.md](./a-fazer-geral.md) para o que ainda falta (higiene do
> direito pendurado, modelo Google, tamanho da imagem) e [registro.md](./registro.md)
> para a evidência da fatia.
>
> Antes: atualizado em 2026-08-07, na recuperação do build Docker. Production
> migration verde com 12/12 migrations aplicadas.

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

### ~~1. Marcar o usuário em `app_metadata`~~ — ✅ RESOLVIDO em 2026-08-12

**Fechado por evidência mais forte que a marcação: o workspace existe.** A
auditoria de 2026-08-12 leu o Supabase de produção (Admin API) e o Postgres de
produção (papel `marctco_app`, somente leitura) e encontrou o provisionamento
**já concluído**:

| Fato verificado | Valor em produção |
|---|---|
| Usuário | `marciopetigrosso@gmail.com` · `57bbc9aa-5a26-46d0-b766-de78a7471c10` |
| Workspace | **Hugs Assessoria** · `ca942deb-3325-4342-a9e4-425cd56810dc` |
| Slug (segmento de URL, ADR-0012) | `9c096b1a-6bcc-44cc-bb00-22a72139b26d` |
| Associação | `OWNER`, resolvida por `private.resolve_user_workspaces` |
| Funil | `Comercial`, `COMMERCIAL`, `is_default = true` |
| Conexão | `PLUGA`, `ACTIVE`, contrato `v1`, token `••••L9rA`, criada 2026-08-11 18:04:56Z |

Os seis critérios da marcação, cada um conferido contra o código que os aplica
(`apps/web/lib/provisioning-entitlement.ts`):

- [x] `can_provision_workspace` é **booleano `true`** — lido como `true` com
  `typeof boolean`. A checagem é `!== true` estrita (`provisioning-entitlement.ts:37`),
  então a string `"true"` teria falhado, e não falhou.
- [x] `workspace_name` presente e não vazio — `"Hugs Assessoria"`, string, não
  vazia depois do trim (`:42`).
- [x] Está em **`app_metadata`**, e **nada vazou para `user_metadata`** — este
  carrega apenas `email_verified`. Confirmado campo por campo.
- [x] **O logout/login aconteceu** — provado pelo efeito, não pelo relógio: o
  workspace nasceu às 18:04:56Z de 2026-08-11, o que só é possível com um JWT que
  já continha a claim. `last_sign_in_at` é 18:19:49Z.
- [x] **O login não tinha associação quando provisionou** — hoje tem, criada pelo
  próprio provisionamento.
- [x] **O direito foi gasto** — e é por isso que o `true` de hoje é uma
  **re-marcação posterior**, não a original: gastar grava
  `{ can_provision_workspace: false, workspace_name: null }`
  (`apps/web/lib/supabase/admin.ts:36-38`). O `updated_at` do usuário é
  18:19:49Z, igual ao último login, e um `UPDATE` manual no SQL Editor **não move
  `updated_at`** — motivo pelo qual o timestamp não serve como prova de ordem
  aqui, e a prova usada foi a existência do workspace.

**Sequela a limpar (não bloqueia nada, mas é ruído de segurança):** a re-marcação
deixou um direito de provisionar pendurado num login que já é `OWNER`. Hoje é
inócuo — quem tem associação vai para `/access` e nunca provisiona — mas se a
associação fosse removida algum dia, esse login criaria um **segundo** workspace
sem ninguém pedir. Devolver ao estado que o consumo deixa:

```sql
update auth.users
set raw_app_meta_data =
  coalesce(raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('can_provision_workspace', false, 'workspace_name', null)
where email = 'marciopetigrosso@gmail.com';
```

- [x] Direito pendurado revogado (ver `a-fazer-geral.md`, item 2).

**Para o próximo cliente real**, o roteiro da marcação continua válido e mora em
"Ticket 17 — por cliente novo", mais abaixo. O `can_provision_workspace` **não**
deve ser re-marcado neste login: ele já tem o workspace dele.

### ~~2. Lead de teste ponta a ponta~~ — ✅ RESOLVIDO em 2026-08-12

- [x] `POST → outbox → dispatcher → BullMQ → worker → Person` rodou em
      produção. Evidência em `registro.md`, seção "Fatia provada em produção".
- [x] Segredo rotacionado e token em claro em mãos (Direção/`OWNER`).
- [x] `POST` aceito com **200** e `{"status":"accepted"}`.
- [x] Evento visível no histórico da tela de Integrações.
- [x] Lead visível na tela de Leads, com origem e etapa `ENTRY`.
- [x] Retransmissão inerte, quarentena com completar-e-liberar, e conexão
      `LANDING_PAGE` sem `source` no corpo — os três conferidos na UI.

O que a Pluga paga ainda gate é **só o modelo De→Para de Google Lead Form**
(tickets 13 e 14), não este encanamento.

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
