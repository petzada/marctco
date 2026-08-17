export type SupervisorTeamEmptySurface = "leads" | "team" | "board" | "agenda";

const TITLES: Readonly<Record<SupervisorTeamEmptySurface, string>> = {
  leads: "Seu time ainda n\u00e3o aparece nos Leads",
  team: "Seu time ainda n\u00e3o aparece na Equipe",
  board: "Seu time ainda n\u00e3o aparece no quadro",
  agenda: "Seu time ainda n\u00e3o aparece na Agenda"
};

/** Copy shared by Leads, Equipe and the Meus leads board (tickets 05, 03b, 07). */
export function supervisorTeamEmptyState(surface: SupervisorTeamEmptySurface): {
  readonly title: string;
  readonly description: string;
} {
  return {
    title: TITLES[surface],
    description:
      "Voc\u00ea ainda n\u00e3o tem uma tag de equipe. A Dire\u00e7\u00e3o resolve isso na tela Equipe."
  };
}
