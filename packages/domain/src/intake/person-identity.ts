import type { NormalizedLead } from "./normalize.js";
import {
  PERSON_LOOKUP_STRENGTH_BY_KIND,
  type PersonLookupKeyKind
} from "./person-lookup.js";

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
       * The keys point at **different** Pessoas. A new Pessoa is created with
       * this submission's contacts, no link to any existing record is made,
       * and the candidates are recorded for a human to resolve by merging
       * later. A single Pessoa matched only weakly is not this case — it is
       * `NEW_PERSON`.
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
  const conflict = (candidates: readonly PersonCandidate[]): PersonDecision => ({
    kind: "NEW_PERSON_WITH_IDENTITY_CONFLICT",
    contacts,
    candidate_person_ids: candidates.map((candidate) => candidate.person_id)
  });

  // A CPF alone does not rescue a submission from quarantine. It identifies,
  // but nobody can be called on it: releasing one would create a card with an
  // SLA clock and no way to attend it (ADR-0007 §Quarentena).
  if (contacts.phones.length === 0 && contacts.emails.length === 0) {
    return { kind: "NO_CONTACT" };
  }

  const candidates = input.candidates.filter(
    (candidate) => candidate.matched.cpf || candidate.matched.phone || candidate.matched.email
  );

  if (candidates.length === 0) {
    return { kind: "NEW_PERSON", contacts };
  }

  // More than one Pessoa answers to the keys of a single submission — the
  // literal condition ADR-0007 attaches IDENTITY_CONFLICT to. No key wins by
  // fixed priority, not even CPF, because choosing one would reintroduce "the
  // phone decides" through the back door, and the wrong link is the one that
  // never undoes itself: an attendant reads somebody else's history and greets
  // the client by the wrong name.
  if (candidates.length > 1) {
    return conflict(candidates);
  }

  const [candidate] = candidates as [PersonCandidate];

  // The submission carries a CPF and the single candidate carries a different
  // one. Two keys, two Pessoas — one of them being hypothetical does not make
  // it less of a contradiction, and a phone stops identifying the moment one
  // exists.
  if (contacts.cpf !== null && candidate.cpf !== null && candidate.cpf !== contacts.cpf) {
    return conflict(candidates);
  }

  if (identifiesOnItsOwn(candidate)) {
    return { kind: "REUSE_PERSON", person_id: candidate.person_id, contacts };
  }

  // Matched on nothing but a WEAK key. It does not fuse — shared
  // household addresses and `contato@empresa.com.br` are common enough that it
  // would merge strangers — and it is **not** a conflict either: the keys of
  // this submission point at one Pessoa, not at different ones, which is the
  // condition ADR-0007 gates IDENTITY_CONFLICT on. Marking it would put a
  // review on every address a family shares, and an alert nobody can resolve
  // kills the signal of the ones beside it.
  return { kind: "NEW_PERSON", contacts };
}

/**
 * Whether what this candidate matched on is enough to reuse the record. The
 * strengths come from `PERSON_LOOKUP_STRENGTH_BY_KIND`, the same table
 * `planPersonLookup` stamps onto the keys — so "a phone identifies, an e-mail
 * does not" is one fact in one place instead of a rule the lookup half and the
 * arbitration half each remember separately.
 */
function identifiesOnItsOwn(candidate: PersonCandidate): boolean {
  const matched: readonly PersonLookupKeyKind[] = [
    ...(candidate.matched.cpf ? (["CPF"] as const) : []),
    ...(candidate.matched.phone ? (["PHONE"] as const) : []),
    ...(candidate.matched.email ? (["EMAIL"] as const) : [])
  ];
  return matched.some((kind) => PERSON_LOOKUP_STRENGTH_BY_KIND[kind] !== "WEAK");
}
