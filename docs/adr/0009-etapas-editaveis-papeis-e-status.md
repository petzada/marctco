# Etapas editáveis: papel separado do rótulo, e status ortogonal ao funil

Funis são "100% editáveis" e o sistema ainda precisa saber onde colocar um lead ingerido e o que dispara o handoff. A resolução é **separar o rótulo da etapa do papel da etapa**: rótulo e ordem são do cliente, papel é do sistema. E **ganho/perdido são `status` da oportunidade, não colunas do Kanban**.

**Status:** accepted · 2026-08-04

## Rótulo e ordem pertencem ao cliente

- **Nada no código busca etapa por nome — só por ID.** Renomear é puramente cosmético.
- **`position` é coluna própria e mutável.** Reordenar altera posição, não identidade; nenhuma oportunidade se move. Reordenação é update em lote e precisa ser transacional, senão duas etapas empatam na mesma posição.
- **Editar funil não é atividade do lead.** Movimento causado por edição de funil **não** toca o relógio de estagnação/SLA. Sem essa regra, reorganizar as etapas faz todos os cards parados parecerem novos e o Dashboard operacional passa a mentir.

## Papel pertence ao sistema

| Papel | Significado |
|---|---|
| `ENTRY` | Onde o lead ingerido nasce |
| `LEGAL_HANDOFF` | Entrar nela dispara o handoff para o jurídico |
| `NORMAL` | Etapa comum da jornada |

**Todo funil comercial em uso tem exatamente uma `ENTRY`.** É invariante validável, e é o que garante que a ingestão sempre tem destino.

## Apagar etapa

| Situação | Comportamento |
|---|---|
| Etapa com oportunidades | **Migração forçada** — escolher destino; cards migram e registram na timeline |
| Etapa vazia, papel `NORMAL` | Apaga direto |
| Etapa vazia, papel `ENTRY` | Apaga direto **se** outra etapa assumir `ENTRY` na mesma operação |
| Última etapa do funil | Apagar equivale a apagar o funil |
| Funil sem nenhuma oportunidade | Apaga inteiro, sem cerimônia |
| Etapa `LEGAL_HANDOFF` | Permitido — `status → WON` continua disparando o handoff |

**Considered option (rejeitada):** bloquear exclusão sempre que houver cards. Mais simples, mas impede o cliente de arrumar o próprio funil, que é a promessa do "100% editável".

**Vazio não é seguro por si só.** Uma `ENTRY` vazia ainda é o destino de todo lead futuro; apagá-la sem substituta quebra a ingestão na primeira madrugada. Vazio dispensa a migração de dados, não o invariante.

## Ganho e perdido são status, não etapas

`Opportunity.status: OPEN | WON | LOST`. Etapas descrevem apenas a jornada **em aberto**; ao ganhar ou perder, o card sai do board. Motivo de perda é obrigatório; ganho e perda aceitam detalhe livre opcional.

`sintese-final.md` §10 dava à Oportunidade `pipeline_stage_id` **e** `status`, e `decisoes.md` chamava o gatilho de "Etapa/status: `ganho` ou `necessario_juridico`" — os docs nunca decidiram qual dos dois era. Aqui fica decidido.

**Considered option (rejeitada):** ganho/perdido como colunas do Kanban. Kanban-nativo e um campo só, mas:

1. **O board não sobrevive.** A coluna "Perdido" acumula milhares de cards para sempre; em três meses o Kanban é inútil.
2. **A idempotência ficaria refém do editor de funil.** A regra do [ADR-0007](./0007-ingestao-idempotencia.md) — "oportunidade fechada → nova Opportunity" — precisa de definição firme de *fechada*. Com status é `status != OPEN`. Como etapa, dependeria da identidade de uma linha **que o cliente pode apagar**, colocando a regra de deduplicação mais importante do sistema à mercê de um drag-and-drop.
3. **Motivo de perda obrigatório** encaixa na transição de status; como etapa, vira validação pendurada num arrasta-e-solta.

**Gatilhos de handoff, sem ambiguidade:** `status → WON` **ou** entrada em etapa de papel `LEGAL_HANDOFF`.
