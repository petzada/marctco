# Migrations e CI/CD: Prisma dono único, Docker local, Postgres efêmero no CI

**Prisma Migrate é dono único do schema** — policies de RLS são SQL escrito à mão dentro dos arquivos de migration. O desenvolvimento acontece contra **Postgres e Redis em Docker local**, descartáveis. O CI prova cada PR num **Postgres efêmero do GitHub Actions**, sem receber nenhuma credencial de produção. Só depois do merge, um job de release serializado aplica a migration no Supabase e libera o deploy do Railway.

**Status:** accepted · 2026-08-04

## Dono do schema

**Considered option (rejeitada): dono dividido** — Prisma para tabelas/colunas/índices, migrations declarativas do Supabase para policies/functions/triggers. Parece limpo e é armadilha: uma policy referencia uma tabela que precisa existir antes, e **dois históricos de migration independentes não conseguem se ordenar entre si**. O deploy funciona ou quebra conforme a ordem der sorte.

**Considered option (rejeitada): Supabase declarativo como dono**, com Prisma reduzido a cliente sincronizado por `db pull`. Policies ficariam declarativas — vantagem real — mas o `schema.prisma` viraria arquivo derivado que alguém precisa lembrar de regenerar, e um `db pull` esquecido significa tipos mentindo sobre o banco.

`schema.prisma` **não modela RLS** — não expressa policy, `FORCE ROW LEVEL SECURITY`, GUC nem os papéis separados do [ADR-0006](./0006-rls-duas-camadas-guc-worker.md). As policies serão SQL à mão em qualquer cenário; a escolha é só sobre em qual histórico elas vivem. Um histórico, uma ordem.

**Custo assumido:** as policies não são declarativas. Ninguém abre um arquivo e vê o conjunto atual — é preciso ler o histórico. O teste de isolamento no CI compensa isso melhor do que a declaratividade compensaria, porque pega a tabela nova cuja policy alguém esqueceu, que é o erro que revisão humana deixa passar.

## Ambiente local em Docker

**Supersede a decisão anterior de não ter ambiente local.** Existe um `docker-compose.yml` com Postgres e Redis descartáveis. Continua não existindo Supabase local nem projeto Supabase de staging: há **um** projeto Supabase, o de produção.

A proibição anterior custava caro e protegia pouco. Ela nascia de um fato exagerado — de que `prisma migrate dev` "reseta o banco ao detectar drift". Ele **pede confirmação** antes de resetar e, em ambiente não-interativo, falha em vez de resetar. O perigo nunca foi o comando; foi o comando **apontado para produção**.

Com Docker local:

- **`prisma migrate dev` é permitido contra o local**, que é onde ele foi feito para rodar. O shadow database funciona, e a autoria de migration deixa de ser aposta.
- O ciclo de feedback de uma migration cai de um round-trip de CI para segundos. Com agentes de código gerando migrations, essa é a diferença mais cara do projeto.
- Testes puros e prova de RLS rodam antes do push.

**O guard que importa não mudou e é estrutural:** a connection string de produção não existe em `.env` de desenvolvimento, não fica acessível a um agente, e vive apenas no GitHub Environment de produção (migrations) e no Railway (aplicação). Sem a string, o comando catastrófico é impossível — não apenas proibido. O banco local é vazio e descartável; resetá-lo não tem consequência.

## Guards obrigatórios

1. Contra qualquer banco remoto: `prisma migrate dev`, `prisma db push` e qualquer `--force-reset` são proibidos. Produção aceita **apenas `prisma migrate deploy`**, que é forward-only, não reseta e também **não detecta drift**.
2. CI bloqueia `DELETE`, `TRUNCATE`, `DROP COLUMN`, `DROP TABLE` e alterações destrutivas de tipo. `DELETE` e `TRUNCATE` não têm exceção no fluxo de migrations. A única exceção é remover tabela comprovadamente vazia, em migration separada, com aprovação explícita, sem `CASCADE` e com precondição transacional que aborte se existir qualquer linha ou dependência.
3. **Expand/contract é regra dura.** Nunca `NOT NULL` sem default em um passo; nunca constraint única sem verificar duplicata antes; nunca remover coluna na mesma release que para de usá-la.
4. Migrations rodam com a connection string do papel **owner**, distinta da do app — se forem a mesma, o `FORCE ROW LEVEL SECURITY` não protege nada.
5. O seed (funil comercial padrão, com sua etapa `ENTRY` e sua `CLOSING`) é script de seed do Prisma, não migration.
6. **O datamodel do Prisma se limita ao schema `public`.** `auth.*` pertence ao Supabase, e existe um terceiro schema, `private`, que hospeda as três funções `SECURITY DEFINER` da lista fechada do [ADR-0006](./0006-rls-duas-camadas-guc-worker.md) regra 9. `private` é criado e mantido por SQL escrito à mão dentro das migrations e **não** é declarado na datasource: o Prisma não o modela, não o gera e não o compara. Quem prova o conteúdo dele é o Seam 3.
7. **Drift check no CI:** `migrate diff` entre `schema.prisma` e o banco recém-migrado precisa retornar vazio. Sem ele, alguém edita o `schema.prisma` sem gerar a migration correspondente e o CI passa mentindo — erro que agente de código comete com frequência.

   **O que o drift check não cobre precisa ficar dito, senão ele vira falsa segurança:** ele compara o datamodel do Prisma com o banco, e o Prisma não modela policy, função, papel nem grant. Ou seja, **exatamente o SQL que carrega o modelo de segurança está fora do alcance dele** — uma policy derrubada à mão em produção mantém o drift check verde. Quem cobre essa superfície é o Seam 3, varrendo `pg_policies`, `pg_tables`, os atributos dos papéis e a lista de funções `SECURITY DEFINER`. As duas verificações não se substituem: uma olha o schema, a outra olha a segurança.
