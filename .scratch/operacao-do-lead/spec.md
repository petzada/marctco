# Spec — Operação do lead

Status: ready-for-agent

> Fase 2 de [docs/plano-de-construcao.md](../../docs/plano-de-construcao.md).
> Vocabulário: [CONTEXT.md](../../CONTEXT.md). Nomes de código: [ADR-0005](../../docs/adr/0005-idioma-codigo-en-ui-pt-br.md).
> ADRs vinculantes: 0002, 0003 (só o campo de telefone no membro; o disparo é Fase 4), 0005, 0009, 0013, 0014, 0015, 0016, 0019, 0020, 0021, 0022, 0023, 0024, 0025, 0026.
> Costuras: as três da [spec de fundação e ingestão](../fundacao-e-ingestao/spec.md) — nenhuma quarta numerada. A costura principal desta fase é o mesmo lugar em que `listLeads` e `assignLead` já vivem.

---

## Problem Statement

O lead já entra, já tem Pessoa, já tem card na tabela. Ninguém consegue trabalhar nele.

A Direção não tem como cadastrar atendente, supervisor ou gestão — o workspace só tem o dono que o provisionamento criou. Sem Equipe não há responsável, e sem responsável a tabela de Leads é uma fila que ninguém puxa. Dois gestores clicam no mesmo card e os dois acham que ficou com cada um. O Supervisor, no papel, deveria ver o time; no código ainda enxerga o workspace inteiro — inclusive a fila sem dono —, porque não existe tag no membro.

**E o caminho do lead até quem atende não existe.** A operação real é em dois níveis: de manhã a Gestão abre a fila única — leads de todas as campanhas do grupo, misturados de propósito — e entrega cada um ao Supervisor da equipe que vai trabalhá-lo; o Supervisor então reparte entre os atendentes do seu time. Hoje só o primeiro movimento é possível: `assignLead` exige `assigned_user_id IS NULL`, e depois disso o Supervisor não tem operação nenhuma que passe o lead adiante. O segundo nível morre na porta.

O atendente também não tem um quadro das próprias etapas — só a tabela geral de triagem, pensada para volume, não para o dia a dia de quem liga. E a Direção que já é dona da Hugs não consegue nascer a ACR: o onboarding recusa quem já tem vínculo, e o provisionamento devolve o workspace antigo em vez de criar o segundo.

## Solution

A Direção cadastra a Equipe no próprio CRM: login e vínculo nascem juntos, com papel e tag no mesmo gesto. Tag no membro é o time. O Supervisor passa a ver só quem compartilha tag com ele — e deixa de herdar o alcance da Gestão, inclusive a fila sem dono, que fica com Gestão e Direção ([ADR-0024](../../docs/adr/0024-fila-sem-dono-e-da-gestao.md)).

**A distribuição em dois níveis vira operação de primeira classe.** Atribuir vale só sobre lead sem dono e o banco arbitra a corrida. Reatribuir é outra operação, com o dono atual no `WHERE`: Gestão e Direção reatribuem em qualquer lugar; o **Supervisor reatribui dentro do time** — dono atual e destino compartilhando tag com ele —, e é isso que faz o segundo nível existir. A confirmação de "este lead é de fulano, tem certeza?" existe para impedir que alguém tome o lead de um colega, então não aparece quando o dono atual é o próprio ator. A tabela ganha filtro por responsável e por equipe, que é como a Gestão acompanha sem precisar de um quadro.

Desatrelar tira a pessoa daquele workspace; desligar tira de todos os tenants daquela Direção; nos dois casos os leads em aberto voltam à fila sem dono daquele tenant, sem apagar login, membro nem Oportunidade, e guardando quem os tinha.

Quem atende ganha **Meus leads**: Kanban das etapas em aberto, com troca de etapa — Atendente vê os seus, Supervisor vê o time. Gestão e Direção não têm quadro porque não atendem: distribuem e acompanham na tabela, que continua sendo a vista de alto volume. A Oportunidade passa a guardar campanha e formulário, com os nomes legíveis, para a atribuição de mídia e para discriminar duplicado. Workspace adicional da mesma Direção nasce da mesma marcação da marctco de sempre — o vínculo que já existe não bloqueia.

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
19. Como pessoa desligada, sem vínculo ativo e sem direito de provisionar, quero uma tela que me diga que perdi o acesso e que a Direção resolve — não uma sala de espera que promete nada, e não um retorno mudo ao login que me faz achar que a senha quebrou.
20. Como Direção, quero editar papel e tags de um membro ativo, porque o time muda sem recadastrar.

