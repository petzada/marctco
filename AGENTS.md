# marctco

CRM de vendas para assessorias de revisional de juros (veículo, imóvel, EP), com operação comercial e jurídica no mesmo workspace.

## Precedência entre documentos

Os documentos conflitam entre si. **Resolva sempre por esta escada — o degrau mais alto vence.**

| # | Documento | Autoridade sobre |
|---|-----------|------------------|
| 1 | [CONTEXT.md](./CONTEXT.md) + [docs/adr/](./docs/adr/) | Nomes de domínio e decisões irreversíveis. Vence tudo; se outro doc contradiz, o outro doc está com bug. Autoridade sobre **código/schema**, não sobre rótulo de UI |
| 2 | [stack-recomendada.md](./stack-recomendada.md) | Técnica: libs, deploy, ORM, fila, auth, isolamento. **Os ADRs 0013 a 0015 supersedem** o que ela diz sobre TanStack Query como padrão de leitura, sobre os cinco papéis e sobre guardar o `raw` sem prazo. **Os ADRs 0020 e 0022 supersedem** “tag também em oportunidades” e “um workspace por grupo”. **Os ADRs 0028 a 0031 supersedem** tag como marca, empresa do grupo como unidade de isolamento, workspace por campanha exclusiva e uma conexão por provedor |
| 3 | [decisao-features-concorrentes.md](./decisao-features-concorrentes.md) | Escopo de features, navegação, UX |
| 4 | [sintese-final.md](./sintese-final.md) + [docs/pesquisa/decisoes.md](./docs/pesquisa/decisoes.md) | Fluxo de produto e regras de negócio não tocadas pelo degrau 3. Mesmo nível: `decisoes.md` detalha `sintese-final.md`, não rivaliza com ele |
| 5 | [docs/pesquisa/](./docs/pesquisa/) (pluga, sintese-manual, concorrentes) | **Nada.** Evidência e referência, nunca autoridade — `pluga.md` descreve o que a Pluga faz, não o que o CRM responde |

[DESIGN.md](./DESIGN.md) é a lei visual, ortogonal à escada.

**Precedência resolve o conflito; o lado perdedor recebe nota de supersessão apontando para quem venceu.** Sem isso, a próxima sessão re-litiga do zero.

## Implementação

Fases 0–2 entregues. Specs em [.scratch/fundacao-e-ingestao/](./.scratch/fundacao-e-ingestao/) (0–1) e [.scratch/operacao-do-lead/](./.scratch/operacao-do-lead/) (2). Fechamento e ações manuais: [.scratch/fechamento-fases-0-2.md](./.scratch/fechamento-fases-0-2.md). Próximo: plano Fase 3. [PROMPT-INICIAL.md](./PROMPT-INICIAL.md) é histórico da fatia que já fechou.

## Ordem de construção

[docs/plano-de-construcao.md](./docs/plano-de-construcao.md) — 8 fases, o veredito de Analytics no MVP, e os itens registrados como abertos. Supersede `sintese-final.md` §13. Os ADRs referenciam as fases pelo número.

## ADRs

| # | Decisão |
|---|---------|
| [0001](./docs/adr/0001-stack-monolito-modular-ts.md) | Stack: monólito modular TypeScript |
| [0002](./docs/adr/0002-workspace-tags-times.md) | Workspace é fronteira de captação; tags em membros organizam times |
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
| [0016](./docs/adr/0016-contexto-de-acesso-e-leitor-escopado.md) | **Contexto de acesso e leitor escopado** — `packages/db` não devolve o client do Prisma |
| [0017](./docs/adr/0017-ingestao-como-decisao-e-plano.md) | **Ingestão é decisão pura; o plano de escrita é dado** — `IntakePlan`, dois chamadores |
| [0018](./docs/adr/0018-marcador-como-modulo.md) | Marcador é módulo de domínio: `markersFor` responde "o que este lead tem" |
| [0019](./docs/adr/0019-resolucao-pre-contexto-e-executor-privado.md) | Resolução pré-contexto: lista fechada de funções privadas (quatro, cinco desde o ticket 15), executor `NOLOGIN` sob `FORCE RLS`, `UserContext` único |
| [0020](./docs/adr/0020-tag-no-membro-define-o-time.md) | **Tag no membro define o time;** tag na oportunidade não se herda |
| [0021](./docs/adr/0021-dois-caminhos-de-nascimento-login-fechado.md) | **Dois caminhos de nascimento;** login fechado — marctco provisiona, Direção cadastra colaborador |
| [0022](./docs/adr/0022-workspace-e-fronteira-de-captacao.md) | **Workspace é fronteira de captação;** emendado: a fronteira é o dono ([ADR-0030](./docs/adr/0030-workspace-e-fronteira-do-dono.md)); tag no membro é o time |
| [0023](./docs/adr/0023-desligamento-desativa-o-vinculo.md) | **Desatrelar** é de um workspace; **desligar** é do quadro — Direção atravessa todos os tenants |
| [0024](./docs/adr/0024-fila-sem-dono-e-da-gestao.md) | **Fila sem dono** é da Gestão e da Direção; Supervisor só reatribui dentro do time |
| [0025](./docs/adr/0025-destino-da-fila-e-supervisor-ou-ator.md) | **Destino da fila** é Supervisor (com tag) ou o próprio ator; Atendente nunca nasce dono direto |
| [0026](./docs/adr/0026-atribuicao-em-massa.md) | **Atribuição em massa:** mesma operação, N linhas, um destino; 1 a 1 permanece |
| [0027](./docs/adr/0027-sem-papel-de-plataforma.md) | **Sem papel de plataforma** — marctco provisiona; os quatro perfis são do cliente |
| [0028](./docs/adr/0028-tag-e-o-time-supervisor-nao-alcanca-supervisor.md) | **Tag é o time** (não "marca ou time"); o time exclui os outros `SUPERVISOR` |
| [0029](./docs/adr/0029-empresa-e-agrupamento-de-equipe.md) | **Empresa agrupa equipes para leitura** — `Company` + `Tag.company_id`; nunca tenant, escopo, RLS ou coluna da Oportunidade |
| [0030](./docs/adr/0030-workspace-e-fronteira-do-dono.md) | **Workspace é fronteira do dono;** campanha exclusiva não abre tenant |
| [0031](./docs/adr/0031-conexao-na-chave-idempotente.md) | **A conexão entra na chave idempotente;** N conexões por provedor |

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
