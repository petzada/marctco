/**
 * Lowercase, always (ADR-0007 §Normalização). The local part is technically
 * case-sensitive per RFC 5321, and no mail provider a lead of this operation
 * uses honours that. Folding case is what lets "Joao@Gmail.com" from the Meta
 * form recognise the "joao@gmail.com" already in the workspace; keeping the
 * case would produce two Pessoas that no human would ever guess are the same.
 */

/**
 * Deliberately shallow: this is not an attempt to decide whether the address
 * receives mail, which no regex can answer. It rejects the values that are
 * plainly not an address — "não tenho", a phone number, a bare name — because
 * an e-mail is a lookup key, and a key that is not one weakens the resolution
 * for everybody it collides with.
 */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export function normalizeEmail(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim().toLowerCase();
  if (!EMAIL_SHAPE.test(trimmed)) {
    return null;
  }
  return trimmed;
}