### Perfil de acesso e escopo do Supervisor

21. Como Atendente, quero ver só os leads atribuídos a mim, na tabela e no Kanban, para não navegar a carteira da empresa.
22. Como Supervisor com tag, quero ver na tabela só os leads do meu time — inclusive os que a Gestão atribuiu a mim —, para repartir entre os atendentes. A fila sem dono não é minha.
23. Como Supervisor com tag, quero que o Kanban **Meus leads** mostre só o time já atribuído — não a fila sem dono —, porque a fila nem entra na minha tabela.
24. Como Supervisor sem tag, quero não ter time e não reatribuir, para o alcance não voltar a ser o da Gestão por omissão — e quero que a tela me diga **por que** está vazia, em vez de parecer defeito. A fila sem dono não é o consolo.
25. Como Atendente sem tag, quero ser destino só de **reatribuição** da Gestão e da Direção, porque não pertenço a time nenhum — e nunca nasço dono direto da fila.
26. Como Gestão ou Direção, quero ver a operação inteira deste workspace, e da fila atribuir só a um Supervisor ou a mim.
27. Como Supervisor, quero resolver identidade e duplicidade só no time, não na carteira inteira.
28. Como Atendente, não quero atribuir, reatribuir, cadastrar, desatrelar nem desligar.
29. Como sistema, quero que o escopo more nas operações nomeadas, não em botão escondido, para a recusa valer mesmo com a rota chamada direto.

### Atribuição e reatribuição

30. Como Gestão, quero atribuir um lead sem dono a um Supervisor ativo **com tag**, ou assumir o card, para o atendimento ter responsável sem pular o segundo nível ([ADR-0025](../../docs/adr/0025-destino-da-fila-e-supervisor-ou-ator.md)).
31. Como Gestão, quero entregar o lead ao **Supervisor** da equipe que vai trabalhá-lo, sem precisar saber quem são os atendentes dele — o organograma é problema do supervisor, não meu.
31a. Como Gestão ou Direção, quero selecionar vários leads da tabela e atribuir o lote a **um** Supervisor (ou a mim), porque a manhã não cabe em um clique por card ([ADR-0026](../../docs/adr/0026-atribuicao-em-massa.md)).
31b. Como Supervisor, quero repartir em massa os leads que já são meus para **um** Atendente do time, ou um a um quando o volume é pequeno.
32. Como Supervisor, não quero ver nem atribuir a fila sem dono — isso é da Gestão de manhã ([ADR-0024](../../docs/adr/0024-fila-sem-dono-e-da-gestao.md)).
33. Como Supervisor, quero repassar ao atendente do meu time um lead que a Gestão atribuiu a mim, porque é assim que o lead chega em quem liga.
34. Como Supervisor, não quero alcançar lead cujo dono atual está fora do meu time, para não tirar trabalho de outra equipe.
35. Como Supervisor, quero repassar sem confirmação um lead que já é meu — a confirmação existe para eu não tomar o lead de um colega, e este não é o caso.
36. Como gestor, quero que dois cliques no mesmo lead sem dono produzam um ganhador e uma falha limpa para o outro, em vez do último escrever em silêncio.
37. Como gestor, quero ver na falha que o lead já tem dono, para não ligar em duplicata.
38. Como Gestão ou Direção, quero reatribuir qualquer lead que já tem dono, vendo quem é o responsável atual e confirmando, para cobrir férias e saída.
39. Como sistema, quero que atribuir e reatribuir sejam operações diferentes: atribuir exige `assigned_user_id` nulo; reatribuir exige o dono atual no `WHERE`.
40. Como sistema, quero guardar quem era o responsável antes de cada reatribuição e de cada devolução à fila, porque a linha do tempo só nasce na Fase 3 e até lá esse rastro não existe em lugar nenhum.
41. Como gestor, quero que a linha atribuída saia da fila sem dono na hora, para eu não atribuir de novo na mesma vista.
42. Como atendente, quero que o lead atribuído a mim apareça no meu Kanban sem eu procurar na tabela geral.
43. Como Gestão, quero filtrar a tabela por responsável e por equipe, para acompanhar a operação inteira sem precisar de um quadro.

