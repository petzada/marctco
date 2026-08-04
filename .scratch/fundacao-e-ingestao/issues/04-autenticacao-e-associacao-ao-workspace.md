# 04 — Autenticação e associação ao workspace

**Blocked by:** 03

**Status:** ready-for-agent

## What to build

Um membro da assessoria entra no CRM com e-mail e senha e passa a enxergar exclusivamente os dados do seu workspace. Quem pertence a um único workspace entra direto; quem pertence a mais de um (staff da marctco) escolhe.

O ponto crítico: o `app.workspace_id` que alimenta as policies é resolvido **no servidor**, a partir da associação validada em `WorkspaceMember`. Nunca de header, query string, corpo ou qualquer valor que o cliente possa influenciar. O browser não escolhe seu workspace — ele prova quem é e o servidor resolve o resto.

## Acceptance criteria

- [ ] Login e logout por Supabase Auth
- [ ] `WorkspaceMember` registra papel: `OWNER`, `ADMIN`, `MANAGER`, `ATTENDANT`, `VIEWER`
- [ ] O GUC é resolvido no servidor a partir da associação validada
- [ ] Membro de um único workspace entra direto, sem tela de escolha
- [ ] Membro de mais de um vê o seletor de workspace
- [ ] Trocar de workspace no seletor troca o contexto de dados por completo
- [ ] O browser **não** acessa o Postgres direto: Supabase Auth é autenticação e nada mais
- [ ] Usuário autenticado sem associação nenhuma não acessa dado de negócio
- [ ] Sessão expirada redireciona para o login sem vazar conteúdo
- [ ] Tentativa de forçar outro `workspace_id` pela requisição é ignorada, não honrada
