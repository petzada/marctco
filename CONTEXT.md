# marctco — CRM revisional

Contexto de domínio do CRM de vendas para assessorias de revisional de juros (comercial + jurídico na mesma plataforma).

## Language

> Os termos abaixo são a linguagem do domínio e da UI (PT-BR). Identificadores de código são **inglês** — mapeamento canônico em [ADR-0005](./docs/adr/0005-idioma-codigo-en-ui-pt-br.md).

**Lead**:
Rótulo de UI para a Oportunidade comercial, do primeiro contato até o Ganho. Não é entidade: no domínio é sempre Oportunidade.
_Avoid_: Lead como model ou tabela, Lead para card do funil jurídico, segundo substantivo no meio do funil comercial

**Workspace**:
Tenant SaaS cuja fronteira é a fila de entrada: empresas do mesmo grupo que compartilham campanha compartilham o workspace, e os leads caem numa fila única; campanha separada, com Pluga ou LP próprios, ganha workspace próprio. Isola dados, integrações, trial e feature flags. A mesma Direção pode ser dona de vários.
_Avoid_: Conta, tenant solto, organização Clerk, workspace por filial quando a campanha é compartilhada, um workspace automático para o grupo inteiro, tratar a empresa que pagou o anúncio como fronteira de dados

**Provisionamento**:
Nascimento de um Workspace, em ato único e indivisível: o tenant, o vínculo do primeiro membro como dono e o funil comercial padrão com suas etapas passam a existir juntos ou não existem. Acontece no primeiro acesso de quem a marctco marcou com direito a provisionar, nunca por cadastro da Direção nem por edição manual de banco.
_Avoid_: Criar workspace sem funil, semear funil por script de desenvolvimento em cliente real, workspace válido pela metade, provisionar quem apenas perdeu a associação, provisionar colaborador cadastrado na Equipe

**Cadastro de colaborador**:
Ato da Direção, na tela Equipe, que faz nascer juntos o login e o vínculo ao workspace com papel Atendente, Supervisor ou Gestão. Se o e-mail já é um login, só atrela o mesmo usuário a este workspace — não cria segundo auth. Não cria Direção. O colaborador nunca provisiona.
_Avoid_: Cadastro autônomo, criar atendente no painel do Supabase, convite sem vínculo, segundo login para a mesma pessoa, fila de espera depois do login, segunda Direção pela Equipe

**Desatrelamento**:
Ato da Gestão ou da Direção, na Equipe daquele workspace, que tira o colaborador só dali. Ele deixa de ver os leads desse tenant e pode continuar em outros. Leads em aberto daquele workspace voltam à fila sem dono; o contexto do card permanece.
_Avoid_: Confundir com desligamento, excluir usuário, excluir Oportunidade

**Desligamento**:
Ato da Direção: a pessoa saiu do quadro daquela Direção. Caem os vínculos ativos em todos os workspaces em que o ator é dono, e o direito de provisionar é revogado. Sem vínculo restante e sem direito, ela não entra em nada que seja dele e não ganha workspace novo — um vínculo em workspace de outro cliente da marctco não é alcançado, e não deve ser. Não apaga login, membro nem Oportunidade. Leads em aberto de cada workspace voltam à fila daquele tenant.
_Avoid_: Excluir usuário, excluir membro, excluir Oportunidade, deixar lead aberto com o desligado, provisionar workspace novo, sala de espera após desligar, deixar Gestão da Hugs demitir da ACR, prometer que ela não entra em workspace nenhum

**Distribuição do lead**:
Como o lead sai da fila e chega em quem atende, em dois níveis. A Gestão (na prática o analista de marketing) abre a fila sem dono e **atribui** o lead ao Supervisor da equipe; o Supervisor **reatribui** ao Atendente do seu time. Quem atende é decisão de capacidade da operação, nunca da campanha nem da empresa do grupo que pagou o anúncio.
_Avoid_: Rotear por campanha, tag na oportunidade para dizer de quem é o lead, Supervisor tirando lead de outra equipe, Gestão precisando saber o organograma para distribuir, tratar reatribuir como se fosse atribuir

**Perfil de acesso**:
O que uma pessoa responde dentro do workspace, e portanto o que ela alcança. São quatro, e nenhum a mais — **Atendente** responde pelos leads atribuídos a ele; **Supervisor**, pelo time (quem compartilha tag no membro) e pela fila sem dono daquele workspace; **Gestão**, pela operação inteira; **Direção**, pela operação e pela conta. O escopo é aplicado no servidor, num lugar só.
_Avoid_: Perfil sem escopo declarado, esconder botão como controle de acesso, papel para staff da marctco, confundir com tag de time

