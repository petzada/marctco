import { createIntegrationSecretHandler } from "../../../../../../lib/integration-connection-routes";
import { LANDING_PAGE_SURFACE } from "../../../../../../lib/integration-surfaces";

export const dynamic = "force-dynamic";

export const POST = createIntegrationSecretHandler(LANDING_PAGE_SURFACE);
