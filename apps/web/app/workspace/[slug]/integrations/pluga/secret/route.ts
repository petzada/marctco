import { createIntegrationSecretHandler } from "../../../../../../lib/integration-secret-route";
import { PLUGA_SURFACE } from "../../../../../../lib/integration-surfaces";

export const dynamic = "force-dynamic";

export const POST = createIntegrationSecretHandler(PLUGA_SURFACE);
