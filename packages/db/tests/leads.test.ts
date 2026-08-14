import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createUserContextFromResolvedMembership } from "../src/access-context.js";
import {
  assignLead,
  assignLeads,
  LeadAssignmentError,
  countLeadsByMarker,
  countNewLeads,
  getLead,
  listLeads,
  reassignLead,
  reassignLeads,
  resolveIdentityConflict,
  updateLeadDetails
} from "../src/leads.js";

const database_url = process.env.DATABASE_URL;
if (!database_url) {
  throw new Error("DATABASE_URL is required for database tests");
}

function appRoleUrl(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set("options", "-c role=marctco_app");
  return parsed.toString();
}

const seeder = new PrismaClient({ datasources: { db: { url: database_url } } });
const app = new PrismaClient({ datasources: { db: { url: appRoleUrl(database_url) } } });

const workspace = randomUUID();
const neighbour_workspace = randomUUID();
const pipeline = randomUUID();
const entry_stage = randomUUID();
const neighbour_pipeline = randomUUID();
const neighbour_entry_stage = randomUUID();
const attendant_user = randomUUID();
const other_attendant_user = randomUUID();
const manager_user = randomUUID();
const supervisor_user = randomUUID();
const untagged_supervisor_user = randomUUID();
const same_team_user = randomUUID();
const other_team_user = randomUUID();
const other_manager_user = randomUUID();
const detached_user = randomUUID();

const manager_context = createUserContextFromResolvedMembership({
  workspace_id: workspace,
  user_id: manager_user,
  role: "MANAGER"
});
const attendant_context = createUserContextFromResolvedMembership({
  workspace_id: workspace,
  user_id: attendant_user,
  role: "ATTENDANT"
});
const supervisor_context = createUserContextFromResolvedMembership({
  workspace_id: workspace,
  user_id: supervisor_user,
  role: "SUPERVISOR"
});
const untagged_supervisor_context = createUserContextFromResolvedMembership({
  workspace_id: workspace,
  user_id: untagged_supervisor_user,
  role: "SUPERVISOR"
});

let arrival_clock = new Date("2026-08-11T12:00:00.000Z").getTime();
function nextArrival(): Date {
  arrival_clock += 1000;
  return new Date(arrival_clock);
}

interface SeedOpportunityOptions {
  readonly workspace_id?: string;
  readonly person_id?: string;
  readonly name?: string;
  readonly phones?: readonly string[];
  readonly emails?: readonly string[];
  readonly missing_phone?: boolean;
  readonly assigned_user_id?: string | null;
  readonly financing_type?: "VEHICLE" | "REAL_ESTATE" | "PERSONAL_LOAN" | "OTHER" | null;
  readonly financial_institution?: string | null;
  readonly installment_amount?: string | null;
  readonly campaign_id?: string | null;
  readonly campaign_name?: string | null;
  readonly form_id?: string | null;
  readonly form_name?: string | null;
  readonly arrived_at?: Date;
  readonly merged_into_opportunity_id?: string | null;
  readonly source?: "META_LEAD_ADS" | "GOOGLE_LEAD_FORM" | "LANDING_PAGE";
}

async function seedOpportunity(options: SeedOpportunityOptions = {}): Promise<{
  opportunity_id: string;
  person_id: string;
}> {
  const workspace_id = options.workspace_id ?? workspace;
  const person_id =
    options.person_id ??
    (
      await seeder.person.create({
        data: { workspace_id, name: options.name ?? "Lead de teste" }
      })
    ).id;

  if (options.phones) {
    for (const phone_e164 of options.phones) {
      await seeder.personPhone.create({ data: { workspace_id, person_id, phone_e164 } });
    }
  }
  if (options.emails) {
    for (const email of options.emails) {
      await seeder.personEmail.create({ data: { workspace_id, person_id, email } });
    }
  }

  const arrived_at = options.arrived_at ?? nextArrival();
  const opportunity = await seeder.opportunity.create({
    data: {
      workspace_id,
      person_id,
      pipeline_id: workspace_id === workspace ? pipeline : neighbour_pipeline,
      stage_id: workspace_id === workspace ? entry_stage : neighbour_entry_stage,
      area: "COMMERCIAL",
      status: "OPEN",
      arrived_at,
      missing_phone: options.missing_phone ?? false,
      assigned_user_id: options.assigned_user_id ?? null,
      financing_type: options.financing_type ?? null,
      financial_institution: options.financial_institution ?? null,
      installment_amount: options.installment_amount ?? null,
      campaign_id: options.campaign_id ?? null,
      campaign_name: options.campaign_name ?? null,
      form_id: options.form_id ?? null,
      form_name: options.form_name ?? null,
      merged_into_opportunity_id: options.merged_into_opportunity_id ?? null
    }
  });

  const event = await seeder.integrationEvent.create({
    data: {
      workspace_id,
      integration_connection_id: (
        await seeder.integrationConnection.findFirstOrThrow({ where: { workspace_id } })
      ).id,
      raw: { name: options.name ?? "Lead de teste" },
      received_at: arrived_at
    }
  });
  await seeder.leadSubmission.create({
    data: {
      workspace_id,
      source: options.source ?? "META_LEAD_ADS",
      external_lead_id: randomUUID(),
      received_at: arrived_at,
      last_integration_event_id: event.id,
      opportunity_id: opportunity.id
    }
  });

  return { opportunity_id: opportunity.id, person_id };
}

