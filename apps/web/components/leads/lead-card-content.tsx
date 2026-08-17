"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { FinancingType, IdentityConflictResolution, LeadActivity, LeadDetail, LeadReviewDetail } from "@marctco/db";
import { FINANCING_TYPES, markersFor, type Marker, type PossibleDuplicateResolution } from "@marctco/domain";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { FieldError, FieldLabel, TextInput } from "../ui/field";
import { StatusBadge, type StatusBadgeTone } from "../ui/status-badge";
import { markerPresentation } from "../../lib/leads/markers";
import { formatArrivedAt, formatInstallmentAmount } from "../../lib/leads/row-view-model";
import { LeadCardActivities, type ActivityAssigneeOption } from "./lead-card-activities";

const MARKER_TONE: Readonly<Record<Marker, StatusBadgeTone>> = {
  MISSING_PHONE: "warning",
  IDENTITY_CONFLICT: "danger",
  POSSIBLE_DUPLICATE: "info"
};

const FINANCING_TYPE_LABELS: Readonly<Record<FinancingType, string>> = {
  VEHICLE: "Veículo",
  REAL_ESTATE: "Imóvel",
  PERSONAL_LOAN: "Empréstimo pessoal",
  OTHER: "Outro"
};

const SOURCE_LABELS: Readonly<Record<string, string>> = {
  META_LEAD_ADS: "Meta",
  GOOGLE_LEAD_FORM: "Google",
  LANDING_PAGE: "Landing page"
};

const selectClassName =
  "min-h-10 w-full rounded-md border border-hairline bg-canvas px-sm py-xs text-body text-ink hover:border-hairline-strong focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-focus pointer-coarse:min-h-11";

export interface LeadCardContentProps {
  readonly lead: LeadDetail;
  readonly slug: string;
  readonly currentUserId: string;
  readonly activities: readonly LeadActivity[];
  readonly assignees: readonly ActivityAssigneeOption[];
}

/**
 * The card: contacts, financing, the comparison for any pending review, and
 * the edit form — all built from a single `getLead` read (ADR-0013). The
 * resolution actions here are the only place a possible duplicate or an
 * identity conflict get resolved; there is no "excluir duplicado" anywhere
 * in this file (ADR-0007).
 */
export function LeadCardContent({ lead, slug, currentUserId, activities, assignees }: LeadCardContentProps) {
  // The same `markersFor` the row and the comparison read from — the card
  // never re-derives "what does this lead have" on its own (ADR-0018). The
  // resolution panels below still read `lead.reviews` directly, because they
  // need the full review record (candidates, related card), not just which
  // marker kind is present.
  const markers = markersFor({ missing_phone: lead.missing_phone }, lead.reviews);

  return (
    <div className="grid gap-lg">
      <section>
        <div className="flex flex-wrap items-center gap-sm">
          <h3 className="text-title text-ink">{lead.name?.trim() || "Sem nome"}</h3>
          {lead.source ? <StatusBadge tone="info">{SOURCE_LABELS[lead.source] ?? lead.source}</StatusBadge> : null}
          {markers.map((marker) => (
            <StatusBadge key={marker} tone={MARKER_TONE[marker]}>
              {markerPresentation(marker).label}
            </StatusBadge>
          ))}
        </div>
        <p className="mt-xxs text-body-sm text-ink-muted">
          Chegou em <span className="tabular-nums">{formatArrivedAt(lead.arrived_at)}</span>
        </p>
      </section>

      <section className="grid gap-sm md:grid-cols-2">
        <Card className="p-md">
          <h4 className="text-label text-ink-secondary">Contatos</h4>
          <ContactList emails={lead.emails} phones={lead.phones} />
          {lead.cpf ? <p className="mt-xs text-body-sm text-ink">CPF: {lead.cpf}</p> : null}
        </Card>
        <Card className="p-md">
          <h4 className="text-label text-ink-secondary">Financiamento</h4>
          <dl className="mt-xs grid gap-xxs text-body-sm">
            <FinancingFact label="Tipo" value={lead.financing_type ? FINANCING_TYPE_LABELS[lead.financing_type] : "—"} />
            <FinancingFact label="Instituição" value={lead.financial_institution ?? "—"} />
            <FinancingFact label="Parcela" value={formatInstallmentAmount(lead.installment_amount)} />
          </dl>
        </Card>
        <Card className="p-md">
          <h4 className="text-label text-ink-secondary">Campanha e formulário</h4>
          <dl className="mt-xs grid gap-xxs text-body-sm">
            <FinancingFact label="Campanha" value={lead.campaign_name?.trim() || "—"} />
            <FinancingFact label="Formulário" value={lead.form_name?.trim() || "—"} />
          </dl>
        </Card>
      </section>

      {lead.reviews.map((review) =>
        review.type === "POSSIBLE_DUPLICATE" ? (
          <PossibleDuplicatePanel key={review.id} review={review} slug={slug} />
        ) : (
          <IdentityConflictPanel key={review.id} review={review} slug={slug} />
        )
      )}

      <LeadCardActivities
        activities={activities}
        assignees={assignees}
        currentUserId={currentUserId}
        opportunityId={lead.opportunity_id}
        slug={slug}
      />

      <LeadEditForm lead={lead} slug={slug} />
    </div>
  );
}

