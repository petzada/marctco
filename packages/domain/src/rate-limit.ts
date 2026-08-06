export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retry_after_ms?: number;
}

export interface RateLimiter {
  consume(key: string): RateLimitDecision;
}

export type SuspiciousRequest =
  | { scope: "AUTH_FAILURE"; ip_address: string }
  | { scope: "LANDING_PAGE_TOKEN"; token_hash: string }
  | { scope: "FOREIGN_WORKSPACE_ATTEMPT"; ip_address: string }
  | { scope: "UNENTITLED_PROVISIONING_ATTEMPT"; ip_address: string };

interface RateLimitBucket {
  count: number;
  expires_at: number;
}

interface MemoryRateLimiterOptions {
  limit: number;
  window_ms: number;
  now?: () => number;
}

export function createMemoryRateLimiter(options: MemoryRateLimiterOptions): RateLimiter {
  if (options.limit < 1 || options.window_ms < 1) {
    throw new Error("Rate limit and window must be positive");
  }

  const buckets = new Map<string, RateLimitBucket>();
  const now = options.now ?? Date.now;

  return {
    consume(key) {
      const current_time = now();
      const current = buckets.get(key);

      if (!current || current.expires_at <= current_time) {
        buckets.set(key, {
          count: 1,
          expires_at: current_time + options.window_ms
        });
        return { allowed: true, remaining: options.limit - 1 };
      }

      current.count += 1;
      if (current.count <= options.limit) {
        return { allowed: true, remaining: options.limit - current.count };
      }

      return {
        allowed: false,
        remaining: 0,
        retry_after_ms: Math.max(0, current.expires_at - current_time)
      };
    }
  };
}

function requestKey(request: SuspiciousRequest): string {
  switch (request.scope) {
    case "AUTH_FAILURE":
      return `auth-failure:${request.ip_address}`;
    case "LANDING_PAGE_TOKEN":
      return `landing-page:${request.token_hash}`;
    case "FOREIGN_WORKSPACE_ATTEMPT":
      return `foreign-workspace:${request.ip_address}`;
    case "UNENTITLED_PROVISIONING_ATTEMPT":
      return `unentitled-provisioning:${request.ip_address}`;
  }
}

export function checkSuspiciousRequestLimit(
  limiter: RateLimiter,
  request: SuspiciousRequest
): RateLimitDecision {
  try {
    return limiter.consume(requestKey(request));
  } catch {
    return { allowed: true, remaining: 0 };
  }
}
