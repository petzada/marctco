# Prompt inicial para a sessão de implementação

Cole o bloco abaixo numa sessão nova do Claude Code, na raiz do repositório clonado.

---

```
Vou implementar a fatia vertical de fundação e ingestão deste CRM. O repositório
tem zero código de produção — só documentação de decisão, spec e tickets. Toda a
arquitetura já foi decidida e travada numa sessão de grelha anterior.

# Leitura obrigatória, nesta ordem, antes de escrever qualquer linha

1. `AGENTS.md` — escada de precedência entre documentos e índice dos 11 ADRs.
   Os documentos deste repo conflitam entre si de propósito; a escada resolve.
2. `CONTEXT.md` — glossário. É a linguagem ubíqua, em PT-BR.
3. `docs/adr/0005-idioma-codigo-en-ui-pt-br.md` — código em inglês, UI em PT-BR,
   com a tabela de mapeamento canônica. Model sem linha nessa tabela é model com
   nome improvisado.
4. `docs/plano-de-construcao.md` — as 8 fases e os itens registrados como abertos.
5. `.scratch/fundacao-e-ingestao/spec.md` — a spec desta fatia: 61 user stories,
   decisões de implementação e os 3 seams de teste.
6. `.scratch/fundacao-e-ingestao/README.md` — grafo de dependências dos tickets.

Leia os ADRs 0006 a 0011 conforme o ticket em que estiver mexendo. Eles contêm
os modos de falha silenciosos deste stack — em especial o ADR-0006, que explica
por que Supabase RLS + Prisma não encaixam sozinhos.

# Como trabalhar

Os tickets são arquivos em `.scratch/fundacao-e-ingestao/issues/`, numerados em
ordem de dependência. Trabalhe a fronteira: qualquer ticket cujos bloqueadores
estejam todos concluídos; em empate, o menor número vence.

Um ticket por vez, com `/implement`. Ao concluir, marque os critérios de aceite
e atualize o `Status:` do arquivo.

Comece pelo ticket 01 (ou 02, que também não tem bloqueador).

# Regras que não se re-litigam

As decisões abaixo foram tomadas deliberadamente, com alternativas descartadas
registradas nos ADRs. Se algo parecer errado, leia o ADR correspondente antes de
propor mudança — e traga a proposta a mim em vez de mudar por conta própria.

- Código em inglês, UI em PT-BR, sem acento em identificador.
- O worker roda SOB RLS, não com service_role.
- `prisma migrate dev` e `prisma db push` são PROIBIDOS: resetam o banco. Só
  `prisma migrate deploy`. Migrações são autoradas sem banco, com `migrate diff`.
- Não existe ambiente local nem banco de staging. Um banco só: produção.
- `packages/domain` não importa Prisma e não faz I/O.
- O endpoint de ingestão responde 202 sempre; nunca 409.
- Nenhum campo de negócio é obrigatório na ingestão.
- `FORCE ROW LEVEL SECURITY`, não apenas `ENABLE`.

# Atenção especial no ticket 01

Ele embute a verificação do item A7: as migrações precisam ser autoradas sem
banco local, com `prisma migrate diff`. Se esse fluxo não funcionar como o
ADR-0010 assume, a premissa "sem ambiente local" racha. Nesse caso: PARE, emende
o ADR-0010 registrando o que foi descoberto, e me avise antes de seguir para
qualquer outro ticket.

Verifique também, ainda no 01: `SET LOCAL` dentro de `$transaction` do Prisma, e
`pgbouncer=true` para prepared statements em pooling transaction-mode.

# Gate antes do primeiro deploy em produção

Confirme o que o plano free do Supabase garante de backup (item A6). Sem banco de
staging, o backup é a única rede sob uma migração em produção, e PITR é add-on
pago. Isso é decisão minha, não sua — apenas me traga a informação.
```

---

## Por que este prompt é assim

**Ele não repete as decisões, aponta para elas.** Um prompt que resumisse os 11 ADRs criaria uma segunda fonte de verdade que envelhece na primeira emenda. O repositório é a fonte; o prompt é o mapa.

**Ele lista as regras que não se re-litigam** porque todas contrariam o reflexo padrão de quem chega sem contexto — e um agente novo tende a "consertar" cada uma delas. Dar service_role ao worker, rodar `migrate dev`, retornar 409 em duplicata e exigir campos obrigatórios são exatamente os quatro atalhos que a grelha descartou com motivo registrado.

**Ele manda parar no ticket 01 se a premissa rachar**, em vez de improvisar. Se `prisma migrate diff` não autorar sem banco, seguir em frente significa construir 15 tickets sobre uma fundação que precisa mudar.
