import type { NormalizedLead } from "./normalize.js";

/**
 * Which Pessoa a submission belongs to — the arbitration half of the identity
 * rule, whose lookup half is `planPersonLookup`.
 *
 * One sentence governs everything here: **doubt never holds the lead**
 * (ADR-0007). Under conflict the answer is a new Pessoa plus a marked pendency,
 * never a wait for a human. Duplicating a Pessoa is reversible by a merge;
 * losing the contact window of a paid-media lead is not.
 */

/** What a candidate row looks like once `findPersonCandidates` has run. */
export interface PersonCandidate {
  readonly person_id: string;
  /**
   * The CPF already on that record. Present so a contradiction is visible
   * without a second query: a phone that points at somebody whose CPF differs
   * from the one that just arrived is precisely the contradiction that stops
   * a phone from identifying anybody.
   */
  readonly cpf: string | null;
  readonly matched: {
    readonly cpf: boolean;
    readonly phone: boolean;
    readonly email: boolean;
  };
}

/** Everything the submission knows about the person, ready to be written. */
export interface PersonContacts {
  readonly name: string | null;
  readonly phones: readonly string[];
  readonly emails: readonly string[];
  readonly cpf: string | null;
}

/**
 * A discriminated union, so the write side cannot handle three cases and
 * forget the fourth. In particular, the conflict variant cannot be written
 * without looking at the candidates it carries — which is what stops the
 * `IntakeReview(IDENTITY_CONFLICT)` from being the thing somebody forgets
 * (ADR-0017).
 */
export type PersonDecision =
  | {
      /**
       * No phone and no e-mail. The only submission that produces no Pessoa
       * and therefore no Oportunidade — and it is not doubt, it is the
       * impossibility of making contact (ADR-0007 §Identidade).
       */
      readonly kind: "NO_CONTACT";
    }
  | {
      /** One existing Pessoa, identified without contradiction. */
      readonly kind: "REUSE_PERSON";
      readonly person_id: string;
      /**
       * Still the full set from this submission, not a delta: no earlier
       * contact is ever overwritten, so the write adds what is new and leaves
       * what was there (ADR-0007 §Identidade).
       */
      readonly contacts: PersonContacts;
    }
  | {
      /** Nothing matched. A first-time person, or one whose keys are all new. */
      readonly kind: "NEW_PERSON";
      readonly contacts: PersonContacts;
    }
  | {
      /**
       * The keys point at different Pessoas, or the only match was too weak to
       * fuse on. A new Pessoa is created with this submission's contacts, no
       * link to any existing record is made, and the candidates are recorded
       * for a human to resolve by merging later.
       */
      readonly kind: "NEW_PERSON_WITH_IDENTITY_CONFLICT";
      readonly contacts: PersonContacts;
      readonly candidate_person_ids: readonly string[];
    };

export interface DecidePersonIdentityInput {
  readonly normalized: NormalizedLead;
  /** What `findPersonCandidates(ctx, planPersonLookup(normalized))` returned. */
  readonly candidates: readonly PersonCandidate[];
}

export function decidePersonIdentity(input: DecidePersonIdentityInput): PersonDecision {
  const { normalized } = input;
  const contacts: PersonContacts = {
    name: normalized.name,
    phones: normalized.phones,
    emails: normalized.emails,
    cpf: normalized.cpf
  };

  // A CPF alone does not rescue a submission from quarantine. It identifies,
  // but nobody can be called on it: releasing one would create a card with an
  // SLA clock and no way to attend it (ADR-0007 §Quarentena).
  if (contacts.phones.length === 0 && contacts.emails.length === 0) {
    return { kind: "NO_CONTACT" };
  }

  const candidates = input.candidates.filter(
    (candidate) => candidate.matched.cpf || candidate.matched.phone || candidate.matched.email
  );
  const candidate_person_ids = candidates.map((candidate) => candidate.person_id);

  if (candidates.length === 0) {
    return { kind: "NEW_PERSON", contacts };
  }

  // More than one Pessoa answers to the keys of a single submission. No key
  // wins by fixed priority — not even CPF — because choosing one would
  // reintroduce "the phone decides" through the back door, and the wrong link
  // is the one that never undoes itself: an attendant reads somebody else's
  // history and greets the client by the wrong name.
  if (candidates.length > 1) {
    return { kind: "NEW_PERSON_WITH_IDENTITY_CONFLICT", contacts, candidate_person_ids };
  }

  const [candidate] = candidates as [PersonCandidate];

  // The submission carries a CPF and the single candidate carries a different
  // one. That is a contradiction, and a phone stops identifying the moment one
  // exists.
  if (contacts.cpf !== null && candidate.cpf !== null && candidate.cpf !== contacts.cpf) {
    return { kind: "NEW_PERSON_WITH_IDENTITY_CONFLICT", contacts, candidate_person_ids };
  }

  if (candidate.matched.cpf || candidate.matched.phone) {
    return { kind: "REUSE_PERSON", person_id: candidate.person_id, contacts };
  }

  // Matched on the e-mail and nothing else. An isolated e-mail never fuses
  // records automatically — shared household addresses and
  // `contato@empresa.com.br` are common enough that it would merge strangers —
  // but the near miss is worth a human's eye, so it is a conflict rather than
  // a silent second Pessoa.
  return { kind: "NEW_PERSON_WITH_IDENTITY_CONFLICT", contacts, candidate_person_ids };
}
