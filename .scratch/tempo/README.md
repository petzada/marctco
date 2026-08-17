# Fase 3 — Tempo

Status da fatia: **especificada, não implementada.** Spec em [spec.md](./spec.md), tickets em [issues/](./issues/), todos `ready-for-agent`.

Fase 3 de [docs/plano-de-construcao.md](../../docs/plano-de-construcao.md). Estado de partida: [fechamento das Fases 0–2](../fechamento-fases-0-2.md).

## O que esta fase entrega

O relógio. `arrived_at` está gravado desde a Fase 1 e nenhuma leitura o compara com o presente; a Atividade — que o plano chama de "keystone escondida do MVP" — não existe. Depois desta fase o atendente registra o que faz, a Agenda mostra o dia, o SLA de primeiro contato e a estagnação viram estado visível, o gestor é avisado sem precisar procurar, e o Dashboard responde "o que está queimando agora".

## Ordem e dependências

```
01 ─┬─ 03 ── 04 ─┬─ 05
02 ─┘            │
                 ├─ 07 ─┬─ 08
                 │      └─ 10
                 └─ 09 ─────┘
01 ── 06                     (independente do resto)
```

| Ticket | Depende de | Pode ir em paralelo com |
|---|---|---|
| [01 — Atividade no lead](./issues/01-atividade-no-lead.md) | — | 02 |
| [02 — Configuração de SLA e estagnação](./issues/02-configuracao-de-sla-e-estagnacao.md) | — | 01 |
| [03 — Relógio de primeiro contato e marcador de SLA](./issues/03-relogio-de-primeiro-contato.md) | 01, 02 | 06 |
| [04 — Estagnação, movimento e fatos na linha do tempo](./issues/04-estagnacao-e-fatos-de-movimento.md) | 01, 02, 03 | 06 |
| [05 — Linha do tempo no card](./issues/05-linha-do-tempo-no-card.md) | 04 | 07, 09 |
| [06 — Agenda](./issues/06-agenda.md) | 01 | 02–05 |
| [07 — Dashboard operacional: os números do dia](./issues/07-dashboard-numeros-do-dia.md) | 03, 04 | 05, 09 |
| [08 — Paleta de dataviz e gráficos](./issues/08-paleta-de-dataviz-e-graficos.md) | 07 | 09, 10 |
| [09 — Notificação: model, detecção e varredura](./issues/09-notificacao-deteccao-e-varredura.md) | 03, 04 | 05, 07, 08 |
| [10 — Notificações no Dashboard](./issues/10-notificacoes-no-dashboard.md) | 07, 09 | 08 |

**01 é o gargalo:** oito dos dez tickets passam por ele, direta ou indiretamente. É a Atividade — sem ela não há relógio que pare, não há Agenda e não há o que contar no Dashboard.

**04 depende de 03 por um motivo mecânico, não conceitual:** os dois estendem `markersFor` e a união de tipos do marcador, e em paralelo colidem exatamente ali.

## O que precisa de mão humana antes do código

Duas emendas de ADR, ambas dentro do ticket 09 e ambas **antes** da primeira migration dele:

- **ADR-0019** — a lista fechada de funções `SECURITY DEFINER` vai de cinco para seis. A descoberta "quais workspaces têm lead vencido" acontece antes de existir tenant, como a da expiração de payload.
- **ADR-0016 e CONTEXT.md** — a origem do `JobContext` vira união. Trabalho agendado sem evento de origem existe: a varredura de payload já era esse caso e o contornou com uma âncora que a varredura de SLA não tem como fabricar.

## Decisões que a spec fechou

- **O relógio de SLA para na primeira Atividade concluída**, não na atribuição. Parar na atribuição mede distribuição e chama isso de atendimento — e esconde o lead atribuído e esquecido, que é o gargalo real.
- **Notificação é persistida**, com `read_at` separado de `resolved_at`, e idempotente por constraint.
- **Gráfico entra nesta fase**, e com ele a paleta de dataviz — lacuna declarada do `DESIGN.md` e resto do item A10 do plano.
- **O relógio é corrido**, sem horário comercial. Vira item aberto, com gatilho declarado na spec.
