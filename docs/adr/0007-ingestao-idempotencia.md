# Ingestão de leads e idempotência

Toda origem de lead (Pluga Meta, Pluga Google, webhook servidor-servidor de LP) entra por endpoint autenticado que **responde 200 depois de persistir** o payload bruto em `integration_events`. Essa tabela é também a outbox: um dispatcher independente publica no BullMQ quando o Redis estiver disponível. A idempotência da transmissão, a identidade da Pessoa e a decisão de criar ou associar Oportunidade são problemas distintos; nenhum pode decidir os demais por atalho.

**Dúvida nunca segura o lead.** Todo envio com pelo menos um contato vira Oportunidade no ato. Conflito de identidade e suspeita de duplicidade viram **pendência anexada à Oportunidade já criada**, resolvida depois por mesclagem não destrutiva. O relógio de atendimento começa na chegada, não na decisão de um humano.

**Status:** accepted · 2026-08-04

> **Emendado pelo [ADR-0019](./0019-resolucao-pre-contexto-e-executor-privado.md):** a resolução de associação navegador → workspace é o quarto caso sem tenant. A lista fechada, o executor técnico `NOLOGIN` e as policies mínimas passam a ser definidos por aquele ADR; esta decisão de ingestão permanece inalterada.

Este é o ponto mais irreversível do sistema: uma vez que leads reais atravessaram este caminho, mudar a regra de deduplicação significa reconciliar dados de produção à mão.

## Contrato HTTP

```
POST /v1/integrations/pluga/leads
POST /v1/integrations/webhooks/leads
Authorization: Bearer <token por IntegrationConnection>
```

| Situação | Resposta |
|---|---|
| Token inválido ou desconhecido | **401** |
| Body não é JSON válido | **400** |
| Qualquer payload que parseie — inclusive duplicata, inclusive incompleto | **200**, com corpo `{"status":"accepted"}` |

**Nunca 409.** Um pré-check de duplicata no request não elimina a necessidade da constraint — sob concorrência, duas retransmissões simultâneas passam ambas pelo `SELECT`. O pré-check apenas **duplica** a regra em dois lugares, e o que roda no request é o que pode estar errado. Uma regra, um dono.

Além disso, `pluga.md` afirma que a Pluga trata 409 como sucesso, mas isso não está verificado. Se ela registrar como `Falhou`, o painel do cliente enche de vermelho em duplicata legítima e uma assessoria não-técnica abre chamado achando que perdeu lead. Aceitar sempre não tem esse modo de falha.

## Por que 200 e não 202

**Supersede o "202 sempre" das versões anteriores deste ADR.** Semanticamente, 202 Accepted é o código correto: o lead foi aceito e será processado depois. A escolha do 200 é deliberadamente conservadora, e o motivo é assimetria de risco.

Duas rodadas de pesquisa na documentação pública da Pluga **não encontraram** qualquer descrição de como ela trata o código de resposta do destino, se retenta 5xx, ou se pausa a automação após falhas. O artigo oficial do HTTP Request cobre métodos, autenticação, headers e parâmetros — e nada sobre códigos. Os artigos de Log e de correção de evento com falha também não.

- **Ganho de usar 202:** pureza semântica. Nenhum comportamento do sistema depende do número.
- **Custo de errar com 202:** se a Pluga aceitar apenas 200/201, **todo lead entregue com êxito aparece como falha** no painel de um cliente não-técnico. Não é degradação, é o produto parecendo quebrado em 100% dos casos.
- **Custo de usar 200:** zero funcional. O corpo `{"status":"accepted"}` carrega a semântica que o código deixou de carregar.

Como referência, o n8n documenta que qualquer 2xx é sucesso por padrão, e é provável que a Pluga faça o mesmo — mas "provável" não é base para a decisão mais irreversível do sistema quando a alternativa segura custa nada. Verificar exigiria uma conta paga da Pluga que o piloto ainda não tem; **escolher 200 elimina a dependência em vez de administrá-la**, e por isso o item A14 fecha aqui em vez de virar gate de piloto.

Isso não reabre o 409: duplicata continua recebendo 200, porque a idempotência tem um dono só.

**Nenhum campo de negócio é obrigatório.** O request valida o contrato; o worker decide o negócio.

**O tenant vem do token, nunca do body.** `workspace_id` no JSON é ignorado, sempre.

## Quarentena

