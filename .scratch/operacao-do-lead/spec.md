# Spec — Operação do lead

Status: ready-for-agent

> Fase 2 de [docs/plano-de-construcao.md](../../docs/plano-de-construcao.md).
> Vocabulário: [CONTEXT.md](../../CONTEXT.md). Nomes de código: [ADR-0005](../../docs/adr/0005-idioma-codigo-en-ui-pt-br.md).
> ADRs vinculantes: 0002, 0003 (só o campo de telefone no membro; o disparo é Fase 4), 0005, 0009, 0013, 0015, 0016, 0019, 0020, 0021, 0022, 0023.
> Costuras: as três da [spec de fundação e ingestão](../fundacao-e-ingestao/spec.md) — nenhuma quarta numerada. A costura principal desta fase é o mesmo lugar em que `listLeads` e `assignLead` já vivem.

---

## Problem Statement

O lead já entra, já tem Pessoa, já tem card na tabela. Ninguém consegue trabalhar nele.

A Direção não tem como cadastrar atendente, supervisor ou gestão — o workspace só tem o dono que o provisionamento criou. Sem Equipe não há responsável, e sem responsável a tabela de Leads é uma fila que ninguém puxa. Dois gestores clicam no mesmo card e os dois acham que ficou com cada um. O Supervisor, no papel, deveria ver o time e a fila sem dono; no código ainda enxerga o workspace inteiro, porque não existe tag no membro. O atendente não tem um quadro das próprias etapas — só a tabela geral de triagem, pensada para volume, não para o dia a dia de quem liga. O supervisor que separa fila mista (Hugs e REAL no mesmo anúncio) não vê campanha nem formulário na linha, então atribui no escuro. A Direção que já é dona da Hugs não consegue nascer a ACR: o onboarding recusa quem já tem vínculo, e o provisionamento devolve o workspace antigo em vez de criar o segundo.

## Solution

A Direção cadastra a Equipe no próprio CRM: login e vínculo nascem juntos, com papel e tag no mesmo gesto. Tag no membro é o time. O Supervisor passa a ver só quem compartilha tag com ele e a fila sem dono daquele workspace — e deixa de herdar o alcance da Gestão. Atribuir vale só sobre lead sem dono e o banco arbitra a corrida; reatribuir é outra operação, com o dono atual visível e confirmação. Desatrelar tira a pessoa daquele workspace; desligar tira do quadro inteiro; nos dois casos os leads em aberto voltam à fila sem dono daquele tenant, sem apagar login, membro nem Oportunidade.

O atendente ganha **Meus leads**: Kanban das etapas em aberto, com troca de etapa. A tabela geral continua sendo a triagem. O card aceita valor opcional. A fila sem dono mostra campanha e formulário. Workspace adicional da mesma Direção nasce da mesma marcação da marctco de sempre — o vínculo que já existe não bloqueia.

## User Stories

### Equipe e nascimento

