# 15 — Recuperação da outbox e reprocessamento

**Blocked by:** 07, 14

**Status:** ready-for-agent

## What to build

Postgres e Redis não commitam juntos. O endpoint resolve isso com outbox: aceita o lead no PostgreSQL e o dispatcher continua tentando publicar. Este ticket endurece recuperação, backoff, observabilidade e reprocessamento manual.

A durabilidade não depende da Pluga nem da LP retentarem. O dispatcher lê pendências do PostgreSQL quando o Redis volta; LP é sempre servidor-servidor.

O varredor **não é peça nova**: é o mesmo mecanismo do botão "reprocessar" que a tela de Integrações já precisa ter.

## Acceptance criteria

- [ ] Dispatcher busca eventos com despacho pendente em lotes, aplica backoff e recupera após reinício
- [ ] O botão "reprocessar" da tela de Integrações usa **o mesmo** mecanismo, não um caminho paralelo
- [ ] Evento reprocessado **não** gera Pessoa nem Oportunidade duplicada — a deduplicação do ticket 09 cobre
- [ ] Fila morta visível na tela de Integrações
- [ ] Lead Pluga ou LP recebido com o Redis fora é processado assim que o Redis volta
- [ ] O varredor roda **sob RLS**, com claim por evento — não com bypass
- [ ] O varredor não reprocessa evento já processado
- [ ] A descoberta de pendências não depende de um repeatable job armazenado no próprio Redis
