import type { ReactNode } from "react";
import { metaHttpRequestTemplate, pluginRequestHeaders } from "../../lib/pluga-templates";
import { Card } from "../ui/card";
import { CopyBlock } from "./copy-block";

/**
 * The Meta Ads half of the Pluga screen: the same labels the operator sees in
 * the Pluga builder, in the same order, with the values to pick or paste.
 * Mapping still happens in Pluga (ADR-0008). Google stays out until a real
 * account confirms that trigger's fields.
 */
export function PlugaMetaOnboarding({ webhookUrl }: Readonly<{ webhookUrl: string }>) {
  return (
    <>
      <p className="rounded-md border border-warning bg-warning-surface p-md text-body-sm text-warning-ink">
        HTTP Request só existe nos planos pagos da Pluga (piso Basic). Sem esse
        plano a automação não entrega o lead aqui.
      </p>

      <Card className="flex flex-col">
        <h2 className="text-title text-ink">Passo a passo na Pluga</h2>
        <p className="mt-xs max-w-prose text-body-sm text-ink-secondary">
          Os nomes abaixo são os da tela da Pluga. Uma automação por formulário.
          Não escolha Pluga Webhooks, outro CRM, planilha ou WhatsApp como
          destino.
        </p>

        <ol className="mt-lg flex flex-col divide-y divide-hairline-soft border-t border-hairline-soft">
          <Step n={1} title="Ferramenta e gatilho">
            <PickList
              items={[
                { label: "Ferramenta", value: "Facebook Lead Ads" },
                { label: "Gatilho", value: "Nova resposta em um anúncio" }
              ]}
            />
            <p className="mt-sm text-caption text-ink-muted">
              Não é Facebook Ads, Instagram Ads nem Google Ads Insights. O nome
              da automação é livre.
            </p>
          </Step>

          <Step n={2} title="Conecte sua conta">
            <p className="text-body-sm text-ink-secondary">
              Autorize a conta Facebook na Pluga, com permissão de administrador
              da Página da campanha. O CRM não pede login da Meta.
            </p>
          </Step>

          <Step n={3} title="Página e formulário">
            <PickList
              items={[
                { label: "Selecionar página", value: "Obrigatório" },
                { label: "Selecionar formulário", value: "Obrigatório" }
              ]}
            />
            <p className="mt-sm text-caption text-ink-muted">
              Uma Página e um formulário por automação. O CRM não lista Páginas:
              isso vem da Meta via Pluga. Filtro pode pular.
            </p>
          </Step>

          <Step n={4} title="Destino">
            <PickList
              items={[
                { label: "Ferramenta", value: "HTTP Request" },
                { label: "Ação", value: "Enviar uma mensagem via HTTP Request" }
              ]}
            />
          </Step>

          <Step n={5} title="Ajustes do HTTP Request">
            <PickList
              items={[
                { label: "Nome da Ferramenta", value: "Livre (ex.: marct.co CRM)" },
                { label: "Método", value: "POST (Padrão)" },
                { label: "Modelo de retorno dos dados", value: "Vazio neste fluxo" }
              ]}
            />
            <p className="mt-sm text-caption text-ink-muted">
              URL, corpo e cabeçalhos não são desta tela. Se houver etapa
              depois, o modelo de retorno pode ser{" "}
              <code className="font-mono text-mono">{`{"status":"accepted"}`}</code>
              .
            </p>
          </Step>

          <Step n={6} title="Personalize as informações">
            <p className="text-body-sm text-ink-secondary">
              Não use &quot;Preencher campos com IA&quot;. O contrato v1 é fixo e
              a IA não o conhece. Cada <code className="font-mono">{`<< … >>`}</code>{" "}
              entra pelo botão INSERIR INFOS: clique o campo, não digite o rótulo.
            </p>

            <PickList
              className="mt-md"
              items={[
                {
                  label: "Tipo de preenchimento",
                  value: "Preencher campos com um JSON"
                },
                { label: "Parâmetros de busca (JSON)", value: "Vazio" }
              ]}
            />

            <FieldCopy
              hint="Só o endereço. Sem POST na frente e sem workspace_id."
              label="URL de API"
            >
              <CopyBlock className="mt-xs" code={webhookUrl} label="URL" />
            </FieldCopy>

            <FieldCopy
              hint="O token é o segredo gerado nesta tela, em claro uma vez. Não use as 4 últimas letras. Não insira campos do gatilho no Bearer."
              label="Cabeçalhos (JSON)"
            >
              <CopyBlock className="mt-xs" code={pluginRequestHeaders} label="cabeçalhos" />
            </FieldCopy>

            <div className="mt-md rounded-md border border-warning bg-warning-surface p-md">
              <p className="text-body-strong text-warning-ink">Aspas no JSON</p>
              <p className="mt-xs text-body-sm text-warning-ink">
                <code className="font-mono">&quot;VEHICLE&quot;</code> leva aspas.{" "}
                <code className="font-mono">is_organic</code> não leva: é
                verdadeiro ou falso, não texto. Sem aspas em VEHICLE a Pluga
                nem dispara o POST, e nada aparece no histórico abaixo.
              </p>
            </div>

            <FieldCopy
              hint="schema_version, source e financing_type são literais. O resto vem do INSERIR INFOS."
              label="Corpo da requisição (JSON)"
            >
              <CopyBlock className="mt-xs" code={metaHttpRequestTemplate} label="corpo" />
            </FieldCopy>

            <h4 className="mt-lg text-label text-ink-secondary">Tipo de financiamento</h4>
            <p className="mt-xs max-w-prose text-caption text-ink-muted">
              O modelo cola &quot;VEHICLE&quot; porque o form de veículo é o caso
              mais comum. Troque o literal quando o formulário for outro. Não
              mapeie a pergunta &quot;qual seu veículo&quot; nesta chave: MOTO
              não é um tipo de financiamento.
            </p>
            <PickList
              className="mt-sm"
              items={[
                { label: "Veículo", value: '"VEHICLE"' },
                { label: "Imóvel", value: '"REAL_ESTATE"' },
                { label: "Empréstimo pessoal", value: '"PERSONAL_LOAN"' }
              ]}
            />

            <h4 className="mt-lg text-label text-ink-secondary">O que clicar no INSERIR INFOS</h4>
            <p className="mt-xs max-w-prose text-caption text-ink-muted">
              Contato usa os nomes mais comuns em formulário Meta em português.
              Se o editor mostrar outro (<code className="font-mono">full_name</code>
              , etc.), use o que aparecer. Sem nome, telefone e e-mail a
              automação não está pronta.
            </p>
            <InsertCatalog />

            <p className="mt-md max-w-prose text-caption text-ink-muted">
              Perguntas extras do form (estrela laranja) entram no objeto{" "}
              <code className="font-mono">answers</code>, com a mesma chave que
              o INSERIR INFOS mostra. Faixa de parcela fica aí: não é um valor
              único e não vai em <code className="font-mono">installment_amount</code>
              .
            </p>
          </Step>
        </ol>
      </Card>

      <section className="flex flex-col gap-sm">
        <h2 className="text-title text-ink">Como testar</h2>
        <ol className="max-w-prose list-decimal space-y-xs pl-lg text-body-sm text-ink-secondary">
          <li>Cole a URL, os cabeçalhos JSON e o corpo no HTTP Request.</li>
          <li>
            Na Pluga, envie a última informação do formulário. Esse envio de
            teste não espera o polling de cerca de 5 minutos da Meta em
            produção.
          </li>
          <li>
            Volte a esta tela e leia a coluna Mapeamento: Nome, Telefone e
            E-mail. Sem os três, corrija o INSERIR INFOS e reenvie.
          </li>
          <li>
            O histórico da Pluga em &quot;Processando&quot; não abre detalhes.
            &quot;Ver detalhes&quot; e &quot;Reenviar&quot; aparecem em
            &quot;Falhou&quot;. Para saber se o POST chegou, olhe o histórico
            desta tela, não o funil.
          </li>
          <li>
            Nada aqui e a Pluga em Falhou: leia a resposta HTTP. 401 é token.
            400 é JSON inválido. Se a Pluga quebrar ao montar o JSON, o POST
            nem sai e o CRM não registra evento.
          </li>
        </ol>
      </section>

      <section className="rounded-lg border border-hairline-strong bg-surface-inset p-lg">
        <h2 className="text-title text-ink">Google Ads</h2>
        <p className="mt-sm max-w-prose text-body-sm text-ink-secondary">
          O modelo Google fica pendente de um teste em conta real. A lista
          pública desse gatilho veio incompleta, sem campos de contato. Ads de
          Meta entram por esta tela; landing page é outra conexão, outro token e
          outro endereço.
        </p>
      </section>

      <section className="flex flex-col gap-xs">
        <h2 className="text-title text-ink">Quanto tempo o conteúdo fica guardado</h2>
        <p className="max-w-prose text-body-sm text-ink-secondary">
          Depois de 90 dias, o conteúdo do lead (nome, telefone, respostas do
          formulário) deixa de ser guardado. O registro de que o lead chegou,
          quando e no que deu continua. Um evento em quarentena é a exceção: ele
          não expira enquanto ninguém completar os dados e liberar o card.
        </p>
      </section>
    </>
  );
}

