# Spec — Tempo

Status: done

> **Implementada.** O Problem Statement abaixo descreve o estado **antes** da Fase 3. A Solution e o restante desta spec estão no código. Não reimplementar.

> Fase 3 de [docs/plano-de-construcao.md](../../docs/plano-de-construcao.md): **Activity (`due_at`, tipo, responsável) + SLA desde `arrived_at` + estagnação + Agenda + alerta ao gestor + Dashboard operacional.**
> Vocabulário: [CONTEXT.md](../../CONTEXT.md). Nomes de código: [ADR-0005](../../docs/adr/0005-idioma-codigo-en-ui-pt-br.md).
> Estado de partida: Fases 0–2 entregues — [fechamento](../fechamento-fases-0-2.md). `arrived_at` está gravado desde a ingestão, de propósito, e `previous_assigned_user_id` foi declarado "trilha mínima **até a `Activity` da Fase 3**".
> ADRs vinculantes: 0004, 0005, 0006, 0009, 0010, 0012, 0013, 0015, 0016, 0018, 0019, 0020, 0024.
> **Emendas de ADR desta fase (registradas em 2026-08-19, antes da migration do ticket 09):** [ADR-0016](../../docs/adr/0016-contexto-de-acesso-e-leitor-escopado.md)/`CONTEXT.md` (origem do `JobContext` vira união) e [ADR-0019](../../docs/adr/0019-resolucao-pre-contexto-e-executor-privado.md) (sexta função privada `claim_overdue_opportunity_workspaces`). A parada humana foi aprovada; o ticket 09 materializou função, `JobContext` e Seam 3 contra elas.
> Costuras: as três de sempre — nenhuma quarta numerada.

---

## Problem Statement

O lead entra, tem Pessoa, tem card, tem responsável e anda no Kanban. **Ninguém sabe se ele foi atendido, quando, nem quanto tempo levou.**

O relógio existe no banco e em lugar nenhum na tela. `arrived_at` é gravado desde a Fase 1 justamente para isto, e até hoje nenhuma leitura o compara com o presente. A assessoria vive de velocidade — o lead de revisional que espera duas horas já falou com o concorrente — e hoje o gestor descobre a demora quando o cliente reclama, não quando ela acontece.

**Não existe o que o atendente faz.** Ele liga, o cliente pede para retornar amanhã às 15h, e esse compromisso não tem onde morar: vira post-it, WhatsApp pessoal ou memória. O card não guarda o que já foi tentado, então quem assume o lead depois de férias começa do zero, e a reatribuição da Fase 2 entrega ao Atendente um lead sem uma linha de histórico — só `previous_assigned_user_id`, que diz de quem era e nada sobre o que aconteceu.

**Sem atividade não há agenda.** O atendente não tem vista do próprio dia; o supervisor não tem como ver se o time tem trabalho marcado ou se a semana está vazia.

**Lead parado não avisa ninguém.** Um card na etapa de entrada há nove dias tem exatamente a mesma aparência de um que chegou agora. A fila sem dono some da vista quando é atribuída, e é aí que ela vira problema invisível: o lead saiu da fila, não foi trabalhado, e nenhuma tela pergunta por ele.

**E a Gestão abre o dia sem tela nenhuma.** A tabela de Leads é ordenada por chegada e paginada por keyset — serve para varrer volume, não para responder "o que está queimando agora". A pergunta operacional da manhã — quantos estouraram o SLA, quais estão parados, quem está com atividade vencida, o volume está subindo ou caindo — não tem superfície.

## Solution

**A Atividade passa a existir e vira a unidade do tempo.** Toda Atividade nasce presa a um Lead — tipo, responsável, `due_at` e descrição —, é criada no card ou na Agenda, e é concluída por quem a executou. Não há evento órfão: criar pela Agenda exige escolher o Lead.

**A primeira Atividade concluída é o que para o relógio de SLA.** O relógio corre de `arrived_at` até esse instante, gravado em `Opportunity.first_contact_at`, e é assim que "atendimento" deixa de ser sinônimo de "atribuição": um lead atribuído e nunca trabalhado continua com o relógio correndo, que é exatamente o caso que o gestor precisa enxergar. A Fase 4 acrescenta a mensagem de WhatsApp como mais uma evidência de primeiro contato — sem trocar o modelo, porque o campo já é "quando alguém falou com esta pessoa pela primeira vez".

**Estagnação é o segundo relógio, e ele mede movimento, não chegada.** Toda operação que mexe no lead — mover etapa, atribuir, reatribuir, concluir atividade — passa a gravar um fato na linha do tempo da Oportunidade e a carimbar `last_movement_at`. Lead sem movimento além do configurado no workspace está parado.

**Os dois limites são configuração do workspace, não constante de código, e não feature flag** — SLA de primeiro contato em minutos e estagnação em dias, editáveis pela Gestão em Configurações, com padrão do domínio quando o workspace nunca os tocou.

**Lead estourado e lead parado viram Notificação persistida na Oportunidade**, escrita por uma varredura agendada, no máximo uma por lead e por tipo. Ela sinaliza, nunca bloqueia, e é sempre resolvível: some quando a causa acaba, e o gestor pode marcá-la como lida enquanto trabalha nela.

**A Agenda é a vista de calendário sobre as Atividades** — dia e semana, filtrável, no escopo do perfil, criando pelo próprio calendário com o Lead escolhido.

**O Dashboard operacional é a primeira tela da manhã**: os gargalos do dia em números clicáveis — estourados, parados, sem responsável, atividades vencidas — e os gráficos que dizem se o dia é pior que ontem. Como gráfico entra nesta fase, a **paleta de dataviz** (lacuna aberta do `DESIGN.md`, item A10 do plano) é fechada aqui, uma vez, para Analytics e Ranking herdarem na Fase 7.

