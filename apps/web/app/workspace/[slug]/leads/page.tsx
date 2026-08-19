import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import {
  countLeadsByMarker,
  getWorkspaceSettings,
  listLeadAssignmentDestinations,
  listTeam,
  listLeads,
  type LeadListRow,
  type LeadMarkerCounts
} from "@marctco/db";
import type { Marker } from "@marctco/domain";
import { LeadsTable } from "../../../../components/leads/leads-table";
import { MarkerCounters } from "../../../../components/leads/marker-counters";
import { LeadsFilters } from "../../../../components/leads/leads-filters";
import { NewLeadsBanner } from "../../../../components/leads/new-leads-banner";
import { decodeLeadCursor, encodeLeadCursor } from "../../../../lib/leads/cursor";
import { leadsSearchParamsCache } from "../../../../lib/leads/search-params";
import { seesLeadsTable } from "../../../../lib/lead-board-access";
import { resolveWorkspaceAccess } from "../../../../lib/workspace-access";

export const metadata: Metadata = {
  title: "Leads | marctco",
  description: "Triagem de leads comerciais em volume alto"
};

const PAGE_SIZE = 50;

/**
 * Server Component reading `listLeads`/`countLeadsByMarker` directly
 * (ADR-0013) — no endpoint backs this listing. Filter, cursor and the active
 * marker come from the URL via `nuqs`. Both reads are kicked off in
 * parallel; each `Suspense` boundary below awaits only its own promise, so
 * the table streams without waiting on the aggregates (ADR-0013 §"Página e
 * contadores buscados em paralelo").
 */
