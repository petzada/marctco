export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  await import("./sentry.server.config");
  const { assertSafeDatabaseRole } = await import("@marctco/db");
  await assertSafeDatabaseRole({ process_name: "web" });
}
