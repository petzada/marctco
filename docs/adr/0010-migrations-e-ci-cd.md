# Migrations e CI/CD: Prisma dono único, Postgres efêmero no CI, Supabase só em produção

**Prisma Migrate é dono único do schema** — policies de RLS são SQL escrito à mão dentro dos arquivos de migration. Não existe ambiente local nem projeto Supabase de staging: há **um** banco, o de produção. A rede de segurança é um **Postgres efêmero no GitHub Actions**, criado do zero a cada PR, onde as migrations rodam e o isolamento por RLS é provado antes de qualquer merge.

**Status:** accepted · 2026-08-04

## Dono do schema

**Considered option (rejeitada): dono dividido** — Prisma para tabelas/colunas/índices, migrations declarativas do Supabase para policies/functions/triggers. Parece limpo e é armadilha: uma policy referencia uma tabela que precisa existir antes, e **dois históricos de migration independentes não conseguem se ordenar entre si**. O deploy funciona ou quebra conforme a ordem der sorte.

**Considered option (rejeitada): Supabase declarativo como dono**, com Prisma reduzido a cliente sincronizado por `db pull`. Policies ficariam declarativas — vantagem real — mas o `schema.prisma` viraria arquivo derivado que alguém precisa lembrar de regenerar, e um `db pull` esquecido significa tipos mentindo sobre o banco.

`schema.prisma` **não modela RLS** — não expressa policy, `FORCE ROW LEVEL SECURITY`, GUC nem os papéis separados do [ADR-0006](./0006-rls-duas-camadas-guc-worker.md). As policies serão SQL à mão em qualquer cenário; a escolha é só sobre em qual histórico elas vivem. Um histórico, uma ordem.

**Custo assumido:** as policies não são declarativas. Ninguém abre um arquivo e vê o conjunto atual — é preciso ler o histórico. O teste de isolamento no CI compensa isso melhor do que a declaratividade compensaria, porque pega a tabela nova cuja policy alguém esqueceu, que é o erro que revisão humana deixa passar.

## Sem ambiente local, sem staging

Existe **um** banco Supabase: produção. Sem Postgres local, sem segundo projeto.

**Como se gera migration sem banco:** `prisma migrate dev` exige um shadow database. Sem banco local, o caminho é **`prisma migrate diff`**, que gera o SQL comparando dois estados de schema sem banco nenhum; as policies são acrescentadas à mão no mesmo arquivo, e o CI prova o conjunto no Postgres efêmero. *(Flags exatas a confirmar antes da Fase 0.)*

**`prisma migrate dev` é proibido no projeto.** Ele **reseta o banco** ao detectar drift — comportamento documentado, não acidente. Contra o Supabase, apenas `prisma migrate deploy`, que é forward-only e nunca reseta.

**O guard principal é estrutural, não política:** a connection string de produção existe **só** como secret do GitHub Actions e no Railway. Nunca num `.env` de desenvolvimento, nunca acessível a um agente. Sem a string, o comando catastrófico é impossível — não apenas proibido.

## Guards obrigatórios

1. `prisma migrate dev`, `prisma db push` e qualquer `--force-reset` são proibidos contra o remoto.
2. CI varre o SQL das migrations em busca de DDL destrutiva (`DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, `DELETE` sem `WHERE`) e **falha**, salvo marcador explícito no arquivo declarando o motivo.
3. **Expand/contract é regra dura.** Nunca `NOT NULL` sem default em um passo; nunca constraint única sem verificar duplicata antes; nunca remover coluna na mesma release que para de usá-la.
4. Migrations rodam com a connection string do papel **owner**, distinta da do app — se forem a mesma, o `FORCE ROW LEVEL SECURITY` não protege nada.
5. O seed (funil comercial padrão com sua etapa `ENTRY`) é script de seed do Prisma, não migration.
6. Prisma se limita ao schema `public`; `auth.*` pertence ao Supabase.

## Fluxo

```
branch → commit → PR
  │
  ├─ GitHub Actions (Postgres + Redis efêmeros, criados do zero)
  │    typecheck · lint · build
  │    testes puros: normalização, conectores, síntese de id,
  │                  quarentena, reúso de Person, schemas Zod
  │    prisma migrate deploy  ← migrations do zero
  │    prova de RLS: workspace A não lê B
  │    varredura de DDL destrutiva
  │
  └─ branch protection: sem CI verde, sem merge
       │
       merge na main → Railway detecta o push → deploy
```

**A validação roda no PR, antes do merge.** Validar depois do merge é validar código que já está na `main`.

## Testes

O que roda sem tocar produção cobre justamente a lógica mais arriscada — e isso **valida a fronteira do [ADR-0008](./0008-fronteira-conector-dominio.md)**, porque a decisão perigosa ficou toda em função pura: normalização (E.164, DV do CPF, lowercase), mapeamento de cada conector, síntese de `external_lead_id`, decisão de quarentena, decisão de reúso de Person, schemas Zod.

O Postgres efêmero acrescenta o que função pura não alcança: migration aplicando limpa do zero, a constraint `UNIQUE` sob insert-and-catch, e a prova de isolamento. Essa prova varre `pg_tables` e `pg_policies` e exige, para toda tabela de negócio: RLS habilitada, RLS **forçada**, ao menos uma policy, e leitura cross-workspace devolvendo zero linhas.

**Redis também roda como service container**, pelo mesmo mecanismo. Sem ele, o teste de ingestão precisaria executar o processor inline e deixaria de provar a ordem `persiste → enfileira → 202` que o [ADR-0007](./0007-ingestao-idempotencia.md) travou — uma das decisões mais deliberadas do desenho.

Custo: nenhum além dos minutos normais de Actions — o job fica em ~2–3 min.

## Riscos aceitos

1. **Falha de migration dependente de dado.** O Postgres efêmero ensaia contra banco **vazio**: pega sintaxe, ordem e policy faltando, mas não pega `NOT NULL` sobre tabela populada nem índice único sobre dado já duplicado. Migration do Prisma que falha no meio fica marcada como falha e **bloqueia todas as seguintes** até resolução manual. Mitigação: expand/contract (guard 3).
2. **A rede sob esse risco é o backup do Supabase, e o plano é free.** PITR é add-on pago. **Verificar o que o plano free realmente garante** antes de tratar backup como rede — se não garantir, o risco 1 não tem desfazer.
3. Migration é aplicada em produção sem ensaio contra dado real. Aceito conscientemente em troca de simplicidade operacional; a decisão deve ser reavaliada quando o volume de dados do piloto tornar a restauração custosa.
