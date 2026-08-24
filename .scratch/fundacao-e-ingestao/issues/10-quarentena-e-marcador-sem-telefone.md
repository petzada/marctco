# 10 — Quarentena e marcador de lead sem telefone

**Blocked by:** 09

**Status:** done

## What to build

Nenhum lead pago pode sumir, mas nem todo lead recebido dá para atender. Este ticket separa os dois casos.

Sem telefone **e** sem e-mail não há como contatar nem identificar: o registro é guardado e fica visível na lista de eventos, mas não vira Pessoa nem Oportunidade. Qualquer outra falta — inclusive CPF, que raramente vem do formulário de anúncio — entra no funil normalmente.

O marcador significa **exatamente uma coisa**: não dá para chamar no WhatsApp nem ligar. Não é rótulo genérico de "falta alguma coisa" — se virar isso, perde utilidade operacional. Ver [ADR-0007](https://github.com/petzada/marctco/blob/main/docs/adr/0007-ingestao-idempotencia.md).

## Acceptance criteria

- [x] Sem telefone e sem e-mail → evento marcado como quarentena, **sem** criar Pessoa nem Oportunidade
- [x] Lead em quarentena aparece na lista de eventos de integração
- [x] Lead em quarentena **não** tem relógio de atendimento, porque não tem Oportunidade
- [x] Só e-mail, sem telefone → entra no funil **com** marcador
- [x] Tem telefone, sem CPF → entra no funil **sem** marcador
- [x] Falta tipo de financiamento, instituição ou parcela → entra no funil **sem** marcador
- [x] Nenhum payload recebido é descartado, em nenhuma hipótese
- [x] O estado de quarentena vive no evento de integração; o marcador vive na Oportunidade — os dois **não** são o mesmo campo
- [x] Sair da quarentena **exige ao menos um contato** — não existe liberação de envio sem telefone e sem e-mail. A regra tem uma dona só: liberar vazio criaria `Person` sem chave, que a resolução de identidade nunca mais alcança, e card que ninguém consegue atender
- [x] O `arrived_at` do lead liberado é o instante da **liberação**; a quarentena é o único lugar do sistema onde algo fica retido, e um relógio que nasce estourado não tem como ser zerado ([ADR-0007](https://github.com/petzada/marctco/blob/main/docs/adr/0007-ingestao-idempotencia.md))
- [x] **Quarentena é uma variante do `IntakePlan`, não um desvio antes dele**: `decideIntake` devolve `Quarantine` quando não há contato, e a liberação chama a **mesma** função com `now` = instante da liberação. O `arrived_at` divergente deixa de ser exceção escondida num caminho e vira o mesmo argumento com valor diferente ([ADR-0017](https://github.com/petzada/marctco/blob/main/docs/adr/0017-ingestao-como-decisao-e-plano.md))
- [x] **Seam 1** prova os dois `arrived_at` lado a lado — recebimento direto e liberação — sem banco
- [x] A interface de completar e liberar está no ticket 14

## Comments

- `markersFor(opportunity, reviews)` passou a ser a única dona da lista ordenada e sem duplicação de marcadores. O marcador `MISSING_PHONE` depende exclusivamente de `Opportunity.missing_phone`; ausências de CPF ou dados de financiamento não entram na interface da função e não podem criar aviso.
- O Seam 1 prova lado a lado o recebimento direto (`INSERTED`, `now = received_at`) e a liberação (`DUPLICATE` sem card, `now = instante da liberação`) pela mesma `decideIntake`. Uma tentativa de liberação ainda sem contato permanece `QUARANTINE`, sem campos de Pessoa, Oportunidade ou `arrived_at`.
- O teste de banco percorre `recordLeadSubmission(ctx, input) → decideIntake → applyIntakePlan(ctx, plan)` com `UserContext`, reutiliza o mesmo `IntegrationEvent`, cria o card com `arrived_at` da liberação e muda a fonte única do evento de `QUARANTINED` para `PROCESSED` no mesmo commit.
- `listIntegrationEvents` foi exercitada pelo leitor nomeado de `packages/db`: o evento em quarentena aparece com `raw` intacto e `processed_at` nulo. Nenhuma UI foi construída; completar e liberar continua pertencendo ao ticket 14.
