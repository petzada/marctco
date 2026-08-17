/**
 * Copy blocks for the Pluga screen. Meta field labels are the ones a real
 * Facebook Lead Ads → HTTP Request automation exposes in INSERIR INFOS
 * (ADR-0008, confirmed 2026-08-17). The Google template stays absent: that
 * trigger's public field list is truncated, and no real account has verified it.
 */

export const PLUGA_LEADS_ENDPOINT_PATH = "/v1/integrations/pluga/leads";

const HEADER_TOKEN_PLACEHOLDER = "COLE_O_TOKEN_AQUI";

/** JSON the Pluga "Cabeçalhos (JSON)" field expects, not HTTP request lines. */
export function pluginRequestHeadersFor(token: string): string {
  return JSON.stringify(
    {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    null,
    2
  );
}

export const pluginRequestHeaders = pluginRequestHeadersFor(HEADER_TOKEN_PLACEHOLDER);

/**
 * Body to paste into Pluga's "Corpo da requisição (JSON)" for Facebook Lead Ads
 * → HTTP Request. Literals stay typed. Everything in `<< … >>` is inserted by
 * clicking the matching INSERIR INFOS field, never by typing the label.
 *
 * `nome_completo`, `número_do_whatsapp` and `email` are the contact labels a
 * Portuguese Meta form typically exposes; another form may spell them
 * differently. `financing_type` is a literal for a vehicle form: swap it when
 * the form is imóvel or empréstimo pessoal. `is_organic` stays unquoted
 * (boolean). Extra form questions belong in `answers`, not as top-level keys.
 */
export const metaHttpRequestTemplate = `{
  "schema_version": "v1",
  "source": "META_LEAD_ADS",
  "external_lead_id": "<< ID do Lead >>",
  "occurred_at": "<< Data/hora de criação no formato ISO (AAAA-MM-DDTHH:mm:ssZ) >>",
  "name": "<< nome_completo >>",
  "phone": "<< número_do_whatsapp >>",
  "email": "<< email >>",
  "financing_type": "VEHICLE",
  "form_id": "<< form_id >>",
  "form_name": "<< form_name >>",
  "campaign_id": "<< campaign_id >>",
  "campaign_name": "<< campaign_name >>",
  "adset_id": "<< adset_id >>",
  "adset_name": "<< adset_name >>",
  "ad_id": "<< ad_id >>",
  "ad_name": "<< ad_name >>",
  "platform": "<< platform >>",
  "is_organic": << is_organic >>
}`;
