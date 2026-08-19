# Fase 2 fechada — não reimplementar

A Fase 2 (Operação do lead) **já está no código**. Não abra tickets 01–07 de novo, não faça checkout de `docs/grelha-matriz-acesso-0024-0027` como pré-requisito para implementar, e não trate [spec.md](./spec.md) como fila de trabalho.

## O que já foi entregue

Tickets **01–07** implementados: migrations `20260814*`, Equipe, atribuir/reatribuir, escopo do Supervisor, Kanban **Meus leads**.

O [PR #37](https://github.com/petzada/marctco/pull/37) foi a **spec**. A implementação seguiu essa spec.

Os ADRs **0024–0027** estão na árvore e o código os aplica. São autoridade (degrau 1), não um branch pendente.

Registro: [registro.md](./registro.md).

## Próximo

1. [`.scratch/fechamento-fases-0-2.md`](../fechamento-fases-0-2.md) **etapa B item 3** — prova no browser de Meus leads depois do deploy do [PR #47](https://github.com/petzada/marctco/pull/47). Migrations e CONTEXT/ADR-0022 já fechados.
2. Depois: **Fase 3 · Tempo** — **entregue.** Spec e fechamento em [`.scratch/tempo/`](../tempo/). Próxima construção: Fase 4 · Canal no plano.

## Não reabra

Autoridade: `CONTEXT.md` + ADRs 0024–0027.

1. **Fila sem dono = Gestão e Direção.** Supervisor não vê e não atribui dali ([ADR-0024](../../docs/adr/0024-fila-sem-dono-e-da-gestao.md)).
2. **Destino da fila = Supervisor `ACTIVE` com ao menos uma tag, ou o próprio ator.** Atendente nunca nasce dono direto ([ADR-0025](../../docs/adr/0025-destino-da-fila-e-supervisor-ou-ator.md)).
3. **Massa = mesma operação, N linhas, um destino.** Lote **parcial**: quem ainda podia ir, vai; quem já tinha dono recusa pelo nome ([ADR-0026](../../docs/adr/0026-atribuicao-em-massa.md)).
4. **Sem Super Admin** ([ADR-0027](../../docs/adr/0027-sem-papel-de-plataforma.md)).
