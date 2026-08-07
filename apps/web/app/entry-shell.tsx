/**
 * The frame shared by every screen that runs before a workspace is open:
 * `/login`, `/onboarding`, `/access`. All three are the same object — one
 * centered panel lifted off `{colors.canvas-sunken}` by a hairline, per
 * DESIGN.md "Elevation & Depth" level 2 — and they were drifting apart one
 * class at a time. Holding the frame in a single place is what keeps the
 * responsive ladder below from having to be re-derived on each page.
 */

/**
 * Centering is `m-auto` on the panel rather than `items-center` on the flex
 * container. They look identical until the panel is taller than the viewport
 * — a short landscape phone, or 200% browser zoom — and then `items-center`
 * overflows in both directions and puts the top of the panel above the
 * scrollable area, permanently unreachable. Auto margins collapse to zero
 * when free space runs out, so the panel simply starts at the top padding.
 */
export function EntryShell({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="flex min-h-[100dvh] bg-canvas-sunken px-md py-xl md:px-lg md:py-xxl">
      <section className="m-auto w-full max-w-dialog rounded-xl border border-hairline bg-canvas p-lg md:p-xl">
        {children}
      </section>
    </main>
  );
}

/**
 * DESIGN.md "Responsive Behavior > Touch Targets": buttons hold 40px on
 * pointer viewports and grow to 44px on touch — `pointer-coarse` is the
 * media query that actually asks the device, rather than guessing from
 * viewport width, which gets a tablet with a mouse wrong in both directions.
 *
 * The focus ring is `focus-visible`, not `focus`: a mouse click on a button
 * should not leave a ring behind it. Note the absence of `outline-none` — it
 * compiles to `--tw-outline-style: none`, which silently defeats the
 * `outline-2` below it.
 */
const actionClassName =
  "inline-flex min-h-10 items-center justify-center rounded-md px-md text-button " +
  "transition-[background-color,transform] duration-150 ease-out " +
  "active:scale-[0.98] pointer-coarse:min-h-11 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-focus";

export const primaryActionClassName =
  `${actionClassName} w-full bg-primary text-on-primary hover:bg-primary-hover ` +
  "disabled:cursor-not-allowed disabled:bg-ink-disabled disabled:active:scale-100";

export const secondaryActionClassName =
  `${actionClassName} border border-hairline-strong text-ink hover:bg-surface-inset`;

/**
 * DESIGN.md "Components > Inputs" — 8px vertical, 12px horizontal padding.
 * The 16px body size is load-bearing beyond typography: iOS Safari zooms the
 * viewport on focus for anything under 16px, which on a login form reads as
 * the page breaking.
 */
export const fieldClassName =
  "min-h-10 w-full rounded-md border border-hairline bg-canvas px-sm text-body text-ink " +
  "placeholder:text-ink-muted pointer-coarse:min-h-11 " +
  "focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "focus-visible:outline-primary-focus";