## User Stories

### Atividade no lead

1. Como atendente, quero criar uma atividade no card do lead com tipo, data/hora e uma descrição, para que o compromisso com o cliente saia do post-it.
2. Como atendente, quero que a atividade nasça com **mim** como responsável por padrão, porque quase sempre é minha.
3. Como atendente, quero escolher o tipo — ligação, mensagem, reunião ou tarefa —, para a Agenda e o Dashboard poderem contar por natureza do trabalho.
4. Como atendente, quero ver no card todas as atividades daquele lead, abertas e concluídas, em ordem, para saber o que já foi tentado antes de ligar.
5. Como atendente, quero concluir uma atividade e que fique registrado **quem** concluiu e **quando**, porque é isso que prova o atendimento.
6. Como atendente, quero reagendar uma atividade em aberto mudando o `due_at`, porque o cliente pediu para retornar outro dia — sem apagar e recriar.
7. Como atendente, quero cancelar uma atividade que não vai acontecer, e que o cancelamento seja distinto de concluir, porque uma coisa é atendimento e a outra não.
8. Como sistema, quero recusar concluir duas vezes a mesma atividade, para que o registro de conclusão não seja reescrito por um clique duplo.
9. Como sistema, quero que **toda atividade tenha um Lead**, para não existir evento órfão na Agenda.
10. Como supervisor, quero criar atividade para um atendente do meu time, para distribuir o trabalho do dia.
11. Como Gestão ou Direção, quero criar atividade para qualquer membro ativo do workspace.
12. Como atendente, não quero criar atividade para outra pessoa, porque eu respondo pelos meus leads e não distribuo trabalho.
13. Como sistema, quero recusar responsável de atividade que não alcança aquele lead, para não marcar trabalho para quem não pode nem abrir o card.
14. Como sistema, quero recusar atividade em lead ganho, perdido ou mesclado, porque não há mais atendimento a fazer ali.
15. Como atendente, quero que atividade vencida e não concluída apareça em destaque no card e na Agenda, e não simplesmente suma quando a data passa.

### Agenda

16. Como atendente, quero uma Agenda com vista de dia e de semana, para conduzir a rotina sem abrir lead por lead.
17. Como atendente, quero ver na Agenda só as atividades dos leads que são meus, porque não navego a carteira da empresa.
18. Como supervisor, quero ver na Agenda o time, para saber se a semana dos meus atendentes tem trabalho marcado ou está vazia.
19. Como Gestão ou Direção, quero ver a Agenda da operação inteira.
20. Como gestor, quero filtrar a Agenda por responsável, por equipe (tag) e por funil, para olhar um recorte sem trocar de tela.
21. Como gestor, quero que o filtro **estreite** o meu escopo e nunca o alargue: filtrar por uma equipe que não é minha devolve vazio, não recusa.
22. Como atendente, quero criar uma atividade a partir da Agenda escolhendo o lead, porque às vezes o planejamento vem antes de abrir o card.
23. Como atendente, quero que a atividade criada no card apareça na Agenda e vice-versa, porque é a mesma coisa vista de dois lugares.
24. Como atendente, quero que o filtro e o intervalo da Agenda fiquem na URL, para eu poder voltar à mesma vista e mandar o link para o supervisor.
25. Como supervisor sem tag, quero que a Agenda me explique que ainda não tenho equipe e que a Direção define isso, em vez de mostrar um calendário vazio sem motivo.
26. Como atendente no celular, quero a Agenda usável em uma coluna, porque a semana lado a lado não cabe na tela.

### SLA de primeiro contato

27. Como gestor, quero que o relógio de atendimento comece na **chegada** do lead, e não no recebimento do envio quando ele passou pela quarentena, porque não corre relógio contra ninguém enquanto não há card.
28. Como gestor, quero que o relógio pare na **primeira atividade concluída** daquele lead, porque é isso que prova que alguém falou com o cliente.
29. Como gestor, quero que atribuir um lead **não** pare o relógio, porque distribuir não é atender — e o lead atribuído e esquecido é exatamente o que eu preciso enxergar.
30. Como gestor, quero que mover o card de etapa **não** pare o relógio nem o reinicie, pelo mesmo motivo.
31. Como sistema, quero gravar o instante do primeiro contato na Oportunidade, para que a leitura do SLA não precise varrer as atividades de cada lead a cada tela.
32. Como sistema, quero que o primeiro contato seja escrito **uma vez** e nunca sobrescrito por uma atividade concluída depois, porque "primeiro" tem um significado só.
33. Como gestor, quero ver na linha da tabela e no card **quanto tempo** o lead esperou até o primeiro contato, ou há quanto tempo está esperando.
34. Como gestor, quero que o lead que estourou o SLA seja visível como tal na tabela de Leads, junto dos marcadores que já existem.
35. Como sistema, quero que ganho e perda não sejam confundidos com atendimento: o relógio de um lead fechado sem nenhuma atividade concluída para de correr, mas não conta como atendido.
36. Como sistema, quero que o relógio seja **corrido** — sem horário comercial e sem feriado —, porque a alternativa exige um calendário de expediente que este produto ainda não tem, e um SLA que só corre das 9h às 18h mente sobre o lead que chegou às 19h.

### Estagnação