8. Migration cujo sucesso dependa dos dados existentes traz um **preflight** somente-leitura, executado contra produção antes dela no job de release. A regra vale desde já; a infraestrutura se constrói quando a primeira migration assim for escrita.
9. Migrations de produção rodam uma vez, em job exclusivo e serializado por `concurrency` — nunca no startup do app ou do worker.
10. Nenhum workflow disparado por `pull_request` recebe secret, token ou connection string de produção.
11. **Os papéis nascem dentro das migrations**, de forma idempotente e com nome prefixado (`marctco_migrator`, `marctco_app`, `marctco_worker`) para nunca colidir com os papéis internos do Supabase. **A senha nunca vai numa migration** — o arquivo está no git; a migration cria o papel e concede privilégios, e a senha é definida uma vez por `ALTER ROLE`, fora do versionamento.

    Sem isso há duas topologias e só uma é testada. O CI sobe um Postgres efêmero com um papel só, `postgres`, e a prova de RLS passa — porque `FORCE` se aplica até ao dono — sem nunca verificar que o papel do app **não** tem `BYPASSRLS`, já que esse papel não existe ali. Em produção, o papel é criado à mão, uma vez, e o painel do Supabase oferece pronta para copiar a connection string do `postgres`. Colar aquilo no Railway zera o isolamento com o CI inteiro verde. Papéis nas migrations fazem CI, Docker local e produção derivarem da mesma fonte; a autoverificação de boot do [ADR-0006](./0006-rls-duas-camadas-guc-worker.md) regra 10 fecha o que resta, porque nenhum CI sabe qual string está no Railway.

    **Emenda de 2026-08-05 — bootstrap sob papel gerenciado.** No Supabase, `postgres` tem privilégios administrativos, mas não é superusuário. Criar `marctco_migrator` não basta para executar `SET ROLE`: o criador precisa receber membership explícita `WITH INHERIT FALSE, SET TRUE`, e os grants dos objetos criados devem acontecer antes do `RESET ROLE`. A migration prova esse caminho num Postgres limpo cujo bootstrap tem `CREATEROLE`, mas não `SUPERUSER`. Isto detalha a mesma separação de papéis; não a reverte. O acesso do migrator a `_prisma_migrations` é concedido somente quando a tabela existe: `migrate deploy` a cria antes da aplicação, enquanto o replay no shadow database de `migrate dev` não a cria. A recuperação de uma tentativa failed só pode marcar `rolled-back` depois de uma auditoria mecânica confirmar simultaneamente o erro conhecido e a ausência de roles, schema, tipo e tabelas residuais; qualquer outro estado aborta para inspeção humana.

## Fluxo

```
LOCAL
  docker compose up            Postgres + Redis descartáveis
  prisma migrate dev           permitido contra local, proibido contra remoto
  vitest                       testes puros

PUSH
  pnpm ship                    push da branch + abertura automática do PR
                               main protegida: push direto bloqueado

PR — GitHub Actions, sem nenhum secret de produção
  1  install · prisma generate · typecheck · lint · build
  2  testes puros (Vitest)
  3  Postgres efêmero: prisma migrate deploy, histórico inteiro do zero
  4  drift check: migrate diff schema.prisma ↔ banco = vazio
  5  varredura de DDL destrutiva no SQL das migrations
  6  prova de RLS: enabled + forced + policy + cross-workspace nega leitura e escrita
  7  Redis efêmero: ingestão ponta a ponta
  → branch protection: sem tudo verde, sem merge              ~3 min

MERGE NA MAIN
  8  job de release, concurrency serializada
     GitHub Environment de produção — único lugar com a string de migration
     preflight somente-leitura, quando a migration declarar dependência de dados
     prisma migrate deploy contra o Supabase
  9  verificações pós-migration
  10 Railway (Wait for CI) faz deploy de app e worker           ~1 min
```

