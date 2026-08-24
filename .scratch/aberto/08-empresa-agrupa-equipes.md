# 08 — Empresa agrupa equipes

**What to build:** A sub-empresa do grupo (ACR, REAL) passa a existir como agrupamento de equipes: uma `Company` por workspace e uma `Tag.company_id` que aponta a equipe para a empresa. A Direção escolhe a empresa no mesmo gesto em que cria a tag, na Equipe. Empresa é **dimensão de leitura**: não isola dado, não decide escopo, não roteia lead e não é coluna da Oportunidade ([ADR-0029](../../docs/adr/0029-empresa-e-agrupamento-de-equipe.md)).

**Blocked by:** 03a — Equipe: schema, tags e operações · 03b — Equipe: tela e convite (as duas já em `main`)

**Status:** ready-for-agent

## Por que agora e não na Fase 7

As tags nascem na Fase 2, com usuários reais aplicando-as. Classificar depois não é migration — é reclassificar à mão rótulos já em uso pela operação, com a fila rodando em cima deles.

O **número** que a Direção quer ("o atendente X faturou R$, e ele é da ACR") continua bloqueado por honorários, que derivam da análise de cabimento — item A10 do [plano](../../docs/plano-de-construcao.md), Fase 7. Este ticket entrega a dimensão, não o relatório.

## Acceptance criteria

- [ ] Model `Company`: `id`, `workspace_id`, `name`, `created_at`. Unicidade por `(workspace_id, lower(name))` na migration, como a `Tag` — o schema DSL não expressa índice único por expressão
- [ ] `Tag.company_id` **anulável**, FK composta `(workspace_id, company_id)` → `Company(workspace_id, id)`, `ON DELETE RESTRICT`: apagar empresa que ainda tem equipe é erro, não cascata silenciosa
- [ ] Nomes das FKs seguem a derivação do Prisma (`<tabela>_<colunas>_fkey`) — a migration do 03a divergiu disso e reprovou o `db:drift`
- [ ] Expand/contract: coluna anulável, `Company` nasce vazia, nenhuma tag existente quebra ([ADR-0010](../../docs/adr/0010-migrations-e-ci-cd.md))
- [ ] Mapeamento do [ADR-0005](../../docs/adr/0005-idioma-codigo-en-ui-pt-br.md) já traz `Company` e `Tag.company_id` — conferir antes da migration, não depois
- [ ] Seam 3: `Company` sob RLS habilitada **e forçada**, policy de isolamento pelo GUC, índice começando por `workspace_id`
- [ ] Operação nomeada para criar empresa e para listar as do workspace, recebendo `UserContext`. Cadastrar e editar empresa é da **Direção**; listar alcança quem já alcança a Equipe
- [ ] A tela Equipe passa a oferecer a empresa ao criar a tag — mesmo gesto, sem tela de taxonomia em Configurações ([ADR-0020](../../docs/adr/0020-tag-no-membro-define-o-time.md))
- [ ] Tag sem empresa continua válida e continua computando time: a empresa é opcional e nunca condiciona escopo
- [ ] **Nenhuma operação de escopo, RLS, roteamento ou permissão lê `company_id`.** O Seam 3 é onde isso vira teste, não comentário
- [ ] O membro **não** ganha coluna de empresa. A empresa de uma pessoa é a das equipes dela, derivada — é a ausência do campo que impede alguém de usá-lo como eixo de permissão
- [ ] `listTeam` devolve a empresa junto da tag, para a Equipe exibir "Time do João · ACR" sem segunda consulta por linha

## Fora deste ticket

Relatório por empresa, faturamento, honorários, ranking (Fase 7). Snapshot de responsável/equipe/empresa no Ganho (Fase 6). Empresa na Oportunidade — **nunca**, não é adiamento. Filtro por empresa na tabela de Leads: só quando houver relatório que o justifique; o filtro por equipe do ticket 06 já cobre a operação.
