import { describe, expect, it } from "vitest";
import { buildWhatsAppConnectionIndicatorView } from "./whatsapp-connection-indicator.js";

describe("buildWhatsAppConnectionIndicatorView", () => {
  it("labels the boolean without exposing a secret or identifier", () => {
    const connected = buildWhatsAppConnectionIndicatorView(true);
    const disconnected = buildWhatsAppConnectionIndicatorView(false);
    expect(connected).toEqual({ connected: true, label: "WhatsApp conectado" });
    expect(disconnected).toEqual({ connected: false, label: "WhatsApp desconectado" });
    expect(Object.keys(connected).sort()).toEqual(["connected", "label"]);
    const serialized = JSON.stringify([connected, disconnected]);
    expect(serialized).not.toMatch(/token|last4|apikey|instance_name|mtco_/i);
  });
});
