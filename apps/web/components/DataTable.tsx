"use client";

import { cx, EmptyState, LoadingRows } from "@/components/ui";

/* One table for the whole app. On a phone a 9-column payroll table can't fit,
 * and squeezing it pushed the page sideways by 400px. So:
 *   - from `sm` up it's a real <table> that scrolls inside its own box, with
 *     the first column pinned so you never lose which row you're on;
 *   - below `sm` (mode "auto") each row becomes a labelled card, title first.
 * Rows that open something are real buttons for keyboard and screen readers. */

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  align?: "left" | "right" | "center";
  /** Shown as the card's title on phones (use on one column, usually the name). */
  primary?: boolean;
  /** Left out of the phone card (e.g. a column the title already says). */
  hideOnCard?: boolean;
  className?: string;
};

type Props<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Buttons for a row; rendered as the last column and at the foot of each card. */
  actions?: (row: T) => React.ReactNode;
  onRowClick?: (row: T) => void;
  rowLabel?: (row: T) => string; // accessible name for clickable rows, e.g. "Open Ahmed Raza"
  loading?: boolean;
  empty?: React.ReactNode;
  /** "auto": cards below sm, table above. "scroll": always a table (wide grids like attendance). */
  mode?: "auto" | "scroll";
  caption?: string;
  /** Visible header for the actions column (e.g. "Stage"); screen-reader-only "Actions" otherwise. */
  actionsHeader?: string;
  className?: string;
};

const alignCls = { left: "text-left", right: "text-right", center: "text-center" };

export function DataTable<T>({ columns, rows, rowKey, actions, onRowClick, rowLabel, loading, empty, mode = "auto", caption, actionsHeader, className }: Props<T>) {
  if (loading) return <LoadingRows />;
  if (rows.length === 0) return <>{empty ?? <EmptyState title="Nothing here yet" />}</>;

  const primary = columns.find((c) => c.primary) ?? columns[0];
  const rest = columns.filter((c) => c !== primary && !c.hideOnCard);

  return (
    <div className={cx("min-w-0", className)}>
      {mode === "auto" && (
        <ul className="relative space-y-2 sm:hidden">
          {rows.map((r) => {
            const body = (
              <>
                <div className="font-medium">{primary.cell(r)}</div>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  {rest.map((c) => (
                    <div key={c.key} className="min-w-0">
                      <dt className="text-xs text-fg-subtle">{c.header}</dt>
                      <dd className="truncate">{c.cell(r)}</dd>
                    </div>
                  ))}
                </dl>
              </>
            );
            const acts = actions?.(r);
            return (
              <li key={rowKey(r)} className="rounded-xl border border-line bg-surface p-4">
                {onRowClick ? (
                  <button type="button" onClick={() => onRowClick(r)} aria-label={rowLabel?.(r)} className="block w-full text-left">
                    {body}
                  </button>
                ) : body}
                {acts != null && acts !== false && <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">{acts}</div>}
              </li>
            );
          })}
        </ul>
      )}

      <div className={cx("relative overflow-x-auto rounded-xl border border-line bg-surface", mode === "auto" && "hidden sm:block")}>
        <table className="w-full min-w-max border-collapse text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead className="bg-elevated/60 text-xs text-fg-muted">
            <tr>
              {columns.map((c, i) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cx(
                    "whitespace-nowrap px-4 py-2.5 font-medium",
                    alignCls[c.align ?? "left"],
                    i === 0 && "sticky left-0 z-[1] bg-elevated",
                    c.className,
                  )}
                >
                  {c.header}
                </th>
              ))}
              {actions && (
                <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-right font-medium">
                  {actionsHeader ?? <span className="sr-only">Actions</span>}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={rowKey(r)}
                className={cx("border-t border-line", onRowClick && "cursor-pointer hover:bg-elevated/50")}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
              >
                {columns.map((c, i) => (
                  <td
                    key={c.key}
                    className={cx(
                      "px-4 py-2.5 align-middle",
                      alignCls[c.align ?? "left"],
                      c.align === "right" && "tabular-nums",
                      i === 0 && "sticky left-0 z-[1] bg-surface",
                      c.className,
                    )}
                  >
                    {i === 0 && onRowClick ? (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onRowClick(r); }}
                        aria-label={rowLabel?.(r)}
                        className="text-left font-medium hover:underline"
                      >
                        {c.cell(r)}
                      </button>
                    ) : c.cell(r)}
                  </td>
                ))}
                {actions && (
                  <td className="px-4 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1.5 whitespace-nowrap">{actions(r)}</div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
