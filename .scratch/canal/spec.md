# Spec — Canal

Status: done

> Fase 4 de [docs/plano-de-construcao.md](../../docs/plano-de-construcao.md): **WhatsMiau + template de 1º contato + timeline de mensagem no card.**
> Vocabulário: [CONTEXT.md](../../CONTEXT.md). Nomes de código: [ADR-0005](../../docs/adr/0005-idioma-codigo-en-ui-pt-br.md).
> Estado de partida: Fases 0–3 entregues — [fechamento das Fases 0–2](../fechamento-fases-0-2.md), [PROMPT-HANDOFF da Fase 3](../tempo/PROMPT-HANDOFF.md).
> ADRs vinculantes: 0003, 0004, 0005, 0006, 0007, 0008, 0013, 0015, 0016, 0018, 0019, 0031.
> **Decisão fechada para esta spec:** WhatsMiau é tratado como **gateway não oficial**; as mitigações anti-ban do ADR-0003 são obrigatórias. O item aberto A5 do plano deixa de bloquear a implementação com essa premissa.
> **Costura principal acordada:** Seam 4 — atribuição real → fila → WhatsMiau simulado → fato de envio na timeline + `first_contact_at` idempotente.

---

## Problem Statement

O lead chega, é distribuído, alguém assume o card — e **o primeiro contato com o cliente ainda depende de memória, post-it e WhatsApp pessoal sem registro no CRM.**

A operação já tem atribuição, SLA de primeiro contato, atividades e linha do tempo de movimento. O que falta é o **canal**: uma mensagem automática de abertura, disparada no momento certo, com o nome e o telefone do atendente quando a operação escolhe atribuir antes de enviar; e um registro no card de que aquela mensagem saiu — e, quando o cliente responde, de que a resposta chegou.

Hoje o engate `AUTO_FIRST_CONTACT` já existe na ingestão, mas **não tem consumidor** e, pior, dispara no caminho de chegada — enquanto o produto decidiu que o default é **na atribuição a um Atendente**, não na chegada. Sem reconciliar isso, o código implementa o gatilho errado.

**Não há instância WhatsMiau conectada.** A assessoria não pareia o número da empresa, não vê status da conexão e não sabe se o CRM pode falar com o lead.

**Não há template editável.** O texto do primeiro contato não vive em Configurações; o gestor não escolhe o tom nem as variáveis.

**A linha do tempo do card não fala de mensagem.** Movimento, ingestão e atividade estão lá; envio automático e resposta do cliente não.

**O CRM não será inbox.** Os atendentes continuam conversando no WhatsApp pessoal. O único papel do WhatsMiau no MVP é **uma** mensagem automática por lead, mais o registro de entrada na timeline — não uma tela de conversa.

## Solution

**Uma instância WhatsMiau por workspace** — o número da empresa — conectada em Integrações, com status visível e pareamento por QR.

**Template de primeiro contato editável** em Configurações, com variáveis que dependem do gatilho escolhido. Gestão e Direção editam; Atendente e Supervisor só leem o efeito no card.

**Gatilho configurável** `ON_ASSIGNMENT | ON_ARRIVAL | DISABLED`, default `ON_ASSIGNMENT`. Isso é **configuração de workspace**, não feature flag. A flag `auto_primeiro_contato` continua sendo a liberação comercial: sem ela, nada dispara. A ordem é **flag → gatilho → opt-in → elegibilidade → dedupe → pré-condições operacionais**.

**Na atribuição (default):** quando um lead passa a ter um **Atendente** como responsável — primeira atribuição ou reatribuição que entrega ao Atendente — a mesma transação Postgres grava uma tentativa outbound pendente. Um dispatcher recuperável a publica na fila; o HTTP roda fora da transação, com delay, rate limit e deduplicação. Atribuir ao Supervisor **não** dispara: a mensagem promete um atendente nomeado e um telefone pessoal; isso só existe quando o card chega ao Atendente.

**Na chegada (opcional):** se o gestor configurar `ON_ARRIVAL`, o mesmo pipeline dispara na criação da Oportunidade — inclusive no caminho quarentena → liberação — reutilizando o engate `post_creation_effects` que a ingestão já planeja.

