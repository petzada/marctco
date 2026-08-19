# Cópia única e retenção do payload bruto

O payload cru é guardado **uma vez**, no `IntegrationEvent`. `LeadSubmission` deixa de ter `raw` e passa a apontar para o evento da transmissão mais recente. O conteúdo do payload **expira em 90 dias**; a linha do evento **nunca** é apagada. Evento em quarentena não expira enquanto estiver em quarentena.

**Status:** accepted · 2026-08-05

## Duas cópias, uma verdade

O desenho anterior guardava o mesmo payload em dois lugares:

- **`IntegrationEvent.raw`** — uma linha por requisição HTTP recebida. É a outbox: existe para que erro de programação no conversor não custe o lead, e para reprocessar com o conector corrigido. O glossário lista *"descartar o bruto após processar"* como coisa a evitar.
- **`LeadSubmission.raw`** — uma linha por lead único, que a retransmissão *atualiza*. Ou seja: guarda o payload da **transmissão mais recente daquele lead**.

Mas essa transmissão mais recente já está guardada — é o `IntegrationEvent` mais novo associado àquela submissão. A segunda cópia não é outra verdade; é uma **desnormalização** da primeira.

E ela cobra além do espaço. Existindo duas cópias, existe a pergunta "qual está certa?", e a resposta depende de quem escreveu por último — o tipo de ambiguidade que só aparece no dia do incidente.

Trocá-la por `LeadSubmission.last_integration_event_id` também **barateia a retransmissão**: em vez de reescrever um blob JSON a cada reenvio — o que no Postgres significa versão nova da linha e trabalho de vacuum —, atualiza-se um identificador.

## Por que o payload expira e a linha não

O `raw` tem exatamente três usos, e os três têm meia-vida curta:

1. reprocessar com conector corrigido;
2. diagnosticar na tela de Integrações;
3. recuperar um campo que o mapeamento perdeu, no "completar e liberar" da quarentena.

Ninguém reprocessa daqui a dois anos um lead de hoje. E há uma âncora externa: **a própria Pluga guarda log de eventos por 90 dias** — passado esse prazo, a origem também não tem mais o que devolver. Alinhar a janela ao que a origem oferece evita prometer uma capacidade que o ecossistema não sustenta.

O que **não** expira é o fato. A linha do `IntegrationEvent` permanece para sempre, com origem, instante, estado de despacho, estado de processamento e o que virou. Você continua respondendo "quantos leads entraram em março do ano passado, de qual origem, quantos falharam" — some o conteúdo pessoal, fica a contagem. É a diferença entre esquecer o dado e esquecer que ele existiu.

**Exceção dura:** evento em quarentena **não expira enquanto estiver em quarentena**. É exatamente o payload que o gestor precisa ler para completar e liberar ([ADR-0007](./0007-ingestao-idempotencia.md)); expirá-lo transformaria a quarentena de pendência em buraco definitivo.

A rotina roda na **aplicação**, não em `pg_cron` — o plano do Supabase não o tem, e a decisão de hosting já previa que trabalho agendado mora fora do banco.

**Emenda de 2026-08-11 — em qual processo.** Este ADR dizia "no worker"; ao ser implementada no ticket 15, a rotina ficou no processo **web**, ao lado do dispatcher, pelo mesmo motivo que o ticket 07 encontrou: a descoberta de trabalho sem tenant passa pelo schema `private`, e `marctco_worker` não tem sequer `USAGE` nele ([ADR-0019](./0019-resolucao-pre-contexto-e-executor-privado.md), que vence por ser decisão de isolamento). Levá-la para o worker exigiria uma de duas coisas — conceder àquele papel o acesso privado que o Seam 3 prova que ele não tem, ou rotear manutenção por Redis e fazer a retenção depender de uma fila estar de pé. Nenhuma das duas paga o que custa. O que a decisão sempre significou continua intacto: o agendamento é da aplicação, não do banco.

> **Supersessão 2026-08-19 — origem do `JobContext`.** O ticket 15 abriu a transação da varredura com um evento âncora para caber na forma antiga (`workspace_id` + `integration_event_id`). O [ADR-0016](./0016-contexto-de-acesso-e-leitor-escopado.md) emendado torna a origem uma união: essa passada passa a nomear-se `PAYLOAD_EXPIRY`, sem fabricar causalidade. O retorno `(workspace_id, anchor_integration_event_id)` de `claim_expired_payload_workspaces` permanece até o código da retenção acompanhar o tipo; a sexta função da Fase 3 já nasce sem âncora.

## O número que forçou a decisão

Um cliente com 1.000 leads/dia gera ~365 mil eventos/ano. A ~2 KB de payload, **duas cópias**, isso é da ordem de **1,5 a 2 GB por ano, por cliente**, de JSON que ninguém lê depois da primeira semana. O plano Free do Supabase tem teto de centenas de MB: ele não passa do primeiro trimestre.

Sem esta decisão, o custo de infraestrutura cresce de forma linear e permanente para guardar dado sem consumidor — e o crescimento é invisível até o dia em que a escrita falha.

## Retenção é também o primeiro passo de LGPD

O repositório adiou compliance de LGPD por decisão consciente, mantendo apenas segurança de acesso. **Retenção é um dos princípios que a lei associa ao tratamento**, ao lado de finalidade, minimização e controle de acesso — e o material de pesquisa já apontava isso.

Esta decisão converte um item de compliance adiado indefinidamente numa decisão de schema tomada na hora certa: de graça, porque a tabela seria criada de qualquer jeito, e antes de existir o primeiro dado real. Guardar CPF, telefone e situação financeira **para sempre, sem finalidade declarada** seria a escolha difícil de justificar — não o contrário.

## Considered options

**Manter as duas cópias, sem prazo.** Mais simples hoje e sem teto: cresce para sempre, obriga plano pago só para armazenar JSON morto, e mantém a ambiguidade de qual `raw` vale.

**Apagar o `IntegrationEvent` inteiro após N dias.** Resolve espaço e destrói a contagem histórica — some a resposta para "quantos leads entraram no ano passado", que é justamente a primeira pergunta que o dono da assessoria faz.

**Arquivar o `raw` no Cloudflare R2**, já presente na stack e mais barato por GB. Viável, e cobra 365 mil objetos por ano por cliente mais uma dependência nova no caminho de diagnóstico. Vale reconsiderar **se** algum dia a exigência for guardar payload por anos — hoje não é.

## Consequences

`LeadSubmission` perde `raw` e ganha `last_integration_event_id`. `IntegrationEvent.raw` torna-se anulável.

**Nulo significa expirado, e só isso** — nenhum estado novo é necessário para distinguir. O payload é gravado no ato do recebimento, antes da resposta HTTP: é o que a outbox é. Não existe caminho pelo qual um evento passe a existir sem ele, então a ausência tem uma causa única. E a data em que o conteúdo saiu é derivável de `received_at + 90 dias`, sem coluna adicional — o que permite à tela dizer exatamente quando, em vez de dizer "não disponível".

A tela de Integrações precisa explicar, em linguagem não técnica, que o conteúdo de eventos antigos não fica guardado; e o botão de reprocessar precisa recusar, com explicação, um evento cujo payload expirou.
