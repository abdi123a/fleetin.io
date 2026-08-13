import type { ReactNode } from 'react';

/**
 * The tooltip every chart in the section uses.
 *
 * Shared so the hover layer looks identical across seven sections, and so no
 * chart quietly ships without one — an HTML chart *is* interactive, and a value
 * only reachable by squinting at a bar height is a value the reader guesses.
 *
 * The tooltip enhances; it never gates. Every value it shows is also in the
 * card's table view, so nothing here is the sole route to a number.
 */

export interface TooltipRow {
  key: string;
  label: string;
  value: ReactNode;
  color?: string;
}

export interface ChartTooltipProps {
  title?: string;
  rows: TooltipRow[];
  footer?: ReactNode;
}

export function ChartTooltip({ title, rows, footer }: ChartTooltipProps) {
  if (rows.length === 0) return null;

  return (
    <div className="pointer-events-none min-w-40 rounded-md border border-border bg-surface-raised p-2.5 shadow-md">
      {title ? (
        <p className="mb-1.5 text-[11px] font-semibold text-foreground">{title}</p>
      ) : null}
      <ul className="flex flex-col gap-1">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center gap-2 text-[11px]">
            {row.color ? (
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: row.color }}
                aria-hidden
              />
            ) : null}
            <span className="flex-1 text-muted-foreground">{row.label}</span>
            <span className="font-semibold tabular-nums text-foreground">{row.value}</span>
          </li>
        ))}
      </ul>
      {footer ? (
        <p className="mt-1.5 border-t border-border-subtle pt-1.5 text-[10px] text-muted-foreground">
          {footer}
        </p>
      ) : null}
    </div>
  );
}
