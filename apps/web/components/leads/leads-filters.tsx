import type { TeamMember } from "@marctco/db";
import { Button } from "../ui/button";

export function LeadsFilters({
  members,
  responsible,
  team
}: Readonly<{ members: readonly TeamMember[]; responsible?: string; team?: string }>) {
  const teams = leadFilterTeams(members);
  if (members.length === 0) return null;
  return (
    <form className="flex flex-wrap items-end gap-sm" method="GET">
      <label className="grid gap-xxs text-label text-ink-secondary">
        Responsável
        <select className="min-h-10 rounded-md border border-hairline bg-canvas px-sm text-body-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-focus" defaultValue={responsible ?? ""} name="responsible">
          <option value="">Todos</option>
          <option value="unassigned">Sem responsável</option>
          {members.map((member) => <option key={member.user_id} value={member.user_id}>{member.display_name ?? member.email ?? "Sem nome"}</option>)}
        </select>
      </label>
      <label className="grid gap-xxs text-label text-ink-secondary">
        Equipe
        <select className="min-h-10 rounded-md border border-hairline bg-canvas px-sm text-body-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-focus" defaultValue={team ?? ""} name="team">
          <option value="">Todas</option>
          {teams.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
      </label>
      <Button type="submit" variant="primary">Filtrar</Button>
    </form>
  );
}

export function leadFilterTeams(members: readonly Pick<TeamMember, "tags">[]): string[] {
  return [...new Set(members.flatMap((member) => member.tags))].sort((a, b) => a.localeCompare(b, "pt-BR"));
}
