# 02 — Campanha, formulário e valor no lead

**What to build:** O lead chega na tabela e no card com campanha e formulário visíveis, para a fila mista não ser atribuída no escuro. O card aceita um valor opcional, distinto da parcela. Retransmissão não apaga nem troca o que já foi gravado.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

## Acceptance criteria

- [ ] O mapeamento do [ADR-0005](../../../docs/adr/0005-idioma-codigo-en-ui-pt-br.md) ganha `Opportunity.amount`, `Opportunity.campaign_id` e `Opportunity.form_id` **antes** da migration. Esta spec decide persistir campanha e formulário na Oportunidade — a fila não lê o payload bruto, que expira em 90 dias ([ADR-0014](../../../docs/adr/0014-copia-unica-e-retencao-do-payload.md))
- [ ] Colunas novas anuláveis (expand/contract). `amount` é decimal, distinto de `installment_amount`; campanha e formulário são texto opcional
- [ ] Plano de Oportunidade nova carrega `campaign_id` e `form_id` do lead normalizado; `amount` nasce nulo
- [ ] Retransmissão inerte **não** tem onde guardar esses campos — não sobrescreve, não apaga, não rebobina etapa nem responsável ([ADR-0007](../../../docs/adr/0007-ingestao-idempotencia.md))
- [ ] Tabela de Leads mostra campanha e formulário (a fila sem dono é o requisito; colunas permanentes são aceitáveis se forem baratas)
- [ ] Card mostra campanha e formulário; comparação de possível duplicado inclui esse par no conjunto de discriminadores, junto de tipo, instituição, parcela e origem — nenhum campo é prova ([plano A2](../../../docs/plano-de-construcao.md))
- [ ] Atendente edita valor opcional no card pela mesma operação de edição que já normaliza a parcela; vazio continua válido; numerais tabulares
- [ ] Valor rejeitado pela normalização não é gravado torto — o mesmo leitor monetário da ingestão
- [ ] Seam 2: Oportunidade nova persiste campanha/formulário quando o `v1` os trouxe; reenvio não os apaga nem os troca
- [ ] Seam 3: colunas novas sob RLS já existente da Oportunidade; nenhum `SECURITY DEFINER` novo

## Fora deste ticket

Nome do responsável no duplicado (precisa do cadastro, ticket 03/06). Atribuição, Equipe, Kanban. Tag na oportunidade.
