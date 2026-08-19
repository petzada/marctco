import {
  MAX_FIRST_CONTACT_SLA_MINUTES,
  MAX_STAGNATION_DAYS,
  type ResolvedWorkspaceSettings
} from "@marctco/domain";
import { Button } from "../../../../components/ui/button";
import { FieldError, FieldLabel, TextInput } from "../../../../components/ui/field";
import { FirstContactSettingsForm } from "./first-contact-settings-form";

interface SettingsViewProps {
  readonly result?: string | undefined;
  readonly settings: ResolvedWorkspaceSettings;
  readonly slug: string;
}

function ResultMessage({ result }: Readonly<{ result?: string | undefined }>) {
  if (!result) return null;
  const failed =
    result === "invalid" ||
    result === "failed" ||
    result === "first-contact-invalid" ||
    result === "first-contact-failed";
  const message =
    result === "saved"
      ? "Ritmo da operação atualizado."
      : result === "first-contact"
        ? "Primeiro contato automático atualizado."
        : result === "invalid"
          ? "Informe um número inteiro positivo dentro do intervalo."
          : result === "first-contact-invalid"
            ? "Revise o gatilho e o texto. Variável inválida ou template vazio com o disparo ligado."
            : "Não foi possível salvar. Tente novamente.";
  return (
    <p
      className={`rounded-md border px-md py-sm text-body-sm ${
        failed ? "border-danger text-danger-ink" : "border-hairline bg-surface-inset text-ink"
      }`}
      role={failed ? "alert" : "status"}
    >
      {message}
    </p>
  );
}

export function SettingsView({ result, settings, slug }: SettingsViewProps) {
  const invalid = result === "invalid";
  return (
    <main className="mx-auto grid max-w-content gap-lg p-md sm:p-lg">
      <header className="max-w-prose">
        <h1 className="text-title text-ink md:text-headline">Configurações</h1>
        <p className="mt-sm text-body text-ink-secondary">
          Defina o ritmo da operação. Workspace que nunca salvou aqui continua
          com o padrão do domínio: o relógio não desliga.
        </p>
      </header>

      <ResultMessage result={result} />

      <section className="rounded-lg border border-hairline bg-canvas p-lg">
        <h2 className="text-title text-ink">Ritmo da operação</h2>
        <p className="mt-xxs max-w-prose text-body-sm text-ink-muted">
          O SLA conta da chegada até a primeira atividade concluída. A
          estagnação conta dias sem movimento no lead.
        </p>

        <form
          action={`/workspace/${slug}/settings/clocks`}
          className="mt-lg grid gap-md md:grid-cols-2"
          method="post"
        >
          <div>
            <FieldLabel htmlFor="first_contact_sla_minutes" required>
              SLA de primeiro contato (minutos)
            </FieldLabel>
            <TextInput
              aria-describedby="first-contact-sla-help"
              className="tabular-nums"
              defaultValue={settings.first_contact_sla_minutes}
              id="first_contact_sla_minutes"
              inputMode="numeric"
              invalid={invalid}
              max={MAX_FIRST_CONTACT_SLA_MINUTES}
              min={1}
              name="first_contact_sla_minutes"
              required
              type="number"
            />
            <p className="mt-1.5 text-caption text-ink-muted" id="first-contact-sla-help">
              Tempo máximo até alguém concluir a primeira atividade com este lead.
            </p>
            {invalid ? (
              <FieldError>Use um inteiro de 1 a {MAX_FIRST_CONTACT_SLA_MINUTES} minutos.</FieldError>
            ) : null}
          </div>
          <div>
            <FieldLabel htmlFor="stagnation_days" required>
              Estagnação (dias)
            </FieldLabel>
            <TextInput
              aria-describedby="stagnation-help"
              className="tabular-nums"
              defaultValue={settings.stagnation_days}
              id="stagnation_days"
              inputMode="numeric"
              invalid={invalid}
              max={MAX_STAGNATION_DAYS}
              min={1}
              name="stagnation_days"
              required
              type="number"
            />
            <p className="mt-1.5 text-caption text-ink-muted" id="stagnation-help">
              Sem movimento além deste limite, o lead conta como parado.
            </p>
            {invalid ? <FieldError>Use um inteiro de 1 a {MAX_STAGNATION_DAYS} dias.</FieldError> : null}
          </div>
          <div className="md:col-span-2">
            <Button type="submit" variant="primary">
              Salvar ritmo
            </Button>
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-hairline bg-canvas p-lg">
        <h2 className="text-title text-ink">Primeiro contato automático</h2>
        <p className="mt-xxs max-w-prose text-body-sm text-ink-muted">
          Define quando o WhatsApp de abertura sai e com qual texto. Sem
          consentimento explícito o disparo não acontece.
        </p>
        <FirstContactSettingsForm
          invalid={result === "first-contact-invalid"}
          settings={settings}
          slug={slug}
        />
      </section>
    </main>
  );
}
