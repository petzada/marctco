"use client";

import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Card } from "../../../../components/ui/card";
import {
  CHART_AXIS_GUTTER,
  CHART_AXIS_PAINT,
  CHART_GRID_PAINT,
  CHART_MARGIN,
  CHART_SERIES_PAINT
} from "../../../../lib/dashboard/chart-tokens";
import { CATEGORICAL_FILL_CLASS } from "../../../../lib/dashboard/chart-fills";
import type {
  ArrivalChartPoint,
  DashboardChartsViewModel,
  SlaAdherenceChartPoint,
  StageChartPoint
} from "../../../../lib/dashboard/view-model";

interface DashboardChartsProps {
  readonly charts: DashboardChartsViewModel;
}

export function DashboardCharts({ charts }: DashboardChartsProps) {
  return (
    <section aria-label="Gráficos da operação" className="grid grid-cols-1 gap-lg xl:grid-cols-2">
      <ChartCard
        title="Chegadas por dia"
        description="Últimos 14 dias, no fuso da operação."
      >
        <ArrivalsPlot points={charts.arrivals} />
      </ChartCard>
      <ChartCard
        title="Aderência ao SLA"
        description="Cumprido sobre cumprido e estourado. Dias ainda pendentes ficam sem taxa."
      >
        <SlaPlot points={charts.sla_adherence} />
      </ChartCard>
      <div className="xl:col-span-2">
        <ChartCard
          title="Leads em aberto por etapa"
          description="Funil comercial padrão, no escopo do seu perfil."
        >
          <StageBars points={charts.open_by_stage} />
        </ChartCard>
      </div>
    </section>
  );
}

function ChartCard({
  title,
  description,
  children
}: Readonly<{ title: string; description: string; children: ReactNode }>) {
  return (
    <Card className="flex flex-col gap-sm">
      <div className="flex flex-col gap-xxs">
        <h2 className="text-title text-ink">{title}</h2>
        <p className="text-caption text-ink-muted">{description}</p>
      </div>
      {children}
    </Card>
  );
}

function ArrivalsPlot({ points }: Readonly<{ points: readonly ArrivalChartPoint[] }>) {
  return (
    <div className="overflow-x-auto">
      <div className="h-chart-plot min-w-chart-track text-caption text-chart-axis">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={[...points]} margin={CHART_MARGIN}>
            <CartesianGrid stroke={CHART_GRID_PAINT} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: CHART_AXIS_PAINT }}
              tickLine={false}
              axisLine={{ stroke: CHART_GRID_PAINT }}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: CHART_AXIS_PAINT }}
              tickLine={false}
              axisLine={false}
              width={CHART_AXIS_GUTTER}
            />
            <Tooltip
              cursor={{ fill: "var(--color-surface-inset)" }}
              content={<ArrivalsTooltip />}
            />
            <Bar dataKey="count" fill={CHART_SERIES_PAINT} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function SlaPlot({ points }: Readonly<{ points: readonly SlaAdherenceChartPoint[] }>) {
  return (
    <div className="overflow-x-auto">
      <div className="h-chart-plot min-w-chart-track text-caption text-chart-axis">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={[...points]} margin={CHART_MARGIN}>
            <CartesianGrid stroke={CHART_GRID_PAINT} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: CHART_AXIS_PAINT }}
              tickLine={false}
              axisLine={{ stroke: CHART_GRID_PAINT }}
            />
            <YAxis
              domain={[0, 1]}
              tickFormatter={formatRateTick}
              tick={{ fill: CHART_AXIS_PAINT }}
              tickLine={false}
              axisLine={false}
              width={CHART_AXIS_GUTTER}
            />
            <Tooltip
              cursor={{ stroke: "var(--color-hairline-strong)" }}
              content={<SlaTooltip />}
            />
            <Line
              type="monotone"
              dataKey="adherence"
              stroke={CHART_SERIES_PAINT}
              dot={false}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function StageBars({ points }: Readonly<{ points: readonly StageChartPoint[] }>) {
  if (points.length === 0) {
    return (
      <p className="text-body-sm text-ink-muted">Este workspace ainda não tem funil comercial padrão.</p>
    );
  }
  return (
    <ul className="flex flex-col gap-sm">
      {points.map((point) => (
        <li key={point.stage_id} className="flex flex-col gap-xxs">
          <div className="flex items-baseline justify-between gap-sm">
            <span className="text-body-sm text-ink">{point.label}</span>
            <span className="text-caption tabular-nums text-ink-muted">{point.count}</span>
          </div>
          <div className="h-sm overflow-hidden rounded-sm bg-surface-inset">
            <div
              className={`h-full ${CATEGORICAL_FILL_CLASS[point.color]}`}
              style={{ width: `${Math.round(point.share * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function ArrivalsTooltip({
  active,
  payload
}: {
  readonly active?: boolean;
  readonly payload?: readonly { readonly payload: ArrivalChartPoint }[];
}) {
  const point = payload?.[0]?.payload;
  if (!active || point === undefined) {
    return null;
  }
  return (
    <div className="rounded-lg border border-hairline bg-canvas px-sm py-xs shadow-overlay">
      <p className="text-caption text-ink-muted">{point.label}</p>
      <p className="text-body-sm tabular-nums text-ink">{point.count} chegadas</p>
    </div>
  );
}

function SlaTooltip({
  active,
  payload
}: {
  readonly active?: boolean;
  readonly payload?: readonly { readonly payload: SlaAdherenceChartPoint }[];
}) {
  const point = payload?.[0]?.payload;
  if (!active || point === undefined) {
    return null;
  }
  return (
    <div className="rounded-lg border border-hairline bg-canvas px-sm py-xs shadow-overlay">
      <p className="text-caption text-ink-muted">{point.label}</p>
      <p className="text-body-sm tabular-nums text-ink">{point.rateLabel}</p>
    </div>
  );
}

function formatRateTick(value: number): string {
  return `${Math.round(value * 100)}%`;
}
