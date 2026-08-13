# Workspace é fronteira de captação

O tenant não é “uma assessoria” nem automaticamente “o grupo inteiro”. É a **fila de entrada**: empresas que compartilham campanha (Meta/Google/LP) compartilham o workspace, porque o lead não atravessa tenant; empresas com Pluga ou LP próprios ganham workspace próprio. A mesma Direção pode ser `OWNER` de vários, via seletor. Dentro do workspace compartilhado, tag em membro é a marca/time (Hugs vs REAL); o Supervisor vê a fila sem dono daquele workspace e só atribui a quem compartilha tag com ele.

**Status:** accepted · 2026-08-12

Fecha o recorte do piloto com 4–5 assessorias, campanhas mistas e campanhas separadas. Emenda a leitura estrita do [ADR-0002](./0002-workspace-tags-times.md) (“um workspace por grupo”). Não reabre tag na oportunidade ([ADR-0020](./0020-tag-no-membro-define-o-time.md)): o “este lead é da REAL” é atribuir a um atendente tagueado REAL. `campaign_id` e `form_id` do contrato `v1` aparecem na fila sem dono para o supervisor não separar no escuro.

**Considered options (rejeitadas):**

- **Uma assessoria = um workspace.** A fila misturada cairia num token e o supervisor da outra marca nunca a veria. É o trabalho da assistente de marketing, e o CRM não move Oportunidade entre tenants.
- **Um workspace para o grupo inteiro.** A assessoria com Pluga próprio misturaria de novo o que o anúncio já separou. O unique `(workspace_id, provider)` admite uma Pluga por workspace.
- **Tag na oportunidade para rotear a fila mista.** Dado derivado da atribuição ao membro tagueado, e a Fase 2 não precisa desse write model.

**Consequences:** workspace adicional para um `OWNER` já associado nasce do mesmo caminho de sempre — a marctco marca de novo `can_provision_workspace` + `workspace_name`. O onboarding deixa de recusar provisionamento só porque já existe vínculo: colaborador continua sem o direito, então não provisiona; a Direção com direito novo cria o segundo tenant sem perder o primeiro. Supervisor sem tag não tem time — não atribui. Atendente sem tag não pertence a time nenhum; só Gestão e Direção o alcançam para atribuir.
