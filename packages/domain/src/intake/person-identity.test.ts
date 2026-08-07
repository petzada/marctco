import { describe, expect, it } from "vitest";
import { buildInboundLead, readLeadPayload } from "./inbound-lead.js";
import { normalize, type NormalizedLead } from "./normalize.js";
import { decidePersonIdentity, type PersonCandidate } from "./person-identity.js";

const MARIA_CPF = "52998224725";
const OTHER_CPF = "11144477735";
const PERSON_A = "11111111-1111-4111-8111-111111111111";
const PERSON_B = "22222222-2222-4222-8222-222222222222";

function normalizedLead(payload: Record<string, unknown>): NormalizedLead {
  return normalize(
    buildInboundLead(readLeadPayload(payload), {
      source: "META_LEAD_ADS",
      external_lead_id: "lead-1"
    })
  );
}

function candidate(
  person_id: string,
  matched: Partial<PersonCandidate["matched"]>,
  cpf: string | null = null
): PersonCandidate {
  return {
    person_id,
    cpf,
    matched: { cpf: false, phone: false, email: false, ...matched }
  };
}

describe("decidePersonIdentity", () => {
  it("creates a Pessoa when nothing matched", () => {
    const decision = decidePersonIdentity({
      normalized: normalizedLead({ name: "Maria", phone: "11987654321" }),
      candidates: []
    });

    expect(decision).toEqual({
      kind: "NEW_PERSON",
      contacts: {
        name: "Maria",
        phones: ["+5511987654321"],
        emails: [],
        cpf: null
      }
    });
  });

  it("creates no Pessoa when the submission carries no phone and no e-mail", () => {
    const decision = decidePersonIdentity({
      normalized: normalizedLead({ name: "Maria", campaign_id: "c1" }),
      candidates: []
    });
    expect(decision).toEqual({ kind: "NO_CONTACT" });
  });

  it("creates no Pessoa on a CPF alone — it identifies, but nobody can be called on it", () => {
    const decision = decidePersonIdentity({
      normalized: normalizedLead({ name: "Maria", cpf: "529.982.247-25" }),
      candidates: []
    });
    expect(decision).toEqual({ kind: "NO_CONTACT" });
  });

  it("recognises the same Pessoa from a known CPF even when the phone is new", () => {
    // The heart of the ticket: the client attended in March who comes back in
    // September on a different number must not become a second Pessoa.
    const decision = decidePersonIdentity({
      normalized: normalizedLead({ cpf: "529.982.247-25", phone: "11 3333-4444" }),
      candidates: [candidate(PERSON_A, { cpf: true }, MARIA_CPF)]
    });

    expect(decision).toMatchObject({ kind: "REUSE_PERSON", person_id: PERSON_A });
  });

  it("recognises the same Pessoa from a phone when nothing contradicts it", () => {
    const decision = decidePersonIdentity({
      normalized: normalizedLead({ phone: "11987654321" }),
      candidates: [candidate(PERSON_A, { phone: true })]
    });

    expect(decision).toMatchObject({ kind: "REUSE_PERSON", person_id: PERSON_A });
  });

  it("still reuses when the submission brings a CPF the known Pessoa did not have", () => {
    const decision = decidePersonIdentity({
      normalized: normalizedLead({ phone: "11987654321", cpf: "529.982.247-25" }),
      candidates: [candidate(PERSON_A, { phone: true }, null)]
    });

    expect(decision).toMatchObject({ kind: "REUSE_PERSON", person_id: PERSON_A });
  });

  it("refuses to reuse when the phone points at somebody with a different CPF", () => {
    // A shared or recycled number. The phone stops identifying the moment a
    // stronger key contradicts it.
    const decision = decidePersonIdentity({
      normalized: normalizedLead({ phone: "11987654321", cpf: "529.982.247-25" }),
      candidates: [candidate(PERSON_A, { phone: true }, OTHER_CPF)]
    });

    expect(decision).toEqual({
      kind: "NEW_PERSON_WITH_IDENTITY_CONFLICT",
      contacts: {
        name: null,
        phones: ["+5511987654321"],
        emails: [],
        cpf: MARIA_CPF
      },
      candidate_person_ids: [PERSON_A]
    });
  });

  it("never fuses records on an e-mail alone, and marks the near miss", () => {
    const decision = decidePersonIdentity({
      normalized: normalizedLead({ email: "contato@empresa.com.br" }),
      candidates: [candidate(PERSON_A, { email: true })]
    });

    expect(decision).toMatchObject({
      kind: "NEW_PERSON_WITH_IDENTITY_CONFLICT",
      candidate_person_ids: [PERSON_A]
    });
  });

  it("creates a new Pessoa with the submission's contacts when keys point at different Pessoas", () => {
    const decision = decidePersonIdentity({
      normalized: normalizedLead({
        name: "Maria",
        cpf: "529.982.247-25",
        phone: "11987654321",
        email: "maria@exemplo.com"
      }),
      candidates: [candidate(PERSON_A, { cpf: true }, MARIA_CPF), candidate(PERSON_B, { phone: true })]
    });

    expect(decision).toEqual({
      kind: "NEW_PERSON_WITH_IDENTITY_CONFLICT",
      contacts: {
        name: "Maria",
        phones: ["+5511987654321"],
        emails: ["maria@exemplo.com"],
        cpf: MARIA_CPF
      },
      candidate_person_ids: [PERSON_A, PERSON_B]
    });
  });

  it("lets no key win by fixed priority — not even the CPF", () => {
    const decision = decidePersonIdentity({
      normalized: normalizedLead({ cpf: "529.982.247-25", phone: "11987654321" }),
      candidates: [candidate(PERSON_A, { cpf: true }, MARIA_CPF), candidate(PERSON_B, { phone: true })]
    });

    expect(decision.kind).toBe("NEW_PERSON_WITH_IDENTITY_CONFLICT");
    if (decision.kind !== "NEW_PERSON_WITH_IDENTITY_CONFLICT") {
      throw new Error("unreachable");
    }
    // Both candidates are recorded, and neither is linked to.
    expect(decision.candidate_person_ids).toEqual([PERSON_A, PERSON_B]);
    expect(decision).not.toHaveProperty("person_id");
  });

  it("carries every contact of the submission into the new Pessoa under conflict", () => {
    const decision = decidePersonIdentity({
      normalized: normalizedLead({
        phones: ["11987654321", "11 3333-4444"],
        emails: ["a@exemplo.com", "b@exemplo.com"]
      }),
      candidates: [candidate(PERSON_A, { phone: true }), candidate(PERSON_B, { email: true })]
    });

    expect(decision).toMatchObject({
      kind: "NEW_PERSON_WITH_IDENTITY_CONFLICT",
      contacts: {
        phones: ["+5511987654321", "+551133334444"],
        emails: ["a@exemplo.com", "b@exemplo.com"]
      }
    });
  });

  it("reuses when one Pessoa answers to the phone and the e-mail together", () => {
    const decision = decidePersonIdentity({
      normalized: normalizedLead({ phone: "11987654321", email: "maria@exemplo.com" }),
      candidates: [candidate(PERSON_A, { phone: true, email: true })]
    });

    expect(decision).toMatchObject({ kind: "REUSE_PERSON", person_id: PERSON_A });
  });

  it("ignores a candidate row that matched nothing", () => {
    const decision = decidePersonIdentity({
      normalized: normalizedLead({ phone: "11987654321" }),
      candidates: [candidate(PERSON_A, {})]
    });

    expect(decision.kind).toBe("NEW_PERSON");
  });

  it("hands the write side the full contact set, never a delta", () => {
    // No earlier contact is overwritten: the write adds what is new and the
    // decision has no way to express a removal.
    const decision = decidePersonIdentity({
      normalized: normalizedLead({ phones: ["11987654321", "11 3333-4444"] }),
      candidates: [candidate(PERSON_A, { phone: true })]
    });

    expect(decision).toMatchObject({
      kind: "REUSE_PERSON",
      contacts: { phones: ["+5511987654321", "+551133334444"] }
    });
  });
});
