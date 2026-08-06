import { describe, expect, it } from "vitest";
import { checkSuspiciousRequestLimit, createMemoryRateLimiter } from "./rate-limit.js";

describe("rate limiter", () => {
  it("counts within the process and resets after the window", () => {
    let now = 1_000;
    const limiter = createMemoryRateLimiter({
      limit: 2,
      window_ms: 500,
      now: () => now
    });

    const request = { scope: "AUTH_FAILURE", ip_address: "127.0.0.1" } as const;
    expect(checkSuspiciousRequestLimit(limiter, request).allowed).toBe(true);
    expect(checkSuspiciousRequestLimit(limiter, request).allowed).toBe(true);
    expect(checkSuspiciousRequestLimit(limiter, request)).toMatchObject({
      allowed: false,
      retry_after_ms: 500
    });

    now = 1_500;
    expect(checkSuspiciousRequestLimit(limiter, request).allowed).toBe(true);
  });

  it("counts each suspicious scope in its own bucket", () => {
    const limiter = createMemoryRateLimiter({ limit: 1, window_ms: 500 });
    const ip_address = "127.0.0.1";

    expect(
      checkSuspiciousRequestLimit(limiter, { scope: "FOREIGN_WORKSPACE_ATTEMPT", ip_address })
        .allowed
    ).toBe(true);
    // Um IP que já esgotou tentativas de workspace alheio ainda tem sua
    // primeira tentativa de provisionamento sem direito — são perguntas
    // diferentes, e uma não pode mascarar a outra.
    expect(
      checkSuspiciousRequestLimit(limiter, {
        scope: "UNENTITLED_PROVISIONING_ATTEMPT",
        ip_address
      }).allowed
    ).toBe(true);
    expect(
      checkSuspiciousRequestLimit(limiter, {
        scope: "UNENTITLED_PROVISIONING_ATTEMPT",
        ip_address
      }).allowed
    ).toBe(false);
  });

  it("fails open when the limiter itself throws", () => {
    expect(
      checkSuspiciousRequestLimit(
        {
          consume() {
            throw new Error("limiter unavailable");
          }
        },
        { scope: "LANDING_PAGE_TOKEN", token_hash: "sha256:test" }
      )
    ).toEqual({ allowed: true, remaining: 0 });
  });
});
