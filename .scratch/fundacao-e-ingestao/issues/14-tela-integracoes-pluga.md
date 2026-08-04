# 14 — Tela Integrações > Pluga

**Blocked by:** 06, 04, 02, 10

**Status:** ready-for-agent

## What to build

A tela que o dono da assessoria usa para ligar a captação sozinho, sem chamar suporte e sem ler documentação técnica. Ele copia a URL, gera o segredo, cola na Pluga, dispara um lead de teste e vê o resultado.

É também onde a quarentena do ticket 10 fica acionável: o gestor completa os dados que faltaram ou libera o lead assim mesmo, se julgar que vale.

O mapeamento De→Para dos campos do formulário de anúncio acontece **na Pluga**, não aqui — não construir assistente de mapeamento.

## Acceptance criteria

- [ ] URL do webhook exibida e copiável
- [ ] Gerar e rotacionar o segredo; após gerado, aparece **mascarado**
- [ ] O valor em claro é exibido uma única vez, na geração
- [ ] Rotação invalida o segredo anterior imediatamente
- [ ] Botão que envia um lead de exemplo, com payload de Meta e de Google
- [ ] Histórico recente de eventos com data, situação e erro
- [ ] Última sincronização bem-sucedida visível
- [ ] Ativar e desativar a integração sem apagar a configuração
- [ ] Formato esperado documentado na própria tela, em linguagem não técnica
- [ ] Leads em quarentena listados, com ação de completar dados **ou** liberar para o funil sem completar
- [ ] Liberar um lead da quarentena cria Pessoa e Oportunidade pelo mesmo caminho da ingestão
- [ ] Toda a tela lê a situação do evento de integração como fonte única — sem estado paralelo
- [ ] Usa os tokens do ticket 02
- [ ] **Não** existe assistente de mapeamento De→Para