beforeAll(async () => {
  await seeder.$transaction(async (transaction) => {
    await transaction.workspace.createMany({
      data: [
        { id: workspace, slug: randomUUID(), name: "Leads" },
        { id: neighbour_workspace, slug: randomUUID(), name: "Leads vizinho" }
      ]
    });
    await transaction.pipeline.create({
      data: {
        id: pipeline,
        workspace_id: workspace,
        name: "Comercial",
        type: "COMMERCIAL",
        is_default: true,
        stages: {
          create: [
            { id: entry_stage, label: "Novo lead", position: 1, role: "ENTRY" },
            { label: "Conclusao", position: 2, role: "CLOSING" }
          ]
        }
      }
    });
    await transaction.integrationConnection.create({
      data: {
        workspace_id: workspace,
        provider: "PLUGA",
        token_hash: randomUUID().replaceAll("-", "").padEnd(64, "0"),
        token_last4: "aaaa"
      }
    });
    await transaction.workspaceMember.createMany({
      data: [
        { workspace_id: workspace, user_id: manager_user, role: "MANAGER", display_name: "Marina Gestão" },
        { workspace_id: workspace, user_id: attendant_user, role: "ATTENDANT", display_name: "Ana Atendente" },
        { workspace_id: workspace, user_id: other_attendant_user, role: "ATTENDANT", display_name: "Bia Atendente" },
        { workspace_id: workspace, user_id: other_manager_user, role: "MANAGER", display_name: "Outro Gestor" },
        { workspace_id: workspace, user_id: detached_user, role: "SUPERVISOR", status: "DETACHED", display_name: "Supervisor desligado" },
        { workspace_id: workspace, user_id: supervisor_user, role: "SUPERVISOR", display_name: "Sofia Supervisora" },
        { workspace_id: workspace, user_id: untagged_supervisor_user, role: "SUPERVISOR" },
        { workspace_id: workspace, user_id: same_team_user, role: "ATTENDANT" },
        { workspace_id: workspace, user_id: other_team_user, role: "ATTENDANT" }
      ]
    });
    const [sharedTag, otherTag] = await Promise.all([
      transaction.tag.create({ data: { workspace_id: workspace, name: "ACR" } }),
      transaction.tag.create({ data: { workspace_id: workspace, name: "REAL" } })
    ]);
    await transaction.memberTag.createMany({
      data: [
        { workspace_id: workspace, user_id: supervisor_user, tag_id: sharedTag.id },
        { workspace_id: workspace, user_id: same_team_user, tag_id: sharedTag.id },
        { workspace_id: workspace, user_id: other_team_user, tag_id: otherTag.id }
      ]
    });
    await transaction.pipeline.create({
      data: {
        id: neighbour_pipeline,
        workspace_id: neighbour_workspace,
        name: "Comercial",
        type: "COMMERCIAL",
        is_default: true,
        stages: {
          create: [
            { id: neighbour_entry_stage, label: "Novo lead", position: 1, role: "ENTRY" },
            { label: "Conclusao", position: 2, role: "CLOSING" }
          ]
        }
      }
    });
    await transaction.integrationConnection.create({
      data: {
        workspace_id: neighbour_workspace,
        provider: "PLUGA",
        token_hash: randomUUID().replaceAll("-", "").padEnd(64, "1"),
        token_last4: "bbbb"
      }
    });
  });
});

afterAll(async () => {
  await seeder.workspace.deleteMany({ where: { id: { in: [workspace, neighbour_workspace] } } });
  await seeder.$disconnect();
  await app.$disconnect();
});

