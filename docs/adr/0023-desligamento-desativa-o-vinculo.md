# Desatrelar é de um workspace; desligar é do quadro

São duas operações. **Desatrelar** tira o colaborador da Equipe daquele workspace — ele deixa de ver aqueles leads e pode continuar em outros. **Desligamento** significa que a pessoa saiu do quadro: todos os vínculos ativos caem, em todas as Equipes, e ela não entra em nenhum workspace. Em ambos os casos o login de auth, as linhas de membro e as Oportunidades **não** são excluídos; leads `OPEN` de cada workspace afetado voltam à fila sem dono daquele tenant; contexto do card e linha do tempo permanecem.

**Status:** accepted · 2026-08-12

Emenda [ADR-0021](./0021-dois-caminhos-de-nascimento-login-fechado.md) e a matriz do [ADR-0015](./0015-perfis-de-acesso-e-escopo.md). Cadastrar um e-mail que já é login atrela o mesmo usuário a mais um workspace — não cria segundo auth.

**Considered options (rejeitadas):**

- **Um único “desligar” por workspace.** Confunde demissão com “esta pessoa não atende mais a ACR”. Quem foi desligado do quadro não pode continuar vendo a Hugs.
- **Desligamento pela Gestão.** A Gestão da Hugs não opera a ACR. Tirar a pessoa de todos os tenants é ato da Direção, que é quem pode ser `OWNER` nos dois.
- **Apagar auth, membro ou Oportunidade.** A trilha some, e o login pode ainda ser necessário até o desligamento efetivo.

**Consequences:** cada `WorkspaceMember` tem estado `ACTIVE | DETACHED` ([ADR-0005](./0005-idioma-codigo-en-ui-pt-br.md)). Desatrelar marca `DETACHED` naquele workspace; desligar marca `DETACHED` em todos e tira o direito de provisionar. Não há terceiro valor “desligado” na linha. `listUserWorkspaces` só devolve vínculo `ACTIVE`. Desligamento sem direito de provisionar = nenhuma sessão. Leads `WON`/`LOST` não voltam à fila. Notas ainda são Fase 3; a preservação já vale para o card de hoje.
