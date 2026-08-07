/**
 * Money arrives as a raw string and only becomes a decimal here (ADR-0008).
 * The connector must not do it: "R$ 1.234,56" and "1234.56" are the same
 * amount written by two different people into the same Pluga field, and the
 * rule that tells them apart is domain knowledge, not payload shape.
 *
 * The raw value is preserved alongside the normalized one, so a wrong reading
 * here is always recoverable by a human looking at what actually arrived
 * (ADR-0005, `installment_amount`).
 */

const DIGIT_GROUP = /^\d{1,3}(\.\d{3})+$/;

/**
 * Returns a canonical decimal string — never a `number`. Binary floating point
 * cannot hold 1234.56 exactly, and an instalment that drifts by a cent is a
 * number a client will read out loud on the phone.
 */
export function normalizeDecimalAmount(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }

  const negative = /^-/.test(trimmed) || /\(\s*[\d.,]+\s*\)/.test(trimmed);
  const body = trimmed.replace(/[^\d.,]/g, "");
  if (body === "" || !/\d/.test(body)) {
    return null;
  }

  const separated = splitOnDecimalSeparator(body);
  if (separated === null) {
    return null;
  }
  const { whole, fraction } = separated;
  const digits = `${whole}${fraction}`;
  if (digits === "" || /^0+$/.test(digits)) {
    return fraction === "" ? "0" : `0.${fraction}`;
  }

  const normalized_whole = whole.replace(/^0+(?=\d)/, "");
  const amount = fraction === "" ? normalized_whole : `${normalized_whole}.${fraction}`;
  return negative ? `-${amount}` : amount;
}

/**
 * Which of `.` and `,` is the decimal point.
 *
 * When both appear, the rightmost one is it — that is true for "1.234,56" and
 * for "1,234.56" alike, so neither locale needs to be declared. When only one
 * appears, the ambiguous case is a lone `.` followed by exactly three digits:
 * "1.500" is fifteen hundred to the person who typed it in Brazil, and one and
 * a half to a naive `parseFloat`. Reading it as a thousands separator is the
 * reading that matches who fills these forms.
 */
function splitOnDecimalSeparator(body: string): { whole: string; fraction: string } | null {
  const last_dot = body.lastIndexOf(".");
  const last_comma = body.lastIndexOf(",");
  const separator_index = Math.max(last_dot, last_comma);

  if (separator_index === -1) {
    return { whole: body, fraction: "" };
  }

  const head = body.slice(0, separator_index).replace(/[.,]/g, "");
  const tail = body.slice(separator_index + 1);
  if (!/^\d*$/.test(head) || !/^\d*$/.test(tail)) {
    return null;
  }

  const only_one_separator = last_dot === -1 || last_comma === -1;
  if (only_one_separator && separator_index === last_dot && DIGIT_GROUP.test(body)) {
    return { whole: body.replace(/\./g, ""), fraction: "" };
  }

  return { whole: head, fraction: tail };
}
