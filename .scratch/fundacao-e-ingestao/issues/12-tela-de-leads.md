# 12 — Tela de Leads

**Blocked by:** 09, 04, 02, 10, 11

**Status:** ready-for-agent

## What to build

O gestor abre **Leads** e vê a lista chegando. É a primeira superfície em que o trabalho dos tickets anteriores se torna visível para quem paga pelo produto.

Tabela **paginada**, não Kanban: a lista geral é de triagem em volume alto, e o quadro Kanban pertence a "Meus leads" do atendente, que é da Fase 2.

Na UI o card se chama **Lead**; no domínio é sempre Oportunidade. Não existe segundo substantivo no meio do funil comercial. Ver [CONTEXT.md](../../../CONTEXT.md) e [ADR-0005](../../../docs/adr/0005-idioma-codigo-en-ui-pt-br.md).

## Acceptance criteria

- [ ] Tabela paginada mostrando exclusivamente leads do workspace do usuário, na rota `/workspace/:slug/leads` ([ADR-0012](../../../docs/adr/0012-contexto-de-tenant-na-url.md))
- [ ] **Leitura em Server Component**, chamando o helper de transação; **nenhum endpoint** para a listagem ([ADR-0013](../../../docs/adr/0013-fluxo-de-dados-no-app.md))
- [ ] Filtros, cursor e marcador ativo vivem na **URL** via `nuqs` — de quebra, toda vista vira link compartilhável com o time
- [ ] **Paginação keyset por `(arrived_at, id)`**, nunca `OFFSET`. Com lead entrando no topo a cada poucos minutos, `OFFSET` faz a lista deslocar entre uma página e outra: o gestor revê um lead e **nunca vê** o que caiu na fronteira. É correção, não desempenho
- [ ] Sem "página N de M" e sem `COUNT(*)` de total geral — o keyset não precisa deles
- [ ] Índice parcial da lista: `(workspace_id, arrived_at DESC, id DESC) WHERE merged_into_opportunity_id IS NULL`
- [ ] Um índice parcial **por marcador**, servindo filtro e contador: contar sobre subconjunto é barato, contar a tabela toda não é
- [ ] Índice em `IntakeReview (workspace_id, opportunity_id)` para as não resolvidas — os marcadores não moram todos no mesmo lugar e o ícone único precisa dos três
- [ ] Página e contadores buscados em paralelo, com a tabela transmitindo antes dos agregados
- [ ] Indicador de **"N novos leads — atualizar"** por consulta periódica de contagem; a lista **não** se remexe sozinha sob o cursor. Realtime do Supabase não é opção aqui ([ADR-0006](../../../docs/adr/0006-rls-duas-camadas-guc-worker.md) regra 8)
- [ ] `ATTENDANT` vê nesta tela apenas oportunidade atribuída a si ([ADR-0015](../../../docs/adr/0015-perfis-de-acesso-e-escopo.md))
- [ ] Colunas: nome, contatos, tipo de financiamento, instituição, origem e data de chegada
- [ ] Numerais tabulares em qualquer coluna de data ou valor
- [ ] Duas oportunidades abertas da mesma Pessoa usam o conjunto de dados disponível do financiamento para se distinguir; instituição isolada não é prova
- [ ] Leads com revisão pendente **aparecem normalmente** na tabela — nunca escondidos numa fila
- [ ] **Um lead, um ícone**: todos os avisos de um lead (sem telefone, identidade em conflito, possível duplicado, e o que as fases seguintes acrescentarem) são alcançados por um **único** ponto de entrada na linha e no card, que abre a lista. Três avisos são um ícone com contagem, **nunca** três rótulos na linha — a tabela é de triagem em volume alto e deixa de ser legível justamente quando mais precisa ser
- [ ] O padrão vale para todo aviso futuro, não só para os desta fatia
- [ ] Contador-filtro de pendências na própria tabela, no mesmo padrão do contador de "sem telefone". Contadores continuam **por tipo** e vivem no topo, fora da linha: eles respondem "quais leads têm este aviso"; o ícone responde "o que este lead tem"
- [ ] **Escolher a superfície de exibição no `DESIGN.md` antes de codar**: o guia não documenta `popover` nem `tooltip`. Os componentes disponíveis são `button-icon`, `status-badge`, `dropdown-menu` e `modal`. Reusar `dropdown-menu` ou acrescentar um `popover` ao guia — mas registrar no guia, não inventar dentro do componente
- [ ] Abrir um lead com possível duplicado mostra a outra Oportunidade e seu responsável
- [ ] **A resolução acontece aqui**, não em Integrações: possível duplicado oferece `NEW_FINANCING`, `SAME_FINANCING` e `INVALID_OR_SPAM`; conflito de identidade oferece mesclar numa candidata ou confirmar pessoas distintas
- [ ] A UI nunca oferece "excluir duplicado" — só as resoluções auditáveis do ticket 11
- [ ] Comparação lado a lado do envio, Pessoas candidatas e Oportunidade semelhante, para o gestor decidir
- [ ] Oportunidades com `merged_into_opportunity_id` preenchido não aparecem na tabela
- [ ] Origem (Meta, Google ou landing page) visível no registro
- [ ] Contador de leads sem telefone que **filtra a própria tabela**, em vez de levar para outra tela
- [ ] Edição dos dados do lead dentro do card
- [ ] Ação de edição direto na linha da tabela, sem abrir o card
- [ ] Edição manual passa pela **mesma** normalização da ingestão — telefone, CPF e e-mail não podem entrar torto pela porta da UI
- [ ] Estado vazio conforme o `DESIGN.md`
- [ ] Usa os tokens do ticket 02; nenhum hex nem px de espaçamento inline
- [ ] Comportamento responsivo conforme os breakpoints do `DESIGN.md`, incluindo a transformação de tabela em cards no menor
