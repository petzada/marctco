# Contexto de tenant no segmento de URL

O workspace ativo de uma sessão de navegador vive no **caminho da URL** — `/workspace/:slug/leads` —, não em cookie de sessão. O `slug` é um **UUIDv4**, sem relação com o nome do cliente. Toda rota valida o slug contra `workspace_members` antes de setar o GUC; escolha que não corresponde a uma associação do usuário devolve **404**, e a tentativa é registrada.

**Status:** accepted · 2026-08-04

## O problema

O [ADR-0006](./0006-rls-duas-camadas-guc-worker.md) dizia "o browser não escolhe seu workspace — ele prova quem é, e o servidor resolve o resto", e o ticket de autenticação repetia a regra como "tentativa de forçar outro `workspace_id` pela requisição é **ignorada**". Mas a mesma fatia exige um seletor de workspace para quem pertence a mais de um.

As duas coisas não cabem juntas. HTTP é sem estado: se o usuário escolhe, a escolha viaja na requisição seguinte — cookie, segmento de URL ou header, não há quarta opção. "Ignorada" quebraria o seletor.

O que existia era **uma frase cobrindo duas regras diferentes**. Na ingestão a regra é mesmo ignorar, porque o token já diz o tenant e o corpo não tem autoridade nenhuma. Na sessão do navegador a regra é **validar, nunca confiar**. Ignorar e validar não são sinônimos, e conflacioná-los proibia o próprio recurso.

## Por que a URL e não a sessão

Contexto em sessão é **estado ambiente**: existe uma vez por usuário, não uma vez por requisição. Duas abas abertas em workspaces diferentes viram uma só, e a última troca ganha. Quem age na primeira aba executa contra o workspace da segunda.

Neste cenário as duas camadas do ADR-0006 são **inertes**. O usuário é membro legítimo dos dois workspaces, a policy aprova, e o `SET LOCAL` seta o workspace errado com toda a correção do mundo. Não é erro de programação — é contexto ambiente errado, e não existe rede armada contra isso.

Contra-argumento considerado e pesado: hoje ninguém é multi-workspace. O staff da marctco cria o **usuário** no painel do Supabase e o workspace nasce do provisionamento feito pelo próprio cliente; não há operação de rotina dentro do workspace alheio. A catástrofe das duas abas descreve uma população que ainda não existe.

Decidiu-se pela URL assim mesmo, por dois motivos:

1. **Hoje o custo é zero.** Não há uma rota escrita no repositório. Acrescentar o prefixo agora é uma linha num template. A partir da Fase 3, com Agenda e alerta ao gestor gravando links, e da Fase 6, com notificação de handoff, o mesmo movimento vira reescrever rotas e reprocessar links já persistidos.
2. **O dia do acesso de suporte chega em todo SaaS B2B.** O cliente liga com um problema e alguém precisa ver o que ele vê. Nesse dia existe um usuário multi-workspace com acesso a vários clientes, alternando contexto — exatamente o perfil que a sessão trai. Não planejar isso não impede que aconteça; garante apenas que aconteça sem defesa.

## Por que UUID e não nome legível

Slug derivado do nome (`assessoria-silva`) vaza a carteira de clientes: quem coleta URLs sabe quem contrata a marctco, o que num nicho como revisional é inteligência competitiva de graça. Slug sequencial é pior — revela também quantos clientes existem e permite enumerar.

UUIDv4 resolve os dois: 122 bits de aleatoriedade, não legível, não enumerável.

**Considered option (rejeitada): token opaco de 32 a 64 caracteres**, proposto para dificultar varredura de rotas. Rejeitado por não comprar nada acima do UUID e cobrar três coisas. Para acertar um workspace existente num universo de 10 mil clientes seriam necessárias ~2^108 tentativas — o espaço já está fechado, e dobrar o identificador não fecha mais que fechado. Em troca: URL impossível de mandar no suporte ou ler num log, ruído em todo breadcrumb, e — o custo que decidiu — **o convite a tratar a URL como credencial**. Identificador que parece segredo acaba usado como segredo, e alguém eventualmente conclui que "essa URL é inadivinhável, logo esta rota não precisa checar associação". É o padrão *capability URL*, e ele falha porque URL não é segredo: vaza em histórico, em `Referer`, em print de tela do cliente pedindo ajuda, em log de servidor, em proxy. Uma terceira camada mais fraca não soma ao ADR-0006 — ela borra qual camada está sustentando o peso.

O que de fato mitiga varredura de rotas é outra coisa, e nada disso depende do tamanho do identificador: **404 uniforme** para "não existe" e "existe mas não é seu" (403 no segundo caso confirma a existência do workspace alheio, e é aí que a enumeração vive), membership validada em toda rota antes do GUC, rate limit no login e na ingestão, e registro das tentativas de acesso a workspace alheio.

## Consequences

`Workspace` ganha `slug` (UUIDv4, único). Toda rota autenticada nasce sob `/workspace/:slug`. O onboarding vive **fora** do prefixo, em `/onboarding`, porque ali ainda não existe workspace — é o provisionamento que o cria. O ADR-0006 regra 7 passa a distinguir explicitamente ignorar de validar.

Em troca, o workspace ativo deixa de ser estado de usuário e passa a ser propriedade da requisição — que é o que torna abas independentes por construção e faz todo link profundo nascer correto, inclusive os que fases futuras vão gravar em notificação e e-mail.
