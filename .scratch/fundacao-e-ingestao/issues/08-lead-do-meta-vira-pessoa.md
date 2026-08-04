# 08 — Lead do Meta vira Pessoa

**Blocked by:** 07

**Status:** ready-for-agent

## What to build

O worker passa a interpretar o payload: o conector do Meta Lead Ads converte a forma crua do provedor, o domínio normaliza telefone, CPF e e-mail, e decide se aquela pessoa **já existe** no workspace.

O reconhecimento de pessoa recorrente é o coração deste ticket. O cliente atendido em março que volta em setembro com outro financiamento precisa ser a mesma Pessoa — inclusive quando troca de telefone e mantém o CPF, e inclusive quando o formulário do anúncio não traz CPF nenhum, que é o caso comum.

`packages/domain` é **puro**: não importa Prisma, não faz I/O. Isso não é preferência — é o que permite testar toda essa lógica no CI sem banco ([ADR-0011](../../../docs/adr/0011-monorepo-pnpm-e-dominio-puro.md)).

## Acceptance criteria

- [ ] `packages/domain` não importa Prisma e não faz I/O
- [ ] O conector do Meta vive em `apps/worker`, não em `packages/domain`
- [ ] `InboundLead` → `normalize()` → `NormalizedLead`: dois tipos, com Zod como fonte única e tipo TypeScript inferido
- [ ] Telefone gravado em E.164, com Brasil como país padrão — o país padrão é conhecimento do domínio, não do conector
- [ ] CPF gravado só com dígitos, com dígito verificador validado
- [ ] E-mail gravado em minúsculas
- [ ] A identificação casa por **qualquer chave presente** (telefone, CPF, e-mail)
- [ ] Quando duas chaves apontam para pessoas diferentes, **o telefone decide**
- [ ] Submissão com telefone novo e CPF conhecido reconhece a mesma Pessoa — não cria segunda
- [ ] Casamento apenas por e-mail marca **provável duplicata** em vez de fundir cadastros
- [ ] Sem nenhuma das três chaves, **não** cria Pessoa
- [ ] **Seam 1**: casos de borda de telefone brasileiro, CPF inválido, caixa de e-mail e conflito de chaves, sem banco e sem container
