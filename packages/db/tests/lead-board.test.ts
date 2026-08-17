import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createUserContextFromResolvedMembership } from "../src/access-context.js";
import { getLeadBoard, moveLeadStage, LeadStageMoveError } from "../src/lead-board.js";

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
const closing_stage = randomUUID();
const legal_pipeline = randomUUID();
const legal_stage = randomUUID();
const legal_closing_stage = randomUUID();

const attendant_user = randomUUID();
const other_attendant_user = randomUUID();
const supervisor_user = randomUUID();
const untagged_supervisor_user = randomUUID();
const team_attendant_user = randomUUID();
const other_team_user = randomUUID();
const manager_user = randomUUID();

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
const manager_context = createUserContextFromResolvedMembership({
  workspace_id: workspace,
  user_id: manager_user,
  role: "MANAGER"
});

let arrival_clock = new Date("2026-08-16T12:00:00.000Z").getTime();
function nextArrival(): Date {
  arrival_clock += 1000;
  return new Date(arrival_clock);
}

interface SeedCardOptions {
  readonly name?: string;
  readonly assigned_user_id?: string | null;
  readonly stage_id?: string;
  readonly pipeline_id?: string;
  readonly status?: "OPEN" | "WON" | "LOST";
  readonly merged_into_opportunity_id?: string | null;
  readonly arrived_at?: Date;
  readonly area?: "COMMERCIAL" | "LEGAL";
}

async function seedCard(options: SeedCardOptions = {}): Promise<{
  opportunity_id: string;
  arrived_at: Date;
}> {
  const person = await seeder.person.create({
    data: { workspace_id: workspace, name: options.name ?? "Lead do quadro" }
  });
  const arrived_at = options.arrived_at ?? nextArrival();
  const opportunity = await seeder.opportunity.create({
    data: {
      workspace_id: workspace,
      person_id: person.id,
      pipeline_id: options.pipeline_id ?? pipeline,
      stage_id: options.stage_id ?? entry_stage,
      area: options.area ?? "COMMERCIAL",
      status: options.status ?? "OPEN",
      arrived_at,
      assigned_user_id: options.assigned_user_id ?? null,
      merged_into_opportunity_id: options.merged_into_opportunity_id ?? null
    }
  });
  return { opportunity_id: opportunity.id, arrived_at };
}

function cardNames(board: Awaited<ReturnType<typeof getLeadBoard>>): string[] {
  return board.columns.flatMap((column) => column.cards.map((card) => card.name ?? ""));
}

beforeAll(async () => {
  await seeder.$transaction(async (transaction) => {
    await transaction.workspace.create({
      data: { id: workspace, slug: randomUUID(), name: "Quadro" }
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
            { id: contact_stage, label: "Em contato", position: 2, role: "NORMAL" },
            { id: closing_stage, label: "Conclusao", position: 3, role: "CLOSING" }
          ]
        }
      }
    });
    await transaction.pipeline.create({
      data: {
        id: legal_pipeline,
        workspace_id: workspace,
        name: "Juridico",
        type: "LEGAL",
        stages: {
          create: [
            { id: legal_stage, label: "Analise", position: 1, role: "ENTRY" },
            { id: legal_closing_stage, label: "Encerrado", position: 2, role: "CLOSING" }
          ]
        }
      }
    });
    await transaction.workspaceMember.createMany({
      data: [
        { workspace_id: workspace, user_id: attendant_user, role: "ATTENDANT", display_name: "Ana Atendente" },
        { workspace_id: workspace, user_id: other_attendant_user, role: "ATTENDANT", display_name: "Bia Atendente" },
        { workspace_id: workspace, user_id: supervisor_user, role: "SUPERVISOR", display_name: "Sofia Supervisora" },
        { workspace_id: workspace, user_id: untagged_supervisor_user, role: "SUPERVISOR", display_name: "Sem equipe" },
        { workspace_id: workspace, user_id: team_attendant_user, role: "ATTENDANT", display_name: "Tato do time" },
        { workspace_id: workspace, user_id: other_team_user, role: "ATTENDANT", display_name: "Outro time" },
        { workspace_id: workspace, user_id: manager_user, role: "MANAGER", display_name: "Marina Gestão" }
      ]
    });
    const [sharedTag, otherTag] = await Promise.all([
      transaction.tag.create({ data: { workspace_id: workspace, name: "ACR" } }),
      transaction.tag.create({ data: { workspace_id: workspace, name: "REAL" } })
    ]);
    await transaction.memberTag.createMany({
      data: [
        { workspace_id: workspace, user_id: supervisor_user, tag_id: sharedTag.id },
        { workspace_id: workspace, user_id: team_attendant_user, tag_id: sharedTag.id },
        { workspace_id: workspace, user_id: other_team_user, tag_id: otherTag.id }
      ]
    });
  });
});

afterAll(async () => {
  await seeder.workspace.deleteMany({ where: { id: workspace } });
  await seeder.$disconnect();
  await app.$disconnect();
});

