import { describe, expect, it } from "vitest";
import { buildInboundLead, readLeadPayload } from "./inbound-lead.js";
import { normalize, type NormalizedLead } from "./normalize.js";
import { lookupValuesOfKind, planPersonLookup } from "./person-lookup.js";

function normalizedLead(payload: Record<string, unknown>): NormalizedLead {
  return normalize(
    buildInboundLead(readLeadPayload(payload), {
      source: "META_LEAD_ADS",
      external_lead_id: "lead-1"
    })
  );
}

describe("planPersonLookup", () => {
  it("asks for the CPF as a strong key when one survived validation", () => {
    const plan = planPersonLookup(normalizedLead({ cpf: "529.982.247-25" }));
    expect(plan.keys).toEqual([{ kind: "CPF", value: "52998224725", strength: "STRONG" }]);
  });

  it("does not ask for a CPF that failed its check digits", () => {
    // A key that is not one would be searched at full strength and could land
    // on somebody else's real record.
    const plan = planPersonLookup(normalizedLead({ cpf: "529.982.247-26", phone: "11987654321" }));
    expect(lookupValuesOfKind(plan, "CPF")).toEqual([]);
  });

  it("asks for the phone as a moderate key", () => {
    const plan = planPersonLookup(normalizedLead({ phone: "(11) 98765-4321" }));
    expect(plan.keys).toEqual([{ kind: "PHONE", value: "+5511987654321", strength: "MODERATE" }]);
  });

  it("asks for the e-mail as a weak key", () => {
    const plan = planPersonLookup(normalizedLead({ email: "Maria@Exemplo.com" }));
    expect(plan.keys).toEqual([{ kind: "EMAIL", value: "maria@exemplo.com", strength: "WEAK" }]);
  });

  it("asks for every phone and every e-mail, not just the first", () => {
    // The client attended in March on the landline who returns in September
    // from the mobile is only found by a lookup that carries both.
    const plan = planPersonLookup(
      normalizedLead({
        phones: ["11987654321", "11 3333-4444"],
        emails: ["a@exemplo.com", "b@exemplo.com"]
      })
    );
    expect(lookupValuesOfKind(plan, "PHONE")).toEqual(["+5511987654321", "+551133334444"]);
    expect(lookupValuesOfKind(plan, "EMAIL")).toEqual(["a@exemplo.com", "b@exemplo.com"]);
  });

  it("asks for all three kinds when a submission carries all three", () => {
    const plan = planPersonLookup(
      normalizedLead({ cpf: "529.982.247-25", phone: "11987654321", email: "maria@exemplo.com" })
    );
    expect(plan.keys).toEqual([
      { kind: "CPF", value: "52998224725", strength: "STRONG" },
      { kind: "PHONE", value: "+5511987654321", strength: "MODERATE" },
      { kind: "EMAIL", value: "maria@exemplo.com", strength: "WEAK" }
    ]);
  });

  it("asks for nothing when nothing normalizable arrived", () => {
    expect(planPersonLookup(normalizedLead({ name: "Maria" })).keys).toEqual([]);
    expect(planPersonLookup(normalizedLead({ phone: "não tenho" })).keys).toEqual([]);
  });

  it("plans only over normalized values, never the raw ones", () => {
    const plan = planPersonLookup(
      normalizedLead({ phone: "(11) 98765-4321", email: "MARIA@EXEMPLO.COM", cpf: "529.982.247-25" })
    );
    expect(plan.keys.map((key) => key.value)).toEqual([
      "52998224725",
      "+5511987654321",
      "maria@exemplo.com"
    ]);
  });
});