1. Como Direção, quero cadastrar um colaborador na Equipe com e-mail, nome, papel e tag, para que ele entre no workspace já podendo trabalhar — sem a marctco criar atendente no painel do Supabase.
2. Como Direção, quero que o cadastro ofereça só Atendente, Supervisor e Gestão, para que ninguém vire Direção pela Equipe.
3. Como Direção, quero criar uma tag que ainda não existe no mesmo gesto em que a aplico no membro, para não ter uma tela de taxonomia em Configurações.
4. Como Direção, quero aplicar mais de uma tag no mesmo membro, porque a mesma pessoa pode atender mais de um time.
5. Como Direção, quero cadastrar um e-mail que já é login e só atrelar essa pessoa a este workspace, para não criar segundo auth.
6. Como Direção, quero reativar um vínculo desatrelado ao cadastrar de novo o mesmo e-mail neste workspace, para não falhar numa chave que ainda existe.
7. Como colaborador cadastrado, quero receber um convite para definir senha e entrar, porque não há inscrição pública.
8. Como colaborador, quero nascer **sem** direito de provisionar, para que meu login nunca crie um workspace.
9. Como Gestão, quero ver toda a Equipe deste workspace, para saber quem está ativo.
10. Como Supervisor, quero ver na Equipe só quem compartilha tag comigo, porque o resto do organograma não é o meu time.
11. Como Atendente, não quero ver a Equipe, porque não gerencio gente.
12. Como Gestão ou Direção, quero desatrelar um colaborador só deste workspace, para que ele deixe de ver estes leads e possa continuar em outro tenant.
13. Como Direção, quero desligar uma pessoa do quadro, para que todos os vínculos ativos caiam e ela não entre em workspace nenhum.
14. Como sistema, quero que desatrelar e desligar **não** apaguem login, membro nem Oportunidade, para preservar a trilha.
15. Como sistema, quero que leads em aberto de cada workspace afetado voltem à fila sem dono daquele tenant, e que ganho e perda continuem com o responsável histórico.
16. Como Direção, não quero desatrelar nem desligar a mim mesmo, nem desfazer o vínculo de Direção que o provisionamento criou neste workspace, para o tenant não ficar sem dono.
17. Como Gestão da Hugs, não quero desligar alguém da ACR, porque desligar atravessa tenants e só a Direção opera os dois.
18. Como colaborador desatrelado só da ACR, quero continuar entrando na Hugs, e quero 404 uniforme se eu colar o slug da ACR.
19. Como pessoa desligada, sem vínculo ativo e sem direito de provisionar, quero ir para o login — não para uma sala de espera.
20. Como Direção, quero editar papel e tags de um membro ativo, porque o time muda sem recadastrar.

### Perfil de acesso e escopo do Supervisor

21. Como Atendente, quero ver só os leads atribuídos a mim, na tabela e no Kanban, para não navegar a carteira da empresa.
22. Como Supervisor com tag, quero ver na tabela os leads do meu time **e** a fila sem dono deste workspace, para atribuir o que chegou misturado.
23. Como Supervisor com tag, quero que o Kanban **Meus leads** mostre só o time já atribuído — não a fila sem dono —, porque a fila se atribui na tabela.
24. Como Supervisor sem tag, quero não ter time e não atribuir, para o alcance não voltar a ser o da Gestão por omissão.
25. Como Atendente sem tag, quero ser alcançado só pela Gestão e pela Direção na atribuição, porque não pertenço a time nenhum.
26. Como Gestão ou Direção, quero ver e atribuir a operação inteira deste workspace.
27. Como Supervisor, quero resolver identidade e duplicidade só no time, não na carteira inteira.
28. Como Atendente, não quero atribuir, reatribuir, cadastrar, desatrelar nem desligar.
29. Como sistema, quero que o escopo more nas operações nomeadas, não em botão escondido, para a recusa valer mesmo com a rota chamada direto.

### Atribuição e reatribuição

30. Como Gestão, quero atribuir um lead sem dono a um colaborador ativo, para o atendimento ter responsável.
31. Como Supervisor, quero atribuir um lead da fila sem dono só a quem compartilha tag comigo.
32. Como gestor, quero que dois cliques no mesmo lead sem dono produzam um ganhador e uma falha limpa para o outro, em vez do último escrever em silêncio.
33. Como gestor, quero ver na falha que o lead já tem dono, para não ligar em duplicata.
34. Como Gestão ou Direção, quero reatribuir um lead que já tem dono, vendo quem é o responsável atual e confirmando, para cobrir férias e saída.
35. Como sistema, quero que atribuir e reatribuir sejam operações diferentes: atribuir exige `assigned_user_id` nulo; reatribuir exige o dono atual no `WHERE`.
36. Como gestor, quero que a linha atribuída saia da fila sem dono na hora, para eu não atribuir de novo na mesma vista.
37. Como atendente, quero que o lead atribuído a mim apareça no meu Kanban sem eu procurar na tabela geral.

### Fila, card e discriminadores