describe("getLeadBoard", () => {
  it("builds one column per stage of the default commercial pipeline, in order", async () => {
    const board = await getLeadBoard(attendant_context, app);
    expect(board.pipeline_id).toBe(pipeline);
    expect(board.columns.map((column) => column.label)).toEqual([
      "Novo lead",
      "Em contato",
      "Conclusao"
    ]);
    expect(board.columns.map((column) => column.stage_id)).toEqual([
      entry_stage,
      contact_stage,
      closing_stage
    ]);
  });

  it("gives the ATTENDANT only the cards assigned to them", async () => {
    await seedCard({ name: "Meu card", assigned_user_id: attendant_user });
    await seedCard({ name: "Card da colega", assigned_user_id: other_attendant_user });
    await seedCard({ name: "Card da fila", assigned_user_id: null });

    const board = await getLeadBoard(attendant_context, app);
    expect(cardNames(board)).toContain("Meu card");
    expect(cardNames(board)).not.toContain("Card da colega");
    expect(cardNames(board)).not.toContain("Card da fila");
  });

  it("gives the SUPERVISOR the team's assigned cards and never the ownerless queue", async () => {
    await seedCard({ name: "Card do time", assigned_user_id: team_attendant_user });
    await seedCard({ name: "Card de outro time", assigned_user_id: other_team_user });
    await seedCard({ name: "Fila sem dono do supervisor", assigned_user_id: null });

    const board = await getLeadBoard(supervisor_context, app);
    expect(cardNames(board)).toContain("Card do time");
    expect(cardNames(board)).not.toContain("Card de outro time");
    expect(cardNames(board)).not.toContain("Fila sem dono do supervisor");
  });

  it("leaves the SUPERVISOR without a tag with an empty board, not the queue as a consolation", async () => {
    const board = await getLeadBoard(untagged_supervisor_context, app);
    expect(board.columns).not.toHaveLength(0);
    expect(cardNames(board)).toEqual([]);
  });

  it("has no scope for Gestão — the board belongs to whoever attends", async () => {
    const board = await getLeadBoard(manager_context, app);
    expect(cardNames(board)).toEqual([]);
  });

  it("keeps won, lost and merged cards off the board", async () => {
    const absorbing = await seedCard({ name: "Absorve", assigned_user_id: attendant_user });
    await seedCard({ name: "Ganho", assigned_user_id: attendant_user, status: "WON" });
    await seedCard({ name: "Perdido", assigned_user_id: attendant_user, status: "LOST" });
    await seedCard({
      name: "Mesclado",
      assigned_user_id: attendant_user,
      merged_into_opportunity_id: absorbing.opportunity_id
    });

    const names = cardNames(await getLeadBoard(attendant_context, app));
    expect(names).toContain("Absorve");
    expect(names).not.toContain("Ganho");
    expect(names).not.toContain("Perdido");
    expect(names).not.toContain("Mesclado");
  });

  it("drops a card in the column of its stage, carrying who is responsible", async () => {
    const card = await seedCard({
      name: "Card em contato",
      assigned_user_id: team_attendant_user,
      stage_id: contact_stage
    });
    const board = await getLeadBoard(supervisor_context, app);
    const column = board.columns.find((item) => item.stage_id === contact_stage);
    const placed = column?.cards.find((item) => item.opportunity_id === card.opportunity_id);
    expect(placed).toMatchObject({
      name: "Card em contato",
      stage_id: contact_stage,
      assigned_user_id: team_attendant_user,
      assigned_user_name: "Tato do time"
    });
  });
});

