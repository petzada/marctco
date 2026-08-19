# 09 — Supervisor não alcança Supervisor

**What to build:** O conjunto do time exclui os outros `SUPERVISOR`. O ator continua dentro do próprio time; os pares, não. Sem isso, dois Supervisores marcados com a mesma tag veem e **reatribuem** o lead um do outro, e nenhuma recusa dispara — porque, pela regra de hoje, o outro está mesmo no time dele ([ADR-0028](../../../docs/adr/0028-tag-e-o-time-supervisor-nao-alcanca-supervisor.md)).

**Blocked by:** 05 — Escopo real do Supervisor (já em `main`) · 06 — Atribuir e reatribuir (já em `main`)

**Status:** ready-for-agent

## O defeito que ele fecha

`ADR-0020` definia time como "quem compartilha ao menos uma tag" — um **OU** sobre um catálogo plano e simétrico. Uma sub-empresa com duas equipes comerciais, cada uma com seu Supervisor, marca as duas com rótulos que a Direção escolheu; se os dois rótulos coincidirem, ou se um Supervisor receber a tag do outro, os escopos se fundem.

O efeito é o modo de falha que o [ADR-0015](../../../docs/adr/0015-perfis-de-acesso-e-escopo.md) chama de vazamento interno silencioso: nada erra, nenhuma exceção sobe, o escopo só é maior do que a regra promete. A história 34 da [spec](../spec.md) ("não quero alcançar lead cujo dono atual está fora do meu time") não pega, porque tecnicamente o dono atual **está** no time.

## Acceptance criteria

- [ ] A função pura do time em `packages/domain` exclui do conjunto os membros com papel `SUPERVISOR` que não sejam o ator. O ator continua dentro
- [ ] O papel do membro passa a ser entrada da função pura — hoje ela recebe tags e quadro; precisa do papel para excluir
- [ ] Seam 1: dois Supervisores com a mesma tag não se veem; cada um vê os Atendentes da tag; o ator se vê; Supervisor sem tag continua com conjunto vazio; `DETACHED` continua fora
- [ ] `reassignLead` do Supervisor recusa quando o **dono atual** é outro Supervisor da mesma tag, e recusa quando o **destino** é outro Supervisor — o destino de reatribuição do Supervisor é Atendente do time ou ele mesmo
- [ ] A tabela de Leads do Supervisor deixa de trazer o lead que está com outro Supervisor da mesma tag
- [ ] A Equipe do Supervisor deixa de listar os outros Supervisores da mesma tag
- [ ] Gestão e Direção **não** mudam: continuam alcançando tudo, inclusive reatribuir entre Supervisores — cobrir férias e saída é delas ([ADR-0015](../../../docs/adr/0015-perfis-de-acesso-e-escopo.md))
- [ ] Um **Atendente** com duas tags continua no time de dois Supervisores, e os dois o alcançam. É consequência aceita e tem teste que a fixa, para ninguém "corrigir" depois: a exclusão vale entre quem comanda, não sobre quem é comandado
- [ ] `assignLead` não muda — destino da fila continua Supervisor com tag ou o próprio ator ([ADR-0025](../../../docs/adr/0025-destino-da-fila-e-supervisor-ou-ator.md))
- [ ] Costura principal cobre a distribuição em dois níveis ponta a ponta com **dois** Supervisores na mesma tag, provando que a de um não vaza para a do outro

## Fora deste ticket

Empresa e agrupamento de equipes (ticket 08). Semântica E entre tags — recusada no ADR-0028. Constraint de "um Supervisor por tag" — recusada no mesmo ADR.
