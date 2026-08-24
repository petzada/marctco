import { listIntegrationConnections } from "@marctco/db";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { IntegrationSecretNotice } from "../../../../../components/integrations/integration-secret-notice";
import { IntegrationSecretPanel } from "../../../../../components/integrations/integration-secret-panel";
import {
  canManageIntegrationSecret,
  canOpenIntegrationScreen
} from "../../../../../lib/integration-access";
import { LANDING_PAGE_SURFACE } from "../../../../../lib/integration-surfaces";
import {
  canonicalLandingPagePayload,
  contactForm7Recipe,
  elementorRecipe,
  framerBridgeRecipe,
  LANDING_PAGE_ENDPOINT_PATH,
  nextServerlessRecipe,
  nodeServerRecipe,
  wordpressBaseRecipe,
  wpFormsRecipe
} from "../../../../../lib/landing-page-recipes";
import { publicIntegrationUrl } from "../../../../../lib/public-origin";
import { resolveWorkspaceAccess } from "../../../../../lib/workspace-access";

export const metadata: Metadata = {
  title: "Landing page | marctco",
  description: "Receitas seguras para enviar formulários de landing page ao CRM"
};

export default async function LandingPageIntegrationGuide({
  params
}: Readonly<{ params: Promise<{ slug: string }> }>) {
  const { slug } = await params;
  const [access, requestHeaders] = await Promise.all([resolveWorkspaceAccess(slug), headers()]);
  if (access.status !== "resolved" || !canOpenIntegrationScreen(access.workspace.role)) {
    notFound();
  }
  const webhookUrl = publicIntegrationUrl(requestHeaders, LANDING_PAGE_ENDPOINT_PATH);

  const isOwner = canManageIntegrationSecret(access.workspace.role);
  const connections = isOwner
    ? await listIntegrationConnections(access.workspace.context, LANDING_PAGE_SURFACE.provider)
    : [];

  return (
    <main className="min-h-[100dvh] bg-canvas px-md py-xl md:px-lg md:py-xxl">
      <div className="mx-auto w-full max-w-content">
        <header className="max-w-prose">
          <p className="text-eyebrow text-primary">Integração</p>
          <h1 className="mt-xs text-headline text-ink md:text-display-md">Landing page</h1>
          <p className="mt-sm text-body text-ink-secondary">
            Envie cada formulário pelo servidor do site. O CRM guarda primeiro e processa
            depois, sem depender da fila para aceitar o lead.
          </p>
        </header>

        <section className="mt-xl rounded-lg border border-hairline bg-canvas p-lg">
          <p className="inline-flex rounded-pill bg-warning-surface px-sm py-xs text-caption text-warning-ink">
            Aviso de segurança
          </p>
          <h2 className="mt-sm text-title text-ink">O token nunca vai no navegador</h2>
          <p className="mt-sm max-w-prose text-body text-ink-secondary">
            Qualquer pessoa consegue ler o JavaScript de uma página. Se o token estiver ali,
            terceiros podem enviar leads para sua operação. Guarde-o no WordPress, no backend
            ou nos segredos da função serverless.
          </p>
          <p className="mt-sm max-w-prose text-body-sm text-ink-secondary">
            Esta API não habilita CORS. Um formulário no navegador deve chamar o backend da
            própria landing page, e esse backend chama o CRM.
          </p>
        </section>

        {/*
          The panel sits below the security warning on purpose: it is where the
          token becomes visible, and the rule about never putting it in the
          browser has to be read before it is copied — not after.
        */}
        <div className="mt-lg">
          {isOwner ? (
            <IntegrationSecretPanel
              connections={connections}
              slug={slug}
              surface={LANDING_PAGE_SURFACE}
              webhookUrl={webhookUrl}
            />
          ) : (
            <IntegrationSecretNotice />
          )}
        </div>

        <section className="mt-lg rounded-lg border border-hairline bg-canvas p-lg md:p-xl">
          <h2 className="text-title text-ink">Endereço e autenticação</h2>
          <p className="mt-sm text-body text-ink-secondary">
            Complete o caminho abaixo com o domínio público do CRM. O segredo é o desta conexão,
            gerado no painel acima — não o da Pluga: cada origem tem o seu, para que rotacionar
            uma não derrube a outra.
          </p>
          <CodeBlock
            code={
              "POST https://SEU-CRM.example" +
              LANDING_PAGE_ENDPOINT_PATH +
              "\nAuthorization: Bearer SEU_TOKEN\nContent-Type: application/json"
            }
          />

          <h3 className="mt-xl text-body-strong text-ink">Respostas</h3>
          <dl className="mt-sm grid gap-sm md:grid-cols-3">
            <ResponseFact code="200" description="JSON aceito e guardado" />
            <ResponseFact code="401" description="Token ausente ou inválido" />
            <ResponseFact code="400" description="Corpo não é JSON" />
          </dl>
        </section>

        <section className="mt-lg rounded-lg border border-hairline bg-canvas p-lg md:p-xl">
          <h2 className="text-title text-ink">Formato v1</h2>
          <p className="mt-sm max-w-prose text-body text-ink-secondary">
            Nenhum dado comercial é obrigatório. Use os nomes abaixo quando o formulário os
            tiver. Campos extras continuam guardados no evento original.
          </p>
          <CodeBlock code={canonicalLandingPagePayload} />
          <div className="mt-lg rounded-md border border-hairline bg-surface-inset p-md">
            <p className="text-body-strong text-ink">Prefira um identificador estável</p>
            <p className="mt-xs text-body-sm text-ink-secondary">
              Reenviar o mesmo <code className="font-mono">external_lead_id</code> não cria outro
              lead. Sem esse campo, o CRM usa o identificador do evento recebido. Dois POSTs
              diferentes viram duas submissões visíveis, mesmo que tenham o mesmo conteúdo.
            </p>
          </div>
        </section>

        <section className="mt-lg rounded-lg border border-hairline bg-canvas p-lg md:p-xl">
          <h2 className="text-title text-ink">WordPress</h2>
          <p className="mt-sm max-w-prose text-body text-ink-secondary">
            Instale a base uma vez no servidor e depois escolha o hook do plugin usado pelo
            formulário. Ajuste os IDs dos campos aos nomes reais do site.
          </p>
          <Recipe title="Base segura no servidor" code={wordpressBaseRecipe} open />
          <Recipe
            title="Contact Form 7"
            code={contactForm7Recipe}
            source="https://contactform7.com/2020/07/28/accessing-user-input-data/"
          />
          <Recipe
            title="WPForms"
            code={wpFormsRecipe}
            source="https://wpforms.com/developers/wpforms_process_complete/"
          />
          <Recipe
            title="Elementor Forms"
            code={elementorRecipe}
            source="https://developers.elementor.com/docs/hooks/forms/"
          />
        </section>

        <section className="mt-lg rounded-lg border border-hairline bg-canvas p-lg md:p-xl">
          <h2 className="text-title text-ink">Builders com webhook</h2>
          <p className="mt-sm max-w-prose text-body text-ink-secondary">
            Se o builder permite configurar o cabeçalho Authorization, ele pode chamar o CRM
            diretamente. Se ele envia apenas uma URL, aponte o webhook nativo para uma função
            serverless e deixe essa função guardar o token.
          </p>
          <div className="mt-lg grid gap-lg md:grid-cols-2">
            <BuilderRecipe
              title="Typebot e similares"
              body="No bloco HTTP Request, use POST, JSON e o cabeçalho Authorization. Mapeie os campos para o formato v1 e mantenha source como LANDING_PAGE."
            />
            <BuilderRecipe
              title="Framer e Webflow"
              body="Configure o webhook nativo para sua rota serverless. O token do CRM fica nessa rota, não no projeto publicado. Use o ID da submissão do builder como external_lead_id."
            />
          </div>
          <Recipe
            title="Ponte serverless para Framer"
            code={framerBridgeRecipe}
            source="https://www.framer.com/help/articles/framer-form-webhook-setup/"
          />
        </section>

        <section className="mt-lg rounded-lg border border-hairline bg-canvas p-lg md:p-xl">
          <h2 className="text-title text-ink">Stack própria</h2>
          <p className="mt-sm max-w-prose text-body text-ink-secondary">
            Faça o POST depois de validar e salvar o formulário no seu servidor. Em aplicações
            sem backend permanente, use uma rota serverless com variáveis de ambiente.
          </p>
          <Recipe title="Backend Node.js" code={nodeServerRecipe} open />
          <Recipe title="Route Handler serverless" code={nextServerlessRecipe} />
        </section>

        <section className="mt-lg rounded-lg border border-hairline-strong bg-surface-inset p-lg md:p-xl">
          <p className="text-caption text-ink-muted">Google Lead Form</p>
          <h2 className="mt-xs text-title text-ink">Mapeamento aguardando teste real</h2>
          <p className="mt-sm max-w-prose text-body text-ink-secondary">
            A lista pública da Pluga para esse gatilho é incompleta. Conecte uma conta real,
            envie um lead de teste e confirme primeiro nome, telefone, e-mail e identificadores
            disponíveis. Só depois escreva o modelo copiável.
          </p>
          <p className="mt-sm max-w-prose text-body-sm text-ink-secondary">
            O modelo validado deverá declarar <code className="font-mono">source</code> como{" "}
            <code className="font-mono">GOOGLE_LEAD_FORM</code>, porque uma conexão Pluga sem
            origem declarada usa Meta como padrão.
          </p>
        </section>
      </div>
    </main>
  );
}

