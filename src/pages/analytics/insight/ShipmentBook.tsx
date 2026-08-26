import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, FileText, Search } from '@/design-system/icons';
import { Button, Input } from '@/design-system';
import type { ShipperShipmentRow } from '@/features/shipper-bi';
import { formatCurrencyFull } from '@/features/shipper-bi/format';
import { cn, formatDate } from '@/utils';
import { Block, EmptyNote } from './kit';

const PAGE_SIZE = 8;

/**
 * The book: every container this account has run, searchable.
 *
 * The one thing on the page that is a table on purpose — it is a record to look
 * something up in, not a finding to read. Six columns, because the ten-column
 * version scrolled sideways and printed raw `transporterId` and `routeId` keys
 * in two of them.
 *
 * Rows open the shipment, which is where the per-container Mission Report
 * lives. That link is the whole reason this page does not try to explain any
 * single run: the detail already has a home, and duplicating it here is what
 * made the old Reports tab a second copy of a panel the shipment page owns.
 */
export function ShipmentBook({
  rows,
  onOpen,
}: {
  rows: ShipperShipmentRow[];
  onOpen: (row: ShipperShipmentRow) => void;
}) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const sorted = [...rows].sort((a, b) =>
      (b.arrivalAt ?? b.plannedDeliveryAt).localeCompare(a.arrivalAt ?? a.plannedDeliveryAt),
    );
    if (!term) return sorted;
    return sorted.filter((row) =>
      [row.reference, row.parentReference, row.transporter, row.routeName, row.containerNo]
        .filter(Boolean)
        .some((field) => (field as string).toLowerCase().includes(term)),
    );
  }, [rows, query]);

  // A search that leaves the reader on page 4 of a 2-page result reads as an
  // empty table rather than as a filter.
  useEffect(() => {
    setPage(1);
  }, [query, rows]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * PAGE_SIZE;
  const visible = filtered.slice(start, start + PAGE_SIZE);

  return (
    <Block
      title="Every container, on record"
      answer={`${rows.length} run${rows.length === 1 ? '' : 's'} on this account. Open one to read its full mission report.`}
      icon={<FileText />}
      action={
        <div className="flex items-center gap-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search reference, transporter, lane…"
            leadingIcon={<Search className="size-3.5" />}
            className="h-9 w-full sm:w-64"
          />
          <Button
            variant="outline"
            size="sm"
            leadingIcon={<Download className="size-4" />}
            onClick={() => downloadCsv(filtered)}
          >
            Export
          </Button>
        </div>
      }
    >
      {visible.length === 0 ? (
        <EmptyNote>No containers match that search.</EmptyNote>
      ) : (
        <div className="w-0 min-w-full overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead>
              <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                <th className="py-2.5 pr-4 font-semibold">Reference</th>
                <th className="py-2.5 pr-4 font-semibold">Lane</th>
                <th className="py-2.5 pr-4 font-semibold">Transporter</th>
                <th className="py-2.5 pr-4 font-semibold">Delivered</th>
                <th className="py-2.5 pr-4 font-semibold">Empty back</th>
                <th className="py-2.5 text-right font-semibold">Cost</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const late = row.outcome === 'late';
                const overdue = row.emptyReturnOverdueDays > 0;
                return (
                  <tr
                    key={row.shipmentId}
                    onClick={() => onOpen(row)}
                    className="cursor-pointer border-b border-border-subtle text-[13px] last:border-0 hover:bg-surface-sunken"
                  >
                    <td className="py-3 pr-4">
                      <span className="font-medium text-foreground">{row.reference}</span>
                      {row.containerNo && (
                        <span className="ml-2 type-body-xs text-muted-foreground">
                          {row.containerNo}
                        </span>
                      )}
                    </td>
                    <td className="max-w-[200px] truncate py-3 pr-4 text-muted-foreground">
                      {row.routeName}
                    </td>
                    <td className="max-w-[180px] truncate py-3 pr-4 text-muted-foreground">
                      {row.transporter}
                    </td>
                    <td className={cn('py-3 pr-4 tabular-nums', late ? 'text-accent-subtle-foreground' : 'text-muted-foreground')}>
                      {row.arrivalAt ? formatDate(row.arrivalAt, 'date') : row.stageLabel}
                      {late && <span className="ml-1.5 font-semibold">late</span>}
                    </td>
                    <td className={cn('py-3 pr-4 tabular-nums', overdue ? 'text-accent-subtle-foreground' : 'text-muted-foreground')}>
                      {row.returnedAt ? formatDate(row.returnedAt, 'date') : 'still out'}
                      {overdue && (
                        <span className="ml-1.5 font-semibold">+{row.emptyReturnOverdueDays}d</span>
                      )}
                    </td>
                    <td className="py-3 text-right font-medium tabular-nums text-foreground">
                      {formatCurrencyFull(row.cost)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pageCount > 1 && (
        <div className="flex items-center justify-between gap-3 border-t border-border-subtle pt-4">
          <p className="type-body-xs tabular-nums text-muted-foreground">
            {start + 1}–{Math.min(start + PAGE_SIZE, filtered.length)} of {filtered.length}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              aria-label="Previous page"
              disabled={safePage === 1}
              onClick={() => setPage(safePage - 1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="px-2 text-[13px] tabular-nums text-muted-foreground">
              {safePage} / {pageCount}
            </span>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Next page"
              disabled={safePage === pageCount}
              onClick={() => setPage(safePage + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </Block>
  );
}

/** The current search result, not the whole book — export what you can see. */
function downloadCsv(rows: ShipperShipmentRow[]) {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const csv = [
    'Reference,Shipment,Container,Lane,Transporter,Stage,Outcome,Promised,Delivered,Empty returned,Days past free time,Cost DJF',
    ...rows.map((row) =>
      [
        row.reference,
        row.parentReference ?? '',
        row.containerNo ?? '',
        row.routeName,
        row.transporter,
        row.stageLabel,
        row.outcomeLabel ?? '',
        row.plannedDeliveryAt.slice(0, 10),
        row.arrivalAt?.slice(0, 10) ?? '',
        row.returnedAt?.slice(0, 10) ?? '',
        String(row.emptyReturnOverdueDays),
        String(Math.round(row.cost)),
      ]
        .map(escape)
        .join(','),
    ),
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `shipments-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
