import { Prisma, type PrismaClient } from "@prisma/client";
import { decideLeadStageMove, type StageMoveStatus } from "@marctco/domain";
import type { UserContext } from "./access-context.js";
import { createPrismaClient } from "./client.js";
import { assertUuid } from "./internal/uuid.js";
import { withAccessContext } from "./internal/scoped-transaction.js";

const sharedPrisma = createPrismaClient();

/**
 * The Kanban "Meus leads" — the screen of whoever attends. `getLeadBoard`
 * answers the whole question the board asks (which columns, which cards, in
 * which column), so the screen never assembles a `where` (ADR-0013,
 * ADR-0016), and `moveLeadStage` is the only way a drag reaches the database.
 */

// ---------------------------------------------------------------------------
// Board scope — who has a board at all
// ---------------------------------------------------------------------------

/**
 * The board's own scope, deliberately narrower than `opportunityScopeSql`.
 *
 * `ATTENDANT` sees the cards assigned to them and `SUPERVISOR` the ones
 * already assigned inside their team — never the ownerless queue, which
 * belongs to Gestão and Direção (ADR-0024). Gestão and Direção get the empty
 * set, because the board is the screen of who attends and they do not: the
 * matrix in ADR-0015 records "—" for them, an **absence of scope** and not a
 * refusal, and the whole workspace here would be the global Kanban that
 * `decisao-features-concorrentes.md` §4 turned down, wearing the name "Meus
 * leads". The web route sends those two profiles to Leads, which shows them
 * everything this board would have and more.
 */
