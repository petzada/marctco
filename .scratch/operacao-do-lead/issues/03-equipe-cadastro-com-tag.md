# 03 — Equipe: cadastro com tag

**What to build:** A Direção abre Equipe e cadastra colaborador — nome, e-mail, papel, tag no mesmo gesto, telefone WhatsApp opcional. O convite faz nascer login e vínculo juntos, sem direito de provisionar. E-mail que já é login só atrela. Atendente não entra nessa tela.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

## Acceptance criteria

- [ ] Mapeamento do [ADR-0005](../../../docs/adr/0005-idioma-codigo-en-ui-pt-br.md) **antes** da migration: estado do vínculo `ACTIVE | DETACHED` (default `ACTIVE`), `display_name`, `email`, `whatsapp_phone_e164` no membro, `Tag`, `MemberTag`. Tag na oportunidade **não** nasce
- [ ] `resolve_user_workspaces` devolve só vínculo `ACTIVE` — a quarta função da lista fechada ganha o filtro; não nasce sexta ([ADR-0019](../../../docs/adr/0019-resolucao-pre-contexto-e-executor-privado.md), [ADR-0023](../../../docs/adr/0023-desligamento-desativa-o-vinculo.md))
- [ ] Tela Equipe na barra, só para quem a matriz alcança na leitura; a rota recusa Atendente sozinha ([ADR-0015](../../../docs/adr/0015-perfis-de-acesso-e-escopo.md)). Ausência de item não é o controle de acesso
- [ ] Gestão e Direção vêem toda a Equipe ativa deste workspace; Supervisor, neste ticket, ainda vê o quadro inteiro — o recorte de time é o ticket 05, que precisa deste catálogo
- [ ] Cadastro é da **Direção**. Papel oferecido: só Atendente, Supervisor, Gestão — nunca Direção ([ADR-0021](../../../docs/adr/0021-dois-caminhos-de-nascimento-login-fechado.md))
- [ ] Criar tag que ainda não existe e aplicar no membro são o mesmo gesto; várias tags no mesmo membro; sem tela de taxonomia em Configurações ([ADR-0020](../../../docs/adr/0020-tag-no-membro-define-o-time.md))
- [ ] Unicidade de tag por workspace e nome, sem distinguir maiúscula
- [ ] E-mail ainda não é login → convite para definir senha (não há inscrição pública). E-mail já é login → reusa o mesmo usuário, não cria segundo auth
- [ ] Vínculo `DETACHED` no mesmo workspace, ao cadastrar de novo o e-mail, volta a `ACTIVE` com papel e tags novos — não cria segunda linha
- [ ] Colaborador nasce **sem** `can_provision_workspace`
- [ ] Telefone WhatsApp opcional, normalizado pelo mesmo leitor da ingestão; o disparo permanece Fase 4
- [ ] Direção edita papel e tags de membro ativo sem recadastrar
- [ ] Auth Admin fica na rota; a operação nomeada recebe o `user_id` já resolvido. Testes de banco não sobem o Supabase
- [ ] `UserContext` **não** ganha tags. O catálogo existe para o ticket 05 computar o time **dentro** da operação
- [ ] Seam 3: `Tag` e `MemberTag` com RLS habilitada e forçada, policy de isolamento, índice começando por `workspace_id`; nenhum import do client cru
- [ ] UI: tabela no desktop, card empilhado abaixo de 480px; tokens do `DESIGN.md`

## Fora deste ticket

Desatrelar e desligar (ticket 04). Escopo do Supervisor (ticket 05). Atribuição (ticket 06). Disparo WhatsApp.
