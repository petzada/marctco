/**
 * URL clock filters for the Leads table. SLA-breached and stagnant are not
 * `TableMarker` values — they are computed from workspace clocks — but the
 * Dashboard tile must land on a list that answers the same question.
 */

export const LEAD_CLOCK_FILTERS = ["sla-breached", "stagnant"] as const;
export type LeadClockFilter = (typeof LEAD_CLOCK_FILTERS)[number];

export function parseLeadClockFilter(
  value: string | null | undefined
): LeadClockFilter | undefined {
  if (value && (LEAD_CLOCK_FILTERS as readonly string[]).includes(value)) {
    return value as LeadClockFilter;
  }
  return undefined;
}
