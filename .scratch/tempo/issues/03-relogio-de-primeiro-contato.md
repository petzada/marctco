# 03 — Relógio de primeiro contato e marcador de SLA

**Status:** ready-for-agent

**Blocked by:** 01 (a atividade é o que para o relógio), 02 (o limite comparado é o configurado)

**What to build:** o relógio que existe no banco desde a Fase 1 aparece na tela. Ele corre da **chegada** do lead — que já é o instante certo nos dois caminhos, direto e ex-quarentena — até a **primeira atividade concluída** daquele lead. O gestor passa a ver na linha da tabela e no card quanto o lead esperou até o primeiro contato, ou há quanto tempo está esperando, e o lead que estourou o SLA aparece como tal no menu de marcadores.

**Atribuir não para o relógio, e mover etapa também não.** Distribuir não é atender: o lead entregue ao Supervisor às 8h05 e nunca trabalhado tem de continuar na lista de estourados, porque é exatamente o gargalo que esta fase existe para revelar. É a regra mais fácil de errar do ticket, e a que merece o teste mais explícito.

A Fase 4 vai preencher a mesma coluna com a mensagem de WhatsApp: ela significa "quando alguém falou com esta pessoa pela primeira vez", não "quando uma atividade foi concluída".

**Decisão (2026-08-17):** `Opportunity.closed_at` entra neste ticket. Encerra o relógio de SLA quando o lead fecha sem primeiro contato. A operação de ganhar/perder da Fase 6 só preencherá a coluna; este ticket cria, restringe e consome o instante.

- [x] `Opportunity.first_contact_at` existe, anulável (expand/contract do [ADR-0010](../../../docs/adr/0010-migrations-e-ci-cd.md))
- [x] `Opportunity.closed_at` existe, anulável enquanto `OPEN` e obrigatório quando `WON`/`LOST` (`CHECK` no banco, mesma migration reservada)
- [x] Concluir a primeira atividade de um lead grava `first_contact_at` **na mesma transação** que conclui a atividade
- [x] A escrita traz `WHERE first_contact_at IS NULL` na condição: a segunda conclusão não sobrescreve, e duas conclusões simultâneas são arbitradas pelo banco e não pela leitura que veio antes
- [x] `assignLead`, `assignLeads`, `reassignLead`, `reassignLeads` e `moveLeadStage` **não** escrevem `first_contact_at` — teste explícito para cada caminho
- [x] O estado de SLA é **função pura** em `packages/domain`: recebe `arrived_at`, `first_contact_at`, `closed_at`, situação, configuração resolvida e `now`, e devolve `PENDING | MET | BREACHED` com a duração
- [x] Essa função é a **única** fonte da resposta — a listagem e, depois, a varredura do ticket 09 chamam a mesma, para que tela e alerta nunca discordem
- [x] O relógio é **corrido**: sem horário comercial e sem feriado, com o motivo registrado no código
- [x] Lead `WON`/`LOST` sem nenhuma atividade concluída para de correr em `closed_at` e **não** conta como atendido; `WON`/`LOST` sem `closed_at` é recusado, não silenciado
- [x] `markersFor` passa a receber o estado de SLA e a devolver o estourado como mais um marcador, respeitando "um lead, um ícone" do [ADR-0018](../../../docs/adr/0018-marcador-como-modulo.md)
- [x] A tabela de Leads e o card mostram a espera com numerais tabulares, como a parcela; lead fechado sem contato não diz "Esperando há"
- [x] Índice parcial só na migration: `(workspace_id, arrived_at) WHERE first_contact_at IS NULL AND status = 'OPEN' AND merged_into_opportunity_id IS NULL`
- [x] Nada de contador novo no topo da tabela passando por `markersFor` — contagem continua sendo outra pergunta
