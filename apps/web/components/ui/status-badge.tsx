import type { ReactNode } from "react";

/**
 * DESIGN.md "Components > Data Display > status-badge". Pill for pipeline
 * stage and record state: `{rounded.pill}`, padding 2px × 8px, `{typography.caption}`
 * at weight 500. Background is the semantic `-surface` tone, text the
 * matching `-ink` tone, with an optional 6px `{rounded.full}` dot in the base
 * tone. Neutral uses `{colors.surface-inset}` + `{colors.ink-muted}`.
 */

export type StatusBadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

const SURFACE: Readonly<Record<StatusBadgeTone, string>> = {
  neutral: "bg-surface-inset text-ink-muted",
  success: "bg-success-surface text-success-ink",
  warning: "bg-warning-surface text-warning-ink",
  danger: "bg-danger-surface text-danger-ink",
  // Info reuses the accent — DESIGN.md documents no separate info hue.
  info: "bg-primary-subtle text-primary"
};

const DOT: Readonly<Record<StatusBadgeTone, string>> = {
  neutral: "bg-ink-muted",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-primary"
};

export interface StatusBadgeProps {
  readonly tone: StatusBadgeTone;
  readonly dot?: boolean;
  readonly children: ReactNode;
  readonly className?: string;
}

export function StatusBadge({ tone, dot = false, children, className = "" }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-xxs rounded-pill px-xs py-0.5 text-caption font-medium ${SURFACE[tone]} ${className}`.trim()}
    >
      {dot ? <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${DOT[tone]}`} /> : null}
      {children}
    </span>
  );
}
