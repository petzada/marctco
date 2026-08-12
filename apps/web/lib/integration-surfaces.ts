import type { IntegrationProvider } from "@marctco/db";
import { LANDING_PAGE_ENDPOINT_PATH } from "./landing-page-recipes";
import { PLUGA_LEADS_ENDPOINT_PATH } from "./pluga-templates";

/**
 * Binds an integration screen's URL segment to the provider it administers.
 *
 * This exists because the two drifted apart once: the landing-page screen
 * documented "o token exclusivo da conexão de landing page" while the only
 * route that could mint a secret hard-coded `PROVIDER = "PLUGA"`, so the
 * connection the screen described had no way to be born. A screen and its
 * secret routes now read the provider from the same object, and a third
 * origin cannot be added by copying a route file and forgetting the constant.
 *
 * The copy that differs between the screens lives here too, so the panel can
 * stay one component. Both nouns are feminine — "a integração", "a conexão da
 * landing page" — which is what lets the panel build its labels by
 * interpolation instead of carrying a phrase per surface.
 */
export interface IntegrationSurface {
  /** The `integrations/<segment>` path this surface's screen and routes live under. */
  readonly segment: string;
  readonly provider: IntegrationProvider;
  /** Ingestion endpoint the operator pastes into the origin. */
  readonly endpointPath: string;
  readonly noun: string;
  readonly panelDescription: string;
  readonly rotateWarning: string;
  readonly disableWarning: string;
}

export const PLUGA_SURFACE: IntegrationSurface = {
  segment: "pluga",
  provider: "PLUGA",
  endpointPath: PLUGA_LEADS_ENDPOINT_PATH,
  noun: "integração",
  panelDescription:
    "Cole a URL e o segredo no destino HTTP Request da automação da Pluga.",
  rotateWarning:
    "O segredo atual para de funcionar imediatamente. Você vai precisar colar o novo valor na Pluga antes que os leads voltem a chegar.",
  disableWarning:
    "Nenhum lead novo é aceito enquanto a integração estiver desativada. A configuração e o segredo continuam guardados — você pode reativar a qualquer momento sem gerar um novo segredo."
};

export const LANDING_PAGE_SURFACE: IntegrationSurface = {
  segment: "landing-page",
  provider: "LANDING_PAGE",
  endpointPath: LANDING_PAGE_ENDPOINT_PATH,
  noun: "conexão da landing page",
  panelDescription:
    "Guarde o segredo no servidor do site — no WordPress, no backend ou nos segredos da função serverless. Ele nunca vai no JavaScript da página.",
  rotateWarning:
    "O segredo atual para de funcionar imediatamente. Atualize o valor no servidor da landing page antes que os formulários voltem a chegar.",
  disableWarning:
    "Nenhum lead novo da landing page é aceito enquanto a conexão estiver desativada. A configuração e o segredo continuam guardados — você pode reativar a qualquer momento sem gerar um novo segredo."
};

/**
 * Every surface that administers its own connection. A landing page keeps a
 * credential separate from Pluga's on purpose: rotating one because the
 * automation leaked must not silence the other, and disabling one origin must
 * not disable the other.
 */
export const INTEGRATION_SURFACES: readonly IntegrationSurface[] = [
  PLUGA_SURFACE,
  LANDING_PAGE_SURFACE
];
