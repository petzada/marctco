# A fazer — geral

> Criado em **2026-08-12**, depois da auditoria que fechou o passo 1 das
> [ações manuais pendentes](./acoes-manuais-pendentes.md).
>
> Este arquivo é a fila **daqui em diante**, com os caminhos separados por quem
> consegue executá-los. `acoes-manuais-pendentes.md` continua sendo o histórico
> das ações de infraestrutura; aqui mora o que ainda falta e em que ordem.

## Estado da fatia, em uma linha

Os 17 tickets estão implementados, o **18** fechou a única lacuna de código
que a auditoria encontrou, e o item 1 fechou a prova em produção em
2026-08-12. A Fase 2 (operação do lead) também está no código; o tracker
fechou em 2026-08-17. **Nada conhecido de código bloqueia a Fase 3.**
O que resta desta fatia é o modelo Google (item 4, conta Pluga paga) e o
tamanho das imagens (item 5). Fechamento das Fases 0–2 e ações manuais
pendentes: [fechamento-fases-0-2.md](../fechamento-fases-0-2.md).

## O que já foi conferido — não reabrir

Marcado aqui para não voltar à fila por esquecimento. Cada linha foi verificada
contra código ou contra produção em 2026-08-12, não contra memória.

- [x] **Provisionamento em produção.** Workspace *Hugs Assessoria*
      (`ca942deb-3325-4342-a9e4-425cd56810dc`), slug
      `9c096b1a-6bcc-44cc-bb00-22a72139b26d`, você como `OWNER`, funil `Comercial`
      default, conexão `PLUGA` `ACTIVE` com token `••••L9rA`. Evidência completa em
      `acoes-manuais-pendentes.md`, seção 1.
- [x] **Marcação em `app_metadata` correta em todos os seis critérios** — booleano
      estrito, nome não vazio, nada em `user_metadata`, login renovado, sem
      associação prévia, direito gasto. Idem.
- [x] **RLS provado em produção, não só em teste.** Conectado como `marctco_app`
      **sem** contexto de tenant, as seis tabelas de negócio retornam `0` linhas;
      com `app.workspace_id` setado, as linhas do workspace aparecem. É a rede do
      ADR-0006 funcionando no banco real.
- [x] **Origem do lead no card e na tabela** (critério do ticket 13 que estava
      desmarcado): entregue pelo ticket 12 e provado por teste —
      `apps/web/lib/leads/row-view-model.ts:43`,
      `components/leads/leads-table.tsx:69,96`,
      `components/leads/lead-card-content.tsx:61`,
      `lib/leads/row-view-model.test.ts:43,48`. Ticket 13 atualizado.
- [x] **Dead letter com motivo de erro** (critério do ticket 14 que a seção de
      evidência ainda dava como aberto): fechado pelo ticket 15 — migration
      `20260811001500`, `status = FAILED` no worker, coluna "Erro" e seção "Fila
      morta" na tela. Ticket 14 atualizado: 27 de 28.
- [x] **Suíte local verde** na auditoria: `pnpm test:unit`, 46 arquivos, 278
      testes.
- [x] **`REDIS_URL` nos dois serviços do Railway**, e o worker consumindo. Ver
      `acoes-manuais-pendentes.md`.
- [x] **Actions do CI fora do Node.js 20 deprecado.** As anotações do run pós-merge
      do PR #32 avisavam que `actions/checkout@v4`, `actions/setup-node@v4`,
      `pnpm/action-setup@v4`, `docker/setup-buildx-action@v3` e
      `docker/build-push-action@v6` ainda declaravam `node20` e estavam sendo
      forçadas para `node24` pelo runner. Todas subiram para a major que declara
      `node24` de origem (v7, v7, v6, v4, v7). Os breaking changes foram conferidos
      contra as notas de release e nenhum toca este workflow: o auto-caching de
      `setup-node` v5/v6 não se aplica porque `cache: pnpm` é explícito, o
      `version: 10.32.0` do pnpm casa com o `packageManager` do `package.json`, e
      os inputs/envs removidos pelas actions do Docker não eram usados.

---

## 1. ✅ Lead de teste ponta a ponta — **provado em produção, 2026-08-12**

Evidência em `registro.md`, seção "Fatia provada em produção". Não depende da
Pluga paga: o endpoint é provider-agnóstico, o token seleciona a conexão, e o
conector honra o `source` declarado no corpo — ou o provider, no caso da
conexão de landing page (`apps/worker/src/connector-v1.ts:67-70`).