### Fila, card e discriminadores

44. Como gestor, quero ver campanha e formulário na linha e no card, para saber de qual anúncio o cliente veio e ter leitura de mídia depois — **não** para decidir quem atende, que é decisão minha e da capacidade das equipes.
45. Como gestor, quero o **nome** da campanha e do formulário, não só o identificador numérico do Meta, porque identificador não se lê.
46. Como sistema, quero gravar campanha e formulário na ingestão, porque o payload bruto expira em 90 dias e essa é a única janela em que esses valores existem.
47. Como gestor, quero distinguir dois cards da mesma Pessoa pelos dados de financiamento **e** por campanha, formulário, origem e responsável — o conjunto que a operação tem, não um campo tratado como prova.
48. Como atendente, quero ver o **nome** do responsável no card ligado por possível duplicado, não um identificador opaco.

### Kanban Meus leads

49. Como atendente, quero um Kanban só dos meus leads em aberto, para conduzir o dia pelas etapas.
50. Como atendente, quero alternar Kanban e tabela em Meus leads, porque às vezes preciso varrer nomes, não colunas.
51. Como Supervisor, quero o Kanban do meu time já atribuído, para ver onde parou cada lead da equipe — a fila sem dono não é minha, e nem entra no quadro.
52. Como Gestão ou Direção, **não** quero o quadro: eu distribuo e acompanho, não atendo. O que preciso está na tabela, que é a vista de alto volume.
53. Como gestor, quero que a lista geral continue sendo tabela paginada, sem Kanban global.
54. Como atendente, quero arrastar um card em aberto para outra etapa do mesmo funil, e quero que a etapa persista.
55. Como sistema, quero que ganho e perda **não** apareçam como colunas do Kanban: só etapas da jornada em aberto.
56. Como sistema, quero recusar mover lead ganho, perdido ou mesclado, e recusar destino de outro funil.
57. Como sistema, quero que dois arrastes concorrentes da mesma etapa sejam arbitrados pelo `WHERE` da etapa atual, não por leitura anterior.
58. Como sistema, quero que mover etapa **não** toque `arrived_at`, porque o relógio de atendimento não recomeça por drag-and-drop.
59. Como atendente no celular, quero o Kanban em faixa com scroll-snap, porque colunas lado a lado não cabem.

### Workspace adicional e login fechado

60. Como Direção já associada à Hugs, quero provisionar a ACR quando a marctco me marcar de novo com direito e nome, sem perder o primeiro workspace.
61. Como Direção com dois workspaces, quero o seletor para alternar, cada aba no seu tenant.
62. Como colaborador já associado, mesmo que alguém me marque por engano, não quero provisionar — eu não tenho o direito, e o cadastro na Equipe nunca o concede.
63. Como pessoa autenticada sem vínculo ativo e sem direito, quero uma **tela de erro** que diga que minha conta não tem acesso a nenhum workspace e que a Direção da empresa resolve, com um botão de sair — não uma sala de espera que promete algo, nem um chute de volta ao login que me faz achar que errei a senha.
64. Como sistema, quero que o gasto do direito continue acontecendo **antes** do provisionamento, para um direito pendurado não nascer tenant fantasma.
65. Como sistema, quero que dois POSTs simultâneos com o mesmo direito não produzam dois tenants, porque o provisionamento deixou de reusar o vínculo existente.

### Navegação

66. Como membro, quero **Equipe** na barra lateral se o meu perfil a alcança, e quero **Meus leads** além de **Leads** se eu atendo.
67. Como Atendente, não quero o item Equipe na barra — ausência de item não é o controle de acesso; a rota recusa sozinha.
68. Como Gestão ou Direção, não quero o item **Meus leads**, porque não atendo — e isso não é recusa de acesso, é ausência de escopo.
69. Como Supervisor recém-cadastrado sem tag, quero que a Equipe e os Leads me expliquem que ainda não tenho time e que a Direção define isso, em vez de mostrarem tela vazia sem motivo.

