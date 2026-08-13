# Desatrelar é de um workspace; desligar é do quadro

São duas operações. **Desatrelar** tira o colaborador da Equipe daquele workspace — ele deixa de ver aqueles leads e pode continuar em outros. **Desligamento** significa que a pessoa saiu do quadro **daquela Direção**: caem os vínculos ativos em todos os tenants em que o ator é `OWNER`, e o direito de provisionar é revogado. Em ambos os casos o login de auth, as linhas de membro e as Oportunidades **não** são excluídos; leads `OPEN` de cada workspace afetado voltam à fila sem dono daquele tenant; contexto do card e linha do tempo permanecem.

**O alcance do desligamento é o alcance do ator, e não o universo.** A Direção da Hugs desliga a pessoa da Hugs, da ACR e da REAL porque é dona das três. Se essa mesma pessoa for atendente no workspace de outro cliente da marctco, aquele vínculo continua — e deve continuar: a Direção da Hugs não manda no quadro de terceiros. Nenhum texto de produto deve prometer “ela não entra em workspace nenhum”, porque isso é falso e vira premissa de segurança errada. O que se promete é: **ela não entra em nada que seja seu, e não ganha workspace novo.**

**Status:** accepted · 2026-08-12

Emenda [ADR-0021](./0021-dois-caminhos-de-nascimento-login-fechado.md) e a matriz do [ADR-0015](./0015-perfis-de-acesso-e-escopo.md). Cadastrar um e-mail que já é login atrela o mesmo usuário a mais um workspace — não cria segundo auth.

**Considered options (rejeitadas):**

- **Um único “desligar” por workspace.** Confunde demissão com “esta pessoa não atende mais a ACR”. Quem foi desligado do grupo não pode continuar vendo a Hugs.
- **Desligamento pela Gestão.** A Gestão da Hugs não opera a ACR. Tirar a pessoa de todos os tenants é ato da Direção, que é quem pode ser `OWNER` nos dois.
- **Apagar auth, membro ou Oportunidade.** A trilha some, e o login pode ainda ser necessário até o desligamento efetivo.

**Consequences:** cada `WorkspaceMember` tem estado `ACTIVE | DETACHED` ([ADR-0005](./0005-idioma-codigo-en-ui-pt-br.md)). Desatrelar marca `DETACHED` naquele workspace; desligar marca `DETACHED` em cada tenant do ator e revoga o direito de provisionar. Não há terceiro valor “desligado” na linha. `listUserWorkspaces` só devolve vínculo `ACTIVE`. Sem vínculo `ACTIVE` restante e sem direito, a próxima sessão cai na **tela de erro** de conta sem acesso (não numa sala de espera, [ADR-0021](./0021-dois-caminhos-de-nascimento-login-fechado.md)). Leads `WON`/`LOST` não voltam à fila.

Devolver leads à fila é um `UPDATE` em massa e silencioso: quem tinha 200 abertos larga 200 cards sem dono. Como `Activity` e linha do tempo só nascem na Fase 3, a Oportunidade guarda **`previous_assigned_user_id`** — escrito tanto aqui quanto em toda reatribuição — para que “quem trabalhava este lead antes” não desapareça no intervalo entre as duas fases. Notas ainda são Fase 3; a preservação já vale para o card de hoje.
