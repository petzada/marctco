import { describe, expect, it } from "vitest";
import { describeFailureReason, sanitizeTelemetry } from "./telemetry.js";

describe("sanitizeTelemetry", () => {
  it("keeps the technical allowlist and discards a raw submission and Person", () => {
    const sanitized = sanitizeTelemetry({
      workspace_id: "018f4d57-2db2-7c1b-bff0-f2fcb13a46f7",
      integration_event_id: "evt_123",
      source: "META_LEAD_ADS",
      external_lead_id: "lead_456",
      message: "normalization failed",
      stack: "Error: normalization failed",
      raw: { telefone: "+5511999999999", pergunta_livre: "meu cpf" },
      person: { cpf: "12345678909", email: "cliente@example.com" },
      submission: { name: "Cliente real" },
      unexpected_provider_field: "PII desconhecida"
    });

    expect(sanitized).toEqual({
      workspace_id: "018f4d57-2db2-7c1b-bff0-f2fcb13a46f7",
      integration_event_id: "evt_123",
      source: "META_LEAD_ADS",
      external_lead_id: "lead_456",
      message: "normalization failed",
      stack: "Error: normalization failed"
    });
    expect(JSON.stringify(sanitized)).not.toContain("12345678909");
    expect(JSON.stringify(sanitized)).not.toContain("cliente@example.com");
    expect(JSON.stringify(sanitized)).not.toContain("PII desconhecida");
  });

  it("extracts only message and stack from Error", () => {
    const error = new Error("falha segura");
    const sanitized = sanitizeTelemetry(error);

    expect(sanitized.message).toBe("falha segura");
    expect(sanitized.stack).toContain("Error: falha segura");
  });

  it("keeps a nested error's message and stack, and nothing else it carries", () => {
    const failure = Object.assign(new Error("ECONNREFUSED"), {
      raw: { telefone: "+5511999999999" }
    });

    const sanitized = sanitizeTelemetry({
      event: "integration_event_dispatch",
      result: "publish_failed",
      error: failure
    });

    expect(sanitized).toMatchObject({
      event: "integration_event_dispatch",
      result: "publish_failed",
      error_message: "ECONNREFUSED"
    });
    expect(String(sanitized.error_stack)).toContain("Error: ECONNREFUSED");
    expect(JSON.stringify(sanitized)).not.toContain("5511999999999");
  });

  it("drops the part of a database error where Postgres echoes the offending row", () => {
    const failure = new Error(
      'duplicate key value violates unique constraint "integration_events_pkey"\n' +
        "DETAIL: Key (raw)=({\"telefone\": \"+5511999999999\", \"cpf\": \"12345678909\"}) already exists."
    );

    const sanitized = sanitizeTelemetry({ event: "integration_event_dispatch", error: failure });

    expect(sanitized.error_message).toBe(
      'duplicate key value violates unique constraint "integration_events_pkey"'
    );
    expect(JSON.stringify(sanitized)).not.toContain("5511999999999");
    expect(JSON.stringify(sanitized)).not.toContain("12345678909");
  });

  it("keeps the dispatcher's counters, which carry no personal data", () => {
    expect(
      sanitizeTelemetry({
        event: "integration_event_dispatch",
        result: "pass_complete",
        claimed: 4,
        dispatched: 3,
        job_id: "integration-event-018f4d57"
      })
    ).toEqual({
      event: "integration_event_dispatch",
      result: "pass_complete",
      claimed: 4,
      dispatched: 3,
      job_id: "integration-event-018f4d57"
    });
  });

  it("says nothing when the thrown value is not an error-shaped object", () => {
    expect(
      sanitizeTelemetry({ event: "integration_event_dispatch", error: "just a string" })
    ).toEqual({ event: "integration_event_dispatch" });
  });

  it("permits only hashed identifiers in workspace-access audit events", () => {
    expect(
      sanitizeTelemetry({
        event: "workspace_access",
        result: "denied",
        user_id_hash: "a".repeat(64),
        workspace_slug_hash: "b".repeat(64),
        request_id: "request-safe",
        user_id: "must-not-log",
        slug: "must-not-log",
        ip_address: "203.0.113.10"
      })
    ).toEqual({
      event: "workspace_access",
      result: "denied",
      user_id_hash: "a".repeat(64),
      workspace_slug_hash: "b".repeat(64),
      request_id: "request-safe"
    });
  });
});


describe("describeFailureReason", () => {
  it("names the failure and drops everything PostgreSQL echoes back", () => {
    const error = new Error(
      "duplicate key value violates unique constraint\nDETAIL: Key (cpf)=(529.982.247-25) already exists."
    );
    const reason = describeFailureReason(error);

    expect(reason).toContain("Error: duplicate key value violates unique constraint");
    expect(reason).not.toContain("529.982.247-25");
  });

  it("caps the reason so it always fits the column that stores it", () => {
    expect(describeFailureReason(new Error("x".repeat(1_000)).message).length).toBeLessThanOrEqual(
      300
    );
  });

  it("still says something when there is nothing to say", () => {
    expect(describeFailureReason(undefined)).toBe("Unknown failure");
    expect(describeFailureReason("   ")).toBe("Unknown failure");
    expect(describeFailureReason(new Error(""))).toBe("Error");
  });
});
