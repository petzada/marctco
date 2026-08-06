import { describe, expect, it } from "vitest";
import { provisioningEntitlement } from "./provisioning-entitlement";

describe("provisioningEntitlement", () => {
  it("grants provisioning only from app_metadata marked by the technical team", () => {
    expect(
      provisioningEntitlement({ app_metadata: { can_provision_workspace: true } })
    ).toEqual({ workspace_name: null });
  });

  it("carries the workspace name the technical team recorded with the right", () => {
    expect(
      provisioningEntitlement({
        app_metadata: {
          can_provision_workspace: true,
          workspace_name: "  Assessoria Horizonte  "
        }
      })
    ).toEqual({ workspace_name: "Assessoria Horizonte" });
  });

  it("ignores user_metadata, which the user rewrites from the browser", () => {
    expect(
      provisioningEntitlement({
        app_metadata: {},
        user_metadata: { can_provision_workspace: true, workspace_name: "Escalação" }
      })
    ).toBeNull();
  });

  it("refuses anything other than the boolean true, including truthy strings", () => {
    expect(provisioningEntitlement({ app_metadata: { can_provision_workspace: "true" } })).toBeNull();
    expect(provisioningEntitlement({ app_metadata: { can_provision_workspace: 1 } })).toBeNull();
    expect(provisioningEntitlement({ app_metadata: { can_provision_workspace: false } })).toBeNull();
    expect(provisioningEntitlement({ app_metadata: {} })).toBeNull();
    expect(provisioningEntitlement({})).toBeNull();
    expect(provisioningEntitlement(null)).toBeNull();
    expect(provisioningEntitlement(undefined)).toBeNull();
  });

  it("treats a blank or non-string workspace name as absent", () => {
    expect(
      provisioningEntitlement({
        app_metadata: { can_provision_workspace: true, workspace_name: "   " }
      })
    ).toEqual({ workspace_name: null });
    expect(
      provisioningEntitlement({
        app_metadata: { can_provision_workspace: true, workspace_name: 42 }
      })
    ).toEqual({ workspace_name: null });
  });
});
