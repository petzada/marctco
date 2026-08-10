import { describe, expect, it } from "vitest";
import {
  canManageIntegrationSecret,
  canOpenPlugaScreen,
  canOperateIntegrations
} from "./pluga-access";

describe("canOpenPlugaScreen", () => {
  it("is Gestão and up", () => {
    expect(canOpenPlugaScreen("ATTENDANT")).toBe(false);
    expect(canOpenPlugaScreen("SUPERVISOR")).toBe(false);
    expect(canOpenPlugaScreen("MANAGER")).toBe(true);
    expect(canOpenPlugaScreen("OWNER")).toBe(true);
  });
});

describe("canManageIntegrationSecret", () => {
  it("is Direção only (ADR-0015)", () => {
    expect(canManageIntegrationSecret("ATTENDANT")).toBe(false);
    expect(canManageIntegrationSecret("SUPERVISOR")).toBe(false);
    expect(canManageIntegrationSecret("MANAGER")).toBe(false);
    expect(canManageIntegrationSecret("OWNER")).toBe(true);
  });
});

describe("canOperateIntegrations", () => {
  it("is Gestão and up — history, reprocess, quarantine", () => {
    expect(canOperateIntegrations("ATTENDANT")).toBe(false);
    expect(canOperateIntegrations("SUPERVISOR")).toBe(false);
    expect(canOperateIntegrations("MANAGER")).toBe(true);
    expect(canOperateIntegrations("OWNER")).toBe(true);
  });
});
