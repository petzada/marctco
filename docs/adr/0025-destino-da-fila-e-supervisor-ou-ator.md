# Destino da fila é Supervisor ou o próprio ator

Da fila sem dono, Gestão e Direção **atribuem só a um Supervisor ou a si mesmas**. Atendente nunca nasce dono direto da fila. O Supervisor destino tem de estar `ACTIVE` **e** ter ao menos uma tag — sem tag não há time, e o card sairia da fila para quem não reatribui. Férias ou urgência: o ator assume o card e depois **reatribui**. Sem essa restrição, o primeiro clique da manhã pula o Supervisor, e o dois níveis que o [ADR-0024](./0024-fila-sem-dono-e-da-gestao.md) protegeu pelo lado de quem vê a fila fura pelo lado de quem a recebe.

**Status:** accepted · 2026-08-13

Emenda a linha “Atribuir” da matriz do [ADR-0015](./0015-perfis-de-acesso-e-escopo.md). Não muda quem vê a fila ([ADR-0024](./0024-fila-sem-dono-e-da-gestao.md)) nem quem reatribui: Gestão e Direção continuam reatribuindo em qualquer lugar; o Supervisor, só dentro do time.

**Considered option (rejeitada):** atribuir da fila a qualquer membro ativo, inclusive Atendente. Mais curto de implementar e era o texto do ticket 06. Recusada porque o Atendente dono direto da fila torna o segundo nível opcional no primeiro clique.

**Consequences:** `assignLead` recusa destino `ATTENDANT`, recusa outro `MANAGER` que não seja o ator, recusa `OWNER` que não seja o ator. Destino válido: `SUPERVISOR` `ACTIVE` deste workspace **com ao menos uma tag**, ou `assigned_user_id = ator`. Supervisor sem tag não entra no dropdown da manhã e a operação recusa no servidor — sem tag não há time, e o card sumiria da fila para quem não reatribui. O dropdown não lista atendente. Gestão que precisa colocar o card em quem liga assume e reatribui — dois gestos, de propósito.