## Implementation Decisions

### Costura e módulos

A plataforma testa escrita e escopo nas **operações nomeadas de `packages/db` que recebem `UserContext`**. Combinatória pura mora em `packages/domain`. Invariantes de schema e RLS moram no Seam 3. Não nasce costura numerada nova, não nasce sexta função `SECURITY DEFINER`, e o client do Prisma continua interno.

Esta fase acrescenta operações nomeadas no mesmo módulo de acesso — Equipe, atribuição estreita, reatribuição, movimento de etapa, listagem do Kanban. A tela não monta `where`. Route handler sob `/workspace/:slug/...` escreve; Server Component lê. Sem Server Action.

`UserContext` **não ganha tags**. O time do Supervisor é join em `MemberTag` **dentro** da operação. Tag no contexto reconstroi o objeto a cada edição da Equipe e espalha escopo.

### Schema

- `WorkspaceMember.status`: `ACTIVE | DETACHED`, default `ACTIVE`. Desatrelar e desligar desativam o vínculo; não apagam a linha. Não existe terceiro valor “desligado”.
- `WorkspaceMember.display_name` e `WorkspaceMember.email`: denormalizados no cadastro, para a Equipe e o nome do responsável listarem sem Auth a cada linha. **A migration faz o backfill do vínculo que já existe**: o `OWNER` da Hugs em produção nunca passou por cadastro, e sem isso a Equipe abre com a linha da Direção em branco. `UPDATE ... FROM auth.users` na mesma migration que cria as colunas.
- `WorkspaceMember.whatsapp_phone_e164`: opcional, normalizado pelo mesmo leitor de telefone da ingestão. A Equipe coleta agora porque o cadastro é o gesto; o disparo WhatsApp permanece Fase 4.
- `Tag`: catálogo do workspace. Unicidade por workspace e nome, sem distinguir maiúscula.
- `MemberTag`: aplicação da tag ao membro. É o que computa o time. Nunca herdada pela Oportunidade.
- `Opportunity.campaign_id`, `campaign_name`, `form_id`, `form_name`: texto opcional, gravados na ingestão a partir do lead normalizado. Os quatro, não só os identificadores: o `campaign_id` do Meta é numérico e ilegível, e o nome é o que uma pessoa consegue ler. Retransmissão **não** sobrescreve. A fila não lê o payload bruto: ele expira em 90 dias, e a ingestão é a única janela.
- `Opportunity.previous_assigned_user_id`: uuid opcional. Escrito por `reassignLead` e pelo desatrelamento, com o responsável que saiu. É a trilha mínima até a `Activity` da Fase 3 — quem tinha 200 leads abertos larga 200 cards na fila, e sem esta coluna não há como saber de quem eram. Nunca participa de escopo nem de filtro de permissão.
- **Nenhum campo monetário novo.** `amount` sai desta fase: a grandeza que Ranking e Metas precisam agregar é honorários, que deriva da economia estimada — saída da análise de cabimento, Fase 7. Item A10 do [plano](../../docs/plano-de-construcao.md). `installment_amount` continua sendo o único sinal de tamanho do caso.

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

Enquanto não existia `MemberTag`, o código tratava `SUPERVISOR` como `MANAGER`. **Essa equivalência acaba nesta fase**, inclusive para Supervisor ainda sem tag: sem tag, time vazio, não reatribui, Kanban vazio, tabela vazia — a fila sem dono não é o consolo ([ADR-0024](../../docs/adr/0024-fila-sem-dono-e-da-gestao.md)).

Time = membros `ACTIVE` que compartilham **ao menos uma** tag com o Supervisor, e as Oportunidades atribuídas a eles (o Supervisor está no próprio time). Fila sem dono **não** é time e **não** entra no escopo do Supervisor: só Gestão e Direção a vêem e atribuem.

A função pura em `packages/domain` recebe as tags do ator e o quadro de membros e devolve o conjunto de `user_id` do time — incluindo o caso vazio. As operações nomeadas aplicam esse conjunto no SQL. `ATTENDANT` continua filtrando `assigned_user_id = user_id` e **não** vê fila sem dono.

