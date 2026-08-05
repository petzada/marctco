# marctco — CRM revisional

Contexto de domínio do CRM de vendas para assessorias de revisional de juros (comercial + jurídico na mesma plataforma).

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

**Tipo de financiamento**:
Classificação opcional do contrato de crédito que motivou o contato (veículo, imóvel, empréstimo pessoal ou outro). É dado da Oportunidade e pode ser completado depois; não escolhe nem possui funil.
_Avoid_: Produto, linha de negócio, usar a classificação como funil, impedir a entrada quando ausente

**Funil**:
Pipeline Kanban de etapas criado e configurado pelo cliente; tipo comercial ou jurídico. Funil é fluxo operacional, não classificação do financiamento. Cada workspace tem exatamente um funil comercial padrão, que é onde a ingestão cai salvo sobrescrita na conexão de integração.
_Avoid_: Board genérico, pipeline sem tipo, funil por tipo de financiamento, escolher funil a partir do financiamento

**Etapa**:
Posição na jornada de um funil. Rótulo e ordem pertencem ao cliente; o papel — começo do fluxo, fim do fluxo, onde a UI oferece o handoff — pertence ao sistema. Todo funil em uso tem exatamente uma etapa de entrada e ao menos uma etapa de conclusão.
_Avoid_: Buscar etapa por nome, etapa de Ganho ou Perdido, funil sem entrada ou sem conclusão, ordem implícita na criação

**Situação**:
Estado da Oportunidade — em aberto, ganha ou perdida — ortogonal à etapa. Ganho e perda tiram o card do Kanban; perda exige motivo.
_Avoid_: Ganho ou Perdido como coluna do funil, situação inferida a partir da etapa

**Pessoa**:
Cadastro único da pessoa física/jurídica no workspace, com zero ou um CPF válido e múltiplos telefones/e-mails normalizados. Nenhum telefone ou e-mail vence uma contradição por si só; chaves conflitantes criam Pessoa nova e marcam revisão de identidade, sem impedir o atendimento.
_Avoid_: Lead como entidade permanente, contato duplicado por funil, CPF como campo obrigatório, “telefone sempre decide”, sobrescrever contato anterior

**Revisão de identidade**:
Pendência marcada na Oportunidade já criada quando os identificadores recebidos apontam para Pessoas diferentes. O envio nasce numa Pessoa nova; o gestor depois mescla numa candidata ou confirma que são pessoas distintas. Nunca segura o lead.
_Avoid_: Escolher uma chave arbitrariamente, fundir Pessoas automaticamente em conflito, apagar o registro perdedor, reter o envio antes da Oportunidade

**Possível duplicado**:
Ligação entre duas Oportunidades da mesma Pessoa quando há semelhança de financiamento sem prova de que seja o mesmo contrato. As duas existem e podem ser atendidas; o gestor decide se são financiamentos distintos, se devem ser mescladas ou se o envio é inválido.
_Avoid_: Anexar automaticamente por mesma Pessoa + tipo de financiamento, reter o envio antes da Oportunidade, excluir o envio ou o card perdedor

**Mesclagem**:
Resolução não destrutiva de Pessoa ou Oportunidade duplicada: a absorvida aponta para a canônica, sai das vistas ativas e preserva histórico e identificadores.
_Avoid_: Excluir o registro absorvido, sobrescrever dados da canônica, mesclar sem trilha de auditoria

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
Adaptador que conhece a forma do payload de uma origem de lead e a converte para o contrato canônico de entrada. A Pluga faz o De→Para de Meta/Google; LPs enviam o mesmo vocabulário servidor-servidor. O conector não conhece funil, Pessoa nem Oportunidade.
_Avoid_: Conector que normaliza ou decide regra de negócio, integração como sinônimo de conector

**Evento de integração**:
Payload bruto recebido de uma origem, persistido transacionalmente como outbox antes da resposta HTTP e reprocessável. Um dispatcher independente o entrega ao BullMQ quando o Redis estiver disponível.
_Avoid_: Confundir com EnvioLead (que já é lead interpretado), publicar no Redis antes do commit, descartar o bruto após processar

**Handoff**:
Passagem idempotente da oportunidade comercial para uma oportunidade jurídica (no máximo uma ativa por origem), sempre acionada pelo gestor. O atendente conclui o atendimento; o gestor é notificado e decide o envio.
_Avoid_: Duplicar Pessoa, “enviar lead de novo”, criar card jurídico por status ou etapa sem confirmação humana

**Score de cabimento**:
Resultado opcional de análise LLM (DeepSeek V4 / Gemini Flash via gateway); nunca bloqueia o funil.
_Avoid_: Score automático no 1º contato, scoring obrigatório

**Feature flag**:
Interruptor do catálogo, ligado pela marctco por workspace, que libera capacidade que custa dinheiro ou chama terceiro por uso. Invisível ao cliente: a capacidade existe ou não existe para aquele workspace.
_Avoid_: Flag por módulo para packaging, interruptor que o gestor edita, variável de ambiente, toggle de UI

**Configuração de workspace**:
Escolha operacional que o gestor da assessoria edita na tela, alterando o comportamento de uma capacidade que a feature flag já liberou. O que é mera consequência de dado existente (integração conectada, funil jurídico ativo) não é nem flag nem configuração.
_Avoid_: Feature flag, preferência pessoal do usuário, pré-condição de dado
