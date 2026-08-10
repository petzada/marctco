"use client";

import { useEffect, type ReactNode } from "react";
import { IconButton } from "./button";

/**
 * DESIGN.md "Components > Overlays > modal". `{colors.canvas}` fill,
 * `{rounded.xl}`, `{shadow.overlay}`, padding `{spacing.xl}` (32px),
 * `max-width` 560px (`{max-width-dialog}`, ADR-0002... see globals.css
 * "Content widths"), over `{colors.overlay-scrim}`. Title in `{typography.title}`,
 * footer actions right-aligned.
 */
export interface ModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
}

export function Modal({ open, onClose, title, children, footer }: ModalProps) {
  useEffect(() => {
    if (!open) {
      return;
    }
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay-scrim p-md"
      onClick={onClose}
    >
      <div
        aria-labelledby="modal-title"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-dialog overflow-y-auto rounded-xl bg-canvas p-xl shadow-overlay"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="flex items-start justify-between gap-md">
          <h2 className="text-title text-ink" id="modal-title">
            {title}
          </h2>
          <IconButton className="-mr-1.5 -mt-1.5" label="Fechar" onClick={onClose}>
            <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
              <path d="M5 5l14 14M19 5 5 19" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </IconButton>
        </div>
        <div className="mt-md">{children}</div>
        {footer ? <div className="mt-lg flex justify-end gap-sm">{footer}</div> : null}
      </div>
    </div>
  );
}