37. Como gestor, quero saber quais leads estão **parados** — sem nenhum movimento além do limite configurado —, porque um card na etapa de entrada há nove dias parece igual ao que chegou agora.
38. Como sistema, quero que contem como movimento: mover etapa, atribuir, reatribuir, concluir atividade e marcar atividade nova no lead.
39. Como sistema, quero que **não** contem como movimento: editar um campo do card, receber uma retransmissão inerte e o próprio lead ser lido por alguém.
40. Como sistema, quero que o relógio de estagnação comece na chegada quando o lead ainda não teve movimento nenhum, para que um lead nunca tocado seja o mais parado de todos e não o menos.
41. Como gestor, quero que o limite de estagnação seja em dias e configurável, porque uma operação de veículo e uma de imóvel não têm o mesmo ritmo.
42. Como sistema, quero que lead ganho, perdido ou mesclado nunca conte como parado.

### Configuração de SLA

43. Como Gestão ou Direção, quero configurar em Configurações o SLA de primeiro contato em minutos e a estagnação em dias, sem pedir nada à marctco.
44. Como sistema, quero que o workspace que nunca tocou nessa tela use um padrão do domínio, e **não** fique sem relógio nenhum — ausência de configuração é o padrão, não o desligamento.
45. Como sistema, quero recusar valores inválidos (zero, negativo, absurdo) na escrita, e não descobrir isso na hora de calcular.
46. Como Atendente ou Supervisor, não quero editar SLA, porque isso é configuração da operação.
47. Como Gestão, quero que mudar o SLA **reavalie** os leads em aberto na próxima varredura, em vez de valer só para os que chegarem depois.
48. Como sistema, não quero que SLA seja feature flag: ele não custa dinheiro por uso e não chama terceiro nenhum ([ADR-0004](../../docs/adr/0004-fronteira-flag-configuracao-estado.md)).

### Alerta ao gestor

49. Como gestor, quero ser avisado quando um lead estoura o SLA de primeiro contato, sem precisar ficar olhando a tabela.
50. Como gestor, quero ser avisado quando um lead passa do limite de estagnação.
51. Como sistema, quero **uma** notificação por lead e por tipo, para que a varredura de cinco em cinco minutos não produza um aviso novo a cada passada.
52. Como gestor, quero marcar a notificação como lida enquanto trabalho nela, para saber o que já olhei hoje.
53. Como sistema, quero que a notificação se **resolva sozinha** quando a causa acaba — o lead recebeu o primeiro contato, voltou a se mover, foi ganho, perdido ou mesclado.
54. Como sistema, quero que marcar como lida **não** resolva a notificação, porque o lead continua estourado e some da lista de quem não olhou.
55. Como gestor, quero clicar na notificação e cair no lead, com o workspace certo na URL.
56. Como supervisor com tag, quero ver as notificações do meu time.
57. Como atendente, não quero notificação de gestão, porque não é a mim que cabe reagir a gargalo de operação — o meu sinal é a atividade vencida na minha Agenda.
58. Como sistema, quero que a varredura rode mesmo com o Redis fora, porque o relógio não pode depender da fila de ingestão.
59. Como sistema, quero que a falha de um workspace na varredura não interrompa a passada dos outros.
60. Como sistema, quero que a varredura escreva sob isolamento de tenant como qualquer outra escrita, sem bypass de RLS.

### Dashboard operacional

61. Como Gestão, quero abrir o dia num Dashboard que responde "o que está queimando agora", em vez de varrer a tabela paginada.
62. Como gestor, quero os números do dia em destaque: leads estourados, leads parados, leads sem responsável e atividades vencidas.
63. Como gestor, quero clicar em cada número e cair na tabela de Leads ou na Agenda já filtrada por aquilo, porque número que não leva a lugar nenhum não vira ação.
64. Como gestor, quero um gráfico de chegada por dia nas últimas semanas, para saber se a mídia mudou de volume.
65. Como gestor, quero um gráfico de aderência ao SLA por dia, para saber se a operação está piorando ou melhorando.
66. Como gestor, quero ver a distribuição dos leads em aberto por etapa, para achar o gargalo do funil.
67. Como supervisor com tag, quero o Dashboard do meu time, para cobrar os meus atendentes com número na mão.
68. Como Atendente, não quero Dashboard, porque não respondo pela operação — a minha tela é Meus leads e a Agenda.
69. Como supervisor sem tag, quero que o Dashboard me explique a ausência de time, em vez de mostrar zeros que parecem defeito.
70. Como gestor, quero que o Dashboard seja legível em tela pequena, porque a primeira olhada do dia é no celular.
71. Como sistema, quero que os gráficos usem uma paleta categórica declarada no `DESIGN.md`, e não tons semânticos improvisados dentro do componente.

### Linha do tempo do lead

72. Como atendente que assumiu um lead reatribuído, quero ver o que aconteceu antes de mim — atribuições, movimentos de etapa e atividades concluídas —, para não recomeçar do zero.
73. Como sistema, quero que esses fatos sejam imutáveis e sobrevivam à mesclagem, transferindo-se para a Oportunidade canônica.
74. Como sistema, quero que a linha do tempo continue registrando os fatos de ingestão que a Fase 1 já grava, sem virar model genérico das fases futuras.
75. Como gestor, quero ver quem era o responsável anterior junto do fato da reatribuição, e não como um campo solto no card.

### Escopo, navegação e UI

