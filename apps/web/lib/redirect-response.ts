import { NextResponse } from "next/server";

/**
 * A redirect to another route of this app, addressed by path only.
 *
 * The obvious spelling — `NextResponse.redirect(new URL(path, request.url))` —
 * is wrong here, and wrong in a way that only shows up in production. Behind
 * Railway's edge the app is reached over its public domain, but the request
 * that arrives at the Node server carries the internal container host, so
 * `request.url` reads as `http://f59095ac8225:8080/...`. Every redirect built
 * from it hands the browser an absolute `Location` pointing at a hostname that
 * only resolves inside the private network: the site root and the whole
 * post-provisioning path dead-ended on an unreachable address.
 *
 * A relative `Location` is explicitly allowed (RFC 7231 §7.1.2 — the
 * absolute-URI requirement was dropped in RFC 7238) and is what every browser
 * has resolved against the request URL for years. It has no host to get wrong,
 * so it survives any proxy, any domain, and the preview environments too.
 *
 * `next/navigation`'s `redirect()` already emits a relative location, which is
 * why the Server Component redirects were never affected — this is only for
 * route handlers, which build the response themselves.
 */
export function redirectTo(path: `/${string}`, status: 303 | 307 = 303): NextResponse {
  return new NextResponse(null, { status, headers: { Location: path } });
}
