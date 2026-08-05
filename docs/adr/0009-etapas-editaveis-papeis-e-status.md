# Etapas editáveis: papel separado do rótulo, e status ortogonal ao funil

Funis são fluxos operacionais criados pela gestão e podem ser editáveis; o sistema ainda precisa saber onde colocar um lead ingerido e como reconhecer pontos relevantes do fluxo. A resolução é **separar o rótulo da etapa do papel da etapa**: rótulo e ordem são do cliente, papel é do sistema. E **ganho/perdido são `status` da oportunidade, não colunas do Kanban**. Tipo de financiamento é dado opcional da Oportunidade e não escolhe nem possui funil.

**Status:** accepted · 2026-08-04

## Rótulo e ordem pertencem ao cliente

- **Nada no código busca etapa por nome — só por ID.** Renomear é puramente cosmético.
- **`position` é coluna própria e mutável.** Reordenar altera posição, não identidade; nenhuma oportunidade se move. Reordenação é update em lote e precisa ser transacional, senão duas etapas empatam na mesma posição.
- **Editar funil não é atividade do lead.** Movimento causado por edição de funil **não** toca o relógio de estagnação/SLA. Sem essa regra, reorganizar as etapas faz todos os cards parados parecerem novos e o Dashboard operacional passa a mentir.

## Papel pertence ao sistema

| Papel | Significado |
|---|---|
| `ENTRY` | Onde o lead ingerido nasce. Começo do fluxo |
| `CLOSING` | Última etapa da jornada em aberto. Fim do fluxo: é dela que se conclui o atendimento |
| `LEGAL_HANDOFF` | Etapa comercial em que a UI também oferece o handoff explícito para o jurídico |
| `NORMAL` | Etapa comum da jornada |

**Todo funil em uso tem exatamente uma `ENTRY` e ao menos uma `CLOSING`.** É invariante validável, e é o que garante que o lead sempre tem por onde entrar e por onde sair sem travar no meio do board.

`CLOSING` é papel de **fluxo**, não de resultado: ela marca onde a jornada em aberto termina, enquanto `WON`/`LOST` continuam status ortogonais à etapa. Uma etapa `CLOSING` chamada "Negociação final" pode terminar em ganho ou em perda — o papel diz que dali se conclui, não o que se concluiu. Sem esse papel, um cliente que edita o funil pode deixá-lo sem fim reconhecível, e o handoff perde a âncora de "atendimento finalizado".

Toda ingestão cria Oportunidade comercial; nunca cria card jurídico diretamente.

## Qual funil comercial recebe o lead

O funil é criado e configurado pelo cliente, então o destino precisa ser dado, não inferido:

- Cada workspace tem **exatamente um funil comercial marcado como padrão** (`Pipeline.is_default`), invariante validável. O seed cria o primeiro já marcado.
- A conexão de integração pode **sobrescrever** o destino (`IntegrationConnection.target_pipeline_id`), permitindo que uma LP ou uma conta de Ads específica caia num funil próprio.
- Na ausência de sobrescrita, vale o padrão do workspace.
- **`FinancingType` nunca participa dessa escolha.** Nenhuma FK, nenhuma regra, nenhum fallback.

Isso fecha o item A11. A alternativa — perguntar ao gestor a cada lead, ou inferir por campo de negócio — ou trava a ingestão ou reintroduz "funil por produto" com outro nome.

## Apagar etapa

| Situação | Comportamento |
|---|---|
| Etapa com oportunidades | **Migração forçada** — escolher destino; cards migram e registram na timeline |
| Etapa vazia, papel `NORMAL` | Apaga direto |
| Etapa vazia, papel `ENTRY` | Apaga direto **se** outra etapa assumir `ENTRY` na mesma operação |
| Última etapa `CLOSING` do funil | Apaga **se** outra etapa assumir `CLOSING` na mesma operação |
| Última etapa do funil | Apagar equivale a apagar o funil |
| Funil comercial marcado como padrão | Só apaga se outro funil comercial assumir o padrão na mesma operação |
| Funil sem nenhuma oportunidade | Apaga inteiro, sem cerimônia |
| Etapa `LEGAL_HANDOFF` | Permitido se a configuração de handoff continuar válida ou for substituída na mesma operação |

**Considered option (rejeitada):** bloquear exclusão sempre que houver cards. Mais simples, mas impede o cliente de arrumar o próprio funil, que é a promessa do "100% editável".

**Vazio não é seguro por si só.** Uma `ENTRY` vazia ainda é o destino de todo lead futuro; apagá-la sem substituta quebra a ingestão na primeira madrugada. Vazio dispensa a migração de dados, não o invariante.

## Ganho e perdido são status, não etapas

`Opportunity.status: OPEN | WON | LOST`. Etapas descrevem apenas a jornada **em aberto**; ao ganhar ou perder, o card sai do board. Motivo de perda é obrigatório; ganho e perda aceitam detalhe livre opcional.

`sintese-final.md` §10 dava à Oportunidade `pipeline_stage_id` **e** `status`, e `decisoes.md` chamava o gatilho de "Etapa/status: `ganho` ou `necessario_juridico`" — os docs nunca decidiram qual dos dois era. Aqui fica decidido.

**Considered option (rejeitada):** ganho/perdido como colunas do Kanban. Kanban-nativo e um campo só, mas:

1. **O board não sobrevive.** A coluna "Perdido" acumula milhares de cards para sempre; em três meses o Kanban é inútil.
2. **A idempotência ficaria refém do editor de funil.** A regra do [ADR-0007](./0007-ingestao-idempotencia.md) — "oportunidade fechada → nova Opportunity" — precisa de definição firme de *fechada*. Com status é `status != OPEN`. Como etapa, dependeria da identidade de uma linha **que o cliente pode apagar**, colocando a regra de deduplicação mais importante do sistema à mercê de um drag-and-drop.
3. **Motivo de perda obrigatório** encaixa na transição de status; como etapa, vira validação pendurada num arrasta-e-solta.

## Handoff é uma ação humana

**Supersede o disparo automático por mudança de estado.** O sistema não envia uma Oportunidade ao Jurídico durante a ingestão nem por inferência. Quem libera é o gestor, sempre.

O fluxo fechado, que encerra o item A12:

1. O **atendente** conduz o lead pelas etapas e conclui o atendimento — tipicamente a partir de uma etapa `CLOSING` — registrando `WON` ou `LOST` com o motivo.
2. A conclusão gera **notificação in-app para o gestor**, com o lead, o resultado e o motivo. A notificação é o sinal; ela não cria nada.
3. O **gestor** decide e aciona o envio ao Jurídico. Só então nasce ou se atualiza o card no funil jurídico.
4. Excepcionalmente, o gestor pode acionar o envio **no meio do atendimento**, sem esperar conclusão — o caso do lead que precisa do jurídico antes de fechar. A etapa `LEGAL_HANDOFF` é onde a UI oferece essa saída de forma proeminente.

A ação é idempotente: no máximo uma Oportunidade jurídica ativa por origem comercial; reacionar atualiza o resumo em vez de duplicar. A origem comercial fica preservada em `source_opportunity_id`.

**Por que notificação e não automação:** `LOST` também vira notificação, e é justamente o caso em que automação erraria feio — nem todo lead perdido no comercial deve virar processo. Deixar o gestor ver o motivo antes de liberar é o filtro que nenhuma regra de estado consegue expressar. E como o cliente edita as próprias etapas, qualquer gatilho ancorado em etapa quebraria no primeiro rearranjo do funil.
