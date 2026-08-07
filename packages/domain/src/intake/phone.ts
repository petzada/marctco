// The `max` metadata, not the default `min`: only the full dataset carries the
// number *type*, and without it `getType()` answers `undefined` for every
// number, silently turning the unreachable-number check below into a no-op.
// This runs in the worker and in a Node route handler, where the extra
// metadata costs nothing that matters.
import { parsePhoneNumberFromString, type NumberType } from "libphonenumber-js/max";

/**
 * The default country is knowledge of the domain, not of the connector
 * (ADR-0008): a form filled in São Paulo sends "11 98765-4321" and nobody
 * anywhere in the payload says "Brazil". If the adapter owned this, the rule
 * would be copied into every future adapter until one of them diverged.
 */
export const DEFAULT_PHONE_COUNTRY = "BR" as const;

/**
 * A Brazilian subscriber number is the two-digit area code plus eight digits
 * (landline) or nine (mobile). Without this check a number typed without its
 * area code — the single most common way a lead arrives broken — parses as a
 * perfectly valid landline somewhere else in the country, and the CRM would
 * store a phone that reaches a stranger instead of marking the lead
 * unreachable.
 */
const BRAZILIAN_NATIONAL_LENGTHS: ReadonlySet<number> = new Set([10, 11]);

/**
 * Numbers nobody can be reached on personally. They are not invalid — they are
 * simply not a contact, and letting one through would silence the `missing_phone`
 * marker for a lead the operation cannot call (ADR-0007 §Quarentena).
 */
const UNREACHABLE_TYPES: ReadonlySet<NumberType> = new Set<NumberType>([
  "TOLL_FREE",
  "PREMIUM_RATE",
  "SHARED_COST",
  "VOICEMAIL"
]);

/**
 * E.164 or nothing. A phone the CRM cannot express in E.164 is a phone it
 * cannot dial, and storing the raw string "for later" is how two records of the
 * same person stop matching each other.
 */
export function normalizePhone(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }

  const parsed = parsePhoneNumberFromString(trimmed, DEFAULT_PHONE_COUNTRY);
  if (!parsed || !parsed.isValid()) {
    return null;
  }
  if (
    parsed.country === DEFAULT_PHONE_COUNTRY &&
    !BRAZILIAN_NATIONAL_LENGTHS.has(parsed.nationalNumber.length)
  ) {
    return null;
  }
  const type = parsed.getType();
  if (type !== undefined && UNREACHABLE_TYPES.has(type)) {
    return null;
  }
  return parsed.number;
}
