import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { connectLeadSource } from "./connector-v1.js";

const integration_event_id = randomUUID();

describe("connectLeadSource", () => {
  it("reads the canonical contract into an InboundLead", () => {
    const { inbound } = connectLeadSource({
      raw: {
        schema_version: "v1",
        source: "META_LEAD_ADS",
        external_lead_id: "6789",
        name: "Maria Souza",
        phone: "(11) 98765-4321",
        email: "Maria@Exemplo.com",
        campaign_id: "c1"
      },
      integration_event_id,
      provider: "PLUGA"
    });

    expect(inbound.source).toBe("META_LEAD_ADS");
    expect(inbound.external_lead_id).toBe("6789");
    expect(inbound.name).toBe("Maria Souza");
    expect(inbound.attribution.campaign_id).toBe("c1");
  });

  it("hands the domain raw values, normalizing nothing itself", () => {
    // The connector knows shape, the domain knows meaning. A phone that
    // arrived here already in E.164 would mean the default country leaked into
    // the adapter (ADR-0008).
    const { inbound } = connectLeadSource({
      raw: { phone: "(11) 98765-4321", email: "Maria@Exemplo.com", cpf: "529.982.247-25" },
      integration_event_id,
      provider: "PLUGA"
    });

    expect(inbound.phones).toEqual(["(11) 98765-4321"]);
    expect(inbound.emails).toEqual(["Maria@Exemplo.com"]);
    expect(inbound.cpf).toBe("529.982.247-25");
  });

  it("synthesizes the external_lead_id from the event when the origin gave none", () => {
    const connected = connectLeadSource({
      raw: { phone: "11987654321" },
      integration_event_id,
      provider: "LANDING_PAGE"
    });

    expect(connected.inbound.external_lead_id).toBe(integration_event_id);
    expect(connected.synthesized_external_lead_id).toBe(true);
  });

  it("produces the same key every time the same event is interpreted", () => {
    // An event republished after Redis came back must not become a second
    // lead. The event id has no clock inside it, which is exactly why it is
    // the fallback.
    const payload = { raw: { phone: "11987654321" }, integration_event_id, provider: "PLUGA" } as const;

    expect(connectLeadSource(payload).inbound.external_lead_id).toBe(
      connectLeadSource(payload).inbound.external_lead_id
    );
  });

  it("keeps two separate POSTs without an origin id as separate submissions", () => {
    const samePayload = { phone: "11987654321" };
    const first_event_id = randomUUID();
    const second_event_id = randomUUID();

    const first = connectLeadSource({
      raw: samePayload,
      integration_event_id: first_event_id,
      provider: "LANDING_PAGE"
    });
    const second = connectLeadSource({
      raw: samePayload,
      integration_event_id: second_event_id,
      provider: "LANDING_PAGE"
    });

    expect(first.inbound.external_lead_id).toBe(first_event_id);
    expect(second.inbound.external_lead_id).toBe(second_event_id);
    expect(first.inbound.external_lead_id).not.toBe(second.inbound.external_lead_id);
  });

  it("prefers the id the origin gave over the one it would synthesize", () => {
    const connected = connectLeadSource({
      raw: { external_lead_id: "6789", phone: "11987654321" },
      integration_event_id,
      provider: "PLUGA"
    });

    expect(connected.inbound.external_lead_id).toBe("6789");
    expect(connected.synthesized_external_lead_id).toBe(false);
  });

  it("falls back to what the connection means when the payload declares no origin", () => {
    expect(connectLeadSource({ raw: {}, integration_event_id, provider: "PLUGA" })).toMatchObject({
      inbound: { source: "META_LEAD_ADS" },
      declared_source: false
    });
    expect(connectLeadSource({ raw: {}, integration_event_id, provider: "LANDING_PAGE" })).toMatchObject({
      inbound: { source: "LANDING_PAGE" },
      declared_source: false
    });
  });

  it("believes a declared origin over the connection's default", () => {
    const connected = connectLeadSource({
      raw: { source: "GOOGLE_LEAD_FORM" },
      integration_event_id,
      provider: "PLUGA"
    });

    expect(connected.inbound.source).toBe("GOOGLE_LEAD_FORM");
    expect(connected.declared_source).toBe(true);
  });

  it.each(["GOOGLE_LEAD_FORM", "META_LEAD_ADS"] as const)(
    "keeps landing-page provenance when its payload declares %s",
    (declaredSource) => {
      const connected = connectLeadSource({
        raw: { source: declaredSource },
        integration_event_id,
        provider: "LANDING_PAGE"
      });

      expect(connected.inbound.source).toBe("LANDING_PAGE");
      expect(connected.declared_source).toBe(false);
    }
  );

  it.each([
    {
      provider: "PLUGA" as const,
      raw: { source: "GOOGLE_LEAD_FORM", phone: "(11) 98765-4321" },
      source: "GOOGLE_LEAD_FORM"
    },
    {
      provider: "LANDING_PAGE" as const,
      raw: { phone: "(11) 98765-4321" },
      source: "LANDING_PAGE"
    }
  ])("sends $source through the same unnormalized v1 boundary", ({ provider, raw, source }) => {
    const connected = connectLeadSource({ raw, integration_event_id, provider });

    expect(connected.inbound.source).toBe(source);
    expect(connected.inbound.phones).toEqual(["(11) 98765-4321"]);
  });

  it("interprets a payload that carries nothing usable rather than throwing", () => {
    // It already authenticated and already got its 200. Whatever it is, it
    // must become a record somebody can see, never an exception in a worker.
    for (const raw of [null, "texto solto", 42, [], { totalmente: { outro: "formato" } }]) {
      const connected = connectLeadSource({ raw, integration_event_id, provider: "PLUGA" });
      expect(connected.inbound.external_lead_id).toBe(integration_event_id);
      expect(connected.inbound.phones).toEqual([]);
      expect(connected.inbound.emails).toEqual([]);
    }
  });

  it("refuses to interpret an event it cannot identify", () => {
    expect(() => connectLeadSource({ raw: {}, integration_event_id: "", provider: "PLUGA" })).toThrow(
      /needs the id/i
    );
  });
});
