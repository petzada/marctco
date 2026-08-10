import { NextResponse } from "next/server";
import { acceptIntegrationLead } from "../../../../../lib/integration-lead-endpoint";

export const dynamic = "force-dynamic";

/**
 * Server-to-server landing-page endpoint. The token belongs in the provider's
 * backend or webhook vault, never in JavaScript delivered to a visitor.
 */
export async function POST(request: Request) {
  return acceptIntegrationLead(request);
}

/**
 * Authorization triggers a browser preflight. Refusing it makes the supported
 * boundary explicit: this endpoint is not a browser CORS API.
 */
export function OPTIONS(): NextResponse {
  return new NextResponse(null, {
    status: 405,
    headers: { allow: "POST" }
  });
}
