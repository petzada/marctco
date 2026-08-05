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
