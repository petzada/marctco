# marctco

CRM de vendas para assessorias de revisional de juros (veículo, imóvel, EP), com operação comercial e jurídica no mesmo workspace.

## Precedência entre documentos

Os documentos conflitam entre si. **Resolva sempre por esta escada — o degrau mais alto vence.**

| # | Documento | Autoridade sobre |
|---|-----------|------------------|
| 1 | [CONTEXT.md](./CONTEXT.md) + [docs/adr/](./docs/adr/) | Nomes de domínio e decisões irreversíveis. Vence tudo; se outro doc contradiz, o outro doc está com bug. Autoridade sobre **código/schema**, não sobre rótulo de UI |
| 2 | [stack-recomendada.md](./stack-recomendada.md) | Técnica: libs, deploy, ORM, fila, auth, isolamento. **Os ADRs 0013 a 0015 supersedem** o que ela diz sobre TanStack Query como padrão de leitura, sobre os cinco papéis e sobre guardar o `raw` sem prazo |
| 3 | [decisao-features-concorrentes.md](./decisao-features-concorrentes.md) | Escopo de features, navegação, UX |
| 4 | [sintese-final.md](./sintese-final.md) + [docs/pesquisa/decisoes.md](./docs/pesquisa/decisoes.md) | Fluxo de produto e regras de negócio não tocadas pelo degrau 3. Mesmo nível: `decisoes.md` detalha `sintese-final.md`, não rivaliza com ele |
| 5 | [docs/pesquisa/](./docs/pesquisa/) (pluga, sintese-manual, concorrentes) | **Nada.** Evidência e referência, nunca autoridade — `pluga.md` descreve o que a Pluga faz, não o que o CRM responde |

[DESIGN.md](./DESIGN.md) é a lei visual, ortogonal à escada.

**Precedência resolve o conflito; o lado perdedor recebe nota de supersessão apontando para quem venceu.** Sem isso, a próxima sessão re-litiga do zero.

## Implementação

Começa em [PROMPT-INICIAL.md](./PROMPT-INICIAL.md) — prompt para abrir a sessão. Spec e 17 tickets em [.scratch/fundacao-e-ingestao/](./.scratch/fundacao-e-ingestao/).

## Ordem de construção

[docs/plano-de-construcao.md](./docs/plano-de-construcao.md) — 8 fases, o veredito de Analytics no MVP, e os itens registrados como abertos. Supersede `sintese-final.md` §13. Os ADRs referenciam as fases pelo número.

## ADRs

| # | Decisão |
|---|---------|
| [0001](./docs/adr/0001-stack-monolito-modular-ts.md) | Stack: monólito modular TypeScript |
| [0002](./docs/adr/0002-workspace-tags-times.md) | Workspace único do grupo + tags para times/filiais |
| [0003](./docs/adr/0003-whatsapp-instancia-unica-gatilho-atribuicao.md) | WhatsApp: instância única, mensagem disparada na atribuição |
| [0004](./docs/adr/0004-fronteira-flag-configuracao-estado.md) | Fronteira entre feature flag, configuração de workspace e estado |
| [0005](./docs/adr/0005-idioma-codigo-en-ui-pt-br.md) | **Código em inglês, UI e glossário em PT-BR** — contém o mapeamento canônico de nomes |
| [0006](./docs/adr/0006-rls-duas-camadas-guc-worker.md) | Isolamento multi-tenant: duas camadas, GUC, worker sob RLS |
| [0007](./docs/adr/0007-ingestao-idempotencia.md) | **Ingestão, outbox, identidade e duplicidade** — o ponto mais irreversível do sistema |
| [0008](./docs/adr/0008-fronteira-conector-dominio.md) | Contrato canônico `v1` e fronteira conector/domínio |
| [0009](./docs/adr/0009-etapas-editaveis-papeis-e-status.md) | Funis independentes do financiamento, papéis de etapa, roteamento e handoff humano |
| [0010](./docs/adr/0010-migrations-e-ci-cd.md) | Migrations e CI/CD: Docker local, Postgres efêmero no CI, release serializado |
| [0011](./docs/adr/0011-monorepo-pnpm-e-dominio-puro.md) | Monorepo pnpm e pacote de domínio puro |
| [0012](./docs/adr/0012-contexto-de-tenant-na-url.md) | Contexto de tenant no segmento de URL, `slug` UUIDv4, 404 uniforme, rate limit em memória |
| [0013](./docs/adr/0013-fluxo-de-dados-no-app.md) | **Fluxo de dados:** Server Component lê, route handler escreve, paginação keyset, condição arbitra escrita concorrente |
| [0014](./docs/adr/0014-copia-unica-e-retencao-do-payload.md) | Cópia única do payload e expiração em 90 dias |
| [0015](./docs/adr/0015-perfis-de-acesso-e-escopo.md) | **Perfis de acesso:** Atendente, Supervisor, Gestão, Direção — escopo por tela |

**Antes de qualquer migration, leia [ADR-0005](./docs/adr/0005-idioma-codigo-en-ui-pt-br.md).** Model sem linha na tabela de mapeamento é model com nome improvisado.

## Agent skills

### Issue tracker

Issues e specs vivem como arquivos markdown em `.scratch/<feature>/` neste repo — não há tracker externo. See `docs/agents/issue-tracker.md`.

### Triage labels

Os cinco papéis canônicos, sem renomeação — gravados como `Status:` no topo de cada arquivo de issue. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: um `CONTEXT.md` na raiz e ADRs em `docs/adr/`. See `docs/agents/domain.md`.

### Frontend UI

Ao implementar UI (shadcn/Tailwind), seguir a skill **design-taste-frontend** (registrada na stack travada).
