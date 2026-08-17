# 02 — Campanha e formulário na Oportunidade

**What to build:** A Oportunidade passa a guardar de qual campanha e de qual formulário o lead veio — identificador **e** nome —, gravados na ingestão, visíveis na tabela e no card. Não é para rotear o lead: quem decide qual equipe atende é a Gestão ([ADR-0022](../../../docs/adr/0022-workspace-e-fronteira-de-captacao.md)). É atribuição de mídia, que a Fase 7 vai querer ler, e é discriminador de possível duplicado. Retransmissão não apaga nem troca o que já foi gravado.

**Blocked by:** None — can start immediately

**Status:** done

## Acceptance criteria

- [x] O mapeamento do [ADR-0005](../../../docs/adr/0005-idioma-codigo-en-ui-pt-br.md) ganha `Opportunity.campaign_id`, `campaign_name`, `form_id` e `form_name` **antes** da migration. A ingestão é a **única** janela em que esses valores existem: o payload bruto expira em 90 dias ([ADR-0014](../../../docs/adr/0014-copia-unica-e-retencao-do-payload.md)), e depois disso não há de onde recuperá-los
- [x] **Os quatro campos, não só os identificadores.** `campaign_id` do Meta é numérico (`23851…`) e ninguém lê; `campaign_name` é o valor legível. Os dois já saem prontos do contrato `v1` (`packages/domain/src/intake/inbound-lead.ts`, bloco `attribution`) — é persistência, não parsing novo
- [x] Os outros seis campos de atribuição do `v1` (`adset_id`, `adset_name`, `ad_id`, `ad_name`, `platform`, `is_organic`) **não** entram: nenhuma tela desta fase os lê, e o modelo de mídia se decide na Fase 7 com o relatório na mão
- [x] Colunas novas anuláveis, texto opcional (expand/contract)
- [x] Plano de Oportunidade nova carrega os quatro campos do lead normalizado
- [x] Retransmissão inerte **não** tem onde guardar esses campos — não sobrescreve, não apaga, não rebobina etapa nem responsável ([ADR-0007](../../../docs/adr/0007-ingestao-idempotencia.md))
- [x] Tabela de Leads mostra campanha e formulário como **colunas permanentes**, não como layout que só aparece quando o filtro é "sem responsável" — servem para ler a origem a qualquer momento
- [x] Card mostra campanha e formulário; comparação de possível duplicado inclui esse par no conjunto de discriminadores, junto de tipo, instituição, parcela e origem — nenhum campo é prova ([plano A2](../../../docs/plano-de-construcao.md))
- [x] **Nenhum campo monetário novo neste ticket.** `amount` saiu da Fase 2 — item A10 do plano. A grandeza que Ranking e Metas agregam é honorários, que deriva da economia estimada, saída da análise de cabimento (Fase 7). `installment_amount` continua sendo o único sinal de tamanho do caso
- [x] Seam 2: Oportunidade nova persiste campanha/formulário (id e nome) quando o `v1` os trouxe; reenvio não os apaga nem os troca
- [x] Seam 3: colunas novas sob RLS já existente da Oportunidade; nenhum `SECURITY DEFINER` novo

## Implementation evidence

**11 de 11 critérios marcados.** Auditoria em 2026-08-17 sobre o código já entregue — não pelo implementador.

**Como cada critério foi verificado.** Persistência na Oportunidade nova e retransmissão inerte estão cobertas pelo Seam 2. Mapeamento do ADR-0005, colunas anuláveis, plano de escrita e UI foram conferidos por leitura de código. **Nenhuma verificação em navegador foi feita**: colunas permanentes na tabela e o par no card/comparação estão marcados pela presença no JSX, não por inspeção da tela renderizada.

**O mapeamento veio antes da migration:** [ADR-0005](../../../docs/adr/0005-idioma-codigo-en-ui-pt-br.md) ganhou as quatro linhas (`Opportunity.campaign_id`, `campaign_name`, `form_id`, `form_name`). Os outros seis campos de atribuição do `v1` não entram. Nenhum campo monetário novo.

**Schema:** `packages/db/prisma/migrations/20260814000100_opportunity_campaign_and_form/migration.sql` — quatro colunas texto anuláveis na Oportunidade, sob RLS já existente; nenhum `SECURITY DEFINER` novo.

**O plano:** `packages/domain/src/intake/intake-plan.ts` carrega os quatro campos do bloco `attribution` do lead normalizado na Oportunidade nova. Retransmissão inerte não tem onde guardar esses campos. `tests/seam2-ingestion.test.ts` prova que o reenvio não os apaga nem os troca.

**A superfície:** `apps/web/components/leads/leads-table.tsx` mostra Campanha e Formulário como colunas permanentes (e no card empilhado). `apps/web/components/leads/lead-card-content.tsx` mostra o par no card e na comparação de possível duplicado.

## Fora deste ticket

Campo monetário de qualquer natureza (A10, Fase 7). Nome do responsável no duplicado (precisa do cadastro, tickets 03a/06). Atribuição, Equipe, Kanban. Tag na oportunidade. Relatório de mídia e ROAS (Fase 7).
