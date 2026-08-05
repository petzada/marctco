# 02 — Tokens de design a partir do DESIGN.md

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

## What to build

O arquivo de tokens que o `DESIGN.md` referencia como `{token.refs}` e que **não existe no repositório**. Hoje o guia proíbe hex e px inline mas não oferece a alternativa — sem este ticket, o primeiro componente nasce violando a lei visual.

Nada é inventado: todos os valores já estão escritos no `DESIGN.md`. O trabalho é extraí-los para um lugar consumível e ligar o Tailwind neles.

## Acceptance criteria

- [ ] Tokens de cor: accent e suas variantes, as quatro superfícies da escada, texto, hairlines e os semânticos de status
- [ ] Tokens de tipografia cobrindo as 15 entradas da hierarquia, com tracking em `em`
- [ ] Espaçamento com base 4px e os nove passos documentados
- [ ] Raio, preservando a gramática 8px controles / 12px cards / 16px painéis / pill só para estado
- [ ] Exatamente **duas** sombras — overlay e produto. Nenhuma terceira
- [ ] Tailwind consome os tokens; nenhum hex nem px de espaçamento inline em componente
- [ ] `tabular-nums` disponível como utilitário, exigido em coluna de data, moeda ou percentual
- [ ] Tema único claro; sem dark mode e sem toggle
- [ ] Lacunas conhecidas registradas em comentário no próprio arquivo: motion, paleta de dataviz e densidade em uma altura só
- [ ] **Registrar também a lacuna de superfície de divulgação:** o `DESIGN.md` não documenta `popover` nem `tooltip`. Os componentes existentes são `button-icon`, `status-badge`, `dropdown-menu` e `modal`. O ícone único de avisos do lead (ticket 12) precisa de uma dessas superfícies — reusar `dropdown-menu` ou acrescentar um `popover` ao guia. A escolha é do ticket 12, mas **entra no `DESIGN.md`**, nunca improvisada dentro do componente