76. Como membro, quero **Dashboard** e **Agenda** na barra lateral quando o meu perfil os alcança.
77. Como Atendente, não quero o item Dashboard na barra — e quero que a rota me recuse por conta própria, porque esconder botão não é controle de acesso.
78. Como sistema, quero que o escopo destas telas more nas operações nomeadas, junto do escopo que a Fase 2 já aplica, e não em `where` montado pela tela.
79. Como membro, quero que toda rota nova continue sob `/workspace/:slug`, porque o link que a notificação grava precisa nascer com o tenant dentro ([ADR-0012](../../docs/adr/0012-contexto-de-tenant-na-url.md)).
80. Como gestor com dois workspaces, quero que a notificação de um nunca apareça no outro.
81. Como sistema, quero que as tabelas novas nasçam com RLS habilitada e forçada, policy de isolamento e índice começando por `workspace_id`, como toda tabela deste projeto.

## Implementation Decisions

### Costura e módulos

**Nenhuma costura numerada nova.** Continua valendo o recorte das Fases 0–2: combinatória pura em `packages/domain`; o que uma pessoa alcança em **operações nomeadas de `packages/db` recebendo `UserContext`**; invariante de schema e RLS no Seam 3. O client do Prisma continua interno ([ADR-0016](../../docs/adr/0016-contexto-de-acesso-e-leitor-escopado.md)) e a tela não monta `where`.

Operações nomeadas novas, todas no mesmo módulo de acesso: criar, reagendar, concluir e cancelar atividade; listar atividades de um lead; listar a agenda de um intervalo; ler e escrever a configuração de SLA; listar e marcar como lida a notificação; ler o Dashboard operacional; listar a linha do tempo de um lead.

O Dashboard é **uma** operação nomeada que responde a tela inteira — tiles e séries dos gráficos —, pelo mesmo motivo que `getLeadBoard` responde o quadro inteiro: seis leituras soltas viram seis `where` montados por quem chamou, e o item A19 do plano já registra que consulta paralela custa conexão em pooling transaction-mode.

Escrita em route handler sob `/workspace/:slug/...`; leitura em Server Component. Sem Server Action. `@tanstack/react-query` só onde o [ADR-0013](../../docs/adr/0013-fluxo-de-dados-no-app.md) já autoriza: conclusão otimista de atividade na Agenda e no card.

`UserContext` **não ganha campo novo**. O escopo de perfil de toda leitura desta fase é o mesmo `opportunityScopeSql` que a Fase 2 usa (`eu` / `time` por `MemberTag` / `tudo`), aplicado dentro da operação.

### Schema

`Activity` — a Atividade, já mapeada no [ADR-0005](../../docs/adr/0005-idioma-codigo-en-ui-pt-br.md) com o campo `due_at`:

- `workspace_id`, `opportunity_id` (**obrigatório** — não existe atividade órfã), `assigned_user_id` (responsável), `type`, `title`, `notes?`, `due_at`, `status`, `completed_at?`, `completed_by_user_id?`, `canceled_at?`, `created_by_user_id`, `created_at`, `updated_at`.
- `ActivityType`: `CALL | MESSAGE | MEETING | TASK`. Quatro, com consumidor conhecido — a mesma disciplina que limitou os perfis a quatro e o catálogo de flags a três. `MESSAGE` cobre WhatsApp e e-mail sem antecipar a Fase 4; um valor `WHATSAPP` amarraria o tipo ao canal.
- `ActivityStatus`: `OPEN | DONE | CANCELED`. Concluir e cancelar são resultados diferentes e não podem ser o mesmo estado — conclusão prova atendimento, cancelamento não.
- Índices: `(workspace_id, due_at, id)` para a Agenda; `(workspace_id, opportunity_id, due_at)` para o card; parcial `(workspace_id, assigned_user_id, due_at) WHERE status = 'OPEN'` para "atividades vencidas por responsável" no Dashboard.

`WorkspaceSettings` — já mapeada no ADR-0005, criada nesta fase:

- Chave primária `workspace_id`; uma linha por workspace, **opcional**. Ausência significa "os padrões do domínio", nunca "sem SLA" — o oposto da regra fail-closed das feature flags, e de propósito: flag ausente é capacidade não contratada, configuração ausente é operação com o comportamento padrão.
- `first_contact_sla_minutes` e `stagnation_days`, ambos anuláveis, com `CHECK` de intervalo positivo no banco além do Zod compartilhado.
- **Não toca `private.provision_workspace`.** A linha nasce na primeira escrita da tela, não no provisionamento — mexer na função de provisionamento para criar uma linha de configuração opcional é risco desproporcional numa função `SECURITY DEFINER` que já tem o lock consultivo do duplo clique dentro.
- `first_contact_trigger` (ADR-0003) **não** entra: é da Fase 4, e a coluna sem o disparo é configuração que não configura nada.

`Notification` — model novo, com linha nova na tabela do ADR-0005 e verbete novo no `CONTEXT.md` **antes** da migration:

- `workspace_id`, `opportunity_id`, `type`, `detected_at`, `last_detected_at`, `read_at?`, `read_by_user_id?`, `resolved_at?`, `created_at`.
- `NotificationType`: `FIRST_CONTACT_SLA_BREACHED | STAGNANT`. A Fase 6 acrescenta o aviso de atendimento concluído no mesmo model — é o motivo de o nome ser genérico e não `SlaAlert`.
- **`UNIQUE(workspace_id, opportunity_id, type)`** — é o que faz a varredura ser idempotente. A passada seguinte encontra a linha e atualiza `last_detected_at`; não cria uma segunda. Sem essa constraint, uma varredura de cinco minutos produz doze avisos por hora do mesmo lead.
- **Sem coluna de destinatário e sem estado de leitura por usuário.** Quem enxerga a notificação é decidido pelo escopo de perfil da operação nomeada, como todo o resto do sistema; uma coluna de destinatário obrigaria a varredura a saber quem é gestor no momento da detecção e a refazer as linhas quando a Equipe muda. `read_at` é do aviso, não de cada leitor — a operação é pequena e "quem marcou" fica registrado em `read_by_user_id`.
- `resolved_at` é escrito quando a causa acaba. **Marcar como lida não resolve**, e resolver não exige leitura: são fatos diferentes.
- Índice parcial `(workspace_id, detected_at DESC) WHERE resolved_at IS NULL`, que é a pergunta do Dashboard.

