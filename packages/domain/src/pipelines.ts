export const PIPELINE_TYPES = ["COMMERCIAL", "LEGAL"] as const;
export type PipelineType = (typeof PIPELINE_TYPES)[number];

export const STAGE_ROLES = ["ENTRY", "CLOSING", "LEGAL_HANDOFF", "NORMAL"] as const;
export type StageRole = (typeof STAGE_ROLES)[number];

export interface StageDefinition {
  readonly label: string;
  readonly position: number;
  readonly role: StageRole;
}

export interface PipelineDefinition {
  readonly name: string;
  readonly type: PipelineType;
  readonly is_default: boolean;
  readonly stages: readonly StageDefinition[];
}

/**
 * The only initial commercial flow. It is data, rather than a seed-specific
 * recipe, so the development seed and the production provisioner can consume
 * exactly the same definition (ADR-0009).
 */
export const defaultCommercialPipeline: PipelineDefinition = {
  name: "Comercial",
  type: "COMMERCIAL",
  is_default: true,
  stages: [
    { label: "Novo lead", position: 1, role: "ENTRY" },
    { label: "Em atendimento", position: 2, role: "NORMAL" },
    { label: "Negociação final", position: 3, role: "CLOSING" }
  ]
};

export interface PipelineInvariantStage {
  readonly position: number;
  readonly role: StageRole;
}

/**
 * Pure invariant used to validate the canonical definition and role changes.
 * Labels deliberately do not participate: behavior is anchored on role/ID,
 * never a customer-editable name.
 */
export function assertPipelineStageInvariants(
  stages: readonly PipelineInvariantStage[]
): void {
  const positions = new Set<number>();
  let entry_count = 0;
  let closing_count = 0;

  for (const stage of stages) {
    if (!Number.isInteger(stage.position) || stage.position < 1) {
      throw new Error("Stage position must be a positive integer");
    }
    if (positions.has(stage.position)) {
      throw new Error("Stage positions must be unique within a pipeline");
    }
    positions.add(stage.position);

    if (stage.role === "ENTRY") {
      entry_count += 1;
    }
    if (stage.role === "CLOSING") {
      closing_count += 1;
    }
  }

  if (entry_count !== 1) {
    throw new Error("A pipeline must have exactly one ENTRY stage");
  }
  if (closing_count < 1) {
    throw new Error("A pipeline must have at least one CLOSING stage");
  }
}

/** Validates a pipeline definition before either seed/provisioning persists it. */
export function assertPipelineDefinition(definition: PipelineDefinition): void {
  if (!definition.name.trim()) {
    throw new Error("Pipeline name must not be empty");
  }
  if (!PIPELINE_TYPES.includes(definition.type)) {
    throw new Error(`Unknown pipeline type: ${definition.type}`);
  }
  if (definition.type !== "COMMERCIAL" || !definition.is_default) {
    throw new Error("The default pipeline definition must be commercial and marked default");
  }
  for (const stage of definition.stages) {
    if (!stage.label.trim()) {
      throw new Error("Stage label must not be empty");
    }
    if (!STAGE_ROLES.includes(stage.role)) {
      throw new Error(`Unknown stage role: ${stage.role}`);
    }
  }
  assertPipelineStageInvariants(definition.stages);
}

assertPipelineDefinition(defaultCommercialPipeline);
