import { describe, expect, it } from "vitest";
import type { LeadListRow } from "@marctco/db";
import { buildLeadRowViewModel, formatArrivedAt, formatInstallmentAmount } from "./row-view-model.js";

function row(overrides: Partial<LeadListRow> = {}): LeadListRow {
  return {
    opportunity_id: "11111111-1111-1111-1111-111111111111",
    person_id: "22222222-2222-2222-2222-222222222222",
    name: "Maria Silva",
    phones: ["+5511987654321"],
    emails: ["maria@exemplo.com"],
    financing_type: null,
    financial_institution: null,
    installment_amount: null,
    arrived_at: new Date("2026-08-11T12:00:00.000Z"),
    missing_phone: false,
    assigned_user_id: null,
    source: "META_LEAD_ADS",
    reviews: [],
    ...overrides
  };
}

describe("buildLeadRowViewModel", () => {
  it("prefers the phone over the e-mail for the contact column", () => {
    const model = buildLeadRowViewModel(row());
    expect(model.contact).toBe("+5511987654321");
  });

  it("falls back to e-mail, then to a dash, when there is no phone", () => {
    expect(buildLeadRowViewModel(row({ phones: [], emails: ["maria@exemplo.com"] })).contact).toBe(
      "maria@exemplo.com"
    );
    expect(buildLeadRowViewModel(row({ phones: [], emails: [] })).contact).toBe("—");
  });

  it("labels financing type, institution and origin in PT-BR, dashing what is absent", () => {
    const withData = buildLeadRowViewModel(
      row({ financing_type: "VEHICLE", financial_institution: "Banco X", source: "LANDING_PAGE" })
    );
    expect(withData.financingTypeLabel).toBe("Veículo");
    expect(withData.institutionLabel).toBe("Banco X");
    expect(withData.originLabel).toBe("Landing page");

    const withoutData = buildLeadRowViewModel(row({ source: null }));
    expect(withoutData.financingTypeLabel).toBe("—");
    expect(withoutData.institutionLabel).toBe("—");
    expect(withoutData.originLabel).toBe("—");
  });

  it("uses the same markersFor the card and comparison use — a lead with all three warnings", () => {
    const model = buildLeadRowViewModel(
      row({
        missing_phone: true,
        reviews: [
          { id: "a", type: "IDENTITY_CONFLICT" },
          { id: "b", type: "POSSIBLE_DUPLICATE" }
        ]
      })
    );
    expect(model.markers).toEqual(["MISSING_PHONE", "IDENTITY_CONFLICT", "POSSIBLE_DUPLICATE"]);
  });

  it("falls back to a placeholder name rather than showing an empty cell", () => {
    expect(buildLeadRowViewModel(row({ name: null })).name).toBe("Sem nome");
    expect(buildLeadRowViewModel(row({ name: "   " })).name).toBe("Sem nome");
  });
});

describe("formatArrivedAt", () => {
  it("renders DD/MM/YYYY HH:mm in the workspace's default timezone", () => {
    // 2026-08-11T12:00:00Z is 09:00 in America/Sao_Paulo (UTC-3, no DST).
    expect(formatArrivedAt(new Date("2026-08-11T12:00:00.000Z"))).toBe("11/08/2026 09:00");
  });
});

describe("formatInstallmentAmount", () => {
  it("renders the normalized decimal string as BRL currency", () => {
    expect(formatInstallmentAmount("1234.56")).toBe("R$ 1.234,56");
  });

  it("dashes a null or unparsable amount", () => {
    expect(formatInstallmentAmount(null)).toBe("—");
    expect(formatInstallmentAmount("not-a-number")).toBe("—");
  });
});