`Opportunity` ganha colunas anuláveis (expand/contract, [ADR-0010](../../docs/adr/0010-migrations-e-ci-cd.md)):

- `first_contact_at` — instante da primeira Atividade concluída daquele lead. Escrito **uma vez**, com `WHERE first_contact_at IS NULL` na condição, para que a segunda conclusão não o sobrescreva e para que duas conclusões simultâneas sejam arbitradas pelo banco.
- `closed_at` — instante em que a Oportunidade passa a `WON` ou `LOST`. Nulo enquanto `OPEN`; obrigatório quando fechada (`CHECK` no banco). Encerra o relógio de SLA quando não houve primeiro contato. A operação de concluir atendimento da Fase 6 preenche; caminhos que já fecham o card (ex.: arquivar spam na quarentena) também gravam. **Decisão ticket 03 (2026-08-17):** adicionada nesta fase porque o relógio não pode continuar correndo após ganho/perda sem atendimento.
- `last_movement_at` — carimbo do último movimento. Nasce igual a `arrived_at` no backfill da migration, para que lead nunca tocado seja o mais parado e não o menos.
- Índices parciais só na migration, como os que já existem: `(workspace_id, arrived_at) WHERE first_contact_at IS NULL AND status = 'OPEN' AND merged_into_opportunity_id IS NULL` e `(workspace_id, last_movement_at) WHERE status = 'OPEN' AND merged_into_opportunity_id IS NULL`. O DSL do Prisma não expressa `WHERE` em `@@index`, e declarar índice cheio aqui mentiria sobre o histórico de migrations.

`OpportunityTimelineEventType` ganha `STAGE_CHANGED | ASSIGNED | REASSIGNED | RETURNED_TO_QUEUE | ACTIVITY_CREATED | ACTIVITY_COMPLETED`. O `CONTEXT.md` já autoriza: "atividade, mensagem e documento entram nas fases que os possuem" — **esta é a fase que possui atividade**. A unicidade atual `(workspace_id, type, integration_event_id)` é da ingestão e não serve aos fatos novos, que não têm evento de integração: a migration relaxa a coluna `integration_event_id` para anulável e move a unicidade para um índice parcial sobre as duas variantes de ingestão. Fato de movimento não deduplica — dois movimentos iguais em instantes diferentes são dois fatos.

> **Supersessão.** Esta spec listava só `ACTIVITY_COMPLETED`. Criar atividade também é movimento; [CONTEXT.md](../../CONTEXT.md) e [ADR-0005](../../docs/adr/0005-idioma-codigo-en-ui-pt-br.md) já mapeiam `ACTIVITY_CREATED` e `ACTIVITY_COMPLETED` como fatos distintos. A lista acima segue esses documentos.

`previous_assigned_user_id` **permanece** e não é substituída pela linha do tempo. Ela é a resposta barata a "de quem era este lead" numa linha de tabela; a linha do tempo é a resposta cara e completa. Foi criada como trilha mínima *até* esta fase, não *até ser apagada por* esta fase.

**Nenhum campo monetário novo.** Item A10 do plano continua na Fase 7.

### Primeiro contato e o relógio de SLA

Concluir a primeira Atividade de um lead faz três coisas na mesma transação: marca a atividade `DONE` com `completed_at`/`completed_by_user_id`, grava `first_contact_at` se ainda nulo, e carimba `last_movement_at` com um fato `ACTIVITY_COMPLETED` na linha do tempo.

O estado de SLA de um lead é **função pura** em `packages/domain`: recebe `arrived_at`, `first_contact_at`, `closed_at`, `status`, a configuração resolvida e o `now`, e devolve `PENDING | MET | BREACHED` com a duração. A duração termina em `first_contact_at` quando houve contato, em `closed_at` quando `WON`/`LOST` sem contato, ou em `now` enquanto `OPEN` sem contato. `WON`/`LOST` sem `closed_at` é inconsistência de dados: a função recusa em vez de deixar o relógio correr. Ela é a única fonte da resposta, chamada tanto pela listagem quanto pela varredura, para que a tela e o alerta nunca discordem.

O relógio é **corrido**. Horário comercial e feriado exigem um calendário de expediente por workspace que este produto não tem, e a alternativa — assumir 9h às 18h — mente sobre o lead que chega às 19h, que é justamente o lead de anúncio. Registrado como item aberto do plano (ver Further Notes).

### Estagnação

`last_movement_at` é escrito por `moveLeadStage`, `assignLead`/`assignLeads`, `reassignLead`/`reassignLeads`, pelo retorno à fila do desatrelamento e por criar/concluir Atividade. Essas operações já existem e já rodam em transação — a coluna entra no `SET` que elas já fazem, junto do fato na linha do tempo.

Editar campo do card, ler o lead e receber retransmissão inerte **não** são movimento. Retransmissão em particular: ela já não rebobina etapa, responsável nem situação, e deixá-la reanimar o relógio de estagnação faria um lead abandonado parecer vivo porque a origem reenviou o mesmo formulário.

A denormalização é deliberada, pelo mesmo motivo que `WorkspaceMember.display_name` foi denormalizado na Fase 2: o Dashboard e a varredura perguntam "há quanto tempo este lead não anda" sobre a carteira inteira, e responder isso com um `MAX(occurred_at)` por lead sobre a linha do tempo é varredura completa a cada passada. A linha do tempo continua sendo a verdade auditável; a coluna é o índice.

