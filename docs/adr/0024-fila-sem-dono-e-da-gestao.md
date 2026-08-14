# Fila sem dono é da Gestão e da Direção

A fila sem dono do workspace só é visível e atribuível por **Gestão** e **Direção**. O Supervisor alcança o time — quem compartilha tag no membro e as oportunidades atribuídas a eles, inclusive as que estão no próprio Supervisor — e **reatribui** ao Atendente. Não vê o monte sem dono e não puxa dali. Sem isso, um Supervisor esvazia a fila da manhã para o time dele antes da Gestão distribuir, e lead sem dono ainda não é de equipe nenhuma: a regra “não tira lead de outra equipe” não pega.

**Status:** accepted · 2026-08-13

Emenda a matriz do [ADR-0015](./0015-perfis-de-acesso-e-escopo.md), a regra de produto do [ADR-0020](./0020-tag-no-membro-define-o-time.md) e a linha do Supervisor no [ADR-0005](./0005-idioma-codigo-en-ui-pt-br.md). Não reabre a distribuição em dois níveis do [ADR-0022](./0022-workspace-e-fronteira-de-captacao.md): Gestão entrega ao Supervisor; o Supervisor reatribui ao Atendente. O que muda é que o primeiro nível deixa de ser alcançável pelo segundo.

**Considered options (rejeitadas):**

- **Manter o ADR-0015:** Supervisor vê a fila sem dono e atribui para o time. A manhã vira costume. Recusada porque o gesto operacional que se quer proteger é exatamente a Gestão abrir a fila e entregar a cada Supervisor — e self-serve do Supervisor é o jeito de furar isso.
- **Supervisor vê a fila e não atribui.** Visibilidade sem alavanca. Recusada: lead que ainda não é do time não é acompanhamento do Supervisor; é o monte da Gestão.

**Consequences:** `assignLead` recusa `SUPERVISOR` e `ATTENDANT` como atores. Destino da fila é decisão à parte ([ADR-0025](./0025-destino-da-fila-e-supervisor-ou-ator.md)). `reassignLead` continua sendo o que o Supervisor alcança, dentro do time. Supervisor sem tag vê tabela vazia — não ganha a fila sem dono como consolo, e não herda Gestão. A tela vazia continua precisando dizer por quê (falta de tag), senão vira chamado de suporte.
