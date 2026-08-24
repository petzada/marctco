import type { InboundLead, LeadSource } from "./inbound-lead.js";
import type { FinancingType, NormalizedLead } from "./normalize.js";
import type { PersonContacts, PersonDecision } from "./person-identity.js";

/**
 * The first and third phases of the intake module (ADR-0017). `planSubmission`
 * says what makes a transmission identifiable; `decideIntake` says what a
 * submission is going to produce, described as data before anything happens.
 *
 * **Three phases and not one**, because the result of the
 * `INSERT … ON CONFLICT DO NOTHING RETURNING id` is an **input** of the
 * decision, not an output of it: without it there is no way to know whether a
 * submission is new or a resend, and ADR-0007 is explicit that only the
 * constraint arbitrates that. The caller inserts between phase one and phase
 * three.
 *
 * Both functions are pure, and `now` is an argument. A clock read on the inside
 * is I/O in disguise and would kill the pure test exactly as a query would.
 */

/**
 * What `UNIQUE(workspace_id, integration_connection_id, source, external_lead_id)`
 * arbitrates.
 *
 * The connection is part of the identity, not context around it (ADR-0031).
 * Every landing page sends `source = LANDING_PAGE` and may declare its own
 * `external_lead_id`; two of them numbering independently both send lead `1`,
 * and a key that does not know which connection authenticated the send reads
 * the second as a resend of the first — the lead disappears with no card and
 * no error.
 *
 * Still a pure value: the caller supplies the connection because the caller
 * is the one that already resolved the token. The domain never looks it up.
 */
export interface SubmissionKey {
  readonly integration_connection_id: string;
  readonly source: LeadSource;
  readonly external_lead_id: string;
}

export function planSubmission(
  inbound: InboundLead,
  integration_connection_id: string
): SubmissionKey {
  return {
    integration_connection_id,
    source: inbound.source,
    external_lead_id: inbound.external_lead_id
  };
}

/**
 * What the insert reported — a fact, never a verdict. `RETURNING` empty is the
 * signal of a resend, and `opportunity_id` is what the earlier submission
 * actually produced, which is not the same question.
 */
export type SubmissionInsert =
  | {
      readonly kind: "INSERTED";
      readonly lead_submission_id: string;
    }
  | {
      readonly kind: "DUPLICATE";
      readonly lead_submission_id: string;
      /**
       * The Opportunity the earlier transmission of this submission left
       * behind, or null when it left none — quarantine, or a plan that never
       * committed.
       */
      readonly opportunity_id: string | null;
    };

/**
 * Where an ingested lead lands, already resolved by the caller:
 * `IntegrationConnection.target_pipeline_id` when present, otherwise the
 * commercial `Pipeline` with `is_default = true`.
 *
 * The financing type is not a field here and cannot become one — that is how
 * "`FinancingType` never participates in choosing the funnel, in any
 * hypothesis" stops being a rule somebody has to remember.
 */
export interface IntakeDestination {
  readonly pipeline_id: string;
  /** The stage with role `ENTRY`. Stage roles belong to the system; labels do not. */
  readonly entry_stage_id: string;
}

/** A pendency to hang on the Opportunity being created. Marker, never gate. */
export type IntakeReviewPlan =
  | {
      readonly type: "IDENTITY_CONFLICT";
      /** The Pessoas the submission's keys pointed at. A human merges later. */
      readonly candidate_person_ids: readonly string[];
    }
  | {
      readonly type: "POSSIBLE_DUPLICATE";
      readonly related_opportunity_id: string;
    };

export interface DecideIntakeInput {
  readonly normalized: NormalizedLead;
  /** What `INSERT … ON CONFLICT DO NOTHING RETURNING id` answered. */
  readonly submission: SubmissionInsert;
  readonly person: PersonDecision;
  readonly destination: IntakeDestination;
  /**
   * Open, unmerged Opportunities the Pessoa this submission belongs to already
   * has. Empty whenever a Pessoa is being created, because a Pessoa that does
   * not exist yet cannot have a card.
   */
  readonly open_opportunity_ids: readonly string[];
  /** The transmission being processed right now. */
  readonly integration_event_id: string;
  /**
   * `received_at` for the worker's job, the instant of the release for
   * "completar e liberar". One argument, two values — not two code paths.
   */
  readonly now: Date;
}

/**
 * Every variant is a case of ADR-0007, and exhaustiveness is the compiler's job.
 *
 * The `RETRANSMISSION` variant has **no field** for stage, responsible, status
 * or `arrived_at`. That is the most valuable line in this file: "a resend does
 * not rewind the funnel" stops being discipline and becomes an absent field.
 * There is no way to write the bug, because there is nowhere to write it.
 */
