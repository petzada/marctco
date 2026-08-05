# Marcador é módulo de domínio, não regra repetida por tela

Quem responde *"o que este lead tem"* é uma função pura em `packages/domain` — `markersFor(opportunity, reviews)` — que devolve a lista ordenada e tipada de marcadores. As três superfícies que exibem aviso chamam a mesma função. Os contadores-filtro **não** passam por ela: são pergunta diferente, servida por índice parcial.

**Status:** accepted · 2026-08-05

## O problema

*"Um lead, um ícone"* é regra de produto fechada — o [ADR-0007](./0007-ingestao-idempotencia.md) §UX a escreve, a issue 12 a repete, e ambos declaram que ela **vale para todo aviso que as fases seguintes acrescentarem**. Nenhum dos dois diz onde ela mora.

E os marcadores não moram no mesmo lugar. O [ADR-0013](./0013-fluxo-de-dados-no-app.md) já registrou o fato ao justificar os índices: `missing_phone` é coluna da `Opportunity`; identidade e duplicidade são linhas de `IntakeReview`. Três superfícies consomem — a linha da tabela, o card do lead, e a comparação que o gestor abre para resolver — e cada uma remonta a agregação a partir de duas fontes.

O modo de falha não é hoje: é a Fase 2 acrescentando o quarto aviso e três lugares precisando lembrar dele. O que se degrada primeiro é justamente a propriedade que a regra existe para proteger — a tabela de triagem em volume alto deixa de ser legível quando um aviso aparece em duas telas e falta na terceira.

## A decisão

`markersFor(opportunity, reviews) → Marker[]` em `packages/domain`. Recebe o que já foi lido, devolve a lista **ordenada e tipada**: `MISSING_PHONE | IDENTITY_CONFLICT | POSSIBLE_DUPLICATE`.

- **Ordem e critério são do domínio.** O que conta como aviso, e em que sequência aparece, não é escolha de tela.
- **Rótulo PT-BR e ícone são da UI.** Nenhum model nem função de domínio carrega texto visível ([ADR-0005](./0005-idioma-codigo-en-ui-pt-br.md)).
- **Acrescentar aviso na Fase 2 é uma variante no tipo**, e o `switch` da UI quebra no compilador. É a mesma troca do [ADR-0008](./0008-fronteira-conector-dominio.md) e do [ADR-0017](./0017-ingestao-como-decisao-e-plano.md): convenção vira barreira de compilador, porque agentes violam convenção com mais facilidade do que erram tipos.
- Os marcadores nascem no `IntakePlan` ([ADR-0017](./0017-ingestao-como-decisao-e-plano.md)) e chegam à tela pelo leitor escopado ([ADR-0016](./0016-contexto-de-acesso-e-leitor-escopado.md)). `markersFor` não consulta nada.

## Os contadores ficam de fora, e isso é o ponto

O contador-filtro responde **"quais leads têm este aviso"**; o ícone responde **"o que este lead tem"**. São perguntas diferentes, com implementações diferentes: o contador é `COUNT` sobre o índice parcial daquele marcador ([ADR-0013](./0013-fluxo-de-dados-no-app.md) §Índices), e percorre exatamente as linhas que casam.

Registrar a separação existe para impedir a "unificação" óbvia — computar os contadores a partir de `markersFor` sobre a lista carregada. Ela contaria só a página, ou obrigaria a carregar a tabela toda para contar, que é precisamente o custo que o índice parcial evita.

## Consequences

Um módulo minúsculo, com uma interface de uma função. É deliberado: a leverage não está no tamanho da implementação, está em ser o único lugar que responde a pergunta — hoje para três chamadores, e para os avisos que a Fase 2 em diante acrescentar sem revisitar tela nenhuma.

`Marcador` continua **não sendo model** ([ADR-0005](./0005-idioma-codigo-en-ui-pt-br.md)): é o conjunto de pendências de um lead, agora com uma função que o computa.
