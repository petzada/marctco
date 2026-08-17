# 08 — Paleta de dataviz e gráficos do Dashboard

**Status:** ready-for-agent

**Blocked by:** 07 (os gráficos entram na tela que ele cria)

**What to build:** o gestor passa a saber se o dia é pior que ontem. Três leituras: chegadas por dia na janela recente, aderência ao SLA por dia, e leads em aberto por etapa do funil comercial padrão.

**Este ticket fecha uma lacuna declarada do `DESIGN.md`.** O guia diz, em "Known Gaps": *"Data visualization has no palette. Pipeline charts and revenue graphs need a categorical sequence, and a single-accent system provides no basis for one. Derive it separately; do not improvise from the semantic tones."* Improvisar dentro do componente de gráfico é exatamente o que a instrução proíbe — a paleta entra no guia primeiro, como tokens, e o componente a consome. É o resto do item A10 do plano, que já registrava "paleta de dataviz (bloqueia Analytics)"; a Fase 7 herda pronta.

- [ ] O `DESIGN.md` ganha a paleta categórica como tokens, e a entrada de "Known Gaps" correspondente é marcada como resolvida — do mesmo jeito que o ticket 12 da Fase 1 resolveu a lacuna de popover
- [ ] A sequência tem contraste suficiente entre vizinhos, e a regra do que fazer quando há mais séries que cores está escrita
- [ ] Cor de eixo e de grade derivada da escada de superfícies que já existe, não inventada
- [ ] Estado semântico (estourado, atrasado) usa os tons semânticos que já existem e **não** entra na sequência categórica
- [ ] Chegadas por dia, aderência ao SLA por dia e leads em aberto por etapa, no escopo do perfil, servidos pela mesma operação nomeada do ticket 07
- [ ] Nenhum hex inline e nenhum px inline dentro do componente de gráfico — `{token.refs}` em tudo, como manda o guia
- [ ] Os gráficos são legíveis em tela pequena, com rolagem própria quando não couberem
- [ ] `npx @google/design.md lint DESIGN.md` passa depois da edição
