import { z } from "zod";
import {
  DEFAULT_FIRST_CONTACT_TEMPLATE_BODY,
  DEFAULT_FIRST_CONTACT_TRIGGER,
  FIRST_CONTACT_TRIGGERS,
  parseFirstContactTemplate,
  type FirstContactTrigger
} from "./first-contact.js";

/**
 * Domain defaults for the two operational clocks. Absence of a
 * `WorkspaceSettings` row means these values, never "SLA off" (ADR-0004:
 * configuration missing is the default behaviour; flags fail closed).
 *
 * 120 minutes is the spec's own threshold: a revisional lead that waits two
 * hours has already spoken to a competitor. 7 days is one operating week;
 * the spec's nine-day card is already stagnant against this default.
 */
export const DEFAULT_FIRST_CONTACT_SLA_MINUTES = 120;
export const DEFAULT_STAGNATION_DAYS = 7;

/** Inclusive ceilings for the shared Zod faixa. The CHECK is positive-only. */
export const MAX_FIRST_CONTACT_SLA_MINUTES = 10_080;
export const MAX_STAGNATION_DAYS = 365;

const SETTINGS_WRITERS = new Set(["MANAGER", "OWNER"]);

export interface StoredWorkspaceSettings {
  readonly first_contact_sla_minutes: number | null;
  readonly stagnation_days: number | null;
  readonly first_contact_trigger?: FirstContactTrigger | null;
  readonly first_contact_template_body?: string | null;
}

export interface ResolvedWorkspaceSettings {
  readonly first_contact_sla_minutes: number;
  readonly stagnation_days: number;
  readonly first_contact_trigger: FirstContactTrigger;
  readonly first_contact_template_body: string;
}

const positiveMinutes = z
  .number()
  .int()
  .min(1)
  .max(MAX_FIRST_CONTACT_SLA_MINUTES);

const positiveDays = z.number().int().min(1).max(MAX_STAGNATION_DAYS);

/**
 * Shared between the app and the worker. Invalid values are refused here,
 * not discovered when a later ticket computes the clock.
 */
export const workspaceSettingsWriteSchema = z
  .object({
    first_contact_sla_minutes: positiveMinutes.nullable().optional(),
    stagnation_days: positiveDays.nullable().optional(),
    first_contact_trigger: z.enum(FIRST_CONTACT_TRIGGERS).nullable().optional(),
    first_contact_template_body: z.string().nullable().optional()
  })
  .refine(
    (value) =>
      value.first_contact_sla_minutes !== undefined ||
      value.stagnation_days !== undefined ||
      value.first_contact_trigger !== undefined ||
      value.first_contact_template_body !== undefined
  );

export type WorkspaceSettingsWrite = z.infer<typeof workspaceSettingsWriteSchema>;

export type WorkspaceSettingsWriteParse =
  | { readonly ok: true; readonly value: WorkspaceSettingsWrite }
  | { readonly ok: false; readonly code: "INVALID" };

export function resolveWorkspaceSettings(
  stored: StoredWorkspaceSettings | null
): ResolvedWorkspaceSettings {
  return {
    first_contact_sla_minutes:
      stored?.first_contact_sla_minutes ?? DEFAULT_FIRST_CONTACT_SLA_MINUTES,
    stagnation_days: stored?.stagnation_days ?? DEFAULT_STAGNATION_DAYS,
    first_contact_trigger: stored?.first_contact_trigger ?? DEFAULT_FIRST_CONTACT_TRIGGER,
    first_contact_template_body:
      stored?.first_contact_template_body ?? DEFAULT_FIRST_CONTACT_TEMPLATE_BODY
  };
}

export function parseWorkspaceSettingsWrite(input: unknown): WorkspaceSettingsWriteParse {
  const parsed = workspaceSettingsWriteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "INVALID" };
  }
  if (!firstContactWriteIsValid(parsed.data)) {
    return { ok: false, code: "INVALID" };
  }
  return { ok: true, value: parsed.data };
}

function firstContactWriteIsValid(value: WorkspaceSettingsWrite): boolean {
  if (value.first_contact_trigger === undefined || value.first_contact_template_body === undefined) {
    return true;
  }
  const trigger = value.first_contact_trigger ?? DEFAULT_FIRST_CONTACT_TRIGGER;
  const template_body = value.first_contact_template_body ?? DEFAULT_FIRST_CONTACT_TEMPLATE_BODY;
  return parseFirstContactTemplate({ trigger, template_body }).ok;
}

export function canWriteWorkspaceSettings(role: string): boolean {
  return SETTINGS_WRITERS.has(role);
}
