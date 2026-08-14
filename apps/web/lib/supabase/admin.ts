import { createClient } from "@supabase/supabase-js";
import {
  PROVISIONING_CLAIM,
  PROVISIONING_WORKSPACE_NAME_CLAIM
} from "../provisioning-entitlement";

function adminEnvironment(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Consuming the provisioning right requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
    );
  }
  return { url, key };
}

/**
 * `app_metadata` is writable by `service_role` alone — that is the whole reason
 * the provisioning right lives there. This client never touches a request
 * cookie and must never reach a browser bundle.
 */
export function createSupabaseAdminClient(): ReturnType<typeof createClient> {
  const { url, key } = adminEnvironment();
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

/**
 * Spends the right the technical team granted, and only then. The live Auth
 * user is the source of truth — a stale JWT can still look marked after the
 * first click. Returns false when `can_provision_workspace` is not the boolean
 * true, so the caller must not provision. A second workspace then requires a
 * new marking in the Supabase panel.
 */
export async function consumeProvisioningEntitlement(user_id: string): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { data, error: read_error } = await admin.auth.admin.getUserById(user_id);
  if (read_error) {
    throw new Error(`Could not consume the provisioning right: ${read_error.message}`);
  }
  if (data.user?.app_metadata?.[PROVISIONING_CLAIM] !== true) {
    return false;
  }

  const { error } = await admin.auth.admin.updateUserById(user_id, {
    app_metadata: {
      [PROVISIONING_CLAIM]: false,
      [PROVISIONING_WORKSPACE_NAME_CLAIM]: null
    }
  });
  if (error) {
    throw new Error(`Could not consume the provisioning right: ${error.message}`);
  }
  return true;
}
