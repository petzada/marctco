import { describe, expect, it } from "vitest";
import { createSafeLogger } from "./logger.js";

describe("safe worker logger", () => {
  it("sanitizes child bindings and log arguments through the central allowlist", () => {
    const output: string[] = [];
    const destination = {
      write(message: string) {
        output.push(message);
      }
    };
    const logger = createSafeLogger(destination);

    logger
      .child({ workspace_id: "workspace-safe", raw: { cpf: "12345678909" } })
      .error(
        { Person: { email: "pii@example.com" }, submission: { phone: "5511999999999" } },
        "failed"
      );

    expect(output).toHaveLength(1);
    expect(output[0]).toContain('"workspace_id":"workspace-safe"');
    expect(output[0]).not.toContain("12345678909");
    expect(output[0]).not.toContain("pii@example.com");
    expect(output[0]).not.toContain("5511999999999");
    expect(output[0]).not.toContain("Person");
    expect(output[0]).not.toContain("submission");
  });
});
