import * as Sentry from "@sentry/nextjs";
import { sanitizeTelemetry } from "@marctco/domain";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  beforeSend(event) {
    const first_exception = event.exception?.values?.[0];
    const safe = sanitizeTelemetry({
      ...event.tags,
      ...event.extra,
      message: event.message ?? first_exception?.value,
      stack: first_exception?.stacktrace
        ? JSON.stringify(first_exception.stacktrace.frames ?? [])
        : undefined
    });

    return {
      type: event.type,
      ...(event.event_id ? { event_id: event.event_id } : {}),
      ...(event.level ? { level: event.level } : {}),
      ...(event.platform ? { platform: event.platform } : {}),
      ...(event.timestamp ? { timestamp: event.timestamp } : {}),
      ...(typeof safe.message === "string" ? { message: safe.message } : {}),
      extra: safe
    };
  }
});
