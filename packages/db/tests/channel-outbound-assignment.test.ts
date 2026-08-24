import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createUserContextFromResolvedMembership } from "../src/access-context.js";
import { assignLeads, reassignLeads } from "../src/leads.js";

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
const pipeline = randomUUID();
const entry_stage = randomUUID();
const manager_user = randomUUID();
const supervisor_user = randomUUID();
const attendant_user = randomUUID();
const other_attendant_user = randomUUID();
const phoneless_attendant_user = randomUUID();

const ATTENDANT_PHONE = "+5511912345678";
const OTHER_ATTENDANT_PHONE = "+5511987654321";

const manager = createUserContextFromResolvedMembership({
  workspace_id: workspace,
  user_id: manager_user,
  role: "MANAGER"
});
const supervisor = createUserContextFromResolvedMembership({
  workspace_id: workspace,
  user_id: supervisor_user,
  role: "SUPERVISOR"
});

let arrival_clock = new Date("2026-08-19T15:00:00.000Z").getTime();
function nextArrival(): Date {
  arrival_clock += 1000;
  return new Date(arrival_clock);
}

async function seedUnassignedLead(
  overrides: {
    readonly whatsapp_opt_in?: boolean | null;
    readonly missing_phone?: boolean;
    readonly status?: "OPEN" | "WON" | "LOST";
    readonly merged_into_opportunity_id?: string | null;
  } = {}
): Promise<string> {
  const person = await seeder.person.create({
    data: { workspace_id: workspace, name: "Lead de disparo" }
  });
  const status = overrides.status ?? "OPEN";
  const arrived_at = nextArrival();
  const opportunity = await seeder.opportunity.create({
    data: {
      workspace_id: workspace,
      person_id: person.id,
      pipeline_id: pipeline,
      stage_id: entry_stage,
      area: "COMMERCIAL",
      status,
      arrived_at,
      closed_at: status === "OPEN" ? null : new Date(arrived_at.getTime() + 60_000),
      assigned_user_id: null,
      whatsapp_opt_in: overrides.whatsapp_opt_in === undefined ? true : overrides.whatsapp_opt_in,
      missing_phone: overrides.missing_phone ?? false,
      merged_into_opportunity_id: overrides.merged_into_opportunity_id ?? null
    }
  });
  return opportunity.id;
}

async function assignToSupervisor(opportunity_ids: readonly string[]) {
  return assignLeads(manager, { opportunity_ids, user_id: supervisor_user }, app);
}

async function reassignToAttendant(
  opportunity_ids: readonly string[],
  current_user_id: string,
  destination_user_id: string = attendant_user
) {
  return reassignLeads(
    supervisor,
    {
      assignments: opportunity_ids.map((opportunity_id) => ({
        opportunity_id,
        current_user_id
      })),
      user_id: destination_user_id
    },
    app
  );
}

async function attemptsOf(opportunity_id: string) {
  return seeder.channelOutboundAttempt.findMany({
    where: { opportunity_id },
    orderBy: { created_at: "asc" }
  });
}

async function firstContactAt(opportunity_id: string): Promise<Date | null> {
  const row = await seeder.opportunity.findUniqueOrThrow({ where: { id: opportunity_id } });
  return row.first_contact_at;
}

async function failedFacts(opportunity_id: string) {
  return seeder.opportunityTimelineEvent.findMany({
    where: { opportunity_id, type: "WHATSAPP_OUTBOUND_FAILED" }
  });
}

async function restoreWorkspaceDefaults() {
  await seeder.workspaceFlag.upsert({
    where: {
      workspace_id_key: { workspace_id: workspace, key: "auto_primeiro_contato" }
    },
    create: { workspace_id: workspace, key: "auto_primeiro_contato" },
    update: {}
  });
  await seeder.workspaceSettings.deleteMany({ where: { workspace_id: workspace } });
  await seeder.integrationConnection.updateMany({
    where: { workspace_id: workspace, provider: "WHATSMIAU" },
    data: { pairing_state: "CONNECTED", status: "ACTIVE" }
  });
  await seeder.workspaceMember.update({
    where: {
      workspace_id_user_id: { workspace_id: workspace, user_id: attendant_user }
    },
    data: { whatsapp_phone_e164: ATTENDANT_PHONE }
  });
}

