/**
 * CPF is the strongest identity key the CRM has, and it is the only one whose
 * validity can be checked without asking anybody (ADR-0007 §Identidade). It is
 * stored digits-only with the two check digits verified.
 *
 * A CPF that fails the check is not a weaker key — it is not a key at all.
 * Keeping it would be worse than dropping it: a typo of one digit lands on
 * somebody else's perfectly real CPF, and the strongest key in the system would
 * then merge two strangers with no contradiction to notice.
 */

const CPF_LENGTH = 11;

export function normalizeCpf(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const digits = value.replace(/\D/g, "");
  if (digits.length !== CPF_LENGTH) {
    return null;
  }
  // A repeated digit passes the check-digit arithmetic and is never a real
  // CPF: "111.111.111-11" is the placeholder people type to get past a
  // required field, and it would happily merge every one of them.
  if (/^(\d)\1{10}$/.test(digits)) {
    return null;
  }
  if (checkDigit(digits, 9) !== digits[9] || checkDigit(digits, 10) !== digits[10]) {
    return null;
  }
  return digits;
}

/**
 * The Receita Federal check digit: a weighted sum over the digits to the left,
 * modulo 11, where a remainder under 2 means zero.
 */
function checkDigit(digits: string, position: number): string {
  let sum = 0;
  for (let index = 0; index < position; index += 1) {
    sum += Number(digits[index]) * (position + 1 - index);
  }
  const remainder = (sum * 10) % 11;
  return String(remainder === 10 ? 0 : remainder);
}
