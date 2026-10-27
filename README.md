# marct.co

![Status](https://img.shields.io/badge/status-em%20desenvolvimento%20ativo-brightgreen) ![Licença](https://img.shields.io/badge/licen%C3%A7a-MIT-green) ![three.js](https://img.shields.io/badge/three.js-0.186-black?logo=three.js) ![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white) ![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)

Site da agência **marct.co**, de presença digital para empresas e comércios locais: um passeio em 3D por um bairro em miniatura que apresenta cada serviço e capta leads.

## Índice

- [Status do projeto](#status-do-projeto)
- [Demonstração](#demonstração)
- [Tecnologias utilizadas](#tecnologias-utilizadas)
- [Pré-requisitos e instalação](#pré-requisitos-e-instalação)
- [Como utilizar](#como-utilizar)
- [Testes](#testes)
- [Contribuição](#contribuição)
- [Licença](#licença)
- [Autor e contato](#autor-e-contato)

## Status do projeto

🟢 **Em desenvolvimento ativo**: o site está no ar e evolui com novas seções e ajustes visuais.

## Demonstração

A página é um **diorama 3D low-poly**: o scroll leva a câmera pela rua e cada serviço acende uma fachada.

| Seção | Fachada | Na cena |
|---|---|---|
| Hero | Rua inteira, do alto, apagada | Um ponto de luz pousa na rua |
| Google Meu Negócio | Padaria | Pin do Maps sobe do telhado com as estrelas |
| Landing pages | Loja com vitrine | A vitrine vira uma tela que se monta peça por peça |
| Redes sociais | Salão | Cards de post saem da porta e entram em órbita |
| Tráfego pago | Esquina com outdoor | O outdoor liga e emite ondas de alcance |
| IA | Estúdio no fim da rua | Holograma de influenciadora; a câmera aproxima |
| Contato | Rua toda acesa | A câmera recua: "seu negócio, visto" |

- **Formulário de lead em duas etapas** (nome, WhatsApp e empresa; depois ramo, produto e serviços de interesse), com rascunho salvo no navegador. Os leads ficam na tabela `leads` de um banco **D1** e geram aviso no Telegram.
- **Funciona sem JavaScript e sem WebGL**: o HTML das seções é gerado no build e os botões levam ao WhatsApp.
- **Identidade monocromática**: bairro cinza e preto, texto branco em Roboto minúsculo; cor só nos efeitos das animações.
- **Orçamento de tamanho** verificado no build para manter o carregamento leve.

## Tecnologias utilizadas

- **TypeScript** + **Vite**, sem framework de UI
- **three.js** (cena, bloom e animações) e **Lenis** (scroll suave)
- **Blender** (Python) para modelar a maquete, exportada em `.glb` e comprimida com **gltfpack** (Meshopt)
- **Cloudflare Workers** (assets + `POST /api/leads`) e **D1**
- **Vitest**, **oxlint**, lefthook e GitHub Actions (CI e deploy)

## Pré-requisitos e instalação

**Pré-requisitos**

- **Node.js 22** (versão em `.nvmrc`)
- **pnpm 10** (`corepack enable`)
- **Blender** apenas se for alterar a maquete 3D

**Instalação**

```bash
git clone https://github.com/petzada/marctco.git
cd marctco
corepack enable
pnpm install          # também instala os hooks do lefthook
```

## Como utilizar

```bash
pnpm dev              # http://localhost:5173
pnpm build            # build + verificação do orçamento de tamanho
pnpm preview          # serve o build localmente
pnpm models           # comprime blender/export/bairro.raw.glb → src/models/bairro.glb
```

**Onde mexer**

| Arquivo | Papel |
|---|---|
| `src/content.ts` | Todo o texto, a ordem das seções e o número do WhatsApp |
| `src/timeline.ts` / `src/camera-path.ts` | Scroll → progresso e um quadro de câmera por seção |
| `src/scene/effects.ts` | O efeito 3D colorido de cada serviço |
| `src/lead.ts` / `src/lead-form.ts` | Validação e modal do formulário de lead |
| `src/worker/index.ts` | Worker: grava o lead no D1 |
| `blender/build_bairro.py` | Monta a maquete no Blender e exporta o `.glb` |

O deploy é feito pelo GitHub Actions a cada merge na `main` (as migrations do D1 também).

## Testes

```bash
pnpm test             # vitest --run
pnpm typecheck        # tsc --noEmit
pnpm lint             # oxlint
```

Os testes cobrem conteúdo, validação do lead, aviso no Telegram e a lógica pura de scroll/câmera. O **lefthook** roda o oxlint no commit e o typecheck + testes do diff no push; lint, suíte completa, build e orçamento rodam no CI.

## Contribuição

Contribuições são bem-vindas! Para propor uma melhoria:

1. Abra uma **issue** descrevendo o problema ou a ideia antes de começar algo grande.
2. Faça um **fork** e crie um branch a partir da `main`: `<tipo>/<nome-kebab>` (`feat`, `fix`, `docs`, `refactor`, `test`, `chore`).
3. Use **commits semânticos** em português: `<tipo>(<escopo>): <descrição no imperativo>`.
4. Rode lint e testes antes de enviar (veja [Testes](#testes)).
5. Abra o **Pull Request** em *draft*, explicando o quê e o porquê. O merge é feito pelo autor.

Não inclua segredos (`.env`, chaves de API, tokens) em commits ou PRs.

Convenções do projeto (identidade visual, onde fica cada coisa) em [`AGENTS.md`](AGENTS.md).

## Licença

Distribuído sob a licença **MIT**, de código aberto. Isso significa que você **pode** usar, copiar, modificar, mesclar, publicar, distribuir, sublicenciar e até vender cópias do código, inclusive em projetos comerciais, **desde que** mantenha o aviso de copyright e o texto da licença. O software é fornecido "no estado em que se encontra", **sem garantias**, e o autor não se responsabiliza por danos decorrentes do uso.

Texto completo em [`LICENSE`](LICENSE).

## Autor e contato

**Marcio Petigrosso** ("petzada"): idealização e desenvolvimento.

- GitHub: [@petzada](https://github.com/petzada)
- LinkedIn: [in/petigrosso](https://www.linkedin.com/in/petigrosso)