### 1.1 Rotacionar o segredo (só a Direção faz)

O token em claro aparece **uma única vez, na geração** — o atual não está salvo em
lugar nenhum, e é assim de propósito. Rotacionar não recria a conexão nem perde
configuração; invalida o anterior no instante do commit.

1. Abra `https://web-production-33d67.up.railway.app/workspace/9c096b1a-6bcc-44cc-bb00-22a72139b26d/integrations/pluga`
2. Rotacione o segredo e **copie o valor em claro na hora**.

- [x] Token em mãos.

### 1.2 Disparar o `POST`

Servidor-servidor, do seu terminal. `source` declarado como `LANDING_PAGE` para
que o lead não entre rotulado como Meta:

```bash
curl -i -X POST \
  'https://web-production-33d67.up.railway.app/v1/integrations/pluga/leads' \
  -H 'Authorization: Bearer COLE_O_TOKEN_AQUI' \
  -H 'Content-Type: application/json' \
  -d '{
    "schema_version": "v1",
    "source": "LANDING_PAGE",
    "external_lead_id": "teste-ponta-a-ponta-2026-08-12",
    "name": "Maria Souza",
    "phone": "11999998888",
    "email": "maria@exemplo.com",
    "cpf": "52998224725",
    "financing_type": "VEHICLE",
    "financial_institution": "Banco Exemplo",
    "installment_amount": "1.250,90",
    "campaign_id": "teste-manual",
    "form_id": "simulacao-revisional"
  }'
```

Nenhum campo comercial é obrigatório, mas **mantenha telefone ou e-mail**: sem os
dois o lead vai para quarentena de propósito (ticket 10) e o teste não prova o
caminho até a Oportunidade. O `external_lead_id` fixo é intencional — repetir o
mesmo `POST` depois prova a retransmissão inerte do ticket 11 sem criar segundo
lead.

- [x] **200** com `{"status":"accepted"}`. Um **401** significa token errado; um
      **400**, JSON malformado. Confirmado em 2026-08-12 23:39:23Z.

### 1.3 Conferir o resultado

O dispatcher varre a outbox a cada **2 s** (`DEFAULT_DISPATCH_INTERVAL_MS`), então
segundos, não minutos.

- [x] Histórico da tela de Integrações mostra o evento, com nome/telefone/e-mail
      reconhecidos.
- [x] Tela de Leads mostra *Maria Souza*, origem **Landing page**, etapa de
      entrada do funil `Comercial`.
- [ ] `railway logs --service web` traz `integration_event_received result="accepted"`
      e `railway logs --service worker` traz o processamento do evento.

Se algo não aparecer, o próximo passo é a auditoria de leitura do banco (o script
usado em 2026-08-12 consulta eventos por status, `persons` e `opportunities` sob
contexto de tenant) — peça e eu rodo.

### 1.4 Depois que passar

- [x] Repetir o **mesmo** `POST` e confirmar que **não** nasce segundo lead
      (ticket 11, retransmissão inerte). Segundo `POST` aceito em 2026-08-12
      23:41:40Z (`200` `accepted`).
- [x] Um `POST` sem telefone e sem e-mail, confirmando quarentena e o fluxo
      "completar e liberar" (tickets 10 e 14). `POST` aceito em 2026-08-12
      23:45:11Z (`external_lead_id` `teste-quarentena-2026-08-12`, nome
      *Joao Sem Contato*). 
- [x] **Criar a conexão de landing page** (ticket 18): abrir
      `/workspace/<slug>/integrations/landing-page`, clicar em "Gerar segredo",
      copiar na hora, e disparar um `POST` para
      `/v1/integrations/webhooks/leads` com esse token. Confirmar que o lead
      entra com origem **Landing page** mesmo **sem** declarar `source` no
      corpo — é o provider da conexão que decide — e que a Pluga continua
      recebendo normalmente com o token dela. `POST` aceito em 2026-08-12
      23:50:04Z (`external_lead_id` `teste-lp-propria-2026-08-12`, nome
      *Ana Landing Page*, **sem** `source` no corpo).
- [x] Marcar o critério da fatia como provado em produção no `registro.md`.

---

## 2. ✅ Revogar o direito de provisionar pendurado — **revogado, 2026-08-12**

