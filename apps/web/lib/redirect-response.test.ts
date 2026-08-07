import { describe, expect, it } from "vitest";
import { redirectTo } from "./redirect-response";

/**
 * The bug these lock down shipped and reached users: behind Railway the
 * request carries the internal container host, so redirects built from
 * `request.url` sent the browser to `https://f59095ac8225:8080/...`. The
 * assertion that matters is not "it redirects" but "the location names no
 * host at all" — a test that only checked the path would have passed against
 * the broken version too.
 */
describe("redirectTo", () => {
  it("emits a location with no authority component", () => {
    const location = redirectTo("/access").headers.get("location");

    expect(location).toBe("/access");
    expect(() => new URL(location ?? "")).toThrow();
  });

  it("keeps the query string", () => {
    expect(redirectTo("/onboarding?error=configuration").headers.get("location")).toBe(
      "/onboarding?error=configuration"
    );
  });

  it("defaults to 303 so a POST is followed by a GET", () => {
    expect(redirectTo("/login").status).toBe(303);
  });

  it("carries no body", async () => {
    await expect(redirectTo("/login").text()).resolves.toBe("");
  });

  it("uses 307 when the caller asks for it", () => {
    expect(redirectTo("/access", 307).status).toBe(307);
  });
});
