import { describe, expect, it } from "vitest";
import { publicIntegrationUrl, publicOriginFromRequest } from "./public-origin";

describe("publicOriginFromRequest", () => {
  it("prefers x-forwarded-host over the internal Host header", () => {
    const origin = publicOriginFromRequest(
      headers({
        host: "f59095ac8225:8080",
        "x-forwarded-host": "web-production-33d67.up.railway.app",
        "x-forwarded-proto": "https"
      })
    );
    expect(origin).toBe("https://web-production-33d67.up.railway.app");
  });

  it("falls back to RAILWAY_PUBLIC_DOMAIN when forwarded host is missing", () => {
    const origin = publicOriginFromRequest(
      headers({ host: "f59095ac8225:8080" }),
      "web-production-33d67.up.railway.app"
    );
    expect(origin).toBe("https://web-production-33d67.up.railway.app");
  });

  it("uses localhost as http, including the dev port", () => {
    const origin = publicOriginFromRequest(headers({ host: "localhost:3000" }));
    expect(origin).toBe("http://localhost:3000");
  });

  it("returns null when only an internal container host is available", () => {
    expect(publicOriginFromRequest(headers({ host: "f59095ac8225:8080" }), "")).toBeNull();
  });
});

describe("publicIntegrationUrl", () => {
  it("joins origin and path with no POST prefix", () => {
    const url = publicIntegrationUrl(
      headers({
        "x-forwarded-host": "crm.example.com",
        "x-forwarded-proto": "https"
      }),
      "/v1/integrations/pluga/leads"
    );
    expect(url).toBe("https://crm.example.com/v1/integrations/pluga/leads");
    expect(url.startsWith("POST ")).toBe(false);
  });

  it("returns the path alone when the public host cannot be known", () => {
    expect(
      publicIntegrationUrl(headers({ host: "f59095ac8225:8080" }), "/v1/integrations/pluga/leads", "")
    ).toBe("/v1/integrations/pluga/leads");
  });
});

function headers(init: Record<string, string>): Headers {
  return new Headers(init);
}
