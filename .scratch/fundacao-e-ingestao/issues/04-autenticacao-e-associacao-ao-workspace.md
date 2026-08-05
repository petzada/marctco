# 04 — Autenticação e associação ao workspace

**Blocked by:** 03

**Status:** ready-for-agent

## What to build

Um membro da assessoria entra no CRM com e-mail e senha e passa a enxergar exclusivamente os dados do seu workspace. Quem pertence a um único workspace entra direto; quem pertence a mais de um (staff da marctco) escolhe.

O ponto crítico: o `app.workspace_id` que alimenta as policies é **sempre validado no servidor** contra `WorkspaceMember`. Mas atenção à distinção que o [ADR-0006](../../../docs/adr/0006-rls-duas-camadas-guc-worker.md) regra 7 faz, porque ela decide se o seletor existe: na **ingestão** o `workspace_id` do corpo é *ignorado*, já que o token diz o tenant; na **sessão do navegador** a escolha *chega* do cliente — não há alternativa em HTTP sem estado — e é *validada*, nunca confiada. Ignorar e validar não são a mesma regra.

Onde a escolha mora é o [ADR-0012](../../../docs/adr/0012-contexto-de-tenant-na-url.md): segmento de URL, não sessão.

## Acceptance criteria

- [ ] Login e logout por Supabase Auth
- [ ] `WorkspaceMember` registra papel: `OWNER`, `ADMIN`, `MANAGER`, `ATTENDANT`, `VIEWER`
- [ ] Toda rota autenticada vive sob `/workspace/:slug`; `slug` é o UUIDv4 do `Workspace`
- [ ] O GUC é resolvido no servidor **a cada requisição**, validando o `slug` da URL contra a associação do usuário
- [ ] `slug` que não corresponde a uma associação do usuário devolve **404** — nunca 403, que confirmaria a existência do workspace alheio
- [ ] Toda tentativa de acessar workspace alheio é **registrada**: usuário legítimo tentando isso é sinal
- [ ] Membro de um único workspace entra direto, sem tela de escolha, redirecionado para o seu `slug`
- [ ] Membro de mais de um vê o seletor de workspace
- [ ] Trocar de workspace navega para outro `slug`; **duas abas em workspaces diferentes mantêm contextos independentes**
- [ ] O browser **não** acessa o Postgres direto: Supabase Auth é autenticação e nada mais
- [ ] **Usuário autenticado sem associação nenhuma vai para o onboarding** (ticket 17) — no fluxo real este é o estado **normal** do primeiro acesso, não um beco sem saída
- [ ] Usuário sem associação e **sem** direito de provisionar não acessa dado de negócio nem provisiona nada
- [ ] Sessão expirada redireciona para o login sem vazar conteúdo
- [ ] `workspace_id` vindo no **corpo** de qualquer requisição é ignorado, não honrado