export type IntakePlan =
  | {
      readonly kind: "QUARANTINE";
      readonly lead_submission_id: string;
      readonly integration_event_id: string;
    }
  | {
      readonly kind: "RETRANSMISSION";
      readonly lead_submission_id: string;
      /** Whose timeline the "reenvio recebido" belongs to (ticket 11). */
      readonly opportunity_id: string;
      readonly integration_event_id: string;
    }
  | {
      readonly kind: "NEW_OPPORTUNITY";
      readonly lead_submission_id: string;
      readonly integration_event_id: string;
      readonly person:
        | { readonly kind: "REUSE"; readonly person_id: string }
        | { readonly kind: "CREATE" };
      /** Always the submission's complete set, never a delta (ADR-0007 §Identidade). */
      readonly contacts: PersonContacts;
      readonly pipeline_id: string;
      readonly stage_id: string;
      /** When the Opportunity comes to exist, and when the SLA clock may start. */
      readonly arrived_at: Date;
      /** Means one thing only: no WhatsApp and no phone call. */
      readonly missing_phone: boolean;
      readonly financing_type: FinancingType | null;
      readonly financial_institution: string | null;
      readonly installment_amount: string | null;
      /**
       * Media attribution from the `v1` contract. The four fields, not the
       * other six: they are what the queue and the card read, and what a
       * possible-duplicate comparison uses. A retransmission has no field
       * for them, which is how they cannot be overwritten (ADR-0007, ADR-0022).
       */
      readonly campaign_id: string | null;
      readonly campaign_name: string | null;
      readonly form_id: string | null;
      readonly form_name: string | null;
      /**
       * Snapshot of the submission that created or released this card.
       * Automatic dispatch requires `true`; anything else fails closed.
       */
      readonly whatsapp_opt_in: boolean | null;
      readonly reviews: readonly IntakeReviewPlan[];
    };

export function decideIntake(input: DecideIntakeInput): IntakePlan {
  const { normalized, submission, person, destination, integration_event_id } = input;
  const lead_submission_id = submission.lead_submission_id;

  // A resend of a submission that already produced a card: point the
  // submission at the new transmission, and stop. Everything the funnel holds
  // is protected by there being no field to touch it with.
  //
  // A duplicate that produced no card is a different fact, and it reaches the
  // normal path below: it is either a quarantined envio arriving again — which
  // quarantines again — or a plan that never committed, where going inert
  // would swallow the lead for good.
  if (submission.kind === "DUPLICATE" && submission.opportunity_id !== null) {
    return {
      kind: "RETRANSMISSION",
      lead_submission_id,
      opportunity_id: submission.opportunity_id,
      integration_event_id
    };
  }

  // No phone and no e-mail. The only submission that produces no Opportunity,
  // and it is not doubt — it is the impossibility of making contact. A valid
  // CPF does not rescue it: it identifies, but nobody is called on it.
  if (person.kind === "NO_CONTACT") {
    return { kind: "QUARANTINE", lead_submission_id, integration_event_id };
  }

  return {
    kind: "NEW_OPPORTUNITY",
    lead_submission_id,
    integration_event_id,
    person:
      person.kind === "REUSE_PERSON"
        ? { kind: "REUSE", person_id: person.person_id }
        : { kind: "CREATE" },
    contacts: person.contacts,
    pipeline_id: destination.pipeline_id,
    stage_id: destination.entry_stage_id,
    arrived_at: input.now,
    // The submission brought a way to write but no way to call. Missing CPF,
    // financing type, institution or instalment are ordinary entries and carry
    // no marker at all (ADR-0007 §Quarentena).
    missing_phone: normalized.phones.length === 0,
    financing_type: normalized.financing_type,
    financial_institution: normalized.financial_institution,
    installment_amount: normalized.installment_amount,
    campaign_id: normalized.attribution.campaign_id,
    campaign_name: normalized.attribution.campaign_name,
    form_id: normalized.attribution.form_id,
    form_name: normalized.attribution.form_name,
    whatsapp_opt_in: normalized.whatsapp_opt_in,
    reviews: planReviews(person, input.open_opportunity_ids)
  };
}

/**
 * The Pessoa reused by a decision, or null when there is none to read an open
 * card from. Walking the union lives here rather than in the worker: the caller
 * carries values between pure functions and decides nothing on the way.
 */
export function reusedPersonId(person: PersonDecision): string | null {
  return person.kind === "REUSE_PERSON" ? person.person_id : null;
}

function planReviews(
  person: PersonDecision,
  open_opportunity_ids: readonly string[]
): readonly IntakeReviewPlan[] {
  const reviews: IntakeReviewPlan[] = [];

  // Carried from ticket 08, where the rule was decided and proved: the conflict
  // variant cannot be written without looking at the candidates it carries, and
  // a review hangs on an Opportunity, which is why the row is born here.
  if (person.kind === "NEW_PERSON_WITH_IDENTITY_CONFLICT") {
    reviews.push({
      type: "IDENTITY_CONFLICT",
      candidate_person_ids: person.candidate_person_ids
    });
  }

  // Same Pessoa, another card still open. Financing data is not the trigger —
  // it is what the screen shows a human to tell one card from the other — so
  // the link is made even when no financing data arrived at all, which is the
  // common case and the one this link exists for.
  for (const related_opportunity_id of open_opportunity_ids) {
    reviews.push({ type: "POSSIBLE_DUPLICATE", related_opportunity_id });
  }

  return reviews;
}
