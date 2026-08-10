import { describe, expect, it } from "vitest";
import {
  buildInboundLead,
  MAX_EXTERNAL_LEAD_ID_LENGTH,
  readLeadPayload
} from "./inbound-lead.js";

const identity = { source: "META_LEAD_ADS", external_lead_id: "lead-1" } as const;

describe("readLeadPayload", () => {
  it("reads the published contract", () => {
    const reading = readLeadPayload({
      schema_version: "v1",
      source: "META_LEAD_ADS",
      external_lead_id: "6789",
      occurred_at: "2026-08-07T10:00:00.000Z",
      name: "Maria Souza",
      phones: ["(11) 98765-4321"],
      emails: ["Maria@Exemplo.com"],
      cpf: "529.982.247-25",
      financing_type: "VEHICLE",
      financial_institution: "Banco X",
      installment_amount: "R$ 1.234,56",
      form_id: "f1",
      campaign_id: "c1",
      adset_id: "as1",
      ad_id: "a1",
      platform: "ig",
      is_organic: false,
      answers: { pergunta: "resposta" }
    });

    expect(reading.declared_source).toBe("META_LEAD_ADS");
    expect(reading.declared_external_lead_id).toBe("6789");
    expect(reading.fields.name).toBe("Maria Souza");
    expect(reading.fields.phones).toEqual(["(11) 98765-4321"]);
    expect(reading.fields.emails).toEqual(["Maria@Exemplo.com"]);
    expect(reading.fields.cpf).toBe("529.982.247-25");
    expect(reading.fields.installment_amount).toBe("R$ 1.234,56");
    expect(reading.fields.attribution.platform).toBe("ig");
    expect(reading.fields.attribution.is_organic).toBe(false);
    expect(reading.fields.answers).toEqual({ pergunta: "resposta" });
  });

  it("keeps the lead when the payload carries properties the contract does not know", () => {
    const reading = readLeadPayload({
      name: "Maria",
      phone: "11987654321",
      alguma_coisa_nova: { aninhada: true },
      utm: { source: "ig" }
    });

    expect(reading.fields.name).toBe("Maria");
    expect(reading.fields.phones).toEqual(["11987654321"]);
  });

  it("accepts the singular and the plural spelling of a contact, without duplicating", () => {
    expect(readLeadPayload({ phone: "11987654321" }).fields.phones).toEqual(["11987654321"]);
    expect(readLeadPayload({ phones: ["11987654321"] }).fields.phones).toEqual(["11987654321"]);
    expect(
      readLeadPayload({ phone: "11987654321", phones: ["11987654321", "1133334444"] }).fields.phones
    ).toEqual(["11987654321", "1133334444"]);
    expect(readLeadPayload({ email: "a@b.com", emails: "c@d.com" }).fields.emails).toEqual([
      "a@b.com",
      "c@d.com"
    ]);
  });

  it("accepts a single contact sent as a bare string where an array is published", () => {
    expect(readLeadPayload({ phones: "11987654321" }).fields.phones).toEqual(["11987654321"]);
  });

  it("degrades a field of the wrong shape to absent instead of rejecting the submission", () => {
    const reading = readLeadPayload({
      name: { nested: "object" },
      cpf: ["not", "a", "cpf"],
      is_organic: "talvez",
      answers: "not an object",
      phone: "11987654321"
    });

    expect(reading.fields.name).toBeNull();
    expect(reading.fields.cpf).toBeNull();
    expect(reading.fields.attribution.is_organic).toBeNull();
    expect(reading.fields.answers).toEqual({});
    expect(reading.fields.phones).toEqual(["11987654321"]);
  });

  it("coerces an id sent as a number, because ids travel as strings", () => {
    expect(readLeadPayload({ external_lead_id: 6789 }).declared_external_lead_id).toBe("6789");
    expect(readLeadPayload({ campaign_id: 42 }).fields.attribution.campaign_id).toBe("42");
  });

  it("stops believing an id that would not fit the constraint meant to protect the lead", () => {
    // Over the column's width the unique index would refuse the insert, and the
    // constraint that exists so no lead is counted twice would be the thing
    // losing one. It degrades to absent, and the connector falls back to the
    // event id — the same path an origin with no id at all takes.
    const at_the_limit = "a".repeat(MAX_EXTERNAL_LEAD_ID_LENGTH);
    expect(readLeadPayload({ external_lead_id: at_the_limit }).declared_external_lead_id).toBe(
      at_the_limit
    );
    expect(
      readLeadPayload({ external_lead_id: `${at_the_limit}a` }).declared_external_lead_id
    ).toBeNull();
  });

  it("reads a source declared in a different case or spacing", () => {
    expect(readLeadPayload({ source: "meta_lead_ads" }).declared_source).toBe("META_LEAD_ADS");
    expect(readLeadPayload({ source: " Google Lead Form " }).declared_source).toBe(
      "GOOGLE_LEAD_FORM"
    );
  });

  it("refuses to invent a source it does not recognise", () => {
    expect(readLeadPayload({ source: "tiktok" }).declared_source).toBeNull();
    expect(readLeadPayload({}).declared_source).toBeNull();
  });

  it("treats an empty string as an absent field", () => {
    const reading = readLeadPayload({ name: "  ", cpf: "", phones: ["", "11987654321"] });
    expect(reading.fields.name).toBeNull();
    expect(reading.fields.cpf).toBeNull();
    expect(reading.fields.phones).toEqual(["11987654321"]);
  });

  it("reads a body that is not an object at all as a submission with nothing in it", () => {
    for (const raw of [null, "texto solto", 42, [], undefined]) {
      const reading = readLeadPayload(raw);
      expect(reading.fields.phones).toEqual([]);
      expect(reading.fields.emails).toEqual([]);
      expect(reading.fields.name).toBeNull();
    }
  });

  it("defaults the contract version when the payload omits it", () => {
    expect(readLeadPayload({}).fields.schema_version).toBe("v1");
  });
});

describe("buildInboundLead", () => {
  it("completes a reading with the identity only a connector knows", () => {
    const inbound = buildInboundLead(readLeadPayload({ name: "Maria" }), identity);

    expect(inbound.source).toBe("META_LEAD_ADS");
    expect(inbound.external_lead_id).toBe("lead-1");
    expect(inbound.name).toBe("Maria");
  });

  it("refuses an empty external_lead_id, which would deduplicate nothing", () => {
    expect(() =>
      buildInboundLead(readLeadPayload({}), { source: "LANDING_PAGE", external_lead_id: "" })
    ).toThrow();
  });
});
