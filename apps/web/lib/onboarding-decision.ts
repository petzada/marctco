import type { UserWorkspace } from "@marctco/db";
import type { ProvisioningEntitlement } from "./provisioning-entitlement";

export type OnboardingDecision =
  | { readonly kind: "provision"; readonly workspace_name: string }
  | { readonly kind: "member" }
  | { readonly kind: "denied" };

/**
 * What `/onboarding` may do for the authenticated user. The right comes first:
 * a marked Direção already associated with one tenant still provisions the next
 * (ADR-0022). A collaborator never holds that right, so an existing membership
 * takes them in as a member. No right and no association is a closed door —
 * not a waiting room, and not a silent bounce to login (ADR-0021).
 */
export function onboardingDecision(
  entitlement: ProvisioningEntitlement | null,
  workspaces: readonly UserWorkspace[]
): OnboardingDecision {
  if (entitlement) {
    return { kind: "provision", workspace_name: entitlement.workspace_name };
  }
  if (workspaces.length > 0) {
    return { kind: "member" };
  }
  return { kind: "denied" };
}
