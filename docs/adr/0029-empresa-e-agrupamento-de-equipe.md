# Empresa é agrupamento de equipe, nunca tenant nem dimensão do card

A empresa do grupo (ACR, REAL) existe como **agrupamento de equipes**: uma tabela `Company` mínima por workspace e uma `Tag.company_id` que aponta a equipe para a empresa. O membro **nunca** carrega empresa — ela é derivada da equipe dele. Empresa não entra em RLS, em roteamento, em permissão nem na Oportunidade.

**Status:** accepted · 2026-08-14

Fecha a avaliação da orientação externa sobre "business units" de 2026-08-14, junto do [ADR-0030](./0030-workspace-e-fronteira-do-dono.md). Depende do [ADR-0028](./0028-tag-e-o-time-supervisor-nao-alcanca-supervisor.md), que tirou a marca do verbete da tag. Não reabre o [ADR-0020](./0020-tag-no-membro-define-o-time.md): a tag continua no membro e continua sendo o que computa escopo.

## O problema

Uma sub-empresa do grupo pode ter **várias equipes comerciais, com Supervisores diferentes**. A Direção precisa ler, depois, "o atendente X atendeu N e faturou R$, e ele é da ACR" e "a equipe Y faturou na REAL". A tag sozinha dá **um nível de agrupamento**: com a semântica OU do time, marcar a equipe e marcar a empresa no mesmo catálogo plano junta as duas leituras num escopo só.

Achatar no nome do rótulo — `ACR — Time do João` — mantém um eixo e custa zero código, mas torna a empresa ilegível para consulta: "tudo da ACR" passa a depender de convenção de nome, e um erro de digitação cria uma empresa que só existe em metade das linhas.

## Por que não na Oportunidade

Foi a primeira coisa examinada e a primeira recusada. **Campanha, quem atendeu, quem fechou e quem contabiliza a venda podem ser quatro coisas diferentes,** e nenhuma delas foi confirmada pelo negócio. Gravar empresa no card hoje fixa em schema uma semântica que ninguém validou — e schema errado sobre dado que já entrou é o caro de desfazer.

O caminho de leitura é a derivação:

```
Opportunity → responsável → equipe (tag) → empresa
```

Quando o relatório virar requisito concreto — Fase 7, junto de honorários, item A10 do [plano](../plano-de-construcao.md) — a forma prevista é **snapshot no Ganho** de responsável, equipe e empresa, porque um lead que passa da equipe Y para a equipe Z e é ganho lá pertence a Z. Até lá a semântica fica aberta de propósito.

O número do diretor não está bloqueado por esta decisão: está bloqueado por honorários, que derivam da análise de cabimento e não existem ainda.

**Considered options (rejeitadas):**

- **`Tag.kind: COMPANY | TEAM`,** com o membro carregando uma de cada. Sem tabela nova, mas exige a regra "no máximo uma tag `COMPANY` por membro" e — pior — deixa a tag de empresa cair no cálculo do time, onde a semântica OU juntaria a ACR inteira num escopo só. É um campo cuja má aplicação **vaza escopo**, e o [ADR-0015](./0015-perfis-de-acesso-e-escopo.md) já sentenciou que escopo mora num lugar só.
- **Empresa como texto livre na tag.** Renomear a empresa vira `UPDATE` em N tags, e um erro de digitação cria empresa fantasma justamente no número que o diretor vai olhar.
- **Empresa como coluna da Oportunidade.** Ver acima: fixa semântica não validada, e abre a porta para alguém usá-la como filtro de permissão.
- **Business unit como sub-tenant,** com campanha apontando para uma ou mais unidades e uma Oportunidade por unidade. É a orientação externa avaliada nesta data. Recusada por três razões: a mesma pessoa receberia duas ligações do mesmo grupo; fabricaria em massa exatamente a anomalia que o "possível duplicado" do [ADR-0007](./0007-ingestao-idempotencia.md) existe para detectar; e dobraria qualquer leitura de mídia. O roteamento por campanha já tinha sido recusado no [ADR-0022](./0022-workspace-e-fronteira-de-captacao.md).

**Consequences:** `Company` e `Tag.company_id` nascem anuláveis (expand/contract do [ADR-0010](./0010-migrations-e-ci-cd.md)) e entram no Seam 3 com as mesmas varreduras de toda tabela nova — RLS habilitada e forçada, policy de isolamento, índice começando por `workspace_id`.

A empresa é gerida **na tela Equipe**, no mesmo gesto em que a tag é criada e aplicada. Não nasce tela de taxonomia em Configurações, pelo mesmo motivo do [ADR-0020](./0020-tag-no-membro-define-o-time.md).

**Nada em escopo, RLS ou roteamento lê `company_id`.** Quem o ler para decidir o que alguém alcança está com bug, e o Seam 3 é onde essa afirmação vira teste. Como o membro não carrega empresa, não existe o campo que alguém usaria como eixo de permissão — a proteção é a ausência, não a disciplina.

Entra na Fase 2 porque as tags nascem lá, com usuários reais: classificar depois não é migration, é reclassificar à mão rótulos já em uso pela operação.
