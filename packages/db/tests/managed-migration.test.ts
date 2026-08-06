import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const admin_database_url = process.env.MANAGED_MIGRATION_ADMIN_URL;
const migration_database_url = process.env.MANAGED_MIGRATION_DATABASE_URL;
const migrator_database_url = process.env.MANAGED_MIGRATOR_DATABASE_URL;
const enabled = Boolean(admin_database_url && migration_database_url && migrator_database_url);
const repository_root = fileURLToPath(new URL("../../..", import.meta.url));
const prisma_source = fileURLToPath(new URL("../prisma", import.meta.url));
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
    const fixture_root = mkdtempSync(join(tmpdir(), "marctco-managed-migration-"));
    try {
      const fixture_prisma = join(fixture_root, "prisma");
      cpSync(prisma_source, fixture_prisma, { recursive: true });
      const followup = join(fixture_prisma, "migrations", "20260805000200_managed_followup");
      mkdirSync(followup);
      writeFileSync(
        join(followup, "migration.sql"),
        "CREATE TABLE public.managed_followup_probe (id INTEGER PRIMARY KEY);\n"
      );

      expect(() =>
        execFileSync(
          process.execPath,
          [
            pnpm,
            "--filter",
            "@marctco/db",
            "exec",
            "prisma",
            "migrate",
            "deploy",
            "--schema",
            join(fixture_prisma, "schema.prisma")
          ],
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
    } finally {
      rmSync(fixture_root, { recursive: true, force: true });
    }

    const migrated = new PrismaClient({
      datasources: { db: { url: migration_database_url } }
    });
    try {
      const state = await migrated.$queryRaw<
        Array<{
          role_name: string;
          can_set_migrator: boolean;
          unowned_business_tables: bigint;
          followup_applied: boolean;
        }>
      >`
        SELECT
          current_user::text AS role_name,
          pg_has_role(current_user, 'marctco_migrator', 'SET') AS can_set_migrator,
          (
            -- What matters is that no business table escapes the migrator, not
            -- how many there are: a count would have to be edited by every
            -- ticket that adds a table, and an edited expectation proves less
            -- each time.
            SELECT COUNT(*)
            FROM pg_tables
            WHERE schemaname = 'public'
              AND tablename <> '_prisma_migrations'
              AND tableowner <> 'marctco_migrator'
          ) AS unowned_business_tables,
          EXISTS (
            SELECT 1
            FROM public._prisma_migrations
            WHERE migration_name = '20260805000200_managed_followup'
              AND finished_at IS NOT NULL
          ) AS followup_applied
      `;
      expect(state).toEqual([
        {
          role_name: "postgres",
          can_set_migrator: true,
          unowned_business_tables: 0n,
          followup_applied: true
        }
      ]);
    } finally {
      await migrated.$disconnect();
    }
  }, 15_000);
});
