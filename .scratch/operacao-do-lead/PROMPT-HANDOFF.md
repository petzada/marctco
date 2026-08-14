/implement Continuar a Fase 2 — Operação do lead — a partir dos tickets 07, 08
e 09. Os tickets 01 a 06 estão implementados e verdes.

Este arquivo é o ponto de retomada, reescrito em 2026-08-14. Substitui a versão
que descrevia o estado **anterior** à implementação (auditoria de 2026-08-13,
"não existem `MemberTag`, `WorkspaceMember.status`, Equipe, `reassignLead`") —
tudo aquilo existe agora.

# Estado real (2026-08-14)

**Implementado, em `main`, com os gates verdes:**

| Ticket | O que entregou |
|---|---|
| 01 | Login fechado; workspace adicional para a mesma Direção; tela `/access` para conta sem vínculo |
| 02 | `campaign_id` / `campaign_name` / `form_id` / `form_name` persistidos na ingestão |
| 03a | `Tag`, `MemberTag`, `WorkspaceMember.status`, `display_name`, `email`, `whatsapp_phone_e164`; `attachWorkspaceMember`, `listTeam` |
| 03b | Tela Equipe, convite via Auth Admin, criação de tag no mesmo gesto |
| 04 | `detachWorkspaceMember`, `terminateWorkspaceMember`, devolução de `OPEN` à fila, `previous_assigned_user_id` |
| 05 | Escopo real do Supervisor: time por tag compartilhada, fim da equivalência com `MANAGER`, fila sem dono fora do escopo, estado vazio explicando a falta de tag |
| 06 | `assignLead` / `assignLeads` / `reassignLead` / `reassignLeads`, lote parcial, `listLeadAssignmentDestinations`, filtro por responsável e equipe |

**Não implementado:**

- **07 — Kanban Meus leads.** Não foi começado. Não existe rota `my-leads`, não
  existe `moveLeadStage`, `@dnd-kit` não está instalado e a barra lateral não
  tem o item. **Nada pela metade** — não há rota órfã nem link quebrado.
- **08 — Empresa agrupa equipes.** Nasce da revisão de 2026-08-14.
- **09 — Supervisor não alcança Supervisor.** Idem. Corrige o conjunto do time
  que o ticket 05 implementou.

# O que a revisão de 2026-08-14 travou (não reabra)

Autoridade: `CONTEXT.md` + ADRs **0028 a 0031**, que emendam 0002, 0007, 0020 e
0022. Nasceram da avaliação de uma orientação externa que propunha "business
units" como eixo de tenant e escopo — recusada.

1. **Tag é o time**, não "marca ou time". O conjunto do time **exclui os outros
   `SUPERVISOR`** ([ADR-0028](../../docs/adr/0028-tag-e-o-time-supervisor-nao-alcanca-supervisor.md)).
   Um Atendente com duas tags continua no time de dois Supervisores — isso é
   correto e tem teste que o fixa.
2. **Empresa do grupo agrupa equipes, para leitura.** `Company` +
   `Tag.company_id`. Nunca tenant, nunca escopo, nunca RLS, nunca roteamento,
   nunca coluna da Oportunidade. O membro **não** carrega empresa
   ([ADR-0029](../../docs/adr/0029-empresa-e-agrupamento-de-equipe.md)).
3. **Workspace é fronteira do dono.** Campanha exclusiva de sub-empresa **não**
   abre tenant — ganha conexão própria
   ([ADR-0030](../../docs/adr/0030-workspace-e-fronteira-do-dono.md)). Nada a
   implementar nesta fase; a capacidade de multi-workspace do ticket 01 fica.
4. **A conexão entra na chave idempotente**, e um provedor admite N conexões
   ([ADR-0031](../../docs/adr/0031-conexao-na-chave-idempotente.md)). **Fora
   desta fase:** [ticket 19 da fundação](../fundacao-e-ingestao/issues/19-conexoes-multiplas-por-provedor.md).
5. **A quem uma venda "pertence" continua em aberto.** Campanha, quem atendeu,
   quem fechou e quem contabiliza podem divergir. A forma prevista é snapshot no
   Ganho — Fase 6/7, com honorários (item A10). Não antecipe.

Continua valendo, sem reabertura, tudo dos ADRs 0024 a 0027: fila sem dono é da
Gestão e da Direção; destino da fila é Supervisor com tag ou o próprio ator;
massa é N linhas para um destino, lote parcial, não rateia; sem Super Admin.

# Ordem sugerida

```
07 (Kanban)    — independente, fecha a fase como planejada
08 (Empresa)   — independente de 07 e 09
09 (Supervisor)— corrige o time de 05/06; não depende de 07 nem 08
```

**09 antes de cadastrar um segundo Supervisor no piloto.** Enquanto houver um
Supervisor por tag, o defeito não se manifesta; com dois, um alcança o lead do
outro sem erro nenhum.

**08 antes de a Direção criar muitas tags.** Classificar depois é trabalho
manual sobre rótulos em uso.

# Gates

```bash
set -a; . ./.env; set +a          # o .env não entra sozinho no processo
pnpm typecheck && pnpm lint && pnpm test:unit
pnpm check:migrations && pnpm db:drift && pnpm test:db
REDIS_URL=redis://localhost:6380 pnpm test:seam2   # ver nota abaixo
pnpm test:a7 && pnpm test:managed-migration
```

**Portas do compose não sobem nesta máquina.** O Windows bloqueia 63799
(`bind: ... proibida pelas permissões de acesso`), então o Redis do
`docker-compose.yml` não inicia. Contorno em uso: container avulso
`marctco-seam2-redis` em **6380**, com `REDIS_URL` sobrescrito. O Postgres de
`localhost:54329` é o container da worktree 01, servindo o banco `marctco`. Em
CI nada disso se aplica — os serviços são do workflow.

Antes de julgar um gate vermelho, rode o mesmo gate na `main`. Se falhar nos
dois, é ambiente.

# Armadilha já paga (não repita)

A migration do ticket 03a nomeou as FKs de `member_tags` como
`member_tags_member_fkey` / `member_tags_tag_fkey`. O resto do repo usa a
derivação do Prisma (`<tabela>_<colunas>_fkey`), então o `pnpm db:drift`
reprovava e o CI reprovaria junto. Corrigido em 2026-08-14, na própria migration
(ainda não deployada). **Toda FK nova segue a derivação do Prisma.**

# Skills sugeridas

- `supabase-postgres-best-practices` — **antes** da migration do ticket 08.
- `tdd` — operações nomeadas e costura principal.
- `design-taste-frontend` / `shadcn` — ticket 07.
- `code-review` — depois do ticket, contra spec **e** ADRs 0024–0031.

# Leitura obrigatória desta retomada

1. Este arquivo
2. `CONTEXT.md` — **Perfil de acesso**, **Tag**, **Empresa**, **Workspace**, **Distribuição do lead**
3. ADRs 0028, 0029, 0030, 0031 (e as emendas em 0002, 0007, 0020, 0022)
4. `.scratch/operacao-do-lead/spec.md` e `README.md`
5. O ticket da vez
