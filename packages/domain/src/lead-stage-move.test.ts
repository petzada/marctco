import { describe, expect, it } from "vitest";
import { decideLeadStageMove, type StageMoveOpportunity } from "./lead-stage-move.js";

const open: StageMoveOpportunity = {
  status: "OPEN",
  pipeline_id: "commercial",
  stage_id: "entry",
  merged_into_opportunity_id: null
};

describe("decideLeadStageMove", () => {
  it("moves an open card to another stage of the same pipeline", () => {
    expect(
      decideLeadStageMove({
        opportunity: open,
        destination: { stage_id: "contacted", pipeline_id: "commercial" }
      })
    ).toEqual({ allowed: true });
  });

  it("accepts the card dropped back on the column it came from", () => {
    expect(
      decideLeadStageMove({
        opportunity: open,
        destination: { stage_id: "entry", pipeline_id: "commercial" }
      })
    ).toEqual({ allowed: true });
  });

  it("refuses a won card — the board only conducts what is still open", () => {
    expect(
      decideLeadStageMove({
        opportunity: { ...open, status: "WON" },
        destination: { stage_id: "contacted", pipeline_id: "commercial" }
      })
    ).toEqual({ allowed: false, reason: "OPPORTUNITY_CLOSED" });
  });

  it("refuses a lost card", () => {
    expect(
      decideLeadStageMove({
        opportunity: { ...open, status: "LOST" },
        destination: { stage_id: "contacted", pipeline_id: "commercial" }
      })
    ).toEqual({ allowed: false, reason: "OPPORTUNITY_CLOSED" });
  });

  it("refuses a card merged into another one", () => {
    expect(
      decideLeadStageMove({
        opportunity: { ...open, merged_into_opportunity_id: "absorbing" },
        destination: { stage_id: "contacted", pipeline_id: "commercial" }
      })
    ).toEqual({ allowed: false, reason: "OPPORTUNITY_MERGED" });
  });

  it("refuses a stage that belongs to another pipeline", () => {
    expect(
      decideLeadStageMove({
        opportunity: open,
        destination: { stage_id: "handoff", pipeline_id: "legal" }
      })
    ).toEqual({ allowed: false, reason: "DESTINATION_OUTSIDE_PIPELINE" });
  });

  it("reports the merge before the pipeline, so the reason names the card's own state", () => {
    expect(
      decideLeadStageMove({
        opportunity: { ...open, merged_into_opportunity_id: "absorbing" },
        destination: { stage_id: "handoff", pipeline_id: "legal" }
      })
    ).toEqual({ allowed: false, reason: "OPPORTUNITY_MERGED" });
  });
});