O time vazio é o estado normal de todo Supervisor no minuto seguinte ao cadastro, e no dia 1 do piloto ele é a regra, não a exceção — antes desta fase o código dava a esse papel o alcance de `MANAGER`, então a tela vai encolher de "tudo" para "quase nada" de uma vez. A recusa está certa e continua; o que não pode acontecer é ela parecer defeito. **Toda tela que fica vazia por falta de tag diz por quê** — Equipe, Leads e Kanban trazem estado vazio nomeando a causa ("você ainda não tem uma tag de equipe") e quem resolve (a Direção, na Equipe). Isso é texto de UI, não exceção de escopo: a operação continua devolvendo conjunto vazio.

### Atribuição

`assignLead` já existe e já arbitra com `assigned_user_id IS NULL`. Nesta fase ela passa a exigir destino `ACTIVE` neste workspace, a recusar `ATTENDANT` e `SUPERVISOR` como atores — só Gestão e Direção atribuem da fila ([ADR-0024](../../docs/adr/0024-fila-sem-dono-e-da-gestao.md)) — e a recusar destino que não seja um `SUPERVISOR` **com ao menos uma tag** ou o próprio ator ([ADR-0025](../../docs/adr/0025-destino-da-fila-e-supervisor-ou-ator.md)). Não atribui a Atendente, nem a Supervisor sem tag, nem a outra Gestão, nem à Direção que não seja quem clicou.

`reassignLead` é operação nova: `WHERE assigned_user_id = :current`, e grava `previous_assigned_user_id` com o dono que saiu.

**Ela é o segundo nível da distribuição, e por isso o Supervisor a alcança.** Gestão e Direção reatribuem qualquer lead do workspace. O Supervisor reatribui quando **o dono atual e o destino** estão no seu time — o mesmo conjunto de `user_id` que o domínio computa para a listagem, aplicado duas vezes no SQL. Sem tag não há time e não há reatribuição. `ATTENDANT` continua recusado nas duas. `SUPERVISOR` continua recusado em `assignLead`.

A manhã e a repartição do time aceitam **um card ou vários**, sempre para um destino ([ADR-0026](../../docs/adr/0026-atribuicao-em-massa.md)). Massa é o mesmo gesto e as mesmas condições, N linhas; não rateia entre pessoas. 1 a 1 permanece. O lote é **parcial**: linhas que ainda satisfazem a condição vão; as outras recusam com o motivo (na fila, “já tem dono”, pelo nome). Quem ganhou some da vista; quem recusou fica.

A confirmação da UI existe para impedir que alguém tome o lead de um colega, então ela aparece quando o dono atual **não** é o ator. Supervisor repassando lead que a Gestão entregou a ele — um ou um lote — repassa direto. Um diálogo por lead transforma a rotina em fricção.

Nenhuma das duas dispara WhatsApp.

TanStack Query entra só onde o ADR-0013 mandou: remoção otimista da linha atribuída e o Kanban. A tabela geral continua Server Component + `router.refresh()`.

O filtro por responsável e por equipe da tabela é parâmetro de busca lido no Server Component, aplicado dentro da operação nomeada como qualquer outro recorte — a tela não monta `where`, e o filtro **estreita** o escopo do papel, nunca o alarga: Supervisor filtrando por outra equipe recebe vazio, não recusa.

### Kanban

Rota própria de Meus leads, item na barra. Toggle `{component.toggle-segmented}` Lista / Kanban. Colunas = etapas do funil comercial padrão, só `OPEN` não mescladas, no escopo do papel. `@dnd-kit` persiste por route handler que chama `moveLeadStage`. Condição: etapa atual, mesmo `pipeline_id`, `status = OPEN`, não mesclado. Destino tem de ser etapa desse funil. `arrived_at` intocado.

**O quadro é tela de quem atende: `ATTENDANT` vê os seus, `SUPERVISOR` vê o time já atribuído.** Gestão e Direção **não têm o quadro** — não atendem, distribuem e acompanham, e fazem as duas coisas na tabela. Isso resolve a contradição em que a spec anterior tinha caído: dar "todos os leads em aberto" a Gestão dentro de uma tela chamada *Meus leads* criava justamente o Kanban global que o [decisao-features-concorrentes.md](../../decisao-features-concorrentes.md) §4 recusou, sob um nome que mentia. O item some da barra para esses dois papéis e a rota os manda para Leads; **não é recusa de acesso** — nada no quadro está fora do que a tabela já lhes mostra, e é por isso que a matriz do ADR-0015 traz "—" e não um bloqueio.

