import { describe, expect, it } from "vitest";
import { inspectRuntimeDatabaseUrl, redactRuntimeDatabaseSecrets } from "./runtime-database-url.js";

const project_ref = "abcdefghijklmnopqrst";
const encoded_password = "not-a-secret%40value";

describe("runtime database URL", () => {
  it("accepts a qualified custom role on Supavisor transaction mode", () => {
    expect(
      inspectRuntimeDatabaseUrl(
        `postgresql://marctco_app.${project_ref}:${encoded_password}@aws-0-us-west-1.pooler.supabase.com:6543/postgres?schema=public&pgbouncer=true&connection_limit=1`,
        "web"
      )
    ).toEqual({
      host: "aws-0-us-west-1.pooler.supabase.com",
      port: "6543",
      username: `marctco_app.${project_ref}`,
      pgbouncer: "true",
      query_keys: ["connection_limit", "pgbouncer", "schema"]
    });
  });

  it.each([
    {
      name: "missing",
      query: "schema=public"
    },
    {
      name: "encoded as a query key",
      query: "schema=public&pgbouncer%3Dtrue"
    },
    {
      name: "using an unsupported value",
      query: "schema=public&pgbouncer=TRUE"
    }
  ])("refuses transaction mode when pgbouncer=true is $name", ({ query }) => {
    const url = `postgresql://marctco_app.${project_ref}:${encoded_password}@aws-0-us-west-1.pooler.supabase.com:6543/postgres?${query}`;

    expect(() => inspectRuntimeDatabaseUrl(url, "web")).toThrow(
      /web.*Supavisor transaction mode.*pgbouncer=true.*host=aws-0-us-west-1\.pooler\.supabase\.com.*port=6543.*username=marctco_app\.abcdefghijklmnopqrst/i
    );
    expect(() => inspectRuntimeDatabaseUrl(url, "web")).not.toThrow(encoded_password);
    expect(() => inspectRuntimeDatabaseUrl(url, "web")).not.toThrow("not-a-secret@value");
  });

  it("refuses an unqualified custom role on the shared Supavisor pooler", () => {
    expect(() =>
      inspectRuntimeDatabaseUrl(
        `postgresql://marctco_worker:${encoded_password}@aws-0-us-west-1.pooler.supabase.com:5432/postgres`,
        "worker"
      )
    ).toThrow(/worker.*username must be <role>\.<project-ref>.*username=marctco_worker/i);
  });

  it.each([
    `postgresql://marctco_worker.${project_ref}:${encoded_password}@aws-0-us-west-1.pooler.supabase.com:5432/postgres`,
    `postgresql://marctco_worker:${encoded_password}@db.${project_ref}.supabase.co:5432/postgres`
  ])("accepts session or direct mode without the PgBouncer flag", (url) => {
    expect(() => inspectRuntimeDatabaseUrl(url, "worker")).not.toThrow();
  });

  it("redacts both the encoded and decoded password from a driver message", () => {
    const url = `postgresql://marctco_worker:${encoded_password}@db.${project_ref}.supabase.co:5432/postgres`;
    const message = `connection to ${encoded_password} refused; retried with not-a-secret@value`;

    const redacted = redactRuntimeDatabaseSecrets(message, url);

    expect(redacted).not.toContain(encoded_password);
    expect(redacted).not.toContain("not-a-secret@value");
    expect(redacted).toBe("connection to <redacted> refused; retried with <redacted>");
  });

  it("returns the message untouched when the URL carries no password", () => {
    const message = "connection refused";

    expect(
      redactRuntimeDatabaseSecrets(message, `postgresql://marctco_worker@localhost:5432/marctco`)
    ).toBe(message);
    expect(redactRuntimeDatabaseSecrets(message, "not-a-url")).toBe(message);
  });
});