### Alerta ao gestor e a varredura agendada

A varredura segue exatamente o padrão de `apps/web/lib/payload-expiry-sweep.ts`: roda no processo web, num `setInterval` com `unref`, guarda contra passada sobreposta, **não depende do Redis**, e a falha de um workspace registra log e não interrompe os outros. Intervalo padrão de 5 minutos (o SLA é em minutos, não em dias), configurável por variável de ambiente com piso validado.

Cada passada, por workspace: resolve a configuração, marca `resolved_at` nas notificações cuja causa acabou, e insere as novas com `ON CONFLICT (workspace_id, opportunity_id, type) DO UPDATE SET last_detected_at = ...`. A idempotência é da constraint, nunca de um `SELECT` que veio antes — é a mesma disciplina do [ADR-0007](../../docs/adr/0007-ingestao-idempotencia.md).

Duas emendas de arquitetura que esta varredura exige — **registradas em 2026-08-19**; o ticket 09 materializa função, tipo e Seam 3 contra elas:

1. **Sexta função privada** — [ADR-0019](../../docs/adr/0019-resolucao-pre-contexto-e-executor-privado.md), emendado em 2026-08-19. A descoberta "quais workspaces têm lead vencido" acontece antes de existir tenant, exatamente como `private.claim_expired_payload_workspaces` do ticket 15. A lista fechada passa de cinco para seis: `private.claim_overdue_opportunity_workspaces` devolve somente `workspace_id`, com executor `NOLOGIN`, `search_path` fixado e grants mínimos; o Seam 3 passa a esperar seis quando o ticket 09 a materializar. *Alternativa rejeitada:* esticar a função de payload para devolver também os workspaces com lead vencido — ela é nomeada e indexada para outra pergunta, e as duas varreduras têm cadências diferentes por natureza (90 dias contra 5 minutos).
2. **Origem do `JobContext`** — [ADR-0016](../../docs/adr/0016-contexto-de-acesso-e-leitor-escopado.md) e `CONTEXT.md`, emendados em 2026-08-19. A forma antiga carregava "workspace e o evento que o originou", e a varredura de payload contornou isso com um evento âncora. **A varredura de SLA não tem âncora possível:** um lead liberado da quarentena, e amanhã um lead criado à mão, não têm evento de integração para apontar. A origem do `JobContext` é união — evento de integração **ou** passada agendada nomeada (`PAYLOAD_EXPIRY | OPPORTUNITY_CLOCK`). *Alternativa rejeitada:* âncora falsa apontando para um evento qualquer do workspace, que grava no banco uma causalidade que não existe e envenena qualquer auditoria futura.

### Agenda

`listAgenda(context, { from, to, responsible_user_id?, tag_id?, pipeline_id? })`. Intervalo obrigatório e limitado a uma janela máxima — calendário sem teto é `OFFSET` com outro nome.

Os filtros **estreitam** o escopo do perfil e nunca o alargam, como o filtro da tabela de Leads na Fase 2: supervisor filtrando por equipe alheia recebe conjunto vazio, não recusa. O escopo de uma Atividade é o escopo da **Oportunidade** a que ela pertence — o lead é a unidade de acesso, e uma segunda regra de escopo (a atividade cujo responsável sou eu) criaria a possibilidade de alguém alcançar uma atividade de um lead que não pode abrir.

Criar pela Agenda exige `opportunity_id`; a tela oferece busca de lead e a operação recusa a criação sem ele.

Quem pode marcar atividade para quem é **função pura** em `packages/domain`, no mesmo formato de `teamUserIds`: Atendente só para si; Supervisor para o time; Gestão e Direção para qualquer membro ativo — e em nenhum caso para quem não alcança aquele lead.

### Dashboard operacional

`getOperationalDashboard(context, { now })` devolve, tudo no escopo do perfil:

- **Tiles:** leads estourados, leads parados, leads sem responsável (vazio para Atendente e Supervisor, que não veem a fila — [ADR-0024](../../docs/adr/0024-fila-sem-dono-e-da-gestao.md)), atividades vencidas em aberto. Cada tile carrega o destino do clique: a tabela de Leads ou a Agenda com o filtro correspondente já na URL.
- **Séries:** chegadas por dia e aderência ao SLA por dia na janela recente; leads em aberto por etapa do funil comercial padrão.

Atendente não tem Dashboard: o item some da barra **e** a rota recusa, porque há número de operação que ele não deve ler. É a mesma distinção que a Fase 2 fez entre Equipe (some e recusa) e Meus leads (some por ausência de escopo).

Supervisor sem tag recebe zeros e o estado vazio que **nomeia a causa** e quem resolve — o padrão que a Fase 2 estabeleceu para Equipe, Leads e Kanban.

### Paleta de dataviz

O `DESIGN.md` registra em "Known Gaps": *"Data visualization has no palette... Derive it separately; do not improvise from the semantic tones."* Como esta fase entrega gráfico, a lacuna fecha aqui e vira entrada de componente e tokens no `DESIGN.md` — não CSS dentro do componente de gráfico.

O que precisa ser declarado: sequência categórica com contraste suficiente entre vizinhos, tratamento de séries além do tamanho da sequência, cor de eixo/grade derivada da escada de superfícies existente, e a regra de que estado semântico (estourado, atrasado) usa os tons semânticos que já existem e **não** entra na sequência categórica. Fecha o resto do item A10 do plano, que já apontava "paleta de dataviz (bloqueia Analytics)" — a Fase 7 herda pronta.

