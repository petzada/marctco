"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "../ui/button";
import { FieldError, FieldLabel, TextInput } from "../ui/field";
import { Modal } from "../ui/modal";

export interface LeadQuickEditModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly slug: string;
  readonly opportunityId: string;
}

/**
 * "Ação de edição direto na linha da tabela, sem abrir o card" — the row's
 * quick action. It edits only what the "sem telefone" workflow needs to
 * complete (ADR-0007 §Quarentena): a phone and an e-mail to add. The rest of
 * the lead's data is edited from the card, which already has the room for a
 * full form.
 */
export function LeadQuickEditModal({ open, onClose, slug, opportunityId }: LeadQuickEditModalProps) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/workspace/${slug}/leads/${opportunityId}/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          add_phone: phone.trim() === "" ? undefined : phone,
          add_email: email.trim() === "" ? undefined : email
        })
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? "Não foi possível salvar");
        return;
      }
      setPhone("");
      setEmail("");
      onClose();
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      footer={
        <>
          <Button onClick={onClose} type="button" variant="tertiary">
            Cancelar
          </Button>
          <Button disabled={submitting} form="lead-quick-edit-form" type="submit" variant="primary">
            {submitting ? "Salvando…" : "Salvar"}
          </Button>
        </>
      }
      onClose={onClose}
      open={open}
      title="Completar contato"
    >
      <form className="grid gap-md" id="lead-quick-edit-form" onSubmit={(event) => { void handleSubmit(event); }}>
        <div>
          <FieldLabel htmlFor="quick-edit-phone">Telefone</FieldLabel>
          <TextInput
            id="quick-edit-phone"
            invalid={error !== null}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="(11) 98765-4321"
            value={phone}
          />
        </div>
        <div>
          <FieldLabel htmlFor="quick-edit-email">E-mail</FieldLabel>
          <TextInput
            id="quick-edit-email"
            invalid={error !== null}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="nome@exemplo.com"
            type="email"
            value={email}
          />
        </div>
        {error ? <FieldError>{error}</FieldError> : null}
      </form>
    </Modal>
  );
}