export default async function LeadsPage({
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
  if (!seesLeadsTable(access.workspace.role)) {
    redirect(`/workspace/${slug}/my-leads`);
  }

  const { cursor: cursorParam, marker, clock, responsible, team } = await leadsSearchParamsCache.parse(searchParams);
  const cursor = decodeLeadCursor(cursorParam);
  const isUnassignedView = responsible === "unassigned";
  const responsibleUserId = responsible && !isUnassignedView && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(responsible)
    ? responsible
    : undefined;
  const teamName = team?.trim().slice(0, 100) || undefined;
  const now = new Date();
  const filterParams = new URLSearchParams();
  if (marker) filterParams.set("marker", marker);
  if (clock) filterParams.set("clock", clock);
  if (responsibleUserId || isUnassignedView) filterParams.set("responsible", responsibleUserId ?? "unassigned");
  if (teamName) filterParams.set("team", teamName);

  const rowsPromise = listLeads(access.workspace.context, {
    ...(cursor !== undefined ? { after: cursor } : {}),
    ...(marker ? { marker } : {}),
    ...(clock ? { clock, now } : {}),
    ...(responsibleUserId ? { responsible_user_id: responsibleUserId } : {}),
    ...(isUnassignedView ? { unassigned: true } : {}),
    ...(teamName ? { team: teamName } : {}),
    limit: PAGE_SIZE
  });
  const countsPromise = countLeadsByMarker(access.workspace.context);
  const settingsPromise = getWorkspaceSettings(access.workspace.context);
  const teamPromise = access.workspace.role === "ATTENDANT"
    ? Promise.resolve([])
    : listTeam(access.workspace.context);
  const assignDestinationsPromise = listLeadAssignmentDestinations(access.workspace.context, "ASSIGN");
  const reassignDestinationsPromise = listLeadAssignmentDestinations(access.workspace.context, "REASSIGN");

  return (
    <main className="min-h-[100dvh] bg-canvas px-md py-lg md:px-lg md:py-xl">
      <div className="mx-auto w-full max-w-content-wide">
        <header>
          <p className="text-eyebrow text-primary">Comercial</p>
          <h1 className="mt-xxs text-headline text-ink">Leads</h1>
        </header>

        <div className="mt-lg">
          <Suspense fallback={null}>
            <FiltersSection membersPromise={teamPromise} {...(responsibleUserId || isUnassignedView ? { responsible: responsibleUserId ?? "unassigned" } : {})} {...(teamName ? { team: teamName } : {})} />
          </Suspense>
        </div>

        <div className="mt-lg">
          <Suspense fallback={<CountersSkeleton />}>
            <CountersSection countsPromise={countsPromise} marker={marker ?? undefined} slug={slug} />
          </Suspense>
        </div>

        <div className="mt-lg">
          <Suspense fallback={<TableSkeleton />}>
            <TableSection
              hasActiveFilter={filterParams.size > 0}
              isFirstPage={cursor === undefined}
              teamPromise={teamPromise}
              assignDestinationsPromise={assignDestinationsPromise}
              reassignDestinationsPromise={reassignDestinationsPromise}
              actorUserId={access.workspace.context.user_id}
              isSupervisor={access.workspace.role === "SUPERVISOR"}
              filterQuery={filterParams.toString()}
              isUnassignedView={isUnassignedView}
              rowsPromise={rowsPromise}
              settingsPromise={settingsPromise}
              slug={slug}
            />
          </Suspense>
        </div>
      </div>
    </main>
  );
}

async function FiltersSection({ membersPromise, responsible, team }: Readonly<{
  membersPromise: ReturnType<typeof listTeam>;
  responsible?: string;
  team?: string;
}>) {
  return <LeadsFilters members={await membersPromise} {...(responsible ? { responsible } : {})} {...(team ? { team } : {})} />;
}

async function CountersSection({
  countsPromise,
  marker,
  slug
}: Readonly<{ countsPromise: Promise<LeadMarkerCounts>; marker: Marker | undefined; slug: string }>) {
  const counts = await countsPromise;
  return <MarkerCounters activeMarker={marker} counts={counts} slug={slug} />;
}

async function TableSection({
  rowsPromise,
  settingsPromise,
  slug,
  hasActiveFilter,
  isFirstPage,
  teamPromise,
  assignDestinationsPromise,
  reassignDestinationsPromise,
  actorUserId,
  isSupervisor,
  filterQuery,
  isUnassignedView
}: Readonly<{
  rowsPromise: Promise<LeadListRow[]>;
  settingsPromise: ReturnType<typeof getWorkspaceSettings>;
  slug: string;
  hasActiveFilter: boolean;
  isFirstPage: boolean;
  teamPromise: ReturnType<typeof listTeam>;
  assignDestinationsPromise: ReturnType<typeof listLeadAssignmentDestinations>;
  reassignDestinationsPromise: ReturnType<typeof listLeadAssignmentDestinations>;
  actorUserId: string;
  isSupervisor: boolean;
  filterQuery: string;
  isUnassignedView: boolean;
}>) {
  const [rows, members, assignDestinations, reassignDestinations, clockSettings] = await Promise.all([
    rowsPromise, teamPromise, assignDestinationsPromise, reassignDestinationsPromise, settingsPromise
  ]);
  const first = rows[0];
  const last = rows[rows.length - 1];
  const anchor =
    isFirstPage && first ? { arrived_at: first.arrived_at.toISOString(), id: first.opportunity_id } : null;
  const nextCursor = last && rows.length === PAGE_SIZE ? encodeLeadCursor({ arrived_at: last.arrived_at, id: last.opportunity_id }) : null;
  const filteredHref = `/workspace/${slug}/leads${filterQuery ? `?${filterQuery}` : ""}`;
  const nextParams = new URLSearchParams(filterQuery);
  if (nextCursor) nextParams.set("cursor", nextCursor);

  return (
    <div className="grid gap-md">
      <NewLeadsBanner anchor={anchor} slug={slug} />
      <LeadsTable
        hasActiveFilter={hasActiveFilter}
        isSupervisorWithoutTeam={isSupervisor && members.length === 0}
        actorUserId={actorUserId}
        assignDestinations={assignDestinations}
        reassignDestinations={reassignDestinations}
        isUnassignedView={isUnassignedView}
        clockSettings={clockSettings}
        nowIso={new Date().toISOString()}
        rows={rows}
        slug={slug}
      />
      {nextCursor || !isFirstPage ? (
        <nav aria-label="Paginação de leads" className="flex items-center justify-between">
          {!isFirstPage ? (
            <Link className="text-body-sm text-primary hover:underline" href={filteredHref}>
              ← Início
            </Link>
          ) : (
            <span />
          )}
          {nextCursor ? (
            <Link
              className="text-body-sm text-primary hover:underline"
              href={`/workspace/${slug}/leads?${nextParams.toString()}`}
            >
              Próxima página →
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}

function CountersSkeleton() {
  return (
    <div className="flex gap-xs" role="status">
      {[0, 1, 2].map((key) => (
        <div className="h-6 w-32 animate-pulse rounded-pill bg-surface-inset" key={key} />
      ))}
      <span className="sr-only">Carregando contadores…</span>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div aria-hidden="true" className="grid gap-xxs">
      {[0, 1, 2, 3, 4].map((key) => (
        <div className="h-12 w-full animate-pulse rounded-md bg-surface-inset" key={key} />
      ))}
    </div>
  );
}