**Branch sempre, nunca push direto na main.** Os três não cabem juntos: push direto na main, PR automático e branch protection exigindo CI verde. Branch protection na main bloqueia push direto por definição — e é ela que garante o gate. O PR é aberto pelo mesmo script do push, sem infraestrutura adicional.

**No PR, migration roda só no Postgres efêmero.** Aplicar contra produção durante o PR mudaria o schema antes de o código existir na `main`, e um PR fechado deixaria o banco adiantado em relação ao código.

**Railway nunca antecede a migration verde.** Com `Wait for CI`, o deploy espera o job de release. Sem isso, existe uma janela em que o app novo conversa com o schema antigo. Se preflight ou migration falhar, a release para e a versão anterior continua ativa — por isso toda migration que antecede o deploy precisa ser compatível com a versão anterior do código, e remoções pertencem a uma etapa posterior de expand/contract.

## Testes

O que roda sem tocar produção cobre justamente a lógica mais arriscada — e isso **valida a fronteira do [ADR-0008](./0008-fronteira-conector-dominio.md)**, porque a decisão perigosa ficou toda em função pura: validação tolerante do contrato de entrada, normalização (E.164, DV do CPF, lowercase, moeda), síntese de `external_lead_id`, quarentena, detecção de conflito de identidade e de possível duplicado.

O Postgres efêmero acrescenta o que função pura não alcança: migration aplicando limpa do zero, drift check, a constraint `UNIQUE` sob `ON CONFLICT DO NOTHING` e a prova de isolamento. Essa prova varre `pg_tables` e `pg_policies` e exige, para toda tabela de negócio: RLS habilitada, RLS **forçada**, ao menos uma policy, leitura cross-workspace devolvendo zero linhas e escrita cross-workspace recusada. Acrescenta ainda os atributos dos papéis, a lista fechada de funções `SECURITY DEFINER` e a ausência de referência ativa a registro mesclado — tudo aquilo que o drift check não enxerga.

**Redis também roda como service container.** O teste prova duas fronteiras independentes do [ADR-0007](./0007-ingestao-idempotencia.md): o endpoint confirma `200` após o commit PostgreSQL mesmo com Redis indisponível; depois, com Redis disponível, o dispatcher publica a pendência com `jobId` determinístico e o worker a processa uma única vez no efeito de negócio.

## Custo

| Item | Dinheiro | Tempo |
|---|---|---|
| Postgres + Redis em Docker local | R$ 0 | ~10s para subir |
| GitHub Actions, repositório privado | R$ 0 (2.000 min/mês no free; job de ~3 min) | ~3 min por PR |
| Service containers no runner | R$ 0 | incluso |
| Job de release | R$ 0 | ~1 min |

## Riscos aceitos

1. **Migration dependente de dado não é ensaiada contra dado real.** O Postgres efêmero e o local ensaiam contra banco vazio: pegam sintaxe, ordem, drift e policy faltando, mas não pegam `NOT NULL` sobre tabela populada nem índice único sobre dado já duplicado. Mitigação: expand/contract (guard 3) e preflight (guard 8) quando a migration depender de dados.
2. **Fixtures sintéticas e caminho de upgrade ficam adiados**, com gatilho declarado: entram quando produção tiver dado real do piloto. Hoje o banco está vazio — mantê-las custaria sincronização a cada mudança de schema contra risco zero. Enquanto isso, o risco 1 permanece mitigado apenas por disciplina.
3. **Não existe rede de backup, por decisão consciente.** Enquanto produção estiver vazia, não há o que perder: uma migration ruim se corrige aplicando outra. Preflight não é rollback, e o plano free do Supabase não foi verificado — nada disso importa contra um banco sem dados.

   **Gatilho de reavaliação, obrigatório e verificável: o primeiro lead real de cliente gravado em produção.** A partir desse instante, nenhuma migration nova pode ser aplicada sem que exista backup restaurável — seja `pg_dump` para o R2 dentro do job de release, seja o add-on PITR do Supabase. O gatilho é objetivo justamente para não virar "algum dia": é uma linha na tabela `lead_submissions`.
4. **Postgres comum não reproduz toda a plataforma Supabase.** Cobre schema `public`, constraints, funções do domínio e o desenho de RLS por GUC. Não prova diferenças de Auth, Data API, Storage ou extensões exclusivas; qualquer uso futuro dessas superfícies exige teste específico.
5. **`migrate deploy` não detecta drift.** Mudanças manuais no Dashboard podem fazer produção divergir do histórico mesmo com CI verde; mudanças de schema fora das migrations permanecem proibidas.
