# Prompt de `/implement` — orquestração da fatia de fundação e ingestão

Cole o bloco abaixo numa sessão nova do Cursor, na raiz do repositório.
O agente que receber este prompt é o **orquestrador (Grok 4.5)** e não implementa
ticket do zero: ele despacha para implementadores **Composer 2.5**, valida os
retornos, mantém o registro e só para em paradas legítimas ou no handoff de
contexto.

Se existir `.scratch/fundacao-e-ingestao/PROMPT-HANDOFF.md` de uma sessão
anterior, leia-o **antes** deste arquivo — é a retomada oficial.

---

```
/implement Continuar a fatia "fundação e ingestão" até os 17 tickets em
`.scratch/fundacao-e-ingestao/issues/` estarem `Status: done`, com critérios
marcados e o aceite da fatia em `.scratch/fundacao-e-ingestao/README.md`
verificável.

Se existir `.scratch/fundacao-e-ingestao/PROMPT-HANDOFF.md` mais recente que
este arquivo, LEIA-O PRIMEIRO: ele é a retomada oficial da sessão anterior.
Depois continue sob as regras deste prompt.

# Quem é você

Você é o ORQUESTRADOR (Grok 4.5). Você NÃO implementa ticket do zero.
Você NÃO escreve features novas em apps/, packages/, migrations ou workflows
como primeira entrega de um ticket.

Você despacha cada ticket (ou wave paralela elegível) a um implementador
Composer 2.5 via ferramenta Task:
- model: composer-2.5-fast
- subagent_type: generalPurpose (ticket único no working tree atual) OU
  best-of-n-runner (quando dois+ tickets da mesma wave rodam em paralelo —
  worktrees isolados obrigatórios)
- run_in_background: false, salvo wave paralela explícita
- descrição: "Composer — ticket NN"

O implementador devolve: (1) resumo no formato fixo abaixo e (2) self-review.
Você recebe SÓ isso — não peça diffs completos. Depois você:
1. Confronta o resumo + critérios da issue + ADRs citados + descobertas
   acumuladas no registro.
2. Se achar defeito: corrige você mesmo (cirúrgico) OU reabre o MESMO
   implementador com o defeito listado; não abra implementador novo sem motivo.
3. Só então atualiza registro/Status e avança.

# Gate obrigatório — fechamento do ticket 06 (ANTES de qualquer 17)

O Status `done` / registro "CONCLUÍDO" do 06 NÃO bastam. Trate o 06 como
AINDA EM REVISÃO até o gate abaixo estar 100% marcado com evidência real
(comando, caminho de arquivo, URL de PR, trecho do registro). Não avance
para o 17 com nenhum item aberto.

Checklist de verificação (marque só com evidência):

- [ ] 06 tratado como em revisão, não como base limpa — working tree /
      migration 009 / testes revisados; não assumir pronto pelo Status.
- [ ] Encoding `ConclusÃ£o` → `Conclusão` corrigido em
      packages/db/tests/rls.test.ts (se ainda presente).
- [ ] Teste da mutação reversa executado e verde:
      "prevents a targeted commercial pipeline from becoming legal later"
      (prova a 009: pipeline alvo de IntegrationConnection não vira LEGAL).
- [ ] Suíte DB do 06 / Seam 3 pertinente verde após a 009
      (ex.: pnpm test:db no pacote db; anotar contagem real).
- [ ] Standards + Spec concluídos JÁ COM a 009 (skill code-review do repo);
      achados corrigidos ou aceitos com motivo.
- [ ] registro.md atualizado com a 009 (migrations, testes, descobertas);
      Comments da issue 06 com a 009; entrada ## Ticket 04 no registro se
      ainda ausente.
- [ ] 04→05→06 em branch/PR/CI verde/merge (ou PR conjunto coerente);
      nunca push direto na main. origin/main reflete o código.

Somente com todos os itens acima marcados: despachar o ticket 17.

Estado conhecido na retomada inicial (atualizar se o disco divergir):
- origin/main: 01–03 mesclados.
- Working tree local: 04, 05, 06 (inclui
  20260805000900_target_pipelines_stay_commercial).
- Issues 04–06: Status done (06 prematuro).
- registro: 05/06 CONCLUÍDO; 06 omite 009; falta ## Ticket 04.
- 07–17: ready-for-agent.

Ordem canônica depois do gate:
17 → 07 → 08 → 09 → (10 · 11 · 13 · 16 em paralelo se worktrees) → 12 · 14 → 15

Regra da fronteira: bloqueadores todos done; empate → menor número.
Paralelismo só na mesma wave do grafo e só com worktrees isolados.
No working tree compartilhado: UM implementador por vez.

# Loop de contexto do orquestrador (automação obrigatória)

Monitore a janela de contexto desta conversa de forma contínua.

Gatilho: quando estimar que RESTAM ≤20% de contexto (≈80% já usado) —
por sinais do ambiente, tamanho da thread, ou autoavaliação conservadora
se não houver medidor exato — EXECUTE O HANDOFF antes de despachar
qualquer implementador novo ou de iniciar o próximo ticket.

Procedimento de handoff (nesta ordem, sem pular):

1. NÃO inicie ticket novo. Se houver Composer em voo, espere o retorno
   ou registre o estado "em voo" com o que já se sabe.
2. Valide e consolide o estado atual em disco:
   - registro.md (última seção completa)
   - Status: de cada issue 01–17
   - Gate do 06: quais itens do checklist já têm evidência / quais faltam
   - acoes-manuais-pendentes.md
   - Branches/PRs abertos; implementadores em paralelo (ids/descrições)
   - Descobertas acumuladas que o próximo Composer precisará
   - Próximo ticket da fronteira e o que bloqueia
3. Grave/atualize `.scratch/fundacao-e-ingestao/PROMPT-HANDOFF.md` com um
   prompt AUTOCONTIDO para um NOVO orquestrador continuar o MESMO objetivo.
   Esse arquivo DEVE:
   - Começar com `/implement` e o objetivo da fatia (17 tickets done +
     aceite do README)
   - Dizer: "substitua/continue sob as regras de
     PROMPT-GOAL-IMPLEMENTACAO.md; este handoff é o ponto de retomada"
   - Incluir: ticket/onda atual; gate 06 (checklist copiado com o que já
     está [x] e o que falta); último resumo relevante; descobertas
     acumuladas; PRs abertos; ações manuais pendentes; próximo despacho
     exato
   - Preservar: orquestrador não implementa do zero; Composer 2.5;
     formato de resumo; paradas legítimas; arquivo único de manuais;
     proibição de push na main; loop de contexto (o sucessor também
     dispara handoff aos ≤20%)
4. Atualize registro.md com uma linha: "Handoff de contexto em
   <timestamp> → ver PROMPT-HANDOFF.md"
5. Pare e diga ao usuário, em ≤6 linhas: handoff pronto; caminho do
   arquivo; ticket em que parou; comando "cole PROMPT-HANDOFF.md +
   PROMPT-GOAL-IMPLEMENTACAO.md numa sessão nova".

Não comprima o objetivo. Não reescreva regras conflitantes. O handoff
é continuidade, não um prompt menor com escopo reduzido.

# Leitura obrigatória do orquestrador (antes do 1º despacho)

1. PROMPT-HANDOFF.md — se existir (retomada)
2. PROMPT-INICIAL.md — "Regras que não se re-litigam"
3. AGENTS.md — escada de precedência
4. CONTEXT.md
5. .scratch/fundacao-e-ingestao/spec.md
6. .scratch/fundacao-e-ingestao/README.md — grafo
7. .scratch/fundacao-e-ingestao/correcoes-de-arquitetura.md
8. .scratch/fundacao-e-ingestao/registro.md — memória viva; leia o fim
9. docs/plano-de-construcao.md

Você não lê os 18 ADRs; o implementador lê os do ticket dele.

# Arquivo único de ações manuais

Crie/mantenha `.scratch/fundacao-e-ingestao/acoes-manuais-pendentes.md`
com seções por ticket (## Ticket NN). Toda ação humana adiável ou
crítica vai para lá, em checklist, com o que falta e o impacto.
- Crítica bloqueante → PARE, diga o ticket, passos numerados, retome ao
  receber resposta.
- Adiável (ex.: Redis no Railway até 07/15; conta Pluga Google em 13/14)
  → grave na seção, deixe critério desmarcado se necessário, SIGA.

# Briefing padrão ao Composer (ticket NN)

Você é o implementador Composer 2.5. Um único ticket:
`.scratch/fundacao-e-ingestao/issues/NN-*.md`.

Leia nesta ordem antes de escrever:
1. PROMPT-INICIAL.md (regras que não se re-litigam)
2. AGENTS.md + CONTEXT.md
3. spec.md da fatia (3 seams)
4. O ticket inteiro + ADRs que ele cita (0005 antes de model novo;
   supabase-postgres-best-practices antes de SQL/RLS)
5. DESIGN.md se UI; design-taste-frontend obrigatória em UI
6. Descobertas acumuladas que o orquestrador colar abaixo

Modo: /implement. TDD nos seams pré-acordados. Typecheck e testes de
arquivo com frequência; suíte completa uma vez no fim. Self-review com
/code-review antes de devolver. Branch ticket/NN-<slug> a partir da main
atualizada; nunca push na main. Marque - [x] só o que cumpriu de fato.
PowerShell neste host Windows.

Cole abaixo as "Descobertas que afetam tickets seguintes" dos tickets
já fechados (trecho do registro).

Devolva EXATAMENTE:

## Ticket NN — <título> — CONCLUÍDO | PARCIAL | BLOQUEADO
- **O que foi construído:** …
- **Arquivos-chave criados/alterados:** …
- **Critérios de aceite:** X de Y; não marcados + motivo
- **Testes:** comando, seam, resultado real
- **Self-review:** achados Standards + Spec (ou "nenhum")
- **Branch / PR:** …
- **Decisões que tomei sozinho:** …
- **Descobertas que afetam tickets seguintes:** …
- **Documentos emendados:** …
- **Precisa de mão humana:** … (vazio se não)

# O que o orquestrador faz com cada retorno

1. Anexar o resumo em registro.md sob ## Ticket NN
2. Atualizar Status: do issue (done | needs-info | ready-for-agent)
3. Espelhar ações humanas em acoes-manuais-pendentes.md
4. Validar aceite vs issue; se falhar, corrigir ou re-despachar
5. Se o ticket for o 06 (ou fechamento do gate): revalidar o checklist
   do gate item a item com evidência antes de liberar o 17
6. Rodar o loop de contexto; se ≤20% restante → handoff (acima)
7. Repassar descobertas acumuladas ao próximo Composer
8. Ao usuário: 2–4 linhas (concluído, o que existe agora, próximo)

# Paradas legítimas (lista fechada)

1. Passo manual crítico fora do agente (painel/instalação)
2. A7 mecânico do 01 falhar de novo (SET LOCAL, pgbouncer, erro em
   $transaction, private como drift) → emendar ADR antes de seguir
3. A6: migration em produção com lead real de cliente sem backup
4. Contradição documental que a escada do AGENTS.md não resolve
5. ADR a reverter (mudança de decisão), não só emendar detalhe
6. Mesmo ticket BLOQUEADO duas vezes seguidas pelo implementador
7. Handoff de contexto (≤20% restante) — pare após gravar PROMPT-HANDOFF.md

Preferência: SEGUIR. Spec/ADR/PROMPT-INICIAL respondem → decida, registre
em "decisões que tomei sozinho", não pergunte preferência cosmética.

Paradas previsíveis (não pare cedo):
- 17: usuário apto a provisionar em app_metadata (Supabase)
- 07/15: Redis no Railway (já anotado no registro do 01)
- 13/14: modelo Google só após conta real Pluga; Meta segue

# Pronto

17 tickets done; três seams verdes; aceite da fatia ponta a ponta.
Fechamento: o que a fatia faz, o que ficou desmarcado e por quê, ADRs
emendados.
```

---

## Por que este prompt é assim

**O orquestrador não codifica.** Quem despacha e quem implementa precisam ser
papéis separados: o contexto enche de diffs e o grafo de dependências some.
O registro em `.scratch/fundacao-e-ingestao/registro.md` é a memória; o
handoff em `PROMPT-HANDOFF.md` é a continuidade quando a janela de contexto
estoura.

**O gate do 06 existe** porque Status `done` e registro "CONCLUÍDO" não
substituem evidência: a migration 009, mutação reversa, Standards+Spec e
PR/merge precisam estar fechados antes do 17.

**O resumo tem formato fixo** porque o campo que importa é "descobertas que
afetam tickets seguintes" — é por ele que o ticket 09 sabe a assinatura que
o 08 deixou pronta, sem o orquestrador ter lido o código.

**A lista de paradas é fechada.** Aberta, um agente para em toda escolha
cosmética; ausente, ele inventa credencial de produção. As sete entradas são
as que dependem genuinamente de algo fora do repositório, de mudar uma
decisão já tomada, ou de handoff de contexto.
