# 17 — Provisionamento de workspace no primeiro acesso

**Blocked by:** 03, 04, 05

**Status:** ready-for-agent

## What to build

O caminho pelo qual um workspace passa a existir. A equipe técnica da marctco cria **o usuário** no painel do Supabase e o marca como apto a provisionar; no primeiro acesso desse usuário, o workspace nasce — com o vínculo dele como dono e com funil comercial padrão pronto para receber lead.

Sem este ticket, os tickets 04 e 05 entregam algo que nenhum cliente real consegue exercitar: o 04 assume uma associação que nada cria, e o 05 semeia funil por `prisma db seed`, que é script de desenvolvimento e **não roda quando um cliente cria workspace às três da tarde de uma terça**.

O que acontece com um workspace sem funil não é benigno. O ticket 05 exige exatamente um funil comercial com `is_default` por workspace — um workspace recém-criado nasceria violando o invariante. E o destino da ingestão é justamente o funil `is_default`: chega lead, o worker não acha para onde mandar, o job falha, e o lead fica preso na outbox logo depois de o cliente ter gasto mídia.

Criar `Workspace` e o primeiro `WorkspaceMember` é a **terceira** operação sem contexto de tenant do sistema, ao lado da resolução de token e da descoberta de pendências: não há como setar `SET LOCAL app.workspace_id` para um workspace que ainda não existe. Mesmo remédio das outras duas, e a lista fecha aqui ([ADR-0006](../../../docs/adr/0006-rls-duas-camadas-guc-worker.md) regra 9).

As telas do wizard que coletam dados da empresa **não** estão neste ticket. O que a fatia precisa é que o workspace nasça válido e utilizável.

## Acceptance criteria

- [ ] `private.provision_workspace(...)` `SECURITY DEFINER` em schema privado, com `search_path` fixado e `EXECUTE` revogado de todo papel que não seja o do app
- [ ] **Uma transação só**: `Workspace` (com `slug` UUIDv4) + `WorkspaceMember(OWNER)` + funil comercial `is_default` + suas etapas, incluindo `ENTRY` e `CLOSING`. Ou nasce inteiro e válido, ou não nasce
- [ ] A definição dos funis padrão vem de `packages/domain` (ticket 05) — **uma cópia só**, compartilhada com o `db seed` de desenvolvimento
- [ ] Nenhum estado intermediário é observável: não existe janela em que o workspace exista sem funil padrão
- [ ] O direito de provisionar vem de **`app_metadata`** do usuário, marcado pela equipe técnica ao criar o login
- [ ] **Nunca `user_metadata`** — ele é editável pelo próprio usuário via `supabase.auth.updateUser()` no cliente, e um direito de provisionamento guardado lá é escalação de privilégio de uma linha de JavaScript. `app_metadata` só é gravável por `service_role`
- [ ] Usuário autenticado **sem associação e sem** o direito não provisiona nada e não acessa dado de negócio. É o caso do colaborador cuja associação foi removida: sem essa trava, um ex-funcionário fazendo login viraria dono de um workspace novo em folha
- [ ] Provisionar é idempotente: dois cliques ou duas abas não criam dois workspaces
- [ ] O direito é consumido no provisionamento — provisionar duas vezes exige nova marcação
- [ ] O onboarding vive em `/onboarding`, **fora** do prefixo `/workspace/:slug`, porque ali ainda não existe workspace ([ADR-0012](../../../docs/adr/0012-contexto-de-tenant-na-url.md))
- [ ] Concluído o provisionamento, o usuário é redirecionado para o `slug` recém-criado
- [ ] O Seam 3 continua reprovando qualquer função `SECURITY DEFINER` fora da lista fechada de três
- [ ] **Seam 2**: um usuário apto, ao acessar pela primeira vez, produz workspace utilizável — e um `POST` de lead logo em seguida cai no funil padrão sem nenhuma configuração manual

## Fora deste ticket

Telas do wizard que coletam dados da empresa · cadastro de colaboradores pelo gestor (a fatia opera com o dono provisionado; atribuição é da Fase 2) · cadastro autônomo · cobrança.

Quando o cadastro de colaboradores entrar, vale a invariante que este ticket assume: **colaborador nasce com o vínculo**, e por isso nunca cai no caminho de provisionamento.
