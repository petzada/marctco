import { createIntegrationStatusHandler } from "../../../../../../lib/integration-secret-route";
import { LANDING_PAGE_SURFACE } from "../../../../../../lib/integration-surfaces";

export const dynamic = "force-dynamic";

export const POST = createIntegrationStatusHandler(LANDING_PAGE_SURFACE);
