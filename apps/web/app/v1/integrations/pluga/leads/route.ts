import { acceptIntegrationLead } from "../../../../../lib/integration-lead-endpoint";

export const dynamic = "force-dynamic";

/**
 * One POST per lead, answered 200 after the PostgreSQL commit. Pluga and the
 * landing-page endpoint share this exact acceptance boundary; provider and
 * source are interpreted later from the stored event and its connection.
 */
export async function POST(request: Request) {
  return acceptIntegrationLead(request);
}
