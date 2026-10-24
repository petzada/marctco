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
câmera é própria (`src/timeline.ts`, `src/camera-path.ts`). Bloom só no branco puro.

| Arquivo | Papel |
|---|---|
| `src/content.ts` | Todo o texto, a ordem das seções e o número do WhatsApp |
| `src/render-sections.ts` | HTML das seções, gerado no build: o texto existe sem JS e sem WebGL |
| `src/timeline.ts` | Scroll → progresso `p` (`p = i` é a câmera parada na seção i) |
| `src/camera-path.ts` | Um quadro de câmera por seção e a interpolação entre eles |
| `src/scene/street.ts` | A rua com fachadas provisórias, nos grupos com os nomes das coleções do Blender |
| `src/scene/effects.ts` | O efeito 3D de cada serviço, dirigido pelo progresso local da seção |
| `src/scene/world.ts` | Renderer, luz, bloom, carga do `.glb` e o quadro de cada frame |

## Scripts

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm lint
pnpm typecheck
pnpm test         # vitest --run
pnpm build        # build + orçamento de tamanho (scripts/check-budget.mjs)
```

Gates locais (lefthook): pre-commit roda o oxlint nos arquivos em stage; pre-push roda o
typecheck e os testes ligados ao diff. O CI (`.github/workflows/ci.yml`) roda tudo e o build.

## Blender → site

1. Uma coleção por fachada no `.blend`, com nomes estáveis: `street`, `shop_gmb`, `shop_lp`,
   `shop_social`, `billboard_ads`, `studio_ai`.
2. Animações como Actions nomeadas pelo id da seção (`gmb`, `lp`, `social`, `ads`, `ai`):
   o scroll as toca via `AnimationMixer`, do início ao fim enquanto a câmera está na fachada.
3. Exportar glTF binário com compressão Meshopt para `public/models/bairro.glb`.
4. Materiais simples (cinzas, emissivo branco); a luz principal fica no three.js.

Sem `bairro.glb`, o site usa as fachadas provisórias. Com ele, cada grupo de mesmo nome é
trocado pelo objeto do arquivo. O `.blend` fica em `blender/` (Git LFS se passar de ~50 MB).

## Orçamento de desempenho

- Cena completa < 3 MB comprimida (o build falha acima disso)
- Primeira tela legível sem three.js: a cena carrega depois do texto
- Celular: sem sombras, pixel ratio até 1,5 e bloom em resolução menor
- `prefers-reduced-motion`: sem scroll suave; a câmera pula de quadro em quadro por seção
- Sem WebGL: a mesma página em texto, uma seção por tela

## Em aberto

- Fonte: serifa ou sem serifa (provisória: o desenho grosso da Arial, `--font` em `src/styles.css`)
- Número do WhatsApp (`WHATSAPP_NUMBER` em `src/content.ts`), cidade/região, cases e depoimentos
- Domínio e hospedagem (site estático: Vercel, Netlify ou Cloudflare Pages)
