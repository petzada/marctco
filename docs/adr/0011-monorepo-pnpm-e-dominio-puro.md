# Monorepo com pnpm workspaces e pacote de domínio puro

Dois apps e dois pacotes, orquestrados por **pnpm workspaces sem Turborepo**. `packages/domain` é **puro** — não importa Prisma, não faz I/O, não toca a rede: recebe dado, devolve decisão.

**Status:** accepted · 2026-08-04

```
apps/
  web/          Next.js — telas, rotas, auth
  worker/       Node + BullMQ — conectores, jobs
packages/
  domain/       PURO: schemas Zod, normalização, regras de decisão, módulo de
                ingestão (IntakePlan), marcadores, catálogo de flags
  db/           Prisma schema, migrations, e as operações nomeadas que recebem
                AccessContext — o client fica interno (ADR-0016)
```

## Por que sem Turborepo

Turborepo resolve orquestração de grafo de tarefas e cache de build. Com dois apps e dois pacotes o grafo é trivial e o CI está em 2–3 min — seria configuração paga para otimizar o que ainda não dói.

**Gatilho registrado para adotar depois:** quando o build de deploy do Railway incomodar. `turbo prune` gera um subconjunto do monorepo por serviço; sem ele, cada build instala o monorepo inteiro. Adotar é aditivo, então começar sem não tem custo de reversão.

## Por que `domain` é puro

**Não é preferência arquitetural — é requisito do [ADR-0010](./0010-migrations-e-ci-cd.md).** Aquele ADR trava testes de CI sem banco, e a lista do que roda lá é contrato `v1`, normalização, síntese de `external_lead_id`, quarentena e decisões de revisão de identidade/duplicidade. Se `domain` importasse Prisma, esses testes passariam a exigir banco e o desenho de CI deixaria de fechar.

Concretamente: `decideReuseOfPerson(candidates, normalizedLead)` recebe os candidatos **já buscados** e devolve a decisão. Quem foi ao banco foi o worker.

*Emendado pelo [ADR-0017](./0017-ingestao-como-decisao-e-plano.md).* A frase acima respondia "o domínio consulta?" — e responde bem. Ela deixava em aberto **quem decide o que buscar**, e por omissão isso caiu no worker: metade da regra de identidade ficou fora do módulo que a documenta. O domínio passa a devolver também o `PersonLookupPlan`, que descreve a busca como dado; quem a executa continua sendo `packages/db`. A pureza e o argumento de segurança deste ADR não mudam — um domínio que descreve a consulta continua sem conseguir fazê-la.

**Efeito colateral em segurança, e ele é positivo:** um `domain` que não consegue consultar não consegue consultar sem escopo. Todo acesso a dado fica em `packages/db`, que é onde mora o helper com `SET LOCAL app.workspace_id` do [ADR-0006](./0006-rls-duas-camadas-guc-worker.md). "Todo mundo precisa lembrar de escopar" vira um ponto de estrangulamento auditável. Um domínio que importasse Prisma teria N lugares capazes de vazar.

A pureza **não** prova isolamento — teste de função pura nunca prova RLS. Por isso a prova contra o Postgres efêmero existe em separado. `domain` prova a regra; o efêmero prova o isolamento.

## O que não é compartilhado

**Os conectores ficam em `apps/worker`.** O [ADR-0008](./0008-fronteira-conector-dominio.md) já os colocou no worker, e pacote com um consumidor só é cerimônia sem enforcement. Exceção: os **payloads de exemplo** do botão "enviar lead de teste" (`pluga.md` §Tela item 8) são JSON estático e moram em `domain`, para o app usar.

**O módulo de ingestão, ao contrário do conector, tem dois consumidores** — o job do worker e o "completar e liberar" da tela de Integrações — e por isso mora em `packages/domain` ([ADR-0017](./0017-ingestao-como-decisao-e-plano.md)). É a mesma régua aplicada a um caso diferente: um consumidor é pasta, dois é pacote.

Se um `CsvImportConnector` aparecer rodando no app, aí vira pacote. Mover pasta para pacote é barato; desmontar pacote prematuro não é.

**Consequences:** o Prisma Client é gerado dentro de `packages/db` e ambos os apps dependem desse artefato. O `postinstall` precisa garantir `prisma generate` **antes** do build dos apps — erro clássico de monorepo com Prisma, que aparece no primeiro deploy do Railway e não em desenvolvimento.
