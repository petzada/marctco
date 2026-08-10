import type { ReactNode } from "react";

/**
 * DESIGN.md "Components > Data Display > empty-state". Centered stack on
 * `{colors.canvas}`: icon at 32px in `{colors.ink-disabled}`, headline in
 * `{typography.title}`, one line of `{typography.body-sm}` in
 * `{colors.ink-muted}`, one `{component.button-primary}`. Vertical padding
 * `{spacing.xxl}`.
 */
export interface EmptyStateProps {
  readonly title: string;
  readonly description: string;
  readonly action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-sm px-lg py-xxl text-center">
      <svg
        aria-hidden="true"
        className="h-8 w-8 text-ink-disabled"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        viewBox="0 0 24 24"
      >
        <path
          d="M9 13h6m-7 6h8a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2Z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <p className="text-title text-ink">{title}</p>
      <p className="max-w-prose text-body-sm text-ink-muted">{description}</p>
      {action}
    </div>
  );
}
