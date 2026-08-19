# Fechamento das Fases 0–2

> Aberto em **2026-08-17**. Não reabre decisão: registra o que já está no código e o que ainda precisa de mão humana antes da Fase 3 (Tempo).
>
> **Supersessão (2026-08-19):** a Fase 3 (Tempo) foi entregue em `039af31`. Spec, tickets e fechamento em [tempo/](./tempo/). Este arquivo permanece o fechamento das Fases 0–2; não use a seção “Como a próxima sessão abre a Fase 3” como estado atual.
>
> Autoridade: [CONTEXT.md](../CONTEXT.md) + ADRs. Specs: [fundacao-e-ingestao](./fundacao-e-ingestao/) · [operacao-do-lead](./operacao-do-lead/) · [tempo](./tempo/). Plano: [docs/plano-de-construcao.md](../docs/plano-de-construcao.md).

## Veredito

| Fase | Código | Tracker | Produção |
|---|---|---|---|
| **0 · Fundação** | Entregue | Tickets `done` | Workspace Hugs + RLS + `/health` (2026-08-12) |
| **1 · Ingestão** | Entregue | 16 `done`; 13 e 14 `needs-info` só no modelo Google | `POST` → Pessoa + Oportunidade + LP própria (2026-08-12) |
| **2 · Operação do lead** | Entregue (01–07) | Tickets fechados nesta sessão | Migrations `20260814*` aplicadas (job Production migration 2026-08-17). Equipe, tag, atribuir e reatribuir conferidos no piloto. Quadro Meus leads do Supervisor: card roteado ao Atendente some do quadro — [PR #47](https://github.com/petzada/marctco/pull/47) |

Nada conhecido de **código** bloqueava a Fase 3 na data deste fechamento. O que bloqueava era documentação que ainda descrevia a Fase 2 como inexistente (risco de reimplementar) e a prova humana em produção da Fase 2. A Fase 3 foi entregue depois — [tempo/PROMPT-HANDOFF.md](./tempo/PROMPT-HANDOFF.md).

## Etapa A — Documentação (esta sessão)

Fechar o tracker e emendar frases de “estado da fundação” para o fato implementado, **sem reabrir ADR**.

1. Tickets da Fase 2 (`01`–`07`): `Status: done`, critérios marcados, evidência de implementação.
2. Specs: `fundacao-e-ingestao/spec.md` e `operacao-do-lead/spec.md` → `done`.
3. Handoff da Fase 2: deixa de mandar o próximo agente implementar do zero.
4. ADRs 0005, 0015, 0016, 0020 e item A1/A2 do plano: a equivalência `SUPERVISOR` = `MANAGER` **terminou**.
5. `AGENTS.md`: aponta as duas fatias e a Fase 3 como próxima.
6. Registro da Fase 2 em [operacao-do-lead/registro.md](./operacao-do-lead/registro.md).

## Etapa B — Ações manuais (juntos)

Não são decisão. São prova e higiene.

1. **Commitar** `CONTEXT.md` e a emenda do [ADR-0022](../docs/adr/0022-workspace-e-fronteira-de-captacao.md) (grelha 2026-08-17: um workspace, uma Pluga, campanhas exclusivas por equipe = prática de mídia, não roteamento). **Feito** em `f0ecdf2` no [PR #47](https://github.com/petzada/marctco/pull/47).
2. **Produção, migrations da Fase 2.** **Feito.** Job [Production migration](https://github.com/petzada/marctco/actions/runs/32033449984) na `main` (2026-08-17): 22 migrations, nenhuma pendente, schema up to date no Supabase remoto (`aws-0-us-west-1.pooler.supabase.com`).
3. **Passada visual no workspace Hugs** (resta o quadro depois do deploy do PR #47):
   - Equipe: cadastrar um colaborador de teste (Supervisor **com tag**) — **feito no piloto**.
   - Leads: atribuir da fila ao Supervisor; Supervisor reatribuir ao Atendente — **feito no piloto**. Lote parcial ainda vale conferir se não rodou.
   - Meus leads: Atendente e Supervisor veem **só o que está atribuído a eles**; depois de rotear ao Atendente, o card some do quadro do Supervisor e permanece na tabela. Gestão/Direção são mandadas para Leads.
   - Supervisor sem tag: telas vazias **explicam** a falta de tag.
4. **Logs Railway** do teste de 2026-08-12 (item 1.3 de [a-fazer-geral.md](./fundacao-e-ingestao/a-fazer-geral.md)) — checkbox de evidência, o fluxo já passou.
5. **Modelo Google Lead Form** — conta Pluga paga; tickets 13/14 permanecem `needs-info`. Não bloqueia Fase 3.
6. **Tamanho das imagens Docker** — quando incomodar. Não bloqueia.

## Etapa C — Fora deste fechamento (não reabrir)

| Item | Onde mora |
|---|---|
| WhatsApp / 1º contato | Fase 4 · [ADR-0003](../docs/adr/0003-whatsapp-instancia-unica-gatilho-atribuicao.md) |
| Activity, SLA, Agenda, dashboard | Fase 3 — **entregue** · [tempo/](./tempo/) |
| Tag na oportunidade | Fora da Fase 2, de propósito · [ADR-0020](../docs/adr/0020-tag-no-membro-define-o-time.md) |
| Campo monetário novo / honorários | A10 · Fase 7 |
| Ganho, perda, handoff, funil jurídico | Fase 6 |
| Conector nativo Meta/Google | A18 · antes de self-serve |
| Teste extra `countLeadsByMarker` para Supervisor | Lacuna de cobertura, não de código; opcional |

## Como a próxima sessão abre a Fase 3

> **Supersessão.** A Fase 3 já foi entregue. Use [tempo/PROMPT-HANDOFF.md](./tempo/PROMPT-HANDOFF.md). A próxima fase de construção é a **4 · Canal**. Os três passos abaixo são o texto original de 2026-08-17; não seguir.

1. Este arquivo + [plano-de-construcao.md](../docs/plano-de-construcao.md) linha **3 · Tempo**.
2. **Não** usar [PROMPT-INICIAL.md](../PROMPT-INICIAL.md) nem o handoff antigo da Fase 2 como estado atual — são históricos da fatia que já fechou.
3. Primeiro passo da Fase 3: spec + tickets em `.scratch/` (ainda não existem). `arrived_at` já está gravado desde a ingestão de propósito.