function ContactList({ phones, emails }: Readonly<{ phones: readonly string[]; emails: readonly string[] }>) {
  if (phones.length === 0 && emails.length === 0) {
    return <p className="mt-xs text-body-sm text-ink-muted">Nenhum contato registrado.</p>;
  }
  return (
    <ul className="mt-xs grid gap-xxs text-body-sm text-ink">
      {phones.map((phone) => (
        <li key={phone}>{phone}</li>
      ))}
      {emails.map((email) => (
        <li key={email}>{email}</li>
      ))}
    </ul>
  );
}

function FinancingFact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex justify-between gap-sm">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}

const POSSIBLE_DUPLICATE_OPTIONS: ReadonlyArray<{ value: PossibleDuplicateResolution; label: string }> = [
  { value: "NEW_FINANCING", label: "São financiamentos distintos" },
  { value: "SAME_FINANCING", label: "É o mesmo financiamento — mesclar" },
  { value: "INVALID_OR_SPAM", label: "Envio inválido ou spam" }
];

function PossibleDuplicatePanel({ review, slug }: Readonly<{ review: LeadReviewDetail; slug: string }>) {
  const router = useRouter();
  const [resolution, setResolution] = useState<PossibleDuplicateResolution | "">("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const related = review.related_opportunity;

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!resolution) {
      setError("Escolha uma resolução");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/workspace/${slug}/leads/reviews/${review.id}/resolve-duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolution, reason })
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? "Não foi possível resolver");
        return;
      }
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="p-md">
      <h4 className="text-label text-ink-secondary">Possível duplicado</h4>
      <p className="mt-xxs text-body-sm text-ink-muted">
        Outra Oportunidade em aberto desta mesma Pessoa. Tipo, instituição, parcela, origem, campanha e
        formulário ajudam a distinguir uma da outra — nenhum campo é prova por si só.
      </p>
      {related ? (
        <dl className="mt-sm grid gap-xxs rounded-md border border-hairline-soft bg-surface-inset p-sm text-body-sm">
          <FinancingFact
            label="Tipo"
            value={related.financing_type ? FINANCING_TYPE_LABELS[related.financing_type] : "—"}
          />
          <FinancingFact label="Instituição" value={related.financial_institution ?? "—"} />
          <FinancingFact label="Parcela" value={formatInstallmentAmount(related.installment_amount)} />
          <FinancingFact
            label="Origem"
            value={related.source ? (SOURCE_LABELS[related.source] ?? related.source) : "—"}
          />
          <FinancingFact label="Campanha" value={related.campaign_name?.trim() || "—"} />
          <FinancingFact label="Formulário" value={related.form_name?.trim() || "—"} />
          <FinancingFact label="Chegada" value={formatArrivedAt(related.arrived_at)} />
          <FinancingFact
            label="Responsável"
            value={related.assigned_user_id ? (related.assigned_user_name ?? "Responsável sem nome") : "Não atribuído"}
          />
        </dl>
      ) : null}

      <form className="mt-sm grid gap-sm" onSubmit={(event) => { void handleSubmit(event); }}>
        <div className="grid gap-xxs">
          {POSSIBLE_DUPLICATE_OPTIONS.map((option) => (
            <label className="flex items-center gap-xs text-body-sm text-ink" key={option.value}>
              <input
                checked={resolution === option.value}
                name={`resolution-${review.id}`}
                onChange={() => setResolution(option.value)}
                type="radio"
                value={option.value}
              />
              {option.label}
            </label>
          ))}
        </div>
        <div>
          <FieldLabel htmlFor={`reason-${review.id}`} required>
            Motivo
          </FieldLabel>
          <TextInput
            id={`reason-${review.id}`}
            invalid={error !== null}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Explique a decisão para o registro de auditoria"
            required
            value={reason}
          />
        </div>
        {error ? <FieldError>{error}</FieldError> : null}
        <div>
          <Button disabled={submitting} type="submit" variant="primary">
            {submitting ? "Resolvendo…" : "Resolver"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function IdentityConflictPanel({ review, slug }: Readonly<{ review: LeadReviewDetail; slug: string }>) {
  const router = useRouter();
  const [resolution, setResolution] = useState<IdentityConflictResolution | "">("");
  const [canonicalPersonId, setCanonicalPersonId] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!resolution) {
      setError("Escolha uma resolução");
      return;
    }
    if (resolution === "MERGED" && !canonicalPersonId) {
      setError("Escolha a Pessoa candidata para mesclar");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/workspace/${slug}/leads/reviews/${review.id}/resolve-identity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resolution,
          reason,
          canonical_person_id: resolution === "MERGED" ? canonicalPersonId : undefined
        })
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? "Não foi possível resolver");
        return;
      }
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="p-md">
      <h4 className="text-label text-ink-secondary">Identidade em conflito</h4>
      <p className="mt-xxs text-body-sm text-ink-muted">
        Os contatos deste envio apontam para mais de uma Pessoa cadastrada. Mescle na candidata certa ou
        confirme que são pessoas distintas.
      </p>

      <div className="mt-sm grid gap-xs">
        {review.candidate_persons.map((candidate) => (
          <label
            className="flex items-start gap-xs rounded-md border border-hairline-soft bg-surface-inset p-sm text-body-sm text-ink"
            key={candidate.person_id}
          >
            <input
              checked={resolution === "MERGED" && canonicalPersonId === candidate.person_id}
              name={`candidate-${review.id}`}
              onChange={() => {
                setResolution("MERGED");
                setCanonicalPersonId(candidate.person_id);
              }}
              type="radio"
              value={candidate.person_id}
            />
            <span>
              <span className="block text-body-strong">{candidate.name?.trim() || "Sem nome"}</span>
              {candidate.cpf ? <span className="block text-ink-muted">CPF: {candidate.cpf}</span> : null}
              {candidate.phones.length > 0 ? (
                <span className="block text-ink-muted">{candidate.phones.join(", ")}</span>
              ) : null}
              {candidate.emails.length > 0 ? (
                <span className="block text-ink-muted">{candidate.emails.join(", ")}</span>
              ) : null}
            </span>
          </label>
        ))}
        <label className="flex items-center gap-xs text-body-sm text-ink">
          <input
            checked={resolution === "CONFIRMED_DISTINCT"}
            name={`candidate-${review.id}`}
            onChange={() => {
              setResolution("CONFIRMED_DISTINCT");
              setCanonicalPersonId("");
            }}
            type="radio"
          />
          Nenhuma — são pessoas distintas
        </label>
      </div>

      <form className="mt-sm grid gap-sm" onSubmit={(event) => { void handleSubmit(event); }}>
        <div>
          <FieldLabel htmlFor={`identity-reason-${review.id}`} required>
            Motivo
          </FieldLabel>
          <TextInput
            id={`identity-reason-${review.id}`}
            invalid={error !== null}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Explique a decisão para o registro de auditoria"
            required
            value={reason}
          />
        </div>
        {error ? <FieldError>{error}</FieldError> : null}
        <div>
          <Button disabled={submitting} type="submit" variant="primary">
            {submitting ? "Resolvendo…" : "Resolver"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function LeadEditForm({ lead, slug }: Readonly<{ lead: LeadDetail; slug: string }>) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(lead.name ?? "");
  const [cpf, setCpf] = useState(lead.cpf ?? "");
  const [financingType, setFinancingType] = useState(lead.financing_type ?? "");
  const [institution, setInstitution] = useState(lead.financial_institution ?? "");
  const [installmentAmount, setInstallmentAmount] = useState(lead.installment_amount ?? "");
  const [addPhone, setAddPhone] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <div>
        <Button onClick={() => setOpen(true)} variant="secondary">
          Editar dados do lead
        </Button>
      </div>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/workspace/${slug}/leads/${lead.opportunity_id}/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          cpf: cpf.trim() === "" ? null : cpf,
          financing_type: financingType === "" ? null : financingType,
          financial_institution: institution.trim() === "" ? null : institution,
          installment_amount: installmentAmount.trim() === "" ? null : installmentAmount,
          add_phone: addPhone.trim() === "" ? undefined : addPhone,
          add_email: addEmail.trim() === "" ? undefined : addEmail
        })
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? "Não foi possível salvar");
        return;
      }
      setAddPhone("");
      setAddEmail("");
      setOpen(false);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="p-md">
      <h4 className="text-label text-ink-secondary">Editar dados do lead</h4>
      <form className="mt-sm grid gap-sm md:grid-cols-2" onSubmit={(event) => { void handleSubmit(event); }}>
        <div>
          <FieldLabel htmlFor="edit-name">Nome</FieldLabel>
          <TextInput id="edit-name" onChange={(event) => setName(event.target.value)} value={name} />
        </div>
        <div>
          <FieldLabel htmlFor="edit-cpf">CPF</FieldLabel>
          <TextInput id="edit-cpf" onChange={(event) => setCpf(event.target.value)} value={cpf} />
        </div>
        <div>
          <FieldLabel htmlFor="edit-financing-type">Tipo de financiamento</FieldLabel>
          <select
            className={selectClassName}
            id="edit-financing-type"
            onChange={(event) => setFinancingType(event.target.value)}
            value={financingType}
          >
            <option value="">Não informado</option>
            {FINANCING_TYPES.map((type) => (
              <option key={type} value={type}>
                {FINANCING_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel htmlFor="edit-institution">Instituição</FieldLabel>
          <TextInput
            id="edit-institution"
            onChange={(event) => setInstitution(event.target.value)}
            value={institution}
          />
        </div>
        <div>
          <FieldLabel htmlFor="edit-installment">Parcela</FieldLabel>
          <TextInput
            id="edit-installment"
            onChange={(event) => setInstallmentAmount(event.target.value)}
            placeholder="1234,56"
            value={installmentAmount}
          />
        </div>
        <div>
          <FieldLabel htmlFor="edit-add-phone">Adicionar telefone</FieldLabel>
          <TextInput
            id="edit-add-phone"
            onChange={(event) => setAddPhone(event.target.value)}
            placeholder="(11) 98765-4321"
            value={addPhone}
          />
        </div>
        <div>
          <FieldLabel htmlFor="edit-add-email">Adicionar e-mail</FieldLabel>
          <TextInput
            id="edit-add-email"
            onChange={(event) => setAddEmail(event.target.value)}
            placeholder="nome@exemplo.com"
            type="email"
            value={addEmail}
          />
        </div>
        {error ? <FieldError>{error}</FieldError> : null}
        <div className="flex gap-sm md:col-span-2">
          <Button disabled={submitting} type="submit" variant="primary">
            {submitting ? "Salvando…" : "Salvar"}
          </Button>
          <Button onClick={() => setOpen(false)} type="button" variant="tertiary">
            Cancelar
          </Button>
        </div>
      </form>
    </Card>
  );
}
