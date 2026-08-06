import type { UserWorkspace } from "@marctco/db";
import type { ProvisioningEntitlement } from "./provisioning-entitlement";

export type OnboardingDecision =
  | { readonly kind: "provision"; readonly workspace_name: string | null }
  | { readonly kind: "member" }
  | { readonly kind: "wait" };

/**
 * What `/onboarding` may do for the authenticated user. Association is checked
 * before the right: a collaborator is born with the membership (ticket 04) and
 * therefore never travels this path, and an ex-collaborator whose membership
 * was removed has no `app_metadata` right left — so neither becomes the owner
 * of a brand-new workspace by logging in.
 */
export function onboardingDecision(
  entitlement: ProvisioningEntitlement | null,
  workspaces: readonly UserWorkspace[]
): OnboardingDecision {
  if (workspaces.length > 0) {
    return { kind: "member" };
  }
  if (!entitlement) {
    return { kind: "wait" };
  }
  return { kind: "provision", workspace_name: entitlement.workspace_name };
}