function Step({
  n,
  title,
  children
}: Readonly<{ n: number; title: string; children: ReactNode }>) {
  return (
    <li className="flex gap-md py-lg">
      <span className="mt-xxs w-5 shrink-0 text-caption tabular-nums text-ink-muted">{n}</span>
      <div className="min-w-0 flex-1">
        <h3 className="text-body-strong text-ink">{title}</h3>
        <div className="mt-sm">{children}</div>
      </div>
    </li>
  );
}

function PickList({
  items,
  className = ""
}: Readonly<{
  items: ReadonlyArray<{ label: string; value: string }>;
  className?: string;
}>) {
  return (
    <dl className={`flex flex-col gap-xs ${className}`.trim()}>
      {items.map((item) => (
        <div className="flex flex-col gap-xxs sm:flex-row sm:items-baseline sm:gap-md" key={item.label}>
          <dt className="shrink-0 text-caption text-ink-muted sm:w-48">{item.label}</dt>
          <dd className="font-mono text-mono text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function FieldCopy({
  label,
  hint,
  children
}: Readonly<{ label: string; hint: string; children: ReactNode }>) {
  return (
    <div className="mt-md">
      <p className="text-label text-ink-secondary">{label}</p>
      <p className="mt-xxs text-caption text-ink-muted">{hint}</p>
      {children}
    </div>
  );
}

const INSERT_CATALOG: ReadonlyArray<{ pluga: string; v1: string; note: string }> = [
  { pluga: "ID do Lead", v1: "external_lead_id", note: "Idempotência" },
  {
    pluga: "Data/hora de criação no formato ISO (AAAA-MM-DDTHH:mm:ssZ)",
    v1: "occurred_at",
    note: "Só esta. Ignore DD/MM/YY e MM/DD/YYYY"
  },
  { pluga: "nome_completo", v1: "name", note: "Outro form pode usar outro rótulo" },
  { pluga: "número_do_whatsapp", v1: "phone", note: "Já vem E.164. Prefira este" },
  { pluga: "email", v1: "email", note: "Chave igual à do contrato" },
  { pluga: "form_id / form_name", v1: "iguais", note: "Atribuição" },
  { pluga: "campaign_id / campaign_name", v1: "iguais", note: "Atribuição" },
  { pluga: "adset_id / adset_name", v1: "iguais", note: "Atribuição" },
  { pluga: "ad_id / ad_name", v1: "iguais", note: "Atribuição" },
  { pluga: "platform", v1: "igual", note: "Atribuição" },
  { pluga: "is_organic", v1: "igual", note: "Sem aspas. Pode vir vazio" }
];

function InsertCatalog() {
  return (
    <div className="mt-sm overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-hairline text-caption text-ink-muted">
            <th className="py-xs pr-md font-medium">INSERIR INFOS</th>
            <th className="py-xs pr-md font-medium">Chave v1</th>
            <th className="py-xs font-medium">Nota</th>
          </tr>
        </thead>
        <tbody>
          {INSERT_CATALOG.map((row) => (
            <tr className="border-b border-hairline-soft" key={row.pluga}>
              <td className="py-xs pr-md font-mono text-mono text-ink">{row.pluga}</td>
              <td className="py-xs pr-md font-mono text-mono text-ink">{row.v1}</td>
              <td className="py-xs text-caption text-ink-muted">{row.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
