# Não há papel de plataforma

Os quatro perfis são do **cliente**. Staff da marctco marca o direito de provisionar; não entra no enum, não entra na Equipe, não lista lead de tenant nenhum pelo CRM. Direção do cliente é `OWNER` daquele workspace — não existe Super Admin do SaaS, `ADMIN` global nem impersonation no produto. Suporte com acesso a dado de cliente, se um dia existir, é outro caminho (break-glass), não um quinto valor em `WorkspaceMember.role`.

**Status:** accepted · 2026-08-13

Fecha a pergunta que o checklist genérico de CRM reabre. Emenda o “quatro, e nenhum a mais” do [ADR-0015](./0015-perfis-de-acesso-e-escopo.md) e os dois caminhos do [ADR-0021](./0021-dois-caminhos-de-nascimento-login-fechado.md): marctco provisiona; Direção cadastra colaborador. Nenhum dos dois é staff navegando carteira.

**Considered option (rejeitada):** papel de plataforma que atravessa tenants. Recusada porque papel no enum sem escopo declarado é o que o ADR-0015 proibiu, e um `ADMIN` global é o jeito mais barato de furar o RLS “só desta vez”.
