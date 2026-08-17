import { describe, expect, it } from "vitest";
import {
  metaHttpRequestTemplate,
  pluginRequestHeaders,
  pluginRequestHeadersFor
} from "./pluga-templates";

describe("pluginRequestHeaders", () => {
  it("is JSON with Authorization Bearer and Content-Type, not HTTP request lines", () => {
    const parsed = JSON.parse(pluginRequestHeaders) as {
      Authorization: string;
      "Content-Type": string;
    };
    expect(parsed.Authorization).toBe("Bearer COLE_O_TOKEN_AQUI");
    expect(parsed["Content-Type"]).toBe("application/json");
    expect(pluginRequestHeaders.startsWith("{")).toBe(true);
    expect(pluginRequestHeaders.includes("Authorization: Bearer")).toBe(false);
  });

  it("interpolates the generated secret when one is in hand", () => {
    const parsed = JSON.parse(pluginRequestHeadersFor("mtco_live_abc")) as {
      Authorization: string;
    };
    expect(parsed.Authorization).toBe("Bearer mtco_live_abc");
  });
});

describe("metaHttpRequestTemplate", () => {
  it("is valid JSON once the boolean placeholder is substituted", () => {
    const parsed = JSON.parse(metaHttpRequestTemplate.replace("<< is_organic >>", "true")) as {
      schema_version: string;
      source: string;
      financing_type: string;
      name: string;
      phone: string;
      email: string;
      occurred_at: string;
      is_organic: boolean;
    };
    expect(parsed.schema_version).toBe("v1");
    expect(parsed.source).toBe("META_LEAD_ADS");
    expect(parsed.financing_type).toBe("VEHICLE");
    expect(parsed.name).toBe("<< nome_completo >>");
    expect(parsed.phone).toBe("<< número_do_whatsapp >>");
    expect(parsed.email).toBe("<< email >>");
    expect(parsed.occurred_at).toContain("AAAA-MM-DDTHH:mm:ssZ");
    expect(parsed.is_organic).toBe(true);
  });

  it("quotes VEHICLE and leaves is_organic unquoted in the pasteable text", () => {
    expect(metaHttpRequestTemplate).toContain('"financing_type": "VEHICLE"');
    expect(metaHttpRequestTemplate).toContain('"is_organic": << is_organic >>');
    expect(metaHttpRequestTemplate).not.toContain("nome do form");
    expect(metaHttpRequestTemplate).not.toContain("telefone do form");
    expect(metaHttpRequestTemplate).not.toContain("—");
  });
});
