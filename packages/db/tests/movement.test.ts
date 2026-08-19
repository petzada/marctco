import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createUserContextFromResolvedMembership } from "../src/access-context.js";
import { cancelActivity, completeActivity, createActivity, rescheduleActivity } from "../src/activities.js";
import { resolveIntakeReview } from "../src/intake-review.js";
import { moveLeadStage } from "../src/lead-board.js";
import {
  assignLead,
  assignLeads,
  getLead,
  listLeads,
  reassignLead,
  reassignLeads,
  updateLeadDetails
} from "../src/leads.js";
import { detachWorkspaceMember } from "../src/team.js";

const LAST_MOVEMENT_MIGRATION_SQL = readFileSync(
  fileURLToPath(
    new URL("../prisma/migrations/20260817010400_opportunity_last_movement_at/migration.sql", import.meta.url)
  ),
  "utf8"
);

const ROLLBACK_BACKFILL_FIXTURE = "rollback last_movement_at backfill fixture";

/** The ADD COLUMN + UPDATE that the reserved migration runs, not a copy. */
function lastMovementBackfillStatements(sql: string): readonly [string, string] {
  const add = sql.match(/ALTER TABLE "opportunities" ADD COLUMN "last_movement_at" TIMESTAMPTZ\(6\);/);
  const update = sql.match(
    /UPDATE "opportunities"\s+SET "last_movement_at" = "arrived_at"\s+WHERE "last_movement_at" IS NULL;/
  );
  if (!add?.[0] || !update?.[0]) {
    throw new Error("last_movement_at backfill statements missing from the reserved migration");
  }
  return [add[0], update[0]];
}

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
const contact_stage = randomUUID();
const attendant_user = randomUUID();
const manager_user = randomUUID();
const supervisor_user = randomUUID();
const same_team_user = randomUUID();

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

let arrival_clock = new Date("2026-08-10T12:00:00.000Z").getTime();
function nextArrival(): Date {
  arrival_clock += 1000;
  return new Date(arrival_clock);
}

async function seedOpportunity(options: {
  readonly assigned_user_id?: string | null;
  readonly person_id?: string;
} = {}): Promise<string> {
  const person_id =
    options.person_id ??
    (
      await seeder.person.create({
        data: { workspace_id: workspace, name: "Lead de movimento" }
      })
    ).id;
  const opportunity = await seeder.opportunity.create({
    data: {
      workspace_id: workspace,
      person_id,
      pipeline_id: pipeline,
      stage_id: entry_stage,
      area: "COMMERCIAL",
      status: "OPEN",
      arrived_at: nextArrival(),
      assigned_user_id: options.assigned_user_id === undefined ? attendant_user : options.assigned_user_id
    }
  });
  return opportunity.id;
}

async function movementAt(opportunity_id: string): Promise<Date | null> {
  const row = await seeder.opportunity.findUniqueOrThrow({ where: { id: opportunity_id } });
  return row.last_movement_at;
}

async function movementFacts(opportunity_id: string) {
  return seeder.opportunityTimelineEvent.findMany({
    where: { opportunity_id },
    orderBy: { occurred_at: "asc" }
  });
}

function dueAt(hoursFromNow: number): Date {
  return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
}

beforeAll(async () => {
  await seeder.$transaction(async (transaction) => {
    await transaction.workspace.create({
      data: { id: workspace, slug: randomUUID(), name: "Movimento" }
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
            { id: contact_stage, label: "Contato", position: 2, role: "NORMAL" },
            { label: "Conclusao", position: 3, role: "CLOSING" }
          ]
        }
      }
    });
    await transaction.workspaceMember.createMany({
      data: [
        { workspace_id: workspace, user_id: manager_user, role: "MANAGER", display_name: "Marina Gestao" },
        { workspace_id: workspace, user_id: attendant_user, role: "ATTENDANT", display_name: "Ana Atendente" },
        { workspace_id: workspace, user_id: supervisor_user, role: "SUPERVISOR", display_name: "Sofia Supervisora" },
        { workspace_id: workspace, user_id: same_team_user, role: "ATTENDANT", display_name: "Time ACR" }
      ]
    });
    const tag = await transaction.tag.create({ data: { workspace_id: workspace, name: "ACR" } });
    await transaction.memberTag.createMany({
      data: [
        { workspace_id: workspace, user_id: supervisor_user, tag_id: tag.id },
        { workspace_id: workspace, user_id: attendant_user, tag_id: tag.id },
        { workspace_id: workspace, user_id: same_team_user, tag_id: tag.id }
      ]
    });
  });
});

