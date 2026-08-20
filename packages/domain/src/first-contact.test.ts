import { describe, expect, it } from "vitest";
import {
  DEFAULT_FIRST_CONTACT_TEMPLATE_BODY,
  DEFAULT_FIRST_CONTACT_TRIGGER,
  FIRST_CONTACT_TRIGGERS,
  parseFirstContactTemplate,
  planFirstContactDispatch,
  renderFirstContactTemplate,
  templateVariablesFor
} from "./first-contact.js";
import {
  planOpportunityPostCreationEffects,
  resolveFeatureFlags
} from "./feature-flags.js";
import { resolveWorkspaceSettings } from "./workspace-settings.js";

describe("first-contact trigger defaults", () => {
  it("exposes ON_ASSIGNMENT as the domain default, never DISABLED", () => {
    expect(DEFAULT_FIRST_CONTACT_TRIGGER).toBe("ON_ASSIGNMENT");
    expect(FIRST_CONTACT_TRIGGERS).toEqual(["ON_ASSIGNMENT", "ON_ARRIVAL", "DISABLED"]);
    expect(resolveWorkspaceSettings(null).first_contact_trigger).toBe("ON_ASSIGNMENT");
    expect(resolveWorkspaceSettings(null).first_contact_template_body).toBe(
      DEFAULT_FIRST_CONTACT_TEMPLATE_BODY
    );
  });

  it("treats a stored null trigger as the domain default, never as DISABLED", () => {
    expect(
      resolveWorkspaceSettings({
        first_contact_sla_minutes: null,
        stagnation_days: null,
        first_contact_trigger: null,
        first_contact_template_body: null
      }).first_contact_trigger
    ).toBe("ON_ASSIGNMENT");
  });
});

describe("template variables by trigger", () => {
  it("includes attendant name and phone only on ON_ASSIGNMENT", () => {
    expect(templateVariablesFor("ON_ASSIGNMENT")).toEqual([
      "lead_name",
      "workspace_name",
      "attendant_name",
      "attendant_phone"
    ]);
    expect(templateVariablesFor("ON_ARRIVAL")).toEqual(["lead_name", "workspace_name"]);
    expect(templateVariablesFor("ON_ARRIVAL")).not.toContain("attendant_name");
    expect(templateVariablesFor("ON_ARRIVAL")).not.toContain("attendant_phone");
  });
});

describe("parseFirstContactTemplate", () => {
  it("refuses an empty template when the trigger is active", () => {
    expect(parseFirstContactTemplate({ trigger: "ON_ASSIGNMENT", template_body: "" })).toEqual({
      ok: false,
      code: "EMPTY_TEMPLATE"
    });
    expect(parseFirstContactTemplate({ trigger: "ON_ARRIVAL", template_body: "   " })).toEqual({
      ok: false,
      code: "EMPTY_TEMPLATE"
    });
  });

  it("accepts an empty template when the trigger is DISABLED", () => {
    expect(parseFirstContactTemplate({ trigger: "DISABLED", template_body: "" })).toEqual({
      ok: true
    });
  });

  it("refuses attendant variables on ON_ARRIVAL at write time", () => {
    expect(
      parseFirstContactTemplate({
        trigger: "ON_ARRIVAL",
        template_body: "Olá {{lead_name}}, sou {{attendant_name}}."
      })
    ).toEqual({ ok: false, code: "INVALID_VARIABLE" });
  });

  it("accepts attendant variables on ON_ASSIGNMENT", () => {
    expect(
      parseFirstContactTemplate({
        trigger: "ON_ASSIGNMENT",
        template_body: DEFAULT_FIRST_CONTACT_TEMPLATE_BODY
      })
    ).toEqual({ ok: true });
  });

  it("refuses a placeholder that is not snake_case or not in the trigger set", () => {
    expect(
      parseFirstContactTemplate({
        trigger: "ON_ASSIGNMENT",
        template_body: "Olá {{LeadName}}"
      })
    ).toEqual({ ok: false, code: "INVALID_VARIABLE" });
    expect(
      parseFirstContactTemplate({
        trigger: "ON_ASSIGNMENT",
        template_body: "Olá {{unknown_field}}"
      })
    ).toEqual({ ok: false, code: "INVALID_VARIABLE" });
  });
});

