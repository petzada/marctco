# WhatsApp: instância única por workspace, mensagem única disparada na atribuição

O CRM não é inbox — o cliente piloto não quer. Os atendentes conversam com o lead pelo **próprio WhatsApp pessoal**, fora do CRM. O único papel do WhatsMiau no MVP é disparar **uma** mensagem automática por lead, a partir de **uma instância por workspace** (o número da empresa), e o gatilho padrão é a **atribuição** do lead a um atendente — não a chegada.

**Status:** accepted · 2026-08-04

**Considered options (rejeitadas):** API oficial da Meta (custo e prazo no MVP); plano Custom do WhatsMiau com instância por atendente (custo, pareamento e operação por colaborador); duas mensagens por workspace (chegada + atribuição); nenhuma automação de WhatsApp; inbox nativo.

**Why gatilho na atribuição e não na chegada:**

- **Ban.** Gateway não-oficial disparando para *todo* lead de Meta Lead Ads — inclusive número errado, teste e fake — é o padrão que a Meta bane. O número queimado é o da empresa e a captação inteira do cliente para. Na atribuição, só recebe mensagem o lead que um humano já filtrou.
- **Confiança.** Na chegada a mensagem é obrigatoriamente genérica, porque ninguém foi atribuído ainda; o lead depois recebe um segundo contato de um número desconhecido. Em revisional de juros — vetor notório de golpe — isso mata a conversão. Na atribuição a mensagem nomeia o atendente e o número dele, e o próximo contato passa a ser esperado.
- **Promessa cumprível.** Mensagem na chegada promete um atendimento que a operação ainda não tem como entregar. Se a atribuição demorar horas, queima a primeira impressão e expõe o número. Na atribuição só se promete quando já dá para cumprir.
- **Custo em velocidade é marginal.** Meta via Pluga já chega com 5–15 min de polling; se o gestor atribui em minutos, a perda adicional é pequena.

**Consequences:**

- Gatilho é **configuração de workspace** editável pelo gestor: `ON_ASSIGNMENT | ON_ARRIVAL | DISABLED`, default `ON_ASSIGNMENT` (rótulos PT-BR na tela, valores EN no banco, conforme [ADR-0005](./0005-idioma-codigo-en-ui-pt-br.md)). Não confundir com a feature flag `auto_primeiro_contato`, que é catálogo no código e liberação comercial/técnica.
- `WorkspaceMember` precisa de telefone WhatsApp — o template do gatilho de atribuição cita o número do atendente.
- Variáveis disponíveis no template dependem do gatilho: `ON_ASSIGNMENT` expõe atendente e telefone; `ON_ARRIVAL` não.
- A conversa que fecha o negócio acontece no número pessoal do atendente e é **invisível ao CRM**. O card só registra a mensagem automática. O histórico do atendimento depende de `Atividade` e notas lançadas à mão — é o que torna a Fase 3 (Atividade/SLA) estruturalmente necessária, não opcional.
- Webhook de entrada do WhatsMiau vira apenas linha na timeline do card. Sem UI de inbox.
- Mitigações de ban obrigatórias no worker: opt-in explícito persistido, delay antes do envio e rate limit na fila. Variação automática de texto fica pós-MVP ([.scratch/canal/spec.md](https://github.com/petzada/marctco/blob/docs/arquivo-fases-0-4/.scratch/canal/spec.md)).
- WhatsMiau entra na **Fase 4**, por dependência dura da atribuição (Fase 2). O worker de ingestão (Fase 1) nasce com ponto de engate para efeitos pós-criação da Oportunidade, atrás de flag desligada.
- A caracterização do WhatsMiau como gateway não-oficial é inferida da descrição no repo (instância por workspace, pareamento, `sendText`, contraste explícito com Meta Cloud API). **Confirmar na documentação do provedor antes da Fase 4** — se for API oficial, o argumento de ban perde força e o gatilho de chegada volta a ser defensável como default.

> **Emenda 2026-08-19 (Fase 4, ticket 00).** A spec do Canal fecha o item A5 do [plano de construção](../plano-de-construcao.md): WhatsMiau permanece tratado como **gateway não oficial**; default `ON_ASSIGNMENT`, opt-in explícito, delay e rate limit deste ADR são requisito. A confirmação pendente no parágrafo acima está encerrada. Se o contrato oficial do provedor mudar, a porta de mensageria permite revisitar a premissa sem trocar o domínio — [.scratch/canal/spec.md](https://github.com/petzada/marctco/blob/docs/arquivo-fases-0-4/.scratch/canal/spec.md).
>
> **Composição com o [ADR-0031](./0031-conexao-na-chave-idempotente.md).** “Uma instância por workspace” deste ADR não restaura `UNIQUE(workspace_id, provider)`. Continua valendo N conexões por provedor no geral; WhatsMiau entra por constraint parcial específica (no máximo uma conexão não desligada por workspace).
