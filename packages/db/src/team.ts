import { normalizeEmail, normalizePhone } from "@marctco/domain";
import type { PrismaClient } from "@prisma/client";
import type { UserContext, WorkspaceRole } from "./access-context.js";
import { createPrismaClient } from "./client.js";
import {
  type ScopedTransactionClient,
  withAccessContext
} from "./internal/scoped-transaction.js";
import { assertUuid } from "./internal/uuid.js";

const sharedPrisma = createPrismaClient();

const COLLABORATOR_ROLES = new Set(["ATTENDANT", "SUPERVISOR", "MANAGER"]);
const TEAM_READERS = new Set(["SUPERVISOR", "MANAGER", "OWNER"]);

export type CollaboratorRole = "ATTENDANT" | "SUPERVISOR" | "MANAGER";

export interface AttachWorkspaceMemberInput {
  readonly user_id: string;
  readonly display_name: string;
  readonly email: string;
  readonly role: CollaboratorRole;
  readonly tags: readonly string[];
  readonly whatsapp_phone?: string | null;
}

export interface AttachedWorkspaceMember {
  readonly user_id: string;
  readonly role: CollaboratorRole;
  readonly status: "ACTIVE";
  readonly display_name: string;
  readonly email: string;
  readonly whatsapp_phone_e164: string | null;
  readonly tags: readonly string[];
}

export interface TeamMember {
  readonly user_id: string;
  readonly display_name: string | null;
  readonly email: string | null;
  readonly role: WorkspaceRole;
  readonly status: "ACTIVE";
  readonly whatsapp_phone_e164: string | null;
  readonly tags: readonly string[];
}

interface LockedMemberRow {
  readonly role: WorkspaceRole;
  readonly status: string;
}

interface TagIdRow {
  readonly id: string;
}

interface TeamMemberRow {
  readonly user_id: string;
  readonly display_name: string | null;
  readonly email: string | null;
  readonly role: WorkspaceRole;
  readonly status: "ACTIVE";
  readonly whatsapp_phone_e164: string | null;
  readonly tags: string[];
}

function assertOwner(context: UserContext): void {
  if (context.role !== "OWNER") {
    throw new Error("Only OWNER can attach a workspace member");
  }
}

function assertCollaboratorRole(role: string): asserts role is CollaboratorRole {
  if (!COLLABORATOR_ROLES.has(role)) {
    throw new Error("Cadastro cannot create an OWNER membership");
  }
}

function normalizedDisplayName(value: string): string {
  const display_name = value.trim();
  if (display_name === "") {
    throw new Error("display_name must not be empty");
  }
  return display_name;
}

function normalizedMemberEmail(value: string): string {
  const email = normalizeEmail(value);
  if (!email) {
    throw new Error("email must be a valid address");
  }
  return email;
}

function normalizedWhatsappPhone(value: string | null | undefined): string | null {
  if (value === undefined || value === null || value.trim() === "") {
    return null;
  }
  const phone = normalizePhone(value);
  if (!phone) {
    throw new Error("whatsapp_phone must be a personal number in E.164");
  }
  return phone;
}

function uniqueTagNames(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (name === "") {
      throw new Error("Tag name must not be empty");
    }
    const key = name.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(name);
  }
  return unique;
}

async function resolveTagIds(
  transaction: ScopedTransactionClient,
  workspace_id: string,
  names: readonly string[]
): Promise<{ ids: string[]; stored_names: string[] }> {
  const ids: string[] = [];
  const stored_names: string[] = [];
  for (const name of uniqueTagNames(names)) {
    const created = await transaction.$queryRaw<(TagIdRow & { name: string })[]>`
      INSERT INTO tags (workspace_id, name)
      VALUES (${workspace_id}::uuid, ${name})
      ON CONFLICT DO NOTHING
      RETURNING id, name
    `;
    const resolved =
      created[0] ??
      (
        await transaction.$queryRaw<(TagIdRow & { name: string })[]>`
          SELECT id, name
          FROM tags
          WHERE workspace_id = ${workspace_id}::uuid
            AND lower(name) = lower(${name})
          LIMIT 1
        `
      )[0];
    if (!resolved) {
      throw new Error("Tag resolution did not return an id");
    }
    ids.push(resolved.id);
    stored_names.push(resolved.name);
  }
  return { ids, stored_names };
}

async function replaceMemberTags(
  transaction: ScopedTransactionClient,
  workspace_id: string,
  user_id: string,
  tag_ids: readonly string[]
): Promise<void> {
  await transaction.$executeRaw`
    DELETE FROM member_tags
    WHERE workspace_id = ${workspace_id}::uuid
      AND user_id = ${user_id}::uuid
  `;
  for (const tag_id of tag_ids) {
    await transaction.$executeRaw`
      INSERT INTO member_tags (workspace_id, user_id, tag_id)
      VALUES (${workspace_id}::uuid, ${user_id}::uuid, ${tag_id}::uuid)
    `;
  }
}

