import { describe, expect, it } from "vitest";
import { sanitizeTelemetry } from "./telemetry.js";

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
});