describe("listLeads", () => {
  it("excludes Opportunities merged into another card", async () => {
    const kept = await seedOpportunity({ name: "Fica na lista" });
    const merged_target = await seedOpportunity({ name: "Absorve" });
    const merged = await seedOpportunity({
      name: "Some da lista",
      merged_into_opportunity_id: merged_target.opportunity_id
    });

    const rows = await listLeads(manager_context, { limit: 200 }, app);
    const ids = rows.map((row) => row.opportunity_id);
    expect(ids).toContain(kept.opportunity_id);
    expect(ids).toContain(merged_target.opportunity_id);
    expect(ids).not.toContain(merged.opportunity_id);
  });

  it("paginates by keyset (arrived_at DESC, id DESC), never shifting under a fixed cursor", async () => {
    const first = await seedOpportunity({ name: "Cursor 1" });
    const second = await seedOpportunity({ name: "Cursor 2" });
    const third = await seedOpportunity({ name: "Cursor 3" });

    const page = await listLeads(manager_context, { limit: 1 }, app);
    const top = page[0];
    expect(top?.opportunity_id).toBe(third.opportunity_id);

    if (!top) {
      throw new Error("expected a first page");
    }
    const nextPage = await listLeads(
      manager_context,
      { limit: 1, after: { arrived_at: top.arrived_at, id: top.opportunity_id } },
      app
    );
    expect(nextPage[0]?.opportunity_id).toBe(second.opportunity_id);

    // A lead arriving after the cursor was captured must never appear between
    // it and what was already shown — the whole point of keyset over OFFSET
    // (ADR-0013).
    await seedOpportunity({ name: "Arrived later, must not shift the page" });
    const sameNextPage = await listLeads(
      manager_context,
      { limit: 1, after: { arrived_at: top.arrived_at, id: top.opportunity_id } },
      app
    );
    expect(sameNextPage[0]?.opportunity_id).toBe(second.opportunity_id);
    void first;
  });

  it("returns the financing discriminators, the origin and the marker-ready reviews", async () => {
    const other = await seedOpportunity({ name: "Outro financiamento" });
    const seeded = await seedOpportunity({
      name: "Rico em dados",
      phones: ["+5511988887777"],
      emails: ["rico@exemplo.com"],
      financing_type: "VEHICLE",
      financial_institution: "Banco X",
      installment_amount: "899.90",
      campaign_id: "23851234567890123",
      campaign_name: "Revisional veículo",
      form_id: "form-9",
      form_name: "Simulação revisional",
      source: "LANDING_PAGE"
    });
    const review = await seeder.intakeReview.create({
      data: {
        workspace_id: workspace,
        opportunity_id: seeded.opportunity_id,
        type: "POSSIBLE_DUPLICATE",
        related_opportunity_id: other.opportunity_id
      }
    });

    const rows = await listLeads(manager_context, { limit: 200 }, app);
    const row = rows.find((candidate) => candidate.opportunity_id === seeded.opportunity_id);
    expect(row).toMatchObject({
      name: "Rico em dados",
      phones: ["+5511988887777"],
      emails: ["rico@exemplo.com"],
      financing_type: "VEHICLE",
      financial_institution: "Banco X",
      installment_amount: "899.90",
      campaign_id: "23851234567890123",
      campaign_name: "Revisional veículo",
      form_id: "form-9",
      form_name: "Simulação revisional",
      source: "LANDING_PAGE",
      missing_phone: false
    });
    expect(row?.reviews).toEqual([{ id: review.id, type: "POSSIBLE_DUPLICATE" }]);
  });

  it("filters the table by marker without going through markersFor", async () => {
    const missing_phone = await seedOpportunity({ name: "Sem telefone", missing_phone: true });
    const identity_conflict_target = await seedOpportunity({ name: "Conflito de identidade" });
    await seeder.intakeReview.create({
      data: {
        workspace_id: workspace,
        opportunity_id: identity_conflict_target.opportunity_id,
        type: "IDENTITY_CONFLICT",
        candidate_person_ids: [identity_conflict_target.person_id]
      }
    });

    const phoneFiltered = await listLeads(
      manager_context,
      { limit: 200, marker: "MISSING_PHONE" },
      app
    );
    expect(phoneFiltered.map((row) => row.opportunity_id)).toContain(missing_phone.opportunity_id);
    expect(phoneFiltered.every((row) => row.missing_phone)).toBe(true);

    const identityFiltered = await listLeads(
      manager_context,
      { limit: 200, marker: "IDENTITY_CONFLICT" },
      app
    );
    expect(identityFiltered.map((row) => row.opportunity_id)).toEqual([
      identity_conflict_target.opportunity_id
    ]);
  });

  it("scopes ATTENDANT to only the Opportunities assigned to them (ADR-0015)", async () => {
    const mine = await seedOpportunity({ name: "Meu lead", assigned_user_id: attendant_user });
    const colleagues = await seedOpportunity({
      name: "Lead do colega",
      assigned_user_id: other_attendant_user
    });
    const unassigned = await seedOpportunity({ name: "Sem dono ainda" });

    const rows = await listLeads(attendant_context, { limit: 200 }, app);
    const ids = rows.map((row) => row.opportunity_id);
    expect(ids).toContain(mine.opportunity_id);
    expect(ids).not.toContain(colleagues.opportunity_id);
    expect(ids).not.toContain(unassigned.opportunity_id);
  });

  it("scopes Supervisor to tagged ACTIVE members and never includes the unassigned queue", async () => {
    const mine = await seedOpportunity({ name: "Lead do supervisor", assigned_user_id: supervisor_user });
    const team = await seedOpportunity({ name: "Lead do time", assigned_user_id: same_team_user });
    const other = await seedOpportunity({ name: "Lead de outro time", assigned_user_id: other_team_user });
    const unassigned = await seedOpportunity({ name: "Fila sem dono" });

    const taggedRows = await listLeads(supervisor_context, { limit: 200 }, app);
    const taggedIds = taggedRows.map((row) => row.opportunity_id);
    expect(taggedIds).toContain(mine.opportunity_id);
    expect(taggedIds).toContain(team.opportunity_id);
    expect(taggedIds).not.toContain(other.opportunity_id);
    expect(taggedIds).not.toContain(unassigned.opportunity_id);

    await expect(listLeads(untagged_supervisor_context, { limit: 200 }, app)).resolves.toEqual([]);

    const managerIds = (await listLeads(manager_context, { limit: 200 }, app)).map(
      (row) => row.opportunity_id
    );
    expect(managerIds).toEqual(expect.arrayContaining([
      mine.opportunity_id,
      team.opportunity_id,
      other.opportunity_id,
      unassigned.opportunity_id
    ]));
  });

  it("never returns another workspace's leads", async () => {
    const foreign = await seedOpportunity({ workspace_id: neighbour_workspace, name: "Vizinho" });

    const rows = await listLeads(manager_context, { limit: 200 }, app);
    expect(rows.map((row) => row.opportunity_id)).not.toContain(foreign.opportunity_id);
  });
});

