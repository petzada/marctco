/**
 * Display-side twin of `packages/db`'s `PAYLOAD_RETENTION_DAYS` /
 * `integrationEventPayloadExpiresAt` (ADR-0014) — the server operation that
 * actually refuses a stale reprocess is the one source of truth for the
 * rule; this copy exists only so the screen can say *when* the content left
 * without importing `@marctco/db` (and its Prisma client construction) into
 * a component tree that never opens a database connection.
 */
export const PAYLOAD_RETENTION_DAYS = 90;

export function integrationEventPayloadExpiresAt(received_at: Date): Date {
  return new Date(received_at.getTime() + PAYLOAD_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * `raw` has exactly one cause when it reads null: the retention job erased it
 * 90 days after `received_at`. No date math is needed to know this — the
 * column itself is the answer — but the date math is what lets the screen
 * say *when* instead of "indisponível".
 */
export function isPayloadExpired(raw: unknown): boolean {
  return raw === null;
}

const PT_BR_DATE = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric"
});

/** "expira em 08/11/2026" / "expirou em 08/11/2026" — the non-technical retention line. */
export function formatPayloadRetentionNotice(received_at: Date, now: Date = new Date()): string {
  const expires_at = integrationEventPayloadExpiresAt(received_at);
  const formatted = PT_BR_DATE.format(expires_at);
  return expires_at.getTime() <= now.getTime()
    ? `O conteúdo deste evento expirou em ${formatted} — só o registro de que ele chegou continua guardado.`
    : `O conteúdo deste evento fica guardado até ${formatted}. Depois disso, só o registro de que ele chegou continua guardado.`;
}
