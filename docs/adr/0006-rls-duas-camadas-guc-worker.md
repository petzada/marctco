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

7. **O GUC vem sempre de `workspace_members`, validado no servidor.** Mas o que se faz com o valor que chega do cliente depende de haver ou não outra fonte de tenant, e as duas regras são diferentes:
   - **Ingestão: ignorar.** O token já diz o workspace. `workspace_id` no corpo não tem valor nenhum e é descartado sem olhar.
   - **Sessão do navegador: validar, nunca confiar.** Quem pertence a mais de um workspace precisa poder escolher, e a escolha viaja na requisição — não existe alternativa em HTTP sem estado. O servidor confere a escolha contra `workspace_members` antes de setar o GUC. Escolha que não corresponde a uma associação do usuário devolve **404**, nunca 403: distinguir "não existe" de "existe mas não é seu" confirma a existência do workspace alheio. A tentativa é registrada, porque usuário legítimo tentando isso é sinal.

   Ignorar e validar não são a mesma regra. Escrever "o browser não escolhe seu workspace" sem essa distinção proíbe o próprio seletor. Onde a escolha mora é decisão do [ADR-0012](./0012-contexto-de-tenant-na-url.md).

8. **O browser nunca acessa o Postgres direto.** Supabase Auth é **autenticação e nada mais**, não camada de dados. É o que permite um mecanismo único de isolamento valendo igual no app e no worker.

   *Emendado pelo [ADR-0013](./0013-fluxo-de-dados-no-app.md).* A redação anterior — "TanStack Query chama rotas do Next; as rotas usam Prisma" — respondia bem à pergunta desta regra e mal a outra: ela não menciona Server Component, e lida ao pé da letra obrigava endpoint + hook por tela. O que continua valendo aqui é só o princípio: **o acesso a dado é sempre servidor**. Qual peça do servidor faz isso é do ADR-0013.

   Consequência direta: **Supabase Realtime é incompatível com este desenho.** As policies keiam no GUC, não em `auth.uid()`; uma conexão Realtime do navegador nunca passa pelo `SET LOCAL`, então `current_setting('app.workspace_id', true)` volta `NULL` e a policy nega tudo. Fazer funcionar exigiria um segundo conjunto de policies em `auth.jwt()` — duas fontes de verdade para isolamento.

9. **`SECURITY DEFINER` só em schema privado, e a lista é fechada.** Existem consultas que precisam acontecer **antes** de haver tenant, e por isso não podem passar por policy keiada no GUC. Elas não justificam bypass para o app inteiro: cada uma vira uma função `SECURITY DEFINER` em schema `private`, com superfície mínima, `EXECUTE` revogado de todo papel que não seja o do app, e `search_path` fixado na própria função.

   São **três**, e nenhuma a mais:

   | Função | Por que não tem tenant | O que devolve |
   |---|---|---|
   | `resolve_workspace_by_token_hash` | Descobre o tenant a partir do token; existe para isso | `workspace_id` |
   | `claim_pending_events` | O dispatcher procura pendência de todos os workspaces, sem sessão e sem job prévio | Só `(id, workspace_id)` — nunca `raw`, que carrega CPF e telefone |
   | `provision_workspace` | Cria o Workspace, o vínculo do primeiro membro e o funil padrão; o tenant ainda não existe | `workspace_id` |

   O que **devolvem** importa tanto quanto quem pode chamá-las: uma função sem tenant que devolvesse payload seria um vazamento cross-tenant com aparência de recurso. O Seam 3 enumera `SECURITY DEFINER` no banco e **reprova qualquer função fora desta lista** — sem isso, a lista é comentário, e a quarta função entra sem ninguém notar.

