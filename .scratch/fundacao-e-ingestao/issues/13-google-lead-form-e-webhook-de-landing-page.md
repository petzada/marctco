# 13 — Google Lead Form e webhook de landing page

**Blocked by:** 09

**Status:** ready-for-agent

## What to build

As outras origens entram pelo contrato `v1`: a Pluga mapeia Google Lead Form para o HTTP Request do CRM, e landing pages próprias ou de terceiros enviam servidor-servidor com conexão separada.

O segredo nunca vai no JavaScript do formulário. O gestor entrega URL e token ao provedor/gestor de tráfego, que configura o backend ou webhook da LP. Se a plataforma não suportar isso, usa-se uma ponte server-side. Quando a origem não fornece identificador, o conector sintetiza um determinístico.

## Acceptance criteria

- [ ] Modelo de mapeamento Google Lead Form → contrato `v1` para configurar no HTTP Request da Pluga
- [ ] **O modelo Google só se escreve após teste em conta real.** A documentação pública da Pluga expõe uma lista truncada e não confiável para esse gatilho; nenhum ID nem campo de contato é presumido ([ADR-0008](../../../docs/adr/0008-fronteira-conector-dominio.md))
- [ ] Endpoint de landing page com as mesmas chaves canônicas e contrato HTTP: 200, 401, 400, tenant pelo token
- [ ] Endpoint de LP aceita apenas servidor-servidor; CORS/browser não é um modo suportado e segredo nunca é público
- [ ] **Receitas prontas por plataforma**, não uma "ponte" genérica: snippet PHP para WordPress (Contact Form 7 / WPForms / Elementor Forms), instrução de webhook nativo para builders modernos, e exemplo server-side/serverless para stack própria
- [ ] A tela explica em linguagem não técnica por que o token não pode ir para o JavaScript, para que ninguém "resolva" colando no front
- [ ] Origem registrada como landing page, distinta de Meta e Google
- [ ] Quando a origem não fornece identificador, o conector **sintetiza um determinístico** a partir do payload normalizado mais janela de tempo
- [ ] Reenvio servidor-servidor da mesma submissão de landing page **não** gera lead duplicado
- [ ] Meta e Google ficam simétricos no registro: mesma normalização, mesmas regras, mesmo funil
- [ ] Origem do lead visível no card e na tabela
- [ ] Os três conectores compartilham o domínio: nenhum deles normaliza por conta própria
