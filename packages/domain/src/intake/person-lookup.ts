import type { NormalizedLead } from "./normalize.js";

/**
 * Which keys to search for, and with what force.
 *
 * This is half of the identity rule, and it used to live outside the module
 * that documents it. "CPF válido é o mais forte quando presente, telefone só
 * identifica sem contradição, e-mail isolado é chave fraca" (ADR-0007
 * §Identidade) decides **what to look for**, not only how to arbitrate what
 * comes back — and a worker that looked up only phones would recognise fewer
 * returning clients than this ticket promises while every pure test stayed
 * green, because it is the test that chooses the candidates it passes in
 * (ADR-0017).
 *
 * The plan is **inert data**: no port, no callback, no promise enters
 * `packages/domain`. `findPersonCandidates(ctx, plan)` in `packages/db` is what
 * executes it, which is what keeps the guarantee the ADR-0011 relies on — a
 * domain that cannot query cannot query out of scope.
 */

export const PERSON_LOOKUP_KEY_KINDS = ["CPF", "PHONE", "EMAIL"] as const;
export type PersonLookupKeyKind = (typeof PERSON_LOOKUP_KEY_KINDS)[number];

/**
 * `STRONG` identifies on its own. `MODERATE` identifies only when nothing
 * contradicts it. `WEAK` never fuses records by itself.
 */
export const PERSON_LOOKUP_STRENGTHS = ["STRONG", "MODERATE", "WEAK"] as const;
export type PersonLookupStrength = (typeof PERSON_LOOKUP_STRENGTHS)[number];

/**
 * The identity rule of ADR-0007 §Identidade, written once. Both halves read
 * it: `planPersonLookup` stamps it onto the keys it asks for, and
 * `decidePersonIdentity` decides which matches may reuse a Pessoa on their own.
 * Stating it twice is how the two halves would drift into disagreeing about
 * what a phone is worth.
 */
export const PERSON_LOOKUP_STRENGTH_BY_KIND: Readonly<
  Record<PersonLookupKeyKind, PersonLookupStrength>
> = {
  // Verified check digits, and the only key that identifies on its own.
  CPF: "STRONG",
  // Identifies, but only while nothing contradicts it.
  PHONE: "MODERATE",
  // Households and `contato@empresa.com.br`. Never fuses records by itself.
  EMAIL: "WEAK"
};

export interface PersonLookupKey {
  readonly kind: PersonLookupKeyKind;
  /** Already normalized: digits-only CPF, E.164 phone, lowercase e-mail. */
  readonly value: string;
  readonly strength: PersonLookupStrength;
}

export interface PersonLookupPlan {
  readonly keys: readonly PersonLookupKey[];
}

export function planPersonLookup(normalized: NormalizedLead): PersonLookupPlan {
  const keys: PersonLookupKey[] = [];

  // Only a CPF that survived its check digits is here, which is why it can be
  // STRONG: an unverified CPF would be a strong key pointing at a stranger.
  if (normalized.cpf !== null) {
    keys.push(lookupKey("CPF", normalized.cpf));
  }
  // Every phone, not just the first. The client who was attended in March on
  // the landline and comes back in September from the mobile is the same
  // Pessoa, and only a lookup that carries both finds them.
  for (const phone of normalized.phones) {
    keys.push(lookupKey("PHONE", phone));
  }
  for (const email of normalized.emails) {
    keys.push(lookupKey("EMAIL", email));
  }

  return { keys };
}

function lookupKey(kind: PersonLookupKeyKind, value: string): PersonLookupKey {
  return { kind, value, strength: PERSON_LOOKUP_STRENGTH_BY_KIND[kind] };
}

/** The three contact keys, split by kind, in the order the plan lists them. */
export function lookupValuesOfKind(
  plan: PersonLookupPlan,
  kind: PersonLookupKeyKind
): readonly string[] {
  return plan.keys.filter((key) => key.kind === kind).map((key) => key.value);
}
