# 18 — Conexão de landing page com segredo próprio

**Blocked by:** 06, 13, 14

**Status:** done

## What to build

A superfície que faltava para a conexão `LANDING_PAGE` nascer.

A auditoria de 2026-08-12 encontrou a lacuna registrada como item 3 de
[a-fazer-geral.md](../a-fazer-geral.md): a tela de landing page instruía o
usuário a *"usar o token exclusivo da conexão de landing page"*, e nenhuma
rota do produto sabia emitir esse token. A única que criava ou rotacionava
segredo era a da Pluga, com `const PROVIDER = "PLUGA"` fixo no arquivo.

Nada faltava na fundação. `IntegrationProvider` já tinha `LANDING_PAGE`, o
unique já era `@@unique([workspace_id, provider])`, e
`createIntegrationConnection` / `rotateIntegrationConnectionSecret` /
`setIntegrationConnectionStatus` já recebiam `provider` como parâmetro. Faltava
a tela e as duas rotas — e a razão de terem faltado é que a rota da Pluga foi
escrita como arquivo único em vez de como caminho parametrizado, então a
segunda origem só existiria se alguém copiasse o arquivo e lembrasse de trocar
a constante.

Consequência prática antes deste ticket: um cliente com landing page própria
só conseguia enviar lead usando o token da Pluga. Funcionava — o endpoint é
provider-agnóstico —, mas misturava as duas origens numa credencial só:
rotacionar por causa da Pluga derrubava a landing page, e desativar uma
desativava a outra.

## Decisões tomadas antes de codar

Duas perguntas estavam abertas no item 3 e foram decididas:

1. **A tela de LP ganha painel próprio**, em vez de uma tela de Integrações
   única listando as duas conexões. O menu já tinha as duas entradas; uma tela
   índice mexeria na navegação, na tela inicial do workspace e nos links já
   entregues pelo ticket 14, sem resolver nada que o painel próprio não
   resolva.
2. **Sem histórico por conexão.** O histórico continua na tela da Pluga,
   listando os eventos do workspace inteiro — inclusive os de LP. Está fora do
   escopo deste ticket e permanece registrado como possível melhoria.

## Acceptance criteria

- [x] A Direção consegue **gerar** o segredo da conexão de landing page pela
      tela de LP, e ele aparece em claro exatamente uma vez
- [x] Consegue **rotacionar** e **ativar/desativar** essa conexão pela mesma tela
- [x] As ações agem sobre `LANDING_PAGE` e **nunca** sobre `PLUGA`: rotacionar
      o segredo da LP não derruba a Pluga, e desativar uma não desativa a outra
- [x] Gestão abre a tela de LP mas **não** vê o painel — vê a nota de que a
      credencial é da Direção ([ADR-0015](../../../docs/adr/0015-perfis-de-acesso-e-escopo.md))
- [x] Atendente e Supervisor continuam recebendo 404 na tela e 403 nas rotas
- [x] O segredo em claro não passa por redirect nem por URL, e não entra na
      linha de log ([ADR-0013](../../../docs/adr/0013-fluxo-de-dados-no-app.md))
- [x] Gerar duas vezes para o mesmo provider responde 409 em vez de criar uma
      segunda credencial
- [x] O texto da tela deixa de prometer um token que não existia e passa a
      apontar para o painel, dizendo por que cada origem tem o seu
- [x] A tela da Pluga continua funcionando exatamente como antes

## Evidence

- `apps/web/lib/integration-surfaces.ts` é o único lugar que liga segmento de
  URL a provider. `PLUGA_SURFACE` e `LANDING_PAGE_SURFACE` carregam também o
  endpoint de ingestão e a cópia que difere entre as telas, para que o painel
  continue sendo um componente só.
- `apps/web/lib/integration-secret-route.ts` produz os dois handlers a partir
  de uma surface. As quatro rotas
  (`integrations/{pluga,landing-page}/{secret,status}`) passaram a ser seis
  linhas cada, chamando a fábrica — não há mais um arquivo onde esquecer a
  constante.
- `apps/web/components/integrations/integration-secret-panel.tsx` é o antigo
  `PlugaSecretPanel` parametrizado por surface; `copy-block.tsx` mudou de lugar
  junto, porque agora serve as duas telas. Comportamento do painel inalterado.
- `canOpenPlugaScreen` virou `canOpenIntegrationScreen`: a mesma regra passou a
  guardar duas telas, e o nome antigo mentia sobre isso.
- A atribuição do evento à conexão certa não precisou mudar:
  `recordIntegrationEvent` re-seleciona a conexão **por `token_hash`**
  (`packages/db/src/integration-event.ts:145-154`), então cada token cai na sua
  própria linha, e o filtro `status = 'ACTIVE'` é por conexão — que é o que
  torna verdadeira a promessa de desativar uma origem sem desativar a outra.
- **Ganho não previsto no item 3:** com a conexão de LP existindo de verdade, a
  origem do lead passa a estar certa por construção. O conector força
  `LANDING_PAGE` quando o provider da conexão é `LANDING_PAGE`
  (`apps/worker/src/connector-v1.ts:66-69`), enquanto um lead de LP entrando
  pelo token da Pluga só não era rotulado como Meta se quem enviou lembrasse de
  declarar `source`.
- Testes: `apps/web/lib/integration-secret-route.test.ts`, 25 casos rodados
  **duas vezes** — `describe.each(INTEGRATION_SURFACES)` — de modo que a
  conexão de landing page é provada, não presumida. Cobrem 401, 403 para os
  três papéis abaixo de Direção, 403 para workspace não associado, 400 para
  JSON inválido e ação desconhecida, 409 para segredo já existente, o provider
  correto em cada chamada de banco, o segredo ausente do log, e o redirect de
  status voltando para a tela da própria origem.
- Suíte local: 47 arquivos, 303 testes, verde. `pnpm lint` e
  `tsc --noEmit` limpos. `next build` registra as duas rotas novas.

## O que este ticket não fez

- **Histórico por conexão.** A tela da Pluga continua listando os eventos do
  workspace inteiro, inclusive os que chegaram pela landing page. Decidido fora
  de escopo acima; vira ticket próprio se incomodar.
- **Provar em produção.** O workspace de produção tem uma conexão `PLUGA`. A
  conexão de LP só existe depois que alguém abrir a tela e clicar em "Gerar
  segredo" — está listado no item 1 de `a-fazer-geral.md`.
