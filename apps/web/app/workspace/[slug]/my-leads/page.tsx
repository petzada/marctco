import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getLeadBoard, listTeam } from "@marctco/db";
import { LeadBoardKanban } from "../../../../components/leads/lead-board-kanban";
import { LeadBoardList } from "../../../../components/leads/lead-board-list";
import { ToggleSegmented } from "../../../../components/ui/toggle-segmented";
import { attendsLeads } from "../../../../lib/lead-board-access";
import { boardSearchParamsCache } from "../../../../lib/leads/search-params";
import { resolveWorkspaceAccess } from "../../../../lib/workspace-access";

export const metadata: Metadata = {
  title: "Meus leads | marctco",
  description: "Quadro das etapas em aberto de quem atende"
};

/**
 * Server Component reading `getLeadBoard` directly (ADR-0013) — the screen
 * assembles no query, and the only write is the drag, which goes through
 * `my-leads/stage`.
 *
 * Gestão and Direção are redirected to Leads rather than refused: the board
 * is the screen of who attends, and everything it would show them the Leads
 * table already does, with the filter by responsible and by team on top
 * (ADR-0015 records "—" for those two, not a block).
 */
export default async function MyLeadsPage({
  params,
  searchParams
}: Readonly<{
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const { slug } = await params;
  const access = await resolveWorkspaceAccess(slug);
  if (access.status !== "resolved") {
    // The layout above this route already redirects to /login or 404s an
    // unassociated workspace; nothing renders here in that case.
    return null;
  }
  if (!attendsLeads(access.workspace.role)) {
    redirect(`/workspace/${slug}/leads`);
  }

  const { view } = await boardSearchParamsCache.parse(searchParams);
  const isList = view === "list";

  // Both reads leave together (ADR-0013). `listTeam` refuses an ATTENDANT and
  // would tell them nothing anyway: only a Supervisor's board can be empty
  // for want of a tag.
  const [board, team] = await Promise.all([
    getLeadBoard(access.workspace.context),
    access.workspace.role === "SUPERVISOR" ? listTeam(access.workspace.context) : Promise.resolve([])
  ]);
  const isSupervisorWithoutTeam = access.workspace.role === "SUPERVISOR" && team.length === 0;

  return (
    <main className="min-h-[100dvh] bg-canvas px-md py-lg md:px-lg md:py-xl">
      <div className="mx-auto w-full max-w-content-wide">
        <header className="flex flex-wrap items-end justify-between gap-sm">
          <div>
            <p className="text-eyebrow text-primary">Comercial</p>
            <h1 className="mt-xxs text-headline text-ink">Meus leads</h1>
          </div>
          <ToggleSegmented
            label="Forma de ver os leads"
            options={[
              { label: "Kanban", href: `/workspace/${slug}/my-leads`, selected: !isList },
              { label: "Lista", href: `/workspace/${slug}/my-leads?view=list`, selected: isList }
            ]}
          />
        </header>

        <div className="mt-lg">
          {isList ? (
            <LeadBoardList
              board={board}
              isSupervisorWithoutTeam={isSupervisorWithoutTeam}
              slug={slug}
            />
          ) : (
            <LeadBoardKanban
              board={board}
              isSupervisorWithoutTeam={isSupervisorWithoutTeam}
              slug={slug}
            />
          )}
        </div>
      </div>
    </main>
  );
}
