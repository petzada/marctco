# 03b — Equipe: tela e convite

**What to build:** A Direção abre Equipe e cadastra colaborador — nome, e-mail, papel, tag no mesmo gesto, telefone WhatsApp opcional. O convite faz nascer login e vínculo juntos. E-mail que já é login só atrela. Atendente não entra nessa tela.

**Blocked by:** 03a — Equipe: schema, tags e operações

**Status:** ready-for-agent

## Acceptance criteria

- [ ] Tela Equipe na barra, só para quem a matriz alcança na leitura; **a rota recusa Atendente sozinha** ([ADR-0015](../../../docs/adr/0015-perfis-de-acesso-e-escopo.md)). Ausência de item não é o controle de acesso — aqui há dado que o Atendente não pode ler, e por isso é recusa de verdade
- [ ] Cadastro é da **Direção**. Papel oferecido no formulário: só Atendente, Supervisor e Gestão — nunca Direção ([ADR-0021](../../../docs/adr/0021-dois-caminhos-de-nascimento-login-fechado.md))
- [ ] A rota fala com a Auth Admin: e-mail ainda não é login → convite para definir senha (não há inscrição pública); e-mail já é login → reusa o mesmo `user_id`, não cria segundo auth. A rota resolve o `user_id` e passa para a operação nomeada do 03a
- [ ] Criar tag que ainda não existe e aplicá-la ao membro são o mesmo gesto na tela; várias tags no mesmo membro; **sem tela de taxonomia em Configurações** ([ADR-0020](../../../docs/adr/0020-tag-no-membro-define-o-time.md))
- [ ] Gestão e Direção vêem toda a Equipe ativa deste workspace
- [ ] Direção edita papel e tags de membro ativo sem recadastrar
- [ ] UI: `{component.data-table}` no desktop, card empilhado abaixo de 480px; tokens do `DESIGN.md`
- [ ] Costura principal: a rota recusa Atendente; o formulário não oferece `OWNER`; cadastrar e-mail já existente não cria segundo auth

## Fora deste ticket

Recorte de time do Supervisor na Equipe (05). Desatrelar e desligar (04) — os botões dessa operação entram na tela que este ticket cria. Atribuição (06).
