# 12 — Tela de Leads

**Blocked by:** 09, 04, 02, 10, 11

**Status:** done

## What to build

O gestor abre **Leads** e vê a lista chegando. É a primeira superfície em que o trabalho dos tickets anteriores se torna visível para quem paga pelo produto.

Tabela **paginada**, não Kanban: a lista geral é de triagem em volume alto, e o quadro Kanban pertence a "Meus leads" do atendente, que é da Fase 2.

Na UI o card se chama **Lead**; no domínio é sempre Oportunidade. Não existe segundo substantivo no meio do funil comercial. Ver [CONTEXT.md](../../../CONTEXT.md) e [ADR-0005](../../../docs/adr/0005-idioma-codigo-en-ui-pt-br.md).

## Acceptance criteria

- [x] Tabela paginada mostrando exclusivamente leads do workspace do usuário, na rota `/workspace/:slug/leads` ([ADR-0012](../../../docs/adr/0012-contexto-de-tenant-na-url.md))
- [x] **Leitura em Server Component**, chamando `listLeads(ctx, cursor, filters)` de `packages/db`; **nenhum endpoint** para a listagem ([ADR-0013](../../../docs/adr/0013-fluxo-de-dados-no-app.md))
- [x] A tela **não** monta consulta: keyset, índice parcial e escopo do `ATTENDANT` vivem dentro de `listLeads` e `countLeadsByMarker`. Uma tela que pudesse escrever `skip:` passaria no CI inteiro, e o defeito seria lead sumindo da triagem em silêncio ([ADR-0016](../../../docs/adr/0016-contexto-de-acesso-e-leitor-escopado.md))
- [x] Filtros, cursor e marcador ativo vivem na **URL** via `nuqs` — de quebra, toda vista vira link compartilhável com o time
- [x] **Paginação keyset por `(arrived_at, id)`**, nunca `OFFSET`. Com lead entrando no topo a cada poucos minutos, `OFFSET` faz a lista deslocar entre uma página e outra: o gestor revê um lead e **nunca vê** o que caiu na fronteira. É correção, não desempenho
- [x] Sem "página N de M" e sem `COUNT(*)` de total geral — o keyset não precisa deles
- [x] Índice parcial da lista: `(workspace_id, arrived_at DESC, id DESC) WHERE merged_into_opportunity_id IS NULL`
- [x] Um índice parcial **por marcador**, servindo filtro e contador: contar sobre subconjunto é barato, contar a tabela toda não é
- [x] Índice em `IntakeReview (workspace_id, opportunity_id)` para as não resolvidas — os marcadores não moram todos no mesmo lugar e o ícone único precisa dos três
- [x] Página e contadores buscados em paralelo, com a tabela transmitindo antes dos agregados
- [x] Indicador de **"N novos leads — atualizar"** por consulta periódica de contagem; a lista **não** se remexe sozinha sob o cursor. Realtime do Supabase não é opção aqui ([ADR-0006](../../../docs/adr/0006-rls-duas-camadas-guc-worker.md) regra 8)
- [x] `ATTENDANT` vê nesta tela apenas oportunidade atribuída a si ([ADR-0015](../../../docs/adr/0015-perfis-de-acesso-e-escopo.md))
- [x] Colunas: nome, contatos, tipo de financiamento, instituição, origem e data de chegada
- [x] Numerais tabulares em qualquer coluna de data ou valor
- [x] Duas oportunidades abertas da mesma Pessoa usam o conjunto de dados disponível do financiamento para se distinguir; instituição isolada não é prova
- [x] Leads com revisão pendente **aparecem normalmente** na tabela — nunca escondidos numa fila
- [x] **Um lead, um ícone**: todos os avisos de um lead (sem telefone, identidade em conflito, possível duplicado, e o que as fases seguintes acrescentarem) são alcançados por um **único** ponto de entrada na linha e no card, que abre a lista. Três avisos são um ícone com contagem, **nunca** três rótulos na linha — a tabela é de triagem em volume alto e deixa de ser legível justamente quando mais precisa ser
- [x] O padrão vale para todo aviso futuro, não só para os desta fatia
- [x] **`markersFor(opportunity, reviews) → Marker[]` em `packages/domain`** é quem responde "o que este lead tem". As três superfícies — linha, card e comparação — chamam a mesma função; nenhuma remonta a agregação por conta própria ([ADR-0018](../../../docs/adr/0018-marcador-como-modulo.md))
- [x] Ordem e critério de "o que conta como aviso" são do domínio; rótulo PT-BR e ícone são da UI. Acrescentar aviso na Fase 2 é uma variante no tipo, e o `switch` da UI quebra no compilador
- [x] **Seam 1** cobre a agregação, inclusive o lead com três avisos
- [x] Contador-filtro de pendências na própria tabela, no mesmo padrão do contador de "sem telefone". Contadores continuam **por tipo** e vivem no topo, fora da linha: eles respondem "quais leads têm este aviso"; o ícone responde "o que este lead tem"
- [x] **Os contadores não passam por `markersFor`** — vêm de `countLeadsByMarker` sobre o índice parcial. Computá-los a partir da lista carregada contaria só a página, ou obrigaria a carregar a tabela toda ([ADR-0018](../../../docs/adr/0018-marcador-como-modulo.md))
- [x] **Escolher a superfície de exibição no `DESIGN.md` antes de codar**: o guia não documenta `popover` nem `tooltip`. Os componentes disponíveis são `button-icon`, `status-badge`, `dropdown-menu` e `modal`. Reusar `dropdown-menu` ou acrescentar um `popover` ao guia — mas registrar no guia, não inventar dentro do componente
- [x] Abrir um lead com possível duplicado mostra a outra Oportunidade e seu responsável
- [x] **A resolução acontece aqui**, não em Integrações: possível duplicado oferece `NEW_FINANCING`, `SAME_FINANCING` e `INVALID_OR_SPAM`; conflito de identidade oferece mesclar numa candidata ou confirmar pessoas distintas
- [x] A UI nunca oferece "excluir duplicado" — só as resoluções auditáveis do ticket 11
- [x] Comparação lado a lado do envio, Pessoas candidatas e Oportunidade semelhante, para o gestor decidir
- [x] Oportunidades com `merged_into_opportunity_id` preenchido não aparecem na tabela
- [x] Origem (Meta, Google ou landing page) visível no registro
- [x] Contador de leads sem telefone que **filtra a própria tabela**, em vez de levar para outra tela
- [x] Edição dos dados do lead dentro do card
- [x] Ação de edição direto na linha da tabela, sem abrir o card
- [x] Edição manual passa pela **mesma** normalização da ingestão — telefone, CPF e e-mail não podem entrar torto pela porta da UI
- [x] Estado vazio conforme o `DESIGN.md`
- [x] Usa os tokens do ticket 02; nenhum hex nem px de espaçamento inline
- [x] Comportamento responsivo conforme os breakpoints do `DESIGN.md`, incluindo a transformação de tabela em cards no menor

