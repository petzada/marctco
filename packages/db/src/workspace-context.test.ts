import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { listUserWorkspaces, resolveUserContextForSlug } from "./workspace-context.js";

describe("workspace context resolver", () => {
  it("builds UserContext only from the membership row returned by the database resolver", async () => {
    const workspace_id = randomUUID();
    const authenticated_user_id = randomUUID();
    const requested_slug = randomUUID();
    const queryRaw = vi.fn().mockResolvedValue([
      {
        workspace_id,
        workspace_slug: requested_slug,
        workspace_name: "Assessoria Horizonte",
        workspace_role: "OWNER"
      }
    ]);
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaClient;

    await expect(
      resolveUserContextForSlug(authenticated_user_id, requested_slug, prisma)
    ).resolves.toEqual({
      workspace_id,
      slug: requested_slug,
      name: "Assessoria Horizonte",
      role: "OWNER",
      context: {
        kind: "user",
        workspace_id,
        user_id: authenticated_user_id,
        role: "OWNER"
      }
    });
    expect(queryRaw).toHaveBeenCalledOnce();
  });

  it("refuses malformed identity or slug before querying the database", async () => {
    const queryRaw = vi.fn();
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaClient;

    await expect(
      listUserWorkspaces({ authenticated_user_id: "not-a-uuid" }, prisma)
    ).rejects.toThrow(/authenticated_user_id must be a UUID/i);
    await expect(
      listUserWorkspaces(
        { authenticated_user_id: randomUUID(), requested_slug: "not-a-uuid" },
        prisma
      )
    ).rejects.toThrow(/requested_slug must be a UUID/i);
    expect(queryRaw).not.toHaveBeenCalled();
  });
});
