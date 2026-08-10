import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes } from "react";

/**
 * DESIGN.md "Components > Data Display > data-table". Background `{colors.canvas}`,
 * 1px `{colors.hairline}` outer border, `{rounded.lg}`, overflow hidden.
 * Header row on `{colors.surface-inset}` with `{typography.label}` in
 * `{colors.ink-secondary}`. Rows separated by 1px `{colors.hairline-soft}`,
 * 48px row height (56px on touch), cells in `{typography.body-sm}`. Numeric
 * columns right-aligned with `tabular-nums`.
 *
 * The below-480px "stacked card per record" transformation
 * (DESIGN.md "Responsive Behavior > Collapsing Strategy") is the consuming
 * screen's job, not this component's: which fields become which labels in a
 * stacked card is domain knowledge `DataTable` does not have.
 */

export interface DataTableProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly caption?: string;
}

export function DataTable({ children, className = "", caption }: DataTableProps) {
  return (
    <div className={`overflow-x-auto rounded-lg border border-hairline bg-canvas ${className}`.trim()}>
      <table className="w-full border-collapse text-body-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        {children}
      </table>
    </div>
  );
}

export interface DataTableHeaderCellProps extends ThHTMLAttributes<HTMLTableCellElement> {
  readonly numeric?: boolean;
}

export function DataTableHeaderCell({
  numeric = false,
  className = "",
  children,
  ...rest
}: DataTableHeaderCellProps) {
  return (
    <th
      className={`whitespace-nowrap bg-surface-inset px-md py-sm text-label text-ink-secondary ${
        numeric ? "text-right" : "text-left"
      } ${className}`.trim()}
      scope="col"
      {...rest}
    >
      {children}
    </th>
  );
}

export interface DataTableRowProps {
  readonly children: ReactNode;
  readonly selected?: boolean;
  readonly className?: string;
}

export function DataTableRow({ children, selected = false, className = "" }: DataTableRowProps) {
  return (
    <tr
      className={`h-12 border-t border-hairline-soft pointer-coarse:h-14 ${
        selected ? "bg-primary-subtle" : "hover:bg-surface-inset"
      } ${className}`.trim()}
    >
      {children}
    </tr>
  );
}

export interface DataTableCellProps extends TdHTMLAttributes<HTMLTableCellElement> {
  readonly numeric?: boolean;
  readonly strong?: boolean;
}

export function DataTableCell({
  numeric = false,
  strong = false,
  className = "",
  children,
  ...rest
}: DataTableCellProps) {
  return (
    <td
      className={`px-md py-sm align-middle text-ink ${strong ? "text-body-strong" : ""} ${
        numeric ? "text-right tabular-nums" : "text-left"
      } ${className}`.trim()}
      {...rest}
    >
      {children}
    </td>
  );
}