beforeAll(async () => {
  await seeder.$transaction(async (transaction) => {
    await transaction.workspace.create({
      data: { id: workspace, slug: randomUUID(), name: "Canal na atribuicao" }
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
    await transaction.workspaceMember.createMany({
      data: [
        {
          workspace_id: workspace,
          user_id: manager_user,
          role: "MANAGER",
          display_name: "Marina Gestao"
        },
        {
          workspace_id: workspace,
          user_id: supervisor_user,
          role: "SUPERVISOR",
          display_name: "Sofia Supervisora"
        },
        {
          workspace_id: workspace,
          user_id: attendant_user,
          role: "ATTENDANT",
          display_name: "Ana Atendente",
          whatsapp_phone_e164: ATTENDANT_PHONE
        },
        {
          workspace_id: workspace,
          user_id: other_attendant_user,
          role: "ATTENDANT",
          display_name: "Bia Atendente",
          whatsapp_phone_e164: OTHER_ATTENDANT_PHONE
        },
        {
          workspace_id: workspace,
          user_id: phoneless_attendant_user,
          role: "ATTENDANT",
          display_name: "Caio sem WhatsApp"
        }
      ]
    });
    const tag = await transaction.tag.create({
      data: { workspace_id: workspace, name: "ACR" }
    });
    await transaction.memberTag.createMany({
      data: [
        { workspace_id: workspace, user_id: supervisor_user, tag_id: tag.id },
        { workspace_id: workspace, user_id: attendant_user, tag_id: tag.id },
        { workspace_id: workspace, user_id: other_attendant_user, tag_id: tag.id },
        { workspace_id: workspace, user_id: phoneless_attendant_user, tag_id: tag.id }
      ]
    });
    await transaction.workspaceFlag.create({
      data: { workspace_id: workspace, key: "auto_primeiro_contato" }
    });
    await transaction.integrationConnection.create({
      data: {
        workspace_id: workspace,
        provider: "WHATSMIAU",
        name: "WhatsApp",
        token_hash: "d".repeat(64),
        token_last4: "dddd",
        instance_name: `marctco_${workspace.replaceAll("-", "")}`,
        pairing_state: "CONNECTED"
      }
    });
  });
});

afterEach(async () => {
  await restoreWorkspaceDefaults();
});

afterAll(async () => {
  await seeder.workspace.deleteMany({ where: { id: workspace } });
  await Promise.all([seeder.$disconnect(), app.$disconnect()]);
});

describe("outbound on assignment", () => {
  it("does not create an attempt when Gestao delivers the queue to a Supervisor", async () => {
    const opportunity_id = await seedUnassignedLead();
    const result = await assignToSupervisor([opportunity_id]);
    expect(result.assigned).toEqual([
      { opportunity_id, assigned_user_id: supervisor_user }
    ]);
    expect(await attemptsOf(opportunity_id)).toEqual([]);
    expect(await firstContactAt(opportunity_id)).toBeNull();
  });

  it("queues one pending attempt when a Supervisor delivers the card to an Attendant", async () => {
    const opportunity_id = await seedUnassignedLead();
    await assignToSupervisor([opportunity_id]);
    const result = await reassignToAttendant([opportunity_id], supervisor_user);
    expect(result.assigned).toEqual([
      { opportunity_id, assigned_user_id: attendant_user }
    ]);
    const attempts = await attemptsOf(opportunity_id);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      kind: "AUTO_FIRST_CONTACT",
      dispatch_status: "PENDING",
      delivery_status: "QUEUED",
      failure_reason: null
    });
    expect(await firstContactAt(opportunity_id)).toBeNull();
  });

  it("creates no intention when flag, trigger, opt-in or eligibility fail", async () => {
    const cases: Array<{
      readonly name: string;
      readonly setup?: () => Promise<void>;
      readonly lead?: {
        readonly whatsapp_opt_in?: boolean | null;
        readonly missing_phone?: boolean;
        readonly status?: "OPEN" | "WON" | "LOST";
      };
    }> = [
      {
        name: "flag off",
        setup: async () => {
          await seeder.workspaceFlag.delete({
            where: {
              workspace_id_key: { workspace_id: workspace, key: "auto_primeiro_contato" }
            }
          });
        }
      },
      {
        name: "DISABLED",
        setup: async () => {
          await seeder.workspaceSettings.create({
            data: { workspace_id: workspace, first_contact_trigger: "DISABLED" }
          });
        }
      },
      {
        name: "ON_ARRIVAL",
        setup: async () => {
          await seeder.workspaceSettings.create({
            data: { workspace_id: workspace, first_contact_trigger: "ON_ARRIVAL" }
          });
        }
      },
      {
        name: "opt-in absent",
        lead: { whatsapp_opt_in: null }
      },
      {
        name: "opt-in false",
        lead: { whatsapp_opt_in: false }
      },
      {
        name: "missing phone",
        lead: { missing_phone: true }
      },
      {
        name: "closed",
        lead: { status: "LOST" }
      }
    ];

    for (const scenario of cases) {
      await restoreWorkspaceDefaults();
      if (scenario.setup) {
        await scenario.setup();
      }
      const opportunity_id = await seedUnassignedLead(scenario.lead);
      await assignToSupervisor([opportunity_id]);
      await reassignToAttendant([opportunity_id], supervisor_user);
      expect(await attemptsOf(opportunity_id), scenario.name).toEqual([]);
      expect(await firstContactAt(opportunity_id), scenario.name).toBeNull();
    }
  });

  it("creates no attempt for a merged card because assignment does not claim it", async () => {
    const survivor = await seedUnassignedLead();
    await assignToSupervisor([survivor]);
    const merged = await seedUnassignedLead({ merged_into_opportunity_id: survivor });
    const result = await assignToSupervisor([merged]);
    expect(result.assigned).toEqual([]);
    expect(result.refused[0]?.reason).toBe("NOT_VISIBLE");
    expect(await attemptsOf(merged)).toEqual([]);
  });

  it("records a terminal FAILED attempt when the instance is disconnected, without first_contact_at", async () => {
    await seeder.integrationConnection.updateMany({
      where: { workspace_id: workspace, provider: "WHATSMIAU" },
      data: { pairing_state: "DISCONNECTED" }
    });
    const opportunity_id = await seedUnassignedLead();
    await assignToSupervisor([opportunity_id]);
    await reassignToAttendant([opportunity_id], supervisor_user);
    const attempts = await attemptsOf(opportunity_id);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      dispatch_status: "DISPATCHED",
      delivery_status: "FAILED",
      failure_reason: "INSTANCE_NOT_CONNECTED"
    });
    expect(await failedFacts(opportunity_id)).toHaveLength(1);
    expect(await firstContactAt(opportunity_id)).toBeNull();
  });

  it("records a terminal FAILED attempt when the Attendant has no WhatsApp phone", async () => {
    const opportunity_id = await seedUnassignedLead();
    await assignToSupervisor([opportunity_id]);
    await reassignToAttendant([opportunity_id], supervisor_user, phoneless_attendant_user);
    const attempts = await attemptsOf(opportunity_id);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      dispatch_status: "DISPATCHED",
      delivery_status: "FAILED",
      failure_reason: "ATTENDANT_PHONE_MISSING"
    });
    expect(await failedFacts(opportunity_id)).toHaveLength(1);
    expect(await firstContactAt(opportunity_id)).toBeNull();
  });

  it("creates one attempt per eligible row in a partial batch to an Attendant", async () => {
    const first = await seedUnassignedLead();
    const second = await seedUnassignedLead();
    const stolen = await seedUnassignedLead();
    await assignToSupervisor([first, second, stolen]);
    await reassignToAttendant([stolen], supervisor_user, other_attendant_user);

    const result = await reassignToAttendant([first, second, stolen], supervisor_user);
    expect(result.assigned).toHaveLength(2);
    expect(result.assigned).toEqual(
      expect.arrayContaining([
        { opportunity_id: first, assigned_user_id: attendant_user },
        { opportunity_id: second, assigned_user_id: attendant_user }
      ])
    );
    expect(result.refused).toEqual([
      expect.objectContaining({
        opportunity_id: stolen,
        reason: "CURRENT_OWNER_CHANGED",
        current_assigned_user_id: other_attendant_user
      })
    ]);
    expect(await attemptsOf(first)).toHaveLength(1);
    expect(await attemptsOf(second)).toHaveLength(1);
    expect(await attemptsOf(stolen)).toHaveLength(1);
    expect((await attemptsOf(first))[0]?.delivery_status).toBe("QUEUED");
    expect((await attemptsOf(stolen))[0]?.delivery_status).toBe("QUEUED");
  });

  it("lets the assignment condition arbitrate a race and records one attempt", async () => {
    const opportunity_id = await seedUnassignedLead();
    await assignToSupervisor([opportunity_id]);
    const settled = await Promise.allSettled([
      reassignToAttendant([opportunity_id], supervisor_user),
      reassignToAttendant([opportunity_id], supervisor_user)
    ]);
    const fulfilled = settled.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : []
    );
    expect(fulfilled).toHaveLength(2);
    expect(fulfilled.flatMap((result) => result.assigned)).toHaveLength(1);
    expect(fulfilled.flatMap((result) => result.refused)).toHaveLength(1);
    expect(await attemptsOf(opportunity_id)).toHaveLength(1);
  });

  it("never creates a second attempt when reassigning between Attendants, in any existing state", async () => {
    const states: Array<{
      readonly delivery_status: "QUEUED" | "PROCESSING" | "SENT" | "FAILED";
      readonly dispatch_status: "PENDING" | "DISPATCHED";
      readonly extra: Record<string, Date | string | null>;
    }> = [
      {
        delivery_status: "QUEUED",
        dispatch_status: "PENDING",
        extra: {}
      },
      {
        delivery_status: "PROCESSING",
        dispatch_status: "DISPATCHED",
        extra: {
          dispatched_at: new Date("2026-08-19T16:00:00.000Z"),
          processing_lease_until: new Date("2026-08-19T16:05:00.000Z")
        }
      },
      {
        delivery_status: "SENT",
        dispatch_status: "DISPATCHED",
        extra: {
          dispatched_at: new Date("2026-08-19T16:00:00.000Z"),
          sent_at: new Date("2026-08-19T16:01:00.000Z")
        }
      },
      {
        delivery_status: "FAILED",
        dispatch_status: "DISPATCHED",
        extra: {
          dispatched_at: new Date("2026-08-19T16:00:00.000Z"),
          failed_at: new Date("2026-08-19T16:01:00.000Z"),
          failure_reason: "KNOWN_REFUSAL"
        }
      }
    ];

    for (const state of states) {
      const opportunity_id = await seedUnassignedLead();
      await assignToSupervisor([opportunity_id]);
      await reassignToAttendant([opportunity_id], supervisor_user);
      await seeder.channelOutboundAttempt.deleteMany({ where: { opportunity_id } });
      const seeded = await seeder.channelOutboundAttempt.create({
        data: {
          workspace_id: workspace,
          opportunity_id,
          kind: "AUTO_FIRST_CONTACT",
          dispatch_status: state.dispatch_status,
          delivery_status: state.delivery_status,
          ...state.extra
        }
      });
      const result = await reassignToAttendant(
        [opportunity_id],
        attendant_user,
        other_attendant_user
      );
      expect(result.assigned).toEqual([
        { opportunity_id, assigned_user_id: other_attendant_user }
      ]);
      const attempts = await attemptsOf(opportunity_id);
      expect(attempts).toHaveLength(1);
      expect(attempts[0]?.id).toBe(seeded.id);
      expect(attempts[0]?.delivery_status).toBe(state.delivery_status);
    }
  });
});
