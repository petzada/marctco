"use client";

import {
  FIRST_CONTACT_TRIGGERS,
  templateVariablesFor,
  type FirstContactTrigger,
  type ResolvedWorkspaceSettings
} from "@marctco/domain";
import { useState } from "react";
import { Button } from "../../../../components/ui/button";
import { FieldError, FieldLabel, NativeSelect, TextArea } from "../../../../components/ui/field";

const TRIGGER_LABELS: Readonly<Record<FirstContactTrigger, string>> = {
  ON_ASSIGNMENT: "Na atribuição",
  ON_ARRIVAL: "Na chegada",
  DISABLED: "Desligado"
};

const VARIABLE_LABELS: Readonly<Record<string, string>> = {
  lead_name: "Nome do lead",
  workspace_name: "Nome do workspace",
  attendant_name: "Nome do atendente",
  attendant_phone: "WhatsApp do atendente"
};

interface FirstContactSettingsFormProps {
  readonly invalid: boolean;
  readonly settings: ResolvedWorkspaceSettings;
  readonly slug: string;
}

export function FirstContactSettingsForm({
  invalid,
  settings,
  slug
}: FirstContactSettingsFormProps) {
  const [trigger, setTrigger] = useState<FirstContactTrigger>(settings.first_contact_trigger);
  const variables = templateVariablesFor(trigger);

  return (
    <form
      action={`/workspace/${slug}/settings/first-contact`}
      className="mt-lg grid gap-md"
      method="post"
    >
      <div>
        <FieldLabel htmlFor="first_contact_trigger" required>
          Quando disparar
        </FieldLabel>
        <NativeSelect
          defaultValue={settings.first_contact_trigger}
          id="first_contact_trigger"
          invalid={invalid}
          name="first_contact_trigger"
          onChange={(event) => setTrigger(event.target.value as FirstContactTrigger)}
          required
        >
          {FIRST_CONTACT_TRIGGERS.map((value) => (
            <option key={value} value={value}>
              {TRIGGER_LABELS[value]}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div>
        <FieldLabel htmlFor="first_contact_template_body" required={trigger !== "DISABLED"}>
          Texto da mensagem
        </FieldLabel>
        <TextArea
          defaultValue={settings.first_contact_template_body}
          id="first_contact_template_body"
          invalid={invalid}
          name="first_contact_template_body"
          rows={4}
        />
        {invalid ? (
          <FieldError>
            Use um texto com variáveis permitidas para o gatilho selecionado. O
            template não pode ficar vazio enquanto o disparo estiver ligado.
          </FieldError>
        ) : null}
      </div>
      <div>
        <p className="text-label text-ink-secondary">Variáveis permitidas</p>
        {variables.length === 0 ? (
          <p className="mt-1.5 text-caption text-ink-muted">
            Nenhuma variável neste gatilho. O disparo automático está desligado.
          </p>
        ) : (
          <ul className="mt-1.5 grid gap-xxs text-caption text-ink-secondary">
            {variables.map((name) => (
              <li key={name}>
                <code className="text-ink">{`{{${name}}}`}</code>
                {VARIABLE_LABELS[name] ? ` — ${VARIABLE_LABELS[name]}` : null}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <Button type="submit" variant="primary">
          Salvar primeiro contato
        </Button>
      </div>
    </form>
  );
}
