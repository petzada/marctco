import { Card } from "../ui/card";

/**
 * What Gestão sees where Direção sees `IntegrationSecretPanel` (ADR-0015).
 *
 * It says "o segredo" and not "a URL e o segredo": the landing-page screen
 * prints the endpoint in its own documentation regardless of role, so the
 * wider claim was false there.
 */
export function IntegrationSecretNotice() {
  return (
    <Card>
      <p className="text-body-sm text-ink-secondary">
        O segredo desta conexão é administrado pela Direção. Fale com quem tem esse papel para
        gerar, rotacionar ou desativar a chave.
      </p>
    </Card>
  );
}