**Contexto de acesso**:
Os fatos que decidem o que uma requisição ou um job alcança, reunidos num valor só, construído num ponto só e exigido por toda leitura e toda escrita. Tem duas formas, porque quem trabalha em nome de uma pessoa e quem trabalha em nome da fila não são a mesma coisa: a da pessoa carrega workspace, quem ela é e seu perfil de acesso; a do job carrega workspace e o evento que o originou. Ambas isolam pelo workspace; só a primeira tem escopo de perfil, e é por isso que um job não alcança a tela de ninguém. Nasce validado contra a associação ao workspace e morre com o escopo que o criou; nunca vive em variável de módulo, porque um processo serve tenants diferentes. Na Fase 4 as feature flags já resolvidas entram nele, pelo mesmo motivo.
_Avoid_: Workspace e papel viajando separados, papel como parâmetro que ninguém usa, papel inventado para o job preencher campo, contexto em singleton ou cache sem chave de workspace, montar o contexto em cada tela

**Tag**:
Rótulo configurável no workspace, criado e aplicado na tela Equipe no mesmo ato do cadastro do colaborador. No membro, identifica marca ou time e é o que define o time de um Supervisor. Na oportunidade, se existir, é rótulo operacional (carteira, campanha) digitado à mão — nunca herdado do responsável.
_Avoid_: Sub-workspace, departamento como tenant, “empresa” no sentido de workspace, copiar a tag do atendente para a oportunidade, computar o time do Supervisor a partir da oportunidade, tela de taxonomia fora da Equipe

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

**Chegada**:
Instante em que a Oportunidade passa a existir e o relógio de atendimento pode começar a correr. Para todo lead que entra direto, é o instante do recebimento; para o que passou pela quarentena, é o instante da liberação, porque não corre relógio contra ninguém enquanto não há card. O recebimento continua registrado à parte, como verdade sobre a origem.
_Avoid_: Confundir com o instante do recebimento em todos os casos, reconstruir a chegada depois, relógio correndo sobre lead que ninguém podia atender

**Marcador**:
Pendência anexada a uma Oportunidade que já existe e já pode ser atendida. Sinaliza, nunca bloqueia, e é sempre resolvível. Quantos houver, o usuário os alcança por um único ponto de entrada no lead. Os marcadores não moram todos no mesmo lugar, mas quem responde "o que este lead tem" é um só — a pergunta "quais leads têm este aviso" é outra, e pertence aos contadores.
_Avoid_: Fila de revisão, portão antes da Oportunidade, um rótulo por tipo espalhado pela tela, marcador que não tem resolução, cada tela remontando a lista por conta própria

**Pessoa**:
Cadastro único da pessoa física/jurídica no workspace, com zero ou um CPF válido e múltiplos telefones/e-mails normalizados. Nenhum telefone ou e-mail vence uma contradição por si só; chaves conflitantes criam Pessoa nova e marcam revisão de identidade, sem impedir o atendimento.
_Avoid_: Lead como entidade permanente, contato duplicado por funil, CPF como campo obrigatório, “telefone sempre decide”, sobrescrever contato anterior

**Revisão de identidade**:
Pendência marcada na Oportunidade já criada quando os identificadores recebidos apontam para Pessoas diferentes. O envio nasce numa Pessoa nova; o gestor depois mescla numa candidata ou confirma que são pessoas distintas. Nunca segura o lead.
_Avoid_: Escolher uma chave arbitrariamente, fundir Pessoas automaticamente em conflito, apagar o registro perdedor, reter o envio antes da Oportunidade

**Possível duplicado**:
Ligação entre duas Oportunidades da mesma Pessoa quando ambas estão em aberto. Dado de financiamento não é o gatilho — ele é o que a tela mostra ao humano para distinguir uma da outra. As duas existem e podem ser atendidas; o gestor decide se são financiamentos distintos, se devem ser mescladas ou se o envio é inválido.
_Avoid_: Exigir semelhança de financiamento para ligar, tratar campo de financiamento como prova, reter o envio antes da Oportunidade, excluir o envio ou o card perdedor

**Mesclagem**:
Resolução não destrutiva de Pessoa ou Oportunidade duplicada: o que estava pendurado na absorvida passa para a canônica na mesma operação, e a absorvida guarda apenas a lápide que a tira das vistas ativas e preserva a trilha. A lápide nunca redireciona leitura — nenhum registro ativo aponta para um registro mesclado. Mesclar Pessoas reavalia a duplicidade entre as Oportunidades que a canônica passa a ter.
_Avoid_: Excluir o registro absorvido, sobrescrever dados da canônica, seguir o ponteiro na leitura, escrever em registro absorvido, mesclar sem trilha de auditoria

