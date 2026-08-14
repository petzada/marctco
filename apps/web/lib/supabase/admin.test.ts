import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUserById = vi.fn();
const updateUserById = vi.fn();
const createClient = vi.fn(() => ({ auth: { admin: { getUserById, updateUserById } } }));

vi.mock("@supabase/supabase-js", () => ({ createClient }));

const { consumeProvisioningEntitlement, createSupabaseAdminClient } = await import("./admin");

function entitledUser(user_id: string) {
  return {
    data: {
      user: {
        id: user_id,
        app_metadata: { can_provision_workspace: true, workspace_name: "ACR" }
      }
    },
    error: null
  };
}

describe("consumeProvisioningEntitlement", () => {
  beforeEach(() => {
    getUserById.mockReset();
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
    getUserById.mockResolvedValue(entitledUser(user_id));

    await expect(consumeProvisioningEntitlement(user_id)).resolves.toBe(true);

    expect(createClient).toHaveBeenCalledWith(
      "https://project.supabase.co",
      "service-role-key",
      expect.anything()
    );
    expect(getUserById).toHaveBeenCalledWith(user_id);
    expect(updateUserById).toHaveBeenCalledWith(user_id, {
      app_metadata: { can_provision_workspace: false, workspace_name: null }
    });
    const [, payload] = updateUserById.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload).not.toHaveProperty("user_metadata");
  });

  it("does not spend or pretend to spend when the right is already false", async () => {
    const user_id = randomUUID();
    getUserById.mockResolvedValue({
      data: { user: { id: user_id, app_metadata: { can_provision_workspace: false } } },
      error: null
    });

    await expect(consumeProvisioningEntitlement(user_id)).resolves.toBe(false);
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("does not spend a truthy string as though it were the boolean right", async () => {
    const user_id = randomUUID();
    getUserById.mockResolvedValue({
      data: { user: { id: user_id, app_metadata: { can_provision_workspace: "true" } } },
      error: null
    });

    await expect(consumeProvisioningEntitlement(user_id)).resolves.toBe(false);
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("reports a refused update instead of pretending the right was spent", async () => {
    const user_id = randomUUID();
    getUserById.mockResolvedValue(entitledUser(user_id));
    updateUserById.mockResolvedValue({ error: { message: "user not found" } });
    await expect(consumeProvisioningEntitlement(user_id)).rejects.toThrow(/user not found/i);
  });

  it("refuses to build the admin client without the server-only service role key", () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => createSupabaseAdminClient()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });
});