describe("renderFirstContactTemplate", () => {
  const assignmentValues = {
    lead_name: "Maria",
    workspace_name: "Hugs",
    attendant_name: "João",
    attendant_phone: "+5511987654321"
  };

  it("substitutes {{snake_case}} placeholders", () => {
    expect(
      renderFirstContactTemplate({
        trigger: "ON_ASSIGNMENT",
        template_body: "Olá {{lead_name}}, sou {{attendant_name}} da {{workspace_name}}.",
        values: assignmentValues
      })
    ).toEqual({
      ok: true,
      text: "Olá Maria, sou João da Hugs."
    });
  });

  it("refuses a missing value", () => {
    expect(
      renderFirstContactTemplate({
        trigger: "ON_ARRIVAL",
        template_body: "Olá {{lead_name}} da {{workspace_name}}.",
        values: { lead_name: "Maria" }
      })
    ).toEqual({ ok: false, code: "MISSING_VARIABLE" });
  });

  it("refuses a forbidden attendant variable at render time", () => {
    expect(
      renderFirstContactTemplate({
        trigger: "ON_ARRIVAL",
        template_body: "Olá {{lead_name}}, sou {{attendant_name}}.",
        values: { lead_name: "Maria", attendant_name: "João" }
      })
    ).toEqual({ ok: false, code: "FORBIDDEN_VARIABLE" });
  });
});

describe("planFirstContactDispatch", () => {
  const eligible = {
    feature_flag_enabled: true,
    trigger: "ON_ASSIGNMENT" as const,
    whatsapp_opt_in: true,
    missing_phone: false,
    status: "OPEN" as const,
    merged: false
  };

  it("applies flag before trigger, opt-in and eligibility", () => {
    expect(planFirstContactDispatch({ ...eligible, feature_flag_enabled: false })).toEqual({
      kind: "NONE",
      reason: "FLAG_OFF"
    });
    expect(planFirstContactDispatch({ ...eligible, trigger: "DISABLED" })).toEqual({
      kind: "NONE",
      reason: "TRIGGER_DISABLED"
    });
  });

  it("fails closed without a true WhatsApp opt-in", () => {
    expect(planFirstContactDispatch({ ...eligible, whatsapp_opt_in: null })).toEqual({
      kind: "NONE",
      reason: "NO_OPT_IN"
    });
    expect(planFirstContactDispatch({ ...eligible, whatsapp_opt_in: false })).toEqual({
      kind: "NONE",
      reason: "NO_OPT_IN"
    });
  });

  it("refuses missing phone, closed status and a merged card", () => {
    expect(planFirstContactDispatch({ ...eligible, missing_phone: true })).toEqual({
      kind: "NONE",
      reason: "MISSING_PHONE"
    });
    expect(planFirstContactDispatch({ ...eligible, status: "WON" })).toEqual({
      kind: "NONE",
      reason: "NOT_OPEN"
    });
    expect(planFirstContactDispatch({ ...eligible, status: "LOST" })).toEqual({
      kind: "NONE",
      reason: "NOT_OPEN"
    });
    expect(planFirstContactDispatch({ ...eligible, merged: true })).toEqual({
      kind: "NONE",
      reason: "MERGED"
    });
  });

  it("plans AUTO_FIRST_CONTACT only when every guard passes", () => {
    expect(planFirstContactDispatch(eligible)).toEqual({ kind: "AUTO_FIRST_CONTACT" });
  });
});

describe("planOpportunityPostCreationEffects with the resolved trigger", () => {
  const flags_on = resolveFeatureFlags(["auto_primeiro_contato"]);
  const flags_off = resolveFeatureFlags([]);

  it("does not emit on arrival when the trigger is the default ON_ASSIGNMENT", () => {
    expect(
      planOpportunityPostCreationEffects({
        feature_flags: flags_on,
        first_contact_trigger: "ON_ASSIGNMENT",
        created_opportunity_id: "opportunity-1"
      })
    ).toEqual([]);
  });

  it("emits AUTO_FIRST_CONTACT only for ON_ARRIVAL when the flag is on and a card was created", () => {
    expect(
      planOpportunityPostCreationEffects({
        feature_flags: flags_on,
        first_contact_trigger: "ON_ARRIVAL",
        created_opportunity_id: "opportunity-1"
      })
    ).toEqual([{ kind: "AUTO_FIRST_CONTACT", opportunity_id: "opportunity-1" }]);
    expect(
      planOpportunityPostCreationEffects({
        feature_flags: flags_off,
        first_contact_trigger: "ON_ARRIVAL",
        created_opportunity_id: "opportunity-1"
      })
    ).toEqual([]);
    expect(
      planOpportunityPostCreationEffects({
        feature_flags: flags_on,
        first_contact_trigger: "ON_ARRIVAL",
        created_opportunity_id: null
      })
    ).toEqual([]);
    expect(
      planOpportunityPostCreationEffects({
        feature_flags: flags_on,
        first_contact_trigger: "DISABLED",
        created_opportunity_id: "opportunity-1"
      })
    ).toEqual([]);
  });
});