| Caso | Destino |
|---|---|
| Sem telefone **e** sem e-mail | **Quarentena**: persiste `IntegrationEvent`, não cria Person nem Opportunity, aparece em Integrações > Pluga para ser completado e liberado |
| Tem contato, falta CPF | Entra no funil, sem marcador |
| Só e-mail, sem telefone | Entra no funil, **com marcador** |
| Falta tipo de financiamento/banco/parcela | Entra no funil comercial, sem marcador |

O marcador significa exatamente uma coisa: **não dá para WhatsApp nem ligar**. Não é rótulo genérico de "falta algo".

Lead em quarentena não tem Opportunity, logo **não tem relógio de SLA** — por isso a quarentena precisa do próprio alerta em Integrações, senão vira buraco silencioso. Lead marcado tem SLA correndo normal.

Campos são editáveis no card do Lead e por ação direta na tabela de Leads. Um contador-filtro na tabela de Leads mostra `N leads sem telefone` e filtra ali mesmo — o gestor corrige mais rápido no contexto do lead do que numa tela técnica.

Perder lead por mapeamento torto é o pecado capital de quem compra mídia; o mapeamento mora na Pluga, fora do controle do CRM, configurado por gente não-técnica. Registro sujo e visível é sempre melhor que lead que sumiu.

## Mecanismo 1 — "eu já recebi esta transmissão?"

`UNIQUE(workspace_id, source, external_lead_id)` em `LeadSubmission`.

- **`external_lead_id` é `NOT NULL` sempre.** Em Postgres `NULL` não colide com `NULL` num índice único. Integrações servidor-servidor de LP devem enviar um ID estável; quando uma origem não o fornecer, o conector sintetiza um para manter a proteção.
- **Quando a origem não fornece ID, o conector usa o `IntegrationEvent.id`** — o identificador que o próprio CRM cunhou ao receber a requisição. Responsabilidade do adapter, não do domínio.

  **Supersede "hash do payload normalizado + janela de tempo".** Aquela fórmula tinha dois defeitos opostos, sem ajuste comum entre eles. Com janela medida no relógio do processamento, a chave **não é determinística**: um evento republicado depois de o Redis voltar cai noutra janela, produz outra chave, não colide com nada e cria uma segunda Oportunidade — quebrando justamente a garantia que o varredor precisa ter. Com janela larga o bastante para cobrir retransmissão, uma submissão **genuinamente nova** de conteúdo idêntico colide com a anterior, é tratada como retransmissão, e retransmissão é inerte por desenho: nenhuma Oportunidade, nenhum marcador, nenhuma quarentena. O lead não some do banco, some do produto — e some em silêncio, indistinguível de um reenvio legítimo.

  O `IntegrationEvent.id` não tem relógio dentro, é único por requisição e sobrevive a qualquer reprocessamento. O custo é que dois `POST` distintos de uma LP sem ID viram duas submissões — e esse é exatamente o terreno do mecanismo 2, que produz dois cards ligados, visíveis e mescláveis. É a mesma troca que este ADR faz em todos os outros pontos: **duplicata visível em vez de lead engolido**.
- **A constraint arbitra, nunca um `SELECT` anterior.** Sob concorrência, dois `check-then-insert` simultâneos passam ambos pelo `SELECT` — só o índice único decide.

  O mecanismo é **`INSERT ... ON CONFLICT DO NOTHING RETURNING id`**, e não capturar a exceção de violação. Em Postgres, qualquer erro dentro de um bloco de transação **aborta a transação inteira**: todo comando seguinte responde `current transaction is aborted`, e capturar a exceção em TypeScript não desfaz isso, porque o estado ruim está no servidor. O worker precisa continuar depois de detectar a duplicata — atualizar `raw`, incrementar tentativas, registrar o reenvio na timeline —, e todos esses comandos viriam depois do insert que falhou, na mesma transação. Seria o caminho **normal** deste ADR quebrando com um erro que nem menciona duplicata.

  Com `ON CONFLICT DO NOTHING`, o conflito não levanta erro e nada aborta: `RETURNING` vazio **é** o sinal de retransmissão, numa ida só ao banco. A chave começa por `workspace_id`, então um conflito só pode acontecer dentro do mesmo tenant — a constraint nunca vira oráculo de existência entre workspaces.

## Mecanismo 2 — "é seguramente o mesmo financiamento?"

