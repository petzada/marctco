# 03 — Isolamento por RLS, provado

**Blocked by:** 01

**Status:** ready-for-agent

## What to build

A garantia, **no banco**, de que um workspace não lê nem escreve dados de outro — e a prova automática de que isso continua verdadeiro a cada alteração.

O dado em questão é CPF, telefone e situação financeira de pessoas reais. A garantia não pode depender de alguém lembrar de filtrar por `workspace_id` numa consulta.

Ver [ADR-0006](../../../docs/adr/0006-rls-duas-camadas-guc-worker.md). Atenção ao modo de falha silencioso: `ENABLE ROW LEVEL SECURITY` **não** se aplica ao dono da tabela, e o dono é o papel das migrações. Sem `FORCE`, o teste ingênuo passa e não há isolamento nenhum.

## Acceptance criteria

- [ ] Papéis separados: migrações (dono, DDL), app e worker (sem `BYPASSRLS`), `service_role` restrito a ferramenta interna
- [ ] `ENABLE` **e** `FORCE ROW LEVEL SECURITY` em toda tabela de negócio
- [ ] Policies keiam em `app.workspace_id`, com a leitura do GUC envolta em subselect — sem isso a função é avaliada por linha
- [ ] Índice em `workspace_id` em toda tabela de negócio
- [ ] Helper de transação em `packages/db` faz `SET LOCAL` (nunca `SET`) e é o único caminho de acesso a dado
- [ ] Nenhuma transação envolve chamada de rede externa
- [ ] **Seam 3**: varredura de `pg_tables` e `pg_policies` reprova qualquer tabela de negócio sem RLS habilitada, sem `FORCE` ou sem policy
- [ ] Teste: leitura cross-workspace devolve zero linhas
- [ ] Teste: escrita cross-workspace é recusada
- [ ] Os testes rodam no CI e barram o merge
- [ ] Uma tabela nova criada sem policy **reprova** o CI — verificado deliberadamente
