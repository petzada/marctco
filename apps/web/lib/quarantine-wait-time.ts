/**
 * How long a lead has sat in quarantine — release minus receipt, the metric
 * ADR-0007 §Quarentena and ticket 10 name as what should feed the
 * quarantine's own alert. Ticket 14 does not build that alert (no dashboard
 * exists yet); this is the smallest visible proof that both instants survive
 * and the difference is computable: the manager sees, per lead, how long it
 * has been waiting.
 */
export function daysInQuarantine(received_at: Date, now: Date = new Date()): number {
  const elapsed_ms = now.getTime() - received_at.getTime();
  return Math.max(0, Math.floor(elapsed_ms / (24 * 60 * 60 * 1000)));
}

export function formatQuarantineWait(received_at: Date, now: Date = new Date()): string {
  const days = daysInQuarantine(received_at, now);
  if (days === 0) {
    return "recebido hoje";
  }
  return days === 1 ? "esperando há 1 dia" : `esperando há ${days} dias`;
}