describe("countLeadsByMarker", () => {
  it("counts per marker over the partial indexes, not the loaded page", async () => {
    const before = await countLeadsByMarker(manager_context, app);
    await seedOpportunity({ name: "Novo sem telefone", missing_phone: true });
    const a = await seedOpportunity({ name: "Duplicado A" });
    const b = await seedOpportunity({ name: "Duplicado B" });
    await seeder.intakeReview.create({
      data: {
        workspace_id: workspace,
        opportunity_id: b.opportunity_id,
        type: "POSSIBLE_DUPLICATE",
        related_opportunity_id: a.opportunity_id
      }
    });

    const after = await countLeadsByMarker(manager_context, app);
    expect(after.MISSING_PHONE).toBe(before.MISSING_PHONE + 1);
    expect(after.POSSIBLE_DUPLICATE).toBe(before.POSSIBLE_DUPLICATE + 1);
  });

  it("scopes the counters to ATTENDANT's own assignment", async () => {
    const before = await countLeadsByMarker(attendant_context, app);
    await seedOpportunity({
      name: "Sem telefone de outro atendente",
      missing_phone: true,
      assigned_user_id: other_attendant_user
    });
    const after = await countLeadsByMarker(attendant_context, app);
    expect(after.MISSING_PHONE).toBe(before.MISSING_PHONE);
  });
});

describe("countNewLeads", () => {
  it("counts leads that arrived after the cursor, without moving anything", async () => {
    const anchor = await seedOpportunity({ name: "Âncora do polling" });
    await seedOpportunity({ name: "Chegou depois 1" });
    await seedOpportunity({ name: "Chegou depois 2" });

    const anchorRow = (await listLeads(manager_context, { limit: 200 }, app)).find(
      (row) => row.opportunity_id === anchor.opportunity_id
    );
    if (!anchorRow) {
      throw new Error("expected the anchor lead to be listed");
    }

    const count = await countNewLeads(
      manager_context,
      { arrived_at: anchorRow.arrived_at, id: anchorRow.opportunity_id },
      app
    );
    expect(count).toBeGreaterThanOrEqual(2);
  });
});

