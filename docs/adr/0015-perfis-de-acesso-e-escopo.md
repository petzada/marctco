# Perfis de acesso e escopo

Quatro perfis, e nenhum a mais: **Atendente**, **Supervisor**, **Gestão**, **Direção** — `ATTENDANT | SUPERVISOR | MANAGER | OWNER`. O papel entra no **helper de acesso** de `packages/db`, junto com o `workspace_id`, e a fatia de fundação implementa **uma** regra: atendente enxerga apenas oportunidade atribuída a si. As demais entram no mesmo lugar, à medida que as telas existirem.

**Status:** accepted · 2026-08-05

## O problema

`WorkspaceMember.role` existia desde o início, com cinco valores, e a user story dizia por extenso: *"para que as permissões **possam se apoiar** nele"* — futuro. Nenhum ticket lia o campo. Na prática, quem entrasse no workspace faria tudo: qualquer atendente listaria os leads do ano inteiro, editaria CPF de qualquer pessoa, reatribuiria lead de colega e resolveria mesclagem.

Com cinco pessoas isso é arredondamento. Com **sessenta atendentes**, provavelmente distribuídos em filiais, é problema operacional e de proteção de dados ao mesmo tempo — controle de acesso é um dos princípios que a LGPD associa ao tratamento de dado financeiro.

O enum também nunca tinha entrado na tabela de mapeamento do [ADR-0005](./0005-idioma-codigo-en-ui-pt-br.md), que sentencia: model sem linha lá é model com nome improvisado. Era o caso.

## Por que quatro e não cinco

Os cinco valores anteriores — `OWNER | ADMIN | MANAGER | ATTENDANT | VIEWER` — não correspondiam à operação real. `ADMIN` sobrepunha-se a `MANAGER` sem fronteira declarada, e `VIEWER` não tinha consumidor.

**Papel no enum sem escopo definido é papel que alguém atribui para depois descobrir que o comportamento é indefinido** — o mesmo princípio que limita o catálogo de feature flags a três entradas com consumidor conhecido ([ADR-0004](./0004-fronteira-flag-configuracao-estado.md)).

Acrescentar valor a enum depois é aditivo e barato; remover depois, não. Se um dia aparecer o contador ou o parceiro de mídia que só observa, `VIEWER` volta numa migração de uma linha. Começar com quatro é a disciplina de expand/contract do [ADR-0010](./0010-migrations-e-ci-cd.md) aplicada a papéis.

| UI (PT-BR) | Código | Responde por |
|---|---|---|
| Atendente | `ATTENDANT` | Os leads atribuídos a ele |
| Supervisor | `SUPERVISOR` | O time/filial dele |
| Gestão | `MANAGER` | A operação inteira do workspace |
| Direção | `OWNER` | A operação **e** a conta: membros, papéis, integrações |

`OWNER` é o papel que o provisionamento cria — a direção é quem faz o primeiro acesso.

## Escopo por tela

**eu** = apenas o que lhe é atribuído · **time** = escopo do time · **tudo** = workspace inteiro.

| Tela | Fase | Atendente | Supervisor | Gestão | Direção |
|---|---|---|---|---|---|
| Leads (tabela) | 1 | eu | time | tudo | tudo |
| Card do lead — editar | 1 | eu | time | tudo | tudo |
| Resolver identidade / duplicidade | 1 | — | time | tudo | tudo |
| Integrações — histórico, reprocessar, quarentena | 1 | — | — | ✓ | ✓ |
| Integrações — gerar/rotacionar segredo, ativar/desativar | 1 | — | — | — | ✓ |
| Kanban "Meus leads" | 2 | eu | time | tudo | tudo |
| Atribuir · reatribuir | 2 | — | time | tudo | tudo |
| Equipe — ver | 2 | — | time | tudo | tudo |
| Equipe — cadastrar membro, definir papel | 2 | — | — | — | ✓ |
| Agenda e Atividades | 3 | eu | time | tudo | tudo |
| Dashboard operacional | 3 | — | time | tudo | tudo |
| Timeline WhatsApp | 4 | eu | time | tudo | tudo |
| Contratos e Documentos | 5 | eu | time | tudo | tudo |
| Concluir atendimento (`WON`/`LOST` + motivo) | 6 | eu | time | tudo | tudo |
| Acionar handoff ao Jurídico | 6 | — | — | ✓ | ✓ |
| Configurações — SLA, template WA, editor de funis | ∀ | — | — | ✓ | ✓ |
| Analytics > Operação · Ranking | 7 | — | time | tudo | tudo |
| Metas | 7 | — | — | — | ✓ |
| Feature flags | 0 | — | — | — | — |

