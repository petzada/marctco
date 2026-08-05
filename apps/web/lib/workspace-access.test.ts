import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUserId: vi.fn(),
  resolveUserContextForSlug: vi.fn(),
  checkSuspiciousRequestLimit: vi.fn(),
  loggerWarn: vi.fn()
}));

vi.mock("@marctco/db", () => ({ resolveUserContextForSlug: mocks.resolveUserContextForSlug }));
vi.mock("@marctco/domain", () => ({
  checkSuspiciousRequestLimit: mocks.checkSuspiciousRequestLimit,
  createMemoryRateLimiter: vi.fn(() => ({ consume: vi.fn() }))
}));
vi.mock("next/headers", () => ({
  headers: vi.fn(() => Promise.resolve(new Headers({ "x-forwarded-for": "203.0.113.10" })))
}));
vi.mock("./supabase/server", () => ({ getAuthenticatedUserId: mocks.getAuthenticatedUserId }));
vi.mock("./logger", () => ({ logger: { warn: mocks.loggerWarn } }));

import { resolveWorkspaceAccess } from "./workspace-access";

describe("resolveWorkspaceAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthenticatedUserId.mockResolvedValue(randomUUID());
    mocks.checkSuspiciousRequestLimit.mockReturnValue({ allowed: true, remaining: 19 });
  });

  it("turns a malformed slug into the same audited not-found result without querying Postgres", async () => {
    const access = await resolveWorkspaceAccess("not-a-workspace-slug");

    expect(access).toEqual({ status: "not-found" });
    expect(mocks.resolveUserContextForSlug).not.toHaveBeenCalled();
    expect(mocks.checkSuspiciousRequestLimit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        scope: "FOREIGN_WORKSPACE_ATTEMPT",
        ip_address: "203.0.113.10"
      })
    );
    // The precise PII allowlist and the audit-event fields are covered by
    // packages/domain/src/telemetry.test.ts; this boundary test proves the
    // malformed URL reaches that audited denial path.
    expect(mocks.loggerWarn).toHaveBeenCalledOnce();
  });

  it("returns not-found for a valid slug with no matching association", async () => {
    const slug = randomUUID();
    mocks.resolveUserContextForSlug.mockResolvedValue(null);

    await expect(resolveWorkspaceAccess(slug)).resolves.toEqual({ status: "not-found" });
    expect(mocks.resolveUserContextForSlug).toHaveBeenCalledWith(expect.any(String), slug);
    expect(mocks.loggerWarn).toHaveBeenCalledOnce();
  });
});