**Supersede a regra anterior de anexar por mesma Pessoa + Produto.** Tipo de financiamento é apenas classificação e não identifica contrato: uma Pessoa pode ter dois financiamentos de veículo simultâneos, inclusive no mesmo banco. Similaridade gera **sinal**, nunca associação automática — e nunca bloqueio.

- Retransmissão com a mesma chave idempotente continua inerte e permanece associada à mesma Oportunidade. Isso é o mecanismo 1, não este.
- Uma submissão genuinamente nova **sempre cria Oportunidade**. Nenhum lead espera decisão humana para entrar no funil.
- **O gatilho é mesma Pessoa + Oportunidade em aberto não mesclada** — não semelhança de financiamento. A nova nasce **ligada** à anterior por um `IntakeReview(POSSIBLE_DUPLICATE)`, visível nos dois cards. O atendimento pode começar imediatamente em qualquer um dos dois.

  **Supersede "mesma Pessoa + financiamento semelhante".** Faltar tipo, instituição e parcela é entrada normal e sem marcador — é o caso mais comum de todos, e um formulário de LP com nome e telefone é um lead perfeitamente válido. Avaliada contra o vazio, a semelhança dá falso, e as duas Oportunidades da mesma pessoa nasceriam sem ligação nenhuma: dois cards, dois atendentes, mesmo telefone, nenhum aviso — o cenário que a ligação existe para impedir, escapando por baixo dela no caso majoritário.

  Há uma incoerência mais funda em usar financiamento como gatilho: este mesmo ADR declara, mais abaixo, que esses campos **não são prova** e que nenhum deles é discriminador universal. O que não basta para o humano concluir não basta para a máquina decidir se o humano será avisado. Eles continuam sendo o que sempre foram — o que a tela mostra para distinguir um card do outro —, e deixam de ser portão.

  O custo é assimétrico, como em todo o resto deste desenho: um marcador a mais custa um clique em `NEW_FINANCING` e não bloqueia nada; um marcador a menos custa dois atendentes ligando para o mesmo cliente, e ninguém descobre.
- O gestor resolve quando quiser, com três saídas auditáveis e não destrutivas:
  1. `NEW_FINANCING`: confirma que são contratos distintos; a ligação some, as duas Oportunidades seguem independentes;
  2. `SAME_FINANCING`: mescla — a Oportunidade mais nova recebe `merged_into_opportunity_id` apontando para a canônica, sai das vistas ativas, e seu `LeadSubmission` é **repontado** para a canônica, onde vira reentrada na timeline;
  3. `INVALID_OR_SPAM`: arquiva com motivo, sem exclusão física.
- `arrived_at` é o instante em que a Oportunidade passa a existir. Para todo lead que entra direto, isso é o `received_at` do envio, e nada muda: como nada fica retido, não existe relógio distorcido por tempo em fila.

  **A quarentena é a exceção, porque é o único lugar do sistema onde algo fica retido** — a premissa da frase acima não vale ali. Um lead liberado três dias depois com `arrived_at` de três dias atrás nasce estourado e **nunca deixa de estar**: não há ação humana que zere aquele relógio. Isso não é alerta, é ruído permanente, e alerta que não se resolve mata o sinal dos vizinhos. Para lead liberado da quarentena, `arrived_at` é o instante da **liberação**.

  Nada se perde: o `received_at` continua no `LeadSubmission` e no `IntegrationEvent` como verdade sobre a origem, e a demora é medível por `liberação − recebimento` — que é métrica de quarentena, e pertence ao alerta próprio dela em Integrações, não ao relógio de atendimento.

**Considered option (rejeitada): reter o envio em fila antes de criar a Oportunidade.** Mais correto no cadastro e desastroso na operação. A prova de "mesmo financiamento" exigida seria uma referência estável de contrato — que **formulário de Ads não fornece**. Na prática, toda segunda submissão da mesma Pessoa cairia numa fila manual, e lead de mídia paga apodrece em minutos, não em dias. Numa operação cujo SLA começa em `arrived_at`, pôr trabalho humano bloqueante no caminho crítico troca um erro barato e reversível (dois cards que se mesclam) por um caro e invisível (lead quente parado numa tela que o comercial não abre).

**Custo assumido:** mesclar depois é mais trabalho de schema do que decidir antes — exige `merged_into_opportunity_id`, exige que toda listagem ativa filtre mesclados, e aceita duplicata temporária visível. É o preço de nunca segurar um lead.

