const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The one place packages/db decides what an identifier has to look like. */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function assertUuid(value: unknown, label: string): asserts value is string {
  if (!isUuid(value)) {
    throw new Error(`${label} must be a UUID, received: ${JSON.stringify(value)}`);
  }
}
