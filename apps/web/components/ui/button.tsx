import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * DESIGN.md "Components > Buttons". `button-primary`, `button-secondary`,
 * `button-tertiary` and `button-danger` share one action grammar: `{rounded.md}`
 * (8px), `{typography.button}`, `scale(0.98)` on press, a 2px focus ring in
 * `{colors.primary-focus}` offset 2px. Padding is 8px vertical × 14px
 * horizontal — `py-2 px-3.5` on Tailwind's numeric (token-derived) spacing
 * scale, since 14px has no named `{spacing.*}` step.
 */

const BASE =
  "inline-flex items-center justify-center gap-xs rounded-md text-button transition-[background-color,border-color,transform] duration-150 ease-out active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-focus disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100";

const VARIANTS: Readonly<Record<ButtonVariant, string>> = {
  primary: "bg-primary text-on-primary hover:bg-primary-hover active:bg-primary-pressed",
  secondary:
    "border border-hairline bg-surface-inset text-ink hover:border-hairline-strong",
  tertiary: "bg-transparent text-ink-secondary hover:bg-surface-inset",
  // Destructive confirmation only, and only inside a modal (DESIGN.md).
  danger: "bg-danger text-ink-inverse hover:bg-danger/90"
};

const SIZES: Readonly<Record<ButtonSize, string>> = {
  md: "min-h-10 px-3.5 py-2 pointer-coarse:min-h-11",
  lg: "min-h-11 px-5 py-3 text-body"
};

export type ButtonVariant = "primary" | "secondary" | "tertiary" | "danger";
export type ButtonSize = "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant: ButtonVariant;
  readonly size?: ButtonSize;
}

export function Button({ variant, size = "md", className = "", ...rest }: ButtonProps) {
  const classes = `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`.trim();
  return <button className={classes} type="button" {...rest} />;
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Becomes `aria-label` — this button never carries visible text. */
  readonly label: string;
  readonly children: ReactNode;
}

/**
 * `{component.button-icon}`: 36×36px (40px on touch), transparent, icon in
 * `{colors.ink-muted}`, hover fill `{colors.surface-inset}` and the icon
 * darkens to `{colors.ink}`.
 */
export function IconButton({ label, children, className = "", ...rest }: IconButtonProps) {
  return (
    <button
      aria-label={label}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-muted transition-colors duration-150 ease-out hover:bg-surface-inset hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-focus pointer-coarse:h-11 pointer-coarse:w-11 disabled:cursor-not-allowed disabled:opacity-50 ${className}`.trim()}
      type="button"
      {...rest}
    >
      {children}
    </button>
  );
}
