import type { InputHTMLAttributes, LabelHTMLAttributes, ReactNode } from "react";

/**
 * DESIGN.md "Components > Inputs & Forms". `text-input`: `{colors.canvas}`
 * fill, `{typography.body}`, 1px `{colors.hairline}` border, `{rounded.md}`,
 * padding 8px × 12px, min-height 40px (44px on touch). `text-input-error`
 * swaps only the border and adds the caption-sized helper — the label stays
 * `{colors.ink-secondary}`.
 */

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly invalid?: boolean;
}

export function TextInput({ invalid = false, className = "", ...rest }: TextInputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={`min-h-10 w-full rounded-md border bg-canvas px-sm py-xs text-body text-ink placeholder:text-ink-muted transition-colors duration-150 ease-out hover:border-hairline-strong focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-focus disabled:bg-surface-inset disabled:text-ink-disabled pointer-coarse:min-h-11 ${
        invalid ? "border-danger" : "border-hairline"
      } ${className}`.trim()}
      {...rest}
    />
  );
}

export interface FieldLabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  readonly htmlFor: string;
  readonly required?: boolean;
  readonly children: ReactNode;
}

/** `{component.field-label}`: `{typography.label}` in `{colors.ink-secondary}`, 6px above its input. */
export function FieldLabel({ htmlFor, required = false, children, className = "", ...rest }: FieldLabelProps) {
  return (
    <label className={`mb-1.5 block text-label text-ink-secondary ${className}`.trim()} htmlFor={htmlFor} {...rest}>
      {children}
      {required ? (
        <span aria-hidden="true" className="text-danger">
          {" "}
          *
        </span>
      ) : null}
    </label>
  );
}

export interface FieldErrorProps {
  readonly children: ReactNode;
}

export function FieldError({ children }: FieldErrorProps) {
  return <p className="mt-1.5 text-caption text-danger-ink">{children}</p>;
}
