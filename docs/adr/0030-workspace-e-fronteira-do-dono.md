# Workspace é fronteira do dono; campanha exclusiva não abre tenant

O tenant é o **dono**. Campanha exclusiva de uma sub-empresa do grupo **não** abre workspace novo: ela ganha conexão de integração própria dentro do mesmo tenant ([ADR-0031](./0031-conexao-na-chave-idempotente.md)). Workspace novo passa a significar outro dono — outro cliente da marctco.

**Status:** accepted · 2026-08-14

**Emenda o [ADR-0022](./0022-workspace-e-fronteira-de-captacao.md)**, que dizia "campanha separada, com Pluga ou LP próprios, ganha workspace próprio" e rejeitava explicitamente "um workspace para o grupo inteiro". A fronteira deixa de ser a fila de entrada e passa a ser o dono — que é o que o [CONTEXT.md](../../CONTEXT.md) já dizia na outra metade do mesmo verbete ("Outro dono é outro workspace — não a pessoa jurídica do grupo").

## O problema

Separar por tenant custa exatamente o que a operação mais precisa, e o custo é invisível até acontecer.

`Person` é por workspace. A mesma pessoa em dois tenants vira **duas Pessoas**: um lead que já está em atendimento na fila do grupo entra pela campanha exclusiva e ninguém descobre. "Possível duplicado" não cruza tenant — e **não pode** cruzar, porque cruzar é furar a premissa do [ADR-0006](./0006-rls-duas-camadas-guc-worker.md). O resultado prático é ligar duas vezes para a mesma pessoa por caminhos diferentes, que é o dano que o mecanismo de duplicidade existe para evitar.

Junto vêm consequências menores mas reais: não há vista consolidada do grupo (nenhuma leitura atravessa tenant, por desenho), a Equipe é cadastrada duas vezes com papel e tags por workspace, e quem trabalha nos dois tem dois "Meus leads" sem soma.

## Por que a objeção do ADR-0022 se dissolve

O ADR-0022 recusou o workspace único com esta frase: *"A empresa com Pluga próprio misturaria de novo o que o anúncio já separou. O unique `(workspace_id, provider)` admite uma Pluga por workspace."*

A segunda sentença deixa de ser verdade com o [ADR-0031](./0031-conexao-na-chave-idempotente.md). Com N conexões por provedor, a campanha exclusiva tem **conexão, token e destino próprios** dentro do mesmo tenant, e a origem continua legível no lead — o anúncio continua separado onde importa, sem separar o cadastro de Pessoa, que é onde a separação machuca.

As duas decisões se sustentam mutuamente. Isoladas, nenhuma das duas fecha: workspace único sem N conexões remistura o que o anúncio separou; N conexões sem workspace único resolve um problema que ninguém teria.

**Considered options (rejeitadas):**

- **Manter o ADR-0022:** campanha exclusiva abre tenant, e a não-detecção de duplicado entre tenants é preço conhecido. Recusada: o preço é pago em ligação repetida para o cliente final, e quem paga não é quem decide.
- **Detecção de duplicado cross-tenant.** Exigiria uma leitura que atravessa workspaces — sexta função `SECURITY DEFINER` ou índice global de contato. Fura a premissa central do [ADR-0006](./0006-rls-duas-camadas-guc-worker.md) para resolver um caso que o tenant único resolve de graça.
- **Critério estreito:** workspace novo só quando a operação inteira é separada (outra equipe, outro funil, outro Pluga). Recusada por não ser critério — é julgamento caso a caso, e o caso limítrofe aparece no cadastro, não na spec.

**Consequences:** o verbete **Workspace** do CONTEXT.md troca "fronteira é a fila de entrada" por "fronteira é o dono". A fila única do tenant continua sendo o que a Gestão abre de manhã, agora com todas as campanhas do grupo, exclusivas inclusive — e a distribuição em dois níveis não muda em nada.

A capacidade de uma mesma Direção ter vários workspaces **permanece no código e não é removida**: o ticket 01 da Fase 2 já a implementou, o provisionamento do tenant N já está fechado contra corrida, e nada disso vira código morto — o caso legítimo continua existindo quando um dono compra operações que não se falam. O que muda é que ela deixa de ser o caminho recomendado para separar campanha.

Isolar outro dono continua sendo tenant (RLS + workspace), e nunca perfil ou empresa ([ADR-0015](./0015-perfis-de-acesso-e-escopo.md), [ADR-0029](./0029-empresa-e-agrupamento-de-equipe.md)).