**Quarentena**:
Submissão recebida sem telefone e sem e-mail: persistida e visível em Integrações, sem gerar Pessoa nem Oportunidade — não há como contatar nem identificar. Sem relógio de atendimento. Sair da quarentena exige que alguém forneça ao menos um contato; liberar sem contato produziria cadastro que nunca casa com nada e card que ninguém atende.
_Avoid_: Rejeitar no request, descarte silencioso, liberar sem contato, confundir com o lead sem telefone (que entra no funil marcado)

**Oportunidade**:
Negócio ligado a uma Pessoa, numa etapa de um funil; área comercial ou jurídica. Na UI comercial chama-se Lead.
_Avoid_: Deal, card sem distinção de área, tratar Lead como entidade separada

**EnvioLead**:
Cada submissão de formulário Ads/LP recebida (idempotente por `external_lead_id`).
_Avoid_: Chamar de Lead — na UI, Lead é a Oportunidade; EnvioLead nunca aparece como tal para o usuário

**Conector de origem**:
Adaptador que conhece a forma do payload de uma origem de lead e a converte para o contrato canônico de entrada. A Pluga faz o De→Para de Meta/Google; LPs enviam o mesmo vocabulário servidor-servidor. O conector não conhece funil, Pessoa nem Oportunidade.
_Avoid_: Conector que normaliza ou decide regra de negócio, integração como sinônimo de conector

**Contrato canônico de entrada**:
O vocabulário de campos que o CRM publica e que toda origem preenche — versionado, de chaves planas, sem campo de negócio obrigatório. Quem converte a forma de uma origem para ele é o Conector de origem; na liberação da quarentena quem o preenche é o gestor, lendo o payload cru ao lado. Campo desconhecido não quebra o processamento e continua guardado no bruto.
_Avoid_: Esperar "o formato nativo" de uma ferramenta de automação — não existe; rejeitar por HTTP um JSON autenticado que faltou campo; validar o mesmo dado de novo camada abaixo

**Lead normalizado**:
A submissão depois que o domínio a interpretou: telefone em E.164 com Brasil como país padrão, CPF só dígitos com dígito verificador conferido, e-mail em minúsculas, valor monetário em decimal com o texto original preservado ao lado. É valor, não entidade — não tem identidade nem ciclo de vida. Campo que não pôde ser lido vira diagnóstico sem o valor dentro, nunca motivo para recusar a submissão.
_Avoid_: Normalizar dentro do conector, deixar o país padrão vazar para o adaptador, guardar telefone "como veio para depois", pôr valor de pessoa num diagnóstico

**Origem do lead**:
De onde a submissão veio — anúncio do Meta, formulário do Google ou landing page própria. Metade da chave idempotente do envio, junto do identificador que a origem fornece; por isso é valor fechado e não texto livre. Quando o payload não a declara, quem a decide é o conector, pela conexão por onde o evento entrou.
_Avoid_: Origem como texto livre, deduzir origem do conteúdo do lead, confundir com a plataforma do anúncio (`fb`/`ig`), confundir com a conexão de integração

**Plano de busca de Pessoa**:
Quais chaves procurar e com que força, decidido pelo domínio e executado por quem tem acesso ao banco. CPF válido é chave forte, telefone é moderada, e-mail isolado é fraca. Existe porque decidir "o que buscar" é metade da regra de identidade: quem busca só por telefone reconhece menos gente do que a regra promete, e nenhum teste puro percebe.
_Avoid_: Escrever a consulta de identidade fora do módulo que a documenta, injetar uma porta de busca no domínio, buscar só pelo primeiro contato do envio

**Decisão de Pessoa**:
A quem a submissão pertence: uma Pessoa conhecida reconhecida sem contradição, uma Pessoa nova, uma Pessoa nova com as candidatas registradas para revisão, ou nenhuma Pessoa porque não veio contato. Decidida sem tocar no banco, a partir do que a busca devolveu. A variante do conflito carrega as candidatas dentro dela — não dá para gravá-la sem olhar quem eram.
_Avoid_: Escolher a Pessoa mais provável e seguir, deixar a lista de candidatas como campo opcional, tratar uma única Pessoa fracamente encontrada como conflito

**Diagnóstico de normalização**:
O registro de que um campo chegou e não pôde ser lido — qual campo e por quê, **nunca o valor**. É a única parte de uma submissão que sai do tenant, e o payload tem CPF e telefone dentro. Quem precisa do conteúdo lê em Integrações, dentro do workspace.
_Avoid_: Pôr o valor recebido no diagnóstico, transformar diagnóstico em recusa da submissão, confundir "campo não veio" com "campo veio errado"