Três linhas não são arbitrárias:

- **Handoff é da Gestão para cima** porque isso já estava decidido no [ADR-0009](./0009-etapas-editaveis-papeis-e-status.md): o atendente conclui o atendimento, o gestor é notificado e o gestor libera o envio ao Jurídico.
- **O segredo da integração é só da Direção; o histórico e o reprocessamento são da Gestão.** A linha separa credencial de operação: quem toca a operação precisa ver o que falhou e mandar de novo; quem responde pela conta é que rotaciona chave.
- **Feature flag é vazio para os quatro**, ao pé da letra do ADR-0004: a flag é invisível ao cliente — a capacidade existe ou não existe para aquele workspace. Nenhum papel do cliente a enxerga.

## Por que uma regra agora, e não a matriz inteira

A matriz acima é **especificação**, não implementação. A fatia de fundação implementa apenas: `ATTENDANT` enxerga somente oportunidade atribuída a si. Todo o resto continua liberado.

O que precisa nascer com a fatia não é a matriz — é o **ponto único onde ela mora**. A leitura de dados já passa obrigatoriamente pelo helper de transação de `packages/db`, que é o único caminho de acesso a dado; ele recebe o papel junto com o `workspace_id`, e é ali que qualquer regra futura entra.

*Emendado pelo [ADR-0016](./0016-contexto-de-acesso-e-leitor-escopado.md).* Receber o papel não basta — um helper que devolva o client do Prisma torna o `role` um parâmetro inerte, e a frase abaixo ("nenhuma consulta consegue ser escrita sem que o autor decida ali o que aquele papel enxerga") vira intenção em vez de interface. O ponto único só existe de fato se `packages/db` expuser **leituras nomeadas** recebendo `AccessContext`, com o escopo do papel aplicado do lado de dentro e o client cru inacessível de fora.

**Permissão colocada tarde é reescrita de toda consulta.** Se as telas nascem assumindo "vejo tudo", cada `where` precisa ser revisitado depois — e o que escapar não dá erro, dá vazamento interno silencioso, que é o modo de falha mais difícil de detectar por teste. É a mesma lógica de gravar `arrived_at` antes de existir tela de SLA: o que não se reconstrói depois é a disciplina de passar por um lugar só.

**Considered option (rejeitada): matriz completa de quatro papéis × todas as ações, agora.** Semanas de trabalho sobre telas que ainda não existem, e boa parte descartada quando a operação real disser como se organiza.

**Considered option (rejeitada): esconder botão na interface.** O ADR-0004 já sentenciou o equivalente para flags — esconder elemento de interface não é controle de acesso. O guard é do servidor: rota, consulta ou job recusam por conta própria.

## Dependência declarada: Supervisor precisa de tags

"Time/filial" neste produto **são tags** ([ADR-0002](./0002-workspace-tags-times.md)), e a decisão sobre tag em oportunidade segue aberta, prevista para a Fase 2. Enquanto tags não existirem, não há como computar "o time dele".

`SUPERVISOR` **nasce no enum agora**, para não haver migração de papel nem reclassificação de gente depois, e **até a Fase 2 seu escopo efetivo é igual ao de `MANAGER`**. A regra estreita entra junto com tags, no lugar único que este ADR cria.

## Consequences

O enum encolhe de cinco valores para quatro, com `SUPERVISOR` no lugar de `ADMIN` e `VIEWER`. Como não há dado em produção, é uma migração sem expand/contract. O helper de acesso passa a exigir papel além de workspace — mas **exigir o papel não basta para que ele seja usado**, e é por isso que o [ADR-0016](./0016-contexto-de-acesso-e-leitor-escopado.md) fecha o `packages/db` em operações nomeadas: só assim nenhuma consulta consegue ser escrita sem que o autor decida, ali, o que aquele papel enxerga.

**Na fatia de fundação, a regra do `ATTENDANT` não tem quem a exercite, e isso é esperado.** O provisionamento cria um único membro, `OWNER`, e o cadastro de colaboradores fica fora da fatia; atribuição só chega na Fase 2, então `assigned_user_id` é sempre nulo. Um atendente, se existisse, veria uma lista vazia — o que está **correto** e não é defeito. A regra entra agora pelo mesmo motivo que `arrived_at` é gravado antes de existir tela de SLA: o que se paga caro depois não é a regra, é ter construído telas sem o lugar onde ela mora.
