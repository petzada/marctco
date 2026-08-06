/**
 * Where a request appears to come from, for rate limiting only. It is never
 * logged: the audit trail carries hashes, never an address (ADR-0019).
 */
export function requestIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}
