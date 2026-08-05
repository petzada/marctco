# Fluxo de dados no app: Server Component lê, route handler escreve

> *Emendado pelo [ADR-0016](./0016-contexto-de-acesso-e-leitor-escopado.md).* Continua valendo que Server Component lê chamando `packages/db` direto, sem endpoint por tela. O que muda é **o que a chamada devolve**: leituras nomeadas recebendo `AccessContext`, não o client transacional do Prisma. Keyset, índice parcial e escopo de papel passam a viver dentro dessas funções, em vez de dependerem de cada tela repeti-los.

A leitura acontece em **Server Component**, chamando direto o helper de transação de `packages/db`. Filtro, paginação e contadores vivem na **URL**, via `nuqs`. A escrita acontece em **route handler sob `/workspace/:slug/...`** — não em Server Action. A paginação é **keyset**, nunca `OFFSET`. Escrita concorrente é arbitrada por **condição no `WHERE`**, nunca por leitura anterior. `@tanstack/react-query` entra na Fase 2, onde ganha o lugar.

**Status:** accepted · 2026-08-05

## O problema

O [ADR-0006](./0006-rls-duas-camadas-guc-worker.md) regra 8 dizia *"TanStack Query chama rotas do Next; as rotas usam Prisma"*. A frase foi escrita para responder **"o browser fala com o Postgres?"** — e responde bem. Ela não responde "a tabela de Leads renderiza no servidor ou no cliente?", e não menciona Server Component nem Server Action, que é onde o primeiro ticket de UI cai no primeiro dia.

Lida ao pé da letra, ela obriga a escrever endpoint + hook + tipo para cada tela, jogando fora o grão do App Router.

## Por que route handler e não Server Action

O [ADR-0012](./0012-contexto-de-tenant-na-url.md) tornou o tenant **estrutural**: ele vem do path e é validado contra `workspace_members` antes do GUC. Isso funciona porque o slug está na URL e não tem como não estar.

**Server Action não tem path.** É invocada por um identificador opaco, e o workspace precisa chegar como **argumento** — exatamente o "valor que o cliente pode influenciar" que o ADR-0006 regra 7 proíbe como fonte de GUC. Validar continua possível; o que o padrão faz é convidar ao esquecimento. Uma action nova entre dez, com um parâmetro a menos de validação, e o isolamento vaza sem sintoma.

O próprio guia de performance do Vercel chega ao mesmo lugar por outro caminho, na regra `server-auth-actions`: *autentique Server Actions como rotas de API*. Se a action precisa da mesma cerimônia da rota, a rota — que carrega o tenant na estrutura — sai na frente.

## Por que keyset e não OFFSET

Este é o item mais importante do documento, e não é sobre velocidade.

`OFFSET` numa lista ordenada por chegada decrescente assume lista parada. A de um cliente com investimento real em mídia não está: **um lead novo a cada poucos minutos**, entrando no topo. O gestor abre a página 2 dois minutos depois da página 1 — tudo deslocou uma posição, e ele **vê de novo um lead que já viu e nunca vê o que caiu na fronteira**.

Não é lentidão, é lead sumindo da triagem em silêncio, num CRM cujo princípio fundador é que nenhum lead pago pode sumir. É o mesmo pecado do ADR-0007 reaparecendo pela camada de apresentação.

Keyset — "me dê os N anteriores a este ponto" — é imune por construção: o cursor é uma posição estável, e o que chega depois não desloca nada. E não degrada com profundidade, enquanto `OFFSET 50000` faz o Postgres percorrer 50 mil linhas para descartar todas.

**Custo aceito:** some o "pular para a página 37". Numa lista cronológica de triagem isso não é perda — o gestor filtra, não navega para leads de oito meses atrás. Em compensação, some também o `COUNT(*)` de total geral, que existia só para calcular "página N de M".

A chave de cursor é `(arrived_at, id)`. O `id` desempata leads chegados no mesmo instante; sem ele, o cursor pula linha.

## Índices: o filtro e o contador são o mesmo objeto

Os contadores-filtro parecem caros — `COUNT(*)` por tipo, a cada carga, vezes o número de usuários. Só são caros se contarem a tabela toda. Com **índice parcial**, que contém apenas as linhas que casam com o marcador, contar "leads sem telefone" percorre exatamente os leads sem telefone.

- Lista: `(workspace_id, arrived_at DESC, id DESC) WHERE merged_into_opportunity_id IS NULL`. O parcial mantém as mescladas fora do índice — coerente com o ADR-0007, que já manda toda listagem ativa filtrá-las.
- Um índice parcial por marcador, servindo filtro e contador.
- `IntakeReview` por `(workspace_id, opportunity_id)` com as não resolvidas, porque os marcadores não moram todos no mesmo lugar: "sem telefone" é coluna da `Opportunity`, identidade e duplicidade são linhas de `IntakeReview`, e o ícone único do lead precisa dos três.

