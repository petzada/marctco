import { randomUUID } from "node:crypto";
import { defaultCommercialPipeline } from "@marctco/domain";
import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { provisionWorkspace } from "./provision-workspace.js";

function membershipRow(workspace_id: string, slug: string) {
  return {
    workspace_id,
    workspace_slug: slug,
    workspace_name: "Assessoria Horizonte",
    workspace_role: "OWNER"
  };
}

describe("provisionWorkspace", () => {
  it("sends the canonical pipeline definition from @marctco/domain, never a copy", async () => {
    const workspace_id = randomUUID();
    const slug = randomUUID();
    const owner_user_id = randomUUID();
    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce([{ workspace_id }])
      .mockResolvedValueOnce([membershipRow(workspace_id, slug)]);
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaClient;

    await expect(
      provisionWorkspace({ owner_user_id, workspace_name: "  Assessoria Horizonte  " }, prisma)
    ).resolves.toEqual({ workspace_id, slug });

    const [, ...provision_values] = queryRaw.mock.calls[0] as [unknown, ...unknown[]];
    expect(provision_values[0]).toBe(owner_user_id);
    expect(provision_values[1]).toBe("Assessoria Horizonte");
    expect(JSON.parse(String(provision_values[2]))).toEqual(defaultCommercialPipeline);
  });

  it("refuses malformed identity or an empty name before touching the database", async () => {
    const queryRaw = vi.fn();
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaClient;

    await expect(
      provisionWorkspace({ owner_user_id: "not-a-uuid", workspace_name: "Assessoria" }, prisma)
    ).rejects.toThrow(/owner_user_id must be a UUID/i);
    await expect(
      provisionWorkspace({ owner_user_id: randomUUID(), workspace_name: "   " }, prisma)
    ).rejects.toThrow(/workspace_name must not be empty/i);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("reads the slug back through the membership resolver, not from the provisioner", async () => {
    const workspace_id = randomUUID();
    const slug = randomUUID();
    const owner_user_id = randomUUID();
    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce([{ workspace_id }])
      .mockResolvedValueOnce([
        membershipRow(randomUUID(), randomUUID()),
        membershipRow(workspace_id, slug)
      ]);
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaClient;

    await expect(
      provisionWorkspace({ owner_user_id, workspace_name: "Assessoria Horizonte" }, prisma)
    ).resolves.toEqual({ workspace_id, slug });
  });

  it("fails closed when provisioning returns no workspace at all", async () => {
    const queryRaw = vi.fn().mockResolvedValueOnce([]);
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaClient;

    await expect(
      provisionWorkspace(
        { owner_user_id: randomUUID(), workspace_name: "Assessoria Horizonte" },
        prisma
      )
    ).rejects.toThrow(/did not return a workspace/i);
  });

  it("fails closed when the provisioned workspace is not a membership of the owner", async () => {
    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce([{ workspace_id: randomUUID() }])
      .mockResolvedValueOnce([membershipRow(randomUUID(), randomUUID())]);
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaClient;

    await expect(
      provisionWorkspace(
        { owner_user_id: randomUUID(), workspace_name: "Assessoria Horizonte" },
        prisma
      )
    ).rejects.toThrow(/membership/i);
  });
});
