import { defaultCommercialPipeline } from "@marctco/domain";
import type { PrismaClient } from "@prisma/client";
import { createPrismaClient } from "./client.js";
import { listUserWorkspaces } from "./workspace-context.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sharedPrisma = createPrismaClient();

export interface ProvisionWorkspaceInput {
  readonly owner_user_id: string;
  readonly workspace_name: string;
}

export interface ProvisionedWorkspace {
  readonly workspace_id: string;
  readonly slug: string;
}

interface ProvisionedWorkspaceRow {
  readonly workspace_id: string;
}

/**
 * Creates the workspace an eligible login enters for the first time: tenant,
 * its OWNER membership, the default commercial pipeline and that pipeline's
 * stages, in a single transaction inside `private.provision_workspace`. It is
 * the third operation without a tenant context — there is no `workspace_id`
 * to put in `app.workspace_id` before the workspace exists (ADR-0006 regra 9,
 * ADR-0019).
 *
 * Calling it twice — two clicks, two tabs — returns the workspace the caller
 * already belongs to instead of creating a second one. The right to reach this
 * function at all lives in the caller's `app_metadata`, never here.
 *
 * The pipeline definition travels as an argument so `packages/domain` stays
 * the single copy shared with the development seed (ticket 05): the SQL never
 * repeats the stage list.
 *
 * It runs on its own connection and must not be nested inside another
 * transaction: the deferred pipeline invariants only fire at COMMIT, so the
 * function scopes the transaction to the workspace it created and that scope
 * lasts until the commit it was written for.
 */
export async function provisionWorkspace(
  input: ProvisionWorkspaceInput,
  prisma: PrismaClient = sharedPrisma
): Promise<ProvisionedWorkspace> {
  if (!UUID_PATTERN.test(input.owner_user_id)) {
    throw new Error(
      `owner_user_id must be a UUID, received: ${JSON.stringify(input.owner_user_id)}`
    );
  }
  const workspace_name = input.workspace_name.trim();
  if (workspace_name === "") {
    throw new Error("workspace_name must not be empty");
  }

  const rows = await prisma.$queryRaw<ProvisionedWorkspaceRow[]>`
    SELECT workspace_id
    FROM private.provision_workspace(
      ${input.owner_user_id}::uuid,
      ${workspace_name}::text,
      ${JSON.stringify(defaultCommercialPipeline)}::jsonb
    )
  `;
  const provisioned = rows[0];
  if (!provisioned) {
    throw new Error("Provisioning did not return a workspace");
  }

  // ADR-0019 keeps the provisioner's return to `workspace_id`. The slug that
  // the browser is redirected to comes from the membership resolver, so the
  // URL a user reaches is always one their own association justifies.
  const workspaces = await listUserWorkspaces(
    { authenticated_user_id: input.owner_user_id },
    prisma
  );
  const workspace = workspaces.find(
    (candidate) => candidate.workspace_id === provisioned.workspace_id
  );
  if (!workspace) {
    throw new Error("The provisioned workspace is not a membership of its owner");
  }
  return { workspace_id: workspace.workspace_id, slug: workspace.slug };
}