38. Como Supervisor, quero ver `campaign_id` e `form_id` na fila sem dono, para não separar Hugs e REAL no escuro.
39. Como atendente, quero ver campanha e formulário no card, para saber de qual anúncio o cliente veio.
40. Como atendente, quero registrar um valor opcional no card, distinto da parcela, para Ranking e Metas terem o que agregar depois.
41. Como atendente, quero que valor vazio continue válido, porque nem todo lead de revisional nasce com ticket.
42. Como gestor, quero distinguir dois cards da mesma Pessoa pelos dados de financiamento **e** por campanha, formulário, origem e responsável — o conjunto que a operação tem, não um campo tratado como prova.
43. Como atendente, quero ver o **nome** do responsável no card ligado por possível duplicado, não um identificador opaco.

### Kanban Meus leads

44. Como atendente, quero um Kanban só dos meus leads em aberto, para conduzir o dia pelas etapas.
45. Como atendente, quero alternar Kanban e tabela em Meus leads, porque às vezes preciso varrer nomes, não colunas.
46. Como gestor, quero que a lista geral continue sendo tabela paginada, sem Kanban global.
47. Como atendente, quero arrastar um card em aberto para outra etapa do mesmo funil, e quero que a etapa persista.
48. Como sistema, quero que ganho e perda **não** apareçam como colunas do Kanban: só etapas da jornada em aberto.
49. Como sistema, quero recusar mover lead ganho, perdido ou mesclado, e recusar destino de outro funil.
50. Como sistema, quero que dois arrastes concorrentes da mesma etapa sejam arbitrados pelo `WHERE` da etapa atual, não por leitura anterior.
51. Como sistema, quero que mover etapa **não** toque `arrived_at`, porque o relógio de atendimento não recomeça por drag-and-drop.
52. Como Supervisor, quero o Kanban do time; como Gestão ou Direção, o de todos os leads em aberto deste funil comercial.
53. Como atendente no celular, quero o Kanban em faixa com scroll-snap, porque colunas lado a lado não cabem.

### Workspace adicional e login fechado

54. Como Direção já associada à Hugs, quero provisionar a ACR quando a marctco me marcar de novo com direito e nome, sem perder o primeiro workspace.
55. Como Direção com dois workspaces, quero o seletor para alternar, cada aba no seu tenant.
56. Como colaborador já associado, mesmo que alguém me marque por engano, não quero provisionar — eu não tenho o direito, e o cadastro na Equipe nunca o concede.
57. Como pessoa autenticada sem vínculo ativo e sem direito, quero sair para o login, não ficar numa tela de espera.
58. Como sistema, quero que o gasto do direito continue acontecendo **antes** do provisionamento, para um direito pendurado não nascer tenant fantasma.

### Navegação

59. Como membro, quero **Equipe** na barra lateral se o meu perfil a alcança, e quero **Meus leads** além de **Leads**.
60. Como Atendente, não quero o item Equipe na barra — ausência de item não é o controle de acesso; a rota recusa sozinha.

## Implementation Decisions

### Costura e módulos

A plataforma testa escrita e escopo nas **operações nomeadas de `packages/db` que recebem `UserContext`**. Combinatória pura mora em `packages/domain`. Invariantes de schema e RLS moram no Seam 3. Não nasce costura numerada nova, não nasce sexta função `SECURITY DEFINER`, e o client do Prisma continua interno.

Esta fase acrescenta operações nomeadas no mesmo módulo de acesso — Equipe, atribuição estreita, reatribuição, movimento de etapa, listagem do Kanban. A tela não monta `where`. Route handler sob `/workspace/:slug/...` escreve; Server Component lê. Sem Server Action.

`UserContext` **não ganha tags**. O time do Supervisor é join em `MemberTag` **dentro** da operação. Tag no contexto reconstroi o objeto a cada edição da Equipe e espalha escopo.

### Schema

