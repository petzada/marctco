# Ingestão de leads e idempotência

Toda origem de lead (Pluga Meta, Pluga Google, webhook de LP) entra por um endpoint autenticado por token que **responde 202 sempre**, persiste o payload bruto em `integration_events` e enfileira. A idempotência tem **dois mecanismos distintos**, em duas tabelas, respondendo a duas perguntas diferentes — e nenhum deles sozinho cobre os casos reais.

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
| Qualquer payload que parseie — inclusive duplicata, inclusive incompleto | **202** |

**Nunca 409.** Um pré-check de duplicata no request não elimina a necessidade da constraint — sob concorrência, duas retransmissões simultâneas passam ambas pelo `SELECT`. O pré-check apenas **duplica** a regra em dois lugares, e o que roda no request é o que pode estar errado. Uma regra, um dono.

Além disso, `pluga.md` afirma que a Pluga trata 409 como sucesso, mas isso não está verificado. Se ela registrar como `Falhou`, o painel do cliente enche de vermelho em duplicata legítima e uma assessoria não-técnica abre chamado achando que perdeu lead. 202 sempre não tem esse modo de falha.

**Nenhum campo de negócio é obrigatório.** O request valida o contrato; o worker decide o negócio.

**O tenant vem do token, nunca do body.** `workspace_id` no JSON é ignorado, sempre.

## Quarentena

| Caso | Destino |
|---|---|
| Sem telefone **e** sem e-mail | **Quarentena**: persiste `IntegrationEvent`, não cria Person nem Opportunity, aparece em Integrações > Pluga para correção manual ou liberação |
| Tem contato, falta CPF | Entra no funil, sem marcador |
| Só e-mail, sem telefone | Entra no funil, **com marcador** |
| Falta produto/banco | Entra no funil, sem marcador |

O marcador significa exatamente uma coisa: **não dá para WhatsApp nem ligar**. Não é rótulo genérico de "falta algo".

Lead em quarentena não tem Opportunity, logo **não tem relógio de SLA** — por isso a quarentena precisa do próprio alerta em Integrações, senão vira buraco silencioso. Lead marcado tem SLA correndo normal.

Campos são editáveis no card do Lead e por ação direta na tabela de Leads. Um contador-filtro na tabela de Leads mostra `N leads sem telefone` e filtra ali mesmo — o gestor corrige mais rápido no contexto do lead do que numa tela técnica.

Perder lead por mapeamento torto é o pecado capital de quem compra mídia; o mapeamento mora na Pluga, fora do controle do CRM, configurado por gente não-técnica. Registro sujo e visível é sempre melhor que lead que sumiu.

## Mecanismo 1 — "eu já recebi esta transmissão?"

`UNIQUE(workspace_id, source, external_lead_id)` em `LeadSubmission`.

- **`external_lead_id` é `NOT NULL` sempre.** Em Postgres `NULL` não colide com `NULL` num índice único — a constraint não deduplicaria nada quando o campo viesse vazio, e o webhook genérico de LP é um formulário montado pelo cliente que pode não mandar ID nenhum. Retry no navegador criaria oportunidades duplicadas sem que nada reclamasse.
- **Quando a origem não fornece ID, o conector sintetiza** um determinístico: hash do payload normalizado + janela de tempo. Responsabilidade do adapter, não do domínio.
- **Insert-and-catch, nunca check-then-insert.** A violação de constraint é o caminho normal para duplicata, não um erro.

## Mecanismo 2 — "esta pessoa já tem negócio aberto neste produto?"

Regra de aplicação, **não constraint**. Uma submissão genuinamente nova traz `external_lead_id` novo, então o mecanismo 1 nem dispara.

- Oportunidade **fechada** (ganho ou perdido) + nova submissão → **nova Opportunity**. É o caso do cliente que fez novo financiamento e voltou meses depois.
- **Produto diferente** → sempre nova Opportunity, mesmo com uma aberta.
- **Oportunidade aberta, mesmo produto** → a ingestão automática **anexa** à existente e marca re-entrada na timeline. Dois cards abertos da mesma pessoa significam dois atendentes ligando para o mesmo sujeito.
- **Um humano pode criar uma segunda oportunidade aberta do mesmo produto**, com aviso de que já existe negócio aberto.

**Por que não índice único parcial:** `UNIQUE(workspace_id, person_id, product_id) WHERE status = 'OPEN'` tornaria a regra inviolável, mas ela **está errada em revisional** — uma pessoa pode ter dois financiamentos de veículo, dois contratos, duas revisionais legítimas simultâneas. A constraint rígida tornaria o segundo caso impossível de cadastrar inclusive à mão, travando a operação sem saída. Concorrência entre submissões simultâneas se resolve com lock na Person durante a decisão.

## Identidade da Pessoa

Cascata **telefone → CPF → e-mail**, com uma correção que a ordem sozinha não expressa: **casa por qualquer chave presente, e telefone decide quando duas chaves apontam para Pessoas diferentes.**

Cascata estrita ("tenta telefone; se não houver, tenta CPF") duplicaria o cadastro de quem voltou com número novo e mesmo CPF — exatamente o cliente recorrente que o produto quer reconhecer.

