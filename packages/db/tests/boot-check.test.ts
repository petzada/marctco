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
});

