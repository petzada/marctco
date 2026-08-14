# Fase 2 — Operação do lead

Fonte: [spec.md](./spec.md). Tickets em [issues/](./issues/). Fase 2 de [docs/plano-de-construcao.md](../../docs/plano-de-construcao.md). Retomada: [PROMPT-HANDOFF.md](./PROMPT-HANDOFF.md) — sem os ADRs 0024–0027 no working tree, o Supervisor volta a ver a fila sem dono.

## O que esta fase abre

O caminho do lead até quem atende, que hoje não existe. A operação é em **dois níveis**: a Gestão abre a fila única de manhã e entrega cada lead ao Supervisor da equipe; o Supervisor reparte entre os atendentes do seu time. Junto vêm a tela Equipe (que faz os papéis existirem), o escopo real do Supervisor, e o quadro de quem atende.

## Ordem e dependências

```
01 ─┐                          (independentes, podem ir juntos)
02 ─┤
03a ┴─┬─ 03b ─┬─ 04            (04 precisa da tela do 03b)
      │       └─ 08            (08 precisa da tela do 03b)
      └─ 05 ──┴─ 06 ── 07
                └─ 09          (09 corrige o conjunto do time de 05/06)
```

**01 a 06 estão implementados e em `main`.** Faltam **07**, **08** e **09** — ver [PROMPT-HANDOFF.md](./PROMPT-HANDOFF.md) para o estado exato.

| Ticket | Depende de | Pode ir em paralelo com |
|---|---|---|
| [01 — Login fechado e workspace adicional](./issues/01-login-fechado-e-workspace-adicional.md) | — | 02, 03a |
| [02 — Campanha e formulário no lead](./issues/02-campanha-e-formulario-no-lead.md) | — | 01, 03a |
| [03a — Equipe: schema, tags e operações](./issues/03a-equipe-schema-tags-e-operacoes.md) | — | 01, 02 |
| [03b — Equipe: tela e convite](./issues/03b-equipe-tela-e-convite.md) | 03a | 05 |
| [04 — Desatrelar e desligar](./issues/04-desatrelar-e-desligar.md) | 03a, 03b | 05 |
| [05 — Escopo real do Supervisor](./issues/05-escopo-real-do-supervisor.md) | 03a | 03b, 04 |
| [06 — Atribuir e reatribuir](./issues/06-atribuir-e-reatribuir.md) | 03a, 05 | — |
| [07 — Kanban Meus leads](./issues/07-kanban-meus-leads.md) | 06 | 08, 09 |
| [08 — Empresa agrupa equipes](./issues/08-empresa-agrupa-equipes.md) | 03a, 03b | 07, 09 |
| [09 — Supervisor não alcança Supervisor](./issues/09-supervisor-nao-alcanca-supervisor.md) | 05, 06 | 07, 08 |

**03a é o gargalo:** cinco dos oito tickets passam por ele. Foi rachado do ticket 03 original justamente por isso — a metade que destrava os outros não precisa esperar pela tela.

Retomada: [PROMPT-HANDOFF.md](./PROMPT-HANDOFF.md). Sem os ADRs 0024–0027 no working tree, o Supervisor volta a ver a fila sem dono.

## Decisões que esta revisão fechou

Registradas nos ADRs (degrau 1 da escada do [AGENTS.md](../../AGENTS.md)), não aqui:

- **Distribuição em dois níveis** e, por consequência, o **Supervisor reatribui dentro do time** — [ADR-0015](../../docs/adr/0015-perfis-de-acesso-e-escopo.md), [ADR-0022](../../docs/adr/0022-workspace-e-fronteira-de-captacao.md). Sem isso o lead trava no Supervisor: `assignLead` exige `IS NULL`.
- **Fila sem dono é da Gestão e da Direção.** Supervisor não vê e não puxa dali — [ADR-0024](../../docs/adr/0024-fila-sem-dono-e-da-gestao.md).
- **Destino da fila é Supervisor com tag ou o próprio ator.** Atendente nunca nasce dono direto — [ADR-0025](../../docs/adr/0025-destino-da-fila-e-supervisor-ou-ator.md).
- **Atribuição em massa:** N linhas, um destino, lote parcial; não rateia — [ADR-0026](../../docs/adr/0026-atribuicao-em-massa.md).
- **Sem papel de plataforma** — [ADR-0027](../../docs/adr/0027-sem-papel-de-plataforma.md).
- **A campanha não roteia o lead.** Quem decide qual equipe atende é a Gestão, por capacidade — não a empresa do grupo que pagou o anúncio. Campanha e formulário se persistem para atribuição de mídia e para discriminar duplicado — [ADR-0022](../../docs/adr/0022-workspace-e-fronteira-de-captacao.md).
- **Gestão e Direção não têm Kanban.** Não atendem: distribuem e acompanham na tabela, com filtro por responsável e por equipe. Honra o §4 do [decisao-features-concorrentes.md](../../decisao-features-concorrentes.md).
- **Sem campo monetário novo.** `amount` adiado para a Fase 7 — item A10 do plano.
- **A idempotência do provisionamento muda de chave**, não desaparece: o lock consultivo passa a comparar o nome do workspace.
- **Sem vínculo e sem direito = tela de erro**, não sala de espera e não redirect mudo — [ADR-0021](../../docs/adr/0021-dois-caminhos-de-nascimento-login-fechado.md).

## Decisões da revisão de 2026-08-14

Nasceram da avaliação de uma orientação externa sobre "business units". Gravadas nos ADRs 0028–0031:

- **Tag é o time**, não "marca ou time", e o conjunto do time **exclui os outros `SUPERVISOR`** — [ADR-0028](../../docs/adr/0028-tag-e-o-time-supervisor-nao-alcanca-supervisor.md). Ticket 09.
- **Empresa do grupo agrupa equipes para leitura:** `Company` + `Tag.company_id`; nunca tenant, escopo, RLS ou coluna da Oportunidade — [ADR-0029](../../docs/adr/0029-empresa-e-agrupamento-de-equipe.md). Ticket 08.
- **Workspace é fronteira do dono;** campanha exclusiva não abre tenant — [ADR-0030](../../docs/adr/0030-workspace-e-fronteira-do-dono.md). Emenda o ADR-0022; nada a implementar.
- **A conexão entra na chave idempotente** e um provedor admite N conexões — [ADR-0031](../../docs/adr/0031-conexao-na-chave-idempotente.md). Fica **fora** desta fase: [ticket 19 da fundação](../fundacao-e-ingestao/issues/19-conexoes-multiplas-por-provedor.md).
- **A quem uma venda "pertence" continua em aberto.** Campanha, quem atendeu, quem fechou e quem contabiliza podem divergir; a forma prevista é snapshot no Ganho, na Fase 6/7 — não nesta.
