import { describe, expect, it } from "vitest";
import {
  canManageIntegrationSecret,
  canOpenIntegrationScreen,
  canOperateIntegrations
} from "./integration-access";

describe("canOpenIntegrationScreen", () => {
  it("is Gestão and up — the same gate on Pluga and on landing page", () => {
    expect(canOpenIntegrationScreen("ATTENDANT")).toBe(false);
    expect(canOpenIntegrationScreen("SUPERVISOR")).toBe(false);
    expect(canOpenIntegrationScreen("MANAGER")).toBe(true);
    expect(canOpenIntegrationScreen("OWNER")).toBe(true);
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
