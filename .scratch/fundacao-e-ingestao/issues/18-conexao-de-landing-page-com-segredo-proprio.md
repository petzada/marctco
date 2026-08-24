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
      credencial é da Direção ([ADR-0015](https://github.com/petzada/marctco/blob/main/docs/adr/0015-perfis-de-acesso-e-escopo.md))
- [x] Atendente e Supervisor continuam recebendo 404 na tela. Na rota de
      **segredo** recebem 403; na de **status** recebem redirect de volta para a
      tela — que é onde levam o 404. A diferença é de propósito: `status` é
      submetido por `<form>`, e responder JSON trocaria a página por texto cru
- [x] O segredo em claro não passa por redirect nem por URL, e não entra na
      linha de log ([ADR-0013](https://github.com/petzada/marctco/blob/main/docs/adr/0013-fluxo-de-dados-no-app.md))
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
- `apps/web/lib/integration-connection-routes.ts` produz os dois handlers a
  partir de uma surface. As quatro rotas
  (`integrations/{pluga,landing-page}/{secret,status}`) passaram a ser seis
  linhas cada, chamando a fábrica.
  **O que isso resolve, sem exagero:** o provider deixa de ser uma constante
  solta no meio de um arquivo e passa a vir de um objeto nomeado, e `segment` é
  união fechada, então errar o nome não compila. O que **não** resolve: cada
  rota ainda amarra sua surface à mão, e nada garante que a surface amarrada
  case com a pasta onde o arquivo mora — `pluga/secret/route.ts` passando
  `LANDING_PAGE_SURFACE` compila. Por isso o redirect da rota de status é lido
  do caminho da requisição (`screenPathForStatusRoute`) e não da surface: uma
  amarração errada não tem como largar o operador num 404, porque o formulário
  sempre volta para a tela de onde saiu. Há teste para isso.
- `apps/web/components/integrations/integration-secret-panel.tsx` é o antigo
  `PlugaSecretPanel` parametrizado por surface; `copy-block.tsx` mudou de lugar
  junto, porque agora serve as duas telas. Comportamento do painel inalterado.
  `integration-secret-notice.tsx` é o que a Gestão vê no lugar dele, agora um
  componente só em vez de um `<Card>` copiado nas duas telas.
- `canOpenPlugaScreen` virou `canOpenIntegrationScreen`, e os arquivos
  `pluga-access.ts` e `integration-secret-route.ts` viraram
  `integration-access.ts` e `integration-connection-routes.ts`: os três nomes
  mentiam depois que a regra passou a guardar duas telas e o módulo passou a
  conter também o handler de status, que não emite segredo nenhum.
- **Gestão não vê o painel** (`landing-page/page.tsx`): verificado por
  inspeção, não por teste — este repo não tem teste de página, e o ticket não
  inventou um framework para isso. O gate é o mesmo `canManageIntegrationSecret`
  que a rota de segredo usa, e esse **tem** teste nos três papéis abaixo de
  Direção.
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
- Testes: `apps/web/lib/integration-connection-routes.test.ts`, 31 casos, com
  os das rotas rodados **duas vezes** — `describe.each` sobre as duas surfaces —
  de modo que a conexão de landing page é provada, não presumida. Cobrem 401,
  403 para os três papéis abaixo de Direção na rota de segredo, o mesmo trio
  sendo devolvido à tela na rota de status, workspace não associado nas duas,
  400 para JSON inválido e ação desconhecida, 409 para segredo já existente, o
  provider correto em cada chamada de banco, o segredo ausente do log, o
  redirect voltando para a tela da própria origem, e o redirect seguindo o
  ponto de montagem mesmo com a surface errada amarrada.
- Suíte local: 47 arquivos, 309 testes, verde. `pnpm lint` e
  `tsc --noEmit` limpos. `next build` registra as duas rotas novas.

## O que este ticket não fez

- **Histórico por conexão.** A tela da Pluga continua listando os eventos do
  workspace inteiro, inclusive os que chegaram pela landing page. Decidido fora
  de escopo acima; vira ticket próprio se incomodar.
- **Provar em produção.** Fechado em 2026-08-12. A Direção gerou o segredo na
  tela; `POST /v1/integrations/webhooks/leads` sem `source` no corpo entrou
  com origem **Landing page**. Evidência em `registro.md`, seção "Fatia
  provada em produção".