### Mesclagem é transferência; o ponteiro é lápide

O registro absorvido **para de ser alvo de escrita**. Tudo que estava pendurado nele é repontado para a canônica dentro da mesma transação da mesclagem. `merged_into_opportunity_id` e `merged_into_person_id` servem para exatamente duas coisas — tirar das vistas ativas e preservar a trilha — e para nenhuma terceira: **eles nunca redirecionam leitura**.

Sem isso, o registro absorvido continua recebendo escrita que ninguém vê. O `LeadSubmission` de uma Oportunidade mesclada segue sendo alvo de retransmissão, e o "reenvio recebido" iria para a linha do tempo de um card que a tabela de Leads acabou de esconder: o evento aconteceu, foi gravado, e nem quem decidiu a mesclagem fica sabendo. A cada fase o problema se multiplicaria — atividade, mensagem, documento, cada um herdando a mesma pergunta.

A alternativa, seguir o ponteiro na leitura, transfere o trabalho para **toda** consulta futura, e a que esquecer mostra dado de card morto sem sintoma. Transferir resolve uma vez, no único lugar que já sabe que a mesclagem está acontecendo.

Daí um invariante verificável: **nenhum registro ativo aponta para um registro mesclado.** Vale como varredura no Seam 3, na mesma família da varredura de policies — é o que pega o dia em que uma fase futura criar uma tabela nova e esquecer de tratar mesclagem, coisa que nenhum teste de feature detecta, porque nenhuma rota toca a combinação.

Não há índice único parcial por Pessoa + tipo de financiamento. Duas Oportunidades abertas da mesma Pessoa são estado legítimo, não anomalia a impedir.

## Identidade da Pessoa

**Supersede “telefone sempre decide”.** `Person` preserva múltiplos telefones e e-mails em registros próprios; receber um contato novo nunca sobrescreve o anterior.

- CPF válido é o identificador mais forte quando presente, mas continua opcional.
- Telefone pode identificar automaticamente apenas quando aponta de forma inequívoca para uma Pessoa e nenhuma outra chave contradiz essa associação.
- E-mail isolado permanece chave fraca e não autoriza fusão automática.
- **Quando as chaves recebidas apontam para Pessoas diferentes, cria-se uma Pessoa nova** com os contatos daquele envio, a Oportunidade nasce nela, e um `IntakeReview(IDENTITY_CONFLICT)` registra as candidatas. Nenhuma chave vence por prioridade fixa, e nenhum vínculo errado é criado — porque nenhum vínculo com cadastro existente é criado.
- A resolução manual mescla a Pessoa nova numa candidata ou confirma que são pessoas distintas. A mesclagem transfere contatos e Oportunidades para a canônica e deixa `merged_into_person_id` na absorvida; identificadores e histórico permanecem auditáveis, sem exclusão silenciosa. A Pessoa absorvida fica sem contato algum, e por isso a resolução de identidade nunca mais a alcança.
- **Mesclar Pessoas reavalia a duplicidade.** Se a canônica passa a ter duas Oportunidades em aberto que nunca estiveram ligadas, o `POSSIBLE_DUPLICATE` é registrado ali. Antes da mesclagem eram duas pessoas e não havia o que marcar; depois dela você **sabe** que é a mesma pessoa com dois cards vivos — que é precisamente a condição sinalizada. Sem essa reavaliação, a mesclagem produz o par mudo que o mecanismo 2 existe para eliminar.
- Sem nenhuma chave de contato não se cria Person: o evento permanece em quarentena. Este é o **único** caso em que a ingestão não produz Oportunidade — e ele não é dúvida, é impossibilidade de contato.
- **Sair da quarentena exige ao menos um contato**, e essa regra não tem exceção manual. Liberar um envio sem telefone e sem e-mail criaria uma `Person` sem nenhuma chave — que nunca casará com nada, porque a resolução de identidade só trabalha com contatos e CPF — e uma Oportunidade que nenhum atendente consegue atender, com relógio correndo. A ação da tela é **completar e liberar**, com o payload cru exibido ao lado: o caso real por trás do pedido de "liberar assim mesmo" é o contato ter chegado num campo que o mapeamento não mapeou, e a resposta certa para isso é digitar o que se está lendo.

Formulários de Ads raramente trazem CPF; por isso a identidade não depende dele, mas essa ausência também não transforma telefone em autoridade absoluta.

