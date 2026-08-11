"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "../../../../../../../components/ui/button";
import { FieldError, FieldLabel, TextInput } from "../../../../../../../components/ui/field";
import {
  canReleaseQuarantinedLead,
  NO_CONTACT_EXPLANATION
} from "../../../../../../../lib/quarantine-release-eligibility";

export interface ReleaseFormProps {
  readonly slug: string;
  readonly eventId: string;
  /** Pre-filled from whatever the raw payload already had right, if anything. */
  readonly initialName: string;
}

type SubmitState =
  | { readonly kind: "idle" }
  | { readonly kind: "submitting" }
  | { readonly kind: "still_quarantined" }
  | { readonly kind: "error"; readonly message: string };

/**
 * "Completar e liberar" — the one action this screen offers on a quarantined
 * lead. Collects the `v1` contact fields directly; there is no De→Para
 * wizard here, because there is no origin shape to interpret — a human is
 * reading the raw payload beside this form and typing what they see
 * (ADR-0017).
 */
export function ReleaseForm({ slug, eventId, initialName }: ReleaseFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [cpf, setCpf] = useState("");
  const [state, setState] = useState<SubmitState>({ kind: "idle" });

  const eligible = canReleaseQuarantinedLead({ phone, email });

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!eligible) {
      return;
    }
    setState({ kind: "submitting" });
    try {
      const response = await fetch(
        `/workspace/${slug}/integrations/pluga/quarantine/${eventId}/release`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name, phone, email, cpf })
        }
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        setState({
          kind: "error",
          message: body?.message ?? "Não foi possível liberar este lead agora. Tente novamente."
        });
        return;
      }
      const body = (await response.json()) as { kind: string };
      if (body.kind === "QUARANTINE") {
        setState({ kind: "still_quarantined" });
        return;
      }
      router.push(`/workspace/${slug}/integrations/pluga?released=${eventId}`);
      router.refresh();
    } catch {
      setState({
        kind: "error",
        message: "Não foi possível liberar este lead agora. Verifique a conexão e tente de novo."
      });
    }
  }

  const submitting = state.kind === "submitting";

  return (
    <form className="flex flex-col gap-md" onSubmit={(event) => void handleSubmit(event)}>
      <div>
        <FieldLabel htmlFor="release-name">Nome</FieldLabel>
        <TextInput
          id="release-name"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
      </div>

      <div>
        <FieldLabel htmlFor="release-phone">Telefone</FieldLabel>
        <TextInput
          id="release-phone"
          placeholder="11999998888"
          value={phone}
          onChange={(event) => {
            setPhone(event.target.value);
          }}
        />
      </div>

      <div>
        <FieldLabel htmlFor="release-email">E-mail</FieldLabel>
        <TextInput
          id="release-email"
          type="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
          }}
        />
      </div>

      <div>
        <FieldLabel htmlFor="release-cpf">CPF (opcional)</FieldLabel>
        <TextInput
          id="release-cpf"
          value={cpf}
          onChange={(event) => {
            setCpf(event.target.value);
          }}
        />
      </div>

      {!eligible ? <FieldError>{NO_CONTACT_EXPLANATION}</FieldError> : null}
      {state.kind === "error" ? <FieldError>{state.message}</FieldError> : null}
      {state.kind === "still_quarantined" ? (
        <p className="text-caption text-warning-ink" role="alert">
          {NO_CONTACT_EXPLANATION}
        </p>
      ) : null}

      <Button disabled={!eligible || submitting} type="submit" variant="primary">
        {submitting ? "Liberando…" : "Completar e liberar"}
      </Button>
    </form>
  );
}