Ganho, perda, motivo e editor de funil ficam fora. Card do Kanban segue `{component.kanban-card}`: nome, etapa, responsável — sem campo monetário, que saiu da fase.

### Ingestão (efeito colateral mínimo)

O plano de Oportunidade nova passa a carregar `campaign_id`, `campaign_name`, `form_id` e `form_name` do lead normalizado — os quatro já saem prontos do contrato `v1` (`packages/domain/src/intake/inbound-lead.ts`, bloco `attribution`), então não há trabalho de parsing novo, só persistência. Retransmissão inerte continua sem esses campos — não tem onde guardá-los, e é assim que não rebobinam. O Seam 2 só se estende para provar que o card ingerido **tem** campanha/formulário quando o `v1` os trouxe, e que o reenvio não os apaga.

Os outros seis campos de atribuição do `v1` (`adset_*`, `ad_*`, `platform`, `is_organic`) **não** entram: nenhuma tela desta fase os lê, e a Fase 7 decide o modelo de mídia com o relatório na mão. Campanha e formulário entram porque a fila e o card já os mostram e porque o duplicado os usa como discriminador.

### Provisionamento do segundo workspace

`onboardingDecision`: direito presente → provisiona, **mesmo com vínculo ativo**. Sem direito e com vínculo ativo → entra como membro. Sem direito e sem vínculo ativo → **tela de erro terminal**, não sala de espera e não chute para o login: a conta não tem acesso a nenhum workspace, quem resolve é a Direção da empresa, e há um botão de sair. Colaborador nunca tem o direito.

`provision_workspace` **deixa de devolver "o primeiro vínculo que houver"**. O gasto do direito continua **antes** da chamada: a leitura do usuário só gasta quando `can_provision_workspace` é o booleano `true`; se já é falso, a rota não provisiona. A marcação nova da marctco (direito + nome) é o que autoriza o tenant N.

**A idempotência do duplo clique não se perde — ela muda de chave.** O `pg_advisory_xact_lock(hashtextextended(owner_user_id::text, 0))` já existe na função e já serializa por dono (`20260806000100_provision_workspace/migration.sql:134`). O que muda é a consulta que roda dentro do lock: hoje ela procura **qualquer** vínculo daquele usuário e devolve o workspace achado; passa a procurar um vínculo `OWNER` num workspace **com este mesmo nome**. As três consequências caem no lugar sozinhas:

- Dois POSTs simultâneos com a mesma marcação carregam o mesmo `workspace_name`: o segundo entra no lock, encontra o que o primeiro acabou de criar e devolve aquele. Um tenant, como hoje.
- A Direção da Hugs com marcação nova para "ACR" não encontra `OWNER` de nenhuma "ACR": cria. É o requisito da fase.
- O colaborador não tem o direito e nem chega na função.

Isso fecha a corrida residual **sem** sexta função `SECURITY DEFINER`, sem constraint nova e com menos código do que a versão que a spec propunha antes. O comentário atual da migration explica que índice único não expressa "este usuário não tem vínculo nenhum" — continua verdade, e é por isso que a arbitragem segue sendo o lock; o que o lock passa a comparar é o nome. Preço aceito: a mesma Direção não cria dois workspaces com nome idêntico — recebe o primeiro de volta. Dar nomes iguais a dois tenants do mesmo dono nunca é intenção; é o duplo clique.

O teste atual que exige “quem já pertence recebe o workspace antigo” **inverte o critério**: quem já pertence e tem direito novo, com nome novo, recebe um workspace **novo**; quem já pertence e não tem direito nem chega na função; quem chega duas vezes com o mesmo nome recebe o mesmo tenant.

### UI

`DESIGN.md` é a lei. Equipe é `{component.data-table}` no desktop e card empilhado abaixo de 480px. Kanban vira faixa com scroll-snap abaixo de 768px. Integrações continuam Gestão para cima.

