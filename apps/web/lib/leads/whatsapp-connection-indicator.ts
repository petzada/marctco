export interface WhatsAppConnectionIndicatorView {
  readonly connected: boolean;
  readonly label: string;
}

/**
 * Card-facing boolean for the workspace WhatsApp instance. Copy stays PT-BR;
 * the named DB operation never returns a token, last4 or instance secret.
 */
export function buildWhatsAppConnectionIndicatorView(
  connected: boolean
): WhatsAppConnectionIndicatorView {
  return {
    connected,
    label: connected ? "WhatsApp conectado" : "WhatsApp desconectado"
  };
}
