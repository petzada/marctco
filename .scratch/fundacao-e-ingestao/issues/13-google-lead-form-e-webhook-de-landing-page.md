# 13 — Google Lead Form e webhook de landing page

**Blocked by:** 09

**Status:** ready-for-agent

## What to build

As outras duas origens de lead entram pelo mesmo caminho já provado: o conector do Google Lead Form e um endpoint genérico para landing pages próprias ou de terceiros.

O problema específico deste ticket é a landing page. O formulário é montado pelo cliente e **pode não mandar identificador nenhum** — e em Postgres `NULL` não colide com `NULL` num índice único, então a constraint de idempotência não deduplicaria nada. Um visitante que recarrega a página após enviar criaria lead duplicado sem que nada reclamasse. A responsabilidade de sintetizar o identificador é do **conector**, não do domínio.

## Acceptance criteria

- [ ] Conector do Google Lead Form convertendo a forma do provedor
- [ ] Endpoint genérico de landing page com **o mesmo contrato** do endpoint da Pluga: 202 sempre, 401, 400, tenant pelo token
- [ ] Origem registrada como landing page, distinta de Meta e Google
- [ ] Quando a origem não fornece identificador, o conector **sintetiza um determinístico** a partir do payload normalizado mais janela de tempo
- [ ] Reenvio pelo navegador da mesma submissão de landing page **não** gera lead duplicado
- [ ] Meta e Google ficam simétricos no registro: mesma normalização, mesmas regras, mesmo funil
- [ ] Origem do lead visível no card e na tabela
- [ ] Os três conectores compartilham o domínio: nenhum deles normaliza por conta própria
