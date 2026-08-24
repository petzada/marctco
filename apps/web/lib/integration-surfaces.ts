import type { IntegrationProvider } from "@marctco/db";
import { LANDING_PAGE_ENDPOINT_PATH } from "./landing-page-recipes";
import { PLUGA_LEADS_ENDPOINT_PATH } from "./pluga-templates";

/**
 * The URL segment an integration screen lives under. A closed union rather
 * than a string because it has to equal a directory name on disk
 * (`app/workspace/[slug]/integrations/<segment>/`), and nothing at runtime
 * checks that it does — a typo would compile.
 */
export type IntegrationSegment = "pluga" | "landing-page" | "whatsapp";

/**
 * Binds an integration screen to the provider it administers.
 *
 * This exists because the two drifted apart once: the landing-page screen
 * documented "o token exclusivo da conexão de landing page" while the only
 * route that could mint a secret hard-coded `PROVIDER = "PLUGA"`, so the
 * connection the screen described had no way to be born. A screen and its
 * secret routes now read the provider from the same object.
 *
 * Routing and wording are kept apart on purpose: adding an origin touches the
 * first group, rewording a screen touches `copy`, and neither is a reason to
 * edit the other.
 */
export interface IntegrationSurface {
  readonly segment: IntegrationSegment;
  readonly provider: IntegrationProvider;
  /** Ingestion endpoint the operator pastes into the origin. */
  readonly endpointPath: string;
  /**
   * When true, the secret panel also offers the JSON headers block Pluga
   * pastes. Must stay a boolean: a formatter function cannot cross the RSC
   * boundary into the client island.
   */
  readonly offersJsonRequestHeaders: boolean;
  readonly copy: IntegrationSurfaceCopy;
}

/**
 * Every user-visible string that differs between the screens, so the panel can
 * stay one component. Spelled out rather than interpolated from a noun: the
 * first version built "Desativar a {noun}?" and quietly depended on every
 * origin's name being feminine, which is not a constraint the type can hold.
 */
export interface IntegrationSurfaceCopy {
  readonly panelDescription: string;
  /** Label of the URL the operator pastes into the origin. */
  readonly urlFieldLabel: string;
  /** Example name for a new connection. N per provider since ADR-0031. */
  readonly newConnectionPlaceholder: string;
  /** Why naming it matters, in the origin's own vocabulary. */
  readonly newConnectionHint: string;
  readonly enableButton: string;
  readonly disableButton: string;
  readonly disableTitle: string;
  readonly rotateWarning: string;
  readonly disableWarning: string;
}

export const PLUGA_SURFACE: IntegrationSurface = {
  segment: "pluga",
  provider: "PLUGA",
  endpointPath: PLUGA_LEADS_ENDPOINT_PATH,
  offersJsonRequestHeaders: true,
  copy: {
    panelDescription:
      "Cole a URL de API e o segredo nos cabeçalhos JSON da automação HTTP Request da Pluga.",
    urlFieldLabel: "URL de API",
    newConnectionPlaceholder: "Pluga ACR",
    newConnectionHint:
      "Uma conexão por conta da Pluga. O nome é como você reconhece de qual delas o lead veio.",
    enableButton: "Ativar integração",
    disableButton: "Desativar integração",
    disableTitle: "Desativar a integração?",
    rotateWarning:
      "O segredo atual para de funcionar imediatamente. Você vai precisar colar o novo valor na Pluga antes que os leads voltem a chegar.",
    disableWarning:
      "Nenhum lead novo é aceito enquanto a integração estiver desativada. A configuração e o segredo continuam guardados: você pode reativar a qualquer momento sem gerar um novo segredo."
  }
};

export const LANDING_PAGE_SURFACE: IntegrationSurface = {
  segment: "landing-page",
  provider: "LANDING_PAGE",
  endpointPath: LANDING_PAGE_ENDPOINT_PATH,
  offersJsonRequestHeaders: false,
  copy: {
    panelDescription:
      "Guarde o segredo no servidor do site: no WordPress, no backend ou nos segredos da função serverless. Ele nunca vai no JavaScript da página.",
    urlFieldLabel: "URL do webhook",
    newConnectionPlaceholder: "LP institucional",
    newConnectionHint:
      "Uma conexão por landing page. Cada uma com o segredo próprio: assim duas páginas que numeram os leads por conta própria não se atropelam.",
    enableButton: "Ativar conexão",
    disableButton: "Desativar conexão",
    disableTitle: "Desativar a conexão da landing page?",
    rotateWarning:
      "O segredo atual para de funcionar imediatamente. Atualize o valor no servidor da landing page antes que os formulários voltem a chegar.",
    disableWarning:
      "Nenhum lead novo da landing page é aceito enquanto a conexão estiver desativada. A configuração e o segredo continuam guardados: você pode reativar a qualquer momento sem gerar um novo segredo."
  }
};

/**
 * WhatsApp administers WHATSMIAU. It is not a secret-panel surface: the
 * account apikey never belongs to the tenant, and the webhook token is never
 * shown in the browser.
 */
export const WHATSMIAU_SURFACE = {
  segment: "whatsapp" as const satisfies IntegrationSegment,
  provider: "WHATSMIAU" as const,
  webhookPath: "/api/webhooks/whatsmiau"
};