### UI

`DESIGN.md` é a lei. Agenda e Dashboard reusam `{component.data-table}`, `{component.card}`, `{component.status-badge}`, `{component.toggle-segmented}` (dia/semana) e `{component.empty-state}`. Duração de espera usa numerais tabulares, como a parcela.

Os sinais de **SLA estourado** e de **lead parado** entram na tabela de Leads por `{component.markers-menu}` — o ponto de entrada único que o [ADR-0018](../../docs/adr/0018-marcador-como-modulo.md) estabeleceu, e a regra de "um lead, um ícone" vale para todo aviso que as fases seguintes acrescentarem, que é este caso ao pé da letra. **Isto significa que `markersFor` passa a receber os dois estados de relógio** e a devolvê-los como marcadores; os contadores do topo continuam sem passar por ela.

A estagnação aparece nas duas superfícies de propósito: no Dashboard ela é pergunta de gestão ("quantos estão parados"), e no card ela é o aviso que faz o próprio atendente agir antes de o gestor cobrar. É a mesma verdade e a mesma função pura, como no SLA.

A barra ganha **Dashboard** e **Agenda**, cada um só para quem a matriz do [ADR-0015](../../docs/adr/0015-perfis-de-acesso-e-escopo.md) alcança. As linhas "Agenda e Atividades" e "Dashboard operacional" da matriz deixam de ser especificação futura e passam a ser critério das operações nomeadas.

## Testing Decisions

Um bom teste verifica **comportamento externo**: o que a operação nomeada aceita ou recusa, o que o banco ficou, e o que a função pura decidiu. Não verifica que um hook foi chamado, que o cache do cliente tem tal forma, nem que um componente de gráfico recebeu tal prop.

Esta fase **não inventa costura**. O recorte é o da plataforma.

### Costura principal — operações nomeadas sob `UserContext`

Prior art: `packages/db/tests/leads.test.ts`, `packages/db/tests/lead-board.test.ts`, `packages/db/tests/team.test.ts`.

Cobre:

- Criar atividade: recusa lead ganho, perdido e mesclado; recusa responsável fora do alcance do ator; recusa sem `opportunity_id`; Atendente só para si; Supervisor para o time e não fora dele; Gestão e Direção para qualquer membro ativo.
- Concluir atividade: grava `completed_at`/`completed_by_user_id`; **grava `first_contact_at` na primeira e não o sobrescreve na segunda**; duas conclusões simultâneas produzem um ganhador e uma recusa limpa; concluir de novo recusa.
- Cancelar não é concluir: não grava `first_contact_at`, não conta como atendimento.
- Reagendar muda `due_at` e não toca conclusão.
- Escopo de leitura de atividade: Atendente só as dos leads dele; Supervisor com tag as do time; Supervisor **sem** tag conjunto vazio; Gestão e Direção tudo.
- Agenda: intervalo respeitado; filtro por responsável, tag e funil **estreita** e nunca alarga — supervisor filtrando por equipe alheia recebe vazio, não recusa.
- `last_movement_at` é carimbado por mover etapa, atribuir, reatribuir, devolver à fila e concluir atividade; **não** é carimbado por editar campo do card nem por retransmissão inerte.
- `first_contact_at` **não** é escrito por atribuir nem por mover etapa. É a regra que separa distribuir de atender e a mais fácil de errar.
- Linha do tempo: os fatos novos nascem sem evento de integração; os dois fatos de ingestão continuam deduplicando pela chave que já tinham; a mesclagem transfere os fatos para a canônica.
- Configuração de SLA: Gestão e Direção escrevem, Atendente e Supervisor recusam; valor inválido recusa na escrita; workspace sem linha lê os padrões do domínio.
- Notificação: a segunda passada da varredura **não** cria segunda linha para o mesmo lead e tipo; marcar como lida não resolve; a causa acabar resolve; escopo de leitura por perfil, com Atendente recusado; notificação de um workspace nunca aparece no outro.
- Dashboard: os quatro tiles no escopo de cada perfil; fila sem dono zerada para Atendente e Supervisor; Supervisor sem tag recebe zeros; Atendente recusado.
- A migration preenche `last_movement_at` dos leads que já existem — nenhum lead antigo nasce "parado desde 1970" nem "movido agora".

A varredura em si é testada como `apps/web/lib/payload-expiry-sweep.test.ts` já testa a sua: passada idempotente, um workspace que falha não impede os outros, intervalo inválido recusado na configuração.

### Seam 1 — `packages/domain`

Prior art: `intake-plan.test.ts`, `team-scope.test.ts`, `lead-stage-move.test.ts`, `markers.test.ts`.

Cobre: o estado de SLA em todas as combinações de `arrived_at`, `first_contact_at`, situação e configuração, incluindo o limite exato e o lead fechado sem atendimento; o estado de estagnação, incluindo o lead sem movimento nenhum ancorado em `arrived_at`; a resolução da configuração do workspace sobre os padrões do domínio, e a recusa de valores inválidos; quem pode marcar atividade para quem; se uma atividade é reagendável, concluível ou cancelável; `markersFor` com o marcador de SLA junto dos marcadores que já existem, inclusive o lead com quatro avisos.

Este seam só existe porque `packages/domain` é puro. Se ele passar a importar Prisma, o seam morre.

### Seam 3 — RLS e schema

Prior art: `packages/db/tests/rls.test.ts`.