- `WorkspaceMember.status`: `ACTIVE | DETACHED`, default `ACTIVE`. Desatrelar e desligar desativam o vínculo; não apagam a linha. Não existe terceiro valor “desligado”.
- `WorkspaceMember.display_name` e `WorkspaceMember.email`: denormalizados no cadastro, para a Equipe e o nome do responsável listarem sem Auth a cada linha.
- `WorkspaceMember.whatsapp_phone_e164`: opcional, normalizado pelo mesmo leitor de telefone da ingestão. A Equipe coleta agora porque o cadastro é o gesto; o disparo WhatsApp permanece Fase 4.
- `Tag`: catálogo do workspace. Unicidade por workspace e nome, sem distinguir maiúscula.
- `MemberTag`: aplicação da tag ao membro. É o que computa o time. Nunca herdada pela Oportunidade.
- `Opportunity.amount`: decimal opcional, distinto de `installment_amount`. Mesma normalização monetária da parcela.
- `Opportunity.campaign_id` e `Opportunity.form_id`: texto opcional, gravados na ingestão a partir do lead normalizado. Retransmissão **não** sobrescreve. A fila não lê o payload bruto: ele expira em 90 dias.

Toda tabela nova entra no Seam 3: RLS habilitada e forçada, policy de isolamento, índice que começa por `workspace_id`. Expand/contract: `status` nasce com default; colunas novas são anuláveis.

`resolve_user_workspaces` passa a devolver só vínculo `ACTIVE`. Sem função nova: a quarta da lista fechada ganha o filtro. Quem está `DETACHED` naquele slug leva o mesmo 404 de slug inexistente.

O mapeamento do ADR-0005 ganha as colunas desta fase **antes** da migration. `campaign_id` / `form_id` deixam de ser “até a spec decidir persistência”: esta spec decide persistir na Oportunidade.

### Equipe

Cadastro é da Direção. A rota fala com a Auth Admin: e-mail ainda não é login → convite (a pessoa define senha; não há inscrição); e-mail já é login → reusa o `user_id`. Em seguida a operação nomeada grava o vínculo `ACTIVE` com papel `ATTENDANT | SUPERVISOR | MANAGER`, tags e telefone opcional, **sem** `can_provision_workspace`.

Atrelar o mesmo `user_id` de novo neste workspace, se a linha estiver `DETACHED`, volta a `ACTIVE` e aplica o papel/tags novos. Não cria segunda linha.

Desatrelar: Gestão ou Direção; marca `DETACHED` **neste** workspace; `UPDATE` das Oportunidades `OPEN` deste tenant com aquele responsável para `assigned_user_id` nulo. Recusa o próprio ator e recusa o `OWNER` deste workspace.

Desligar: só Direção. A operação recebe o `UserContext` do workspace onde o botão foi clicado (prova que o ator é `OWNER` **ali**) e, via `listUserWorkspaces` do próprio ator, percorre os tenants em que ele é `OWNER` e aplica o mesmo desatrelamento em cada um. Também revoga o direito de provisionar no Auth. Não nasce função privada nova: cada tenant abre o próprio `withAccessContext`. Gestão não percorre os outros tenants porque `listUserWorkspaces` só devolveria `MANAGER` na Hugs.

Leads `WON`/`LOST` não voltam à fila.

### Escopo do Supervisor

Enquanto não existia `MemberTag`, o código tratava `SUPERVISOR` como `MANAGER`. **Essa equivalência acaba nesta fase**, inclusive para Supervisor ainda sem tag: sem tag, time vazio, não atribui, Kanban vazio, tabela só com a fila sem dono.

Time = membros `ACTIVE` que compartilham **ao menos uma** tag com o Supervisor, e as Oportunidades atribuídas a eles (o Supervisor está no próprio time). Fila sem dono **não** é time: só tabela de Leads e atribuição.

A função pura em `packages/domain` recebe as tags do ator e o quadro de membros e devolve o conjunto de `user_id` do time — incluindo o caso vazio. As operações nomeadas aplicam esse conjunto no SQL. `ATTENDANT` continua filtrando `assigned_user_id = user_id` e **não** vê fila sem dono.

### Atribuição

`assignLead` já existe e já arbitra com `assigned_user_id IS NULL`. Nesta fase ela passa a exigir destino `ACTIVE` neste workspace, a recusar `ATTENDANT`, e a recusar Supervisor cujo destino não está no time. Gestão e Direção atribuem a qualquer membro `ACTIVE` que não seja o `OWNER` de provisionamento, se o destino for colaborador da Equipe — na prática, qualquer `ACTIVE` do tenant, inclusive Gestão que assume um card.