A barra ganha **Equipe** (só para quem a matriz alcança na leitura; a rota recusa o resto) e **Meus leads** (só para quem atende — `ATTENDANT` e `SUPERVISOR`). São ausências de natureza diferente e os testes devem tratá-las assim: Equipe some do Atendente **e** a rota o recusa, porque há dado que ele não pode ler; Meus leads some da Gestão porque o escopo dela ali é vazio, e a rota apenas a manda para Leads.

Parcela usa numerais tabulares. Campanha e formulário são colunas da tabela de Leads — permanentes, não um layout que aparece só quando o filtro é "sem responsável": elas servem para ler a origem do lead a qualquer momento, e o filtro por responsável/equipe é que faz o recorte da fila. Esse filtro é `{component.data-table}` com controle de filtro no cabeçalho, refletido na URL para a Gestão poder voltar à mesma vista.

## Testing Decisions

Um bom teste verifica comportamento externo: o que a operação nomeada aceita ou recusa, e o que o banco (ou a decisão pura) ficou. Não verifica que um hook foi chamado, nem o formato de um cache de cliente, nem que o DnD disparou um evento do `@dnd-kit`.

Esta fase **não inventa costura**. O recorte abaixo é a prática da plataforma, a mesma da fundação: domínio puro para combinatória, operações nomeadas para o que uma pessoa alcança, Seam 3 para tabela nova e invariante que nenhuma rota exercita. O Seam 2 só se toca no efeito colateral da ingestão.

### Costura principal — operações nomeadas sob `UserContext`

Prior art: `packages/db/tests/leads.test.ts` (`assignLead`, escopo do `ATTENDANT`, `getLead`).

Cobre:

- Supervisor com tag vê o time na listagem e **não** vê a fila sem dono; sem tag não reatribui, não vê o time da Gestão e não ganha a fila como consolo.
- Atendente não vê fila sem dono nem lead de colega.
- Atribuir: um ganhador sob corrida; recusa Atendente e Supervisor como atores; recusa destino `ATTENDANT`, Supervisor sem tag, outro `MANAGER`, `OWNER` que não seja o ator, `DETACHED`; aceita `SUPERVISOR` com tag ou o próprio ator.
- Atribuir/reatribuir em massa: um destino, N linhas, mesma condição por linha; não rateia; lote parcial (ganhadores saem, recusas pelo nome ficam).
- Reatribuir: recusa se o dono atual não casa; Gestão e Direção alcançam qualquer lead.
- **Distribuição em dois níveis, ponta a ponta:** Gestão atribui da fila ao Supervisor; o Supervisor reatribui ao Atendente do time e o lead chega. É o caminho que a fase existe para abrir, e merece um teste que o percorra inteiro.
- Reatribuir do Supervisor: recusa quando o **dono atual** está fora do time; recusa quando o **destino** está fora do time; recusa Supervisor sem tag; aceita quando os dois estão no time.
- `previous_assigned_user_id` guarda o responsável que saiu, tanto na reatribuição quanto na devolução à fila.
- Desatrelar neste tenant devolve `OPEN` à fila e preserva `WON`/`LOST`; o desatrelado deixa de resolver o slug.
- Desligar: Direção dona de dois tenants desativa os dois vínculos; Gestão não atravessa o outro.
- Recusa desatrelar a si e desatrelar o `OWNER` daquele workspace.
- Cadastro atrela e-mail já existente; reativa `DETACHED`; nunca grava direito de provisionar; nunca cria papel `OWNER`.
- `moveLeadStage` arbitra pela etapa atual; recusa fechado, mesclado e funil alheio; não mexe `arrived_at`.
- `listUserWorkspaces` omite `DETACHED`.
- `provisionWorkspace` com **nome novo** para o mesmo `OWNER` nasce tenant novo; com o **mesmo nome** devolve o tenant que já existe (duplo clique); o gasto do direito já falso não chama a função.
- A migration preenche `display_name`/`email` do vínculo que já existia antes das colunas — a Equipe não lista linha em branco para a Direção.

Auth Admin fica fora desta costura: a rota resolve o `user_id` e a operação recebe o id. Testes de banco não sobem o Supabase.

### Seam 1 — `packages/domain`