**Uma mensagem automática por lead significa uma tentativa lógica e, por política conservadora, no máximo uma invocação `sendText`.** A API não documenta idempotency key. A primeira tentativa criada — pendente, em processamento ou terminal — bloqueia novo planejamento; queda depois de iniciar o HTTP termina como falha de resultado incerto e não reenvia. Reatribuir nunca cria uma segunda tentativa.

**Timeline no card:** cada envio automático bem-sucedido e cada mensagem recebida via webhook viram fatos na linha do tempo, com copy legível em PT-BR e escopo de leitura por perfil (Atendente: meus leads; Supervisor: time; Gestão/Direção: tudo).

**Primeiro contato:** HTTP 2xx de `sendText` é a política local de aceite e preenche `first_contact_at` uma vez; não significa entrega nem leitura, que exigiriam `messages.update` fora do escopo. Resposta inbound também preenche. Atribuir, agendar ou falhar não preenchem.

**Mitigações anti-ban** no worker: opt-in explícito e persistido, atraso conservador antes do envio e rate limit por workspace. Sem opt-in verdadeiro, o sistema falha fechado e não agenda. Variação automática de texto fica registrada como evolução pós-MVP; o template editável não será alterado silenciosamente pelo worker.

## User Stories

### Conexão WhatsMiau

1. Como Direção, quero conectar uma instância WhatsMiau do workspace em Integrações, para que o número da empresa possa enviar o primeiro contato automático.
2. Como Direção, quero parear a instância por QR code, para não depender de suporte técnico para ligar o número.
3. Como Gestão ou Direção, quero ver se a instância está conectada, desconectada ou com erro, para saber se o disparo vai funcionar antes de distribuir leads.
4. Como Direção, quero desconectar ou reconectar a instância, para trocar de número sem perder o histórico do CRM.
5. Como sistema, quero **uma** instância ativa por workspace, para respeitar o ADR-0003 e evitar ambiguidade de remetente.
6. Como sistema, quero recusar envio quando não há instância conectada, em vez de falhar em silêncio ou enfileirar para sempre.
7. Como Atendente ou Supervisor, quero ver no card se o workspace tem WhatsApp conectado, sem poder alterar a conexão.
8. Como sistema, quero guardar credenciais e segredos de webhook por conexão, isolados por workspace sob RLS.

### Feature flag e configuração

9. Como marctco, quero ligar `auto_primeiro_contato` por workspace, para liberar a capacidade comercial sem expor o catálogo ao cliente.
10. Como Gestão ou Direção, quero editar o **gatilho** do primeiro contato automático (`Na atribuição`, `Na chegada`, `Desligado`), para adaptar a operação sem pedir à marctco.
11. Como Gestão ou Direção, quero editar o **texto do template** com variáveis, para personalizar a mensagem de abertura.
12. Como sistema, quero que o default do gatilho seja **na atribuição**, conforme ADR-0003.
13. Como sistema, quero que workspace sem linha de configuração use os padrões do domínio — ausência não desliga o relógio de SLA nem confunde com `DISABLED`.
14. Como Atendente ou Supervisor, não quero editar template nem gatilho, porque isso é configuração da operação.
15. Como sistema, quero avaliar **primeiro** a flag `auto_primeiro_contato` e **depois** a configuração, para não disparar capacidade não contratada.
16. Como sistema, quero que `DISABLED` no gatilho impeça envio mesmo com flag ligada e instância conectada.

### Template e variáveis

17. Como Gestão, quero usar variáveis no template — por exemplo nome do lead, nome do atendente, telefone do atendente, nome do workspace — para a mensagem soar humana sem editar lead a lead.
18. Como sistema, quero que, no gatilho **na atribuição**, as variáveis de atendente e telefone do atendente estejam disponíveis, porque a mensagem nomeia quem vai falar com o lead.
19. Como sistema, quero que, no gatilho **na chegada**, variáveis de atendente **não** estejam disponíveis, porque ninguém foi atribuído ainda.
20. Como sistema, quero recusar salvar template com variável inválida para o gatilho escolhido, na escrita, e não na hora do envio.
21. Como sistema, quero recusar template vazio quando o gatilho não é `DISABLED` e a flag está ligada, para não enviar mensagem em branco.
22. Como Gestão, quero ver na tela de Configurações quais variáveis existem para o gatilho atual, para não adivinhar a sintaxe `{{variavel}}`.

