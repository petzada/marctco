import {
  assertPipelineStageInvariants,
  type StageRole
} from "@marctco/domain";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { UserContext } from "./access-context.js";
import { createPrismaClient } from "./client.js";
import {
  type ScopedTransactionClient,
  withAccessContext
} from "./internal/scoped-transaction.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EDITOR_ROLES = new Set(["MANAGER", "OWNER"]);
const STAGE_ROLES = new Set<StageRole>(["ENTRY", "CLOSING", "LEGAL_HANDOFF", "NORMAL"]);
const sharedPrisma = createPrismaClient();

interface StoredStage {
  readonly id: string;
  readonly pipeline_id: string;
  readonly position: number;
  readonly role: StageRole;
}

interface StoredPipeline {
  readonly id: string;
  readonly type: "COMMERCIAL" | "LEGAL";
  readonly is_default: boolean;
}

interface LockedRecord {
  readonly id: string;
}

export interface ReorderStagesInput {
  readonly pipeline_id: string;
  readonly ordered_stage_ids: readonly string[];
}

export interface StageRoleAssignment {
  readonly stage_id: string;
  readonly role: StageRole;
}

export interface ReplaceStageRolesInput {
  readonly pipeline_id: string;
  readonly stages: readonly StageRoleAssignment[];
}

export interface DeleteStageInput {
  readonly stage_id: string;
  readonly replacement_stage_id?: string;
}

export interface DeletePipelineInput {
  readonly pipeline_id: string;
  readonly replacement_default_pipeline_id?: string;
}

function assertUuid(value: string, label: string): void {
  if (!UUID_PATTERN.test(value)) {
    throw new Error(`${label} must be a UUID`);
  }
}

function assertPipelineEditor(context: UserContext): void {
  if (!EDITOR_ROLES.has(context.role)) {
    throw new Error("Only MANAGER or OWNER can edit pipelines");
  }
}

function assertNoDuplicateIds(ids: readonly string[], label: string): void {
  const unique = new Set(ids);
  if (unique.size !== ids.length) {
    throw new Error(`${label} must not contain duplicate stage IDs`);
  }
}

function assertKnownRole(role: string): asserts role is StageRole {
  if (!STAGE_ROLES.has(role as StageRole)) {
    throw new Error(`Unknown stage role: ${JSON.stringify(role)}`);
  }
}

async function stagesForPipeline(
  transaction: ScopedTransactionClient,
  pipeline_id: string
): Promise<StoredStage[]> {
  return transaction.$queryRaw<StoredStage[]>`
    SELECT id, pipeline_id, position, role::text AS role
    FROM stages
    WHERE pipeline_id = ${pipeline_id}::uuid
    ORDER BY position, id
    FOR UPDATE
  `;
}

async function lockPipeline(
  transaction: ScopedTransactionClient,
  pipeline_id: string
): Promise<void> {
  const rows = await transaction.$queryRaw<LockedRecord[]>`
    SELECT id
    FROM pipelines
    WHERE id = ${pipeline_id}::uuid
    FOR UPDATE
  `;
  if (rows.length !== 1) {
    throw new Error("Pipeline was not found in this workspace");
  }
}

async function lockWorkspace(
  transaction: ScopedTransactionClient,
  workspace_id: string
): Promise<void> {
  const rows = await transaction.$queryRaw<LockedRecord[]>`
    SELECT id
    FROM workspaces
    WHERE id = ${workspace_id}::uuid
    FOR UPDATE
  `;
  if (rows.length !== 1) {
    throw new Error("Workspace was not found");
  }
}

function assertExactStageSet(expected: readonly StoredStage[], supplied: readonly string[]): void {
  if (expected.length !== supplied.length) {
    throw new Error("Every stage in the pipeline must be named exactly once");
  }
  const expected_ids = new Set(expected.map((stage) => stage.id));
  if (supplied.some((id) => !expected_ids.has(id))) {
    throw new Error("Every stage must belong to the selected pipeline");
  }
}

/**
 * Writes all positions in one statement inside the tenant-scoped transaction.
 * The caller supplies the desired order; the module owns validation and the
 * contiguous 1-based positions, so no caller can create a tie accidentally.
 */