describe("moveLeadStage", () => {
  it("persists the new stage without touching arrived_at", async () => {
    const card = await seedCard({ name: "Vai avançar", assigned_user_id: attendant_user });

    const moved = await moveLeadStage(
      attendant_context,
      { opportunity_id: card.opportunity_id, current_stage_id: entry_stage, stage_id: contact_stage },
      app
    );

    expect(moved).toEqual({ opportunity_id: card.opportunity_id, stage_id: contact_stage });
    const row = await seeder.opportunity.findUniqueOrThrow({ where: { id: card.opportunity_id } });
    expect(row.stage_id).toBe(contact_stage);
    expect(row.arrived_at.toISOString()).toBe(card.arrived_at.toISOString());
  });

  it("lets the database arbitrate two concurrent drags by the current stage", async () => {
    const card = await seedCard({ name: "Disputado", assigned_user_id: attendant_user });

    await moveLeadStage(
      attendant_context,
      { opportunity_id: card.opportunity_id, current_stage_id: entry_stage, stage_id: contact_stage },
      app
    );

    // The second drag started from the same stale read of "Novo lead".
    await expect(
      moveLeadStage(
        attendant_context,
        { opportunity_id: card.opportunity_id, current_stage_id: entry_stage, stage_id: closing_stage },
        app
      )
    ).rejects.toMatchObject({ reason: "STAGE_CHANGED" });

    const row = await seeder.opportunity.findUniqueOrThrow({ where: { id: card.opportunity_id } });
    expect(row.stage_id).toBe(contact_stage);
  });

  it("produces exactly one winner when two drags of the same card race", async () => {
    const card = await seedCard({ name: "Corrida", assigned_user_id: attendant_user });

    const outcomes = await Promise.allSettled([
      moveLeadStage(
        attendant_context,
        { opportunity_id: card.opportunity_id, current_stage_id: entry_stage, stage_id: contact_stage },
        app
      ),
      moveLeadStage(
        attendant_context,
        { opportunity_id: card.opportunity_id, current_stage_id: entry_stage, stage_id: closing_stage },
        app
      )
    ]);

    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const loser = outcomes.find((outcome) => outcome.status === "rejected");
    expect(loser?.reason).toMatchObject({ reason: "STAGE_CHANGED" });

    // The row holds the winner's stage, and nothing in between.
    const row = await seeder.opportunity.findUniqueOrThrow({ where: { id: card.opportunity_id } });
    expect([contact_stage, closing_stage]).toContain(row.stage_id);
  });

  it("refuses a card that is not on the board's pipeline at all", async () => {
    const card = await seedCard({
      name: "Card do juridico",
      assigned_user_id: attendant_user,
      pipeline_id: legal_pipeline,
      stage_id: legal_stage,
      area: "LEGAL"
    });

    await expect(
      moveLeadStage(
        attendant_context,
        {
          opportunity_id: card.opportunity_id,
          current_stage_id: legal_stage,
          stage_id: legal_closing_stage
        },
        app
      )
    ).rejects.toMatchObject({ reason: "NOT_VISIBLE" });

    const row = await seeder.opportunity.findUniqueOrThrow({ where: { id: card.opportunity_id } });
    expect(row.stage_id).toBe(legal_stage);
  });

  it("refuses a won card", async () => {
    const card = await seedCard({ assigned_user_id: attendant_user, status: "WON" });
    await expect(
      moveLeadStage(
        attendant_context,
        { opportunity_id: card.opportunity_id, current_stage_id: entry_stage, stage_id: contact_stage },
        app
      )
    ).rejects.toMatchObject({ reason: "OPPORTUNITY_CLOSED" });
  });

  it("refuses a lost card", async () => {
    const card = await seedCard({ assigned_user_id: attendant_user, status: "LOST" });
    await expect(
      moveLeadStage(
        attendant_context,
        { opportunity_id: card.opportunity_id, current_stage_id: entry_stage, stage_id: contact_stage },
        app
      )
    ).rejects.toMatchObject({ reason: "OPPORTUNITY_CLOSED" });
  });

  it("refuses a merged card", async () => {
    const absorbing = await seedCard({ assigned_user_id: attendant_user });
    const card = await seedCard({
      assigned_user_id: attendant_user,
      merged_into_opportunity_id: absorbing.opportunity_id
    });
    await expect(
      moveLeadStage(
        attendant_context,
        { opportunity_id: card.opportunity_id, current_stage_id: entry_stage, stage_id: contact_stage },
        app
      )
    ).rejects.toMatchObject({ reason: "OPPORTUNITY_MERGED" });
  });

  it("refuses a stage of another pipeline", async () => {
    const card = await seedCard({ assigned_user_id: attendant_user });
    await expect(
      moveLeadStage(
        attendant_context,
        { opportunity_id: card.opportunity_id, current_stage_id: entry_stage, stage_id: legal_stage },
        app
      )
    ).rejects.toMatchObject({ reason: "DESTINATION_OUTSIDE_PIPELINE" });

    const row = await seeder.opportunity.findUniqueOrThrow({ where: { id: card.opportunity_id } });
    expect(row.stage_id).toBe(entry_stage);
  });

  it("refuses a card outside the actor's board", async () => {
    const card = await seedCard({ assigned_user_id: other_attendant_user });
    await expect(
      moveLeadStage(
        attendant_context,
        { opportunity_id: card.opportunity_id, current_stage_id: entry_stage, stage_id: contact_stage },
        app
      )
    ).rejects.toMatchObject({ reason: "NOT_VISIBLE" });
  });

  it("lets the SUPERVISOR move a card of their own team", async () => {
    const card = await seedCard({ assigned_user_id: team_attendant_user });
    await expect(
      moveLeadStage(
        supervisor_context,
        { opportunity_id: card.opportunity_id, current_stage_id: entry_stage, stage_id: contact_stage },
        app
      )
    ).resolves.toEqual({ opportunity_id: card.opportunity_id, stage_id: contact_stage });
  });

  it("refuses the SUPERVISOR a card of another team", async () => {
    const card = await seedCard({ assigned_user_id: other_team_user });
    await expect(
      moveLeadStage(
        supervisor_context,
        { opportunity_id: card.opportunity_id, current_stage_id: entry_stage, stage_id: contact_stage },
        app
      )
    ).rejects.toBeInstanceOf(LeadStageMoveError);
  });

  it("refuses Gestão, whose board scope is empty", async () => {
    const card = await seedCard({ assigned_user_id: attendant_user });
    await expect(
      moveLeadStage(
        manager_context,
        { opportunity_id: card.opportunity_id, current_stage_id: entry_stage, stage_id: contact_stage },
        app
      )
    ).rejects.toMatchObject({ reason: "NOT_VISIBLE" });
  });
});
