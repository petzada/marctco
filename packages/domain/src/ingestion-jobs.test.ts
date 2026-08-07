import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { integrationEventJobId } from "./ingestion-jobs.js";

describe("integrationEventJobId", () => {
  it("gives the same event the same job id, however often it is republished", () => {
    const integration_event_id = randomUUID();

    expect(integrationEventJobId(integration_event_id)).toBe(
      integrationEventJobId(integration_event_id)
    );
    expect(integrationEventJobId(integration_event_id)).not.toBe(
      integrationEventJobId(randomUUID())
    );
  });

  it("never contains a colon, which BullMQ refuses in a custom id", () => {
    expect(integrationEventJobId(randomUUID())).not.toContain(":");
  });
});
