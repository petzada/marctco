/**
 * Whether "completar e liberar" has anything to submit. Mirrors, in the UI
 * layer, the same gate `decidePersonIdentity` applies server-side
 * (`NO_CONTACT` when both are empty, ADR-0007 §Identidade) — this copy exists
 * only so the button can be disabled with a reason before a request is ever
 * made, never as a substitute for the server enforcing it. A blank string is
 * not a contact, so it is trimmed before judging either field non-empty.
 */
export interface QuarantineReleaseInput {
  readonly phone: string;
  readonly email: string;
}

export function canReleaseQuarantinedLead(input: QuarantineReleaseInput): boolean {
  return input.phone.trim() !== "" || input.email.trim() !== "";
}

/** The non-technical reason shown next to the disabled action. */
export const NO_CONTACT_EXPLANATION =
  "Informe ao menos um telefone ou e-mail para liberar este lead. Sem um jeito de falar " +
  "com a pessoa, o card nasceria sem dono no atendimento — é por isso que a ação fica " +
  "indisponível até você preencher um dos dois.";
