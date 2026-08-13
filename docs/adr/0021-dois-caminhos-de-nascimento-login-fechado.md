# Dois caminhos de nascimento; login fechado

Só existem dois jeitos de uma pessoa passar a existir neste produto: a equipe da marctco cria o login e marca o direito de provisionar, ou a Direção cadastra o colaborador na tela Equipe. Workspace só nasce pelo primeiro caminho. Colaborador nasce com o vínculo e nunca provisiona. Quem não veio por nenhum dos dois não entra — não há inscrição, e autenticar sem vínculo nem direito não é uma sessão válida.

**Status:** accepted · 2026-08-12

A invariante do ticket 17 — colaborador nasce com o vínculo — deixa de ser nota de fatia futura e vira regra de acesso. Emenda a tela de espera do onboarding, que tratava login sem associação como sala de espera.

**Considered options (rejeitadas):**

- **Cadastro autônomo, depois a Direção associa.** Exige estado “pendente”, e um login com `can_provision_workspace` pendurado vira dono de um segundo workspace. Já era o risco da re-marcação no piloto.
- **A marctco cria cada atendente no painel do Supabase.** Não escala, e o organograma do cliente mora na operação da marctco.
- **Manter “seu acesso está sendo preparado” como sessão autenticada.** É login bem-sucedido de quem ninguém cadastrou. A espera deixa de ser destino: sem vínculo e sem direito, a sessão não vale.

**Consequences:** inscrição pública desligada. O estado `wait` do onboarding deixa de ser destino de sessão — quem autenticar sem vínculo e sem direito sai para o login. Equipe cria o usuário de auth e o `WorkspaceMember` no mesmo ato, sem `can_provision_workspace`, e o papel oferecido é só `ATTENDANT | SUPERVISOR | MANAGER` — **não cria Direção**. O único `OWNER` de um workspace é o membro que o provisionamento daquele workspace criou. Workspace novo continua nascendo só da marcação da marctco — inclusive o segundo, terceiro, N: a Direção já associada **pode** provisionar de novo quando o direito for marcado outra vez ([ADR-0022](./0022-workspace-e-fronteira-de-captacao.md)). Colaborador nunca tem o direito, então o vínculo que ele já tem não vira um tenant novo.
