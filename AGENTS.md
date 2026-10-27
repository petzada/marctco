# marct.co — site da agência

Leia o [README.md](./README.md): conceito, stack, mapa dos arquivos e o pipeline Blender → site.

- Texto e ordem das seções só em `src/content.ts`; a cena, o HTML e o fallback leem de lá.
- Bairro e texto monocromáticos (texto branco, tudo minúsculo, títulos em uma linha); cor só nos efeitos das animações (`ACCENT`).
- Lógica de scroll e câmera é pura (`src/timeline.ts`, `src/camera-path.ts`) e tem teste.
- A maquete sai de `blender/build_bairro.py`; preserve os nomes dos grupos, dos materiais `glass*` e das Actions.
- Deploy só pelo CI (job Deploy, push na main); nunca do notebook.
- UI: siga a skill **design-taste-frontend**.
- O CRM (histórico deste repositório) vive no branch `crm-revisional`; não misture.

## Processo (notebook ou VM da nuvem)

- Branch nova a partir da `main` (`<tipo>/<nome-kebab>`), commits semânticos; nunca commitar na `main`.
- Gates leves onde o agente está: o lefthook roda oxlint nos staged (pre-commit) e `pnpm typecheck` +
  testes ligados ao diff (pre-push). Lint e suíte completos, build e orçamento de tamanho ficam no CI.
- PR **sempre em draft** (`gh pr create --draft`); marcar como pronto só com os gates verdes. **O agente
  nunca faz merge**: merge na `main` é deploy em produção (job Deploy) e é decisão do responsável.
- Sem banco local, sem Docker local, sem `cf deploy`/`wrangler` do notebook ou da VM. Migrations do D1
  são aplicadas pelo job Deploy. Nenhum segredo no repositório nem no ambiente da nuvem.
- Nunca `--no-verify`, nunca desligar hooks ou a proteção da `main`.

### PR na VM da nuvem (Claude Code na web, app ou thread de projeto)

Na nuvem o proxy do GitHub bloqueia GraphQL, então `gh pr …` e `gh issue …` dão 403. `git push` e
`gh api` (REST) funcionam. Lá o fluxo de PR é este:

- Abrir em draft: botão **Create draft PR** no cartão Changes (clique direito em Create PR), ou
  `gh api repos/{owner}/{repo}/pulls -f title='<tipo>(<escopo>): …' -f head=<branch> -f base=main -f body='…' -F draft=true`.
- Listar ou ver PR: `gh api repos/{owner}/{repo}/pulls?head={owner}:<branch>`.
- Marcar como pronto não tem endpoint REST: na nuvem o agente avisa que os gates estão verdes e o
  responsável marca pelo GitHub (ou pelo app). Merge continua sendo só do responsável.
- Não coloque `GH_TOKEN` no ambiente da nuvem: não resolve o 403 e deixa o token legível.
