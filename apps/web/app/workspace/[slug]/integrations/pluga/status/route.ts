import { createIntegrationStatusHandler } from "../../../../../../lib/integration-connection-routes";
import { PLUGA_SURFACE } from "../../../../../../lib/integration-surfaces";

export const dynamic = "force-dynamic";

export const POST = createIntegrationStatusHandler(PLUGA_SURFACE);
