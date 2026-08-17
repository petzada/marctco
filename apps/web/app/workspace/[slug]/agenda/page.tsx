import type { Metadata } from "next";
import { listAgenda, listLeads, listTeam } from "@marctco/db";
import { agendaBoundsForView, shiftAgendaDate } from "@marctco/domain";
import { ToggleSegmented } from "../../../../components/ui/toggle-segmented";
import { resolveWorkspaceAccess } from "../../../../lib/workspace-access";
import { agendaHref, agendaListOptions, agendaSearchParamsCache, resolveAgendaQuery } from "../../../../lib/agenda/search-params";
import { AgendaView } from "./agenda-view";

export const metadata: Metadata = {
  title: "Agenda | marctco",
  description: "O dia e a semana das atividades dos leads no seu alcance"
};

/**
 * Server Component reading `listAgenda` directly (ADR-0013). The screen
 * never assembles a `where`: interval and filters come from the URL and go
 * into the named operation as they are.
 */
export default async function AgendaPage({
  params,
  searchParams
}: Readonly<{
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const { slug } = await params;
  const access = await resolveWorkspaceAccess(slug);
  if (access.status !== "resolved") {
    return null;
  }

  const parsed = await agendaSearchParamsCache.parse(searchParams);
  const query = resolveAgendaQuery(parsed);
  const options = agendaListOptions(query);
  const context = access.workspace.context;
  const [agenda, leads, members] = await Promise.all([
    listAgenda(context, options),
    listLeads(context, { limit: 50 }),
    context.role === "ATTENDANT" ? Promise.resolve([]) : listTeam(context)
  ]);
  const isSupervisorWithoutTeam = context.role === "SUPERVISOR" && members.length === 0;
  const step = query.view === "week" ? 7 : 1;

  return (
    <main className="min-h-[100dvh] bg-canvas px-md py-lg md:px-lg md:py-xl">
      <div className="mx-auto grid w-full max-w-content-wide gap-lg">
        <header className="flex flex-wrap items-end justify-between gap-sm">
          <div>
            <p className="text-eyebrow text-primary">Comercial</p>
            <h1 className="mt-xxs text-headline text-ink">Agenda</h1>
          </div>
          <ToggleSegmented
            label="Vista da agenda"
            options={[
              { label: "Dia", href: agendaHref(slug, query, { view: "day" }), selected: query.view === "day" },
              { label: "Semana", href: agendaHref(slug, query, { view: "week" }), selected: query.view === "week" }
            ]}
          />
        </header>

        <nav aria-label="Intervalo da agenda" className="flex flex-wrap items-center gap-sm">
          <a
            className="min-h-10 rounded-md border border-hairline bg-surface-inset px-sm text-button text-ink hover:border-hairline-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-focus"
            href={agendaHref(slug, query, { date: shiftAgendaDate(query.date, -step) })}
          >
            Anterior
          </a>
          <p className="text-body-strong tabular-nums text-ink">{intervalLabel(query.view, query.date)}</p>
          <a
            className="min-h-10 rounded-md border border-hairline bg-surface-inset px-sm text-button text-ink hover:border-hairline-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-focus"
            href={agendaHref(slug, query, { date: shiftAgendaDate(query.date, step) })}
          >
            Próximo
          </a>
        </nav>

        <AgendaView
          currentUserId={context.user_id}
          isSupervisorWithoutTeam={isSupervisorWithoutTeam}
          items={agenda.items}
          leads={leads.map((row) => ({ opportunity_id: row.opportunity_id, name: row.name?.trim() || "Sem nome" }))}
          members={members.map((member) => ({
            user_id: member.user_id,
            display_name: member.display_name?.trim() || member.email || "Sem nome"
          }))}
          pipelines={agenda.pipelines}
          query={query}
          slug={slug}
          tags={agenda.tags}
        />
      </div>
    </main>
  );
}

function intervalLabel(view: "day" | "week", date: string): string {
  const bounds = agendaBoundsForView({ view: "day", date });
  if (!bounds.ok) {
    return date;
  }
  const formatted = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: view === "day" ? "long" : undefined,
    day: "numeric",
    month: "long"
  }).format(bounds.from);
  return view === "day" ? formatted : `Semana de ${formatted}`;
}
