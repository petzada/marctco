# 14 — Tela Integrações > Pluga

**Blocked by:** 06, 04, 02, 10

**Status:** ready-for-agent

## What to build

A tela que o dono da assessoria usa para ligar a captação sozinho, sem chamar suporte e sem ler documentação técnica. Ele copia a URL, gera o segredo, cola na Pluga, dispara um lead de teste e vê o resultado.

É também onde a quarentena do ticket 10 fica acionável: o gestor completa os dados que faltaram e libera o lead. **Não existe "liberar sem completar"** — sair da quarentena exige ao menos um contato ([ADR-0007](../../../docs/adr/0007-ingestao-idempotencia.md)). O caso real por trás desse pedido é o contato ter chegado num campo que o mapeamento da Pluga não mapeou, e a resposta certa para isso é o gestor ler o payload cru e digitar o que está vendo.

O mapeamento De→Para acontece **na Pluga**, não aqui. A tela fornece o contrato `v1`, modelos Meta/Google e um teste de onboarding; não constrói assistente de mapeamento.

## Acceptance criteria

- [ ] URL do webhook exibida e copiável
- [ ] Gerar e rotacionar o segredo; após gerado, aparece **mascarado**
- [ ] O valor em claro é exibido uma única vez, na geração
- [ ] Rotação invalida o segredo anterior imediatamente
- [ ] Contrato `v1` e modelo copiável de HTTP Request para **Meta**, com os campos já confirmados na documentação da Pluga (lead id, `ad_id`, `adset_id`, `campaign_id`, `form_id`, `platform`, `is_organic`, data em ISO)
- [ ] Modelo **Google** fica pendente de teste em conta real — a lista pública desse gatilho não é confiável
- [ ] A tela avisa que **HTTP Request exige plano pago da Pluga**, porque sem ele não há ingestão de Ads
- [ ] Fluxo de teste de cada automação usando dado que a conta real da Pluga disponibiliza, verificando primeiro se nome, telefone e e-mail aparecem no mapeamento
- [ ] Histórico recente de eventos com data, situação e erro
- [ ] Última sincronização bem-sucedida visível
- [ ] Ativar e desativar a integração sem apagar a configuração
- [ ] Formato esperado documentado na própria tela, em linguagem não técnica
- [ ] Leads em quarentena listados, com ação única **completar e liberar**
- [ ] O **payload cru** é exibido ao lado do formulário, para o gestor achar o contato que o mapeamento perdeu
- [ ] Liberar **exige ao menos um contato**; sem isso a ação fica indisponível, com a razão explicada em linguagem não técnica
- [ ] Liberar um lead da quarentena cria Pessoa e Oportunidade pelo mesmo caminho da ingestão — literalmente o mesmo, sem desvio que crie `Person` sem chave
- [ ] O `arrived_at` do lead liberado é o instante da **liberação**, não o do recebimento: ele não pode nascer com relógio estourado que nenhuma ação do gestor resolve
- [ ] O tempo em quarentena continua medível pela diferença entre liberação e recebimento, e é ele que alimenta o alerta próprio da quarentena
- [ ] **Só a quarentena vive aqui.** Revisão de identidade e possível duplicado são marcadores na tela de Leads, e a resolução deles acontece lá (ticket 12) — aqui não há card onde morar
- [ ] Toda a tela lê a situação do evento de integração como fonte única — sem estado paralelo
- [ ] Usa os tokens do ticket 02
- [ ] **Não** existe assistente de mapeamento De→Para