## Implementation evidence

**37 de 37 critérios marcados.** O código foi entregue por um agente em worktree isolada; esta seção foi escrita na integração, auditando o resultado — não pelo implementador.

**Como cada critério foi verificado.** Testes automatizados cobrem a metade de banco e a agregação de marcadores; o restante foi conferido por leitura de código contra o critério. **Nenhuma verificação em navegador foi feita**: os critérios visuais (estado vazio, numerais tabulares, responsivo, superfície de divulgação) estão marcados por conformidade do código com o `DESIGN.md` — classes, componentes e breakpoints — e não por inspeção da tela renderizada. Uma passada visual continua sendo trabalho humano.

**A tela:** `apps/web/app/workspace/[slug]/leads/` — `page.tsx` (Server Component), `layout.tsx`, slot `@modal` interceptando `[opportunityId]`, e os route handlers de escrita (`new-count`, `[opportunityId]/edit`, `reviews/[reviewId]/resolve-duplicate`, `resolve-identity`). A listagem não tem endpoint: `page.tsx` chama `listLeads`/`countLeadsByMarker` direto, e dispara as duas leituras em paralelo (ADR-0013).

**A consulta mora em `packages/db/src/leads.ts`.** Keyset por `(arrived_at DESC, id DESC)` via comparação de tupla — nenhum `skip:` ou `OFFSET` no pacote inteiro. Os três `COUNT(*)` do arquivo são de subconjunto (contador por marcador, "novos leads", telefones da Pessoa na edição), nunca total geral da lista. `attendantScopeSql` aplica o escopo do `ATTENDANT` dentro da operação nomeada, não na tela.

**Índices (migration `20260811001200_leads_list_indexes`, aditiva):** índice parcial da lista `(workspace_id, arrived_at DESC, id DESC) WHERE merged_into_opportunity_id IS NULL`; um índice parcial por marcador servindo filtro e contador; `intake_reviews (workspace_id, opportunity_id)` recriado como parcial sobre as não resolvidas.

**Uma mudança de schema além do enunciado:** a resolução de conflito de identidade exigiu a coluna `identity_conflict_resolution` (enum `MERGED` / `CONFIRMED_DISTINCT`), porque o CHECK do ticket 11 força `resolution IS NULL` em toda linha `IDENTITY_CONFLICT` — o enum existente só soletra os três desfechos de possível duplicado. Os dois CHECKs foram reescritos para cobrir as duas colunas. Sem isso, "a resolução acontece aqui" não fechava para metade dos marcadores.

**Marcadores:** `markersFor` de `@marctco/domain` é chamado por `row-view-model.ts`, `lead-card-content.tsx` e a comparação — as três superfícies, uma função. Os contadores **não** passam por ele: vêm de `countLeadsByMarker` sobre os índices parciais.

**`DESIGN.md` emendado antes da UI:** entrada nova `{component.markers-menu}` em Overlays, especificada como variante do `{component.dropdown-menu}` ancorada num gatilho de ícone único, e a entrada de Known Gaps sobre a ausência de `popover`/`tooltip` marcada como resolvida — com a ressalva de que um `{component.popover}` genérico continua indocumentado e não deve ser improvisado.

**Testes:** `packages/db/tests/leads.test.ts` (22 novos, contra Postgres real) prova o escopo do `ATTENDANT` na lista, nos contadores, na leitura de um lead e na edição; que card com `merged_into_opportunity_id` não aparece; e que resolver a mesma revisão duas vezes é recusado. Mais `apps/web/lib/leads/{cursor,filters,markers,row-view-model}.test.ts` e novos casos em `packages/db/tests/rls.test.ts`.

**Gates, sobre o rebase em `2fc64d3`:** `typecheck`, `lint` (com a fronteira de import do Prisma), `test:unit` 228/228, `test:db` 182/182, `test:seam2` 19/19, `test:a7` 5/5, `build`, `check:migrations`, `db:migrate:deploy` e `db:drift` — todos verdes.

**Conflito do rebase:** o rail compacto da PR #28 passou a exigir `icon` por item; este branch ainda trazia a forma `shortLabel`. Resolvido adotando a forma do `main` e dando ao item "Leads" o ícone `UsersIcon`.