describe("getLead", () => {
  it("shows the other Opportunity and its owner for a possible duplicate", async () => {
    const related = await seedOpportunity({
      name: "Financiamento anterior",
      assigned_user_id: manager_user,
      financing_type: "VEHICLE",
      financial_institution: "Banco X",
      installment_amount: "899.90",
      campaign_id: "23851234567890123",
      campaign_name: "Revisional veículo",
      form_id: "form-9",
      form_name: "Simulação revisional",
      source: "META_LEAD_ADS"
    });
    const subject = await seedOpportunity({
      name: "Financiamento novo",
      financing_type: "OTHER",
      campaign_id: "camp-nova",
      campaign_name: "Campanha nova",
      form_id: "form-nova",
      form_name: "Formulário novo",
      source: "LANDING_PAGE"
    });
    const review = await seeder.intakeReview.create({
      data: {
        workspace_id: workspace,
        opportunity_id: subject.opportunity_id,
        type: "POSSIBLE_DUPLICATE",
        related_opportunity_id: related.opportunity_id
      }
    });

    const lead = await getLead(manager_context, subject.opportunity_id, app);
    expect(lead).toMatchObject({
      campaign_id: "camp-nova",
      campaign_name: "Campanha nova",
      form_id: "form-nova",
      form_name: "Formulário novo",
      source: "LANDING_PAGE"
    });
    expect(lead.reviews).toHaveLength(1);
    expect(lead.reviews[0]).toMatchObject({
      id: review.id,
      type: "POSSIBLE_DUPLICATE",
      candidate_persons: [],
      related_opportunity: {
        opportunity_id: related.opportunity_id,
        financing_type: "VEHICLE",
        financial_institution: "Banco X",
        installment_amount: "899.90",
        campaign_id: "23851234567890123",
        campaign_name: "Revisional veículo",
        form_id: "form-9",
        form_name: "Simulação revisional",
        source: "META_LEAD_ADS",
        assigned_user_id: manager_user
      }
    });
  });

  it("shows the candidate Pessoas for an identity conflict", async () => {
    const candidate_a = await seeder.person.create({
      data: { workspace_id: workspace, name: "Candidata A", cpf: "52998224725" }
    });
    const candidate_b = await seeder.person.create({
      data: { workspace_id: workspace, name: "Candidata B" }
    });
    const subject = await seedOpportunity({ name: "Conflito" });
    await seeder.intakeReview.create({
      data: {
        workspace_id: workspace,
        opportunity_id: subject.opportunity_id,
        type: "IDENTITY_CONFLICT",
        candidate_person_ids: [candidate_a.id, candidate_b.id]
      }
    });

    const lead = await getLead(manager_context, subject.opportunity_id, app);
    expect(lead.reviews).toHaveLength(1);
    expect(lead.reviews[0]?.type).toBe("IDENTITY_CONFLICT");
    expect(lead.reviews[0]?.candidate_persons.map((person) => person.person_id).sort()).toEqual(
      [candidate_a.id, candidate_b.id].sort()
    );
  });

  it("refuses a lead outside the caller's workspace", async () => {
    const foreign = await seedOpportunity({ workspace_id: neighbour_workspace, name: "Vizinho" });
    await expect(getLead(manager_context, foreign.opportunity_id, app)).rejects.toThrow(/not found/i);
  });

  it("refuses an ATTENDANT reading a lead assigned to somebody else", async () => {
    const colleagues = await seedOpportunity({
      name: "Não é meu",
      assigned_user_id: other_attendant_user
    });
    await expect(getLead(attendant_context, colleagues.opportunity_id, app)).rejects.toThrow(
      /not found/i
    );
  });
});