export async function reorderStages(
  context: UserContext,
  input: ReorderStagesInput,
  prisma: PrismaClient = sharedPrisma
): Promise<void> {
  assertPipelineEditor(context);
  assertUuid(input.pipeline_id, "pipeline_id");
  if (input.ordered_stage_ids.length === 0) {
    throw new Error("A pipeline must retain its stages");
  }
  for (const stage_id of input.ordered_stage_ids) {
    assertUuid(stage_id, "ordered_stage_ids");
  }
  assertNoDuplicateIds(input.ordered_stage_ids, "ordered_stage_ids");

  await withAccessContext(prisma, context, async (transaction) => {
    await lockPipeline(transaction, input.pipeline_id);
    const stages = await stagesForPipeline(transaction, input.pipeline_id);
    assertExactStageSet(stages, input.ordered_stage_ids);

    const positions = Prisma.join(
      input.ordered_stage_ids.map(
        (stage_id, index) => Prisma.sql`(${stage_id}::uuid, ${index + 1}::integer)`
      )
    );
    await transaction.$executeRaw`
      UPDATE stages AS stage
      SET position = requested.position,
          updated_at = CURRENT_TIMESTAMP
      FROM (VALUES ${positions}) AS requested(id, position)
      WHERE stage.id = requested.id
        AND stage.pipeline_id = ${input.pipeline_id}::uuid
    `;
  });
}

/**
 * Replaces all system roles at once. Requiring the complete stage set lets the
 * pure invariant validate the resulting pipeline before any row is changed.
 */
export async function replaceStageRoles(
  context: UserContext,
  input: ReplaceStageRolesInput,
  prisma: PrismaClient = sharedPrisma
): Promise<void> {
  assertPipelineEditor(context);
  assertUuid(input.pipeline_id, "pipeline_id");
  if (input.stages.length === 0) {
    throw new Error("A pipeline must retain its stages");
  }
  for (const stage of input.stages) {
    assertUuid(stage.stage_id, "stage_id");
    assertKnownRole(stage.role);
  }
  assertNoDuplicateIds(
    input.stages.map((stage) => stage.stage_id),
    "stages"
  );

  await withAccessContext(prisma, context, async (transaction) => {
    await lockPipeline(transaction, input.pipeline_id);
    const stored_stages = await stagesForPipeline(transaction, input.pipeline_id);
    const stage_ids = input.stages.map((stage) => stage.stage_id);
    assertExactStageSet(stored_stages, stage_ids);

    const role_by_stage_id = new Map(input.stages.map((stage) => [stage.stage_id, stage.role]));
    assertPipelineStageInvariants(
      stored_stages.map((stage) => ({
        position: stage.position,
        role: role_by_stage_id.get(stage.id) ?? stage.role
      }))
    );

    const assignments = Prisma.join(
      input.stages.map(
        (stage) => Prisma.sql`(${stage.stage_id}::uuid, ${stage.role}::stage_role)`
      )
    );
    await transaction.$executeRaw`
      UPDATE stages AS stage
      SET role = replacement.role,
          updated_at = CURRENT_TIMESTAMP
      FROM (VALUES ${assignments}) AS replacement(id, role)
      WHERE stage.id = replacement.id
        AND stage.pipeline_id = ${input.pipeline_id}::uuid
    `;
  });
}

/**
 * Deletes an empty stage in a single transaction. If its system role is the
 * only remaining ENTRY/CLOSING, a replacement stage must assume it atomically.
 * Opportunity migration is intentionally added with Opportunity in ticket 09.
 */
