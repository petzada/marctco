/**
 * Copy blocks for the Pluga screen. Meta's fields are the ones ADR-0008
 * confirmed in Pluga's public documentation; the Google template is
 * deliberately absent — the public field list for that trigger came back
 * truncated, and ADR-0008 refuses to guess a mapping no real account has
 * verified.
 */

export const PLUGA_LEADS_ENDPOINT_PATH = "/v1/integrations/pluga/leads";

export const pluginRequestHeaders = `Authorization: Bearer COLE_O_TOKEN_AQUI
Content-Type: application/json`;

/**
 * The body to paste into Pluga's "Corpo da requisição (JSON)" field for a
 * Facebook Lead Ads → HTTP Request automation. `<< … >>` marks where a value
 * comes from the field the automation's editor offers for that key — Pluga
 * assembles the JSON from whatever the user types, so this is the shape to
 * reproduce, not a payload the CRM sends. `name`, `phone` and `email` are
 * marked "confirmar no editor" because the public field list Pluga documents
 * for this trigger does not include them — ADR-0008 expects them to appear
 * dynamically once a real form is connected, and that is exactly what the
 * test flow below exists to check.
 */
export const metaHttpRequestTemplate = `{
  "schema_version": "v1",
  "source": "META_LEAD_ADS",
  "external_lead_id": "<< ID do Lead >>",
  "occurred_at": "<< Data/hora de criação — use a variante ISO >>",
  "name": "<< resposta do formulário: nome — confirmar no editor >>",
  "phone": "<< resposta do formulário: telefone — confirmar no editor >>",
  "email": "<< resposta do formulário: e-mail — confirmar no editor >>",
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