10. **O app e o worker se recusam a subir com o papel errado.** Toda a defesa deste ADR depende de um valor numa variável de ambiente, e nenhuma das duas camadas olha para lá. O painel do Supabase entrega, pronta para copiar, a connection string do `postgres` — colá-la no Railway produz exatamente o cenário de abertura deste documento: RLS habilitada, policies escritas, isolamento zero, sem nenhum sinal de erro, com o CI inteiro verde.

    Por isso, no boot, cada processo consulta o papel com que se conectou e **aborta a inicialização** se for superusuário, se tiver `BYPASSRLS`, ou se for dono de alguma tabela de negócio. É a mesma lógica com que o [ADR-0010](./0010-migrations-e-ci-cd.md) mantém a string de produção fora do `.env`: transformar o erro provável em **impossível de servir**, não apenas em proibido.

    O CI não consegue fazer essa verificação — ele não sabe qual string está no Railway. Só o processo em produção sabe, e ele é o único que pode se recusar a atender.

11. **Nada de estado mutável em escopo de módulo, nem no worker nem no app.** O `ticket 16` já escreveu esta regra para o worker — *"nenhum valor de flag resolvido em escopo de módulo, singleton ou cache sem chave de workspace: o worker processa vários tenants no mesmo processo"*. Com renderização no servidor, `apps/web` adquire **exatamente o mesmo formato**: um processo Node servindo requisições de tenants diferentes.

    Uma variável de módulo guardando workspace resolvido, papel do usuário ou resultado de flag serve os dados do cliente A para o cliente B. **A RLS não pega**: a leitura foi legítima e dentro do tenant certo; o que vazou foi o resultado, depois do banco, dentro do processo. É o guia do Vercel na regra `server-no-shared-module-state`, e aqui não é performance — é isolamento.

    Cache por requisição (`React.cache()`) é seguro porque o escopo morre com a requisição. Cache entre requisições exige `workspace_id` na chave, sem exceção — e continua **proibido** para o lookup de token.

    *Reforçado pelo [ADR-0016](./0016-contexto-de-acesso-e-leitor-escopado.md).* Com o `AccessContext` como argumento obrigatório de toda operação de `packages/db`, esta regra deixa de depender de vigilância: não há como um valor em escopo de módulo servir de default silencioso, porque não existe leitura sem contexto passado.

12. **PII não sai do tenant por telemetria.** Sentry é a observabilidade travada e `pino` o log estruturado; o comportamento **padrão** de ambos é capturar contexto de erro e serializar o objeto inteiro. O sistema guarda CPF, telefone e situação financeira de pessoa real, e o worker erra com o payload cru no escopo — o primeiro erro de normalização mandaria o lead completo para um serviço terceiro, com retenção própria e acesso por login.

    Isso anularia um cuidado que o [ADR-0007](./0007-ingestao-idempotencia.md) já teve deliberadamente: manter PII **fora do job** do BullMQ. Não adianta blindar a fila e vazar pelo relatório de erro três linhas depois.

    A regra é **lista de permissão, nunca de bloqueio**. Bloqueio é o reflexo — `cpf`, `telefone`, `email` — e falha na primeira ocasião, porque o contrato `v1` preserva *"respostas adicionais e propriedades desconhecidas"*: campos cujo nome ninguém conhece de antemão. Um formulário de anúncio perguntando "qual seu CPF?" cria uma chave que nenhum bloqueio previu. Com permissão, campo novo nasce fora.

    Passa: `workspace_id`, `integration_event_id`, `source`, `external_lead_id`, mensagem e stack. **Nunca** o payload cru, nunca `Person`, nunca a submissão inteira. Quem precisa do conteúdo tem o lugar certo — a tela de Integrações, sob RLS, dentro do tenant.

## Verificar antes da Fase 0

- Prisma usa prepared statements nomeados, que **quebram em pooling transaction-mode**. Exige `pgbouncer=true` na connection string ou porta de session mode. Morde no primeiro deploy, não em produção.
- Confirmar a mecânica exata de `SET LOCAL` dentro de `$transaction` do Prisma e o comportamento do pooler do Supabase. A forma do desenho está travada; os detalhes de API precisam de verificação empírica.

**Consequences:** todo request e todo job passam por um wrapper de transação que seta o claim — uma função, escrita uma vez. Em troca, "workspace A não lê B" vira verificação de banco, demonstrável com um teste, em vez de promessa de code review. Sem RLS no worker, essa prova não existiria justamente no componente que toca todos os tenants.