`reassignLead` é operação nova: `WHERE assigned_user_id = :current`. Só Gestão e Direção. A UI mostra o dono atual e pede confirmação. Supervisor não reatribui.

Nenhuma das duas dispara WhatsApp.

TanStack Query entra só onde o ADR-0013 mandou: remoção otimista da linha atribuída e o Kanban. A tabela geral continua Server Component + `router.refresh()`.

### Kanban

Rota própria de Meus leads, item na barra. Toggle `{component.toggle-segmented}` Lista / Kanban. Colunas = etapas do funil comercial padrão, só `OPEN` não mescladas, no escopo do papel. `@dnd-kit` persiste por route handler que chama `moveLeadStage`. Condição: etapa atual, mesmo `pipeline_id`, `status = OPEN`, não mesclado. Destino tem de ser etapa desse funil. `arrived_at` intocado.

Ganho, perda, motivo e editor de funil ficam fora. Card do Kanban segue `{component.kanban-card}`: nome, valor se houver, etapa, responsável.

### Ingestão (efeito colateral mínimo)

O plano de Oportunidade nova passa a carregar `campaign_id`, `form_id` e a coluna `amount` nasce nula. Retransmissão inerte continua sem esses campos — não tem onde guardá-los, e é assim que não rebobinam. O Seam 2 só se estende para provar que o card ingerido **tem** campanha/formulário quando o `v1` os trouxe, e que o reenvio não os apaga.

### Provisionamento do segundo workspace

`onboardingDecision`: direito presente → provisiona, **mesmo com vínculo ativo**. Sem direito e com vínculo ativo → entra como membro. Sem direito e sem vínculo ativo → login, não espera. Colaborador nunca tem o direito.

`provision_workspace` **deixa de devolver o vínculo existente**. Sempre cria tenant + `OWNER` + funil padrão. O gasto do direito continua **antes** da chamada: a leitura do usuário só gasta quando `can_provision_workspace` é o booleano `true`; se já é falso, a rota não provisiona. A marcação nova da marctco (direito + nome) é o que autoriza o tenant N.

O lock consultivo na função permanece para serializar criações concorrentes. Dois POSTs com o mesmo JWT ainda vivo são corrida residual — o mesmo gênero de duas marcações. Não se inventa sexta função privada para fechá-la.

O teste atual que exige “quem já pertence recebe o workspace antigo” **inverte o critério**: quem já pertence e tem direito novo recebe um workspace **novo**; quem já pertence e não tem direito nem chega na função.

### UI

`DESIGN.md` é a lei. Equipe é `{component.data-table}` no desktop e card empilhado abaixo de 480px. Kanban vira faixa com scroll-snap abaixo de 768px. A barra ganha Meus leads e Equipe (Equipe só para quem a matriz alcança na leitura; a rota recusa o resto). Integrações continuam Gestão para cima.

Valor e parcela usam numerais tabulares. Campanha e formulário na fila sem dono são colunas da tabela de Leads quando o filtro efetivo é “sem responsável” — ou colunas permanentes da tabela geral, se forem baratas; a fila mista é o requisito, não um layout extra.

## Testing Decisions

Um bom teste verifica comportamento externo: o que a operação nomeada aceita ou recusa, e o que o banco (ou a decisão pura) ficou. Não verifica que um hook foi chamado, nem o formato de um cache de cliente, nem que o DnD disparou um evento do `@dnd-kit`.

Esta fase **não inventa costura**. O recorte abaixo é a prática da plataforma, a mesma da fundação: domínio puro para combinatória, operações nomeadas para o que uma pessoa alcança, Seam 3 para tabela nova e invariante que nenhuma rota exercita. O Seam 2 só se toca no efeito colateral da ingestão.

### Costura principal — operações nomeadas sob `UserContext`

Prior art: `packages/db/tests/leads.test.ts` (`assignLead`, escopo do `ATTENDANT`, `getLead`).

Cobre:

- Supervisor com tag vê time + fila sem dono na listagem; sem tag não atribui e não vê o time da Gestão.
- Atendente não vê fila sem dono nem lead de colega.
- Atribuir: um ganhador sob corrida; recusa Atendente; recusa Supervisor fora do time; recusa destino `DETACHED`.
- Reatribuir: recusa se o dono atual não casa; só Gestão e Direção.
- Desatrelar neste tenant devolve `OPEN` à fila e preserva `WON`/`LOST`; o desatrelado deixa de resolver o slug.
- Desligar: Direção dona de dois tenants desativa os dois vínculos; Gestão não atravessa o outro.
- Recusa desatrelar a si e desatrelar o `OWNER` daquele workspace.
- Cadastro atrela e-mail já existente; reativa `DETACHED`; nunca grava direito de provisionar; nunca cria papel `OWNER`.
- `moveLeadStage` arbitra pela etapa atual; recusa fechado, mesclado e funil alheio; não mexe `arrived_at`.
- `listUserWorkspaces` omite `DETACHED`.
- Segundo `provisionWorkspace` do mesmo `OWNER` nasce tenant novo; o gasto do direito já falso não chama a função.

Auth Admin fica fora desta costura: a rota resolve o `user_id` e a operação recebe o id. Testes de banco não sobem o Supabase.

### Seam 1 — `packages/domain`

Prior art: `intake-plan.test.ts`, `onboarding-decision.test.ts`, `markersFor`.

Cobre: conjunto do time (tag compartilhada, vazio, `DETACHED` fora, várias tags); quem pode atribuir a quem; se a etapa é móvel; `onboardingDecision` com direito + vínculo existente → provisiona; sem direito e sem vínculo → não é espera.

### Seam 3 — RLS e schema

Prior art: `packages/db/tests/rls.test.ts`.

Cobre: `Tag`, `MemberTag` e as colunas novas sob as mesmas varreduras; nenhum `SECURITY DEFINER` além da lista fechada; `resolve_user_workspaces` ignora `DETACHED`; nenhum import do client cru.

### Seam 2 — só o efeito na ingestão

Prior art: `tests/seam2-ingestion.test.ts`.

Cobre: Oportunidade nova persiste `campaign_id`/`form_id` quando o `v1` os trouxe; retransmissão inerte não os apaga nem os sobrescreve. Nada de Equipe, Kanban ou atribuição neste seam.

## Out of Scope

WhatsMiau, template de 1º contato, disparo na atribuição, timeline de mensagem · Atividade, `due_at`, Agenda, SLA, estagnação, alerta ao gestor, Dashboard operacional · tag na Oportunidade · ganho, perda, motivo de perda, handoff, funil jurídico · editor de funis na UI · documentos, contratos, assinatura · Analytics, Ranking, Metas · score e resumo LLM · billing · conector nativo Meta/Google · telemetria de produto.

O campo `whatsapp_phone_e164` entra; o envio não.

Kanban global de todos os leads não entra. Meus leads é que tem quadro.

## Further Notes

**A2 (discriminadores).** A Fase 1 ligou possível duplicado sem exigir financiamento. Esta fase mostra o conjunto que a operação já tem — tipo, instituição, parcela, origem, campanha, formulário, responsável por nome — no card e na fila. Nenhum desses campos vira prova nem gatilho.

**Matriz do ADR-0015.** As linhas da Fase 2 deixam de ser especificação futura e passam a ser critério das operações nomeadas. O restante da matriz (Agenda, handoff, Analytics) continua letra para as fases que as possuem.

**Corrida residual no segundo tenant.** Dois POSTs com o mesmo JWT ainda portando o direito podem, em teoria, nascer dois workspaces depois que a função deixa de reusar o vínculo antigo. O gasto com leitura do booleano estrito fecha o caso comum (segundo clique depois do gasto). Não se abre função privada para o caso simultâneo.

**`assignLead` hoje.** A operação já recusa Atendente e já arbitra `IS NULL`. O que falta — destino ativo, time do Supervisor, reatribuição distinta, UI — é esta fase, não um rewrite da arbitragem.