**Contatos da Pessoa**:
O conjunto de nome, telefones, e-mails e CPF que uma submissão traz, gravado como acréscimo e nunca como substituição. Receber um contato novo jamais apaga o anterior — a Pessoa acumula formas de ser encontrada, porque é assim que ela é reconhecida da próxima vez.
_Avoid_: Gravar só o primeiro contato, sobrescrever o telefone antigo pelo novo, calcular a diferença em vez de mandar o conjunto inteiro

**Destino da ingestão**:
O funil e a etapa onde um lead recebido nasce, resolvidos antes de decidir qualquer coisa: a sobrescrita da conexão de integração quando ela existe, senão o funil comercial padrão, e sempre a etapa de entrada daquele funil. Não tem onde carregar tipo de financiamento — é por isso que a classificação não escolhe funil, em hipótese nenhuma.
_Avoid_: Buscar a etapa pelo rótulo, cair no padrão quando a sobrescrita aponta para fora do workspace, deixar o financiamento entrar na escolha

**Resultado do insert do envio**:
O que a gravação idempotente do EnvioLead respondeu: envio novo, ou envio que já existia e o que ele já produziu. É **entrada** da decisão de ingestão, nunca saída dela — sem ele não se sabe se a submissão é nova ou retransmissão, e é só por isso que a ingestão tem três fases e não uma. "Já existia" e "já tem card" são fatos diferentes, e quem os confunde ou duplica o card ou engole o lead.
_Avoid_: Pré-checar duplicata com um SELECT, capturar a violação de unicidade, tratar envio duplicado sem card como retransmissão

**Plano de ingestão**:
O que uma submissão recebida vai produzir, descrito como dado antes de acontecer: quarentena, retransmissão inerte ou Oportunidade nova com seus marcadores. É decidido sem tocar no banco e executado numa transação só, o que faz caber num teste puro aquilo que antes só o ambiente inteiro exercitava. Um plano de retransmissão não tem onde guardar etapa, responsável, situação ou chegada — é assim que o funil não rebobina.
_Avoid_: Roteiro espalhado pelo worker, plano com campos opcionais que alguém preenche, decidir consultando, um caminho para a ingestão e outro para a liberação da quarentena

**Superfície de integração**:
A tela de uma origem somada à conexão que ela administra: o segmento de URL, o provedor, o endereço de ingestão e o texto que difere entre as telas. Existe porque os dois lados já se separaram uma vez — a tela de landing page documentava um token que nenhuma rota sabia emitir, porque a rota da Pluga trazia o provedor fixo dentro do arquivo. Tela e rotas passam a ler o provedor do mesmo lugar. Vive na camada web; não é model nem coluna.
_Avoid_: Fixar o provedor dentro de uma rota, deixar o segmento de URL divergir da pasta onde a rota mora, misturar texto de tela com o roteamento no mesmo grupo de campos

**Evento de integração**:
Payload bruto recebido de uma origem, persistido transacionalmente como outbox antes da resposta HTTP e reprocessável. Um dispatcher independente o entrega ao BullMQ quando o Redis estiver disponível. É a **única** cópia do payload; o EnvioLead aponta para a transmissão mais recente em vez de repetir o conteúdo.
_Avoid_: Confundir com EnvioLead (que já é lead interpretado), publicar no Redis antes do commit, descartar o bruto antes de processar, guardar o mesmo payload em dois lugares

**Evento da linha do tempo da Oportunidade**:
Fato imutável que aconteceu com uma Oportunidade e precisa continuar visível depois de reprocessamento ou mesclagem. Nesta fatia há somente reenvio recebido e EnvioLead absorvido como reentrada; atividade, mensagem e documento entram nas fases que os possuem. Quando uma Oportunidade é mesclada, seus eventos são transferidos para a canônica — nenhuma leitura segue a lápide.
_Avoid_: Reconstituir evento a partir do estado atual do card, gravar texto de UI no domínio, anexar evento novo à Oportunidade absorvida, transformar a linha do tempo mínima em model genérico das fases futuras

**Expiração do payload**:
Passados 90 dias, o conteúdo bruto do Evento de integração é apagado e a linha permanece: some o dado pessoal, fica o fato de que aquele lead chegou, de onde, quando e no que deu. Evento em quarentena não expira enquanto estiver em quarentena, porque é justamente o payload que o gestor precisa ler para completar.
_Avoid_: Apagar a linha do evento, expirar payload de quarentena, guardar payload sem prazo, confundir bruto expirado com bruto que nunca existiu

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
