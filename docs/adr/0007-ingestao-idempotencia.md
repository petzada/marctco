# Ingestão de leads e idempotência

Toda origem de lead (Pluga Meta, Pluga Google, webhook servidor-servidor de LP) entra por endpoint autenticado que **responde 200 depois de persistir** o payload bruto em `integration_events`. Essa tabela é também a outbox: um dispatcher independente publica no BullMQ quando o Redis estiver disponível. A idempotência da transmissão, a identidade da Pessoa e a decisão de criar ou associar Oportunidade são problemas distintos; nenhum pode decidir os demais por atalho.

**Dúvida nunca segura o lead.** Todo envio com pelo menos um contato vira Oportunidade no ato. Conflito de identidade e suspeita de duplicidade viram **pendência anexada à Oportunidade já criada**, resolvida depois por mesclagem não destrutiva. O relógio de atendimento começa na chegada, não na decisão de um humano.

**Status:** accepted · 2026-08-04

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
| Sem telefone **e** sem e-mail | **Quarentena**: persiste `IntegrationEvent`, não cria Person nem Opportunity, aparece em Integrações > Pluga para correção manual ou liberação |
| Tem contato, falta CPF | Entra no funil, sem marcador |
| Só e-mail, sem telefone | Entra no funil, **com marcador** |
| Falta tipo de financiamento/banco/parcela | Entra no funil comercial, sem marcador |

O marcador significa exatamente uma coisa: **não dá para WhatsApp nem ligar**. Não é rótulo genérico de "falta algo".

Lead em quarentena não tem Opportunity, logo **não tem relógio de SLA** — por isso a quarentena precisa do próprio alerta em Integrações, senão vira buraco silencioso. Lead marcado tem SLA correndo normal.

Campos são editáveis no card do Lead e por ação direta na tabela de Leads. Um contador-filtro na tabela de Leads mostra `N leads sem telefone` e filtra ali mesmo — o gestor corrige mais rápido no contexto do lead do que numa tela técnica.

Perder lead por mapeamento torto é o pecado capital de quem compra mídia; o mapeamento mora na Pluga, fora do controle do CRM, configurado por gente não-técnica. Registro sujo e visível é sempre melhor que lead que sumiu.

## Mecanismo 1 — "eu já recebi esta transmissão?"

`UNIQUE(workspace_id, source, external_lead_id)` em `LeadSubmission`.

- **`external_lead_id` é `NOT NULL` sempre.** Em Postgres `NULL` não colide com `NULL` num índice único. Integrações servidor-servidor de LP devem enviar um ID estável; quando uma origem não o fornecer, o conector sintetiza um determinístico para manter a proteção.
- **Quando a origem não fornece ID, o conector sintetiza** um determinístico: hash do payload normalizado + janela de tempo. Responsabilidade do adapter, não do domínio.
- **Insert-and-catch, nunca check-then-insert.** A violação de constraint é o caminho normal para duplicata, não um erro.

## Mecanismo 2 — "é seguramente o mesmo financiamento?"

**Supersede a regra anterior de anexar por mesma Pessoa + Produto.** Tipo de financiamento é apenas classificação e não identifica contrato: uma Pessoa pode ter dois financiamentos de veículo simultâneos, inclusive no mesmo banco. Similaridade gera **sinal**, nunca associação automática — e nunca bloqueio.

- Retransmissão com a mesma chave idempotente continua inerte e permanece associada à mesma Oportunidade. Isso é o mecanismo 1, não este.
- Uma submissão genuinamente nova **sempre cria Oportunidade**. Nenhum lead espera decisão humana para entrar no funil.
- Quando já existe Oportunidade semelhante para a mesma Pessoa, a nova nasce **ligada** à anterior por um `IntakeReview(POSSIBLE_DUPLICATE)`, visível nos dois cards. O atendimento pode começar imediatamente em qualquer um dos dois.
- O gestor resolve quando quiser, com três saídas auditáveis e não destrutivas:
  1. `NEW_FINANCING`: confirma que são contratos distintos; a ligação some, as duas Oportunidades seguem independentes;
  2. `SAME_FINANCING`: mescla — a Oportunidade mais nova recebe `merged_into_opportunity_id` apontando para a canônica, sai das vistas ativas, e seu `LeadSubmission` passa a contar como reentrada na timeline da canônica;
  3. `INVALID_OR_SPAM`: arquiva com motivo, sem exclusão física.
- `arrived_at` é sempre o `received_at` real do envio. Como nada fica retido, não existe relógio distorcido por tempo em fila.

**Considered option (rejeitada): reter o envio em fila antes de criar a Oportunidade.** Mais correto no cadastro e desastroso na operação. A prova de "mesmo financiamento" exigida seria uma referência estável de contrato — que **formulário de Ads não fornece**. Na prática, toda segunda submissão da mesma Pessoa cairia numa fila manual, e lead de mídia paga apodrece em minutos, não em dias. Numa operação cujo SLA começa em `arrived_at`, pôr trabalho humano bloqueante no caminho crítico troca um erro barato e reversível (dois cards que se mesclam) por um caro e invisível (lead quente parado numa tela que o comercial não abre).

**Custo assumido:** mesclar depois é mais trabalho de schema do que decidir antes — exige `merged_into_opportunity_id`, exige que toda listagem ativa filtre mesclados, e aceita duplicata temporária visível. É o preço de nunca segurar um lead.

