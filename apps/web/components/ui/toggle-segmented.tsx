import Link from "next/link";

/**
 * DESIGN.md "Components > Inputs & Forms > toggle-segmented". Pill track in
 * `{colors.surface-inset}`, 2px padding; the selected segment fills with
 * `{colors.canvas}` and takes `{typography.button}` in `{colors.ink}`, the
 * others stay transparent in `{colors.ink-muted}`.
 *
 * Built out of links, not state: which view is open belongs in the URL, so a
 * reload, a back button and a shared address all land on the same board
 * (ADR-0013).
 */
export interface ToggleSegmentedOption {
  readonly label: string;
  readonly href: string;
  readonly selected: boolean;
}

export interface ToggleSegmentedProps {
  readonly label: string;
  readonly options: readonly ToggleSegmentedOption[];
}

export function ToggleSegmented({ label, options }: ToggleSegmentedProps) {
  return (
    <nav aria-label={label} className="inline-flex rounded-pill bg-surface-inset p-0.5">
      {options.map((option) => (
        <Link
          aria-current={option.selected ? "page" : undefined}
          className={
            "inline-flex min-h-9 items-center rounded-pill px-sm text-button focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-focus pointer-coarse:min-h-11 "
            + (option.selected ? "bg-canvas text-ink" : "text-ink-muted hover:text-ink")
          }
          href={option.href}
          key={option.href}
        >
          {option.label}
        </Link>
      ))}
    </nav>
  );
}
