import type { ReactNode } from "react";

/**
 * DESIGN.md "Components > Cards & Containers > card". The universal
 * container: `{colors.canvas}` fill, 1px `{colors.hairline}` border,
 * `{rounded.lg}` (12px), padding `{spacing.lg}` (24px). No shadow.
 */
export interface CardProps {
  readonly className?: string;
  readonly children: ReactNode;
}

export function Card({ className = "", children }: CardProps) {
  return (
    <div className={`rounded-lg border border-hairline bg-canvas p-lg ${className}`.trim()}>
      {children}
    </div>
  );
}
