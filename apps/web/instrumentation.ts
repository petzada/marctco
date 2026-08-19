export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  await import("./sentry.server.config");
  const { assertSafeDatabaseRole } = await import("@marctco/db");
  await assertSafeDatabaseRole({ process_name: "web" });

  if (process.env.REDIS_URL) {
    const { startIngestionDispatcher } = await import("./lib/ingestion-queue");
    startIngestionDispatcher();
  }

  // Retention is not queue work: it touches only PostgreSQL, so it starts even
  // where the queue is absent (ADR-0014).
  const { startPayloadExpirySweep } = await import("./lib/payload-expiry-sweep");
  startPayloadExpirySweep();

  const { startOpportunityClockSweep } = await import("./lib/opportunity-clock-sweep");
  startOpportunityClockSweep();
}
