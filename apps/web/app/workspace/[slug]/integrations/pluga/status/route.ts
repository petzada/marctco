import { createIntegrationStatusHandler } from "../../../../../../lib/integration-secret-route";
import { PLUGA_SURFACE } from "../../../../../../lib/integration-surfaces";

export const dynamic = "force-dynamic";

export const POST = createIntegrationStatusHandler(PLUGA_SURFACE);
