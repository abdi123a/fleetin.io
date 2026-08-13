import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, FileText, Search } from '@/design-system/icons';
import { Button, Card, Input } from '@/design-system';
import { CardHeading } from '@/features/shipper-bi/charts';
import type { ShipmentFact } from '@/lib/bi/derive';
import { formatCompact, formatCurrencyFull, formatVariance } from '@/features/shipper-bi/format';
import { STAGE_LABELS } from '@/features/shipper-bi/contracts';
import { cn, formatDate } from '@/utils';

const PAGE_SIZE = 10;

export interface ReportingSectionProps {
  facts: ShipmentFact[];
  shipperId: string;
}

/**
 * Reporting — searchable history and export.
 *
 * The full shipment record, filtered by the same bar as everything above, and
 * a one-click export of the current slice. Paginated so a long history does not
 * bury the rest of the page.
 */
export function ReportingSection({ facts, shipperId }: ReportingSectionProps) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const filteredRows = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return facts;
    return facts.filter(
      (row) =>
        row.reference.toLowerCase().includes(term) ||
        row.transporterId.toLowerCase().includes(term) ||
        row.routeId.toLowerCase().includes(term),
    );
  }, [facts, query]);

  // A search that leaves the reader on page 4 of a 2-page result reads as an
  // empty table rather than as a filter.
  useEffect(() => {
    setPage(1);
  }, [query, facts]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * PAGE_SIZE;
  const visible = filteredRows.slice(start, start + PAGE_SIZE);
  const rangeEnd = Math.min(start + PAGE_SIZE, filteredRows.length);

  const pageNumbers = useMemo(
    () => buildPageNumbers(safePage, pageCount),
    [safePage, pageCount],
  );

  return (
    <div className="flex flex-col gap-5">
      <Card variant="default" padding="lg" className="gap-5">
        <CardHeading
          title="Shipment history"
          subtitle="Searchable historical shipment records"
          icon={<FileText className="size-4" />}
          actions={
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search reference, transporter, route…"
                  className="h-8 w-64 pl-8 text-xs"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                leadingIcon={<Download className="size-4" />}
                onClick={() => downloadCsv(filteredRows, shipperId)}
              >
                Export CSV
              </Button>
            </div>
          }
        />

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-4">Reference</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Cargo</th>
                <th className="py-2 pr-4">Transporter</th>
                <th className="py-2 pr-4">Route</th>
                <th className="py-2 pr-4">Promised</th>
                <th className="py-2 pr-4">Arrival</th>
                <th className="py-2 pr-4">Variance</th>
                <th className="py-2 pr-4">Container</th>
                <th className="py-2">Cost</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-sm text-muted-foreground">
                    No shipments match the current search.
                  </td>
                </tr>
              ) : (
                visible.map((row) => (
                  <tr key={row.shipmentId} className="border-b border-border/60 last:border-0">
                    <td className="py-2.5 pr-4 font-medium text-foreground">{row.reference}</td>
                    <td className="py-2.5 pr-4 text-muted-foreground">{STAGE_LABELS[row.currentStage]}</td>
                    <td className="py-2.5 pr-4 text-muted-foreground">{row.cargoType}</td>
                    <td className="py-2.5 pr-4 text-muted-foreground">{row.transporterId}</td>
                    <td className="py-2.5 pr-4 text-muted-foreground">{row.routeId}</td>
                    {/* A raw ISO instant ("2026-07-31T07:26:26+03:00") is not
                        a date a reader compares against the next row. */}
                    <td className="py-2.5 pr-4 text-muted-foreground">
                      {formatDate(row.plannedDeliveryAt, 'date')}
                    </td>
                    <td className="py-2.5 pr-4 text-muted-foreground">
                      {row.deliveredAt ? formatDate(row.deliveredAt, 'date') : '—'}
                    </td>
                    {/* `formatVariance`, not the raw field: the derived value
                        is an unrounded float, so this column was rendering
                        "+1640.5333333333333m" where "1d 3h late" was meant. */}
                    <td className="py-2.5 pr-4 text-muted-foreground">
                      {row.deliveryVarianceMinutes === undefined
                        ? '—'
                        : formatVariance(row.deliveryVarianceMinutes)}
                    </td>
                    <td className="py-2.5 pr-4 text-muted-foreground">{row.containerId ?? '—'}</td>
                    <td className="py-2.5 text-muted-foreground">
                      {formatCurrencyFull(row.costTotal)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="tabular-nums">
              {filteredRows.length === 0
                ? '0 of 0'
                : `${start + 1}–${rangeEnd} of ${formatCompact(filteredRows.length)}`}
            </span>
            <span className="hidden sm:inline">·</span>
            <span className="hidden sm:inline">
              Total cost{' '}
              {formatCurrencyFull(filteredRows.reduce((sum, row) => sum + row.costTotal, 0))}
            </span>
          </div>

          {filteredRows.length > PAGE_SIZE && (
            <div className="flex items-center gap-1">
              <PageButton
                label="Previous page"
                disabled={safePage <= 1}
                onClick={() => setPage(safePage - 1)}
              >
                <ChevronLeft className="size-3.5" />
              </PageButton>

              {pageNumbers.map((entry) =>
                entry.kind === 'gap' ? (
                  <span
                    key={`gap-${entry.before}`}
                    className="flex size-8 items-center justify-center text-xs text-muted-foreground"
                    aria-hidden
                  >
                    …
                  </span>
                ) : (
                  <PageButton
                    key={entry.page}
                    label={`Page ${entry.page}`}
                    active={entry.page === safePage}
                    onClick={() => setPage(entry.page)}
                  >
                    {entry.page}
                  </PageButton>
                ),
              )}

              <PageButton
                label="Next page"
                disabled={safePage >= pageCount}
                onClick={() => setPage(safePage + 1)}
              >
                <ChevronRight className="size-3.5" />
              </PageButton>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function PageButton({
  label,
  children,
  disabled,
  active,
  onClick,
}: {
  label: string;
  children: React.ReactNode;
  disabled?: boolean;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex size-8 items-center justify-center rounded-md text-xs font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        'disabled:pointer-events-none disabled:opacity-40',
        active
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

/**
 * Compact page list: always show first, last, current and neighbours.
 * Long runs collapse to an ellipsis so a 40-page history does not become a
 * strip of forty buttons.
 */
type PageEntry = { kind: 'page'; page: number } | { kind: 'gap'; before: number };

function buildPageNumbers(current: number, total: number): PageEntry[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => ({
      kind: 'page' as const,
      page: index + 1,
    }));
  }

  const pages = new Set<number>([1, total, current, current - 1, current + 1]);
  if (current <= 3) {
    pages.add(2);
    pages.add(3);
    pages.add(4);
  }
  if (current >= total - 2) {
    pages.add(total - 1);
    pages.add(total - 2);
    pages.add(total - 3);
  }

  const sorted = [...pages].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
  const result: PageEntry[] = [];

  let previous: number | undefined;
  for (const page of sorted) {
    // The gap is identified by the page it precedes, so the key stays stable
    // when the window of shown pages shifts.
    if (previous !== undefined && page - previous > 1) {
      result.push({ kind: 'gap', before: page });
    }
    result.push({ kind: 'page', page });
    previous = page;
  }

  return result;
}

const CSV_COLUMNS: { header: string; value: (row: ShipmentFact) => string | number }[] = [
  { header: 'Reference', value: (row) => row.reference },
  { header: 'Status', value: (row) => (row.isOpen ? 'open' : 'closed') },
  { header: 'Stage', value: (row) => STAGE_LABELS[row.currentStage] },
  { header: 'Cargo type', value: (row) => row.cargoType },
  { header: 'Transporter', value: (row) => row.transporterId },
  { header: 'Route', value: (row) => row.routeId },
  { header: 'Promised delivery', value: (row) => row.plannedDeliveryAt },
  { header: 'Arrival', value: (row) => row.deliveredAt ?? '' },
  {
    header: 'Variance (minutes)',
    value: (row) =>
      row.deliveryVarianceMinutes === undefined
        ? ''
        : Math.round(row.deliveryVarianceMinutes),
  },
  { header: 'Container', value: (row) => row.containerId ?? '' },
  {
    header: 'Free time remaining (hours)',
    value: (row) =>
      row.freeTimeExpiresAt === undefined
        ? ''
        : Math.max(
            0,
            Math.round((new Date(row.freeTimeExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60)),
          ),
  },
  { header: 'Returned', value: (row) => row.returnedAt ?? '' },
  { header: 'Cost (DJF)', value: (row) => Math.round(row.costTotal) },
  { header: 'Accessorial (DJF)', value: (row) => Math.round(row.accessorialCost) },
  { header: 'Risk score', value: (row) => row.riskScore },
];

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadCsv(rows: ShipmentFact[], shipperId: string) {
  const lines = [
    CSV_COLUMNS.map((column) => csvCell(column.header)).join(','),
    ...rows.map((row) => CSV_COLUMNS.map((column) => csvCell(column.value(row))).join(',')),
  ];

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `fleetin-shipments-${shipperId}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
