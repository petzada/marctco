import { createHash } from "node:crypto";

/**
 * The one way an identifier reaches a log line. Audit events carry hashes so a
 * refused access can be correlated without the log holding e-mail, name, IP,
 * token, payload or a bare identifier (ADR-0019).
 */
export function hashIdentifier(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
