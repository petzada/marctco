import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";

const database_url = process.env.DATABASE_URL;
const pgbouncer_database_url = process.env.PGBOUNCER_DATABASE_URL;
if (!database_url || !pgbouncer_database_url) {
  throw new Error("DATABASE_URL and PGBOUNCER_DATABASE_URL are required for A7 tests");
}

const client = new PrismaClient({ datasources: { db: { url: database_url } } });

afterAll(async () => {
  await client.$disconnect();
});

describe("A7 mechanical checks", () => {
  it("keeps SET LOCAL inside Prisma interactive transactions", async () => {
    const workspace_id = randomUUID();
    const observed = await client.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe(`SET LOCAL app.workspace_id = '${workspace_id}'`);
      return transaction.$queryRaw<Array<{ workspace_id: string }>>`
        SELECT current_setting('app.workspace_id', true)::text AS workspace_id
      `;
    });

    expect(observed).toEqual([{ workspace_id }]);
    const after = await client.$queryRaw<Array<{ workspace_id: string }>>`
      SELECT current_setting('app.workspace_id', true)::text AS workspace_id
    `;
    expect(after).toEqual([{ workspace_id: "" }]);
  });

  it("uses pgbouncer=true successfully through transaction-mode pooling", async () => {
    const pooled = new PrismaClient({
      datasources: { db: { url: pgbouncer_database_url } }
    });
    try {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const result = await pooled.$queryRaw<Array<{ value: number }>>`SELECT 1 AS value`;
        expect(result).toEqual([{ value: 1 }]);
      }
    } finally {
      await pooled.$disconnect();
    }
  });

  it("proves a caught unique violation aborts the transaction", async () => {
    let violation_caught = false;
    await expect(
      client.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe(
          "CREATE TEMP TABLE a7_unique_abort (id integer PRIMARY KEY) ON COMMIT DROP"
        );
        await transaction.$executeRawUnsafe("INSERT INTO a7_unique_abort (id) VALUES (1)");
        try {
          await transaction.$executeRawUnsafe("INSERT INTO a7_unique_abort (id) VALUES (1)");
        } catch {
          violation_caught = true;
        }
        await transaction.$queryRawUnsafe("SELECT 1");
      })
    ).rejects.toThrow(/transaction|aborted|25P02/i);
    expect(violation_caught).toBe(true);
  });

  it("continues after ON CONFLICT DO NOTHING RETURNING id", async () => {
    const result = await client.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe(
        "CREATE TEMP TABLE a7_on_conflict (id integer PRIMARY KEY) ON COMMIT DROP"
      );
      await transaction.$executeRawUnsafe("INSERT INTO a7_on_conflict (id) VALUES (1)");
      const duplicate = await transaction.$queryRawUnsafe<Array<{ id: number }>>(
        "INSERT INTO a7_on_conflict (id) VALUES (1) ON CONFLICT DO NOTHING RETURNING id"
      );
      const continued = await transaction.$queryRawUnsafe<Array<{ value: number }>>(
        "SELECT 1 AS value"
      );
      return { duplicate, continued };
    });

    expect(result).toEqual({ duplicate: [], continued: [{ value: 1 }] });
  });

  it("does not report the existing private schema as Prisma drift", async () => {
    const schemas = await client.$queryRaw<Array<{ schema_name: string | null }>>`
      SELECT to_regnamespace('private')::text AS schema_name
    `;
    expect(schemas).toEqual([{ schema_name: "private" }]);

    const repository_root = fileURLToPath(new URL("../../..", import.meta.url));
    const pnpm = process.env.npm_execpath;
    if (!pnpm) {
      throw new Error("pnpm executable path is unavailable");
    }
    const output = execFileSync(
      process.execPath,
      [
        pnpm,
        "--filter",
        "@marctco/db",
        "exec",
        "prisma",
        "migrate",
        "diff",
        "--from-url",
        database_url,
        "--to-schema-datamodel",
        "prisma/schema.prisma",
        "--exit-code"
      ],
      { cwd: repository_root, encoding: "utf8", env: process.env }
    );
    expect(output).toMatch(/No difference detected|^$/m);
    // This case spawns a Prisma process, so it is not bound by the default
    // 5s: the CI runner and a loaded laptop both cross that line, and a drift
    // check that fails for being slow teaches nothing about drift.
  }, 20_000);
});
