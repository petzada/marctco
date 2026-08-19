/**
 * First-contact WhatsApp automation as workspace configuration: trigger,
 * template variables and the fail-closed dispatch plan. Sending still belongs
 * to later tickets; this module only decides whether an effect is eligible
 * and how the saved text must look (ADR-0003, ADR-0004).
 */

export const FIRST_CONTACT_TRIGGERS = ["ON_ASSIGNMENT", "ON_ARRIVAL", "DISABLED"] as const;
export type FirstContactTrigger = (typeof FIRST_CONTACT_TRIGGERS)[number];

export const DEFAULT_FIRST_CONTACT_TRIGGER: FirstContactTrigger = "ON_ASSIGNMENT";

/**
 * Default body for the assignment trigger. Absence of a stored template is
 * this text, never a blank message that would fire empty (ADR-0004).
 */
export const DEFAULT_FIRST_CONTACT_TEMPLATE_BODY =
  "Olá {{lead_name}}, sou {{attendant_name}} da {{workspace_name}}. Meu WhatsApp é {{attendant_phone}}.";

const ASSIGNMENT_VARIABLES = [
  "lead_name",
  "workspace_name",
  "attendant_name",
  "attendant_phone"
] as const;

const ARRIVAL_VARIABLES = ["lead_name", "workspace_name"] as const;

const PLACEHOLDER = /\{\{([^}]*)\}\}/g;
const SNAKE_CASE = /^[a-z][a-z0-9_]*$/;

const VARIABLE_SET: Readonly<Record<FirstContactTrigger, readonly string[]>> = {
  ON_ASSIGNMENT: ASSIGNMENT_VARIABLES,
  ON_ARRIVAL: ARRIVAL_VARIABLES,
  DISABLED: []
};

export function isFirstContactTrigger(value: unknown): value is FirstContactTrigger {
  return typeof value === "string" && (FIRST_CONTACT_TRIGGERS as readonly string[]).includes(value);
}

export function templateVariablesFor(trigger: FirstContactTrigger): readonly string[] {
  return VARIABLE_SET[trigger];
}

export type FirstContactTemplateParse =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: "EMPTY_TEMPLATE" | "INVALID_VARIABLE" };

export function parseFirstContactTemplate(input: {
  readonly trigger: FirstContactTrigger;
  readonly template_body: string;
}): FirstContactTemplateParse {
  const template_body = input.template_body.trim();
  if (input.trigger === "DISABLED") {
    return { ok: true };
  }
  if (template_body === "") {
    return { ok: false, code: "EMPTY_TEMPLATE" };
  }
  const allowed = new Set(templateVariablesFor(input.trigger));
  for (const placeholder of placeholdersIn(input.template_body)) {
    if (!SNAKE_CASE.test(placeholder) || !allowed.has(placeholder)) {
      return { ok: false, code: "INVALID_VARIABLE" };
    }
  }
  return { ok: true };
}

export type FirstContactRender =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly code: "MISSING_VARIABLE" | "FORBIDDEN_VARIABLE" };

export function renderFirstContactTemplate(input: {
  readonly trigger: FirstContactTrigger;
  readonly template_body: string;
  readonly values: Readonly<Record<string, string | undefined>>;
}): FirstContactRender {
  const allowed = new Set(templateVariablesFor(input.trigger));
  for (const placeholder of placeholdersIn(input.template_body)) {
    if (!SNAKE_CASE.test(placeholder) || !allowed.has(placeholder)) {
      return { ok: false, code: "FORBIDDEN_VARIABLE" };
    }
    if (input.values[placeholder] === undefined) {
      return { ok: false, code: "MISSING_VARIABLE" };
    }
  }
  const text = input.template_body.replace(PLACEHOLDER, (_match, name: string) => {
    return input.values[name] ?? "";
  });
  return { ok: true, text };
}

export type FirstContactDispatchRefusal =
  | "FLAG_OFF"
  | "TRIGGER_DISABLED"
  | "NO_OPT_IN"
  | "MISSING_PHONE"
  | "NOT_OPEN"
  | "MERGED";

export type FirstContactDispatchPlan =
  | { readonly kind: "NONE"; readonly reason: FirstContactDispatchRefusal }
  | { readonly kind: "AUTO_FIRST_CONTACT" };

/**
 * Guard order is flag → trigger → opt-in → eligibility. Anything other than
 * a true opt-in fails closed and produces no effect (ADR-0003).
 */
export function planFirstContactDispatch(input: {
  readonly feature_flag_enabled: boolean;
  readonly trigger: FirstContactTrigger;
  readonly whatsapp_opt_in: boolean | null;
  readonly missing_phone: boolean;
  readonly status: "OPEN" | "WON" | "LOST";
  readonly merged: boolean;
}): FirstContactDispatchPlan {
  if (!input.feature_flag_enabled) {
    return { kind: "NONE", reason: "FLAG_OFF" };
  }
  if (input.trigger === "DISABLED") {
    return { kind: "NONE", reason: "TRIGGER_DISABLED" };
  }
  if (input.whatsapp_opt_in !== true) {
    return { kind: "NONE", reason: "NO_OPT_IN" };
  }
  if (input.missing_phone) {
    return { kind: "NONE", reason: "MISSING_PHONE" };
  }
  if (input.status !== "OPEN") {
    return { kind: "NONE", reason: "NOT_OPEN" };
  }
  if (input.merged) {
    return { kind: "NONE", reason: "MERGED" };
  }
  return { kind: "AUTO_FIRST_CONTACT" };
}

function placeholdersIn(template_body: string): readonly string[] {
  const names: string[] = [];
  const matcher = new RegExp(PLACEHOLDER.source, "g");
  for (const match of template_body.matchAll(matcher)) {
    names.push(match[1] ?? "");
  }
  return names;
}
