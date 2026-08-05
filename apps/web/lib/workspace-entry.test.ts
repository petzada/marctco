import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { UserWorkspace } from "@marctco/db";
import { workspaceEntryDestination } from "./workspace-entry";

function workspace(): UserWorkspace {
  return {
    workspace_id: randomUUID(),
    slug: randomUUID(),
    name: "Assessoria Horizonte",
    role: "OWNER"
  };
}

describe("workspaceEntryDestination", () => {
  it("sends an authenticated user with no associations to onboarding", () => {
    expect(workspaceEntryDestination([])).toEqual({ kind: "onboarding" });
  });

  it("sends an authenticated user with one association directly to its URL", () => {
    const onlyWorkspace = workspace();
    expect(workspaceEntryDestination([onlyWorkspace])).toEqual({
      kind: "workspace",
      slug: onlyWorkspace.slug
    });
  });

  it("shows the selector only when the authenticated user has multiple associations", () => {
    expect(workspaceEntryDestination([workspace(), workspace()])).toEqual({ kind: "selector" });
  });
});
