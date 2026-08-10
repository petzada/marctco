"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * DESIGN.md "Components > Overlays". Two related but distinct entries:
 *
 * - `{component.dropdown-menu}`: `{colors.canvas}`, 1px `{colors.hairline}`,
 *   `{rounded.lg}`, `{shadow.overlay}`, padding `{spacing.xxs}`. Plain-text
 *   items, 36px tall.
 * - `{component.markers-menu}`: the same panel, anchored to a single-icon
 *   trigger with an optional count badge — the disclosure surface a lead's
 *   markers icon needs (ticket 12's resolution of the "Known Gaps" popover
 *   entry). Items are 40px tall (44px on touch) because each carries an icon
 *   and an optional second line, not just text.
 *
 * This module owns both, because `markers-menu` is the only consumer this
 * ticket has and a second file would just re-declare the same panel chrome.
 */

export interface DropdownMenuItem {
  readonly key: string;
  readonly icon: ReactNode;
  readonly label: string;
  /** A short second line — e.g. the linked card's origin for a duplicate. */
  readonly description?: string;
  readonly onSelect: () => void;
}

export interface DropdownMenuProps {
  /** Rendered inside the icon trigger — a single warning glyph. */
  readonly triggerIcon: ReactNode;
  readonly triggerLabel: string;
  /** More than one marker renders as a count badge, never as separate labels (ADR-0018). */
  readonly badgeCount?: number;
  readonly items: readonly DropdownMenuItem[];
}

export function DropdownMenu({ triggerIcon, triggerLabel, badgeCount, items }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    function handlePointerDown(event: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="relative inline-block" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-label={triggerLabel}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-warning transition-colors duration-150 ease-out hover:bg-surface-inset focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-focus pointer-coarse:h-11 pointer-coarse:w-11"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        {triggerIcon}
        {badgeCount && badgeCount > 1 ? (
          <span
            aria-hidden="true"
            className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-0.5 text-caption font-medium text-on-primary"
          >
            {badgeCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className="absolute right-0 z-20 mt-1 min-w-60 max-w-80 rounded-lg border border-hairline bg-canvas p-xxs shadow-overlay"
          role="menu"
        >
          {items.map((item, index) => (
            <div key={item.key}>
              {index > 0 ? <div className="mx-xs my-xxs h-px bg-hairline-soft" /> : null}
              <button
                className="flex min-h-10 w-full items-center gap-xs rounded-sm px-sm py-xs text-left transition-colors duration-150 ease-out hover:bg-surface-inset focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-focus pointer-coarse:min-h-11"
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                role="menuitem"
                type="button"
              >
                <span aria-hidden="true" className="shrink-0 text-warning">
                  {item.icon}
                </span>
                <span className="flex flex-col">
                  <span className="text-body-sm text-ink">{item.label}</span>
                  {item.description ? (
                    <span className="text-caption text-ink-muted">{item.description}</span>
                  ) : null}
                </span>
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
