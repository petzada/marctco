import { describe, expect, it } from "vitest";
import {
  assertPipelineDefinition,
  assertPipelineStageInvariants,
  defaultCommercialPipeline
} from "./pipelines.js";

describe("defaultCommercialPipeline", () => {
  it("is a usable commercial default with a stable system role for entry and closing", () => {
    expect(defaultCommercialPipeline).toMatchObject({
      name: "Comercial",
      type: "COMMERCIAL",
      is_default: true
    });
    expect(defaultCommercialPipeline.stages).toEqual([
      { label: "Novo lead", position: 1, role: "ENTRY" },
      { label: "Em atendimento", position: 2, role: "NORMAL" },
      { label: "Negociação final", position: 3, role: "CLOSING" }
    ]);
    expect(() => assertPipelineDefinition(defaultCommercialPipeline)).not.toThrow();
  });

  it("makes a missing entry, missing closing or tied positions invalid without consulting a database", () => {
    expect(() =>
      assertPipelineStageInvariants([{ position: 1, role: "CLOSING" }])
    ).toThrow(/exactly one ENTRY/i);
    expect(() =>
      assertPipelineStageInvariants([{ position: 1, role: "ENTRY" }])
    ).toThrow(/at least one CLOSING/i);
    expect(() =>
      assertPipelineStageInvariants([
        { position: 1, role: "ENTRY" },
        { position: 1, role: "CLOSING" }
      ])
    ).toThrow(/positions must be unique/i);
  });
});
