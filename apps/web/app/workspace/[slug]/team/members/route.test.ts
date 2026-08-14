import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const attachWorkspaceMember = vi.fn();
const detachWorkspaceMember = vi.fn();
const listTeam = vi.fn();
const terminateWorkspaceMember = vi.fn();
const revokeProvisioningEntitlement = vi.fn();
const resolveWorkspaceAccess = vi.fn();
const listUsers = vi.fn();
const inviteUserByEmail = vi.fn();
const createSupabaseAdminClient = vi.fn(() => ({
  auth: { admin: { inviteUserByEmail, listUsers } }
}));

vi.mock("@marctco/db", () => ({ attachWorkspaceMember, detachWorkspaceMember, listTeam, terminateWorkspaceMember }));
vi.mock("../../../../../lib/workspace-access", () => ({ resolveWorkspaceAccess }));
vi.mock("../../../../../lib/supabase/admin", () => ({ createSupabaseAdminClient, revokeProvisioningEntitlement }));

const { POST } = await import("./route");
const slug = randomUUID();
const workspace_id = randomUUID();
const owner_id = randomUUID();

function accessAs(role: "ATTENDANT" | "SUPERVISOR" | "MANAGER" | "OWNER") {
  return {
    status: "resolved",
    workspace: {
      role,
      context: { actor_type: "USER", workspace_id, user_id: owner_id, role }
    }
  };
}

function request(fields: Record<string, string>): Request {
  return new Request(`https://app.marctco.test/workspace/${slug}/team/members`, {
    method: "POST",
    body: new URLSearchParams(fields)
  });
}

