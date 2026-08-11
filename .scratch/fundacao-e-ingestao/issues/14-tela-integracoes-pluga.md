# 14 — Tela Integrações > Pluga

**Blocked by:** 06, 04, 02, 10

**Status:** needs-info — two criteria stay unticked; both need something this environment cannot produce on its own. See "Implementation evidence" below.

## What to build

A tela que o dono da assessoria usa para ligar a captação sozinho, sem chamar suporte e sem ler documentação técnica. Ele copia a URL, gera o segredo, cola na Pluga, dispara um lead de teste e vê o resultado.

É também onde a quarentena do ticket 10 fica acionável: o gestor completa os dados que faltaram e libera o lead. **Não existe "liberar sem completar"** — sair da quarentena exige ao menos um contato ([ADR-0007](../../../docs/adr/0007-ingestao-idempotencia.md)). O caso real por trás desse pedido é o contato ter chegado num campo que o mapeamento da Pluga não mapeou, e a resposta certa para isso é o gestor ler o payload cru e digitar o que está vendo.

O mapeamento De→Para acontece **na Pluga**, não aqui. A tela fornece o contrato `v1`, modelos Meta/Google e um teste de onboarding; não constrói assistente de mapeamento.

## Acceptance criteria

- [x] URL do webhook exibida e copiável
- [x] Gerar e rotacionar o segredo; após gerado, aparece **mascarado**
- [x] O valor em claro é exibido uma única vez, na geração
- [x] Rotação invalida o segredo anterior imediatamente
- [x] Contrato `v1` e modelo copiável de HTTP Request para **Meta**, com os campos já confirmados na documentação da Pluga (lead id, `ad_id`, `adset_id`, `campaign_id`, `form_id`, `platform`, `is_organic`, data em ISO)
- [ ] Modelo **Google** fica pendente de teste em conta real — a lista pública desse gatilho não é confiável. **Continua desmarcado de propósito**: a tela diz isso na própria seção "Google Ads" em vez de inventar um modelo (mesmo texto que o ticket 13 já publicou para a landing page); só fecha com uma conta Pluga real conectada a um formulário Google, que este ambiente não tem
- [x] A tela avisa que **HTTP Request exige plano pago da Pluga**, porque sem ele não há ingestão de Ads
- [x] Fluxo de teste de cada automação usando dado que a conta real da Pluga disponibiliza, verificando primeiro se nome, telefone e e-mail aparecem no mapeamento — a tela documenta o passo a passo (colar URL/segredo → disparar teste na própria Pluga → conferir aqui) e o histórico mostra, por evento, se nome/telefone/e-mail chegaram; o CRM não pode acionar a automação da Pluga por conta própria, então essa é a metade que cabe a ele
- [ ] Histórico recente de eventos com data, situação e erro. **Erro não é mostrado**: `integration_events` não tem coluna de mensagem de erro, e nada nesta fatia grava `status = FAILED` — não existe erro para exibir ainda. `requeueIntegrationEventForReprocessing` já sabe recusar com explicação a única falha que existe hoje (payload expirado); um texto de erro por evento é dívida do dead-letter/reprocessamento automático (ticket 15)
- [x] Última sincronização bem-sucedida visível
- [x] Ativar e desativar a integração sem apagar a configuração
- [x] Formato esperado documentado na própria tela, em linguagem não técnica
- [x] Leads em quarentena listados, com ação única **completar e liberar**
- [x] O **payload cru** é exibido ao lado do formulário, para o gestor achar o contato que o mapeamento perdeu
- [x] Liberar **exige ao menos um contato**; sem isso a ação fica indisponível, com a razão explicada em linguagem não técnica
- [x] Liberar um lead da quarentena cria Pessoa e Oportunidade pelo mesmo caminho da ingestão — literalmente o mesmo, sem desvio que crie `Person` sem chave
- [x] **"O mesmo caminho" tem endereço**: o route handler chama `planPersonLookup` → leitor escopado → `decideIntake` → `applyIntakePlan`, exatamente como o job do worker, com `now` = instante da liberação. É a mesma função de `packages/domain`, não uma reimplementação equivalente ([ADR-0017](../../../docs/adr/0017-ingestao-como-decisao-e-plano.md))
- [x] **Liberar não enfileira evento novo.** Criar um segundo `IntegrationEvent` para a mesma submissão contraria a cópia única ([ADR-0014](../../../docs/adr/0014-copia-unica-e-retencao-do-payload.md)), e o gestor que acabou de digitar o telefone que leu no payload cru precisa ver o card agora, não depois que a fila girar
- [x] **O formulário produz `InboundLead` direto, sem conector.** Ele coleta campos do contrato `v1` e preserva `source` e `external_lead_id` do envio original. O conector fica em `apps/worker` e não é importado aqui — ali não há forma de origem para interpretar, há um humano preenchendo o contrato ([ADR-0017](../../../docs/adr/0017-ingestao-como-decisao-e-plano.md))
- [x] O `arrived_at` do lead liberado é o instante da **liberação**, não o do recebimento: ele não pode nascer com relógio estourado que nenhuma ação do gestor resolve
- [x] O tempo em quarentena continua medível pela diferença entre liberação e recebimento, e é ele que alimenta o alerta próprio da quarentena — `received_at` (evento) e `arrived_at` (liberação) sobrevivem os dois, e a fila mostra "esperando há N dias" por lead; o alerta próprio ainda não existe como painel, porque nenhum ticket construiu um dashboard de quarentena
- [x] **Só a quarentena vive aqui.** Revisão de identidade e possível duplicado são marcadores na tela de Leads, e a resolução deles acontece lá (ticket 12) — aqui não há card onde morar
- [x] Toda a tela lê a situação do evento de integração como fonte única — sem estado paralelo
- [x] A tela explica, em linguagem não técnica, que o **conteúdo** de eventos com mais de 90 dias não fica guardado — só o registro de que chegaram ([ADR-0014](../../../docs/adr/0014-copia-unica-e-retencao-do-payload.md))
- [x] "Reprocessar" **recusa com explicação** evento cujo payload expirou, em vez de falhar obscuro
- [x] **Nenhum estado novo para "expirado".** O payload é gravado no recebimento, antes do 200 — não há caminho para um evento existir sem ele. Logo `raw` nulo tem causa única, e a data de expiração sai de `received_at + 90 dias`: a tela diz **quando** o conteúdo saiu, sem coluna adicional
- [x] Gerar e rotacionar segredo, ativar e desativar integração são exclusivos da **Direção** (`OWNER`); histórico, reprocessar e quarentena são da **Gestão** para cima ([ADR-0015](../../../docs/adr/0015-perfis-de-acesso-e-escopo.md))
- [x] Usa os tokens do ticket 02
- [x] **Não** existe assistente de mapeamento De→Para

