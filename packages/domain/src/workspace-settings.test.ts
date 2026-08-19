import { describe, expect, it } from "vitest";
import {
  DEFAULT_FIRST_CONTACT_SLA_MINUTES,
  DEFAULT_STAGNATION_DAYS,
  MAX_FIRST_CONTACT_SLA_MINUTES,
  MAX_STAGNATION_DAYS,
  canWriteWorkspaceSettings,
  parseWorkspaceSettingsWrite,
  resolveWorkspaceSettings
} from "./workspace-settings.js";

describe("resolveWorkspaceSettings", () => {
  it("uses the domain defaults when the workspace has no row", () => {
    expect(resolveWorkspaceSettings(null)).toEqual({
      first_contact_sla_minutes: DEFAULT_FIRST_CONTACT_SLA_MINUTES,
      stagnation_days: DEFAULT_STAGNATION_DAYS,
      first_contact_trigger: "ON_ASSIGNMENT",
      first_contact_template_body:
        "Olá {{lead_name}}, sou {{attendant_name}} da {{workspace_name}}. Meu WhatsApp é {{attendant_phone}}."
    });
  });

  it("treats a stored null as the domain default, never as SLA off", () => {
    expect(
      resolveWorkspaceSettings({
        first_contact_sla_minutes: null,
        stagnation_days: null
      })
    ).toEqual({
      first_contact_sla_minutes: DEFAULT_FIRST_CONTACT_SLA_MINUTES,
      stagnation_days: DEFAULT_STAGNATION_DAYS,
      first_contact_trigger: "ON_ASSIGNMENT",
      first_contact_template_body:
        "Olá {{lead_name}}, sou {{attendant_name}} da {{workspace_name}}. Meu WhatsApp é {{attendant_phone}}."
    });
  });

  it("overrides only the field that the workspace stored", () => {
    expect(
      resolveWorkspaceSettings({
        first_contact_sla_minutes: 30,
        stagnation_days: null
      })
    ).toEqual({
      first_contact_sla_minutes: 30,
      stagnation_days: DEFAULT_STAGNATION_DAYS,
      first_contact_trigger: "ON_ASSIGNMENT",
      first_contact_template_body:
        "Olá {{lead_name}}, sou {{attendant_name}} da {{workspace_name}}. Meu WhatsApp é {{attendant_phone}}."
    });

    expect(
      resolveWorkspaceSettings({
        first_contact_sla_minutes: null,
        stagnation_days: 3
      })
    ).toEqual({
      first_contact_sla_minutes: DEFAULT_FIRST_CONTACT_SLA_MINUTES,
      stagnation_days: 3,
      first_contact_trigger: "ON_ASSIGNMENT",
      first_contact_template_body:
        "Olá {{lead_name}}, sou {{attendant_name}} da {{workspace_name}}. Meu WhatsApp é {{attendant_phone}}."
    });
  });

  it("keeps both stored values when both are present", () => {
    expect(
      resolveWorkspaceSettings({
        first_contact_sla_minutes: 45,
        stagnation_days: 14
      })
    ).toEqual({
      first_contact_sla_minutes: 45,
      stagnation_days: 14,
      first_contact_trigger: "ON_ASSIGNMENT",
      first_contact_template_body:
        "Olá {{lead_name}}, sou {{attendant_name}} da {{workspace_name}}. Meu WhatsApp é {{attendant_phone}}."
    });
  });
});

describe("parseWorkspaceSettingsWrite", () => {
  it("accepts a partial override of one field", () => {
    expect(parseWorkspaceSettingsWrite({ first_contact_sla_minutes: 15 })).toEqual({
      ok: true,
      value: { first_contact_sla_minutes: 15 }
    });
    expect(parseWorkspaceSettingsWrite({ stagnation_days: 9 })).toEqual({
      ok: true,
      value: { stagnation_days: 9 }
    });
  });

  it("accepts null to clear a stored override back to the domain default", () => {
    expect(
      parseWorkspaceSettingsWrite({
        first_contact_sla_minutes: null,
        stagnation_days: 4
      })
    ).toEqual({
      ok: true,
      value: { first_contact_sla_minutes: null, stagnation_days: 4 }
    });
  });

  it("refuses zero, negative, non-integer and out-of-range values", () => {
    for (const input of [
      { first_contact_sla_minutes: 0 },
      { first_contact_sla_minutes: -1 },
      { first_contact_sla_minutes: 1.5 },
      { first_contact_sla_minutes: MAX_FIRST_CONTACT_SLA_MINUTES + 1 },
      { stagnation_days: 0 },
      { stagnation_days: -7 },
      { stagnation_days: 2.2 },
      { stagnation_days: MAX_STAGNATION_DAYS + 1 }
    ]) {
      expect(parseWorkspaceSettingsWrite(input), JSON.stringify(input)).toEqual({
        ok: false,
        code: "INVALID"
      });
    }
  });

  it("refuses an empty write", () => {
    expect(parseWorkspaceSettingsWrite({})).toEqual({ ok: false, code: "INVALID" });
  });

  it("accepts a first-contact write with a template valid for the trigger", () => {
    expect(
      parseWorkspaceSettingsWrite({
        first_contact_trigger: "ON_ARRIVAL",
        first_contact_template_body: "Olá {{lead_name}}, aqui é a {{workspace_name}}."
      })
    ).toEqual({
      ok: true,
      value: {
        first_contact_trigger: "ON_ARRIVAL",
        first_contact_template_body: "Olá {{lead_name}}, aqui é a {{workspace_name}}."
      }
    });
  });

  it("refuses an empty template when the trigger is active and attendant variables on arrival", () => {
    expect(
      parseWorkspaceSettingsWrite({
        first_contact_trigger: "ON_ASSIGNMENT",
        first_contact_template_body: ""
      })
    ).toEqual({ ok: false, code: "INVALID" });
    expect(
      parseWorkspaceSettingsWrite({
        first_contact_trigger: "ON_ARRIVAL",
        first_contact_template_body: "Olá {{attendant_name}}"
      })
    ).toEqual({ ok: false, code: "INVALID" });
  });
});

describe("canWriteWorkspaceSettings", () => {
  it("allows Gestão and Direção, and refuses Atendente and Supervisor", () => {
    expect(canWriteWorkspaceSettings("MANAGER")).toBe(true);
    expect(canWriteWorkspaceSettings("OWNER")).toBe(true);
    expect(canWriteWorkspaceSettings("ATTENDANT")).toBe(false);
    expect(canWriteWorkspaceSettings("SUPERVISOR")).toBe(false);
  });
});
