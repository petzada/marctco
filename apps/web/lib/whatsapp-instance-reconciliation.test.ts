import { describe, expect, it, vi } from "vitest";
import type { WhatsMiauClient } from "./whatsmiau-client";
import { reconcilePersistedWhatsAppInstance } from "./whatsapp-instance-reconciliation";

const INSTANCE = "marctco_11111111111141118111111111111111";

function clientStub(payload: unknown): WhatsMiauClient {
  return {
    createInstance: vi.fn(),
    setWebhook: vi.fn(),
    connect: vi.fn(),
    connectionState: vi.fn(),
    logout: vi.fn(),
    fetchInstances: vi.fn().mockResolvedValue(payload)
  };
}

describe("reconcilePersistedWhatsAppInstance", () => {
  it("reports presence and pairing state from the official list fields only", async () => {
    const result = await reconcilePersistedWhatsAppInstance({
      client: clientStub([{ instanceName: INSTANCE, state: "open" }]),
      persisted_instance_name: INSTANCE
    });
    expect(result).toEqual({ present: true, pairing_state: "CONNECTED" });
  });

  it("returns absent when the persisted name is missing from the account list", async () => {
    const result = await reconcilePersistedWhatsAppInstance({
      client: clientStub([{ instanceName: "other", state: "closed" }]),
      persisted_instance_name: INSTANCE
    });
    expect(result).toEqual({ present: false, pairing_state: null });
  });

  it("never exposes apikey or webhook secrets through the reconciliation result", async () => {
    const result = await reconcilePersistedWhatsAppInstance({
      client: clientStub([
        {
          instanceName: INSTANCE,
          state: "open",
          apikey: "secret",
          token: "mtco_opaque"
        }
      ]),
      persisted_instance_name: INSTANCE
    });
    expect(result).toEqual({ present: true, pairing_state: "CONNECTED" });
    expect(JSON.stringify(result)).not.toMatch(/secret|mtco_opaque|apikey/i);
  });
});
