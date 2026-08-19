import { describe, expect, it } from "vitest";
import type { LeadListRow } from "@marctco/db";
import {
  DEFAULT_FIRST_CONTACT_SLA_MINUTES,
  DEFAULT_STAGNATION_DAYS,
  type ResolvedWorkspaceSettings
} from "@marctco/domain";
import {
  buildLeadRowViewModel,
  formatArrivedAt,
  formatInstallmentAmount,
  formatWaitDuration,
  waitCaption
} from "./row-view-model.js";

const settings: ResolvedWorkspaceSettings = {
  first_contact_sla_minutes: DEFAULT_FIRST_CONTACT_SLA_MINUTES,
  stagnation_days: DEFAULT_STAGNATION_DAYS
};
const arrived_at = new Date("2026-08-11T12:00:00.000Z");
const nowInside = new Date(arrived_at.getTime() + 30 * 60_000);
const nowBreached = new Date(arrived_at.getTime() + 180 * 60_000);
const clockInside = { settings, now: nowInside };
const clockBreached = { settings, now: nowBreached };

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
    campaign_id: null,
    campaign_name: null,
    form_id: null,
    form_name: null,
    arrived_at,
    first_contact_at: null,
    closed_at: null,
    last_movement_at: null,
    status: "OPEN",
    missing_phone: false,
    assigned_user_id: null,
    assigned_user_name: null,
    source: "META_LEAD_ADS",
    reviews: [],
    ...overrides
  };
}

describe("buildLeadRowViewModel", () => {
  it("prefers the phone over the e-mail for the contact column", () => {
    const model = buildLeadRowViewModel(row(), clockInside);
    expect(model.contact).toBe("+5511987654321");
  });

  it("falls back to e-mail, then to a dash, when there is no phone", () => {
    expect(buildLeadRowViewModel(row({ phones: [], emails: ["maria@exemplo.com"] }), clockInside).contact).toBe(
      "maria@exemplo.com"
    );
    expect(buildLeadRowViewModel(row({ phones: [], emails: [] }), clockInside).contact).toBe("—");
  });

  it("labels financing type, institution and origin in PT-BR, dashing what is absent", () => {
    const withData = buildLeadRowViewModel(
      row({ financing_type: "VEHICLE", financial_institution: "Banco X", source: "LANDING_PAGE" }),
      clockInside
    );
    expect(withData.financingTypeLabel).toBe("Veículo");
    expect(withData.institutionLabel).toBe("Banco X");
    expect(withData.originLabel).toBe("Landing page");

    const withoutData = buildLeadRowViewModel(row({ source: null }), clockInside);
    expect(withoutData.financingTypeLabel).toBe("—");
    expect(withoutData.institutionLabel).toBe("—");
    expect(withoutData.originLabel).toBe("—");
  });

  it("labels campaign and form by the readable name, dashing what is absent", () => {
    const withData = buildLeadRowViewModel(
      row({
        campaign_id: "23851234567890123",
        campaign_name: "Revisional veículo",
        form_id: "form-9",
        form_name: "Simulação revisional"
      }),
      clockInside
    );
    expect(withData.campaignLabel).toBe("Revisional veículo");
    expect(withData.formLabel).toBe("Simulação revisional");

    const withoutData = buildLeadRowViewModel(row(), clockInside);
    expect(withoutData.campaignLabel).toBe("—");
    expect(withoutData.formLabel).toBe("—");
  });

  it("uses the same markersFor the card and comparison use — a lead with four warnings", () => {
    const model = buildLeadRowViewModel(
      row({
        missing_phone: true,
        reviews: [
          { id: "a", type: "IDENTITY_CONFLICT" },
          { id: "b", type: "POSSIBLE_DUPLICATE" }
        ]
      }),
      clockBreached
    );
    expect(model.markers).toEqual([
      "MISSING_PHONE",
      "IDENTITY_CONFLICT",
      "POSSIBLE_DUPLICATE",
      "FIRST_CONTACT_SLA_BREACHED"
    ]);
  });

  it("adds the stagnant marker when the lead has been still longer than the limit", () => {
    const nineDaysAgo = new Date(nowInside.getTime() - 9 * 24 * 60 * 60 * 1000);
    const model = buildLeadRowViewModel(
      row({ arrived_at: nineDaysAgo, last_movement_at: null }),
      clockInside
    );
    expect(model.markers).toEqual(["FIRST_CONTACT_SLA_BREACHED", "STAGNANT"]);
  });

  it("shows the wait with the same duration the SLA function decided", () => {
    const model = buildLeadRowViewModel(row(), clockInside);
    expect(model.waitLabel).toBe("30 min");
    expect(model.sla.state).toBe("PENDING");
  });

  it("falls back to a placeholder name rather than showing an empty cell", () => {
    expect(buildLeadRowViewModel(row({ name: null }), clockInside).name).toBe("Sem nome");
    expect(buildLeadRowViewModel(row({ name: "   " }), clockInside).name).toBe("Sem nome");
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

describe("formatWaitDuration", () => {
  it("renders compact PT-BR waits for the table's tabular column", () => {
    expect(formatWaitDuration(30_000)).toBe("< 1 min");
    expect(formatWaitDuration(45 * 60_000)).toBe("45 min");
    expect(formatWaitDuration(90 * 60_000)).toBe("1h 30 min");
    expect(formatWaitDuration(2 * 60 * 60_000)).toBe("2h");
    expect(formatWaitDuration(26 * 60 * 60_000)).toBe("1d 2h");
  });
});

describe("waitCaption", () => {
  it("says waiting while there is no first contact on an open lead", () => {
    expect(
      waitCaption({
        sla: { state: "PENDING", duration_ms: 45 * 60_000 },
        first_contact_at: null,
        status: "OPEN"
      })
    ).toBe("Esperando há 45 min");
  });

  it("says first contact once there is attendance", () => {
    expect(
      waitCaption({
        sla: { state: "MET", duration_ms: 45 * 60_000 },
        first_contact_at: new Date(),
        status: "OPEN"
      })
    ).toBe("Primeiro contato em 45 min");
  });

  it("does not say waiting on a closed lead that never had contact", () => {
    expect(
      waitCaption({
        sla: { state: "PENDING", duration_ms: 30 * 60_000 },
        first_contact_at: null,
        status: "LOST"
      })
    ).toBe("Sem contato em 30 min");
  });
});
