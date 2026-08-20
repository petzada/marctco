import { createHash, randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  generateIntegrationToken,
  hashIntegrationToken,
  integrationTokenHashesEqual,
  resolveWorkspaceByIntegrationToken
} from "./integration-connection.js";

describe("integration connection token", () => {
  it("generates exactly 256 random bits in base64url with a deterministic lookup hash", () => {
    const entropy = vi.fn().mockReturnValue(new Uint8Array(32).fill(42));
    const generated = generateIntegrationToken(entropy);

    expect(entropy).toHaveBeenCalledWith(32);
    expect(generated.token).toBe(`mtco_${Buffer.alloc(32, 42).toString("base64url")}`);
    expect(generated.token).toMatch(/^mtco_[A-Za-z0-9_-]{43}$/);
    expect(generated.token_hash).toBe(
      createHash("sha256").update(generated.token, "utf8").digest("hex")
    );
    expect(generated.token_last4).toBe(generated.token.slice(-4));
  });

  it("compares token hashes in constant time and fails closed on a malformed digest", () => {
    const left = hashIntegrationToken("mtco_left");
    const right = hashIntegrationToken("mtco_right");
    expect(integrationTokenHashesEqual(left, left)).toBe(true);
    expect(integrationTokenHashesEqual(left, right)).toBe(false);
    expect(integrationTokenHashesEqual("not-a-hash", left)).toBe(false);
  });

  it("hashes the bearer token before calling the private resolver and returns only technical ids", async () => {
    const workspace_id = randomUUID();
    const integration_connection_id = randomUUID();
    const queryRaw = vi.fn().mockResolvedValue([
      {
        workspace_id,
        integration_connection_id
      }
    ]);
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaClient;

    await expect(resolveWorkspaceByIntegrationToken("mtco_example", prisma)).resolves.toEqual({
      workspace_id,
      integration_connection_id
    });
    expect(queryRaw).toHaveBeenCalledOnce();
    expect(hashIntegrationToken("mtco_example")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("fails closed when the private resolver does not find an active connection", async () => {
    const queryRaw = vi.fn().mockResolvedValue([]);
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaClient;

    await expect(resolveWorkspaceByIntegrationToken("mtco_revoked", prisma)).resolves.toBeNull();
  });
});
