# 10 — Quarentena e marcador de lead sem telefone

**Blocked by:** 09

**Status:** ready-for-agent

## What to build

Nenhum lead pago pode sumir, mas nem todo lead recebido dá para atender. Este ticket separa os dois casos.

Sem telefone **e** sem e-mail não há como contatar nem identificar: o registro é guardado e fica visível na lista de eventos, mas não vira Pessoa nem Oportunidade. Qualquer outra falta — inclusive CPF, que raramente vem do formulário de anúncio — entra no funil normalmente.

O marcador significa **exatamente uma coisa**: não dá para chamar no WhatsApp nem ligar. Não é rótulo genérico de "falta alguma coisa" — se virar isso, perde utilidade operacional. Ver [ADR-0007](../../../docs/adr/0007-ingestao-idempotencia.md).

## Acceptance criteria

- [ ] Sem telefone e sem e-mail → evento marcado como quarentena, **sem** criar Pessoa nem Oportunidade
- [ ] Lead em quarentena aparece na lista de eventos de integração
- [ ] Lead em quarentena **não** tem relógio de atendimento, porque não tem Oportunidade
- [ ] Só e-mail, sem telefone → entra no funil **com** marcador
- [ ] Tem telefone, sem CPF → entra no funil **sem** marcador
- [ ] Falta tipo de financiamento, instituição ou parcela → entra no funil **sem** marcador
- [ ] Nenhum payload recebido é descartado, em nenhuma hipótese
- [ ] O estado de quarentena vive no evento de integração; o marcador vive na Oportunidade — os dois **não** são o mesmo campo
- [ ] Sair da quarentena **exige ao menos um contato** — não existe liberação de envio sem telefone e sem e-mail. A regra tem uma dona só: liberar vazio criaria `Person` sem chave, que a resolução de identidade nunca mais alcança, e card que ninguém consegue atender
- [ ] O `arrived_at` do lead liberado é o instante da **liberação**; a quarentena é o único lugar do sistema onde algo fica retido, e um relógio que nasce estourado não tem como ser zerado ([ADR-0007](../../../docs/adr/0007-ingestao-idempotencia.md))
- [ ] **Quarentena é uma variante do `IntakePlan`, não um desvio antes dele**: `decideIntake` devolve `Quarantine` quando não há contato, e a liberação chama a **mesma** função com `now` = instante da liberação. O `arrived_at` divergente deixa de ser exceção escondida num caminho e vira o mesmo argumento com valor diferente ([ADR-0017](../../../docs/adr/0017-ingestao-como-decisao-e-plano.md))
- [ ] **Seam 1** prova os dois `arrived_at` lado a lado — recebimento direto e liberação — sem banco
- [ ] A interface de completar e liberar está no ticket 14