describe("assignLead", () => {
  it("assigns only when nobody has claimed the lead yet — the condition arbitrates", async () => {
    const seeded = await seedOpportunity({ name: "A ser atribuido" });

    const settled = await Promise.allSettled([
      assignLead(manager_context, { opportunity_id: seeded.opportunity_id, user_id: supervisor_user }, app),
      assignLead(
        manager_context,
        { opportunity_id: seeded.opportunity_id, user_id: supervisor_user },
        app
      )
    ]);
    const fulfilled = settled.filter((result) => result.status === "fulfilled");
    expect(fulfilled).toHaveLength(1);
    const rejected = settled.find((result) => result.status === "rejected");
    expect(rejected?.status).toBe("rejected");
    if (rejected?.status === "rejected") {
      expect(rejected.reason).toBeInstanceOf(LeadAssignmentError);
      expect((rejected.reason as LeadAssignmentError).refusal.current_assigned_user_name).toBe("Sofia Supervisora");
    }

    const stored = await seeder.opportunity.findUniqueOrThrow({
      where: { id: seeded.opportunity_id }
    });
    expect(stored.assigned_user_id).not.toBeNull();
  });

  it("refuses ATTENDANT (Fase 2's matrix keeps assignment above Atendente)", async () => {
    const seeded = await seedOpportunity({ name: "Tentativa de atendente" });
    await expect(
      assignLead(attendant_context, { opportunity_id: seeded.opportunity_id, user_id: attendant_user }, app)
    ).rejects.toThrow(/ACTOR_CANNOT_ASSIGN/);
  });

  it("lets a Supervisor open only a lead assigned inside their tagged team", async () => {
    const team = await seedOpportunity({ name: "Card do time", assigned_user_id: same_team_user });
    const outside = await seedOpportunity({ name: "Card de outro time", assigned_user_id: other_team_user });
    const unassigned = await seedOpportunity({ name: "Card sem dono" });

    await expect(getLead(supervisor_context, team.opportunity_id, app)).resolves.toMatchObject({
      opportunity_id: team.opportunity_id
    });
    await expect(getLead(supervisor_context, outside.opportunity_id, app)).rejects.toThrow(/not found/i);
    await expect(getLead(supervisor_context, unassigned.opportunity_id, app)).rejects.toThrow(/not found/i);
  });

  it("refuses SUPERVISOR because the unassigned queue belongs to GestÃ£o and DireÃ§Ã£o", async () => {
    const seeded = await seedOpportunity({ name: "Fila da GestÃ£o" });
    await expect(
      assignLead(supervisor_context, { opportunity_id: seeded.opportunity_id, user_id: supervisor_user }, app)
    ).rejects.toThrow(/ACTOR_CANNOT_ASSIGN/);
  });

  it("refuses an Attendant destination and an untagged Supervisor", async () => {
    const first = await seedOpportunity({ name: "Não pula o segundo nível" });
    const second = await seedOpportunity({ name: "Supervisor precisa de time" });
    await expect(assignLead(manager_context, { opportunity_id: first.opportunity_id, user_id: attendant_user }, app)).rejects.toThrow(/DESTINATION_MUST/);
    await expect(assignLead(manager_context, { opportunity_id: second.opportunity_id, user_id: untagged_supervisor_user }, app)).rejects.toThrow(/SUPERVISOR_REQUIRES_TAG/);
  });

  it("refuses another Manager and a detached destination from the queue", async () => {
    const first = await seedOpportunity();
    const second = await seedOpportunity();
    await expect(assignLead(manager_context, { opportunity_id: first.opportunity_id, user_id: other_manager_user }, app)).rejects.toThrow(/DESTINATION_MUST/);
    await expect(assignLead(manager_context, { opportunity_id: second.opportunity_id, user_id: detached_user }, app)).rejects.toThrow(/DESTINATION_INACTIVE/);
  });

  it("completes Gestão → Supervisor → Atendente and preserves the previous owner", async () => {
    const lead = await seedOpportunity({ name: "Caminho completo" });
    await assignLead(manager_context, { opportunity_id: lead.opportunity_id, user_id: supervisor_user }, app);
    await reassignLead(supervisor_context, {
      opportunity_id: lead.opportunity_id,
      current_user_id: supervisor_user,
      user_id: same_team_user
    }, app);
    await expect(seeder.opportunity.findUniqueOrThrow({ where: { id: lead.opportunity_id } })).resolves.toMatchObject({
      assigned_user_id: same_team_user,
      previous_assigned_user_id: supervisor_user
    });
  });

  it("requires the current owner in the reassignment WHERE and enforces both team ends", async () => {
    const team = await seedOpportunity({ assigned_user_id: same_team_user });
    const outside = await seedOpportunity({ assigned_user_id: other_team_user });
    await expect(reassignLead(supervisor_context, { opportunity_id: team.opportunity_id, current_user_id: other_team_user, user_id: supervisor_user }, app)).rejects.toThrow();
    await expect(reassignLead(supervisor_context, { opportunity_id: outside.opportunity_id, current_user_id: other_team_user, user_id: same_team_user }, app)).rejects.toThrow();
    await expect(reassignLead(supervisor_context, { opportunity_id: team.opportunity_id, current_user_id: same_team_user, user_id: other_team_user }, app)).rejects.toThrow();
  });

  it("does not let an untagged Supervisor reassign", async () => {
    const lead = await seedOpportunity({ assigned_user_id: same_team_user });
    await expect(reassignLead(untagged_supervisor_context, {
      opportunity_id: lead.opportunity_id,
      current_user_id: same_team_user,
      user_id: same_team_user
    }, app)).rejects.toThrow(/LEAD_ASSIGNMENT_CONFLICT/);
  });

  it("assigns a batch partially and names the current owner in the refusal", async () => {
    const free = await seedOpportunity({ name: "Livre" });
    const occupied = await seedOpportunity({ name: "Ocupado", assigned_user_id: supervisor_user });
    const result = await assignLeads(manager_context, {
      opportunity_ids: [free.opportunity_id, occupied.opportunity_id],
      user_id: manager_user
    }, app);
    expect(result.assigned).toEqual([{ opportunity_id: free.opportunity_id, assigned_user_id: manager_user }]);
    expect(result.refused).toEqual([expect.objectContaining({
      opportunity_id: occupied.opportunity_id,
      reason: "ALREADY_ASSIGNED",
      current_assigned_user_name: "Sofia Supervisora"
    })]);
  });

  it("reassigns N rows to one destination without rateio", async () => {
    const first = await seedOpportunity({ assigned_user_id: supervisor_user });
    const second = await seedOpportunity({ assigned_user_id: supervisor_user });
    const result = await reassignLeads(supervisor_context, {
      assignments: [first, second].map(({ opportunity_id }) => ({ opportunity_id, current_user_id: supervisor_user })),
      user_id: same_team_user
    }, app);
    expect(result.assigned).toHaveLength(2);
    expect(new Set(result.assigned.map((item) => item.assigned_user_id))).toEqual(new Set([same_team_user]));
  });
});

