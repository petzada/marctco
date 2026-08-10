# 13 — Google Lead Form e webhook de landing page

**Blocked by:** 09

**Status:** needs-info

## What to build

As outras origens entram pelo contrato `v1`: a Pluga mapeia Google Lead Form para o HTTP Request do CRM, e landing pages próprias ou de terceiros enviam servidor-servidor com conexão separada.

O segredo nunca vai no JavaScript do formulário. O gestor entrega URL e token ao provedor/gestor de tráfego, que configura o backend ou webhook da LP. Se a plataforma não suportar isso, usa-se uma ponte server-side. Quando a origem não fornece identificador, o conector sintetiza um determinístico.

## Acceptance criteria

- [ ] Modelo de mapeamento Google Lead Form → contrato `v1` para configurar no HTTP Request da Pluga
- [ ] **O modelo Google só se escreve após teste em conta real.** A documentação pública da Pluga expõe uma lista truncada e não confiável para esse gatilho; nenhum ID nem campo de contato é presumido ([ADR-0008](../../../docs/adr/0008-fronteira-conector-dominio.md))
- [x] Endpoint de landing page com as mesmas chaves canônicas e contrato HTTP: 200, 401, 400, tenant pelo token
- [x] Endpoint de LP aceita apenas servidor-servidor; CORS/browser não é um modo suportado e segredo nunca é público
- [x] **Receitas prontas por plataforma**, não uma "ponte" genérica: snippet PHP para WordPress (Contact Form 7 / WPForms / Elementor Forms), instrução de webhook nativo para builders modernos, e exemplo server-side/serverless para stack própria
- [x] A tela explica em linguagem não técnica por que o token não pode ir para o JavaScript, para que ninguém "resolva" colando no front
- [x] Origem registrada como landing page, distinta de Meta e Google
- [x] Quando a origem não fornece identificador, o conector usa o **`IntegrationEvent.id`** — o identificador que o CRM cunhou ao receber a requisição. **Não** hash do payload com janela de tempo: com janela no relógio do processamento a chave não é determinística e um evento republicado depois de o Redis voltar cria segunda Oportunidade; com janela larga, uma submissão genuinamente nova de conteúdo idêntico é tratada como retransmissão e some do produto em silêncio ([ADR-0007](../../../docs/adr/0007-ingestao-idempotencia.md))
- [x] O mesmo evento processado duas vezes produz a **mesma** chave
- [x] Reenvio servidor-servidor da mesma submissão de landing page, quando a LP **fornece** identificador estável, não gera lead duplicado
- [x] Quando a LP **não** fornece identificador, dois `POST` distintos viram duas submissões — e o mecanismo 2 as liga com marcador visível, atendíveis e mescláveis. É a troca deliberada de "duplicata visível" por "lead engolido"
- [x] Meta e Google ficam simétricos no registro: mesma normalização, mesmas regras, mesmo funil
- [ ] Origem do lead visível no card e na tabela
- [x] Os três conectores compartilham o domínio: nenhum deles normaliza por conta própria
- [x] Os três entram no **mesmo módulo de ingestão** — `planPersonLookup` → `decideIntake` → `applyIntakePlan`. O conector continua em `apps/worker` e continua sintetizando `external_lead_id`; o que ele **não** faz é sequenciar escrita ([ADR-0017](../../../docs/adr/0017-ingestao-como-decisao-e-plano.md))

> Pendências: os dois critérios do modelo Google dependem de teste em conta real e estão registrados em `acoes-manuais-pendentes.md`. A origem no card e na tabela permanece sem comprovação neste ticket.