describe("POST /workspace/[slug]/team/members", () => {
  beforeEach(() => {
    attachWorkspaceMember.mockReset().mockResolvedValue({});
    detachWorkspaceMember.mockReset().mockResolvedValue({ detached: true, queued_open_opportunities: 2 });
    terminateWorkspaceMember.mockReset().mockResolvedValue([
      { workspace_id, detached: true, queued_open_opportunities: 0 }
    ]);
    revokeProvisioningEntitlement.mockReset().mockResolvedValue(undefined);
    listTeam.mockReset().mockResolvedValue([]);
    resolveWorkspaceAccess.mockReset().mockResolvedValue(accessAs("OWNER"));
    listUsers.mockReset().mockResolvedValue({ data: { users: [] }, error: null });
    inviteUserByEmail.mockReset().mockResolvedValue({
      data: { user: { id: randomUUID() } },
      error: null
    });
    createSupabaseAdminClient.mockClear();
  });

  it("reuses an existing Auth user without sending a second invitation", async () => {
    const existing_user_id = randomUUID();
    listUsers.mockResolvedValue({
      data: { users: [{ id: existing_user_id, email: "ana@hugs.test" }] },
      error: null
    });

    const response = await POST(
      request({
        display_name: "Ana Costa",
        email: "ANA@HUGS.TEST",
        role: "SUPERVISOR",
        tags: "Veiculos, Imoveis",
        whatsapp_phone: "+5511999999999"
      }),
      { params: Promise.resolve({ slug }) }
    );

    expect(inviteUserByEmail).not.toHaveBeenCalled();
    expect(attachWorkspaceMember).toHaveBeenCalledWith(
      expect.objectContaining({ workspace_id, role: "OWNER" }),
      {
        user_id: existing_user_id,
        display_name: "Ana Costa",
        email: "ana@hugs.test",
        role: "SUPERVISOR",
        tags: ["Veiculos", "Imoveis"],
        whatsapp_phone: "+5511999999999"
      }
    );
    expect(response.status).toBe(303);
  });

  it("invites a new login and attaches that returned user id", async () => {
    const invited_user_id = randomUUID();
    inviteUserByEmail.mockResolvedValue({
      data: { user: { id: invited_user_id } },
      error: null
    });

    await POST(
      request({
        display_name: "Bruno Lima",
        email: "bruno@hugs.test",
        role: "ATTENDANT",
        tags: "Veiculos"
      }),
      { params: Promise.resolve({ slug }) }
    );

    expect(inviteUserByEmail).toHaveBeenCalledWith("bruno@hugs.test", {
      data: { display_name: "Bruno Lima" }
    });
    expect(attachWorkspaceMember).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ user_id: invited_user_id, role: "ATTENDANT" })
    );
  });

  it("refuses ATTENDANT independently of navigation visibility", async () => {
    resolveWorkspaceAccess.mockResolvedValue(accessAs("ATTENDANT"));

    const response = await POST(
      request({ display_name: "Ivo", email: "ivo@hugs.test", role: "ATTENDANT", tags: "" }),
      { params: Promise.resolve({ slug }) }
    );

    expect(response.status).toBe(404);
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
    expect(attachWorkspaceMember).not.toHaveBeenCalled();
  });

  it("rejects OWNER before touching Auth Admin", async () => {
    const response = await POST(
      request({ display_name: "Ivo", email: "ivo@hugs.test", role: "OWNER", tags: "" }),
      { params: Promise.resolve({ slug }) }
    );

    expect(response.headers.get("location")).toContain("error=invalid");
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
    expect(attachWorkspaceMember).not.toHaveBeenCalled();
  });

  it("rejects an invalid optional phone before creating an Auth login", async () => {
    const response = await POST(
      request({
        display_name: "Ivo",
        email: "ivo@hugs.test",
        role: "ATTENDANT",
        tags: "",
        whatsapp_phone: "123"
      }),
      { params: Promise.resolve({ slug }) }
    );

    expect(response.headers.get("location")).toContain("error=invalid");
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
    expect(attachWorkspaceMember).not.toHaveBeenCalled();
  });

  it("edits an active member without consulting Auth Admin again", async () => {
    const user_id = randomUUID();
    listTeam.mockResolvedValue([
      {
        user_id,
        email: "carla@hugs.test",
        display_name: "Carla Mota",
        role: "ATTENDANT",
        status: "ACTIVE",
        whatsapp_phone_e164: null,
        tags: []
      }
    ]);

    await POST(
      request({
        user_id,
        display_name: "Carla Mota",
        email: "carla@hugs.test",
        role: "MANAGER",
        tags: "Imoveis"
      }),
      { params: Promise.resolve({ slug }) }
    );

    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
    expect(attachWorkspaceMember).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ user_id, role: "MANAGER", tags: ["Imoveis"] })
    );
  });

  it("does not turn a forged edit id into an uninvited membership", async () => {
    const response = await POST(
      request({
        user_id: randomUUID(),
        display_name: "Pessoa desconhecida",
        email: "unknown@hugs.test",
        role: "MANAGER",
        tags: "Imoveis"
      }),
      { params: Promise.resolve({ slug }) }
    );

    expect(response.headers.get("location")).toContain("error=invalid");
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
    expect(attachWorkspaceMember).not.toHaveBeenCalled();
  });

  it("lets MANAGER detach only in the current workspace", async () => {
    const target_user_id = randomUUID();
    resolveWorkspaceAccess.mockResolvedValue(accessAs("MANAGER"));
    const response = await POST(request({ membership_action: "detach", target_user_id }), { params: Promise.resolve({ slug }) });
    expect(detachWorkspaceMember).toHaveBeenCalledWith(expect.objectContaining({ role: "MANAGER", workspace_id }), target_user_id);
    expect(terminateWorkspaceMember).not.toHaveBeenCalled();
    expect(revokeProvisioningEntitlement).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toContain("result=detached");
  });

  it("lets OWNER terminate in owned workspaces and revokes Auth provisioning", async () => {
    const target_user_id = randomUUID();
    listTeam.mockResolvedValue([{ user_id: target_user_id, role: "ATTENDANT", status: "ACTIVE" }]);
    const response = await POST(request({ membership_action: "terminate", target_user_id }), { params: Promise.resolve({ slug }) });
    expect(terminateWorkspaceMember).toHaveBeenCalledWith(expect.objectContaining({ role: "OWNER", workspace_id }), target_user_id);
    expect(revokeProvisioningEntitlement).toHaveBeenCalledWith(target_user_id);
    expect(response.headers.get("location")).toContain("result=terminated");
  });

  it("does not let a forged target id revoke another Auth user's provisioning right", async () => {
    const response = await POST(request({ membership_action: "terminate", target_user_id: randomUUID() }), { params: Promise.resolve({ slug }) });
    expect(response.headers.get("location")).toContain("error=failed");
    expect(revokeProvisioningEntitlement).not.toHaveBeenCalled();
    expect(terminateWorkspaceMember).not.toHaveBeenCalled();
  });

  it("refuses terminate from MANAGER before DB and Auth writes", async () => {
    resolveWorkspaceAccess.mockResolvedValue(accessAs("MANAGER"));
    const response = await POST(request({ membership_action: "terminate", target_user_id: randomUUID() }), { params: Promise.resolve({ slug }) });
    expect(response.status).toBe(404);
    expect(terminateWorkspaceMember).not.toHaveBeenCalled();
    expect(revokeProvisioningEntitlement).not.toHaveBeenCalled();
  });
});
