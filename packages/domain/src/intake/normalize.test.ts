import { describe, expect, it } from "vitest";
import { buildInboundLead, readLeadPayload, type InboundLead } from "./inbound-lead.js";
import { normalize } from "./normalize.js";

function inbound(payload: Record<string, unknown>): InboundLead {
  return buildInboundLead(readLeadPayload(payload), {
    source: "META_LEAD_ADS",
    external_lead_id: "lead-1"
  });
}

describe("normalize", () => {
  it("carries the identity of the transmission through untouched", () => {
    const normalized = normalize(inbound({ name: "Maria" }));
    expect(normalized.source).toBe("META_LEAD_ADS");
    expect(normalized.external_lead_id).toBe("lead-1");
  });

  it("stores every phone in E.164, in the order received", () => {
    const normalized = normalize(inbound({ phones: ["(11) 98765-4321", "11 3333-4444"] }));
    expect(normalized.phones).toEqual(["+5511987654321", "+551133334444"]);
    expect(normalized.diagnostics).toEqual([]);
  });

  it("stores every e-mail in lowercase", () => {
    const normalized = normalize(inbound({ emails: ["Maria@Exemplo.COM", "outro@exemplo.com"] }));
    expect(normalized.emails).toEqual(["maria@exemplo.com", "outro@exemplo.com"]);
  });

  it("collapses the same contact written two different ways", () => {
    const normalized = normalize(
      inbound({
        phones: ["11987654321", "(11) 98765-4321", "+55 11 98765-4321"],
        emails: ["Maria@Exemplo.com", "maria@exemplo.com"]
      })
    );
    expect(normalized.phones).toEqual(["+5511987654321"]);
    expect(normalized.emails).toEqual(["maria@exemplo.com"]);
  });

  it("keeps the readable contacts and reports the ones it could not read", () => {
    const normalized = normalize(
      inbound({ phones: ["não tenho", "11987654321"], emails: ["sem email", "a@b.com"] })
    );
    expect(normalized.phones).toEqual(["+5511987654321"]);
    expect(normalized.emails).toEqual(["a@b.com"]);
    expect(normalized.diagnostics).toEqual([
      { field: "phones[0]", reason: "NOT_A_PHONE" },
      { field: "emails[0]", reason: "NOT_AN_EMAIL" }
    ]);
  });

  it("never puts a value inside a diagnostic", () => {
    const normalized = normalize(
      inbound({ phones: ["11 9 sem numero"], cpf: "529.982.247-26", emails: ["nao@tenho"] })
    );
    const serialized = JSON.stringify(normalized.diagnostics);
    expect(serialized).not.toContain("529");
    expect(serialized).not.toContain("nao@tenho");
    expect(serialized).not.toContain("sem numero");
  });

  it("keeps a valid CPF as digits and drops an invalid one, saying so", () => {
    expect(normalize(inbound({ cpf: "529.982.247-25" })).cpf).toBe("52998224725");

    const invalid = normalize(inbound({ cpf: "529.982.247-26" }));
    expect(invalid.cpf).toBeNull();
    expect(invalid.diagnostics).toEqual([{ field: "cpf", reason: "NOT_A_VALID_CPF" }]);
  });

  it("says nothing when a CPF simply did not arrive — the common case", () => {
    const normalized = normalize(inbound({ phones: ["11987654321"] }));
    expect(normalized.cpf).toBeNull();
    expect(normalized.diagnostics).toEqual([]);
  });

  it("turns the instalment into a decimal string and keeps the raw value beside it", () => {
    const normalized = normalize(inbound({ installment_amount: "R$ 1.234,56" }));
    expect(normalized.installment_amount).toBe("1234.56");
    expect(normalized.installment_amount_raw).toBe("R$ 1.234,56");
  });

  it("reports an instalment it could not read, without blocking the lead", () => {
    const normalized = normalize(inbound({ installment_amount: "não sei", phones: ["11987654321"] }));
    expect(normalized.installment_amount).toBeNull();
    expect(normalized.installment_amount_raw).toBe("não sei");
    expect(normalized.phones).toEqual(["+5511987654321"]);
    expect(normalized.diagnostics).toEqual([
      { field: "installment_amount", reason: "NOT_AN_AMOUNT" }
    ]);
  });

  it("reads the code value and the glossary's own PT-BR term for it", () => {
    expect(normalize(inbound({ financing_type: "veiculo" })).financing_type).toBe("VEHICLE");
    expect(normalize(inbound({ financing_type: "Veículo" })).financing_type).toBe("VEHICLE");
    expect(normalize(inbound({ financing_type: "IMÓVEL" })).financing_type).toBe("REAL_ESTATE");
    expect(normalize(inbound({ financing_type: "empréstimo pessoal" })).financing_type).toBe(
      "PERSONAL_LOAN"
    );
    expect(normalize(inbound({ financing_type: "OTHER" })).financing_type).toBe("OTHER");
  });

  it("reports a financing type outside the glossary instead of guessing at one", () => {
    // "Consignado" is a different product from an empréstimo pessoal to
    // everybody who sells either, and nothing in the docs says which one the
    // CRM should call it. Guessing here would be a product decision taken in a
    // lookup table.
    for (const word of ["consórcio de barco", "consignado", "carro"]) {
      const normalized = normalize(inbound({ financing_type: word }));
      expect(normalized.financing_type, word).toBeNull();
      expect(normalized.diagnostics).toEqual([
        { field: "financing_type", reason: "UNKNOWN_FINANCING_TYPE" }
      ]);
    }
  });

  it("reads the ISO instant and refuses the ambiguous date formats", () => {
    expect(normalize(inbound({ occurred_at: "2026-08-07T10:00:00.000Z" })).occurred_at).toEqual(
      new Date("2026-08-07T10:00:00.000Z")
    );

    // 03/04/26 is 3 April to whoever wrote it in Brazil and 4 March to whoever
    // wrote it in the United States, and the payload does not say which.
    const ambiguous = normalize(inbound({ occurred_at: "03/04/26" }));
    expect(ambiguous.occurred_at).toBeNull();
    expect(ambiguous.diagnostics).toEqual([{ field: "occurred_at", reason: "NOT_AN_INSTANT" }]);
  });

  it("passes attribution and extra answers through without interpreting them", () => {
    const normalized = normalize(
      inbound({
        campaign_id: "c1",
        campaign_name: "Revisional veículo",
        platform: "ig",
        is_organic: false,
        answers: { "Qual o banco?": "Banco X" }
      })
    );
    expect(normalized.attribution.campaign_id).toBe("c1");
    expect(normalized.attribution.campaign_name).toBe("Revisional veículo");
    expect(normalized.attribution.platform).toBe("ig");
    expect(normalized.attribution.is_organic).toBe(false);
    expect(normalized.answers).toEqual({ "Qual o banco?": "Banco X" });
  });

  it("produces an empty lead from an empty submission, without throwing", () => {
    const normalized = normalize(inbound({}));
    expect(normalized.phones).toEqual([]);
    expect(normalized.emails).toEqual([]);
    expect(normalized.cpf).toBeNull();
    expect(normalized.name).toBeNull();
    expect(normalized.diagnostics).toEqual([]);
  });

  it("is idempotent: normalizing normalized values changes nothing", () => {
    const once = normalize(
      inbound({ phones: ["(11) 98765-4321"], emails: ["Maria@Exemplo.com"], cpf: "529.982.247-25" })
    );
    const twice = normalize(
      inbound({ phones: [...once.phones], emails: [...once.emails], cpf: once.cpf ?? "" })
    );
    expect(twice.phones).toEqual(once.phones);
    expect(twice.emails).toEqual(once.emails);
    expect(twice.cpf).toEqual(once.cpf);
  });
});