A re-marcação manual deixou `can_provision_workspace: true` num login que já é
`OWNER`. Inócuo hoje (quem tem associação nunca provisiona), mas é um direito
armado: sem a associação, esse login criaria um segundo workspace. SQL em
`acoes-manuais-pendentes.md`, seção 1.

- [x] Direito revogado.

---

## 3. ✅ Conexão de landing page não tinha como nascer — **fechado pelo ticket 18**

Implementado em 2026-08-12. A tela de LP ganhou painel próprio de segredo
(gerar, rotacionar, ativar/desativar), agindo sobre o provider `LANDING_PAGE` e
só sobre ele. As quatro rotas de segredo/status passaram a sair de uma fábrica
parametrizada por `IntegrationSurface`, então a próxima origem não pode nascer
apontando para o provider errado. Evidência e o que ficou de fora em
[issues/18-conexao-de-landing-page-com-segredo-proprio.md](./issues/18-conexao-de-landing-page-com-segredo-proprio.md).

Falta só apertar o botão em produção — está incluído no item 1 abaixo.

<details>
<summary>O diagnóstico original, preservado</summary>

**A tela de landing page documenta um token que nenhuma superfície emite.**

- A tela (`apps/web/app/workspace/[slug]/integrations/landing-page/page.tsx:64`)
  instrui: *"use o token exclusivo da conexão de landing page"*.
- A única rota que cria ou rotaciona segredo é a da Pluga, e ela fixa
  `const PROVIDER = "PLUGA"` (`integrations/pluga/secret/route.ts:13`).
- O modelo suporta a conexão sem nenhuma mudança de schema:
  `IntegrationProvider` já tem `LANDING_PAGE`, o unique é
  `@@unique([workspace_id, provider])`, e `createIntegrationConnection` /
  `rotateIntegrationConnectionSecret` / `setIntegrationConnectionStatus` já
  **recebem `provider` como parâmetro**. Falta a superfície, não a fundação.
- Produção confirma: existe **uma** conexão, `PLUGA`.

Consequência prática: hoje um cliente com landing page própria só consegue enviar
lead usando o token da conexão Pluga. Funciona — o endpoint é provider-agnóstico —
mas mistura as duas origens numa credencial, então rotacionar por causa da Pluga
derruba a landing page, e desativar uma desativa a outra. O ticket 13 previa
"conexão separada"; ela não existe.

Isto **não bloqueia o item 1** e não é bug de código entregue: é escopo que
nenhum ticket cobriu. Caminho certo, quando você quiser pegá-lo: `/grill-with-docs`
para decidir a superfície (a tela de LP ganha painel próprio de segredo? uma tela
de Integrações única lista as duas conexões?) e daí `/to-tickets` ou `/implement`
direto, que é candidato natural a **ticket 18**.

</details>

- [x] Decidido e implementado — painel próprio na tela de LP, sem histórico por
      conexão. As duas perguntas em aberto estão respondidas no topo do ticket 18.

---

## 4. 🟡 Modelo Google Lead Form — bloqueado por conta paga da Pluga

Os dois últimos critérios dos tickets 13 e 14. **Não é código**: é um documento a
escrever depois de ver o payload real, e a tela já diz isso ao usuário em vez de
inventar um modelo. Enquanto não houver conta paga com formulário Google
conectado, permanece parado — e nada mais no produto espera por ele.

Quando houver conta: disparar um lead de teste na Pluga, conferir **primeiro**
nome, telefone e e-mail no mapeamento, e só então escrever o modelo copiável,
declarando `source` como `GOOGLE_LEAD_FORM` (sem isso, uma conexão Pluga assume
Meta).

- [ ] Conta Pluga paga contratada.
- [ ] Modelo escrito e critérios dos tickets 13 e 14 fechados.

---

## 5. ⚪ Tamanho das imagens — não bloqueante

Web ~1.5 GB, worker ~1.3 GB, porque o runtime copia `node_modules` inteiro com
devDependencies. `pnpm prune --prod` **não serve** (remove e reinstala o
diretório, levando o client do Prisma gerado no build — falha que só apareceria na
primeira query em produção). O caminho é
`pnpm deploy --filter @marctco/web --prod`, e merece passada de teste própria.
Detalhes em `acoes-manuais-pendentes.md`.

- [ ] Encarado quando incomodar.
