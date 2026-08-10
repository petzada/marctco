import { describe, expect, it } from "vitest";
import { buildInboundLead, readLeadPayload, type InboundLead } from "./inbound-lead.js";
import {
  decideIntake,
  planSubmission,
  reusedPersonId,
  type DecideIntakeInput,
  type IntakeDestination,
  type IntakePlan,
  type SubmissionInsert
} from "./intake-plan.js";
import { normalize, type NormalizedLead } from "./normalize.js";
import type { PersonDecision } from "./person-identity.js";

const RECEIVED_AT = new Date("2026-08-08T12:00:00.000Z");
const RELEASED_AT = new Date("2026-08-11T09:30:00.000Z");
const SUBMISSION_ID = "0d1f0c1e-0000-4000-8000-000000000001";
const EVENT_ID = "0d1f0c1e-0000-4000-8000-000000000002";
const PERSON_ID = "0d1f0c1e-0000-4000-8000-000000000003";
const OTHER_PERSON_ID = "0d1f0c1e-0000-4000-8000-000000000004";
const OPPORTUNITY_ID = "0d1f0c1e-0000-4000-8000-000000000005";

const destination: IntakeDestination = {
  pipeline_id: "0d1f0c1e-0000-4000-8000-0000000000a1",
  entry_stage_id: "0d1f0c1e-0000-4000-8000-0000000000a2"
};

function inbound(payload: Record<string, unknown>): InboundLead {
  return buildInboundLead(readLeadPayload(payload), {
    source: "META_LEAD_ADS",
    external_lead_id: "meta-1"
  });
}

function normalized(payload: Record<string, unknown>): NormalizedLead {
  return normalize(inbound(payload));
}

const inserted: SubmissionInsert = { kind: "INSERTED", lead_submission_id: SUBMISSION_ID };

function decide(overrides: Partial<DecideIntakeInput> = {}): IntakePlan {
  const lead = overrides.normalized ?? normalized({ name: "x", phone: "11987654321" });
  return decideIntake({
    normalized: lead,
    submission: inserted,
    person: { kind: "NEW_PERSON", contacts: contactsOf(lead) },
    destination,
    open_opportunity_ids: [],
    integration_event_id: EVENT_ID,
    now: RECEIVED_AT,
    ...overrides
  });
}

function contactsOf(lead: NormalizedLead) {
  return { name: lead.name, phones: lead.phones, emails: lead.emails, cpf: lead.cpf };
}

/** Narrows to the variant a test is about, and fails the test rather than the type. */
function expectPlan<Kind extends IntakePlan["kind"]>(
  plan: IntakePlan,
  kind: Kind
): Extract<IntakePlan, { kind: Kind }> {
  expect(plan.kind).toBe(kind);
  return plan as Extract<IntakePlan, { kind: Kind }>;
}

describe("reusedPersonId", () => {
  it("answers with the Pessoa to read open cards from, and null when there is none yet", () => {
    const contacts = contactsOf(normalized({ phone: "11987654321" }));

    expect(reusedPersonId({ kind: "REUSE_PERSON", person_id: PERSON_ID, contacts })).toBe(
      PERSON_ID
    );
    expect(reusedPersonId({ kind: "NEW_PERSON", contacts })).toBeNull();
    expect(
      reusedPersonId({
        kind: "NEW_PERSON_WITH_IDENTITY_CONFLICT",
        contacts,
        candidate_person_ids: [PERSON_ID]
      })
    ).toBeNull();
    expect(reusedPersonId({ kind: "NO_CONTACT" })).toBeNull();
  });
});

describe("planSubmission", () => {
  it("is the idempotency key and nothing else: source plus external_lead_id", () => {
    expect(planSubmission(inbound({ name: "Fulana", phone: "11987654321" }))).toEqual({
      source: "META_LEAD_ADS",
      external_lead_id: "meta-1"
    });
  });
});