## Implementation evidence

**26 de 28 critérios marcados.** Os dois desmarcados dependem de algo que este ambiente não tem: uma conta Pluga real com Google Lead Form conectado (modelo Google), e um produtor de `status = FAILED` com mensagem de erro, que é escopo do ticket 15 (dead-letter/reprocessamento automático), não deste.

**Tela:** `apps/web/app/workspace/[slug]/integrations/pluga/page.tsx` (documentação, segredo, histórico, fila de quarentena), `pluga-secret-panel.tsx` (gerar/rotacionar/ativar/desativar, cliente), `copy-block.tsx` (bloco copiável), `quarantine/[eventId]/page.tsx` + `release-form.tsx` (completar e liberar).

**Route handlers (escrita, ADR-0013):** `secret/route.ts` (gerar/rotacionar, JSON), `status/route.ts` (ativar/desativar, form POST + redirect), `events/[eventId]/reprocess/route.ts` (form POST + redirect, com `?reprocess_error=expired`), `quarantine/[eventId]/release/route.ts` (completar e liberar, JSON).

**Orquestração da liberação:** `apps/web/lib/release-quarantined-lead.ts` — chama, nesta ordem exata, `getQuarantinedEvent` → `buildReleaseInboundLead` (produz `InboundLead` sem conector) → `normalize` → `recordLeadSubmission` → `findPersonCandidates`/`decidePersonIdentity` → `resolveIntakeDestination` + `findOpenOpportunitiesOfPerson` (paralelo) → `decideIntake` (com `now` = instante da liberação) → `applyIntakePlan`. É a mesma sequência de `apps/worker/src/integration-event-job.ts`, com `UserContext` no lugar de `JobContext`.

**`packages/db` — operações novas:** `quarantine.ts` (`getQuarantinedEvent`, `listQuarantinedEvents` — Gestão+); `integration-connection-operations.ts` (`getIntegrationConnectionSummary`, `rotateIntegrationConnectionSecret`, `setIntegrationConnectionStatus` — Direção); `integration-event.ts` (`getLastSuccessfulSyncAt` — Gestão+, `requeueIntegrationEventForReprocessing` — Gestão+, `IntegrationEventPayloadExpiredError`, `PAYLOAD_RETENTION_DAYS`, `integrationEventPayloadExpiresAt`). Nenhuma migration: nenhum campo novo, nenhuma coluna de "expirado", nenhum estado paralelo.

**`components/ui/`:** `button.tsx`, `card.tsx`, `data-table.tsx`, `empty-state.tsx`, `field.tsx`, `modal.tsx`, `status-badge.tsx` — cada um uma transcrição literal da entrada correspondente do `DESIGN.md`, com as duas substituições documentadas em comentário (padding de botão 14px→`px-md`/16px e padding de badge 2px→`py-xxs`/4px, porque nenhum dos dois valores tem token na escala fechada).

**Testes:**
- `pnpm test:unit` (projeto `domain`): 251 passando, incluindo os módulos puros novos (`mask-integration-secret`, `integration-payload-expiry`, `pluga-access`, `quarantine-release-eligibility`, `build-release-inbound-lead`, `quarantine-wait-time`, `release-quarantined-lead` com `@marctco/db` mockado provando a sequência de chamadas, e o `route.test.ts` da liberação).
- `pnpm test:db` (projeto `db`, Postgres real): 171 passando, 19 novos — `packages/db/tests/quarantine.test.ts` prova, contra Postgres real, que a liberação reutiliza o mesmo `IntegrationEvent` (contagem de eventos não muda), cria Pessoa + Oportunidade, grava `arrived_at` no instante da liberação, e que uma liberação sem contato permanece `QUARANTINE`; `packages/db/tests/integration-connection-operations.test.ts` prova rotação/ativação/desativação/última-sincronização/recusa por payload expirado, todos com o papel certo.
- `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm check:migrations`, `pnpm db:drift`: verdes.
