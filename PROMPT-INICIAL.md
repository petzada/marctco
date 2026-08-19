# Prompt inicial para a sessão de implementação

> **Fases 0–3 entregues.** Este prompt abriu a fatia quando o repositório não tinha código de produção. Não use como estado atual. Fechamento 0–2: [`.scratch/fechamento-fases-0-2.md`](.scratch/fechamento-fases-0-2.md). Fechamento Fase 3: [`.scratch/tempo/PROMPT-HANDOFF.md`](.scratch/tempo/PROMPT-HANDOFF.md). Próximo: Fase 4 · Canal do [plano](docs/plano-de-construcao.md).

Cole o bloco abaixo numa sessão nova do Claude Code, na raiz do repositório clonado.

---

```
Vou implementar a fatia vertical de fundação e ingestão deste CRM. O repositório
tem zero código de produção — só documentação de decisão, spec e tickets. Toda a
arquitetura já foi decidida e travada numa sessão de grelha anterior.

# Leitura obrigatória, nesta ordem, antes de escrever qualquer linha

1. `AGENTS.md` — escada de precedência entre documentos e índice dos 18 ADRs.
   Os documentos deste repo conflitam entre si de propósito; a escada resolve.
2. `CONTEXT.md` — glossário. É a linguagem ubíqua, em PT-BR.
3. `docs/adr/0005-idioma-codigo-en-ui-pt-br.md` — código em inglês, UI em PT-BR,
   com a tabela de mapeamento canônica. Model sem linha nessa tabela é model com
   nome improvisado.
4. `docs/plano-de-construcao.md` — as 8 fases e os itens registrados como abertos.
5. `.scratch/fundacao-e-ingestao/spec.md` — a spec desta fatia: user stories,
   decisões de implementação e os 3 seams de teste.
6. `.scratch/fundacao-e-ingestao/README.md` — grafo de dependências dos tickets.

Leia o ADR correspondente ao ticket em que estiver mexendo. Eles contêm os modos
de falha silenciosos deste stack — em especial o ADR-0006, que explica por que
Supabase RLS + Prisma não encaixam sozinhos. Os vinculantes desta fatia são
0002, 0004, 0005, 0006, 0007, 0008, 0009, 0010, 0011, 0012, 0013, 0014, 0015,
0016, 0017 e 0018;
o 0004 rege o ticket 16 (catálogo de flags), o 0002 rege workspace e tags, o
0012 rege as rotas de toda a aplicação e o 0013 rege como todo dado chega na
tela e volta dela.

Ao tocar UI, `DESIGN.md` é lei visual — e o ticket 02 existe justamente porque o
arquivo de tokens que ele referencia ainda não existe no repositório.

# Skills

As skills do projeto viajam no repositório e não precisam ser instaladas: estão
em `.agents/skills/` com espelho em `.claude/skills/`, travadas em
`skills-lock.json`. Disponíveis, entre outras: `implement`, `to-spec`,
`to-tickets`, `domain-modeling`, `tdd`, `design-taste-frontend`, `supabase`,
`supabase-postgres-best-practices`, `shadcn`, `code-review`.

Ao implementar UI, siga `design-taste-frontend` — é obrigatória pela stack
travada. Ao mexer em schema, RLS, policies ou migrações, carregue
`supabase-postgres-best-practices` antes de escrever SQL.

# Como trabalhar

Os tickets são arquivos em `.scratch/fundacao-e-ingestao/issues/`, numerados em
ordem de dependência. Trabalhe a fronteira: qualquer ticket cujos bloqueadores
estejam todos concluídos; em empate, o menor número vence.

Um ticket por vez, com `/implement`. Ao concluir, marque os critérios de aceite
e atualize o `Status:` do arquivo.

Comece pelo ticket 01 (ou 02, que também não tem bloqueador).

**Sempre branch, nunca push direto na `main`.** O ticket 01 estabelece esse fluxo
— branch, push que abre PR automático, CI verde, merge — e ele passa a valer para
todo ticket seguinte, inclusive para você.

# Regras que não se re-litigam

As decisões abaixo foram tomadas deliberadamente, com alternativas descartadas
registradas nos ADRs. Se algo parecer errado, leia o ADR correspondente antes de
propor mudança — e traga a proposta a mim em vez de mudar por conta própria.

- Código em inglês, UI em PT-BR, sem acento em identificador.
- O worker roda SOB RLS, não com service_role.
- Existem TRÊS consultas sem contexto de tenant, e a lista é FECHADA: resolução de
  token, descoberta de pendências e provisionamento de workspace. Cada uma é uma
  função SECURITY DEFINER em schema `private`, e o Seam 3 reprova a quarta.
  `claim_pending_events` devolve `(id, workspace_id)` e nunca o `raw`.
- Papéis nascem nas migrations, com prefixo `marctco_`. Senha jamais em migration.
- Workspace nasce por `provision_workspace`, em UMA transação: tenant + vínculo do
  dono + funil padrão. O direito de provisionar vive em `app_metadata` e NUNCA em
  `user_metadata`, que o próprio usuário edita pelo SDK do cliente.
- App e worker ABORTAM O BOOT se o papel conectado for superusuário, tiver
  BYPASSRLS ou for dono de tabela de negócio. Nenhum CI pega a string errada
  no Railway; só o processo em produção pega.
- Toda rota autenticada vive sob `/workspace/:slug`, com `slug` UUIDv4 validado
  contra WorkspaceMember a cada requisição. Workspace alheio devolve 404, nunca
  403, e a tentativa é registrada. `/onboarding` fica fora do prefixo.
- Na ingestão, `workspace_id` do corpo é IGNORADO. Na sessão, a escolha do
  usuário é VALIDADA. Não são a mesma regra.
- `token_hash` é SHA-256 determinístico com índice único. Não bcrypt, não argon2:
  hash salgado por linha torna a busca por índice impossível na rota mais quente.
- Desenvolvimento contra Postgres e Redis em Docker local. `prisma migrate dev`
  é PERMITIDO contra o local e PROIBIDO contra qualquer banco remoto.
- Contra produção, só `prisma migrate deploy`. Não existe Supabase local nem
  staging; o único projeto Supabase é produção.
- Workflow de PR não recebe nenhum secret nem connection string de produção.
- No PR: migrate deploy do zero, drift check, varredura de DDL destrutiva, RLS.
- Após o merge: job de release serializado aplica a migration; só então o Railway
  faz deploy, com Wait for CI. Railway nunca antecede a migration verde.
- Fixtures e caminho de upgrade estão ADIADOS por decisão (A13). Não construa.
- `packages/domain` não importa Prisma e não faz I/O.
- O endpoint de ingestão responde 200 sempre; nunca 409.
- Nenhum campo de negócio é obrigatório na ingestão.
- `IntegrationEvent` é a outbox: commit no PostgreSQL → 200; dispatcher publica
  no BullMQ depois. Redis indisponível não muda a resposta nem perde o evento.
- Duplicata é detectada por INSERT ... ON CONFLICT DO NOTHING RETURNING id, NÃO
  capturando a violação: em Postgres o erro aborta a transação, e o worker tem
  de seguir depois para registrar o reenvio. A constraint continua sendo a única
  árbitra; o que mudou é o mecanismo, não a regra.
- Quando a origem não manda ID, `external_lead_id` vem do `IntegrationEvent.id`.
  NUNCA hash do payload com janela de tempo — engole lead novo em silêncio.
- LP envia servidor-servidor; segredo de integração nunca vai para o navegador.
- CRM é dono do contrato canônico `v1`; Pluga faz o De→Para de Meta/Google. Isso
  foi VERIFICADO: o HTTP Request da Pluga monta JSON livre, sem envelope próprio.
  O modelo Meta já tem campos confirmados; o Google espera teste em conta real.
- Funil é fluxo operacional COMERCIAL/LEGAL, criado pelo cliente. Tipo de
  financiamento é atributo opcional da Oportunidade e NUNCA escolhe o funil.
- Todo funil em uso tem uma `ENTRY` e ao menos uma `CLOSING`. Destino da ingestão
  é o funil comercial `is_default`, sobrescrito por `target_pipeline_id`.
- `CLOSING` é papel de FLUXO, não de resultado: marca onde a jornada em aberto
  termina. Ganho e perdido continuam sendo `status`, jamais etapas do Kanban.
- Telefone não decide conflitos. Pessoa preserva múltiplos telefones/e-mails.
- DÚVIDA NUNCA SEGURA O LEAD. Conflito de identidade cria Pessoa nova; duas
  Oportunidades EM ABERTO da mesma Pessoa se ligam SEMPRE, inclusive sem dado
  algum de financiamento — financiamento é discriminador na tela, nunca gatilho.
  Ambos viram MARCADOR no card, resolvido depois por mesclagem não destrutiva.
  O único envio que não vira Oportunidade é o sem telefone e sem e-mail, que vai
  para quarentena.
- Sair da quarentena EXIGE ao menos um contato. Não existe "liberar sem
  completar". O `arrived_at` do lead liberado é o instante da LIBERAÇÃO — a
  quarentena é o único lugar onde algo fica retido, e relógio que nasce estourado
  não tem como ser zerado.
- Mesclagem TRANSFERE: as FKs são reapontadas na mesma transação e o ponteiro é
  lápide, nunca indireção de leitura. Nenhum registro ativo aponta para um
  registro mesclado — invariante do Seam 3.
- Um lead, UM ícone. Todos os avisos de um lead abrem de um único ponto de
  entrada; jamais um rótulo por tipo espalhado pela linha da tabela.
- Server Component LÊ, route handler sob `/workspace/:slug` ESCREVE. Nada de
  Server Action: ela não tem path, então o workspace viraria argumento vindo do
  cliente. Filtro e cursor na URL via `nuqs`. TanStack Query só na Fase 2.
- Paginação KEYSET por `(arrived_at, id)`, nunca OFFSET. Com lead entrando o dia
  todo, OFFSET desloca a lista entre páginas e faz lead sumir da triagem.
- Escrita disputada é arbitrada por condição no WHERE com RETURNING — atribuir
  usa `AND assigned_user_id IS NULL`. Reatribuir é outra operação, explícita.
- Supabase Realtime NÃO funciona aqui: as policies keiam no GUC, não em
  `auth.uid()`. A lista atualiza por contagem periódica + refresh explícito.
- NADA de estado mutável em escopo de módulo, nem no worker nem no app. A RLS
  não pega esse vazamento — ele acontece dentro do processo, depois do banco.
- Sentry e log usam ALLOWLIST, nunca denylist: passam ids, origem e mensagem.
  Nunca payload cru, nunca Person. O contrato v1 preserva campos desconhecidos,
  então denylist falha no primeiro campo que ninguém previu.
- Rate limit é EM MEMÓRIA e falha aberta. Nada de Redis: derrubaria a ingestão
  junto com a fila. Nenhum caminho novo devolve 429.
- O payload é guardado UMA vez, no IntegrationEvent, e expira em 90 dias — a
  linha fica, o conteúdo some. Quarentena não expira. `LeadSubmission` não tem
  `raw`; tem `last_integration_event_id`.
- Quatro perfis, e nenhum a mais: ATTENDANT, SUPERVISOR, MANAGER, OWNER. Uma regra
  nesta fatia: atendente só enxerga oportunidade atribuída a si.
- `AccessContext` é união: `UserContext` (workspace + usuário + papel) no app,
  `JobContext` (workspace + origem do trabalho) no worker e nas passadas
  agendadas do web. NÃO invente papel para o job preencher campo, e NÃO torne
  `role` opcional (ADR-0016). **Supersessão 2026-08-19:** a forma "workspace +
  evento" no topo virou `JobOrigin` (evento de integração real **ou** passada
  agendada nomeada); não há terceiro tipo de contexto.
- `packages/db` NÃO exporta o client do Prisma. Exporta operações nomeadas que
  recebem `AccessContext` — `listLeads`, `countLeadsByMarker`, `applyIntakePlan`.
  O client cru é interno e o CI reprova import de fora (ADR-0016).
- A ingestão é módulo de `packages/domain`, não roteiro do worker: `planSubmission`
  → `planPersonLookup` → `decideIntake` → `IntakePlan`, aplicado por `packages/db`
  numa transação. `now` é argumento, nunca lido por dentro. A variante
  `Retransmission` não tem campo de etapa, responsável, situação nem `arrived_at`
  — é assim que retransmissão não rebobina o funil (ADR-0017).
- "Completar e liberar" da quarentena chama a MESMA função da ingestão, com `now`
  = instante da liberação. Não reimplemente, não enfileire evento novo. O
  `InboundLead` ali vem do formulário, não do conector — o conector fica no worker.
- Handoff ao jurídico é ação do gestor, notificado quando o atendente conclui.
  Nenhum status ou etapa cria card jurídico sozinho.
- `FORCE ROW LEVEL SECURITY`, não apenas `ENABLE`.

# Atenção especial no ticket 01

Ele monta o ambiente local em Docker e o pipeline inteiro. O item A7 encolheu:
com Postgres local, `migrate dev` roda onde foi feito para rodar e a autoria de
migration não é mais aposta. O que resta verificar é mecânico — `SET LOCAL`
dentro de `$transaction` do Prisma e `pgbouncer=true` para prepared statements em
pooling transaction-mode. Se algum desses não funcionar, emende o ADR-0010
registrando o que foi descoberto e me avise antes de seguir.

# Gatilho que você precisa respeitar

**A6 — backup.** Produção roda SEM rede de backup enquanto o banco estiver vazio.
Isso é decisão consciente, não esquecimento. Mas há um gatilho objetivo: assim
que existir o PRIMEIRO lead real de cliente em produção, nenhuma migration nova
pode ser aplicada sem backup restaurável. Se você chegar num ponto em que vai
aplicar migration e já existe dado real, PARE e me avise.
```

---

## Por que este prompt é assim

**Ele não repete as decisões, aponta para elas.** Um prompt que resumisse os 18 ADRs criaria uma segunda fonte de verdade que envelhece na primeira emenda. O repositório é a fonte; o prompt é o mapa.

**Ele lista as regras que não se re-litigam** porque todas contrariam o reflexo padrão de quem chega sem contexto — e um agente novo tende a "consertar" cada uma delas. Dar service_role ao worker, apontar `migrate dev` para produção, retornar 409 em duplicata e exigir campos obrigatórios são exatamente os atalhos que a grelha descartou com motivo registrado.

**Ele grifa que dúvida não segura lead**, porque o reflexo de quem chega é criar fila de revisão para "não sujar o cadastro". Num CRM de mídia paga, cadastro sujo se limpa e lead frio não esquenta — a fila é o erro caro, não a duplicata.
