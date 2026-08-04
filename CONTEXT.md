# marctco — CRM revisional

Contexto de domínio do CRM de vendas para assessorias de revisional de juros (comercial + jurídico no mesmo produto).

## Language

> Os termos abaixo são a linguagem do domínio e da UI (PT-BR). Identificadores de código são **inglês** — mapeamento canônico em [ADR-0005](./docs/adr/0005-idioma-codigo-en-ui-pt-br.md).

**Lead**:
Rótulo de UI para a Oportunidade comercial, do primeiro contato até o Ganho. Não é entidade: no domínio é sempre Oportunidade.
_Avoid_: Lead como model ou tabela, Lead para card do funil jurídico, segundo substantivo no meio do funil comercial

**Workspace**:
Tenant SaaS do cliente: a empresa mãe / grupo da consultoria. Isola dados, integrações, trial e feature flags.
_Avoid_: Conta, tenant solto, organização Clerk, workspace por filial

**Tag**:
Rótulo configurável no workspace para identificar filial, time ou carteira; aplica-se a membros e, se útil, a oportunidades.
_Avoid_: Sub-workspace, departamento como tenant, “empresa” no sentido de workspace

**Produto**:
Linha de negócio (ex.: veículo, imóvel, EP) que possui funil comercial próprio e editável.
_Avoid_: Plano comercial, pacote de preço

**Funil**:
Pipeline Kanban de etapas; tipo comercial (por produto) ou jurídico.
_Avoid_: Board genérico, pipeline sem tipo

**Etapa**:
Posição na jornada de um funil. Rótulo e ordem pertencem ao cliente; o papel — onde o lead ingerido nasce, o que dispara o handoff — pertence ao sistema. Todo funil comercial em uso tem exatamente uma etapa de entrada.
_Avoid_: Buscar etapa por nome, etapa de Ganho ou Perdido, ordem implícita na criação

**Situação**:
Estado da Oportunidade — em aberto, ganha ou perdida — ortogonal à etapa. Ganho e perda tiram o card do Kanban; perda exige motivo.
_Avoid_: Ganho ou Perdido como coluna do funil, situação inferida a partir da etapa

**Pessoa**:
Cadastro único da pessoa física/jurídica no workspace, identificada por telefone E.164, CPF ou e-mail — telefone decide quando duas chaves discordam. Formulários de Ads raramente trazem CPF; a identidade não depende dele.
_Avoid_: Lead como entidade permanente, contato duplicado por funil, CPF como chave obrigatória

**Quarentena**:
Submissão recebida sem telefone e sem e-mail: persistida e visível em Integrações, sem gerar Pessoa nem Oportunidade — não há como contatar nem identificar. Sem relógio de SLA.
_Avoid_: Rejeitar no request, descarte silencioso, confundir com o lead sem telefone (que entra no funil marcado)

**Oportunidade**:
Negócio ligado a uma Pessoa, numa etapa de um funil; área comercial ou jurídica. Na UI comercial chama-se Lead.
_Avoid_: Deal, card sem distinção de área, tratar Lead como entidade separada

**EnvioLead**:
Cada submissão de formulário Ads/LP recebida (idempotente por `external_lead_id`).
_Avoid_: Chamar de Lead — na UI, Lead é a Oportunidade; EnvioLead nunca aparece como tal para o usuário

**Conector de origem**:
Adaptador que conhece a forma do payload de uma origem de lead (Pluga Meta, Pluga Google, webhook de LP) e a converte para a forma canônica. Não conhece funil, Pessoa nem Oportunidade.
_Avoid_: Conector que normaliza ou decide regra de negócio, integração como sinônimo de conector

**Evento de integração**:
Payload bruto recebido de uma origem, persistido antes de qualquer interpretação e reprocessável a partir da fila morta.
_Avoid_: Confundir com EnvioLead (que já é lead interpretado), descartar o bruto após processar

**Handoff**:
Passagem idempotente da oportunidade comercial para uma oportunidade jurídica (no máximo uma ativa por origem).
_Avoid_: Duplicar Pessoa, “enviar lead de novo”

**Score de cabimento**:
Resultado opcional de análise LLM (DeepSeek V4 / Gemini Flash via gateway); nunca bloqueia o funil.
_Avoid_: Score automático no 1º contato, scoring obrigatório

**Feature flag**:
Interruptor do catálogo, ligado pela marctco por workspace, que libera capacidade que custa dinheiro ou chama terceiro por uso. Invisível ao cliente: a capacidade existe ou não existe para aquele workspace.
_Avoid_: Flag por módulo para packaging, interruptor que o gestor edita, variável de ambiente, toggle de UI

**Configuração de workspace**:
Escolha operacional que o gestor da assessoria edita na tela, alterando o comportamento de uma capacidade que a feature flag já liberou. O que é mera consequência de dado existente (integração conectada, funil jurídico ativo) não é nem flag nem configuração.
_Avoid_: Feature flag, preferência pessoal do usuário, pré-condição de dado
