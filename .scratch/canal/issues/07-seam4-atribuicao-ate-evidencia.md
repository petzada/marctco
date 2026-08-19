# 07 — Seam 4: atribuição até evidência persistida

**What to build:** Prova ponta a ponta do caminho canônico e da durabilidade: Gestão entrega ao Supervisor (sem tentativa) → Supervisor reatribui ao Atendente (outbox no commit) → dispatcher/fila/worker com WhatsMiau fake → timeline e `first_contact_at`.

**Blocked by:** 03b — Dispatcher, worker e adapter WhatsMiau; 03c — Disparo na atribuição

**Status:** ready-for-agent

- [ ] Novo teste Seam 4 em `tests/`, espelhando infra do Seam 2: Postgres real, fila real, worker com HTTP mockado
- [ ] Caminho feliz: atribuição em dois níveis até Atendente → tentativa/outbox → um `sendText` → fato outbound → `first_contact_at`
- [ ] Simular queda após commit e antes da publicação; nova passada do dispatcher entrega sem intervenção
- [ ] Simular queda depois de iniciar `sendText` e antes de persistir resultado; tentativa termina ambígua/`FAILED` e não chama a API novamente
- [ ] Reprocessar job após `SENT` e reatribuir depois não chamam `sendText` de novo
- [ ] Variantes: flag off; `DISABLED`; atribuição só ao Supervisor; opt-in ausente/falso; `missing_phone`; mesclado; instância desconectada; template inválido; falha HTTP sem `first_contact_at`
- [ ] Massa: N oportunidades elegíveis produzem N tentativas e respeitam rate limit por workspace
- [ ] Corrida: Atividade concluída e WhatsApp não sobrescrevem o primeiro `first_contact_at`
- [ ] CI executa o seam no job `database`, ao lado de `test:seam2`
- [ ] Helpers de inspeção pós-condição estendidos para fatos de mensagem e tentativa outbound

## Fora deste ticket

Gatilho `ON_ARRIVAL` (ticket 04), webhook inbound (05), copy do card (06), pareamento QR real contra produção.
