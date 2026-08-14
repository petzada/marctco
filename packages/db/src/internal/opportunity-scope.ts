import { Prisma } from "@prisma/client";
import type { UserContext } from "../access-context.js";

/**
 * Profile scope for every named Opportunity operation. Tenant isolation stays
 * in RLS; this clause prevents colleagues in one tenant from leaking through
 * a broad operation (ADR-0015, ADR-0020, ADR-0024).
 */
export function opportunityScopeSql(context: UserContext, alias: string): Prisma.Sql {
  const opportunity = Prisma.raw(alias);
  switch (context.role) {
    case "ATTENDANT":
      return Prisma.sql`AND ${opportunity}.assigned_user_id = ${context.user_id}::uuid`;
    case "SUPERVISOR":
      return Prisma.sql`
        AND ${opportunity}.assigned_user_id IN (
          SELECT member.user_id
          FROM workspace_members AS member
          WHERE member.workspace_id = ${context.workspace_id}::uuid
            AND member.status = 'ACTIVE'::workspace_member_status
            AND EXISTS (
              SELECT 1
              FROM member_tags AS member_tag
              JOIN member_tags AS actor_tag
                ON actor_tag.workspace_id = member_tag.workspace_id
               AND actor_tag.tag_id = member_tag.tag_id
              WHERE member_tag.workspace_id = member.workspace_id
                AND member_tag.user_id = member.user_id
                AND actor_tag.user_id = ${context.user_id}::uuid
            )
        )
      `;
    case "MANAGER":
    case "OWNER":
      return Prisma.empty;
    default: {
      const unknownRole: never = context.role;
      throw new Error(`Unknown workspace role, refusing Opportunity access: ${JSON.stringify(unknownRole)}`);
    }
  }
}
