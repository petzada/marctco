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
 * Built once per job, from the `workspace_id` the authenticated ingestion
 * handler wrote onto the job (apps/worker, ADR-0007). Carries no user and
 * no role: the worker never acts on anyone's behalf, and inventing a role
 * for it to fill the field is exactly what ADR-0015 forbids.
 */
export interface JobContext {
  readonly [jobContextBrand]: true;
  readonly kind: "job";
  readonly workspace_id: string;
  readonly integration_event_id: string;
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

export interface CreateJobContextInput {
  readonly workspace_id: string;
  readonly integration_event_id: string;
}

/** The only constructor of `JobContext`. */
export function createJobContext(input: CreateJobContextInput): JobContext {
  assertUuid(input.workspace_id, "workspace_id");
  assertUuid(input.integration_event_id, "integration_event_id");
  return {
    kind: "job",
    workspace_id: input.workspace_id,
    integration_event_id: input.integration_event_id
  } as JobContext;
}

export function isUserContext(context: AccessContext): context is UserContext {
  return context.kind === "user";
}

export function isJobContext(context: AccessContext): context is JobContext {
  return context.kind === "job";
}
