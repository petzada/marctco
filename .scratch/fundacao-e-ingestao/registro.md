# Registro de execução — fundação e ingestão

## Ticket 01 — Esqueleto vivo: monorepo, Docker local, CI e deploy — BLOQUEADO

- **O que foi construído:** Nenhum código de produção foi escrito, conforme a parada obrigatória do ticket.<br>A leitura integral da spec, correções arquiteturais, ADRs aplicáveis e skills foi concluída.<br>A inspeção somente leitura identificou todas as dependências externas pendentes.
- **Arquivos-chave criados/alterados:** Nenhum. `PROMPT-GOAL-IMPLEMENTACAO.md` permanece não rastreado e intocado.
- **Critérios de aceite:** 0 de 39 marcados. Todos permanecem desmarcados: Monorepo, Ambiente local, A7, Papéis/autoverificação, PII, Rate limit, Guards, Push/PR e Release dependem da parada externa; os dois itens deliberadamente adiados também só serão marcados quando codificados como regras.
- **Testes:** Nenhum teste executado; ainda não há implementação. Inspeções reais: Docker, Railway CLI e Supabase CLI ausentes; GitHub autenticado; repositório privado; branch correta e baseada em `origin/main`.
- **Branch / PR:** `ticket/01-esqueleto-vivo-monorepo-ci-deploy`; PR ainda não aberto; CI inexistente.
- **Decisões que tomei sozinho:** Nenhuma decisão arquitetural. Preservei o working tree e não escrevi antes do gate humano obrigatório.
- **Descobertas que afetam tickets seguintes:** O repositório privado não permite branch protection no plano GitHub atual: a API devolveu 403 exigindo GitHub Pro ou repositório público. Não existe GitHub Environment `production`, nem secrets configurados. Docker não está instalado; portanto as quatro verificações A7 ainda não podem ser executadas.
- **Documentos emendados:** Nenhum.
- **Precisa de mão humana:** 1. Instale e inicie Docker Desktop com backend WSL2; confirme que `docker version` e `docker compose version` funcionam. 2. Mantenha o repositório privado e faça upgrade para GitHub Pro/Team, recomendado, ou torne-o público; o plano atual bloqueia branch protection. Após o upgrade, Luna configurará a proteção e o check obrigatório quando o workflow existir. 3. Crie o projeto Supabase de produção e anote região, project ref, URL e endpoints direto/session e pooler; não envie senhas no chat. 4. Crie um projeto Railway na mesma região, com serviços separados `web`, `worker` e Redis, conectados ao repositório, e habilite Wait for CI para app e worker. 5. Crie o GitHub Environment `production` e armazene nele somente a connection string owner de migrations; nenhuma credencial de produção pode ficar em secret de repositório ou `.env` local. 6. Gere e guarde três senhas distintas para `marctco_migrator`, `marctco_app` e `marctco_worker`; os papéis nascerão na migration e as senhas serão aplicadas depois por `ALTER ROLE`, nunca versionadas. As URLs runtime de app/worker deverão usar seus respectivos papéis, pooler transaction-mode e `pgbouncer=true`; a URL de migration será distinta. 7. Confirme que o Supabase está vazio de leads reais. Se já houver o primeiro lead real, providencie backup restaurável antes de qualquer migration. Responda apenas com: Docker funcionando; GitHub atualizado; refs/URLs não secretas e regiões de Supabase/Railway; serviços criados; Environment criado; senhas guardadas; e “produção vazia” ou localização do backup restaurável.

### Segunda tentativa — BLOQUEADO

- **O que foi construído:** Nenhum código de produção foi escrito nesta segunda tentativa.<br>Os sete gates externos foram revalidados por inspeção real e somente leitura.<br>Os pré-requisitos continuam ausentes ou não verificáveis, portanto a implementação não pode começar.
- **Arquivos-chave criados/alterados:** Nenhum. `PROMPT-GOAL-IMPLEMENTACAO.md` permanece não rastreado e intocado.
- **Critérios de aceite:** 0 de 39 marcados. Todos permanecem desmarcados porque a fundação local, a infraestrutura externa e o fluxo protegido de entrega continuam bloqueados.
- **Testes:** Nenhum teste executado; Docker não está instalado e não existe ambiente local para migrations, RLS ou A7.
- **Branch / PR:** `ticket/01-esqueleto-vivo-monorepo-ci-deploy` existe em `afb94b6`, ainda não atualizada com a `main` local em `f67a255`; PR inexistente; CI inexistente.
- **Decisões que tomei sozinho:** Nenhuma. Mantive a proibição de escrever produção enquanto os gates obrigatórios estiverem pendentes.
- **Descobertas que afetam tickets seguintes:** GitHub continua recusando branch protection no repositório privado com HTTP 403 por falta de plano compatível. Não existe GitHub Environment `production`. Nenhuma configuração verificável de Supabase, Railway, credenciais dos papéis ou backup foi disponibilizada.
- **Documentos emendados:** Nenhum.
- **Precisa de mão humana:** 1. Instalar e iniciar Docker Desktop com Compose; `docker version` e `docker compose version` precisam funcionar. 2. Habilitar branch protection para repositório privado mediante GitHub Pro/Team, ou tornar o repositório público; hoje a API continua respondendo 403. 3. Criar o projeto Supabase de produção e informar seus metadados não secretos e região. 4. Criar o projeto Railway na mesma região, com serviços separados `web`, `worker` e Redis, além de Wait for CI. 5. Criar o GitHub Environment `production` e guardar nele a connection string owner de migrations. 6. Gerar e guardar senhas distintas para `marctco_migrator`, `marctco_app` e `marctco_worker`, sem enviá-las no chat ou versioná-las. 7. Confirmar que produção está vazia de leads reais ou indicar um backup restaurável existente.

### Retomada após ação humana — 2026-08-05

- O repositório foi tornado público; GitHub Environments e branch protection passaram a estar disponíveis no plano atual.
- O GitHub Environment `production` foi criado via API, restrito a branches protegidas e ainda sem secrets; o nome exato do secret será definido pelo workflow do ticket 01.
- O projeto Supabase existe e a produção foi confirmada vazia de leads reais; o gate A6 não exige backup nesta primeira migration.
- O Railway registrou um deployment falho do commit documental `c377f30`; ainda não existe código deployável nem workflow com `push`, portanto Wait for CI ainda não pode ser habilitado.
- Docker Desktop 29.6.2 e Compose v5.3.1 estão instalados, mas o engine Linux permanece `stopped`: `docker version` recebe HTTP 500 no named pipe `dockerDesktopLinuxEngine`. Windows 10 build 19045 e virtualização de firmware estão aptos; a habilitação/conclusão do WSL2 exige PowerShell elevado e reinício da máquina.
