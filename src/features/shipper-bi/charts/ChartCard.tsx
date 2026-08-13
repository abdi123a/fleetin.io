import { useId, useState, type ReactNode } from 'react';
import { AlertTriangle, Table2, BarChart3 } from '@/design-system/icons';
import { Card, Skeleton } from '@/design-system';
import { cn } from '@/utils';
import { CardHeading } from './CardChrome';

/**
 * The frame every chart in the control tower sits in.
 *
 * It exists to make three things automatic rather than per-chart decisions:
 *
 *  - **A table view.** Every chart has a WCAG-clean twin, so no value is
 *    reachable only by hovering a coloured mark. This is the relief channel the
 *    palette's contrast allowances depend on, not a nice-to-have.
 *  - **Honest states.** Loading, empty and error look deliberate instead of
 *    rendering an axis with nothing on it, which reads as "zero" rather than
 *    "no data".
 *  - **No skeleton flash on refetch.** Once a chart has rendered, a filter
 *    change dims it rather than collapsing it back to a skeleton — the layout
 *    holds still while the numbers catch up.
 */

export interface ChartTableColumn<T> {
  key: string;
  header: string;
  /** Right-aligned by default for numbers; pass `align` to override. */
  align?: 'left' | 'right';
  render: (row: T) => ReactNode;
}

export interface ChartCardProps<T> {
  title: string;
  /** One clause of context. Never a restatement of the title. */
  subtitle?: string;
  icon?: ReactNode;
  /** Rendered top-right — a series toggle, a unit switch. Never a filter. */
  actions?: ReactNode;
  children: ReactNode;

  isLoading?: boolean;
  /** True while a refetch is in flight over an already-rendered chart. */
  isFetching?: boolean;
  error?: Error | null;
  isEmpty?: boolean;
  emptyMessage?: string;

  /** The chart's data as rows. Omit only for charts that are already a table. */
  tableRows?: T[];
  tableColumns?: ChartTableColumn<T>[];

  className?: string;
  /**
   * What the chart inside actually occupies, in px.
   *
   * Used to size the loading skeleton and the empty/error states so the card
   * does not change height when data arrives. It deliberately does *not* pad
   * the rendered chart: a plot stretched past what it needs reads as a chart
   * with a gap in its data, so the chart states its own height and this
   * mirrors it.
   */
  bodyHeight?: number;
}

export function ChartCard<T>({
  title,
  subtitle,
  icon,
  actions,
  children,
  isLoading = false,
  isFetching = false,
  error = null,
  isEmpty = false,
  emptyMessage = 'No shipments match the current filters.',
  tableRows,
  tableColumns,
  className,
  bodyHeight,
}: ChartCardProps<T>) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const titleId = useId();
  const table = tableRows && tableColumns ? { rows: tableRows, columns: tableColumns } : null;

  return (
    <Card
      variant="default"
      padding="lg"
      className={cn('gap-5', className)}
      aria-labelledby={titleId}
      aria-busy={isLoading || isFetching}
    >
      <CardHeading
        titleId={titleId}
        title={title}
        subtitle={subtitle}
        icon={icon}
        actions={
          <>
            {actions}
            {table ? (
              <button
                type="button"
                onClick={() => setView(view === 'chart' ? 'table' : 'chart')}
                className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-sunken hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label={
                  view === 'chart' ? `Show ${title} as a table` : `Show ${title} as a chart`
                }
              >
                {view === 'chart' ? <Table2 className="size-4" /> : <BarChart3 className="size-4" />}
              </button>
            ) : null}
          </>
        }
      />

      <div
        className={cn(
          'flex flex-col justify-center transition-opacity duration-200',
          // Dim rather than unmount: a filter change must not bounce the layout.
          isFetching && !isLoading && 'opacity-50',
        )}
      >
        {isLoading ? (
          <ChartSkeleton height={bodyHeight ?? 200} />
        ) : error ? (
          <ChartState height={bodyHeight}>
            <ChartError message={error.message} />
          </ChartState>
        ) : isEmpty ? (
          <ChartState height={bodyHeight}>
            <ChartEmpty message={emptyMessage} />
          </ChartState>
        ) : view === 'table' && table ? (
          <ChartTable rows={table.rows} columns={table.columns} caption={title} />
        ) : (
          children
        )}
      </div>
    </Card>
  );
}

/**
 * Holds the chart's footprint while there is no chart.
 *
 * Empty and error states are short; without this the card would shrink when a
 * filter empties it and jump back when it refills, which moves everything below
 * it on the page.
 */
function ChartState({ height, children }: { height?: number; children: ReactNode }) {
  return (
    <div className="flex items-center justify-center" style={height ? { height } : undefined}>
      {children}
    </div>
  );
}

function ChartSkeleton({ height }: { height: number }) {
  return (
    <div className="flex flex-col justify-end gap-2" style={{ height }}>
      <div className="flex items-end gap-2" style={{ height: height - 24 }}>
        {[0.45, 0.7, 0.35, 0.85, 0.55, 0.75, 0.4].map((fraction) => (
          <Skeleton
            key={fraction}
            className="flex-1 rounded-t-md"
            style={{ height: `${fraction * 100}%` }}
          />
        ))}
      </div>
      <Skeleton shape="text" className="h-3 w-full" />
    </div>
  );
}

function ChartError({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <AlertTriangle className="size-5 text-destructive" />
      <p className="text-sm font-medium text-foreground">Could not load this chart</p>
      <p className="max-w-xs text-xs text-muted-foreground">{message}</p>
    </div>
  );
}

function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 py-10 text-center">
      <p className="text-sm font-medium text-foreground">Nothing to show</p>
      <p className="max-w-xs text-xs text-muted-foreground">{message}</p>
    </div>
  );
}

function ChartTable<T>({
  rows,
  columns,
  caption,
}: {
  rows: T[];
  columns: ChartTableColumn<T>[];
  caption: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  'py-2 pr-3 font-semibold text-muted-foreground',
                  column.align === 'left' ? 'text-left' : 'text-right',
                  column.align !== 'left' && 'pl-3 pr-0',
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            // Chart rows are positional slices of a series with no stable id of
            // their own; the index *is* the identity here.
            // oxlint-disable-next-line no-array-index-key
            <tr key={index} className="border-b border-border-subtle last:border-0">
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    'py-2 pr-3 text-foreground',
                    column.align === 'left'
                      ? 'text-left'
                      : // Columns of numbers align on the digit, so they get
                        // tabular figures — unlike the large standalone values
                        // on the KPI cards, which use proportional figures.
                        'pl-3 pr-0 text-right tabular-nums',
                  )}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