### Disparo na atribuição (caminho principal)

23. Como sistema, quero disparar o primeiro contato automático quando um lead passa a ter um **Atendente** como responsável, para cumprir a promessa do ADR-0003.
24. Como sistema, quero **não** disparar quando a atribuição entrega o lead a um Supervisor, porque a mensagem ainda não tem atendente nomeado.
25. Como sistema, quero **não** disparar na reatribuição se já houve envio bem-sucedido ou tentativa terminal para aquele lead.
26. Como sistema, quero gravar a intenção de envio **na mesma transação** da atribuição e publicá-la depois por um dispatcher recuperável, para não perder o job nem misturar I/O externo com a transação Postgres.
27. Como atendente, quero que a mensagem automática cite meu nome e meu WhatsApp pessoal cadastrado na Equipe, para o lead esperar o contato certo.
28. Como sistema, quero recusar envio quando o membro atribuído não tem `whatsapp_phone_e164` válido, e registrar falha observável — sem preencher `first_contact_at`.
29. Como Gestão, quero que atribuir em massa ao Atendente dispare o envio para cada lead elegível do lote, com as mesmas regras do 1 a 1.
30. Como sistema, quero aplicar **delay** antes do envio na fila, como mitigação anti-ban.
31. Como sistema, quero **rate limit** por workspace na fila de canal, para não disparar centenas de mensagens em rajada.

### Disparo na chegada (caminho opcional)

32. Como Gestão, quero configurar o gatilho **na chegada**, ciente de que a mensagem será genérica e aumenta risco de ban, para operações que aceitam esse trade-off.
33. Como sistema, quero consumir o efeito `AUTO_FIRST_CONTACT` na ingestão **somente** quando o gatilho for `ON_ARRIVAL` e a flag estiver ligada.
34. Como sistema, quero que a liberação da quarentena para Oportunidade também possa planejar o mesmo efeito, para não perder leads que nasceram retidos.
35. Como sistema, quero o mesmo pipeline de envio para chegada e atribuição, diferindo só o momento do agendamento e o conjunto de variáveis do template.

### Elegibilidade e deduplicação

36. Como sistema, quero recusar envio para lead com `missing_phone = true`, alinhado ao marcador de sem telefone.
37. Como sistema, quero recusar envio para lead ganho, perdido ou mesclado.
38. Como sistema, quero **uma** mensagem automática outbound por Oportunidade, independentemente de quantas atribuições ocorreram.
39. Como sistema, quero idempotência no job de canal — reprocessar a fila não deve produzir segundo `sendText` para o mesmo lead.
40. Como sistema, quero registrar tentativa falha com motivo, para o gestor diagnosticar sem achar que o lead foi contactado.
41. Como sistema, quero exigir opt-in explícito para WhatsApp no contrato de entrada e persistir essa evidência, para que o disparo automático falhe fechado.

### Webhook de entrada

42. Como sistema, quero receber webhooks autenticados do WhatsMiau, para registrar respostas do cliente sem inbox.
43. Como sistema, quero recusar webhook com token inválido, sem criar fato na timeline.
44. Como sistema, quero ignorar ecos outbound identificados pelo provedor, para não registrar a própria mensagem como resposta do cliente.
45. Como sistema, quero mapear mensagem inbound à Oportunidade que originou o outbound; sem tentativa correspondente, usar a única Oportunidade aberta não mesclada da Pessoa, e ignorar ambiguidades com log seguro.
46. Como atendente, quero ver na linha do tempo que o cliente **respondeu**, sem ler o thread completo no CRM.
47. Como sistema, quero deduplicar webhook pelo identificador externo da mensagem, para retentativas do provedor não duplicarem fatos.
48. Como sistema, quero que resposta inbound preencha `first_contact_at` se ainda estiver vazio, porque o cliente falou com a operação.

### Timeline no card

