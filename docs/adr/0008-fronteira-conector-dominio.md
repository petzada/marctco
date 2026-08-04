# Fronteira entre conector de origem e domínio

O `LeadSourceConnector` conhece a **forma** do payload de um provedor; o domínio conhece o **significado**. O conector roda **no worker**, não no request HTTP — o handler é provider-agnóstico. Entre os dois passam dois tipos derivados de Zod: `InboundLead` (saída do adapter, forma crua validada) e `NormalizedLead` (saída do normalizador de domínio).

**Status:** accepted · 2026-08-04

## Por que o conector roda no worker

Decorre do 202-sempre ([ADR-0007](./0007-ingestao-idempotencia.md)): o request autentica, persiste o bruto e enfileira, sem interpretar. Quem descobre se aquilo é Meta, Google ou LP é o worker.

O ganho decisivo: quando um conector tiver bug, o payload bruto está guardado **não interpretado**, e a DLQ pode reprocessar com o código corrigido. Se o adapter rodasse no request, um bug de parsing perderia o lead irrecuperavelmente.

Isto é contraintuitivo o bastante para alguém tentar "consertar" parseando no handler. Não é bug — é o desenho.

## A divisão

| Conector (adapter) | Domínio |
|---|---|
| Sabe que Meta manda `full_name` e Google manda `name` | Normaliza telefone, CPF, e-mail |
| Extrai campanha, adset, form, plataforma | Decide quarentena |
| Sintetiza `external_lead_id` quando a origem não fornece | Decide reúso de Person |
| Não conhece funil, Person, Opportunity nem etapa | Decide criar ou anexar Opportunity |

**Normalização é do domínio, não do adapter** — não por pureza: normalizar telefone exige país default (Brasil). Com normalização no adapter, ou a regra se repete em três lugares até divergirem, ou o adapter passa a carregar conhecimento de negócio que não é dele. `sintese-final.md` §17 já trata dado normalizado como garantia do CRM.

## Dois tipos, não um

`InboundLead` → `normalize()` → `NormalizedLead`.

**Considered option (rejeitada):** um único `NormalizedLead` que o adapter produz já chamando os normalizadores compartilhados. Menos cerimônia, mas o adapter pode esquecer de chamar um normalizador e nada percebe — o tipo *diz* "normalized" e o dado não está. O defeito aparece como telefone torto num card, semanas depois.

Com dois tipos o compilador garante que a normalização aconteceu. **Este código será escrito majoritariamente por agentes, e agentes violam convenção com muito mais facilidade do que erram tipos** — trocar "lembre de normalizar" por uma barreira de compilador é o melhor negócio disponível, ao custo de um tipo.

`NormalizedLead` é **value object**, não entidade: sem identidade, sem ciclo de vida. As entidades são `Person` e `Opportunity`. Tratá-lo como entidade vira tabela desnecessária.

## Regras

- **O schema Zod é a fonte única**; o tipo TypeScript é inferido, nunca escrito à mão em paralelo.
- **Validar na fronteira uma vez.** Não revalidar dado interno já confiável — o custo do Zod é irrelevante por lead, mas vira real se `.parse()` aparecer em toda camada.

**Consequences:** o pacote compartilhado do monorepo é menor do que parece. Como o adapter vive no worker, o app **não** precisa dos schemas dos conectores — precisa dos tipos de domínio para leitura e do catálogo de flags. Insumo direto para a decisão de estrutura do monorepo.
