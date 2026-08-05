import { describe, expect, it } from "vitest";
import { assertSafeDatabaseRole } from "../src/boot-check.js";

const database_url = process.env.DATABASE_URL;
if (!database_url) {
  throw new Error("DATABASE_URL is required for database tests");
}

describe("runtime database role boot check", () => {
  it.each(["web", "worker"] as const)(
    "refuses to boot %s with a superuser connection and names the condition",
    async (process_name) => {
      await expect(assertSafeDatabaseRole({ process_name, database_url })).rejects.toThrow(
        new RegExp(`${process_name}.*postgres.*is superuser`, "i")
      );
    }
  );

  it("reports only sanitized endpoint metadata when authentication fails", async () => {
    const invalid_password = "wrong-password-must-not-leak";
    const invalid_url = `postgresql://marctco_worker:${invalid_password}@localhost:54329/marctco?schema=public`;

    const failure = await assertSafeDatabaseRole({
      process_name: "worker",
      database_url: invalid_url
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toMatch(
      /worker.*database connection failed.*host=localhost.*port=54329.*username=marctco_worker.*query_keys=\[schema\]/i
    );
    expect((failure as Error).message).not.toContain(invalid_password);
  });
});

