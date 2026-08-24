# marctco

CRM de vendas para **assessorias de revisional de juros** (veículo, imóvel, EP),
com operação comercial e jurídica no mesmo workspace. Multi-tenant, isolamento
por RLS em duas camadas, ingestão idempotente de leads e canal de primeiro
contato no WhatsApp.

Em produção na Railway: **web** (Next.js) + **worker** (BullMQ) + **Redis**,
sobre Postgres gerenciado no Supabase.

## Como isto se lê

Os documentos deste repositório **conflitam de propósito**, e a ordem em que se
resolvem está em **[AGENTS.md](./AGENTS.md)** — a escada de precedência, a lista
dos 31 ADRs e o estado de implementação. **Comece por lá.**

| Onde | O quê |
|---|---|
| [AGENTS.md](./AGENTS.md) | Escada de precedência, ADRs, estado das fases |
| [CONTEXT.md](./CONTEXT.md) | Linguagem do domínio (PT-BR) e o mapeamento para o código (inglês) |
| [docs/adr/](./docs/adr/) | As 31 decisões irreversíveis. 139 arquivos de código as citam em comentário |
| [DESIGN.md](./DESIGN.md) | Lei visual — tokens, densidade, paleta de dataviz |
| [docs/plano-de-construcao.md](./docs/plano-de-construcao.md) | As 8 fases e os itens registrados como abertos |
| [.scratch/aberto/](./.scratch/aberto/) | **A fila de trabalho viva.** Cinco tickets, e nada além disso |
| [`docs/arquivo-fases-0-4`](https://github.com/petzada/marctco/tree/docs/arquivo-fases-0-4) | Branch congelada: specs, tickets e registros das fatias que já fecharam |

**Antes de qualquer migration, leia o [ADR-0005](./docs/adr/0005-idioma-codigo-en-ui-pt-br.md).**
Model sem linha na tabela de mapeamento é model com nome improvisado.

## Estado

Fases 0 a 4 entregues: fundação, ingestão, operação do lead, tempo e canal.
**Próxima é a Fase 5 (Papel)** — documentos e proposta no card, upload, assinatura
e as vistas globais de Contratos e Documentos.

Antes dela tem precedência o [ticket 19](./.scratch/aberto/19-conexoes-multiplas-por-provedor.md):
a chave idempotente ainda não inclui a conexão, e a segunda landing page passa a
engolir lead em silêncio ([ADR-0031](./docs/adr/0031-conexao-na-chave-idempotente.md)).

## Estrutura

```
apps/web        Next.js 16 · React 19 · Tailwind 4 — telas e route handlers
apps/worker     consumidor BullMQ — ingestão e disparo de canal
packages/domain domínio puro, sem I/O (ADR-0011)
packages/db     Prisma, migrations e as operações nomeadas (ADR-0016)
tests/          costuras ponta a ponta (seams 2 e 4)
scripts/        guardas de migration, drift e fronteira de import
```

`packages/db` **não devolve o client do Prisma** — devolve operações nomeadas
sob contexto de acesso ([ADR-0016](./docs/adr/0016-contexto-de-acesso-e-leitor-escopado.md)),
e `scripts/check-prisma-imports.mjs` falha o lint se alguém furar essa fronteira.

## Rodar local

Requer **Node 24+**, **pnpm 10.32** e Docker.

```bash
pnpm install
pnpm db:up              # Postgres 54329 · PgBouncer 64329 · Redis 63799
pnpm db:migrate:deploy
pnpm --filter @marctco/web dev
```

Copie `.env.example` para `.env`. **A string de conexão de produção não existe em
arquivo** — vive como secret do GitHub Actions e no Railway ([ADR-0010](./docs/adr/0010-migrations-e-ci-cd.md)).

## Testes

```bash
pnpm test          # tudo
pnpm test:unit     # domínio puro, sem banco
pnpm test:db       # integração; exige pnpm db:up
pnpm typecheck && pnpm lint
```

Seis projetos vitest: `domain`, `db`, `a7`, `seam2`, `seam4` e
`managed-migration`. O CI roda os quatro jobs (Quality, Database, Image web,
Image worker) em cada PR, e o release de migration só dispara em push na `main`.

## Contribuir

Branch por ticket — `pnpm ship` recusa rodar a partir da `main`. O tracker é
local: issues são arquivos markdown, e a convenção está em
[docs/agents/issue-tracker.md](./docs/agents/issue-tracker.md).