E-mail é chave **fraca**: casamento só por e-mail marca *provável duplicata* em vez de fundir Person. Sem nenhuma das três chaves, não cria Person — cadastro sem chave de identidade gera duplicata permanente que ninguém desfaz depois.

Formulários de Ads raramente trazem CPF. `CONTEXT.md`, `decisoes.md` §Handoff e `pluga.md` assumiam CPF como campo mínimo; a identidade **não pode depender dele**.

## Retransmissão é inerte ao funil

Retransmissão atualiza `raw` e contagem de tentativas no `LeadSubmission`, registra "reenvio recebido" na timeline da Opportunity, e **para aí**. Não toca etapa, responsável, status nem `arrived_at`.

A alternativa é catastrófica: um soluço da Pluga ressuscitaria negócios perdidos, zeraria relógios de SLA e devolveria à fila leads já descartados. Um card perdido que volta sozinho destrói a confiança da operação no funil mais rápido que um lead perdido.

## Normalização

CRM é fonte de verdade (`sintese-final.md` §17). Telefone em **E.164**, CPF só dígitos com DV validado, e-mail **lowercase**. Normalização é serviço de domínio compartilhado, chamado uma vez — não implementação por adapter, senão três cópias divergem e o default de país (Brasil) vaza para dentro do adapter, que não deveria conhecê-lo.

## Consequência de UX: duas oportunidades abertas da mesma pessoa

Não travar no banco transfere o peso inteiro para a interface. Este cenário é **mais comum do que os docs supõem** e a UI precisa resolvê-lo explicitamente — item aberto de design, a especificar:

- A tabela de Leads **não pode** mostrar duas linhas indistinguíveis de "João Silva · Veículo". Precisa de discriminador humano.
- **`banco` é o discriminador natural e já chega do formulário Ads** (`pluga.md` §Campos mínimos). Data de chegada e campanha são desempate secundário.
- Ao atribuir, o gestor precisa ver "esta pessoa tem outra oportunidade aberta, com o atendente X" — senão dois atendentes ligam para o mesmo cliente sobre contratos diferentes e a operação parece amadora.
- O card precisa deixar claro **qual** financiamento está em discussão.
- O card da Person mostra todas as oportunidades, abertas e fechadas, com motivo de perda.

## Onde a fila começa

O handler faz exatamente três coisas, nesta ordem: **resolve o token → persiste o `IntegrationEvent` → enfileira → responde 202.**

Persistir **antes** de responder é inegociável: 202 com persistência posterior significa que uma queda do processo perde o lead **enquanto o provedor registra sucesso** — perda silenciosa, sem retentativa e sem rastro.

Postgres e Redis não commitam juntos; não existe ordem atômica, só escolha de qual inconsistência se prefere:

| Ordem | Falha |
|---|---|
| Enfileira → persiste | Worker pega job de evento que ainda não existe |
| Persiste → 202 → enfileira | Trabalho após a resposta não tem garantia de execução |
| **Persiste → enfileira → 202** | Redis fora deixa evento órfão em `PENDING` — visível e recuperável |

**Falha de enfileiramento responde 5xx** com o evento já persistido em `PENDING`. O provedor retenta; a duplicata morre no `LeadSubmission`.

**Varredor de `PENDING`** como job repetível, re-enfileirando eventos parados além de N minutos. Não é peça nova: é o mesmo mecanismo do botão "reprocessar" que `pluga.md` §Tela item 13 já exige. Ele existe porque a Pluga retenta 5xx, mas o **webhook genérico de LP** é um POST de navegador que não retenta nada — sem o varredor, um lead de landing page some se o Redis estiver fora naquele instante.

`IntegrationEvent.status` é a fonte única da tela de Integrações: última sync, histórico e fila morta leem o mesmo campo. Sem estado paralelo no Redis para a UI consultar.

### A resolução do token é cross-tenant por natureza

O handler precisa descobrir **qual** workspace pertence àquele token — ou seja, faz uma consulta **antes** de saber o workspace, e por isso **antes** de poder setar `app.workspace_id`. É o único ponto do sistema que legitimamente não tem contexto de tenant, e ele colide de frente com o [ADR-0006](./0006-rls-duas-camadas-guc-worker.md).

Resolver dando bypass de RLS ao app seria destruir a rede inteira por causa de uma consulta. A saída é uma **função `SECURITY DEFINER` em schema privado** que recebe o hash do token e devolve o `workspace_id`, com `EXECUTE` revogado de todo papel que não seja o do app. Superfície mínima, auditável, e o resto do sistema continua sem bypass.

Lookup por hash indexado, **sem cache** — token revogado precisa parar de funcionar imediatamente.

### Região

Railway e Supabase na **mesma região**. Com app e banco em continentes diferentes, cada round-trip do handler custa ~120ms em vez de ~2ms.

## Resiliência

Persistir o bruto **antes** de processar. Dead-letter queue com reprocessamento manual (`sintese-final.md` §11). O histórico de eventos e a última sync aparecem em Integrações > Pluga.
