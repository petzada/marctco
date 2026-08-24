# Fase 2 fechada — não reimplementar 01–07

A Fase 2 (Operação do lead) **já está no código**. Não abra tickets 01–07 de novo, não faça checkout de `docs/grelha-matriz-acesso-0024-0027` como pré-requisito para implementar, e não trate [spec.md](./spec.md) como fila de trabalho dos tickets entregues.

## O que já foi entregue

Tickets **01–07** implementados: migrations `20260814*`, Equipe, atribuir/reatribuir, escopo do Supervisor, Kanban **Meus leads**.

O [PR #37](https://github.com/petzada/marctco/pull/37) foi a **spec**. A implementação seguiu essa spec.

Os ADRs **0024–0027** estão na árvore e o código os aplica. São autoridade (degrau 1), não um branch pendente.

Registro: [registro.md](./registro.md). Fechamento 0–2: [`.scratch/fechamento-fases-0-2.md`](../fechamento-fases-0-2.md).

## O que a revisão de 2026-08-14 travou (não reabra)

Autoridade: `CONTEXT.md` + ADRs **0028 a 0031**, que emendam 0002, 0007, 0020 e 0022. Nasceram da avaliação de uma orientação externa que propunha "business units" como eixo de tenant e escopo — recusada.

1. **Tag é o time**, não "marca ou time". O conjunto do time **exclui os outros `SUPERVISOR`** ([ADR-0028](https://github.com/petzada/marctco/blob/main/docs/adr/0028-tag-e-o-time-supervisor-nao-alcanca-supervisor.md)). Um Atendente com duas tags continua no time de dois Supervisores — isso é correto e tem teste que o fixa.
2. **Empresa do grupo agrupa equipes, para leitura.** `Company` + `Tag.company_id`. Nunca tenant, nunca escopo, nunca RLS, nunca roteamento, nunca coluna da Oportunidade. O membro **não** carrega empresa ([ADR-0029](https://github.com/petzada/marctco/blob/main/docs/adr/0029-empresa-e-agrupamento-de-equipe.md)).
3. **Workspace é fronteira do dono.** Campanha exclusiva de sub-empresa **não** abre tenant — ganha conexão própria ([ADR-0030](https://github.com/petzada/marctco/blob/main/docs/adr/0030-workspace-e-fronteira-do-dono.md)). Nada a implementar nesta fase; a capacidade de multi-workspace do ticket 01 fica.
4. **A conexão entra na chave idempotente**, e um provedor admite N conexões ([ADR-0031](https://github.com/petzada/marctco/blob/main/docs/adr/0031-conexao-na-chave-idempotente.md)). **Fora desta fase:** [ticket 19 da fundação](https://github.com/petzada/marctco/blob/main/.scratch/fundacao-e-ingestao/issues/19-conexoes-multiplas-por-provedor.md).
5. **A quem uma venda "pertence" continua em aberto.** Campanha, quem atendeu, quem fechou e quem contabiliza podem divergir. A forma prevista é snapshot no Ganho — Fase 6/7, com honorários (item A10). Não antecipe.

Continua valendo, sem reabertura, tudo dos ADRs 0024 a 0027: fila sem dono é da Gestão e da Direção; destino da fila é Supervisor com tag ou o próprio ator; massa é N linhas para um destino, lote parcial, não rateia; sem Super Admin.

## Residual desta fatia (não é reabrir 01–07)

Os tickets **08** e **09** nasceram depois da implementação de 01–07. São trabalho novo, não retrabalho:

- [08 — Empresa agrupa equipes](https://github.com/petzada/marctco/blob/main/.scratch/operacao-do-lead/issues/08-empresa-agrupa-equipes.md) — [ADR-0029](https://github.com/petzada/marctco/blob/main/docs/adr/0029-empresa-e-agrupamento-de-equipe.md). Independente do 09. Fazer **antes** de a Direção criar muitas tags.
- [09 — Supervisor não alcança Supervisor](https://github.com/petzada/marctco/blob/main/.scratch/operacao-do-lead/issues/09-supervisor-nao-alcanca-supervisor.md) — [ADR-0028](https://github.com/petzada/marctco/blob/main/docs/adr/0028-tag-e-o-time-supervisor-nao-alcanca-supervisor.md). Corrige o conjunto do time que o ticket 05 implementou. Fazer **antes** de cadastrar um segundo Supervisor no piloto: com um Supervisor por tag o defeito não se manifesta; com dois, um alcança o lead do outro sem erro nenhum.

A **Fase 3 · Tempo** está **entregue** — spec e fechamento em [`.scratch/tempo/`](../tempo/) — e não espera 08/09. Próxima construção: **Fase 4 · Canal** no [plano de construção](https://github.com/petzada/marctco/blob/main/docs/plano-de-construcao.md).

Prova humana restante da Fase 2: [`.scratch/fechamento-fases-0-2.md`](../fechamento-fases-0-2.md) etapa B item 3 — passada visual de Meus leads depois do [PR #47](https://github.com/petzada/marctco/pull/47).

## Não reabra

Autoridade: `CONTEXT.md` + ADRs 0024–0031.

1. **Fila sem dono = Gestão e Direção.** Supervisor não vê e não atribui dali ([ADR-0024](https://github.com/petzada/marctco/blob/main/docs/adr/0024-fila-sem-dono-e-da-gestao.md)).
2. **Destino da fila = Supervisor `ACTIVE` com ao menos uma tag, ou o próprio ator.** Atendente nunca nasce dono direto ([ADR-0025](https://github.com/petzada/marctco/blob/main/docs/adr/0025-destino-da-fila-e-supervisor-ou-ator.md)).
3. **Massa = mesma operação, N linhas, um destino.** Lote **parcial**: quem ainda podia ir, vai; quem já tinha dono recusa pelo nome ([ADR-0026](https://github.com/petzada/marctco/blob/main/docs/adr/0026-atribuicao-em-massa.md)).
4. **Sem Super Admin** ([ADR-0027](https://github.com/petzada/marctco/blob/main/docs/adr/0027-sem-papel-de-plataforma.md)).