describe("assignment filters", () => {
  it("filters by responsible and team inside listLeads", async () => {
    const acr = await seedOpportunity({ name: "Filtro ACR", assigned_user_id: same_team_user });
    await seedOpportunity({ name: "Filtro REAL", assigned_user_id: other_team_user });
    const byResponsible = await listLeads(manager_context, { responsible_user_id: same_team_user, limit: 200 }, app);
    const byTeam = await listLeads(manager_context, { team: "ACR", limit: 200 }, app);
    expect(byResponsible.some((row) => row.opportunity_id === acr.opportunity_id)).toBe(true);
    expect(byResponsible.every((row) => row.assigned_user_id === same_team_user)).toBe(true);
    expect(byTeam.some((row) => row.opportunity_id === acr.opportunity_id)).toBe(true);
    expect(byTeam.every((row) => row.assigned_user_id !== other_team_user)).toBe(true);
  });

  it("a Supervisor filtering another team gets an empty narrowing, never broader scope", async () => {
    await seedOpportunity({ name: "Só REAL", assigned_user_id: other_team_user });
    await expect(listLeads(supervisor_context, { team: "REAL", limit: 200 }, app)).resolves.toEqual([]);
  });
});

describe("updateLeadDetails", () => {
  it("normalizes a new phone through the same reader ingestion uses", async () => {
    const seeded = await seedOpportunity({ name: "Editar telefone", missing_phone: true });

    const result = await updateLeadDetails(
      manager_context,
      { opportunity_id: seeded.opportunity_id, add_phone: "(11) 98765-4321" },
      app
    );

    expect(result.missing_phone).toBe(false);
    expect(result.rejected_fields).toEqual([]);
    const phones = await seeder.personPhone.findMany({ where: { person_id: seeded.person_id } });
    expect(phones.map((phone) => phone.phone_e164)).toEqual(["+5511987654321"]);
  });

  it("rejects a phone that does not normalize instead of writing it crooked", async () => {
    const seeded = await seedOpportunity({ name: "Telefone invalido" });

    const result = await updateLeadDetails(
      manager_context,
      { opportunity_id: seeded.opportunity_id, add_phone: "not-a-phone" },
      app
    );

    expect(result.rejected_fields).toEqual(["phone"]);
    await expect(
      seeder.personPhone.count({ where: { person_id: seeded.person_id } })
    ).resolves.toBe(0);
  });

  it("normalizes the parcela through normalizeDecimalAmount", async () => {
    const seeded = await seedOpportunity({ name: "Editar parcela" });

    await updateLeadDetails(
      manager_context,
      { opportunity_id: seeded.opportunity_id, installment_amount: "1.234,56" },
      app
    );

    const opportunity = await seeder.opportunity.findUniqueOrThrow({
      where: { id: seeded.opportunity_id }
    });
    expect(opportunity.installment_amount?.toString()).toBe("1234.56");
  });

  it("lets an ATTENDANT edit only a lead assigned to them", async () => {
    const mine = await seedOpportunity({ name: "Meu lead editavel", assigned_user_id: attendant_user });
    const colleagues = await seedOpportunity({
      name: "Lead alheio",
      assigned_user_id: other_attendant_user
    });

    await expect(
      updateLeadDetails(attendant_context, { opportunity_id: mine.opportunity_id, name: "Novo nome" }, app)
    ).resolves.toMatchObject({ opportunity_id: mine.opportunity_id });
    await expect(
      updateLeadDetails(
        attendant_context,
        { opportunity_id: colleagues.opportunity_id, name: "Não deveria" },
        app
      )
    ).rejects.toThrow(/assigned to them/);
  });

  it("lets a Supervisor edit a team lead but refuses another team", async () => {
    const team = await seedOpportunity({ name: "EditÃ¡vel pelo supervisor", assigned_user_id: same_team_user });
    const outside = await seedOpportunity({ name: "Fora do time", assigned_user_id: other_team_user });

    await expect(
      updateLeadDetails(supervisor_context, { opportunity_id: team.opportunity_id, name: "Editado pelo supervisor" }, app)
    ).resolves.toMatchObject({ opportunity_id: team.opportunity_id });
    await expect(
      updateLeadDetails(supervisor_context, { opportunity_id: outside.opportunity_id, name: "NÃ£o pode" }, app)
    ).rejects.toThrow(/outside their scope/i);
  });
});

