import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createJobContext,
  createUserContextFromResolvedMembership,
  isJobContext,
  isUserContext,
  jobChannelAttemptId,
  jobIntegrationEventId,
  withResolvedFeatureFlags,
  WorkspaceRole
} from "./access-context.js";

describe("createUserContextFromResolvedMembership", () => {
  it("builds a UserContext for each of the four known roles", () => {
    for (const role of Object.values(WorkspaceRole)) {
      const workspace_id = randomUUID();
      const user_id = randomUUID();
      const context = createUserContextFromResolvedMembership({ workspace_id, user_id, role });
      expect(context.kind).toBe("user");
      expect(context.workspace_id).toBe(workspace_id);
      expect(context.user_id).toBe(user_id);
      expect(context.role).toBe(role);
      expect("feature_flags" in context).toBe(false);
      expect("tags" in context).toBe(false);
      expect(isUserContext(context)).toBe(true);
      expect(isJobContext(context)).toBe(false);
    }
  });

  it("fails closed on an unknown role instead of building a context that sees everything", () => {
    expect(() =>
      createUserContextFromResolvedMembership({
        workspace_id: randomUUID(),
        user_id: randomUUID(),
        role: "ADMIN"
      })
    ).toThrow(/unknown workspace role/i);
  });

  it("fails closed on a missing role", () => {
    expect(() =>
      createUserContextFromResolvedMembership({ workspace_id: randomUUID(), user_id: randomUUID(), role: "" })
    ).toThrow(/unknown workspace role/i);
  });

  it("refuses a non-UUID workspace_id", () => {
    expect(() =>
      createUserContextFromResolvedMembership({
        workspace_id: "not-a-uuid",
        user_id: randomUUID(),
        role: "OWNER"
      })
    ).toThrow(/must be a UUID/i);
  });

  it("refuses a non-UUID user_id", () => {
    expect(() =>
      createUserContextFromResolvedMembership({
        workspace_id: randomUUID(),
        user_id: "not-a-uuid",
        role: "OWNER"
      })
    ).toThrow(/must be a UUID/i);
  });
});

describe("createJobContext", () => {
  it("builds a JobContext with an integration-event origin, no user and no role", () => {
    const workspace_id = randomUUID();
    const integration_event_id = randomUUID();
    const context = createJobContext({ workspace_id, integration_event_id });
    expect(context.kind).toBe("job");
    expect(context.workspace_id).toBe(workspace_id);
    expect(context.origin).toEqual({ type: "integration_event", integration_event_id });
    expect(jobIntegrationEventId(context)).toBe(integration_event_id);
    expect("role" in context).toBe(false);
    expect("user_id" in context).toBe(false);
    expect("integration_event_id" in context).toBe(false);
    expect("feature_flags" in context).toBe(false);
    expect(isJobContext(context)).toBe(true);
    expect(isUserContext(context)).toBe(false);
  });

  it("builds a JobContext for the opportunity-clock scheduled sweep without fabricating an event", () => {
    const workspace_id = randomUUID();
    const context = createJobContext({
      workspace_id,
      origin: { type: "scheduled_sweep", sweep: "OPPORTUNITY_CLOCK" }
    });
    expect(context.kind).toBe("job");
    expect(context.workspace_id).toBe(workspace_id);
    expect(context.origin).toEqual({ type: "scheduled_sweep", sweep: "OPPORTUNITY_CLOCK" });
    expect("integration_event_id" in context).toBe(false);
    expect("role" in context).toBe(false);
    expect(() => jobIntegrationEventId(context)).toThrow(/not an integration event/i);
  });

  it("accepts PAYLOAD_EXPIRY as a named sweep so the origin list stays closed", () => {
    const context = createJobContext({
      workspace_id: randomUUID(),
      origin: { type: "scheduled_sweep", sweep: "PAYLOAD_EXPIRY" }
    });
    expect(context.origin).toEqual({ type: "scheduled_sweep", sweep: "PAYLOAD_EXPIRY" });
  });

  it("refuses an unknown scheduled-sweep name", () => {
    expect(() =>
      createJobContext({
        workspace_id: randomUUID(),
        origin: { type: "scheduled_sweep", sweep: "MAINTENANCE" as "OPPORTUNITY_CLOCK" }
      })
    ).toThrow(/unknown scheduled sweep/i);
  });

  it("refuses a non-UUID workspace_id", () => {
    expect(() =>
      createJobContext({ workspace_id: "not-a-uuid", integration_event_id: randomUUID() })
    ).toThrow(/must be a UUID/i);
  });

  it("refuses a non-UUID integration_event_id", () => {
    expect(() =>
      createJobContext({ workspace_id: randomUUID(), integration_event_id: "not-a-uuid" })
    ).toThrow(/must be a UUID/i);
  });

  it("builds a JobContext for channel outbound from the attempt id, without fabricating an event", () => {
    const workspace_id = randomUUID();
    const attempt_id = randomUUID();
    const context = createJobContext({
      workspace_id,
      origin: { type: "channel_outbound", attempt_id }
    });
    expect(context.kind).toBe("job");
    expect(context.workspace_id).toBe(workspace_id);
    expect(context.origin).toEqual({ type: "channel_outbound", attempt_id });
    expect("role" in context).toBe(false);
    expect("integration_event_id" in context).toBe(false);
    expect(jobChannelAttemptId(context)).toBe(attempt_id);
    expect(() => jobIntegrationEventId(context)).toThrow(/not an integration event/i);
  });

  it("attaches resolved feature flags without inventing a role", () => {
    const workspace_id = randomUUID();
    const attempt_id = randomUUID();
    const context = createJobContext({
      workspace_id,
      origin: { type: "channel_outbound", attempt_id }
    });
    const flagged = withResolvedFeatureFlags(context, {
      auto_primeiro_contato: true,
      score_cabimento_llm: false,
      resumo_handoff_llm: false
    });
    expect(flagged.feature_flags?.auto_primeiro_contato).toBe(true);
    expect(flagged.origin).toEqual({ type: "channel_outbound", attempt_id });
    expect("role" in flagged).toBe(false);
  });

  it("builds a JobContext for channel inbound from the authenticated connection", () => {
    const workspace_id = randomUUID();
    const integration_connection_id = randomUUID();
    const context = createJobContext({
      workspace_id,
      origin: { type: "channel_inbound", integration_connection_id }
    });
    expect(context.origin).toEqual({ type: "channel_inbound", integration_connection_id });
    expect(() => jobIntegrationEventId(context)).toThrow(/not an integration event/i);
  });

  it("refuses a non-UUID channel outbound attempt_id", () => {
    expect(() =>
      createJobContext({
        workspace_id: randomUUID(),
        origin: { type: "channel_outbound", attempt_id: "not-a-uuid" }
      })
    ).toThrow(/must be a UUID/i);
  });
});