Prior art: `intake-plan.test.ts`, `onboarding-decision.test.ts`, `markersFor`.

Cobre: conjunto do time (tag compartilhada, vazio, `DETACHED` fora, várias tags); quem pode atribuir a quem; **quem pode reatribuir de quem para quem**, que é a combinatória nova desta fase e a que sustenta o segundo nível; se a etapa é móvel; `onboardingDecision` com direito + vínculo existente → provisiona; sem direito e sem vínculo → erro terminal, não espera e não login.

### Seam 3 — RLS e schema

Prior art: `packages/db/tests/rls.test.ts`.

Cobre: `Tag`, `MemberTag` e as colunas novas sob as mesmas varreduras; nenhum `SECURITY DEFINER` além da lista fechada; `resolve_user_workspaces` ignora `DETACHED`; nenhum import do client cru.

### Seam 2 — só o efeito na ingestão

Prior art: `tests/seam2-ingestion.test.ts`.

Cobre: Oportunidade nova persiste `campaign_id`/`form_id` quando o `v1` os trouxe; retransmissão inerte não os apaga nem os sobrescreve. Nada de Equipe, Kanban ou atribuição neste seam.

## Out of Scope

WhatsMiau, template de 1º contato, disparo na atribuição, timeline de mensagem · Atividade, `due_at`, Agenda, SLA, estagnação, alerta ao gestor, Dashboard operacional · tag na Oportunidade · ganho, perda, motivo de perda, handoff, funil jurídico · editor de funis na UI · documentos, contratos, assinatura · Analytics, Ranking, Metas · score e resumo LLM · billing · conector nativo Meta/Google · telemetria de produto.

O campo `whatsapp_phone_e164` entra; o envio não.

**Campo monetário novo não entra** (`amount`, saldo devedor, economia estimada, honorários). Item A10 do plano, Fase 7 — a grandeza que Ranking e Metas agregam é honorários, e ela deriva da análise de cabimento, que não existe ainda. Somar uma coluna que cada empresa do grupo preenche com uma grandeza diferente produz número errado com cara de certo. `installment_amount` continua sendo o sinal de tamanho.

Kanban global de todos os leads não entra, e Gestão e Direção não têm quadro nenhum: quem tem é quem atende. Filtro por responsável e por equipe na tabela é o que lhes dá acompanhamento.

Os campos de atribuição `adset_*`, `ad_*`, `platform` e `is_organic` do contrato `v1` não são persistidos nesta fase.

## Further Notes

**A2 (discriminadores).** A Fase 1 ligou possível duplicado sem exigir financiamento. Esta fase mostra o conjunto que a operação já tem — tipo, instituição, parcela, origem, campanha, formulário, responsável por nome — no card e na fila. Nenhum desses campos vira prova nem gatilho.

**Matriz do ADR-0015.** As linhas da Fase 2 deixam de ser especificação futura e passam a ser critério das operações nomeadas. O restante da matriz (Agenda, handoff, Analytics) continua letra para as fases que as possuem.

**Corrida no segundo tenant — fechada, não aceita.** Uma versão anterior desta spec deixava dois POSTs simultâneos poderem criar dois workspaces e chamava isso de risco residual. Não precisa ser: o lock consultivo por `owner_user_id` já está na função, e basta trocar o que ele consulta dentro do lock — de "qualquer vínculo deste usuário" para "vínculo `OWNER` num workspace com este nome". Custo zero em superfície nova, e o duplo clique volta a ser idempotente.

**`assignLead` hoje.** A operação já recusa Atendente e já arbitra `IS NULL`. O que falta — destino ativo, time do Supervisor, reatribuição distinta com alcance do Supervisor, filtro na tabela, UI — é esta fase, não um rewrite da arbitragem.

**Por que o Supervisor reatribui.** Foi a correção mais importante desta revisão. A spec anterior punha reatribuir como exclusiva de Gestão para cima e, ao mesmo tempo, descrevia uma operação em que a Gestão entrega o lead ao Supervisor. As duas coisas juntas travam o lead no Supervisor: `assignLead` exige `IS NULL`, o lead já tem dono, e nenhuma operação o move adiante. O segundo nível da distribuição só existe porque `reassignLead` alcança o Supervisor dentro do time.