describe("decideIntake: the unambiguous lead", () => {
  it("puts a new Pessoa in the ENTRY stage of the destination pipeline, open and commercial", () => {
    const plan = expectPlan(decide(), "NEW_OPPORTUNITY");

    expect(plan).toMatchObject({
      lead_submission_id: SUBMISSION_ID,
      integration_event_id: EVENT_ID,
      person: { kind: "CREATE" },
      pipeline_id: destination.pipeline_id,
      stage_id: destination.entry_stage_id,
      missing_phone: false,
      reviews: []
    });
  });

  it("reuses the Pessoa the identity rule recognised, without a review", () => {
    const lead = normalized({ name: "Maria", phone: "11987654321" });
    const person: PersonDecision = {
      kind: "REUSE_PERSON",
      person_id: PERSON_ID,
      contacts: contactsOf(lead)
    };

    const plan = expectPlan(decide({ normalized: lead, person }), "NEW_OPPORTUNITY");
    expect(plan.person).toEqual({ kind: "REUSE", person_id: PERSON_ID });
    expect(plan.reviews).toEqual([]);
  });

  it("carries the submission's whole contact set, never a delta", () => {
    const lead = normalized({
      name: "Maria",
      phones: ["11987654321", "1133334444"],
      emails: ["Maria@Exemplo.com"],
      cpf: "529.982.247-25"
    });

    const plan = expectPlan(
      decide({
        normalized: lead,
        person: { kind: "REUSE_PERSON", person_id: PERSON_ID, contacts: contactsOf(lead) }
      }),
      "NEW_OPPORTUNITY"
    );

    expect(plan.contacts).toEqual({
      name: "Maria",
      phones: ["+5511987654321", "+551133334444"],
      emails: ["maria@exemplo.com"],
      cpf: "52998224725"
    });
  });

  it("keeps financing data optional and never lets it choose the pipeline", () => {
    const bare = expectPlan(decide(), "NEW_OPPORTUNITY");
    expect(bare).toMatchObject({
      financing_type: null,
      financial_institution: null,
      installment_amount: null,
      pipeline_id: destination.pipeline_id
    });

    const financed = expectPlan(
      decide({
        normalized: normalized({
          phone: "11987654321",
          financing_type: "imovel",
          financial_institution: "Banco X",
          installment_amount: "1.234,56"
        })
      }),
      "NEW_OPPORTUNITY"
    );
    expect(financed).toMatchObject({
      financing_type: "REAL_ESTATE",
      financial_institution: "Banco X",
      installment_amount: "1234.56",
      // Same destination as the lead with no financing data at all: the
      // classification never selects a funnel, in any hypothesis (ADR-0007).
      pipeline_id: destination.pipeline_id
    });
  });

  it("has nowhere to put a responsible or a status — assignment is Fase 2", () => {
    const plan = expectPlan(decide(), "NEW_OPPORTUNITY");
    expect(plan).not.toHaveProperty("assigned_user_id");
    expect(plan).not.toHaveProperty("status");
  });
});

describe("decideIntake: arrived_at is an argument, and the clock is never read inside", () => {
  it("shows direct receipt and quarantine release side by side as the same argument", () => {
    const direct = expectPlan(decide({ now: RECEIVED_AT }), "NEW_OPPORTUNITY");
    // The very same function with a different `now`. The divergent arrived_at
    // of ADR-0007 §Quarentena stops being an exception hidden inside a second
    // path and becomes one argument with another value (ADR-0017).
    const released = expectPlan(
      decide({
        submission: {
          kind: "DUPLICATE",
          lead_submission_id: SUBMISSION_ID,
          opportunity_id: null
        },
        now: RELEASED_AT
      }),
      "NEW_OPPORTUNITY"
    );

    expect([direct.arrived_at, released.arrived_at]).toEqual([RECEIVED_AT, RELEASED_AT]);
  });

  it("is deterministic: the same input decided twice gives the same instant", () => {
    expect(decide()).toEqual(decide());
  });
});

describe("decideIntake: the lead that carries a pendency", () => {
  it("creates the Opportunity and marks the identity conflict — never holds it", () => {
    const lead = normalized({ name: "Maria", phone: "11987654321", cpf: "529.982.247-25" });
    const plan = expectPlan(
      decide({
        normalized: lead,
        person: {
          kind: "NEW_PERSON_WITH_IDENTITY_CONFLICT",
          contacts: contactsOf(lead),
          candidate_person_ids: [PERSON_ID, OTHER_PERSON_ID]
        }
      }),
      "NEW_OPPORTUNITY"
    );

    expect(plan.person).toEqual({ kind: "CREATE" });
    expect(plan.reviews).toEqual([
      { type: "IDENTITY_CONFLICT", candidate_person_ids: [PERSON_ID, OTHER_PERSON_ID] }
    ]);
  });

  it("links a second open Opportunity of the same Pessoa, with no financing data at all", () => {
    // The most common case of all, and precisely the one where two attendants
    // would call the same client with no warning (ADR-0007 §Mecanismo 2).
    const lead = normalized({ name: "Maria", phone: "11987654321" });
    const plan = expectPlan(
      decide({
        normalized: lead,
        person: { kind: "REUSE_PERSON", person_id: PERSON_ID, contacts: contactsOf(lead) },
        open_opportunity_ids: [OPPORTUNITY_ID]
      }),
      "NEW_OPPORTUNITY"
    );

    expect(plan.reviews).toEqual([
      { type: "POSSIBLE_DUPLICATE", related_opportunity_id: OPPORTUNITY_ID }
    ]);
  });

  it("links every open Opportunity the Pessoa already has", () => {
    const lead = normalized({ phone: "11987654321" });
    const plan = expectPlan(
      decide({
        normalized: lead,
        person: { kind: "REUSE_PERSON", person_id: PERSON_ID, contacts: contactsOf(lead) },
        open_opportunity_ids: [OPPORTUNITY_ID, OTHER_PERSON_ID]
      }),
      "NEW_OPPORTUNITY"
    );

    expect(plan.reviews.map((review) => review.type)).toEqual([
      "POSSIBLE_DUPLICATE",
      "POSSIBLE_DUPLICATE"
    ]);
  });

  it("marks a lead that brought an e-mail and no phone", () => {
    const plan = expectPlan(
      decide({ normalized: normalized({ name: "Maria", email: "maria@exemplo.com" }) }),
      "NEW_OPPORTUNITY"
    );

    expect(plan.missing_phone).toBe(true);
  });

  it("does not mark a lead that merely lacks a CPF", () => {
    const plan = expectPlan(decide(), "NEW_OPPORTUNITY");
    expect(plan.missing_phone).toBe(false);
  });
});

