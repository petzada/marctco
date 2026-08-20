import { WorkspaceRole as PrismaWorkspaceRole } from "@prisma/client";
import type { ResolvedFeatureFlags } from "@marctco/domain/feature-flags";

/**
 * The four access profiles the workspace knows about, and none more
 * (ADR-0015). Re-exported from the Prisma-generated enum so this module
 * never drifts from prisma/schema.prisma — a new role always starts as a
 * migration, never as a string typed here by hand.
 */
export type WorkspaceRole = PrismaWorkspaceRole;
export const WorkspaceRole = PrismaWorkspaceRole;

const KNOWN_ROLES: ReadonlySet<string> = new Set(Object.values(PrismaWorkspaceRole));

export const SCHEDULED_SWEEP_NAMES = ["PAYLOAD_EXPIRY", "OPPORTUNITY_CLOCK"] as const;
export type ScheduledSweepName = (typeof SCHEDULED_SWEEP_NAMES)[number];
const KNOWN_SWEEPS: ReadonlySet<string> = new Set(SCHEDULED_SWEEP_NAMES);

export type JobOrigin =
  | { readonly type: "integration_event"; readonly integration_event_id: string }
  | { readonly type: "scheduled_sweep"; readonly sweep: ScheduledSweepName }
  | { readonly type: "channel_outbound"; readonly attempt_id: string }
  | { readonly type: "channel_inbound"; readonly integration_connection_id: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(value: string, label: string): void {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new Error(`${label} must be a UUID, received: ${JSON.stringify(value)}`);
  }
}

/**
 * Branding a private, unexported symbol on each variant is what makes
 * "AccessContext is a discriminated union with two constructors and no
 * literal" a compiler fact instead of a naming convention (ADR-0016). Code
 * outside this module has no way to spell the brand, so a `{ kind: "user",
 * ... }` object literal structurally fails to satisfy `UserContext` — the
 * only way in is the workspace resolver / `createJobContext`.
 */
declare const userContextBrand: unique symbol;
declare const jobContextBrand: unique symbol;

/**
 * Built once per request, from the `slug` in the URL validated against
 * `WorkspaceMember` (apps/web, ADR-0012). Carries a role because a person
 * always acts as somebody with a profile.
 */
export interface UserContext {
  readonly [userContextBrand]: true;
  readonly kind: "user";
  readonly workspace_id: string;
  readonly user_id: string;
  readonly role: WorkspaceRole;
  /** Reserved for the server-resolved Phase 4 capability snapshot. */
  readonly feature_flags?: ResolvedFeatureFlags;
}

/**
 * Built once per job. Carries no user and no role: the worker never acts
 * on anyone's behalf, and inventing a role for it to fill the field is
 * exactly what ADR-0015 forbids. Origin is a discriminated union so a
 * scheduled sweep does not have to fabricate an integration-event anchor
 * (ADR-0016, emendado 2026-08-19).
 */
export interface JobContext {
  readonly [jobContextBrand]: true;
  readonly kind: "job";
  readonly workspace_id: string;
  readonly origin: JobOrigin;
  /** The worker shares this slot; resolved values are never process-global. */
  readonly feature_flags?: ResolvedFeatureFlags;
}

/**
 * The union every operation in packages/db receives. Two variants, not one
 * with an optional `role` — an optional role would let the fail-closed
 * check in the one process that touches every tenant quietly no-op
 * (ADR-0016).
 */
export type AccessContext = UserContext | JobContext;

interface CreateUserContextInput {
  readonly workspace_id: string;
  readonly user_id: string;
  readonly role: string;
}

/**
 * The only constructor of `UserContext`. Fails closed: an unknown or
 * missing role throws here, before any query runs, rather than silently
 * falling through to "sees everything" (ADR-0016 rule 5).
 */
/**
 * Internal constructor used exclusively after `WorkspaceMember` has been
 * resolved by `resolveUserContextForSlug`. It is deliberately absent from the
 * package API: callers cannot turn arbitrary URL input into a UserContext.
 */
export function createUserContextFromResolvedMembership(input: CreateUserContextInput): UserContext {
  assertUuid(input.workspace_id, "workspace_id");
  assertUuid(input.user_id, "user_id");
  if (!KNOWN_ROLES.has(input.role)) {
    throw new Error(
      `Unknown workspace role, refusing to build a UserContext: ${JSON.stringify(input.role)}`
    );
  }
  return {
    kind: "user",
    workspace_id: input.workspace_id,
    user_id: input.user_id,
    role: input.role as WorkspaceRole
  } as UserContext;
}

export type CreateJobContextInput =
  | { readonly workspace_id: string; readonly integration_event_id: string }
  | { readonly workspace_id: string; readonly origin: JobOrigin };

/** The only constructor of `JobContext`. */
export function createJobContext(input: CreateJobContextInput): JobContext {
  assertUuid(input.workspace_id, "workspace_id");
  const origin = "origin" in input ? input.origin : {
    type: "integration_event" as const,
    integration_event_id: input.integration_event_id
  };
  if (origin.type === "integration_event") {
    assertUuid(origin.integration_event_id, "integration_event_id");
  } else if (origin.type === "scheduled_sweep") {
    if (!KNOWN_SWEEPS.has(origin.sweep)) {
      throw new Error(
        `Unknown scheduled sweep, refusing to build a JobContext: ${JSON.stringify(origin.sweep)}`
      );
    }
  } else if (origin.type === "channel_outbound") {
    assertUuid(origin.attempt_id, "attempt_id");
  } else if (origin.type === "channel_inbound") {
    assertUuid(origin.integration_connection_id, "integration_connection_id");
  } else {
    const unknown: never = origin;
    throw new Error(`Unknown job origin, refusing to build a JobContext: ${JSON.stringify(unknown)}`);
  }
  return {
    kind: "job",
    workspace_id: input.workspace_id,
    origin
  } as JobContext;
}

export function withResolvedFeatureFlags<Context extends AccessContext>(
  context: Context,
  feature_flags: ResolvedFeatureFlags
): Context {
  return { ...context, feature_flags };
}

export function isUserContext(context: AccessContext): context is UserContext {
  return context.kind === "user";
}

export function isJobContext(context: AccessContext): context is JobContext {
  return context.kind === "job";
}

/** The event id a processing job carries. Scheduled sweeps and channel jobs have none. */
export function jobIntegrationEventId(context: JobContext): string {
  if (context.origin.type !== "integration_event") {
    throw new Error("JobContext origin is not an integration event");
  }
  return context.origin.integration_event_id;
}

/** The outbound attempt a channel job carries. Other origins have none. */
export function jobChannelAttemptId(context: JobContext): string {
  if (context.origin.type !== "channel_outbound") {
    throw new Error("JobContext origin is not a channel outbound attempt");
  }
  return context.origin.attempt_id;
}

/** The WhatsMiau connection an inbound webhook job carries. Other origins have none. */
export function jobChannelInboundConnectionId(context: JobContext): string {
  if (context.origin.type !== "channel_inbound") {
    throw new Error("JobContext origin is not a channel inbound connection");
  }
  return context.origin.integration_connection_id;
}