49. Como atendente, quero ver na linha do tempo que a mensagem automática **foi enviada**, com horário legível.
50. Como atendente, quero ver quando o envio automático falhou definitivamente, para não presumir que o cliente foi contactado.
51. Como supervisor, quero ver envios e respostas dos leads do meu time na timeline, para acompanhar abertura sem abrir o WhatsApp pessoal de cada um.
52. Como Gestão ou Direção, quero ver toda a atividade de mensagem do workspace no card.
53. Como sistema, quero copy em PT-BR distinto para envio automático, falha definitiva e mensagem recebida.
54. Como sistema, quero que fatos de mensagem coexistam com movimento, ingestão e atividade na mesma lista ordenada.
55. Como Atendente, não quero ver timeline de lead que não é meu.

### Primeiro contato e SLA

56. Como gestor, quero que HTTP 2xx de `sendText` conte como primeiro contato pela política local do MVP, sem chamar isso de entrega ou leitura.
57. Como gestor, quero que resposta inbound conte como primeiro contato se ainda não havia evidência, para o relógio parar quando o cliente respondeu antes de qualquer atividade.
58. Como sistema, quero que atribuir ou agendar envio **não** preencham `first_contact_at`.
59. Como sistema, quero que falha terminal de envio **não** preencha `first_contact_at`, para o SLA continuar correndo até atividade ou resposta real.
60. Como sistema, quero preservar a regra da Fase 3: primeira Atividade concluída e mensagem competem pela mesma coluna com `WHERE first_contact_at IS NULL` — quem chegar primeiro ganha.

### Integrações e operação

61. Como Gestão, quero uma entrada **WhatsApp** na gaveta Integrações, ao lado de Pluga e Landing Page, para acompanhar status sem poder rotacionar credenciais.
62. Como Direção, quero parear, desconectar e reconectar a instância.
63. Como Atendente, não quero acessar a tela de Integrações.
64. Como sistema, quero que o worker de canal rode sob RLS com contexto de job do workspace, como o worker de ingestão.
65. Como sistema, quero resolver flags no contexto de acesso do worker, conforme slot reservado na Fase 4 no ADR-0016.

### Segurança e confiabilidade

66. Como sistema, quero que credenciais, telefone e corpo integral da mensagem nunca apareçam em log nem em resposta indevida ao browser.
67. Como sistema, quero recuperar publicação/fila antes do HTTP, mas não repetir `sendText` após uma chamada iniciada, porque a API não oferece idempotência documentada.
68. Como sistema, quero que um workspace com fila travada não bloqueie outros workspaces no mesmo worker.

## Implementation Decisions

### Premissa do provedor

