# 02 — Tokens de design a partir do DESIGN.md

**Blocked by:** None — can start immediately.

**Status:** done

## What to build

O arquivo de tokens que o `DESIGN.md` referencia como `{token.refs}` e que **não existe no repositório**. Hoje o guia proíbe hex e px inline mas não oferece a alternativa — sem este ticket, o primeiro componente nasce violando a lei visual.

Nada é inventado: todos os valores já estão escritos no `DESIGN.md`. O trabalho é extraí-los para um lugar consumível e ligar o Tailwind neles.

## Acceptance criteria

- [x] Tokens de cor: accent e suas variantes, as quatro superfícies da escada, texto, hairlines e os semânticos de status
- [x] Tokens de tipografia cobrindo as 15 entradas da hierarquia, com tracking em `em` (a tabela do `DESIGN.md` tem 16 linhas — `mono` incluído — nenhuma foi omitida)
- [x] Espaçamento com base 4px e os nove passos documentados
- [x] Raio, preservando a gramática 8px controles / 12px cards / 16px painéis / pill só para estado
- [x] Exatamente **duas** sombras — overlay e produto. Nenhuma terceira
- [x] Tailwind consome os tokens; nenhum hex nem px de espaçamento inline em componente. Verificado compilando `globals.css` com o Tailwind CLI contra uma folha de classes cobrindo todo token (todas as 73 classes resolveram, nenhuma silenciosamente ignorada). Ainda não há `layout.tsx`/componente algum importando o arquivo — não existe UI nesta fatia antes deste ticket — então o critério vale como "Tailwind está pronto para consumir os tokens", a ser exercitado de fato pelo ticket 12
- [x] `tabular-nums` disponível como utilitário, exigido em coluna de data, moeda ou percentual
- [x] Tema único claro; sem dark mode e sem toggle
- [x] Lacunas conhecidas registradas em comentário no próprio arquivo: motion, paleta de dataviz e densidade em uma altura só
- [x] **Registrar também a lacuna de superfície de divulgação:** o `DESIGN.md` não documenta `popover` nem `tooltip`. Os componentes existentes são `button-icon`, `status-badge`, `dropdown-menu` e `modal`. O ícone único de avisos do lead (ticket 12) precisa de uma dessas superfícies — reusar `dropdown-menu` ou acrescentar um `popover` ao guia. A escolha é do ticket 12, mas **entra no `DESIGN.md`**, nunca improvisada dentro do componente
