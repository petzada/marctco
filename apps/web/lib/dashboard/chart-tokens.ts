/**
 * DESIGN.md "Colors > Data visualization" and `{component.chart}`.
 * Recharts accepts paint as CSS variables so the plot never inlines a hex.
 * `{spacing.xs}` (8) is the documented plot inset; Recharts' margin prop is
 * a number of CSS pixels, so the token is named here instead of invented
 * at the callsite.
 */
export const CHART_SERIES_PAINT = "var(--color-chart-1)";
export const CHART_GRID_PAINT = "var(--color-chart-grid)";
export const CHART_AXIS_PAINT = "var(--color-chart-axis)";

/** `{spacing.xs}` — 8px. */
export const CHART_PLOT_INSET = 8;

/** `{spacing.xxl}` — room for numeric ticks. */
export const CHART_AXIS_GUTTER = 48;

export const CHART_MARGIN = {
  top: CHART_PLOT_INSET,
  right: CHART_PLOT_INSET,
  left: CHART_PLOT_INSET,
  bottom: CHART_PLOT_INSET
} as const;
