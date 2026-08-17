/**
 * The public origin of this installation, for URLs the operator pastes into
 * another product (Pluga, a landing-page backend). Behind Railway the `Host`
 * header is the internal container; the public name arrives in
 * `x-forwarded-host` or `RAILWAY_PUBLIC_DOMAIN`.
 */

export function publicOriginFromRequest(
  requestHeaders: Headers,
  railwayPublicDomain = process.env.RAILWAY_PUBLIC_DOMAIN
): string | null {
  const forwardedHost = firstHeaderValue(requestHeaders.get("x-forwarded-host"));
  const host = firstHeaderValue(requestHeaders.get("host"));
  const railway = railwayPublicDomain?.trim() || null;

  const chosen = usableHost(forwardedHost) ?? usableHost(railway) ?? usableHost(host);
  if (chosen === null) {
    return null;
  }

  const proto = protocolFor(requestHeaders, chosen);
  return `${proto}://${chosen}`;
}

export function publicIntegrationUrl(
  requestHeaders: Headers,
  endpointPath: string,
  railwayPublicDomain = process.env.RAILWAY_PUBLIC_DOMAIN
): string {
  const origin = publicOriginFromRequest(requestHeaders, railwayPublicDomain);
  return origin === null ? endpointPath : `${origin}${endpointPath}`;
}

function firstHeaderValue(value: string | null): string | null {
  const first = value?.split(",")[0]?.trim();
  return first ? first : null;
}

/**
 * A hostname the operator can paste. Container ids (`f59095ac8225`) have no
 * dot and are not a public URL. localhost is the local exception.
 */
function usableHost(host: string | null): string | null {
  if (host === null || host === "") {
    return null;
  }
  const hostname = hostnameOf(host);
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
    return host;
  }
  return hostname.includes(".") ? host : null;
}

function hostnameOf(host: string): string {
  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    return end === -1 ? host : host.slice(1, end);
  }
  const colon = host.lastIndexOf(":");
  if (colon > -1 && /^\d+$/.test(host.slice(colon + 1))) {
    return host.slice(0, colon);
  }
  return host;
}

function protocolFor(requestHeaders: Headers, host: string): "http" | "https" {
  const forwarded = firstHeaderValue(requestHeaders.get("x-forwarded-proto"));
  if (forwarded === "http" || forwarded === "https") {
    return forwarded;
  }
  const hostname = hostnameOf(host);
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
    return "http";
  }
  return "https";
}