describe("resolveIdentityConflict", () => {
  it("lets a Supervisor resolve identity only for their tagged team", async () => {
    const candidate = await seeder.person.create({ data: { workspace_id: workspace, name: "Candidata" } });
    const team = await seedOpportunity({ name: "Revisao do time", assigned_user_id: same_team_user });
    const outside = await seedOpportunity({ name: "Revisao externa", assigned_user_id: other_team_user });
    const teamReview = await seeder.intakeReview.create({
      data: { workspace_id: workspace, opportunity_id: team.opportunity_id, type: "IDENTITY_CONFLICT", candidate_person_ids: [candidate.id] }
    });
    const outsideReview = await seeder.intakeReview.create({
      data: { workspace_id: workspace, opportunity_id: outside.opportunity_id, type: "IDENTITY_CONFLICT", candidate_person_ids: [candidate.id] }
    });

    await expect(resolveIdentityConflict(supervisor_context, {
      review_id: teamReview.id,
      resolution: "CONFIRMED_DISTINCT",
      reason: "Conferido pelo time",
      resolved_at: new Date()
    }, app)).resolves.toMatchObject({ review_id: teamReview.id });
    await expect(resolveIdentityConflict(supervisor_context, {
      review_id: outsideReview.id,
      resolution: "CONFIRMED_DISTINCT",
      reason: "Tentativa fora do time",
      resolved_at: new Date()
    }, app)).rejects.toThrow(/not found/i);
  });
  it("confirms distinct people without touching either Pessoa", async () => {
    const candidate = await seeder.person.create({
      data: { workspace_id: workspace, name: "Candidata" }
    });
    const subject = await seedOpportunity({ name: "Pessoas distintas" });
    const review = await seeder.intakeReview.create({
      data: {
        workspace_id: workspace,
        opportunity_id: subject.opportunity_id,
        type: "IDENTITY_CONFLICT",
        candidate_person_ids: [candidate.id]
      }
    });

    const resolved = await resolveIdentityConflict(
      manager_context,
      {
        review_id: review.id,
        resolution: "CONFIRMED_DISTINCT",
        reason: "Telefones de duas pessoas da mesma familia",
        resolved_at: new Date()
      },
      app
    );
    expect(resolved).toEqual({ review_id: review.id, resolution: "CONFIRMED_DISTINCT" });

    const stored = await seeder.person.findUniqueOrThrow({ where: { id: subject.person_id } });
    expect(stored.merged_into_person_id).toBeNull();
  });

  it("merges into the chosen candidate and resolves the review in the same commit", async () => {
    const candidate = await seeder.person.create({
      data: { workspace_id: workspace, name: "Candidata canonica" }
    });
    const subject = await seedOpportunity({ name: "Vai mesclar" });
    const review = await seeder.intakeReview.create({
      data: {
        workspace_id: workspace,
        opportunity_id: subject.opportunity_id,
        type: "IDENTITY_CONFLICT",
        candidate_person_ids: [candidate.id]
      }
    });

    await resolveIdentityConflict(
      manager_context,
      {
        review_id: review.id,
        resolution: "MERGED",
        reason: "Mesmo CPF confirmado por telefone",
        resolved_at: new Date(),
        canonical_person_id: candidate.id
      },
      app
    );

    const absorbed = await seeder.person.findUniqueOrThrow({ where: { id: subject.person_id } });
    expect(absorbed.merged_into_person_id).toBe(candidate.id);
    const resolvedReview = await seeder.intakeReview.findUniqueOrThrow({ where: { id: review.id } });
    expect(resolvedReview.identity_conflict_resolution).toBe("MERGED");
    expect(resolvedReview.resolved_by_user_id).toBe(manager_user);
  });

  it("refuses ATTENDANT and refuses resolving the same review twice", async () => {
    const candidate = await seeder.person.create({
      data: { workspace_id: workspace, name: "Candidata dupla" }
    });
    const subject = await seedOpportunity({ name: "Dupla resolucao" });
    const review = await seeder.intakeReview.create({
      data: {
        workspace_id: workspace,
        opportunity_id: subject.opportunity_id,
        type: "IDENTITY_CONFLICT",
        candidate_person_ids: [candidate.id]
      }
    });

    await expect(
      resolveIdentityConflict(
        attendant_context,
        {
          review_id: review.id,
          resolution: "CONFIRMED_DISTINCT",
          reason: "Tentativa de atendente",
          resolved_at: new Date()
        },
        app
      )
    ).rejects.toThrow(/ATTENDANT/);

    await resolveIdentityConflict(
      manager_context,
      {
        review_id: review.id,
        resolution: "CONFIRMED_DISTINCT",
        reason: "Primeira resolucao",
        resolved_at: new Date()
      },
      app
    );
    await expect(
      resolveIdentityConflict(
        manager_context,
        {
          review_id: review.id,
          resolution: "CONFIRMED_DISTINCT",
          reason: "Segunda tentativa",
          resolved_at: new Date()
        },
        app
      )
    ).rejects.toThrow(/already resolved/);
  });
});