**Considered option (rejeitada): reter o envio antes da Oportunidade quando há conflito.** Mesmo argumento do mecanismo 2 — o conflito é do cadastro, e o cadastro é corrigível a qualquer momento; o lead quente não é. Duplicar uma Pessoa temporariamente é reversível por mesclagem; perder a janela de contato não é.

**Considered option (rejeitada): escolher a Pessoa mais provável e seguir.** Reintroduz "telefone decide" pela porta dos fundos, e o vínculo errado é justamente o que não se desfaz sozinho — o atendente lê histórico de outra pessoa e trata o cliente pelo nome errado.

## Retransmissão é inerte ao funil

Retransmissão aponta `last_integration_event_id` para o evento novo, incrementa a contagem de tentativas no `LeadSubmission`, registra "reenvio recebido" na timeline da Opportunity, e **para aí**. Não toca etapa, responsável, status nem `arrived_at`. O payload não é reescrito: ele já está guardado no evento novo, uma vez só ([ADR-0014](./0014-copia-unica-e-retencao-do-payload.md)).

A alternativa é catastrófica: um soluço da Pluga ressuscitaria negócios perdidos, zeraria relógios de SLA e devolveria à fila leads já descartados. Um card perdido que volta sozinho destrói a confiança da operação no funil mais rápido que um lead perdido.

*Reforçado pelo [ADR-0017](./0017-ingestao-como-decisao-e-plano.md).* Esta regra deixa de depender de o worker lembrar de não escrever: a variante `Retransmission` do `IntakePlan` **não tem campo** de etapa, responsável, situação nem `arrived_at`. Não há como escrever o bug porque não há onde escrevê-lo — e a prova cabe no Seam 1, em vez de exigir o ambiente inteiro.

## Normalização

CRM é fonte de verdade (`sintese-final.md` §17). Telefone em **E.164**, CPF só dígitos com DV validado, e-mail **lowercase**. Normalização é serviço de domínio compartilhado, chamado uma vez — não implementação por adapter, senão três cópias divergem e o default de país (Brasil) vaza para dentro do adapter, que não deveria conhecê-lo.

## Consequência de UX: pendência é marcador, não sala de espera

Como nada fica retido, **não existe fila que esconde leads**. A revisão é um marcador no card, e a tela de Leads é a superfície principal.

- O lead com pendência **aparece normalmente na tabela de Leads**. Ele pode ser atribuído e atendido antes de qualquer resolução.
- **Um lead, um ícone.** Todos os avisos de um lead — sem telefone, identidade em conflito, possível duplicado, e o que as fases seguintes acrescentarem — são alcançados por um **único** ponto de entrada na linha da tabela e no card, que abre a lista. Nunca um rótulo por tipo espalhado pela linha: com três avisos são três rótulos, e a tabela de triagem em volume alto deixa de ser legível justamente quando mais precisa ser. Se há três avisos, é um ícone com contagem. Esta regra vale para todo aviso futuro, não só para os desta fatia.
- Os **contadores-filtro** continuam no topo da tabela e continuam por tipo. São perguntas diferentes: o contador responde "quais leads têm este aviso" e vive fora da linha; o ícone responde "o que este lead tem".
- Um contador-filtro na própria tabela de Leads leva às pendências, no mesmo padrão do contador de "sem telefone" — o gestor resolve no contexto do lead, não numa tela técnica de Integrações.
- Ao atribuir ou abrir um card com possível duplicado, a UI mostra a outra Oportunidade e o atendente responsável. É isso que impede dois atendentes ligando para o mesmo cliente: **visibilidade, não bloqueio**.
- A comparação mostra lado a lado o envio bruto/normalizado, Pessoas candidatas e a Oportunidade semelhante.
- Tipo de financiamento, banco, parcela, data e campanha ajudam o humano, mas não são apresentados como prova quando não forem identificadores confiáveis.
- A UI nunca oferece “excluir duplicado”. Oferece apenas as resoluções auditáveis definidas acima.
- A tabela de Leads distingue oportunidades da mesma Pessoa pelo conjunto de dados de financiamento disponível; nenhum campo isolado é discriminador universal.

Só a **quarentena** continua vivendo em Integrações, porque ali não há Oportunidade nem card onde pendurar marcador.

## Onde a fila começa: `IntegrationEvent` é a outbox

O handler faz três coisas: **resolve o token → persiste o `IntegrationEvent` em commit PostgreSQL → responde 200**. Ele não depende do Redis para aceitar o lead.

