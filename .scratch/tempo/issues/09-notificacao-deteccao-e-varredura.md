# 09 — Notificação: model, detecção e varredura agendada

**Status:** ready-for-agent

**Blocked by:** 03 (estado de SLA), 04 (estado de estagnação)

**What to build:** o gestor deixa de precisar olhar a tabela para descobrir que um lead estourou. Uma varredura agendada percorre os tenants, detecta os leads que passaram do SLA de primeiro contato ou do limite de estagnação, e persiste **uma** notificação por lead e por tipo. Quando a causa acaba — primeiro contato feito, lead voltou a se mover, foi ganho, perdido ou mesclado —, a notificação se resolve sozinha na passada seguinte.

Este ticket entrega o model, a detecção e a varredura, verificáveis por teste e por log. A superfície onde o gestor as lê é o ticket 10.

**A varredura segue o padrão que a Fase 1 já estabeleceu para a expiração de payload:** roda no processo web, em intervalo com guarda contra passada sobreposta, **não depende do Redis**, e a falha de um workspace registra log e não interrompe os outros. Intervalo padrão de 5 minutos — o SLA é medido em minutos, não em dias.

## Duas emendas de ADR, antes da migration

Nenhuma das duas é reabertura de decisão, e fazê-las **depois** significa reescrever teste de Seam 3 e tipo de contexto com código em cima.

1. **Sexta função privada** — [ADR-0019](../../../docs/adr/0019-resolucao-pre-contexto-e-executor-privado.md). Descobrir "quais workspaces têm lead vencido" acontece antes de existir tenant, exatamente como a função que o ticket 15 da Fase 1 criou para a expiração de payload. A lista fechada passa de cinco para seis nomes. *Alternativa rejeitada:* esticar a função de payload para responder também isto — ela é nomeada e indexada para outra pergunta, e as duas varreduras têm cadências separadas por natureza (90 dias contra 5 minutos).

2. **Origem do `JobContext`** — [ADR-0016](../../../docs/adr/0016-contexto-de-acesso-e-leitor-escopado.md) e [CONTEXT.md](../../../CONTEXT.md). Hoje o contexto do job carrega *"workspace e o evento que o originou"*, e a varredura de payload contornou isso com um evento âncora. **A varredura de SLA não tem âncora possível:** um lead liberado da quarentena não tem evento de integração para apontar. A origem vira união — evento de integração **ou** passada agendada nomeada. *Alternativa rejeitada:* âncora falsa apontando para um evento qualquer do workspace, que grava no banco uma causalidade que não existe e envenena qualquer auditoria futura.

- [ ] `Notification` existe com verbete novo no `CONTEXT.md` e linha nova no mapeamento do [ADR-0005](../../../docs/adr/0005-idioma-codigo-en-ui-pt-br.md), escritos **antes** da migration
- [ ] `NotificationType` é `FIRST_CONTACT_SLA_BREACHED | STAGNANT` — nome genérico de propósito, porque a Fase 6 acrescenta o aviso de atendimento concluído no mesmo model
- [ ] `UNIQUE(workspace_id, opportunity_id, type)`: é a constraint que faz a varredura ser idempotente, e não um `SELECT` que veio antes — mesma disciplina do [ADR-0007](../../../docs/adr/0007-ingestao-idempotencia.md)
- [ ] A segunda passada **não** cria segunda linha: atualiza `last_detected_at` por `ON CONFLICT ... DO UPDATE`
- [ ] Sem coluna de destinatário e sem estado de leitura por usuário — quem enxerga é decidido pelo escopo de perfil da operação nomeada, como todo o resto do sistema
- [ ] `resolved_at` é escrito quando a causa acaba; `read_at`/`read_by_user_id` são de quem marcou. **Marcar como lida não resolve, e resolver não exige leitura**
- [ ] Índice parcial `(workspace_id, detected_at DESC) WHERE resolved_at IS NULL`
- [ ] A ADR-0019 é emendada e o Seam 3 passa a esperar **seis** nomes, continuando a reprovar o sétimo; a função nova tem executor `NOLOGIN`, `search_path` fixado e grants mínimos
- [ ] O `JobContext` aceita origem de passada agendada, com o `CONTEXT.md` e o ADR-0016 emendados
- [ ] A varredura escreve sob isolamento de tenant como qualquer outra escrita — **sem bypass de RLS**
- [ ] A varredura roda com o Redis fora
- [ ] A falha de um workspace registra log e não interrompe a passada dos outros
- [ ] Intervalo configurável por variável de ambiente, com piso validado e recusa de valor inválido na configuração
- [ ] A detecção usa as **mesmas** funções puras dos tickets 03 e 04 — tela e alerta não podem discordar
- [ ] Mudar o SLA em Configurações reavalia os leads em aberto na passada seguinte, e não só os que chegarem depois
- [ ] Seam 3 verde: `notifications` sob as varreduras de RLS, policy e índice, e nenhum registro ativo apontando para registro mesclado
