import { normalize } from "@marctco/domain";
import { describe, expect, it } from "vitest";
import { buildReleaseInboundLead } from "./build-release-inbound-lead";

describe("buildReleaseInboundLead", () => {
  it("preserves source and external_lead_id from the original submission", () => {
    const inbound = buildReleaseInboundLead(
      { ad_id: "123" },
      { source: "META_LEAD_ADS", external_lead_id: "lead-1" },
      { name: "Maria", phone: "11987654321", email: "", cpf: "" }
    );
    expect(inbound.source).toBe("META_LEAD_ADS");
    expect(inbound.external_lead_id).toBe("lead-1");
  });

  it("carries over attribution that arrived correctly, untouched by the manager's typing", () => {
    const inbound = buildReleaseInboundLead(
      { campaign_id: "camp-1", form_id: "form-9", platform: "ig" },
      { source: "META_LEAD_ADS", external_lead_id: "lead-1" },
      { name: "Maria", phone: "11987654321", email: "", cpf: "" }
    );
    expect(inbound.attribution).toMatchObject({
      campaign_id: "camp-1",
      form_id: "form-9",
      platform: "ig"
    });
  });

  it("replaces only the four contact fields — what the mapping lost", () => {
    const inbound = buildReleaseInboundLead(
      { name: "wrong field mapped here", phone: "not-a-real-phone" },
      { source: "LANDING_PAGE", external_lead_id: "lead-2" },
      { name: "Maria Completada", phone: "11987654321", email: "maria@exemplo.com", cpf: "52998224725" }
    );
    expect(inbound.name).toBe("Maria Completada");
    expect(inbound.phones).toEqual(["11987654321"]);
    expect(inbound.emails).toEqual(["maria@exemplo.com"]);
    expect(inbound.cpf).toBe("52998224725");
  });

  it("produces empty contact arrays, not a crash, when the manager also has nothing to type", () => {
    const inbound = buildReleaseInboundLead(
      {},
      { source: "META_LEAD_ADS", external_lead_id: "lead-3" },
      { name: "", phone: "", email: "", cpf: "" }
    );
    expect(inbound.phones).toEqual([]);
    expect(inbound.emails).toEqual([]);
    expect(inbound.name).toBeNull();
    expect(inbound.cpf).toBeNull();
  });

  it("normalizes cleanly, matching what the worker's own normalize() expects downstream", () => {
    const inbound = buildReleaseInboundLead(
      {},
      { source: "META_LEAD_ADS", external_lead_id: "lead-4" },
      { name: "Maria", phone: "11987654321", email: "MARIA@Exemplo.com", cpf: "" }
    );
    const normalized = normalize(inbound);
    expect(normalized.phones).toEqual(["+5511987654321"]);
    expect(normalized.emails).toEqual(["maria@exemplo.com"]);
  });
});
