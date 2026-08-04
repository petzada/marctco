# 12 — Tela de Leads

**Blocked by:** 09, 04, 02, 10

**Status:** ready-for-agent

## What to build

O gestor abre **Leads** e vê a lista chegando. É a primeira superfície em que o trabalho dos tickets anteriores se torna visível para quem paga pelo produto.

Tabela **paginada**, não Kanban: a lista geral é de triagem em volume alto, e o quadro Kanban pertence a "Meus leads" do atendente, que é da Fase 2.

Na UI o card se chama **Lead**; no domínio é sempre Oportunidade. Não existe segundo substantivo no meio do funil comercial. Ver [CONTEXT.md](../../../CONTEXT.md) e [ADR-0005](../../../docs/adr/0005-idioma-codigo-en-ui-pt-br.md).

## Acceptance criteria

- [ ] Tabela paginada mostrando exclusivamente leads do workspace do usuário
- [ ] Colunas: nome, contato, produto, banco, origem e data de chegada
- [ ] Numerais tabulares em qualquer coluna de data
- [ ] Duas oportunidades abertas da mesma pessoa são **distinguíveis** na tabela — `banco` é o discriminador, e ele já chega do formulário de anúncio
- [ ] Origem (Meta, Google ou landing page) visível no registro
- [ ] Contador de leads sem telefone que **filtra a própria tabela**, em vez de levar para outra tela
- [ ] Edição dos dados do lead dentro do card
- [ ] Ação de edição direto na linha da tabela, sem abrir o card
- [ ] Edição manual passa pela **mesma** normalização da ingestão — telefone, CPF e e-mail não podem entrar torto pela porta da UI
- [ ] Estado vazio conforme o `DESIGN.md`
- [ ] Usa os tokens do ticket 02; nenhum hex nem px de espaçamento inline
- [ ] Comportamento responsivo conforme os breakpoints do `DESIGN.md`, incluindo a transformação de tabela em cards no menor
