import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const updateUserById = vi.fn();
const createClient = vi.fn(() => ({ auth: { admin: { updateUserById } } }));

vi.mock("@supabase/supabase-js", () => ({ createClient }));

const { consumeProvisioningEntitlement, createSupabaseAdminClient } = await import("./admin");

describe("consumeProvisioningEntitlement", () => {
  beforeEach(() => {
    updateUserById.mockReset().mockResolvedValue({ error: null });
    createClient.mockClear();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  });

  afterEach(() => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it("spends the right in app_metadata, the only half service_role can write", async () => {
    const user_id = randomUUID();
    await consumeProvisioningEntitlement(user_id);

    expect(createClient).toHaveBeenCalledWith(
      "https://project.supabase.co",
      "service-role-key",
      expect.anything()
    );
    expect(updateUserById).toHaveBeenCalledWith(user_id, {
      app_metadata: { can_provision_workspace: false, workspace_name: null }
    });
    const [, payload] = updateUserById.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload).not.toHaveProperty("user_metadata");
  });

  it("reports a refused update instead of pretending the right was spent", async () => {
    updateUserById.mockResolvedValue({ error: { message: "user not found" } });
    await expect(consumeProvisioningEntitlement(randomUUID())).rejects.toThrow(/user not found/i);
  });

  it("refuses to build the admin client without the server-only service role key", () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => createSupabaseAdminClient()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });
});
