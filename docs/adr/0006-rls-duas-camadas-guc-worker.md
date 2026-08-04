# Isolamento multi-tenant: duas camadas, GUC `app.workspace_id`, worker sob RLS

O isolamento entre workspaces tem **duas camadas**: escopo explícito na aplicação é o caminho normal, e RLS no Postgres é a rede que transforma um filtro esquecido em zero linhas em vez de vazamento entre clientes. As policies keiam num GUC `app.workspace_id` setado pelo servidor — nunca em `auth.uid()` — e o **worker roda sob RLS** como o app, com o claim setado por job. `service_role` fica restrito a migrations, ferramenta interna da marctco e inspeção de DLQ.

**Status:** accepted · 2026-08-04

## O problema que o stack doc não registra

`stack-recomendada.md` trava Supabase Auth + RLS + Prisma como se as três peças encaixassem sozinhas. Elas não encaixam:

- RLS do Supabase funciona porque o **PostgREST** injeta o JWT no Postgres e as policies leem `auth.uid()` / `auth.jwt()`. **Prisma não passa pelo PostgREST** — abre conexão direta. `auth.uid()` vem vazio, e uma policy escrita contra ele ou nega tudo ou não protege nada.
- Se a connection string do Prisma usar papel com `BYPASSRLS` (`service_role`, superusuário), **as policies não rodam**. RLS habilitado, policies escritas, isolamento zero — sem nenhum sinal de erro.

## Por que não RLS sozinha

Com Prisma, RLS só vale se **toda** query rodar dentro de uma transação que carrega o claim. Essa garantia é exatamente tão frágil quanto lembrar do `where: { workspace_id }` — RLS-sozinha não elimina a disciplina, apenas muda o lugar onde ela falha. Daí as duas camadas, com papéis distintos: a aplicação escopa porque é o caminho correto; o banco recusa porque humanos e agentes esquecem.

## Por que o worker não usa `service_role`

`stack-recomendada.md` §2 diz "`service_role` só no servidor (app/worker)", sugerindo worker com bypass. Rejeitado: o worker é o ponto **mais** perigoso do sistema, não o menos — processa jobs de vários workspaces no mesmo processo, sem sessão de usuário. É o cenário exato da regra 3 do [ADR-0004](./0004-fronteira-flag-configuracao-estado.md). Dar bypass a ele remove a rede justamente onde a queda é mais provável.

- O job carrega `workspace_id` e `integration_event_id`, ambos escritos pelo handler autenticado — **nunca** lidos de campo livre do payload do provedor.
- Cada job abre transação, faz `SET LOCAL app.workspace_id`, e trabalha dentro dela.
- Se o `IntegrationEvent` não pertencer àquele workspace, a RLS devolve zero linhas e o job falha alto: o isolamento vira também teste de consistência.

## Regras de implementação

1. **`FORCE ROW LEVEL SECURITY` em toda tabela de negócio, não só `ENABLE`.** `ENABLE` não se aplica ao *owner* da tabela. As tabelas são criadas pelas migrations do Prisma, logo o papel das migrations é owner; sem `FORCE`, qualquer conexão com esse papel ignora as policies silenciosamente. Este é o modo de falha mais perigoso do desenho, porque o teste ingênuo passa.

2. **Papéis separados por função.** Um papel para migrations (owner, DDL). Um papel sem `BYPASSRLS` para app e worker. `service_role` só em ferramenta interna cross-tenant. A connection string do app **nunca** é a das migrations.

3. **Envolver a leitura do GUC em subselect:** `using (workspace_id = (select current_setting('app.workspace_id', true))::uuid)`. Sem o `(select ...)`, a função é avaliada **por linha** — 100x+ mais lento em tabela grande. Com ele, o planner avalia uma vez como InitPlan.

4. **Índice em `workspace_id` em toda tabela de negócio.** Coluna de policy sem índice transforma cada consulta em seq scan.

5. **`SET LOCAL`, nunca `SET`.** É transaction-scoped, então sobrevive a pooling em transaction mode e não vaza contexto para o próximo usuário da conexão. `SET` simples num pool é vazamento cross-tenant direto.

6. **Transação nunca envolve I/O externo.** Chamada a OpenRouter, WhatsMiau ou assinatura fica **fora** da transação: ler numa transação, chamar o terceiro fora, escrever em outra. Segurar conexão durante HTTP de segundos esgota o pool e prende locks.

7. **O GUC vem de `workspace_members`, validado no servidor.** Nunca de header, query string, body ou claim que o cliente possa influenciar. O browser não escolhe seu workspace — ele prova quem é, e o servidor resolve o resto.

8. **O browser nunca acessa o Postgres direto.** TanStack Query chama rotas do Next; as rotas usam Prisma. Supabase Auth é **autenticação e nada mais**, não camada de dados. É o que permite um mecanismo único de isolamento valendo igual no app e no worker.

## Verificar antes da Fase 0

- Prisma usa prepared statements nomeados, que **quebram em pooling transaction-mode**. Exige `pgbouncer=true` na connection string ou porta de session mode. Morde no primeiro deploy, não em produção.
- Confirmar a mecânica exata de `SET LOCAL` dentro de `$transaction` do Prisma e o comportamento do pooler do Supabase. A forma do desenho está travada; os detalhes de API precisam de verificação empírica.

**Consequences:** todo request e todo job passam por um wrapper de transação que seta o claim — uma função, escrita uma vez. Em troca, "workspace A não lê B" vira verificação de banco, demonstrável com um teste, em vez de promessa de code review. Sem RLS no worker, essa prova não existiria justamente no componente que toca todos os tenants.
