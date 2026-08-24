# 03b — Equipe: tela e convite

**What to build:** A Direção abre Equipe e cadastra colaborador — nome, e-mail, papel, tag no mesmo gesto, telefone WhatsApp opcional. O convite faz nascer login e vínculo juntos. E-mail que já é login só atrela. Atendente não entra nessa tela.

**Blocked by:** 03a — Equipe: schema, tags e operações

**Status:** done

## Acceptance criteria

- [x] Tela Equipe na barra, só para quem a matriz alcança na leitura; **a rota recusa Atendente sozinha** ([ADR-0015](https://github.com/petzada/marctco/blob/main/docs/adr/0015-perfis-de-acesso-e-escopo.md)). Ausência de item não é o controle de acesso — aqui há dado que o Atendente não pode ler, e por isso é recusa de verdade
- [x] Cadastro é da **Direção**. Papel oferecido no formulário: só Atendente, Supervisor e Gestão — nunca Direção ([ADR-0021](https://github.com/petzada/marctco/blob/main/docs/adr/0021-dois-caminhos-de-nascimento-login-fechado.md))
- [x] A rota fala com a Auth Admin: e-mail ainda não é login → convite para definir senha (não há inscrição pública); e-mail já é login → reusa o mesmo `user_id`, não cria segundo auth. A rota resolve o `user_id` e passa para a operação nomeada do 03a
- [x] Criar tag que ainda não existe e aplicá-la ao membro são o mesmo gesto na tela; várias tags no mesmo membro; **sem tela de taxonomia em Configurações** ([ADR-0020](https://github.com/petzada/marctco/blob/main/docs/adr/0020-tag-no-membro-define-o-time.md))
- [x] Gestão e Direção vêem toda a Equipe ativa deste workspace
- [x] Direção edita papel e tags de membro ativo sem recadastrar
- [x] UI: `{component.data-table}` no desktop, card empilhado abaixo de 480px; tokens do `DESIGN.md`
- [x] Costura principal: a rota recusa Atendente; o formulário não oferece `OWNER`; cadastrar e-mail já existente não cria segundo auth

## Implementation evidence

**8 de 8 critérios marcados.** Auditoria em 2026-08-17 sobre o código já entregue — não pelo implementador.

**Como cada critério foi verificado.** Recusa do Atendente e ausência de `OWNER` no formulário estão cobertas por teste. Auth Admin (convite vs reuso de `user_id`), leitura da Equipe e tokens/layout foram conferidos por leitura de código. **Nenhuma verificação em navegador foi feita**: data-table no desktop, card abaixo de 480px e tokens do `DESIGN.md` estão marcados pela conformidade do JSX, não por inspeção da tela renderizada.

**A tela:** `apps/web/app/workspace/[slug]/team/page.tsx` chama `canReadTeam` — Atendente não lê. `apps/web/lib/team-access.ts` expõe `COLLABORATOR_ROLE_OPTIONS` só com Atendente, Supervisor e Gestão; `canManageTeam` é só Direção. `team-view.tsx` usa `{component.data-table}` no desktop e card empilhado; criar tag e aplicá-la são o mesmo gesto, sem tela de taxonomia.

**A rota:** `apps/web/app/workspace/[slug]/team/members/route.ts` resolve o `user_id` via Auth Admin (convite se o e-mail ainda não é login; reuso se já é) e passa para `attachWorkspaceMember`. Recusa Atendente sozinha. `members/route.test.ts` prova a recusa do Atendente e que `OWNER` é rejeitado antes de tocar a Auth Admin. `team-view.test.ts` afirma que o formulário não oferece `value="OWNER"`.

## Fora deste ticket

Recorte de time do Supervisor na Equipe (05). Desatrelar e desligar (04) — os botões dessa operação entram na tela que este ticket cria. Atribuição (06).
