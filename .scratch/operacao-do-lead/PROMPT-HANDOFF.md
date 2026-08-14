/implement Continuar a Fase 2 — Operação do lead — a partir das decisões
travadas em 2026-08-13 (grelha de permissões + auditoria do código).

Este arquivo é o ponto de retomada. **Não comece pela `main` local antiga.**
A sessão que travou a matriz commitou numa branch auxiliar; sem puxá-la, o
próximo agente reimplementa o Supervisor vendo a fila sem dono.

# Antes de qualquer ticket — sincronizar o ambiente local

A continuidade **não** vale se o working tree não tiver os ADRs 0024–0027, o
`CONTEXT.md` emendado e a spec/tickets 05 e 06 reescritos.

No clone/worktree onde a próxima sessão abrir:

```bash
git fetch origin
git checkout docs/grelha-matriz-acesso-0024-0027
# se você já estiver em main (ou em outra branch da Fase 2) com trabalho local:
git merge origin/docs/grelha-matriz-acesso-0024-0027
# para linearizar em cima da auxiliar:
# git rebase origin/docs/grelha-matriz-acesso-0024-0027
```

Nome canônico da branch:

```text
docs/grelha-matriz-acesso-0024-0027
```

Depois do merge/rebase, confirme que existem:

- `docs/adr/0024-fila-sem-dono-e-da-gestao.md`
- `docs/adr/0025-destino-da-fila-e-supervisor-ou-ator.md`
- `docs/adr/0026-atribuicao-em-massa.md`
- `docs/adr/0027-sem-papel-de-plataforma.md`

Se `git log -1 --oneline` na `main` local ainda for o merge do PR #37
(`docs/fase-2-operacao-do-lead`) **sem** esses quatro ADRs, você está no
documento errado. Pare e sincronize.

Abrir PR e mergear esta branch na `main` remota é o jeito de a próxima
máquina clonar certo. Até lá, o fetch da auxiliar é obrigatório.

# Quem é você

Você implementa a Fase 2 contra a spec em `.scratch/operacao-do-lead/`.
Escada: `AGENTS.md` → `CONTEXT.md` → ADRs. **`permissoes.md` na raiz, se
ainda estiver untracked, não é autoridade** — é o checklist genérico que a
grelha recusou (entidade `Team`, convite solto, `can()`, Super Admin, RLS
por papel).

# O que a grelha travou (não reabra)

Autoridade: `CONTEXT.md` + ADRs 0024–0027 (emendam 0015, 0005, 0020, 0022).

1. **Fila sem dono = Gestão e Direção.** Supervisor não vê e não atribui
   dali ([ADR-0024](../../docs/adr/0024-fila-sem-dono-e-da-gestao.md)).
2. **Destino da fila = Supervisor `ACTIVE` com ao menos uma tag, ou o
   próprio ator.** Atendente nunca nasce dono direto
   ([ADR-0025](../../docs/adr/0025-destino-da-fila-e-supervisor-ou-ator.md)).
3. **Massa = mesma operação, N linhas, um destino.** Preferida na manhã.
   Não rateia. Lote **parcial**: quem ainda podia ir, vai; quem já tinha
   dono recusa pelo nome ([ADR-0026](../../docs/adr/0026-atribuicao-em-massa.md)).
4. **Dois isolamentos.** RLS = outro dono / outro workspace. Perfil =
   colega no mesmo tenant, nas operações nomeadas. Sem `can()`, sem
   `Team`, sem policy RLS por papel.
5. **“Outra assessoria” = outro dono.** ACR e REAL no tenant compartilhado
   não são vazamento ([ADR-0022](../../docs/adr/0022-workspace-e-fronteira-de-captacao.md)).
6. **Sem Super Admin** ([ADR-0027](../../docs/adr/0027-sem-papel-de-plataforma.md)).
7. Atendente = só Oportunidade atribuída a ele. Isso o código **já** faz.

# Auditoria do código (fato, 2026-08-13)

Fundação está na `main` (PR #37 é spec da Fase 2, não implementação).

- **Tenant:** RLS + FORCE RLS + `SET LOCAL` + slug validado contra membro.
  Teste: `listLeads` não devolve workspace alheio. Isolamento entre donos:
  **bom**. Sem P0 de vazamento entre clientes.
- **Atendente:** `attendantScopeSql` em `listLeads` / `getLead` /
  `countLeadsByMarker`; recusa `assignLead`, resolver revisão, mesclar.
  Testado. **Certo.**
- **Supervisor em Leads:** vê o tenant inteiro (fila + outros times).
  `attendantScopeSql` só recorta `ATTENDANT`. Comentário em
  `packages/db/src/leads.ts`: *every other role today sees the whole
  workspace*. **P1 — ilegal em relação ao ADR-0024.** Fechar no ticket 05,
  **antes** de cadastrar Supervisor no piloto.
- **Integrações e editor de funil:** Supervisor **já** é recusado (certo).
  O fallback “SUPERVISOR = MANAGER” **não é uniforme**.
- **`assignLead`:** recusa só Atendente; destino = qualquer UUID, sem
  membership, sem tag. Sem route handler na web ainda.
- **Não existem:** `MemberTag`, `WorkspaceMember.status`,
  `previous_assigned_user_id` (a spec da Fase 2 pede; schema da fundação
  ainda não tem), Equipe, `reassignLead`, lote.
- **`service_role`:** só gasta o direito de provisionar em `app_metadata`.

Parecer: arquitetura **aceitável com ajustes**. Pronto para outro cliente
da marctco no eixo tenant; **não** pronto para lotar o piloto de
supervisores.

# Próximos passos (ordem)

Grafo inalterado — [README.md](./README.md):

```
01 ─┐
02 ─┤
03a ┴─┬─ 03b ─┬─ 04
      └─ 05 ──┴─ 06 ── 07
```

1. **01, 02, 03a** podem ir juntos. **03a é o gargalo** (`Tag`,
   `MemberTag`, `ACTIVE|DETACHED`). Sem ele o 05 não computa time.
2. **05** — obrigatório aplicar ADR-0024: Supervisor **não** vê fila sem
   dono; sem tag, tabela vazia (não é consolo). Acabar a equivalência
   Supervisor/Gestão nas leituras de Leads.
3. **06** — `assignLead` / `reassignLead` / lote contra 0024–0026. Não
   copiar o `assignLead` atual.
4. **03b, 04, 07** na ordem do README.
5. **Não** implementar motor de permissão, tabela `teams`, Super Admin,
   nem RLS por papel.

Critérios já reescritos: tickets
[05](./issues/05-escopo-real-do-supervisor.md) e
[06](./issues/06-atribuir-e-reatribuir.md), e [spec.md](./spec.md).

# Skills sugeridas

- `domain-modeling` — se um termo novo aparecer; senão só consumir `CONTEXT.md`.
- `tdd` — operações nomeadas e costura principal.
- `supabase-postgres-best-practices` — **antes** de qualquer migration
  (`Tag`, `MemberTag`, `status`, RLS).
- `code-review` — depois do ticket, contra spec **e** ADRs 0024–0027.
- `design-taste-frontend` / `shadcn` — 03b e 07.

# Leitura obrigatória desta retomada

1. Este arquivo
2. `CONTEXT.md` — **Distribuição do lead**, **Perfil de acesso**, **Workspace**
3. ADRs 0024, 0025, 0026, 0027 (e a emenda no 0015)
4. `.scratch/operacao-do-lead/spec.md` e `README.md`
5. O ticket da vez
