# 17 — Provisionamento de workspace no primeiro acesso

**Blocked by:** 03, 04, 05

**Status:** done

## What to build

O caminho pelo qual um workspace passa a existir. A equipe técnica da marctco cria **o usuário** no painel do Supabase e o marca como apto a provisionar; no primeiro acesso desse usuário, o workspace nasce — com o vínculo dele como dono e com funil comercial padrão pronto para receber lead.

Sem este ticket, os tickets 04 e 05 entregam algo que nenhum cliente real consegue exercitar: o 04 assume uma associação que nada cria, e o 05 semeia funil por `prisma db seed`, que é script de desenvolvimento e **não roda quando um cliente cria workspace às três da tarde de uma terça**.

O que acontece com um workspace sem funil não é benigno. O ticket 05 exige exatamente um funil comercial com `is_default` por workspace — um workspace recém-criado nasceria violando o invariante. E o destino da ingestão é justamente o funil `is_default`: chega lead, o worker não acha para onde mandar, o job falha, e o lead fica preso na outbox logo depois de o cliente ter gasto mídia.

Criar `Workspace` e o primeiro `WorkspaceMember` é a **terceira** operação sem contexto de tenant do sistema, ao lado da resolução de token e da descoberta de pendências: não há como setar `SET LOCAL app.workspace_id` para um workspace que ainda não existe. Mesmo remédio das outras duas, e a lista fecha aqui ([ADR-0006](../../../docs/adr/0006-rls-duas-camadas-guc-worker.md) regra 9).

As telas do wizard que coletam dados da empresa **não** estão neste ticket. O que a fatia precisa é que o workspace nasça válido e utilizável.

## Acceptance criteria

- [x] `private.provision_workspace(...)` `SECURITY DEFINER` em schema privado, com `search_path` fixado e `EXECUTE` revogado de todo papel que não seja o do app
- [x] **Uma transação só**: `Workspace` (com `slug` UUIDv4) + `WorkspaceMember(OWNER)` + funil comercial `is_default` + suas etapas, incluindo `ENTRY` e `CLOSING`. Ou nasce inteiro e válido, ou não nasce
- [x] A definição dos funis padrão vem de `packages/domain` (ticket 05) — **uma cópia só**, compartilhada com o `db seed` de desenvolvimento
- [x] Nenhum estado intermediário é observável: não existe janela em que o workspace exista sem funil padrão
- [x] O direito de provisionar vem de **`app_metadata`** do usuário, marcado pela equipe técnica ao criar o login
- [x] **Nunca `user_metadata`** — ele é editável pelo próprio usuário via `supabase.auth.updateUser()` no cliente, e um direito de provisionamento guardado lá é escalação de privilégio de uma linha de JavaScript. `app_metadata` só é gravável por `service_role`
- [x] Usuário autenticado **sem associação e sem** o direito não provisiona nada e não acessa dado de negócio. É o caso do colaborador cuja associação foi removida: sem essa trava, um ex-funcionário fazendo login viraria dono de um workspace novo em folha
- [x] Provisionar é idempotente: dois cliques ou duas abas não criam dois workspaces
- [x] O direito é consumido no provisionamento — provisionar duas vezes exige nova marcação
- [x] O onboarding vive em `/onboarding`, **fora** do prefixo `/workspace/:slug`, porque ali ainda não existe workspace ([ADR-0012](../../../docs/adr/0012-contexto-de-tenant-na-url.md))
- [x] Concluído o provisionamento, o usuário é redirecionado para o `slug` recém-criado
- [x] O Seam 3 continua reprovando qualquer função `SECURITY DEFINER` fora da lista fechada de três
- [ ] **Seam 2**: um usuário apto, ao acessar pela primeira vez, produz workspace utilizável — e um `POST` de lead logo em seguida cai no funil padrão sem nenhuma configuração manual

## Comments

**2026-08-06 — implementado.** Migration `20260806000100_provision_workspace`, executor técnico próprio `marctco_provisioner` (o `marctco_private_definer` é dono dos dois resolvedores somente-leitura e não pode ganhar `INSERT` em `workspaces`), `provisionWorkspace` em `packages/db`, `/onboarding` + `POST /onboarding/provision` em `apps/web`. Detalhes e evidência de testes no `registro.md`.

**Sobre a lista fechada:** o critério fala em três funções `SECURITY DEFINER` porque antecede o [ADR-0019](../../../docs/adr/0019-resolucao-pre-contexto-e-executor-privado.md), que fixou a lista em **quatro**. O Seam 3 aceita exatamente essas quatro e reprova qualquer outra, overload incluso — é a mesma trava, com o número atualizado.

**Seam 2 fica desmarcado:** a metade do banco está provada — o workspace nasce com exatamente um funil comercial `is_default`, com `ENTRY` e `CLOSING`, num commit só — mas o `POST` de lead só existe a partir do ticket 07. Marcar antes disso seria marcar o que não rodou.

**O nome da assessoria vem da marcação**, em `app_metadata.workspace_name`, não de uma tela que o colete: as telas do wizard estão fora deste ticket. Marcação sem nome não concede direito nenhum, e o usuário continua vendo "seu acesso está sendo preparado".

**Mão humana antes do release:** `marctco_provisioner` precisa ser criado e concedido ao migrator no Supabase antes do merge — ver `acoes-manuais-pendentes.md`.

## Fora deste ticket

Telas do wizard que coletam dados da empresa · cadastro de colaboradores pelo gestor (a fatia opera com o dono provisionado; atribuição é da Fase 2) · cadastro autônomo · cobrança.

Quando o cadastro de colaboradores entrar, vale a invariante que este ticket assume: **colaborador nasce com o vínculo**, e por isso nunca cai no caminho de provisionamento.
