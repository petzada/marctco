# Workspace é fronteira de captação

O tenant não é “uma assessoria” nem automaticamente “o grupo inteiro”. É a **fila de entrada**: empresas do mesmo grupo que compartilham campanha (Meta/Google/LP) compartilham o workspace, porque o lead não atravessa tenant; campanha separada, com Pluga ou LP próprios, ganha workspace próprio. A mesma Direção pode ser `OWNER` de vários, via seletor.

O piloto é um grupo: a **Hugs** é a holding, e ACR e REAL são empresas dela. Todas as empresas do grupo compartilham a Direção, e é por isso que compartilhar tenant não vaza nada — o dono é o mesmo. Num workspace compartilhado, os leads de todas as campanhas caem numa **fila única**, e tag em membro é a equipe comercial que vai atendê-los. **Outra assessoria**, no sentido de vazamento, é outro dono — outro workspace. ACR vs REAL no tenant compartilhado não é vazamento; é a fila única.

**A campanha não roteia o lead.** Quem roteia é gente: a Gestão (na prática, o analista de marketing) abre a fila de manhã e entrega cada lead ao Supervisor da equipe que vai trabalhá-lo; o Supervisor repassa ao Atendente do seu time. Qual empresa do grupo pagou aquele anúncio **não** determina qual equipe atende — a Direção distribui pela capacidade e pelo momento da operação, não pela origem da verba.

**Status:** accepted · 2026-08-12

> **Emendado pelo [ADR-0030](./0030-workspace-e-fronteira-do-dono.md):** a fronteira é o **dono**, não a fila de entrada. Campanha exclusiva de sub-empresa **não** abre workspace novo — ela ganha conexão própria dentro do mesmo tenant ([ADR-0031](./0031-conexao-na-chave-idempotente.md)), porque separar tenant custa a detecção de duplicado da mesma pessoa. A objeção abaixo ("o unique `(workspace_id, provider)` admite uma Pluga por workspace") deixou de valer: o unique cai.
>
> **Emendado pelo [ADR-0028](./0028-tag-e-o-time-supervisor-nao-alcanca-supervisor.md):** o time do Supervisor exclui os outros `SUPERVISOR`, então "dono atual e destino compartilham tag com o ator" deixa de alcançar o lead de outro Supervisor.
>
> Permanece inalterado o que mais importa aqui: **a campanha não roteia o lead**, e a distribuição em dois níveis é decisão humana da Gestão.

Fecha o recorte do piloto com o grupo Hugs, campanhas mistas e campanhas separadas. Emenda a leitura estrita do [ADR-0002](./0002-workspace-tags-times.md) (“um workspace por grupo”). Não reabre tag na oportunidade ([ADR-0020](./0020-tag-no-membro-define-o-time.md)): “este lead é da equipe X” é atribuir a um membro tagueado X.

`campaign_id`, `campaign_name`, `form_id` e `form_name` do contrato `v1` são persistidos na Oportunidade — **não para rotear a fila**, e sim porque são a atribuição de mídia (a leitura de ROAS que a Fase 7 vai querer) e porque entram no conjunto de discriminadores de possível duplicado (A2). O payload bruto expira em 90 dias ([ADR-0014](./0014-copia-unica-e-retencao-do-payload.md)): a ingestão é a **única** janela em que esses valores existem para serem gravados.

**Considered options (rejeitadas):**

- **Uma assessoria = um workspace, roteando na ingestão por campanha.** Daria uma fronteira estável (a pessoa jurídica) e exigiria um mapa `(conexão, campanha) → tenant`. Recusada por duas razões: as empresas do grupo têm a **mesma Direção**, então a fronteira jurídica não protege ninguém de ninguém; e o roteamento por campanha presume que a campanha diz qual equipe atende — e não diz. A distribuição é decisão humana da Gestão, tomada de manhã, olhando a fila e a capacidade das equipes.
- **Um workspace para o grupo inteiro.** A empresa com Pluga próprio misturaria de novo o que o anúncio já separou. O unique `(workspace_id, provider)` admite uma Pluga por workspace.
- **Tag na oportunidade para rotear a fila mista.** Dado derivado da atribuição ao membro tagueado, e a Fase 2 não precisa desse write model. O roteamento que existe é a atribuição em si.

**Consequences:** workspace adicional para um `OWNER` já associado nasce do mesmo caminho de sempre — a marctco marca de novo `can_provision_workspace` + `workspace_name`. O onboarding deixa de recusar provisionamento só porque já existe vínculo: colaborador continua sem o direito, então não provisiona; a Direção com direito novo cria o segundo tenant sem perder o primeiro. Supervisor sem tag não tem time — não reatribui. A fila sem dono é da Gestão e da Direção, não do Supervisor ([ADR-0024](./0024-fila-sem-dono-e-da-gestao.md)). Atendente sem tag não pertence a time nenhum; só Gestão e Direção o alcançam para atribuir.

**A distribuição em dois níveis é o requisito operacional desta fase**, e ela exige que o Supervisor **reatribua dentro do time** ([ADR-0015](./0015-perfis-de-acesso-e-escopo.md)): o lead que a Gestão lhe entregou já tem dono, e passá-lo ao Atendente não é atribuir. O Supervisor só reatribui quando o dono atual **e** o destino compartilham tag com ele — não alcança lead de outra equipe. Reatribuir um lead que é do próprio ator dispensa a confirmação que existe para impedir que alguém tome o lead de um colega.
