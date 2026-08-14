export type SupervisorTeamEmptySurface = "leads" | "team";

/** Copy shared by Leads now and Equipe when its screen is mounted by 03b. */
export function supervisorTeamEmptyState(surface: SupervisorTeamEmptySurface): {
  readonly title: string;
  readonly description: string;
} {
  return {
    title: surface === "leads"
      ? "Seu time ainda n\u00e3o aparece nos Leads"
      : "Seu time ainda n\u00e3o aparece na Equipe",
    description:
      "Voc\u00ea ainda n\u00e3o tem uma tag de equipe. A Dire\u00e7\u00e3o resolve isso na tela Equipe."
  };
}