Persistir antes de responder é inegociável. O evento nasce com despacho pendente; um dispatcher independente consulta a outbox, publica no BullMQ e só então marca o despacho. Se o Redis estiver indisponível, o evento continua durável e será publicado quando o serviço voltar.

- `jobId` é determinístico e derivado do `IntegrationEvent.id`, tornando republicação segura.
- O job carrega apenas identificadores técnicos e `workspace_id`, nunca o payload com PII; o worker lê o evento no PostgreSQL sob RLS.
- Marcar como despachado antes da confirmação do BullMQ é proibido. Publicar duas vezes é tolerado pela idempotência do job e do worker.
- O dispatcher aplica retry com backoff e não depende de um job repetível guardado no próprio Redis para descobrir pendências; sua fonte é o PostgreSQL, lida por `private.claim_pending_events` (ADR-0006 regra 9), que devolve `(id, workspace_id)` e nada mais.
- O botão “reprocessar” recoloca o evento no mesmo fluxo de despacho, sem caminho paralelo.

**Nota de implementação (ticket 15) — republicação exige remover o job terminado.** “`jobId` determinístico torna republicação segura” é verdade sobre o *domínio* e falso sobre o BullMQ literal: ele recusa adicionar um job cujo id já existe, e um job terminado guarda esse id — os completos por um dia, os falhos para sempre, porque a fila morta precisa ficar inspecionável. Sem apagar o antigo antes de publicar, “reprocessar” marcaria o evento como despachado e não faria nada; a fila morta não teria saída. O publicador remove e então adiciona. O caso que o id determinístico existe para proteger continua protegido: um job em processamento está travado, a remoção falha, o `add` deduplica, e o evento fica com a execução já em curso.

`IntegrationEvent` é a fonte única da tela de Integrações para recebimento, despacho, processamento, falha e reprocessamento. Estado no Redis é operacional e nunca a fonte de verdade.

### A resolução do token é cross-tenant por natureza

O handler precisa descobrir **qual** workspace pertence àquele token — ou seja, faz uma consulta **antes** de saber o workspace, e por isso **antes** de poder setar `app.workspace_id`. Ela colide de frente com o [ADR-0006](./0006-rls-duas-camadas-guc-worker.md).

Resolver dando bypass de RLS ao app seria destruir a rede inteira por causa de uma consulta. A saída é uma **função `SECURITY DEFINER` em schema privado** que recebe o hash do token e devolve o `workspace_id`, com `EXECUTE` revogado de todo papel que não seja o do app. Superfície mínima, auditável, e o resto do sistema continua sem bypass.

**Não é a única consulta sem tenant.** O dispatcher, que procura pendências de todos os workspaces sem sessão e sem job prévio, tem exatamente o mesmo formato — e um "claim por evento" seria circular, porque para setar o claim ele precisa do `workspace_id` do evento, e para ler o `workspace_id` ele precisaria do claim. O provisionamento e a resolução navegador → associação/workspace completam os outros casos. As quatro recebem o mesmo remédio e formam **lista fechada**, enumerada e verificada no ADR-0006 regra 9, conforme detalhado no ADR-0019. O que cada uma devolve importa tanto quanto quem pode chamá-la: `claim_pending_events` devolve `(id, workspace_id)` e nunca o `raw`, que carrega CPF e telefone.

Lookup por hash indexado, **sem cache** — token revogado precisa parar de funcionar imediatamente. O hash é **SHA-256 determinístico**, e isso não é descuido: salt e key-stretching existem contra segredo de baixa entropia escolhido por humano, e um token de integração é 256 bits de CSPRNG, onde não há o que forçar. Hash adaptativo é salgado por linha, o que torna impossível procurar por índice — restaria carregar todas as conexões e verificar uma a uma, na rota mais quente do sistema, com cache proibido. Salgar um valor inadivinhável não compra segurança; compra latência.

### Região

Railway e Supabase na **mesma região**. Com app e banco em continentes diferentes, cada round-trip do handler custa ~120ms em vez de ~2ms.

## Resiliência

Persistir o bruto **antes** de responder ou processar. Dispatcher recupera pendências após indisponibilidade do Redis; BullMQ aplica retries aos jobs publicados; processamento esgotado fica visível para reprocessamento manual. O histórico de eventos e a última sync aparecem em Integrações > Pluga.