function boardScopeSql(context: UserContext, alias: string): Prisma.Sql {
  const opportunity = Prisma.raw(alias);
  switch (context.role) {
    case "ATTENDANT":
      return Prisma.sql`AND ${opportunity}.assigned_user_id = ${context.user_id}::uuid`;
    case "SUPERVISOR":
      return Prisma.sql`
        AND ${opportunity}.assigned_user_id IN (
          SELECT member.user_id
          FROM workspace_members AS member
          WHERE member.workspace_id = ${context.workspace_id}::uuid
            AND member.status = 'ACTIVE'::workspace_member_status
            AND EXISTS (
              SELECT 1
              FROM member_tags AS member_tag
              JOIN member_tags AS actor_tag
                ON actor_tag.workspace_id = member_tag.workspace_id
               AND actor_tag.tag_id = member_tag.tag_id
              WHERE member_tag.workspace_id = member.workspace_id
                AND member_tag.user_id = member.user_id
                AND actor_tag.user_id = ${context.user_id}::uuid
            )
        )
      `;
    case "MANAGER":
    case "OWNER":
      return Prisma.sql`AND false`;
    default: {
      const unknownRole: never = context.role;
      throw new Error(`Unknown workspace role, refusing board access: ${JSON.stringify(unknownRole)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// getLeadBoard
// ---------------------------------------------------------------------------

export interface LeadBoardCard {
  readonly opportunity_id: string;
  readonly stage_id: string;
  readonly name: string | null;
  readonly assigned_user_id: string | null;
  readonly assigned_user_name: string | null;
  readonly arrived_at: Date;
}

export interface LeadBoardColumn {
  readonly stage_id: string;
  readonly label: string;
  readonly position: number;
  readonly cards: readonly LeadBoardCard[];
}

export interface LeadBoard {
  /** `null` when the workspace has no default commercial pipeline yet. */
  readonly pipeline_id: string | null;
  readonly columns: readonly LeadBoardColumn[];
}

interface BoardStageRow {
  readonly stage_id: string;
  readonly pipeline_id: string;
  readonly label: string;
  readonly position: number;
}

interface BoardCardRow {
  readonly opportunity_id: string;
  readonly stage_id: string;
  readonly name: string | null;
  readonly assigned_user_id: string | null;
  readonly assigned_user_name: string | null;
  readonly arrived_at: Date;
}

/**
 * Columns are the stages of the default commercial pipeline, in `position`
 * order — `WON`/`LOST` are a status and never a column (ADR-0009), so the
 * board only ever carries the open journey. Cards are `OPEN`, unmerged
 * Opportunities of that same pipeline, inside the actor's board scope.
 */
export async function getLeadBoard(
  context: UserContext,
  prisma: PrismaClient = sharedPrisma
): Promise<LeadBoard> {
  return withAccessContext(prisma, context, async (transaction) => {
    const stages = await transaction.$queryRaw<BoardStageRow[]>(Prisma.sql`
      SELECT stage.id AS stage_id, stage.pipeline_id, stage.label, stage.position
      FROM stages AS stage
      JOIN pipelines AS commercial
        ON commercial.workspace_id = stage.workspace_id AND commercial.id = stage.pipeline_id
      WHERE stage.workspace_id = ${context.workspace_id}::uuid
        AND commercial.type = 'COMMERCIAL'::pipeline_type
        AND commercial.is_default = true
      ORDER BY stage.position ASC
    `);
    const pipeline_id = stages[0]?.pipeline_id ?? null;
    if (pipeline_id === null) {
      return { pipeline_id: null, columns: [] };
    }

    const cards = await transaction.$queryRaw<BoardCardRow[]>(Prisma.sql`
      SELECT
        opportunity.id AS opportunity_id,
        opportunity.stage_id,
        person.name,
        opportunity.assigned_user_id,
        assignee.display_name AS assigned_user_name,
        opportunity.arrived_at
      FROM opportunities AS opportunity
      JOIN persons AS person
        ON person.workspace_id = opportunity.workspace_id AND person.id = opportunity.person_id
      LEFT JOIN workspace_members AS assignee
        ON assignee.workspace_id = opportunity.workspace_id
       AND assignee.user_id = opportunity.assigned_user_id
      WHERE opportunity.workspace_id = ${context.workspace_id}::uuid
        AND opportunity.pipeline_id = ${pipeline_id}::uuid
        AND opportunity.status = 'OPEN'::opportunity_status
        AND opportunity.merged_into_opportunity_id IS NULL
        ${boardScopeSql(context, "opportunity")}
      ORDER BY opportunity.arrived_at DESC, opportunity.id DESC
    `);

    const cardsByStage = new Map<string, LeadBoardCard[]>();
    for (const card of cards) {
      const column = cardsByStage.get(card.stage_id) ?? [];
      column.push(card);
      cardsByStage.set(card.stage_id, column);
    }

    return {
      pipeline_id,
      columns: stages.map((stage) => ({
        stage_id: stage.stage_id,
        label: stage.label,
        position: stage.position,
        cards: cardsByStage.get(stage.stage_id) ?? []
      }))
    };
  });
}

// ---------------------------------------------------------------------------
// moveLeadStage
// ---------------------------------------------------------------------------

export interface MoveLeadStageInput {
  readonly opportunity_id: string;
  /** The stage the card was sitting on when the drag started. */
  readonly current_stage_id: string;
  readonly stage_id: string;
}

export interface MovedLeadStage {
  readonly opportunity_id: string;
  readonly stage_id: string;
}

export type LeadStageMoveRefusal =
  | "NOT_VISIBLE"
  | "OPPORTUNITY_CLOSED"
  | "OPPORTUNITY_MERGED"
  | "DESTINATION_NOT_A_STAGE"
  | "DESTINATION_OUTSIDE_PIPELINE"
  | "STAGE_CHANGED";

export class LeadStageMoveError extends Error {
  constructor(readonly reason: LeadStageMoveRefusal) {
    super(reason);
    this.name = "LeadStageMoveError";
  }
}

interface MovableCardRow {
  readonly status: StageMoveStatus;
  readonly pipeline_id: string;
  readonly stage_id: string;
  readonly merged_into_opportunity_id: string | null;
}

/**
 * A drag, and the only way one becomes a row. The pure decision in
 * `@marctco/domain` names the refusal a person reads; the `WHERE` below
 * repeats every one of its facts as a condition, because what arbitrates two
 * attendants dragging the same card is the database, never the read that came
 * first (ADR-0013). `current_stage_id` is the caller's picture of the board:
 * if the card already left that stage, the `UPDATE` matches nothing and the
 * loser learns it instead of overwriting the winner.
 *
 * `arrived_at` is not in the `SET`. Moving a card is the attendant conducting
 * the day, not the lead arriving again — the attendance clock the Fase 3 SLA
 * reads from that column cannot restart on a drag (ADR-0007 §Mecanismo 2).
 */
export async function moveLeadStage(
  context: UserContext,
  input: MoveLeadStageInput,
  prisma: PrismaClient = sharedPrisma
): Promise<MovedLeadStage> {
  assertUuid(input.opportunity_id, "opportunity_id");
  assertUuid(input.current_stage_id, "current_stage_id");
  assertUuid(input.stage_id, "stage_id");

  return withAccessContext(prisma, context, async (transaction) => {
    // Loaded without the `OPEN`/unmerged filters on purpose: those are what
    // the refusal has to be able to name, and filtering them here would
    // collapse "ganho" and "mesclado" into "não é seu".
    const cardRows = await transaction.$queryRaw<MovableCardRow[]>(Prisma.sql`
      SELECT
        opportunity.status::text AS status,
        opportunity.pipeline_id,
        opportunity.stage_id,
        opportunity.merged_into_opportunity_id
      FROM opportunities AS opportunity
      WHERE opportunity.id = ${input.opportunity_id}::uuid
        AND opportunity.workspace_id = ${context.workspace_id}::uuid
        ${boardScopeSql(context, "opportunity")}
    `);
    const card = cardRows[0];
    if (!card) {
      throw new LeadStageMoveError("NOT_VISIBLE");
    }

    const destinationRows = await transaction.$queryRaw<Array<{ pipeline_id: string }>>(Prisma.sql`
      SELECT stage.pipeline_id
      FROM stages AS stage
      WHERE stage.id = ${input.stage_id}::uuid
        AND stage.workspace_id = ${context.workspace_id}::uuid
    `);
    const destination = destinationRows[0];
    if (!destination) {
      throw new LeadStageMoveError("DESTINATION_NOT_A_STAGE");
    }

    const decision = decideLeadStageMove({
      opportunity: card,
      destination: { stage_id: input.stage_id, pipeline_id: destination.pipeline_id }
    });
    if (!decision.allowed) {
      throw new LeadStageMoveError(decision.reason);
    }

    const moved = await transaction.$executeRaw(Prisma.sql`
      UPDATE opportunities AS opportunity
      SET stage_id = ${input.stage_id}::uuid, updated_at = CURRENT_TIMESTAMP
      WHERE opportunity.id = ${input.opportunity_id}::uuid
        AND opportunity.workspace_id = ${context.workspace_id}::uuid
        AND opportunity.stage_id = ${input.current_stage_id}::uuid
        AND opportunity.pipeline_id = ${destination.pipeline_id}::uuid
        AND opportunity.status = 'OPEN'::opportunity_status
        AND opportunity.merged_into_opportunity_id IS NULL
        ${boardScopeSql(context, "opportunity")}
    `);
    if (moved === 0) {
      throw new LeadStageMoveError("STAGE_CHANGED");
    }

    return { opportunity_id: input.opportunity_id, stage_id: input.stage_id };
  });
}
