# Fronteira entre feature flag, configuração de workspace e estado

Os docs chamavam de "flag" três mecanismos distintos. Travamos a separação: **feature flag** é interruptor da marctco em `workspace_flags`, e só existe quando a capacidade **custa dinheiro ou chama um terceiro por uso**; **configuração de workspace** é escolha do gestor, editável em tela, que modula uma capacidade já liberada; **estado** é consequência de dado (integração conectada, funil jurídico ativo) e não é interruptor nenhum.

**Status:** accepted · 2026-08-04

**Catálogo MVP — três entradas, e nenhuma a mais:** `auto_primeiro_contato` · `score_cabimento_llm` · `resumo_handoff_llm`.

**Considered options (rejeitadas):** uma flag por módulo para packaging comercial, como sugere `sintese-final.md` §12 — rejeitada porque com um cliente piloto e preço negociado à mão nenhum desses interruptores seria acionado, e a assimetria é dura: **acrescentar flag depois é uma entrada no catálogo e um guard; remover flag depois é caçar o caminho "desligado" espalhado por toda tela, query e teste.** Flag para assinatura digital e para funil jurídico — rejeitadas por serem estado (`IntegrationConnection` conectada; funil existente e ativo), e dois interruptores para a mesma lâmpada é bug garantido.

## Regras de implementação

Esta fronteira só se sustenta se o código a respeitar nos seis pontos abaixo. Todos são modos de falha conhecidos deste tipo de separação.

1. **O guard é do servidor; esconder UI é cosmético.** Nunca tratar "o botão não aparece" como controle de acesso. A rota, a query e o job recusam por conta própria quando a flag está desligada. Esconder sem recusar é o bug clássico — o endpoint continua aberto para quem abrir o devtools.

2. **Nunca embarcar o catálogo inteiro no cliente.** O browser recebe apenas o resultado resolvido para *aquele* workspace, nunca a lista de flags existentes nem o valor de outros workspaces. O catálogo revela roadmap e packaging.

3. **Leitura de flag exige `workspace_id` explícito — sempre, e principalmente no worker.** O worker processa jobs de vários workspaces no mesmo processo; qualquer valor de flag resolvido em escopo de módulo, singleton ou cache sem chave de workspace acaba aplicando a decisão do workspace A ao workspace B. É o vazamento multi-tenant mais comum deste desenho. A assinatura da função de leitura recebe o workspace como argumento obrigatório; não existe leitura "ambiente".

4. **Ausência é desligado (fail-closed).** Linha inexistente em `workspace_flags` significa OFF, nunca ON. As três flags do catálogo gastam dinheiro por uso — fail-open vira fatura.

5. **A ordem do guard é flag → configuração, nunca configuração sozinha.** Primeiro se pergunta se o workspace *tem* a capacidade; só depois *como* ela se comporta. Checar apenas `configuracao.gatilho !== 'desligado'` funde os dois mecanismos e permite que uma capacidade não contratada rode. Valores de configuração são enum validado por Zod compartilhado — string livre transforma erro de digitação em desligamento silencioso.

6. **Estado é lido no momento do uso, não em cache.** "Funil jurídico existe e está ativo" é consultado quando o handoff vai acontecer. Cachear isso faz o handoff falhar depois que o cliente apaga ou desativa o funil.

**Consequences:** o catálogo é código compartilhado entre app e worker — uma cópia só, num pacote comum do monorepo. Duas cópias divergem e a divergência aparece como "a flag está ligada mas o worker não faz nada".