WhatsMiau é implementado contra a **Whatsmiau Cloud API v2**, compatível com Evolution API, base URL `https://api.whatsmiau.dev/v2`. Todas as chamadas usam o header `apikey`, cuja chave é escopada à conta. A integração continua tratada pelo produto como gateway não oficial, e as mitigações do ADR-0003 são requisito. Fonte contratual: [documentação oficial](https://whatsmiau.dev/docs/getting-started).

### Fronteira conector / domínio

- **Domínio puro** decide: flag ligada? gatilho permite? lead elegível? telefones presentes? já enviou? qual conjunto de variáveis? texto renderizado?
- **Operação nomeada / worker** orquestra: ler estado → chamar porta HTTP **fora** de `$transaction` → persistir fato e `first_contact_at` em transação separada.
- Porta `MessagingProvider` injetável: `sendText` é o único envio desta fase; adapter HTTP e normalizador de webhook não importam Prisma.

### Gatilhos e hooks

| Gatilho | Quando agenda | Variáveis de atendente |
|---------|---------------|------------------------|
| `ON_ASSIGNMENT` (default) | `assignLeads` / `reassignLeads` quando o **destino** é `ATTENDANT` | Sim |
| `ON_ARRIVAL` | Criação da Oportunidade (ingestão ou liberação de quarentena) via `post_creation_effects` | Não |
| `DISABLED` | Nunca | — |

Ordem de guards em todo disparo: `auto_primeiro_contato` → `first_contact_trigger` → opt-in verdadeiro → elegibilidade do lead → dedupe outbound → pré-condições operacionais (instância e telefone do Atendente).

Reatribuição entre Atendentes **não** reenvia se já existe qualquer tentativa outbound para a Oportunidade.

### Configuração de workspace

Estender settings do workspace com:

- `first_contact_trigger`: enum `ON_ASSIGNMENT | ON_ARRIVAL | DISABLED`, default domínio `ON_ASSIGNMENT`
- `first_contact_template_body`: texto com placeholders `{{snake_case}}`
- Opcionalmente parâmetros operacionais de mitigação (delay mínimo em segundos, teto de envios por minuto por workspace) — se não expostos na UI nesta fase, fixar defaults conservadores no domínio

Rótulos PT-BR na UI; valores EN no banco (ADR-0005).

### Conexão WhatsMiau

- Novo valor em provedor de integração para WhatsApp/WhatsMiau.
- O ADR-0031 continua permitindo N conexões por provedor em geral; para WhatsMiau, uma constraint parcial garante **no máximo uma conexão não desligada por workspace**, sem restaurar `UNIQUE(workspace_id, provider)` global.
- `instanceName` é o identificador público em todas as rotas e precisa ser único dentro da conta Whatsmiau; o CRM deriva um nome estável e globalmente único do workspace.
- Estado administrativo da conexão e estado de pareamento são distintos. O adapter normaliza `open → CONNECTED`, `closed → DISCONNECTED`, `connecting → CONNECTING`, `qr-code → QR_PENDING`; `suspended: true` vira `SUSPENDED`, e resposta inválida/erro vira `ERROR`. No webhook, `connection.update.state` usa `open | close`.
- A credencial da conta do provedor é configuração server-side da marctco; o workspace persiste apenas identificador da instância e token hash do webhook. Segredos nunca voltam ao browser após a criação.
- Direção inicia pareamento, lê QR/pairing code, desconecta e reconecta; Gestão e Direção leem status. Isso respeita a separação do ADR-0015 entre operação e segredo/ativação.
- O adapter usa somente: `POST /instance/create`, `GET /instance/connect/:name`, `GET /instance/connectionState/:name`, `DELETE /instance/logout/:name`, `POST /webhook/set/:instance` e, para reconciliação, `GET /instance/fetchInstances`.
- A ordem é criar sem conectar → configurar webhook com header secreto → conectar e obter QR. Assim nenhum evento nasce antes da autenticação do callback.
- O QR vem de `connect/:name` como `base64` e pairing code opcional; a UI não assume prazo fixo não documentado e atualiza o estado por `connectionState/:name`.
- O webhook usa URL HTTPS pública, eventos estritamente `messages.upsert` e `connection.update`, `byEvents: true`, `base64: false` e header customizado `Authorization: Bearer <token>`.

### Origem do job e outbox

- O `JobOrigin` do ADR-0016 ganha duas variantes reais: `channel_outbound` com `attempt_id` e `channel_inbound` com `integration_connection_id`; nenhuma fabrica `integration_event_id` nem usa `scheduled_sweep`.
- A intenção outbound nasce como tentativa `PENDING` na **mesma transação** que cria a Oportunidade (`ON_ARRIVAL`) ou entrega o lead ao Atendente (`ON_ASSIGNMENT`).
- A própria tentativa é o outbox Postgres. `dispatch_status` separa publicação (`PENDING | DISPATCHED`) de envio (`QUEUED | PROCESSING | SENT | FAILED`).
- Um dispatcher recuperável reivindica tentativas pendentes ou leases vencidos e publica na fila dedicada. Para descobrir workspaces antes do GUC, nasce `private.claim_pending_channel_attempts`, sétima função estreita do ADR-0019, retornando apenas `(attempt_id, workspace_id)`.
- O job BullMQ usa `attempt_id` como identidade. Dispatcher e fila podem recuperar falhas **antes** do HTTP. Antes de chamar a API, o worker grava `PROCESSING`; depois que a chamada começa, 4xx, 5xx, timeout, erro de rede, crash ou lease vencido terminam em `FAILED` e não reenviam, pois o efeito externo pode ter ocorrido. O motivo distingue recusa conhecida de resultado incerto.
- Delay inicial padrão é 30 segundos; rate limit padrão é 6 envios por minuto por `workspace_id`. Ambos podem vir de configuração server-side, com esses defaults conservadores. Concorrência entre workspaces impede um tenant travado de bloquear os demais.

### Persistência de envio e timeline

- Constraint única por Oportunidade e tipo de efeito garante uma tentativa automática outbound por lead.
- Flag desligada, gatilho incompatível, falta de opt-in, telefone do lead ausente e lead fechado/mesclado significam **sem intenção** e não criam tentativa. Instância desconectada ou Atendente sem telefone, depois de o gatilho elegível ocorrer, criam tentativa terminal `FAILED` observável.
- Novos tipos de fato na timeline da Oportunidade:
  - `WHATSAPP_OUTBOUND_SENT` — envio automático aceito pelo provedor
  - `WHATSAPP_OUTBOUND_FAILED` — tentativa automática encerrada sem envio
  - `WHATSAPP_INBOUND_RECEIVED` — mensagem recebida via webhook
- Payload mínimo no fato: timestamp, identificador externo da mensagem quando houver, preview truncado do texto (sem armazenar thread completa).
- `first_contact_at`: `UPDATE ... WHERE first_contact_at IS NULL` no mesmo commit que grava `SENT`, usando o instante do HTTP 2xx; inbound usa `messageTimestamp` validado e `date_time` como fallback. Nunca usa atribuição, enqueue ou início de envio.

### Webhook inbound

- Route handler dedicado sob token opaco configurado pelo CRM no webhook do provedor. O hash resolve a conexão e o workspace pela exceção pré-contexto já existente; não nasce função privada só para autenticação.
- O adapter aceita o envelope oficial `{ event, instance, data, date_time }`. Em `messages.upsert`, usa `data.key.id`, `data.key.remoteJid`, `data.key.fromMe`, `data.message`, `data.messageType` e `data.messageTimestamp`; ignora `fromMe: true`, JID de grupo e eventos desconhecidos.
- Texto simples vem de `message.conversation`; mídia/reação não é baixada nem persistida nesta fase — vira fato genérico pelo `messageType`, com caption somente quando presente. `connection.update` mapeia `open → CONNECTED` e `close → DISCONNECTED`, preservando `statusReason` sem inferir categorias que a API não documenta; `ERROR` fica reservado a falha HTTP, payload inválido ou estado desconhecido.
- O webhook verifica `envelope.instance`; em mensagem valida também `data.instanceId` quando presente, e em conexão valida `data.instance`. Todos correspondem ao `instanceName` autenticado. A idempotência é `(integration_connection_id, data.key.id)`.
- Resolver a Oportunidade primeiro pela tentativa outbound associada ao telefone remoto. Sem tentativa, aceitar apenas quando existir uma única Oportunidade aberta, não mesclada, da Pessoa; ambiguidade é ignorada com log seguro.
- Idempotência por ID externo da mensagem.
- Não criar inbox, não rotear para atendente — só fato na timeline.

### Opt-in

- O contrato canônico `v1` ganha `whatsapp_opt_in: boolean | null`. `LeadSubmission.whatsapp_opt_in` preserva a evidência recebida; `Opportunity.whatsapp_opt_in` é o snapshot operacional copiado da submissão que criou/liberou a Oportunidade.
- O disparo automático exige valor `true` para qualquer fonte. Ausente, falso ou ilegível falha fechado e não cria tentativa.
- Conectores apenas traduzem o campo de origem; não inferem consentimento de telefone presente, campanha ou provedor.

### UI

- **Configurações:** seção "Primeiro contato automático" — gatilho, textarea de template, ajuda de variáveis dinâmica por gatilho. Escrita: Gestão e Direção.
- **Integrações > WhatsApp:** conexão e status.
- **Card do lead:** timeline estendida com novos tipos; sem composer de mensagem.

### Contexto de acesso

- Flags resolvidas no `UserContext` / `JobContext` para o worker de canal (ADR-0016).
- `JobContext.origin` usa `channel_outbound` com `attempt_id` no worker e `channel_inbound` com `integration_connection_id` no webhook; ambos constroem contexto depois de resolver o workspace.
- Leitura de timeline de mensagem segue matriz do ADR-0015 (Atendente / Supervisor / Gestão / Direção).

### Mapeamento ADR-0005

Antes da primeira migration desta fase, completar CONTEXT.md e a tabela do ADR-0005 com: opt-in do WhatsApp em `LeadSubmission` e `Opportunity`, `first_contact_template_body`, gatilho, estado de pareamento, tentativa outbound, estados de publicação/entrega, tipos de fato `WHATSAPP_OUTBOUND_SENT | WHATSAPP_OUTBOUND_FAILED | WHATSAPP_INBOUND_RECEIVED`, provedor WhatsMiau e origens `channel_outbound | channel_inbound`.

Antes da migration do outbox, emendar ADR-0016 com as origens de canal e ADR-0019 com `private.claim_pending_channel_attempts`. O Seam 3 passa a esperar sete funções e os mesmos invariantes de executor `NOLOGIN`, retorno mínimo, `search_path` fixado e ausência de PII.

### Engate existente na ingestão

`planOpportunityPostCreationEffects` passa a receber o gatilho resolvido e só produz `AUTO_FIRST_CONTACT` em `ON_ARRIVAL`. O consumidor materializa a tentativa/outbox; não chama Redis diretamente. Não duplicar elegibilidade fora do módulo profundo de planejamento e registro.

### Liberação de quarentena

O handler de release que materializa Oportunidade usa uma operação nomeada de `packages/db` que lê flags/configuração e aplica o mesmo planejador na transação de criação. `apps/web` não importa o catálogo de feature flags para remontar a decisão.

## Testing Decisions

### O que torna um bom teste

Testar **comportamento observável** — o que o usuário e o gestor veriam — não detalhes internos de fila ou ordem de chamadas HTTP, exceto onde a idempotência é o comportamento. Preferir operações nomeadas reais com Postgres e roles do app; mockar **apenas** a porta HTTP do WhatsMiau.

### Costura principal — Seam 4

Fluxo ponta a ponta:

1. Workspace com flag ligada, gatilho `ON_ASSIGNMENT`, instância conectada, template válido, membro com telefone WhatsApp.
2. Lead com telefone na Pessoa.
3. Gestão atribui da fila ao Supervisor — **nenhum** envio enfileirado.
4. Supervisor reatribui ao Atendente — tentativa/outbox nasce no mesmo commit.
5. Dispatcher publica; worker processa com WhatsMiau mockado retornando sucesso.
6. Assert: fato `WHATSAPP_OUTBOUND_SENT` na timeline; `first_contact_at` preenchido; segundo processamento do mesmo job **não** chama `sendText` de novo.
7. Assert de recuperação: queda entre commit e publicação ainda entrega após nova passada do dispatcher.
8. Variantes negativas no mesmo seam: flag off; gatilho `DISABLED`; opt-in ausente/falso; `missing_phone`; instância desconectada; template inválido para gatilho; falha HTTP sem preencher `first_contact_at`.
9. Atribuição em massa cria uma tentativa por Oportunidade elegível; Atividade e WhatsApp concorrentes não sobrescrevem o primeiro `first_contact_at`.

Prior art: `tests/seam2-ingestion.test.ts`, `packages/db/tests/seam-inspection.ts`.

### Seam 1 — domínio puro

Prior art: `packages/domain` tests de feature flags, workspace settings, first-contact-sla.

Cobre: resolução de guards (flag + trigger + elegibilidade); renderização de template e variáveis permitidas por gatilho; recusa de variável proibida; dedupe lógico ("já enviado" impede replanejamento); defaults de configuração.

### Testes de worker / adaptador

Prior art: `apps/worker/src/integration-event-job.test.ts`.

Cobre: consumo de `post_creation_effects` só em `ON_ARRIVAL`; claim e recuperação do outbox antes do HTTP; job com delay/rate limit; 2xx grava `SENT`; qualquer resultado não-2xx/ambíguo depois de iniciar HTTP termina sem segundo `sendText` e sem `first_contact_at`.

### Testes de webhook

Cobre: token inválido → 401 sem fato; eco outbound → ignorado; duplicata de ID externo → um fato; telefone sem Oportunidade ou com match ambíguo → ignorado; inbound preenche `first_contact_at` quando null.

### Seam 3 — RLS

Prior art: `packages/db/tests/rls.test.ts`.

Cobre: settings de template, conexão, fatos de timeline e tentativas isolados por workspace; sétima função privada com retorno mínimo; origem `channel_outbound`; escopo de leitura de timeline por perfil incluindo novos tipos.

### Testes de UI (view-model)

Prior art: `apps/web/lib/leads/timeline-view-model.test.ts`.

Cobre: copy PT-BR para envio, falha definitiva e recebimento; indicador booleano de conexão no card sem segredo; sem expor texto integral de mensagens longas.

### O que não testar nesta fase

- Pareamento QR real contra API WhatsMiau de produção (contrato mockado basta).
- Inbox, mídia, templates Meta aprovados.
- Performance de rate limit em carga — smoke de isolamento entre dois workspaces basta.

## Out of Scope

- **Inbox WhatsApp** e conversa completa no CRM.
- **Mídia** (`sendImage`, áudio, documento) no primeiro contato.
- **Demais superfícies Whatsmiau v2:** `sendMedia`, áudio/PTT, listas, botões, grupos, comunidades, chat/presença, MCP/pool de histórico, `messages.update`, `messages.set` e deleção permanente de instância.
- **LLM** no texto do disparo.
- **Chamadas** / VoIP / Meta Cloud API Calling.
- **API oficial Meta** como adaptador desta fase.
- **Segunda mensagem** automática por lead (reatribuição, follow-up, lembrete).
- **Editor de funis**, ganho/perda, handoff, funil jurídico (Fase 6).
- **Documentos, contratos, assinatura** (Fase 5).
- **Analytics, Ranking, Metas, score** (Fase 7).
- **Telemetria de produto** (PostHog etc.).
- **Billing in-app**.
- **Reimplementar** SLA, estagnação, timeline de movimento/ingestão/atividade (Fase 3).
- **Notificação** específica de falha de WhatsApp; nesta fase a falha fica na timeline + estado da tentativa.
- **Conexões múltiplas por provedor** além da regra "uma instância ativa por workspace" — ticket 19 da fundação permanece paralelo.
- **Variação automática do texto.** O worker envia o template salvo sem mutá-lo; rotação de variantes fica pós-MVP.

## Further Notes

**Por que atribuição ao Atendente e não ao Supervisor.** O ADR-0003 fixa o default na atribuição porque filtra lead ruim, nomeia quem vai atender e só promete quando dá para cumprir. Na operação em dois níveis (Fase 2), o primeiro passo entrega ao Supervisor; disparar ali mandaria mensagem genérica ou sem telefone pessoal — o oposto da promessa. O gatilho correto no default é quando o card chega ao **Atendente**.

**Três relógios ortogonais (CONTEXT).** `first_contact_sla_minutes` mede SLA; `first_contact_trigger` decide **quando** tentar WhatsApp automático; `first_contact_at` registra evidência. Esta fase não mexe no SLA nem confunde gatilho com relógio.

**Timeline "no card" no plano vs Fase 3.** A infraestrutura de timeline operacional já existe. O remanescente desta fase é a **camada de mensagem** — outbound automático e inbound webhook.

**Item aberto A5 fechado nesta spec.** Implementação assume gateway não oficial; se no futuro o provedor for oficial, revisitar default de gatilho e mitigações — não bloqueia o desenho atual da porta injetável. O plano recebe nota de fechamento para não reabrir a decisão.

**Registro da fundação (quarentena).** Quando o consumidor de efeitos pós-criação existir, o release handler da quarentena precisa do mesmo caminho que a ingestão — hoje só o worker de ingestão chama o planejador.

**Matriz ADR-0015.** "Timeline WhatsApp" passa de pendente para entregue nesta fase, com escopo por perfil já definido no ADR.

**Forma do módulo.** Planejar e registrar tentativa é um módulo profundo: os gatilhos de atribuição, chegada e quarentena atravessam a mesma interface; elegibilidade, dedupe e outbox ficam dentro. O adapter WhatsMiau é a única seam externa e é substituído por fake no Seam 4.