describe("decideIntake: no contact at all", () => {
  it("quarantines, with no Pessoa and no Opportunity to be found in the plan", () => {
    const plan = expectPlan(
      decide({
        normalized: normalized({ name: "Sem contato" }),
        person: { kind: "NO_CONTACT" }
      }),
      "QUARANTINE"
    );

    expect(plan).toEqual({
      kind: "QUARANTINE",
      lead_submission_id: SUBMISSION_ID,
      integration_event_id: EVENT_ID
    });
  });

  it("quarantines even when a valid CPF arrived — a CPF identifies, nobody is called on it", () => {
    const plan = decide({
      normalized: normalized({ name: "Sem contato", cpf: "529.982.247-25" }),
      person: { kind: "NO_CONTACT" }
    });

    expect(plan.kind).toBe("QUARANTINE");
  });

  it("cannot turn an empty release into a Pessoa or an Opportunity", () => {
    const plan = expectPlan(
      decide({
        normalized: normalized({ name: "Ainda sem contato" }),
        submission: {
          kind: "DUPLICATE",
          lead_submission_id: SUBMISSION_ID,
          opportunity_id: null
        },
        person: { kind: "NO_CONTACT" },
        now: RELEASED_AT
      }),
      "QUARANTINE"
    );

    expect(plan).not.toHaveProperty("person");
    expect(plan).not.toHaveProperty("arrived_at");
  });
});

describe("decideIntake: retransmission is inert to the funnel", () => {
  const duplicate: SubmissionInsert = {
    kind: "DUPLICATE",
    lead_submission_id: SUBMISSION_ID,
    opportunity_id: OPPORTUNITY_ID
  };

  it("points the submission at the new transmission and stops there", () => {
    const plan = expectPlan(decide({ submission: duplicate }), "RETRANSMISSION");

    expect(plan).toEqual({
      kind: "RETRANSMISSION",
      lead_submission_id: SUBMISSION_ID,
      opportunity_id: OPPORTUNITY_ID,
      integration_event_id: EVENT_ID
    });
  });

  it("has no field for stage, responsible, status or arrived_at — the bug has nowhere to live", () => {
    const plan = expectPlan(decide({ submission: duplicate }), "RETRANSMISSION");

    for (const field of ["stage_id", "pipeline_id", "assigned_user_id", "status", "arrived_at"]) {
      expect(plan).not.toHaveProperty(field);
    }
  });

  it("stays inert even when the resubmission would have carried a pendency", () => {
    const lead = normalized({ name: "Maria", phone: "11987654321" });
    const plan = decide({
      submission: duplicate,
      normalized: lead,
      person: {
        kind: "NEW_PERSON_WITH_IDENTITY_CONFLICT",
        contacts: contactsOf(lead),
        candidate_person_ids: [PERSON_ID]
      },
      open_opportunity_ids: [OPPORTUNITY_ID]
    });

    expect(plan).toEqual({
      kind: "RETRANSMISSION",
      lead_submission_id: SUBMISSION_ID,
      opportunity_id: OPPORTUNITY_ID,
      integration_event_id: EVENT_ID
    });
  });

  it("finishes a submission whose Opportunity was never written, instead of going inert over nothing", () => {
    // The submission row committed and the plan that followed it did not. A
    // retransmission has a funnel to protect; this has none — going inert here
    // would swallow the lead permanently, in the one state where "duplicate"
    // and "already in the funnel" are not the same fact.
    const plan = expectPlan(
      decide({
        submission: {
          kind: "DUPLICATE",
          lead_submission_id: SUBMISSION_ID,
          opportunity_id: null
        }
      }),
      "NEW_OPPORTUNITY"
    );

    expect(plan.lead_submission_id).toBe(SUBMISSION_ID);
  });

  it("re-quarantines a resubmitted quarantined envio rather than reviving it", () => {
    const plan = decide({
      submission: { kind: "DUPLICATE", lead_submission_id: SUBMISSION_ID, opportunity_id: null },
      normalized: normalized({ name: "Sem contato" }),
      person: { kind: "NO_CONTACT" }
    });

    expect(plan.kind).toBe("QUARANTINE");
  });
});