export async function deleteStage(
  context: UserContext,
  input: DeleteStageInput,
  prisma: PrismaClient = sharedPrisma
): Promise<void> {
  assertPipelineEditor(context);
  assertUuid(input.stage_id, "stage_id");
  if (input.replacement_stage_id !== undefined) {
    assertUuid(input.replacement_stage_id, "replacement_stage_id");
    if (input.replacement_stage_id === input.stage_id) {
      throw new Error("A stage cannot replace itself");
    }
  }

  await withAccessContext(prisma, context, async (transaction) => {
    const target_rows = await transaction.$queryRaw<StoredStage[]>`
      SELECT stage.id, stage.pipeline_id, stage.position, stage.role::text AS role
      FROM stages AS stage
      JOIN pipelines AS pipeline
        ON pipeline.id = stage.pipeline_id
       AND pipeline.workspace_id = stage.workspace_id
      WHERE stage.id = ${input.stage_id}::uuid
      FOR UPDATE OF pipeline
    `;
    const target = target_rows[0];
    if (!target) {
      throw new Error("Stage was not found in this workspace");
    }
    const stages = await stagesForPipeline(transaction, target.pipeline_id);
    const replacement = input.replacement_stage_id
      ? stages.find((stage) => stage.id === input.replacement_stage_id)
      : undefined;
    if (input.replacement_stage_id !== undefined && !replacement) {
      throw new Error("Replacement stage must belong to the same pipeline");
    }

    const is_only_closing =
      target.role === "CLOSING" && stages.filter((stage) => stage.role === "CLOSING").length === 1;
    if ((target.role === "ENTRY" || is_only_closing) && !replacement) {
      throw new Error("Deleting the final required stage needs a replacement in the same operation");
    }
    if (target.role === "NORMAL" || target.role === "LEGAL_HANDOFF") {
      if (replacement) {
        throw new Error("Only a required stage can be replaced during deletion");
      }
    }

    const final_stages = stages
      .filter((stage) => stage.id !== target.id)
      .map((stage) => ({
        position: stage.position,
        role: stage.id === replacement?.id ? target.role : stage.role
      }));
    assertPipelineStageInvariants(final_stages);

    await transaction.$executeRaw`
      DELETE FROM stages
      WHERE id = ${target.id}::uuid
    `;
    if (replacement) {
      await transaction.$executeRaw`
        UPDATE stages
        SET role = ${target.role}::stage_role,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${replacement.id}::uuid
      `;
    }
  });
}

/**
 * Deletes a pipeline only after moving the commercial-default responsibility
 * to another pipeline in the same tenant. The sequence is one transaction, so
 * no visible state lacks a default destination for ingestion.
 */
export async function deletePipeline(
  context: UserContext,
  input: DeletePipelineInput,
  prisma: PrismaClient = sharedPrisma
): Promise<void> {
  assertPipelineEditor(context);
  assertUuid(input.pipeline_id, "pipeline_id");
  if (input.replacement_default_pipeline_id !== undefined) {
    assertUuid(input.replacement_default_pipeline_id, "replacement_default_pipeline_id");
    if (input.replacement_default_pipeline_id === input.pipeline_id) {
      throw new Error("A pipeline cannot replace itself as default");
    }
  }

  await withAccessContext(prisma, context, async (transaction) => {
    await lockWorkspace(transaction, context.workspace_id);
    const target_rows = await transaction.$queryRaw<StoredPipeline[]>`
      SELECT id, type::text AS type, is_default
      FROM pipelines
      WHERE id = ${input.pipeline_id}::uuid
      FOR UPDATE
    `;
    const target = target_rows[0];
    if (!target) {
      throw new Error("Pipeline was not found in this workspace");
    }

    const needs_replacement = target.type === "COMMERCIAL" && target.is_default;
    if (needs_replacement !== (input.replacement_default_pipeline_id !== undefined)) {
      throw new Error(
        needs_replacement
          ? "Deleting the default commercial pipeline needs a replacement"
          : "Only the default commercial pipeline accepts a replacement"
      );
    }

    if (input.replacement_default_pipeline_id !== undefined) {
      const replacement_rows = await transaction.$queryRaw<StoredPipeline[]>`
        SELECT id, type::text AS type, is_default
        FROM pipelines
        WHERE id = ${input.replacement_default_pipeline_id}::uuid
        FOR UPDATE
      `;
      const replacement = replacement_rows[0];
      if (!replacement || replacement.type !== "COMMERCIAL" || replacement.is_default) {
        throw new Error("Replacement must be a non-default commercial pipeline in this workspace");
      }
    }

    await transaction.$executeRaw`
      DELETE FROM pipelines
      WHERE id = ${target.id}::uuid
    `;
    if (input.replacement_default_pipeline_id !== undefined) {
      await transaction.$executeRaw`
        UPDATE pipelines
        SET is_default = true,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${input.replacement_default_pipeline_id}::uuid
      `;
    }
  });
}
