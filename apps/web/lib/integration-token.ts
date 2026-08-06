const BEARER_PATTERN = /^Bearer[ \t]+(\S+)[ \t]*$/i;

/**
 * The whole of what the ingestion endpoint accepts as identity. The tenant
 * comes from this token and from nothing else — a `workspace_id` in the body
 * is ignored, always (ADR-0007).
 */
export function bearerToken(headers: Headers): string | null {
  const authorization = headers.get("authorization");
  if (!authorization) {
    return null;
  }
  return BEARER_PATTERN.exec(authorization)?.[1] ?? null;
}
