# 04 — Autenticação e associação ao workspace

**Blocked by:** 03

**Status:** done

## What to build

Um membro da assessoria entra no CRM com e-mail e senha e passa a enxergar exclusivamente os dados do seu workspace. Quem pertence a um único workspace entra direto; quem pertence a mais de um (staff da marctco) escolhe.

O ponto crítico: o `app.workspace_id` que alimenta as policies é **sempre validado no servidor** contra `WorkspaceMember`. Mas atenção à distinção que o [ADR-0006](https://github.com/petzada/marctco/blob/main/docs/adr/0006-rls-duas-camadas-guc-worker.md) regra 7 faz, porque ela decide se o seletor existe: na **ingestão** o `workspace_id` do corpo é *ignorado*, já que o token diz o tenant; na **sessão do navegador** a escolha *chega* do cliente — não há alternativa em HTTP sem estado — e é *validada*, nunca confiada. Ignorar e validar não são a mesma regra.

Onde a escolha mora é o [ADR-0012](https://github.com/petzada/marctco/blob/main/docs/adr/0012-contexto-de-tenant-na-url.md): segmento de URL, não sessão.

## Decisão arquitetural vinculante

O [ADR-0019](https://github.com/petzada/marctco/blob/main/docs/adr/0019-resolucao-pre-contexto-e-executor-privado.md) fecha o caminho que esta issue exige: `private.resolve_user_workspaces` é a quarta função sem contexto, de retorno mínimo, e roda com executor técnico `NOLOGIN` sob `FORCE RLS`. `resolveWorkspaceAccess` + `resolveUserContextForSlug` são o único caminho que constrói `UserContext`; autenticam a sessão Supabase no servidor, validam a associação antes do GUC, devolvem 404 uniforme e auditam a recusa como evento estruturado sem PII. Esta nota é decisão de desenho; nenhum critério foi marcado como concluído antes da implementação e das provas.

## Acceptance criteria

- [x] Login e logout por Supabase Auth
- [x] `WorkspaceMember` registra papel: **`ATTENDANT`, `SUPERVISOR`, `MANAGER`, `OWNER`** — quatro, e nenhum a mais. `ADMIN` e `VIEWER` saem: papel no enum sem escopo declarado é papel que alguém atribui para depois descobrir que o comportamento é indefinido ([ADR-0015](https://github.com/petzada/marctco/blob/main/docs/adr/0015-perfis-de-acesso-e-escopo.md))
- [x] Rótulos de UI em PT-BR: Atendente · Supervisor · Gestão · Direção
- [x] Toda rota autenticada vive sob `/workspace/:slug`; `slug` é o UUIDv4 do `Workspace`
- [x] O GUC é resolvido no servidor **a cada requisição**, validando o `slug` da URL contra a associação do usuário
- [x] **Esta validação é o único construtor de `UserContext`** — o contexto nasce dela com `workspace_id`, `user_id` e `role`, e nenhum outro caminho o produz. `React.cache()` deduplica por requisição, que é o escopo seguro ([ADR-0016](https://github.com/petzada/marctco/blob/main/docs/adr/0016-contexto-de-acesso-e-leitor-escopado.md))
- [x] `slug` que não corresponde a uma associação do usuário devolve **404** — nunca 403, que confirmaria a existência do workspace alheio
- [x] Toda tentativa de acessar workspace alheio é **registrada**: usuário legítimo tentando isso é sinal
- [x] Membro de um único workspace entra direto, sem tela de escolha, redirecionado para o seu `slug`
- [x] Membro de mais de um vê o seletor de workspace
- [x] Trocar de workspace navega para outro `slug`; **duas abas em workspaces diferentes mantêm contextos independentes**
- [x] O browser **não** acessa o Postgres direto: Supabase Auth é autenticação e nada mais
- [x] **Usuário autenticado sem associação nenhuma vai para o onboarding** (ticket 17) — no fluxo real este é o estado **normal** do primeiro acesso, não um beco sem saída
- [x] Usuário sem associação e **sem** direito de provisionar não acessa dado de negócio nem provisiona nada
- [x] Sessão expirada redireciona para o login sem vazar conteúdo
- [x] `workspace_id` vindo no **corpo** de qualquer requisição é ignorado, não honrado

## Comments

### Implementação — 2026-08-05

- Adicionado o resolvedor pré-contexto `private.resolve_user_workspaces`, executado pelo papel técnico sem login, e o único construtor público `resolveUserContextForSlug`.
- O acesso de workspace usa identidade Supabase verificada no servidor, `React.cache()` por requisição, 404 uniforme, telemetria estruturada sem PII e limite de tentativas em memória.
- Implementadas telas de login, seleção, onboarding e rotas `/workspace/:slug`, incluindo logout e rótulos PT-BR.
- A suíte cobriu executor/ACL/RLS pré-GUC, resolução de contexto, telemetria e papéis. Validações executadas: `pnpm test:db`, `pnpm test:unit`, `pnpm test:a7`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm db:drift` e `pnpm check:migrations`.