function CodeBlock({ code }: Readonly<{ code: string }>) {
  return (
    <pre className="mt-md overflow-x-auto rounded-lg border border-hairline bg-surface-inset p-md text-mono text-ink">
      <code>{code}</code>
    </pre>
  );
}

function ResponseFact({ code, description }: Readonly<{ code: string; description: string }>) {
  return (
    <div className="rounded-md border border-hairline bg-surface-inset p-md">
      <dt className="font-mono text-body-strong tabular-nums text-ink">{code}</dt>
      <dd className="mt-xxs text-body-sm text-ink-secondary">{description}</dd>
    </div>
  );
}

function Recipe({
  title,
  code,
  source,
  open = false
}: Readonly<{ title: string; code: string; source?: string; open?: boolean }>) {
  return (
    <details className="mt-md rounded-lg border border-hairline bg-surface-inset p-md" open={open}>
      <summary className="-mx-xs flex min-h-11 cursor-pointer items-center rounded-md px-xs text-body-strong text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-focus">
        {title}
      </summary>
      <CodeBlock code={code} />
      {source ? (
        <a
          className="mt-sm inline-block text-body-sm text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-focus"
          href={source}
          rel="noreferrer"
          target="_blank"
        >
          Conferir documentação oficial
        </a>
      ) : null}
    </details>
  );
}

function BuilderRecipe({ title, body }: Readonly<{ title: string; body: string }>) {
  return (
    <article className="rounded-lg border border-hairline bg-surface-inset p-lg">
      <h3 className="text-body-strong text-ink">{title}</h3>
      <p className="mt-xs text-body-sm text-ink-secondary">{body}</p>
    </article>
  );
}