Não há índice único parcial por Pessoa + tipo de financiamento. Duas Oportunidades abertas da mesma Pessoa são estado legítimo, não anomalia a impedir.

## Identidade da Pessoa

**Supersede “telefone sempre decide”.** `Person` preserva múltiplos telefones e e-mails em registros próprios; receber um contato novo nunca sobrescreve o anterior.

- CPF válido é o identificador mais forte quando presente, mas continua opcional.
- Telefone pode identificar automaticamente apenas quando aponta de forma inequívoca para uma Pessoa e nenhuma outra chave contradiz essa associação.
- E-mail isolado permanece chave fraca e não autoriza fusão automática.
- **Quando as chaves recebidas apontam para Pessoas diferentes, cria-se uma Pessoa nova** com os contatos daquele envio, a Oportunidade nasce nela, e um `IntakeReview(IDENTITY_CONFLICT)` registra as candidatas. Nenhuma chave vence por prioridade fixa, e nenhum vínculo errado é criado — porque nenhum vínculo com cadastro existente é criado.
- A resolução manual mescla a Pessoa nova numa candidata ou confirma que são pessoas distintas. A mesclagem transfere contatos e Oportunidades para a canônica e deixa `merged_into_person_id` na absorvida; identificadores e histórico permanecem auditáveis, sem exclusão silenciosa.
- Sem nenhuma chave de contato não se cria Person: o evento permanece em quarentena. Este é o **único** caso em que a ingestão não produz Oportunidade — e ele não é dúvida, é impossibilidade de contato.

Formulários de Ads raramente trazem CPF; por isso a identidade não depende dele, mas essa ausência também não transforma telefone em autoridade absoluta.

**Considered option (rejeitada): reter o envio antes da Oportunidade quando há conflito.** Mesmo argumento do mecanismo 2 — o conflito é do cadastro, e o cadastro é corrigível a qualquer momento; o lead quente não é. Duplicar uma Pessoa temporariamente é reversível por mesclagem; perder a janela de contato não é.

**Considered option (rejeitada): escolher a Pessoa mais provável e seguir.** Reintroduz "telefone decide" pela porta dos fundos, e o vínculo errado é justamente o que não se desfaz sozinho — o atendente lê histórico de outra pessoa e trata o cliente pelo nome errado.

## Retransmissão é inerte ao funil

Retransmissão atualiza `raw` e contagem de tentativas no `LeadSubmission`, registra "reenvio recebido" na timeline da Opportunity, e **para aí**. Não toca etapa, responsável, status nem `arrived_at`.

A alternativa é catastrófica: um soluço da Pluga ressuscitaria negócios perdidos, zeraria relógios de SLA e devolveria à fila leads já descartados. Um card perdido que volta sozinho destrói a confiança da operação no funil mais rápido que um lead perdido.

## Normalização

CRM é fonte de verdade (`sintese-final.md` §17). Telefone em **E.164**, CPF só dígitos com DV validado, e-mail **lowercase**. Normalização é serviço de domínio compartilhado, chamado uma vez — não implementação por adapter, senão três cópias divergem e o default de país (Brasil) vaza para dentro do adapter, que não deveria conhecê-lo.

## Consequência de UX: pendência é marcador, não sala de espera

Como nada fica retido, **não existe fila que esconde leads**. A revisão é um marcador no card, e a tela de Leads é a superfície principal.

- O lead com pendência **aparece normalmente na tabela de Leads**, com um marcador visível de identidade em conflito ou possível duplicado. Ele pode ser atribuído e atendido antes de qualquer resolução.
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
- O dispatcher aplica retry com backoff e não depende de um job repetível guardado no próprio Redis para descobrir pendências; sua fonte é o PostgreSQL.
- O botão “reprocessar” recoloca o evento no mesmo fluxo de despacho, sem caminho paralelo.

`IntegrationEvent` é a fonte única da tela de Integrações para recebimento, despacho, processamento, falha e reprocessamento. Estado no Redis é operacional e nunca a fonte de verdade.

### A resolução do token é cross-tenant por natureza

O handler precisa descobrir **qual** workspace pertence àquele token — ou seja, faz uma consulta **antes** de saber o workspace, e por isso **antes** de poder setar `app.workspace_id`. É o único ponto do sistema que legitimamente não tem contexto de tenant, e ele colide de frente com o [ADR-0006](./0006-rls-duas-camadas-guc-worker.md).

Resolver dando bypass de RLS ao app seria destruir a rede inteira por causa de uma consulta. A saída é uma **função `SECURITY DEFINER` em schema privado** que recebe o hash do token e devolve o `workspace_id`, com `EXECUTE` revogado de todo papel que não seja o do app. Superfície mínima, auditável, e o resto do sistema continua sem bypass.

Lookup por hash indexado, **sem cache** — token revogado precisa parar de funcionar imediatamente.

### Região

Railway e Supabase na **mesma região**. Com app e banco em continentes diferentes, cada round-trip do handler custa ~120ms em vez de ~2ms.

## Resiliência

Persistir o bruto **antes** de responder ou processar. Dispatcher recupera pendências após indisponibilidade do Redis; BullMQ aplica retries aos jobs publicados; processamento esgotado fica visível para reprocessamento manual. O histórico de eventos e a última sync aparecem em Integrações > Pluga.