Cobre: `activities`, `workspace_settings` e `notifications` sob as mesmas varreduras de sempre — RLS habilitada e forçada, policy de isolamento, índice que serve à listagem, leitura e escrita cross-workspace recusadas; a lista fechada de `SECURITY DEFINER` passa a ter **seis** nomes e continua reprovando o sétimo; a função nova tem executor `NOLOGIN`, `search_path` fixado e grants mínimos; nenhum registro ativo aponta para registro mesclado, agora incluindo atividade e notificação; nenhum import do client cru fora de `packages/db`; drift check verde depois da migration.

### Seam 2 — não é tocado

A ingestão não muda nesta fase. `arrived_at` já é gravado como esta fase precisa, nos dois caminhos, e o Seam 2 já prova os dois lado a lado.

## Out of Scope

WhatsMiau, template de 1º contato, disparo na atribuição, timeline de mensagem (Fase 4) · documentos, propostas, contratos, assinatura (Fase 5) · ganho, perda, motivo de perda, handoff, funil jurídico, resumo LLM (Fase 6) · Analytics > Operação, Ranking, Metas, score de cabimento (Fase 7) · editor de funis na UI · tag na oportunidade · campo monetário novo (A10) · conector nativo Meta/Google · telemetria de produto · billing.

Especificamente desta fase:

- **Sincronismo com Google/Outlook Calendar.** Decidido em `decisao-features-concorrentes.md` §6: calendário interno, sem sync externo no MVP.
- **Atividade sem lead.** Não há evento órfão na Agenda, por decisão do mesmo §6.
- **Atividade recorrente**, e lembrete antes do vencimento.
- **Notificação por e-mail e por push.** A notificação desta fase é in-app. O model persistido é o que torna e-mail e push aditivos depois, mas eles não entram aqui.
- **Horário comercial e calendário de feriados.** O relógio é corrido. Vira item aberto do plano.
- **`first_contact_trigger`** e qualquer outra configuração da Fase 4 na tela de Configurações.
- **Estado de leitura por usuário** da notificação. `read_at` é do aviso.
- **Analytics histórico.** O Dashboard responde "o que está queimando agora"; a série temporal longa e os recortes por período, atendente, canal e tipo de financiamento são Fase 7 e vêm com a mesma paleta que esta fase declara.

## Further Notes

**A keystone escondida do MVP.** O `plano-de-construcao.md` chama `Activity` assim, e a divergência #2 contra `sintese-final.md` §13 explica por quê: Agenda, alerta de SLA e Dashboard operacional dependem dela, e §13 nem a nomeava. Esta fase é a que paga essa dívida — e o que a torna barata é que `arrived_at` foi gravado desde a Fase 1 e `previous_assigned_user_id` desde a Fase 2, justamente para não ter de ser reconstruído agora.

**Por que a primeira Atividade concluída, e não a atribuição.** Foi a decisão mais consequente desta spec. Parar o relógio na atribuição mede distribuição e chama isso de atendimento: o lead entregue ao Supervisor às 8h05 sairia da lista de estourados sem ninguém ter ligado, e o gargalo que a operação real tem — lead atribuído e esquecido — ficaria invisível exatamente na tela criada para revelá-lo. A Fase 4 acrescenta a mensagem de WhatsApp como segunda evidência de primeiro contato preenchendo a mesma coluna, porque a coluna significa "quando alguém falou com esta pessoa pela primeira vez" e não "quando uma atividade foi concluída".

**Item aberto novo: horário comercial no relógio de SLA.** A operação atende em horário comercial; o relógio corre 24 horas. Enquanto o SLA for medido em minutos e comparado consigo mesmo dia a dia, a distorção é constante e o gestor a lê sem problema. Ela vira mentira no dia em que o número for para uma proposta comercial ou para Metas (Fase 7). O gatilho para decidir é esse — e a decisão exige um calendário de expediente por workspace, não uma constante.

**Item aberto novo: notificação fora do app.** A notificação in-app só é vista por quem abre o CRM. Um gestor que não abre o app numa manhã não é avisado de nada. E-mail e push resolvem, e o model persistido desta fase é o que os torna aditivos — mas ambos exigem decidir cadência e agregação (um e-mail por lead estourado transforma o alerta em ruído no primeiro dia de volume).

**A matriz do ADR-0015 fecha mais duas linhas.** "Agenda e Atividades" e "Dashboard operacional" deixam de ser letra. Sobram Timeline WhatsApp (4), Contratos e Documentos (5), concluir atendimento e handoff (6), Analytics/Ranking/Metas (7).

**O `Marcador` do `CONTEXT.md` já previa este caso.** "Sinaliza, nunca bloqueia, e é sempre resolvível... Quantos houver, o usuário os alcança por um único ponto de entrada no lead." O SLA estourado entra como marcador por `markersFor` e a `Notification` é a mesma pendência vista do lado do gestor, com persistência porque a varredura precisa de idempotência e o gestor precisa marcar o que já olhou. São a mesma verdade em duas superfícies, e não devem divergir: por isso a função pura de estado de SLA é uma só, chamada pelas duas.

**Duas emendas de ADR, registradas em 2026-08-19, antes da primeira migration do ticket 09.** A sexta função privada (ADR-0019) e a origem do `JobContext` (ADR-0016 e `CONTEXT.md`). Nenhuma das duas é reabertura de decisão: a primeira é o crescimento previsto de uma lista que já cresceu uma vez de propósito; a segunda é o reconhecimento de que trabalho agendado sem evento de origem existe — a varredura de payload já era esse caso e o contornou com uma âncora que a varredura de SLA não tem como fabricar. O ticket 09 materializa função, tipo e Seam 3 contra esses textos; fazer as emendas depois da migration seria reescrever teste de Seam 3 e tipo de contexto com código em cima.