/**
 * Writes the Equipe association for a user_id that the route already resolved
 * (Auth Admin stays in 03b). Never grants the right to provision, never
 * creates OWNER, and a DETACHED row of the same pair comes back ACTIVE
 * instead of inserting a second line (ADR-0021, ADR-0023).
 */
export async function attachWorkspaceMember(
  context: UserContext,
  input: AttachWorkspaceMemberInput,
  prisma: PrismaClient = sharedPrisma
): Promise<AttachedWorkspaceMember> {
  assertOwner(context);
  assertUuid(input.user_id, "user_id");
  assertCollaboratorRole(input.role);
  const display_name = normalizedDisplayName(input.display_name);
  const email = normalizedMemberEmail(input.email);
  const whatsapp_phone_e164 = normalizedWhatsappPhone(input.whatsapp_phone);

  return withAccessContext(prisma, context, async (transaction) => {
    const existing = await transaction.$queryRaw<LockedMemberRow[]>`
      SELECT role, status::text AS status
      FROM workspace_members
      WHERE workspace_id = ${context.workspace_id}::uuid
        AND user_id = ${input.user_id}::uuid
      FOR UPDATE
    `;
    const current = existing[0];
    if (current?.role === "OWNER") {
      throw new Error("Cadastro cannot create an OWNER membership");
    }

    if (current) {
      await transaction.$executeRaw`
        UPDATE workspace_members
        SET
          role = ${input.role}::workspace_role,
          status = 'ACTIVE'::workspace_member_status,
          display_name = ${display_name},
          email = ${email},
          whatsapp_phone_e164 = ${whatsapp_phone_e164}
        WHERE workspace_id = ${context.workspace_id}::uuid
          AND user_id = ${input.user_id}::uuid
      `;
    } else {
      await transaction.$executeRaw`
        INSERT INTO workspace_members (
          workspace_id,
          user_id,
          role,
          status,
          display_name,
          email,
          whatsapp_phone_e164
        )
        VALUES (
          ${context.workspace_id}::uuid,
          ${input.user_id}::uuid,
          ${input.role}::workspace_role,
          'ACTIVE'::workspace_member_status,
          ${display_name},
          ${email},
          ${whatsapp_phone_e164}
        )
      `;
    }

    const tags = await resolveTagIds(transaction, context.workspace_id, input.tags);
    await replaceMemberTags(transaction, context.workspace_id, input.user_id, tags.ids);

    return {
      user_id: input.user_id,
      role: input.role,
      status: "ACTIVE",
      display_name,
      email,
      whatsapp_phone_e164,
      tags: tags.stored_names
    };
  });
}

/**
 * Reads the Equipe of this workspace. Role scope is applied here, not in the
 * caller: ATTENDANT is refused; SUPERVISOR still sees the whole roster in
 * this ticket — the team cut is ticket 05, which needs this catalog first.
 */
export async function listTeam(
  context: UserContext,
  prisma: PrismaClient = sharedPrisma
): Promise<TeamMember[]> {
  if (!TEAM_READERS.has(context.role)) {
    throw new Error("ATTENDANT cannot list the team");
  }

  return withAccessContext(prisma, context, async (transaction) => {
    const rows = await transaction.$queryRaw<TeamMemberRow[]>`
      SELECT
        member.user_id,
        member.display_name,
        member.email,
        member.role,
        member.status,
        member.whatsapp_phone_e164,
        COALESCE(
          array_agg(tag.name ORDER BY lower(tag.name), tag.name)
            FILTER (WHERE tag.id IS NOT NULL),
          ARRAY[]::text[]
        ) AS tags
      FROM workspace_members AS member
      LEFT JOIN member_tags AS applied
        ON applied.workspace_id = member.workspace_id
       AND applied.user_id = member.user_id
      LEFT JOIN tags AS tag
        ON tag.workspace_id = applied.workspace_id
       AND tag.id = applied.tag_id
      WHERE member.status = 'ACTIVE'::workspace_member_status
      GROUP BY
        member.user_id,
        member.display_name,
        member.email,
        member.role,
        member.status,
        member.whatsapp_phone_e164,
        member.created_at
      ORDER BY member.created_at, member.user_id
    `;
    return rows.map((row) => ({
      user_id: row.user_id,
      display_name: row.display_name,
      email: row.email,
      role: row.role,
      status: "ACTIVE",
      whatsapp_phone_e164: row.whatsapp_phone_e164,
      tags: row.tags
    }));
  });
}
