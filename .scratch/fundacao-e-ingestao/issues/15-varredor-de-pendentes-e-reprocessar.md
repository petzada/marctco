# 15 — Varredor de pendentes e reprocessar

**Blocked by:** 07, 14

**Status:** ready-for-agent

## What to build

Postgres e Redis não commitam juntos. Quando o Redis está fora no instante em que um lead chega, o evento fica gravado como pendente e o job nunca é enfileirado — órfão visível, mas parado.

A Pluga retenta erros temporários, então em tese isso se cura sozinho. O **webhook de landing page não**: é um `POST` de navegador, e ninguém insiste. Sem o varredor, um lead de LP some se o Redis estiver indisponível naquele segundo.

O varredor **não é peça nova**: é o mesmo mecanismo do botão "reprocessar" que a tela de Integrações já precisa ter.

## Acceptance criteria

- [ ] Job repetível re-enfileira eventos parados em pendente além de um limite de tempo
- [ ] O botão "reprocessar" da tela de Integrações usa **o mesmo** mecanismo, não um caminho paralelo
- [ ] Evento reprocessado **não** gera Pessoa nem Oportunidade duplicada — a deduplicação do ticket 09 cobre
- [ ] Fila morta visível na tela de Integrações
- [ ] Lead de landing page recebido com o Redis fora é processado assim que o Redis volta
- [ ] O varredor roda **sob RLS**, com claim por evento — não com bypass
- [ ] O varredor não reprocessa evento já processado
