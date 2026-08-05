import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const admin_database_url = process.env.MANAGED_MIGRATION_ADMIN_URL;
const migration_database_url = process.env.MANAGED_MIGRATION_DATABASE_URL;
const migrator_database_url = process.env.MANAGED_MIGRATOR_DATABASE_URL;
const enabled = Boolean(admin_database_url && migration_database_url && migrator_database_url);
const repository_root = fileURLToPath(new URL("../../..", import.meta.url));
const admin = admin_database_url
  ? new PrismaClient({ datasources: { db: { url: admin_database_url } } })
  : undefined;

describe.skipIf(!enabled)("managed Postgres migration role", () => {
  beforeAll(async () => {
    await admin?.$executeRawUnsafe(`
      CREATE ROLE postgres
        LOGIN CREATEROLE NOSUPERUSER NOCREATEDB NOREPLICATION NOBYPASSRLS
        PASSWORD 'managed-postgres-local'
    `);
    await admin?.$executeRawUnsafe("CREATE DATABASE marctco_managed OWNER postgres");
  });

  afterAll(async () => {
    await admin?.$disconnect();
  });

  it("applies the real migration as a non-superuser that creates the owner role", async () => {
    const pnpm = process.env.npm_execpath;
    if (!pnpm || !migration_database_url) {
      throw new Error("pnpm and managed migration URLs are required");
    }

    expect(() =>
      execFileSync(
        process.execPath,
        [pnpm, "--filter", "@marctco/db", "exec", "prisma", "migrate", "deploy"],
        {
          cwd: repository_root,
          encoding: "utf8",
          env: {
            ...process.env,
            DATABASE_URL: migration_database_url,
            DIRECT_URL: migration_database_url
          }
        }
      )
    ).not.toThrow();

    await admin?.$executeRawUnsafe(
      "ALTER ROLE marctco_migrator PASSWORD 'managed-migrator-local'"
    );
    expect(() =>
      execFileSync(
        process.execPath,
        [pnpm, "--filter", "@marctco/db", "exec", "prisma", "migrate", "status"],
        {
          cwd: repository_root,
          encoding: "utf8",
          env: {
            ...process.env,
            DATABASE_URL: migrator_database_url,
            DIRECT_URL: migrator_database_url
          }
        }
      )
    ).not.toThrow();

    const migrated = new PrismaClient({
      datasources: { db: { url: migration_database_url } }
    });
    try {
      const state = await migrated.$queryRaw<
        Array<{
          role_name: string;
          can_set_migrator: boolean;
          owned_business_tables: bigint;
        }>
      >`
        SELECT
          current_user::text AS role_name,
          pg_has_role(current_user, 'marctco_migrator', 'SET') AS can_set_migrator,
          (
            SELECT COUNT(*)
            FROM pg_tables
            WHERE schemaname = 'public'
              AND tablename <> '_prisma_migrations'
              AND tableowner = 'marctco_migrator'
          ) AS owned_business_tables
      `;
      expect(state).toEqual([
        {
          role_name: "postgres",
          can_set_migrator: true,
          owned_business_tables: 2n
        }
      ]);
    } finally {
      await migrated.$disconnect();
    }
  }, 15_000);
});