afterAll(async () => {
  await seeder.workspace.deleteMany({ where: { id: workspace } });
  await Promise.all([seeder.$disconnect(), app.$disconnect()]);
});

describe("last_movement_at and movement facts", () => {
  it("stamps last_movement_at and writes STAGE_CHANGED when moving a stage", async () => {
    const opportunity_id = await seedOpportunity();
    expect(await movementAt(opportunity_id)).toBeNull();
    await moveLeadStage(
      attendant_context,
      { opportunity_id, current_stage_id: entry_stage, stage_id: contact_stage },
      app
    );
    const stamped = await movementAt(opportunity_id);
    expect(stamped).not.toBeNull();
    const facts = await movementFacts(opportunity_id);
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({
      type: "STAGE_CHANGED",
      lead_submission_id: null,
      integration_event_id: null,
      opportunity_id,
      workspace_id: workspace
    });
    expect(facts[0]?.occurred_at.toISOString()).toBe(stamped?.toISOString());
  });

  it("writes two STAGE_CHANGED facts for two moves, without deduplicating", async () => {
    const opportunity_id = await seedOpportunity();
    await moveLeadStage(
      attendant_context,
      { opportunity_id, current_stage_id: entry_stage, stage_id: contact_stage },
      app
    );
    await moveLeadStage(
      attendant_context,
      { opportunity_id, current_stage_id: contact_stage, stage_id: entry_stage },
      app
    );
    const facts = await movementFacts(opportunity_id);
    expect(facts.map((fact) => fact.type)).toEqual(["STAGE_CHANGED", "STAGE_CHANGED"]);
    expect(facts[0]?.id).not.toBe(facts[1]?.id);
  });

  it("stamps and writes ASSIGNED for one-to-one and batch assignment", async () => {
    const one = await seedOpportunity({ assigned_user_id: null });
    await assignLead(manager_context, { opportunity_id: one, user_id: supervisor_user }, app);
    expect(await movementAt(one)).not.toBeNull();
    expect((await movementFacts(one)).map((fact) => fact.type)).toEqual(["ASSIGNED"]);

    const first = await seedOpportunity({ assigned_user_id: null });
    const second = await seedOpportunity({ assigned_user_id: null });
    await assignLeads(manager_context, { opportunity_ids: [first, second], user_id: supervisor_user }, app);
    expect((await movementFacts(first)).map((fact) => fact.type)).toEqual(["ASSIGNED"]);
    expect((await movementFacts(second)).map((fact) => fact.type)).toEqual(["ASSIGNED"]);
  });

  it("stamps and writes REASSIGNED for one-to-one and batch reassignment", async () => {
    const one = await seedOpportunity({ assigned_user_id: supervisor_user });
    await reassignLead(
      supervisor_context,
      { opportunity_id: one, current_user_id: supervisor_user, user_id: attendant_user },
      app
    );
    const stored = await seeder.opportunity.findUniqueOrThrow({ where: { id: one } });
    expect(stored.previous_assigned_user_id).toBe(supervisor_user);
    expect(stored.last_movement_at).not.toBeNull();
    expect((await movementFacts(one)).map((fact) => fact.type)).toEqual(["REASSIGNED"]);

    const first = await seedOpportunity({ assigned_user_id: supervisor_user });
    const second = await seedOpportunity({ assigned_user_id: supervisor_user });
    await reassignLeads(
      supervisor_context,
      {
        assignments: [
          { opportunity_id: first, current_user_id: supervisor_user },
          { opportunity_id: second, current_user_id: supervisor_user }
        ],
        user_id: same_team_user
      },
      app
    );
    expect((await movementFacts(first)).map((fact) => fact.type)).toEqual(["REASSIGNED"]);
    expect((await movementFacts(second)).map((fact) => fact.type)).toEqual(["REASSIGNED"]);
  });

  it("stamps and writes RETURNED_TO_QUEUE when detachment returns open leads to the queue", async () => {
    const opportunity_id = await seedOpportunity({ assigned_user_id: attendant_user });
    try {
      await detachWorkspaceMember(manager_context, attendant_user, app);
      const stored = await seeder.opportunity.findUniqueOrThrow({ where: { id: opportunity_id } });
      expect(stored.assigned_user_id).toBeNull();
      expect(stored.previous_assigned_user_id).toBe(attendant_user);
      expect(stored.last_movement_at).not.toBeNull();
      expect((await movementFacts(opportunity_id)).map((fact) => fact.type)).toEqual(["RETURNED_TO_QUEUE"]);
    } finally {
      await seeder.workspaceMember.update({
        where: { workspace_id_user_id: { workspace_id: workspace, user_id: attendant_user } },
        data: { status: "ACTIVE" }
      });
    }
  });

  it("stamps and writes ACTIVITY_CREATED when creating an activity, and ACTIVITY_COMPLETED when completing it", async () => {
    const opportunity_id = await seedOpportunity();
    const created = await createActivity(
      attendant_context,
      { opportunity_id, type: "CALL", title: "Ligacao", due_at: dueAt(1) },
      app
    );
    expect(await movementAt(opportunity_id)).not.toBeNull();
    expect((await movementFacts(opportunity_id)).map((fact) => fact.type)).toEqual(["ACTIVITY_CREATED"]);

    await completeActivity(attendant_context, created.id, app);
    expect((await movementFacts(opportunity_id)).map((fact) => fact.type)).toEqual([
      "ACTIVITY_CREATED",
      "ACTIVITY_COMPLETED"
    ]);
  });

  it("does not stamp last_movement_at when editing a card field", async () => {
    const opportunity_id = await seedOpportunity();
    await updateLeadDetails(
      manager_context,
      { opportunity_id, financial_institution: "Banco Editado" },
      app
    );
    expect(await movementAt(opportunity_id)).toBeNull();
    expect(await movementFacts(opportunity_id)).toEqual([]);
    const stored = await seeder.opportunity.findUniqueOrThrow({ where: { id: opportunity_id } });
    expect(stored.financial_institution).toBe("Banco Editado");
  });

  it("does not stamp last_movement_at when canceling or rescheduling an activity", async () => {
    const opportunity_id = await seedOpportunity();
    const created = await createActivity(
      attendant_context,
      { opportunity_id, type: "MEETING", title: "Reuniao", due_at: dueAt(2) },
      app
    );
    const afterCreate = await movementAt(opportunity_id);
    await rescheduleActivity(attendant_context, { activity_id: created.id, due_at: dueAt(3) }, app);
    expect((await movementAt(opportunity_id))?.toISOString()).toBe(afterCreate?.toISOString());
    await cancelActivity(attendant_context, created.id, app);
    expect((await movementAt(opportunity_id))?.toISOString()).toBe(afterCreate?.toISOString());
    expect((await movementFacts(opportunity_id)).map((fact) => fact.type)).toEqual(["ACTIVITY_CREATED"]);
  });

  it("exposes last_movement_at on the list and the card", async () => {
    const opportunity_id = await seedOpportunity();
    await moveLeadStage(
      attendant_context,
      { opportunity_id, current_stage_id: entry_stage, stage_id: contact_stage },
      app
    );
    const listed = (await listLeads(manager_context, { limit: 200 }, app)).find(
      (row) => row.opportunity_id === opportunity_id
    );
    const card = await getLead(manager_context, opportunity_id, app);
    expect(listed?.last_movement_at).not.toBeNull();
    expect(card.last_movement_at?.toISOString()).toBe(listed?.last_movement_at?.toISOString());
  });

  it("backfills last_movement_at to arrived_at for a row that existed before the column", async () => {
    const arrived_at = new Date("2026-07-01T08:00:00.000Z");
    const person = await seeder.person.create({
      data: { workspace_id: workspace, name: "Lead anterior a last_movement_at" }
    });
    const opportunity_id = randomUUID();
    const [addColumn, backfill] = lastMovementBackfillStatements(LAST_MOVEMENT_MIGRATION_SQL);
    try {
      await seeder.$transaction(
        async (transaction) => {
          await transaction.$executeRawUnsafe(
            `DROP INDEX IF EXISTS "opportunities_workspace_id_last_movement_at_open_idx"`
          );
          await transaction.$executeRawUnsafe(
            `ALTER TABLE "opportunities" DROP COLUMN "last_movement_at"`
          );
          await transaction.$executeRaw(Prisma.sql`
            INSERT INTO opportunities (
              id, workspace_id, person_id, pipeline_id, stage_id,
              area, status, arrived_at, updated_at
            ) VALUES (
              ${opportunity_id}::uuid,
              ${workspace}::uuid,
              ${person.id}::uuid,
              ${pipeline}::uuid,
              ${entry_stage}::uuid,
              'COMMERCIAL',
              'OPEN',
              ${arrived_at}::timestamptz,
              CURRENT_TIMESTAMP
            )
          `);
          await transaction.$executeRawUnsafe(addColumn);
          await transaction.$executeRawUnsafe(backfill);
          const rows = await transaction.$queryRaw<
            Array<{ last_movement_at: Date; arrived_at: Date }>
          >(Prisma.sql`
            SELECT last_movement_at, arrived_at
            FROM opportunities
            WHERE id = ${opportunity_id}::uuid
          `);
          expect(rows).toHaveLength(1);
          expect(rows[0]?.last_movement_at.toISOString()).toBe(arrived_at.toISOString());
          expect(rows[0]?.arrived_at.toISOString()).toBe(arrived_at.toISOString());
          throw new Error(ROLLBACK_BACKFILL_FIXTURE);
        },
        { maxWait: 10_000, timeout: 20_000 }
      );
    } catch (error) {
      if (!(error instanceof Error) || error.message !== ROLLBACK_BACKFILL_FIXTURE) {
        throw error;
      }
    }
  });

  it("transfers movement facts to the canonical card on merge, and active reads ignore the tombstone", async () => {
    const person = await seeder.person.create({
      data: { workspace_id: workspace, name: "Pessoa com dois cards" }
    });
    const canonical_id = await seedOpportunity({ person_id: person.id });
    const absorbed_id = await seedOpportunity({ person_id: person.id });
    await moveLeadStage(
      attendant_context,
      { opportunity_id: absorbed_id, current_stage_id: entry_stage, stage_id: contact_stage },
      app
    );
    const review = await seeder.intakeReview.create({
      data: {
        workspace_id: workspace,
        opportunity_id: absorbed_id,
        type: "POSSIBLE_DUPLICATE",
        related_opportunity_id: canonical_id
      }
    });
    await resolveIntakeReview(
      manager_context,
      {
        review_id: review.id,
        resolution: "SAME_FINANCING",
        reason: "Mesma operacao de credito",
        resolved_at: new Date("2026-08-18T12:00:00.000Z")
      },
      app
    );

    expect((await movementFacts(canonical_id)).map((fact) => fact.type)).toEqual(["STAGE_CHANGED"]);
    expect(await movementFacts(absorbed_id)).toEqual([]);
    const listed_ids = (await listLeads(manager_context, { limit: 200 }, app)).map(
      (row) => row.opportunity_id
    );
    expect(listed_ids).toContain(canonical_id);
    expect(listed_ids).not.toContain(absorbed_id);
    await expect(getLead(manager_context, absorbed_id, app)).rejects.toThrow(
      /Lead not found in this workspace/
    );
    await expect(getLead(manager_context, canonical_id, app)).resolves.toMatchObject({
      opportunity_id: canonical_id
    });
  });
});
