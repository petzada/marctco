/**
 * How the generated secret shows on screen after the first render: the
 * cleartext value is only ever in the response of the generate/rotate call
 * (shown once, held in client-side component state, never persisted), and
 * every later view of the connection carries only `token_last4`.
 */
const MASK = "••••••••••••••••••••••••••••••••••••••••";

export function maskIntegrationSecret(token_last4: string): string {
  return `mtco_${MASK}${token_last4}`;
}
