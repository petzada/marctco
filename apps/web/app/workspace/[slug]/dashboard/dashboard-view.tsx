import Link from "next/link";
import dynamic from "next/dynamic";
import type { OperationalDashboard, UnresolvedNotification } from "@marctco/db";
import { Card } from "../../../../components/ui/card";
import { EmptyState } from "../../../../components/ui/empty-state";
import {
  buildDashboardChartsViewModel,
  buildDashboardNotificationViewModel,
  buildDashboardTileViewModel,
  burningNotificationsEmptyState,
  type DashboardTileViewModel
} from "../../../../lib/dashboard/view-model";
import { supervisorTeamEmptyState } from "../../../../lib/supervisor-team-empty-state";
import { DashboardNotifications } from "./dashboard-notifications";

const DashboardCharts = dynamic(
  () => import("./dashboard-charts").then((mod) => mod.DashboardCharts)
);

const COUNT_TONE: Readonly<Record<DashboardTileViewModel["tone"], string>> = {
  danger: "text-danger",
  warning: "text-warning",
  neutral: "text-ink"
};

interface DashboardViewProps {
  readonly dashboard: OperationalDashboard;
  readonly notifications: readonly UnresolvedNotification[];
  readonly slug: string;
}

export function DashboardView({ dashboard, notifications, slug }: DashboardViewProps) {
  const tiles = dashboard.tiles.map((tile) => buildDashboardTileViewModel(tile, slug));
  const charts = buildDashboardChartsViewModel(dashboard.series);
  const notices = notifications.map((item) => buildDashboardNotificationViewModel(item, slug));
  const missingTeam =
    dashboard.empty_state?.reason === "SUPERVISOR_WITHOUT_TEAM"
      ? supervisorTeamEmptyState("dashboard")
      : null;
  const nothingBurning = notices.length === 0 ? burningNotificationsEmptyState() : null;

  return (
    <main className="min-h-[100dvh] bg-canvas px-md py-lg md:px-lg md:py-xl">
      <div className="mx-auto grid w-full max-w-content-wide gap-lg">
        <header>
          <p className="text-eyebrow text-primary">Comercial</p>
          <h1 className="mt-xxs text-headline text-ink">Dashboard</h1>
          <p className="mt-sm max-w-prose text-body text-ink-secondary">
            O que está queimando agora. Cada número abre a lista já filtrada.
          </p>
        </header>

        {missingTeam ? (
          <EmptyState description={missingTeam.description} title={missingTeam.title} />
        ) : null}

        <section
          aria-label="Números do dia"
          className="grid grid-cols-1 gap-lg md:grid-cols-2 xl:grid-cols-4"
        >
          {tiles.map((tile) => (
            <DashboardTileCard key={tile.id} tile={tile} />
          ))}
        </section>

        <DashboardCharts charts={charts} />

        <section aria-label="Avisos da operação">
          <Card className="flex flex-col gap-sm">
            <div className="flex flex-col gap-xxs">
              <h2 className="text-title text-ink">O que precisa de reação</h2>
              <p className="text-caption text-ink-muted">
                Leads estourados e parados. Marcar como lida não tira o aviso da lista.
              </p>
            </div>
            {missingTeam ? (
              <EmptyState description={missingTeam.description} title={missingTeam.title} />
            ) : nothingBurning ? (
              <EmptyState description={nothingBurning.description} title={nothingBurning.title} />
            ) : (
              <DashboardNotifications items={notices} slug={slug} />
            )}
          </Card>
        </section>
      </div>
    </main>
  );
}

function DashboardTileCard({ tile }: Readonly<{ tile: DashboardTileViewModel }>) {
  return (
    <Link
      className="block rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-focus"
      href={tile.href}
    >
      <Card className="flex h-full flex-col gap-sm hover:border-hairline-strong">
        <p className="text-caption text-ink-muted">{tile.label}</p>
        <p
          className={`text-headline tabular-nums md:text-display-md ${COUNT_TONE[tile.tone]}`}
        >
          {tile.count}
        </p>
        <p className="mt-auto text-body-sm text-ink-secondary">{tile.actionLabel}</p>
      </Card>
    </Link>
  );
}
