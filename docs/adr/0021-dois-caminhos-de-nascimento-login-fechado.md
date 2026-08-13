# Dois caminhos de nascimento; login fechado

Só existem dois jeitos de uma pessoa passar a existir neste produto: a equipe da marctco cria o login e marca o direito de provisionar, ou a Direção cadastra o colaborador na tela Equipe. Workspace só nasce pelo primeiro caminho. Colaborador nasce com o vínculo e nunca provisiona. Quem não veio por nenhum dos dois não entra — não há inscrição, e autenticar sem vínculo nem direito não é uma sessão válida.

**Status:** accepted · 2026-08-12

A invariante do ticket 17 — colaborador nasce com o vínculo — deixa de ser nota de fatia futura e vira regra de acesso. Emenda a tela de espera do onboarding, que tratava login sem associação como sala de espera.

**Considered options (rejeitadas):**

- **Cadastro autônomo, depois a Direção associa.** Exige estado “pendente”, e um login com `can_provision_workspace` pendurado vira dono de um segundo workspace. Já era o risco da re-marcação no piloto.
- **A marctco cria cada atendente no painel do Supabase.** Não escala, e o organograma do cliente mora na operação da marctco.
- **Manter “seu acesso está sendo preparado” como sessão autenticada.** É login bem-sucedido de quem ninguém cadastrou, e a promessa é falsa: ninguém está preparando nada. A espera deixa de ser destino.
- **Mandar direto para o login, sem dizer nada.** Foi a primeira redação desta decisão e está errada por um motivo operacional: quem acabou de ser desatrelado do único workspace autentica com a senha certa e é devolvido ao login — e conclui que a senha quebrou. Vira chamado de suporte com diagnóstico errado. Não ter sala de espera não é a mesma coisa que não ter mensagem.

**Consequences:** inscrição pública desligada. O estado `wait` do onboarding deixa de ser sala de espera e vira **tela de erro terminal**: quem autentica sem vínculo ativo e sem direito lê que a conta não tem acesso a nenhum workspace e que quem resolve isso é a Direção da empresa, com o botão de sair. Não promete nada, não recarrega, não fica pendurada — e não devolve a pessoa ao login fingindo que a credencial falhou. Equipe cria o usuário de auth e o `WorkspaceMember` no mesmo ato, sem `can_provision_workspace`, e o papel oferecido é só `ATTENDANT | SUPERVISOR | MANAGER` — **não cria Direção**. O único `OWNER` de um workspace é o membro que o provisionamento daquele workspace criou. Workspace novo continua nascendo só da marcação da marctco — inclusive o segundo, terceiro, N: a Direção já associada **pode** provisionar de novo quando o direito for marcado outra vez ([ADR-0022](./0022-workspace-e-fronteira-de-captacao.md)). Colaborador nunca tem o direito, então o vínculo que ele já tem não vira um tenant novo.
