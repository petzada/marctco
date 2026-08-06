/** The single claim that marks a login as able to create its own workspace. */
export const PROVISIONING_CLAIM = "can_provision_workspace";

/** Optional companion claim: the workspace name recorded with the right. */
export const PROVISIONING_WORKSPACE_NAME_CLAIM = "workspace_name";

export interface ProvisioningEntitlement {
  readonly workspace_name: string | null;
}

function claimRecord(value: unknown, key: string): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const nested = (value as Record<string, unknown>)[key];
  if (typeof nested !== "object" || nested === null) {
    return null;
  }
  return nested as Record<string, unknown>;
}

/**
 * Reads the right to provision from the verified session claims. It is only
 * ever taken from `app_metadata`, which nothing but `service_role` can write:
 * `user_metadata` travels the same JWT but is rewritable by the browser with
 * `supabase.auth.updateUser()`, so honouring it would turn one line of client
 * JavaScript into ownership of a brand-new workspace.
 */
export function provisioningEntitlement(claims: unknown): ProvisioningEntitlement | null {
  const app_metadata = claimRecord(claims, "app_metadata");
  if (!app_metadata || app_metadata[PROVISIONING_CLAIM] !== true) {
    return null;
  }

  const recorded_name = app_metadata[PROVISIONING_WORKSPACE_NAME_CLAIM];
  const workspace_name = typeof recorded_name === "string" ? recorded_name.trim() : "";
  return { workspace_name: workspace_name === "" ? null : workspace_name };
}
