# 02 — Configuração de SLA e estagnação

**Status:** ready-for-agent

**Blocked by:** None — can start immediately.

**What to build:** a Gestão passa a definir o ritmo da própria operação. Em Configurações ela edita o SLA de primeiro contato em minutos e o limite de estagnação em dias, sem pedir nada à marctco. O workspace que nunca abriu essa tela **não fica sem relógio**: usa o padrão do domínio — ausência de configuração é o comportamento padrão, e não o desligamento.

É o oposto da regra das feature flags, de propósito: flag ausente é capacidade não contratada, configuração ausente é operação rodando com o padrão. SLA não é flag — não custa dinheiro por uso e não chama terceiro nenhum ([ADR-0004](../../../docs/adr/0004-fronteira-flag-configuracao-estado.md)).

Este ticket entrega a configuração e a leitura resolvida. Quem a consome são os tickets 03 e 04.

**Antes da migration:** `WorkspaceSettings` já tem linha no mapeamento do [ADR-0005](../../../docs/adr/0005-idioma-codigo-en-ui-pt-br.md); as duas colunas novas não. Acrescentá-las lá primeiro.

- [x] `WorkspaceSettings` existe com chave primária `workspace_id` e **uma linha opcional** por workspace
- [x] `first_contact_sla_minutes` e `stagnation_days` são anuláveis, com `CHECK` de intervalo positivo no banco além do Zod compartilhado entre app e worker
- [x] A resolução "configuração do workspace sobre os padrões do domínio" é função pura em `packages/domain`, e os padrões vivem lá — não como constante espalhada
- [x] Workspace sem linha lê os padrões e continua com relógio; ausência nunca significa SLA desligado
- [x] Operações nomeadas para ler e escrever a configuração, recebendo `UserContext`
- [x] Gestão e Direção escrevem; Atendente e Supervisor são recusados **pela operação**, não por botão escondido
- [x] Valor inválido — zero, negativo, fora de faixa — é recusado na escrita, e não descoberto na hora de calcular
- [x] Tela de Configurações seguindo o `DESIGN.md`, com a rota recusando por conta própria
- [x] `private.provision_workspace` **não é tocada** — a linha nasce na primeira escrita da tela, e não no provisionamento
- [x] `first_contact_trigger` do [ADR-0003](../../../docs/adr/0003-whatsapp-instancia-unica-gatilho-atribuicao.md) **não** entra: é da Fase 4, e coluna sem o disparo é configuração que não configura nada
- [x] Seam 3 verde: `workspace_settings` sob as mesmas varreduras de RLS, policy e índice
