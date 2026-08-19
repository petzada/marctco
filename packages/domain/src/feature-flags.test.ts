import { describe, expect, it } from "vitest";
import {
  FEATURE_FLAGS,
  isFeatureFlag,
  planOpportunityPostCreationEffects,
  resolveFeatureFlags
} from "./feature-flags.js";

describe("feature flag catalog", () => {
  it("contains the three paid-per-use capabilities and nothing else", () => {
    expect(FEATURE_FLAGS).toEqual([
      "auto_primeiro_contato",
      "score_cabimento_llm",
      "resumo_handoff_llm"
    ]);
  });

  it("resolves an absent row as disabled and ignores unknown database values", () => {
    expect(resolveFeatureFlags(["auto_primeiro_contato", "assinatura_digital"])).toEqual({
      auto_primeiro_contato: true,
      score_cabimento_llm: false,
      resumo_handoff_llm: false
    });
    expect(isFeatureFlag("funil_juridico")).toBe(false);
  });

  it("plans the hook as data only for a released, newly created Opportunity", () => {
    const feature_flags = resolveFeatureFlags(["auto_primeiro_contato"]);
    expect(
      planOpportunityPostCreationEffects({
        feature_flags,
        first_contact_trigger: "ON_ARRIVAL",
        created_opportunity_id: "opportunity-1"
      })
    ).toEqual([{ kind: "AUTO_FIRST_CONTACT", opportunity_id: "opportunity-1" }]);
    expect(
      planOpportunityPostCreationEffects({
        feature_flags,
        first_contact_trigger: "ON_ARRIVAL",
        created_opportunity_id: null
      })
    ).toEqual([]);
    expect(
      planOpportunityPostCreationEffects({
        feature_flags,
        first_contact_trigger: "ON_ASSIGNMENT",
        created_opportunity_id: "opportunity-1"
      })
    ).toEqual([]);
  });
});
