# marct.co

Site da agência marct.co: presença digital para empresas e comerciantes locais.

A página é um passeio por um bairro em miniatura (diorama 3D low-poly). O scroll leva a
câmera pela rua e cada serviço acende uma fachada:

| Seção | Fachada | Na cena |
|---|---|---|
| Hero | Rua inteira, do alto, apagada | Um ponto de luz pousa na rua |
| Google Meu Negócio | Padaria | Pin do Maps sobe do telhado com as estrelas |
| Landing pages | Loja com vitrine | A vitrine vira uma tela que se monta peça por peça |
| Redes sociais | Salão | Cards de post saem da porta e entram em órbita |
| Tráfego pago | Esquina com outdoor | O outdoor liga e emite ondas de alcance |
| IA (novo) | Estúdio no fim da rua | Holograma de influenciadora; a câmera aproxima |
| Contato | Rua toda acesa | A câmera recua: "seu negócio, visto" |

CTA único em todas as seções: conversa no WhatsApp, com a mensagem já escrita por serviço.

> O CRM que morava neste repositório está no branch `crm-revisional`, sem ligação com o site.

## Stack

Vite + three.js em TypeScript, sem framework de UI. Lenis suaviza o scroll; a timeline da
câmera é própria (`src/timeline.ts`, `src/camera-path.ts`). Bloom só no que passa do branco.

Identidade: bairro cinza e preto, texto branco em Archivo (800 nos títulos, 500 no resto),
tudo minúsculo. **Cor só nos efeitos** que a marct.co faz aparecer (pin e estrelas, posts,
outdoor e ondas, holograma, o bairro acendendo no final) — `ACCENT` em `src/scene/effects.ts`.

| Arquivo | Papel |
|---|---|
| `src/content.ts` | Todo o texto, a ordem das seções e o número do WhatsApp |
| `src/render-sections.ts` | HTML das seções, gerado no build: o texto existe sem JS e sem WebGL |
| `src/timeline.ts` | Scroll → progresso `p` (`p = i` é a câmera parada na seção i) |
| `src/camera-path.ts` | Um quadro de câmera por seção e a interpolação entre eles |
| `src/scene/street.ts` | Fachadas provisórias (código), nos grupos com os nomes das coleções do Blender |
| `src/scene/effects.ts` | O efeito 3D colorido de cada serviço, dirigido pelo progresso local da seção |
| `src/scene/world.ts` | Renderer, luz, bloom, troca pelo `.glb`, Actions no scroll e o quadro de cada frame |
| `blender/build_bairro.py` | Monta a maquete no Blender, salva `bairro.blend` e exporta o `.glb` |

## Scripts

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm lint
pnpm typecheck
pnpm test         # vitest --run
pnpm build        # build + orçamento de tamanho (scripts/check-budget.mjs)
pnpm models       # comprime blender/export/bairro.raw.glb → public/models/bairro.glb (Meshopt)
```

Gates locais (lefthook): pre-commit roda o oxlint nos arquivos em stage; pre-push roda o
typecheck e os testes ligados ao diff. O CI (`.github/workflows/ci.yml`) roda tudo e o build.

## Blender → site

A maquete é gerada por script, então dá para refazer e revisar no diff:

```bash
# Blender aberto com o add-on blender-mcp conectado (porta 9876):
python blender/run_in_blender.py blender/build_bairro.py
# ou sem interface:
blender -b --python blender/build_bairro.py
pnpm models
```

- Um Empty por fachada com o nome da coleção: `street`, `shop_gmb`, `shop_lp`, `shop_social`,
  `billboard_ads`, `studio_ai`. O site troca cada grupo provisório pelo de mesmo nome.
- Materiais `glass*` acendem: dentro de uma fachada viram o vidro dela; `glass_filler_0..2`
  são as janelas do bairro (três níveis de brilho); `glass_lamp`, os postes.
- Actions com o id da seção tocam com o scroll: `gmb` (toldo abre), `lp` (porta de aço sobe),
  `social` (placa bandeira gira), `ads` (refletores inclinam), `ai` (porta do estúdio sobe).
- As peças estáticas de cada coleção são juntadas por material (~50 malhas, ~100 kB comprimido).

**Blender MCP** (Windows): `uv` via `winget install astral-sh.uv`; add-on `addon.py` de
`ahujasid/blender-mcp` instalado e ativo no Blender 5.2 (inicia o servidor sozinho); servidor
registrado com `claude mcp add blender --scope user -- uvx blender-mcp`. As ferramentas aparecem
em sessões novas do Claude Code com o Blender aberto.

## Deploy (Cloudflare)

Worker só de assets estáticos (`cloudflare.config.ts`, CLI `cf`) nos domínios `marct.co` e
`www.marct.co`. O job **Deploy** do CI publica a cada push na `main`, com o secret
`CLOUDFLARE_API_TOKEN` e a variável `CLOUDFLARE_ACCOUNT_ID`. Nunca publicar do notebook.

O plugin da Cloudflare para Vite exige Node 22.18+; em Node mais antigo o `pnpm build` local
sai como site estático puro (o mesmo conteúdo servido). O CI usa Node 24.

## Orçamento de desempenho

- Cena completa < 3 MB comprimida (o build falha acima disso)
- Primeira tela legível sem three.js: a cena carrega depois do texto
- Celular: sem sombras, pixel ratio até 1,5 e bloom em resolução menor
- `prefers-reduced-motion`: sem scroll suave; a câmera pula de quadro em quadro por seção
- Sem WebGL: a mesma página em texto, uma seção por tela