## Escrita concorrente: a condição arbitra

Toda escrita disputada usa **condição no `WHERE`** e devolve o que mudou. Nunca ler antes para decidir:

```sql
UPDATE opportunity SET assigned_user_id = :user
 WHERE id = :id AND assigned_user_id IS NULL
RETURNING id
```

Retorno vazio significa "alguém chegou antes", e a UI diz quem. É a mesma forma do `ON CONFLICT DO NOTHING` da ingestão ([ADR-0007](./0007-ingestao-idempotencia.md)): sob concorrência, só o banco arbitra.

Sem isso, dois gestores — ou o mesmo gestor em duas abas — veem o lead na lista, ambos atribuem, o último escreve e ninguém percebe. Dois atendentes ligam para o mesmo cliente: o marcador de possível duplicado derrotado pela porta da atribuição.

Daí decorre que **atribuir e reatribuir são operações diferentes**. Atribuir vale só sobre lead sem dono e falha limpo se perdeu a corrida. Reatribuir é ação deliberada, mostra o dono atual e pede confirmação — o gestor precisa dela quando o atendente sai de férias, e ela não pode acontecer por acidente.

## Como a lista se mantém fresca

**Supabase Realtime está estruturalmente bloqueado neste desenho.** As policies keiam no GUC `app.workspace_id`, setado por `SET LOCAL` pelo servidor — não em `auth.uid()`. Uma conexão Realtime do navegador nunca passa por esse `SET LOCAL`, então `current_setting('app.workspace_id', true)` volta `NULL` e a policy nega tudo. Fazer funcionar exigiria um segundo conjunto de policies baseado em `auth.jwt()` — duas fontes de verdade para isolamento, que é o que o ADR-0006 recusa.

O padrão é o mesmo princípio do keyset: **o cursor fixa a vista, o novo se acumula acima, e o usuário puxa quando quiser.** Um endpoint pequeno de contagem, consultado periodicamente, alimenta um indicador de "N novos"; ao clicar, `router.refresh()` re-renderiza. Lista que se remexe sozinha sob o cursor é hostil — é o defeito do `OFFSET` outra vez, causado pela UI em vez do banco.

## Regras de performance que passam a valer

Do guia do Vercel, as que são vinculantes neste desenho:

| Regra | Por que aqui |
|---|---|
| `server-no-shared-module-state` | **É isolamento, não performance.** Ver ADR-0006 regra 12 |
| `server-cache-react` | A resolução do slug → validação de associação → GUC acontece em vários pontos da árvore RSC. `React.cache()` deduplica **por requisição**, que é o escopo seguro |
| `server-cache-lru` | Cache entre requisições **exige `workspace_id` na chave**. Continua proibido para o lookup de token, que precisa parar de funcionar na rotação |
| `async-parallel` · `server-parallel-fetching` | Página e contadores em paralelo, não em cascata |
| `async-suspense-boundaries` | A tabela transmite primeiro; os agregados chegam depois |
| `server-serialization` | Nunca passar o payload cru para client component — ele carrega CPF e telefone |
| `bundle-barrel-imports` | `lucide-react` é barrel; importar pelo caminho do ícone, não pelo índice |
| `async-cheap-condition-before-await` | Condição síncrona barata antes de qualquer espera remota. É o que sustenta o limiter em memória do [ADR-0012](./0012-contexto-de-tenant-na-url.md) |

**Tensão registrada, a resolver quando doer:** `async-parallel` pede consultas simultâneas; o ADR-0006 regra 5 pede toda leitura dentro de transação com `SET LOCAL`. Em pooling transaction-mode, cada transação prende uma conexão — quatro consultas paralelas são quatro conexões por render. Com dezenas de usuários simultâneos isso vira demanda de conexão relevante. A saída, se apertar, é uma transação por render com as consultas serializadas dentro, trocando conexões por latência. Não antecipe: meça primeiro.

## Consequences

`ADR-0006` regra 8 é emendada. `@tanstack/react-query` sai da Fase 1 e volta na Fase 2, no Kanban com arrastar-e-soltar e na remoção otimista da linha atribuída — onde cache de cliente e atualização otimista de fato pagam. `nuqs`, já previsto na stack, passa a ser obrigatório para filtro e cursor, e de quebra torna toda vista compartilhável por link: o gestor manda "olha esses 12 sem telefone" para o time colando uma URL.
