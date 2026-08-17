export const ACTIVITY_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  OPPORTUNITY_NOT_VISIBLE: "Este lead não está no seu alcance.",
  OPPORTUNITY_CLOSED: "Não dá para marcar atividade em lead ganho ou perdido.",
  OPPORTUNITY_MERGED: "Este lead foi mesclado. Use o card canônico.",
  ASSIGNEE_INACTIVE: "O responsável escolhido não está ativo.",
  ASSIGNEE_NOT_ALLOWED: "Seu perfil não marca atividade para essa pessoa.",
  ASSIGNEE_CANNOT_REACH_LEAD: "Essa pessoa não alcança este lead.",
  ACTIVITY_NOT_VISIBLE: "Esta atividade não está no seu alcance.",
  ALREADY_DONE: "Esta atividade já foi concluída.",
  ALREADY_CANCELED: "Esta atividade já foi cancelada.",
  INVALID_TITLE: "A descrição da atividade é obrigatória.",
  INVALID_TYPE: "Escolha ligação, mensagem, reunião ou tarefa.",
  INVALID_DUE_AT: "Informe data e hora de vencimento."
};

export function activityErrorMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  return ACTIVITY_ERROR_MESSAGES[code] ?? "Não foi possível salvar a atividade.";
}
