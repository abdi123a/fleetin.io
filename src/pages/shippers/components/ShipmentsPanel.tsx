import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowRight, Container } from '@/design-system/icons';
import { Badge, Button, ButtonGroup, EnterpriseDataTable } from '@/design-system';
import {
  formatCompact,
  formatDuration,
  formatVariance,
  STAGE_ORDER,
  type ShipmentFilterKey,
  type ShipperShipmentRow,
} from '@/features/shipper-bi';
import { BI_CURRENCY } from '@/lib/bi/config';
import { formatDate } from '@/utils';
import { cn } from '@/utils';

/**
 * Every load this shipper has moved, as a table.
 *
 * It was four cards. Cards are for browsing a handful of things you will read
 * in full; this is a list you compare down a column — which of these is latest,
 * which container is closest to expiry, which route costs the most. The card
 * layout made every one of those questions a scroll, and it did not survive the
 * jump from four rows to two hundred and sixty.
 *
 * The columns are the ones an operator argues with a transporter about:
 * reference, corridor, where it is now, promised against forecast, the box, and
 * the bill. Sorting, search, density, column visibility and pagination all come
 * from `EnterpriseDataTable` — none of it is re-implemented here.
 */

export interface ShipmentsPanelProps {
  rows: ShipperShipmentRow[];
  initialFilter?: ShipmentFilterKey;
  onOpenShipment: (row: ShipperShipmentRow) => void;
}

/**
 * Three lifecycle buckets, named the way the domain defines them.
 *
 * "Delivered" is not the end of a job here — the container is still out and
 * still accruing, which is why it is a bucket of its own rather than part of a
 * closed pile. These labels and their counts are the same partition the health
 * strip above splits `openShipments` by.
 */
const STATUS_FILTERS: { key: ShipmentFilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'In progress' },
  { key: 'delivered', label: 'Awaiting return' },
  { key: 'overdue', label: 'Overdue returns' },
  { key: 'dueSoon', label: 'Due within 48h' },
  { key: 'closed', label: 'Closed' },
];

export function ShipmentsPanel({ rows, initialFilter, onOpenShipment }: ShipmentsPanelProps) {
  const [status, setStatus] = useState<ShipmentFilterKey>(initialFilter ?? 'open');

  useEffect(() => {
    if (initialFilter) {
      setStatus(initialFilter);
    }
  }, [initialFilter]);

  const isOverdue = (row: ShipperShipmentRow) =>
    Boolean(
      row.containerNo &&
        !row.returnedAt &&
        row.freeTimeHoursRemaining !== undefined &&
        row.freeTimeHoursRemaining <= 0,
    );

  const isDueSoon = (row: ShipperShipmentRow) =>
    Boolean(
      row.containerNo &&
        !row.returnedAt &&
        row.freeTimeHoursRemaining !== undefined &&
        row.freeTimeHoursRemaining > 0 &&
        row.freeTimeHoursRemaining <= 48,
    );

  const counts: Record<ShipmentFilterKey, number> = useMemo(
    () => ({
      all: rows.length,
      open: rows.filter((row) => row.status === 'open').length,
      delivered: rows.filter((row) => row.status === 'delivered').length,
      overdue: rows.filter(isOverdue).length,
      dueSoon: rows.filter(isDueSoon).length,
      closed: rows.filter((row) => row.status === 'closed').length,
    }),
    [rows],
  );

  const visible = useMemo(() => {
    if (status === 'all') return rows;
    if (status === 'overdue') return rows.filter(isOverdue);
    if (status === 'dueSoon') return rows.filter(isDueSoon);
    return rows.filter((row) => row.status === status);
  }, [rows, status]);

  const columns = useMemo<ColumnDef<ShipperShipmentRow>[]>(
    () => [
      {
        accessorKey: 'reference',
        header: 'Reference',
        meta: { label: 'Reference', width: 160, cellClassName: 'w-44' },
        /**
         * `whitespace-nowrap` goes on each `<p>`, not on a wrapper.
         * `base.css` sets `p { text-wrap: pretty }`, and because `text-wrap` is
         * a shorthand it resets wrap-mode on every paragraph — an inherited
         * nowrap from an ancestor never survives it.
         */
        cell: ({ row }) => (
          <div>
            <p className="type-mono font-medium whitespace-nowrap text-foreground">
              {row.original.reference}
            </p>
            <p className="type-caption whitespace-nowrap text-muted-foreground">
              {row.original.cargoType}
            </p>
          </div>
        ),
      },
      {
        id: 'route',
        accessorFn: (row) => `${row.origin} ${row.destination} ${row.transporter}`,
        header: 'Corridor',
        meta: { label: 'Corridor' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 type-body-sm whitespace-nowrap text-foreground">
              <span className="truncate">{row.original.origin}</span>
              <ArrowRight className="size-3 shrink-0 text-muted-foreground" aria-hidden />
              <span className="truncate">{row.original.destination}</span>
            </p>
            <p className="truncate type-caption whitespace-nowrap text-muted-foreground">
              {row.original.transporter}
            </p>
          </div>
        ),
      },
      {
        accessorKey: 'stageLabel',
        header: 'Stage',
        meta: { label: 'Stage', width: 130 },
        cell: ({ row }) => <StageBadge row={row.original} />,
      },
      {
        accessorKey: 'plannedDeliveryAt',
        header: 'Promised',
        meta: { label: 'Promised', width: 120 },
        cell: ({ row }) => (
          <span className="type-body-sm whitespace-nowrap tabular-nums text-foreground">
            {formatDate(row.original.plannedDeliveryAt)}
          </span>
        ),
      },
      {
        id: 'variance',
        accessorFn: (row) => row.varianceMinutes ?? 0,
        header: 'Forecast / actual',
        meta: { label: 'Forecast / actual', width: 160 },
        cell: ({ row }) => <VarianceCell row={row.original} />,
      },
      {
        id: 'container',
        accessorFn: (row) => row.freeTimeHoursRemaining ?? Number.POSITIVE_INFINITY,
        header: 'Container',
        meta: { label: 'Container', width: 150 },
        cell: ({ row }) => <ContainerCell row={row.original} />,
      },
      {
        accessorKey: 'cost',
        header: `Cost (${BI_CURRENCY})`,
        meta: { label: 'Cost', align: 'right', width: 130 },
        cell: ({ row }) => (
          <div className="whitespace-nowrap text-right">
            <p className="type-body-sm whitespace-nowrap tabular-nums text-foreground">
              {formatCompact(row.original.cost)}
            </p>
            {row.original.accessorialCost > 0 && (
              <p className="type-caption whitespace-nowrap tabular-nums text-muted-foreground">
                +{formatCompact(row.original.accessorialCost)} extra
              </p>
            )}
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      {/* Lifecycle is the filter people reach for first, so it stays a visible
          control rather than a value inside a filter panel. */}
      <ButtonGroup aria-label="Filter shipments by lifecycle" role="toolbar">
        {STATUS_FILTERS.map((filter) => (
          <Button
            key={filter.key}
            size="sm"
            variant={status === filter.key ? 'primary' : 'outline'}
            aria-pressed={status === filter.key}
            onClick={() => setStatus(filter.key)}
          >
            {filter.label}
            <span className="ml-1.5 tabular-nums opacity-70">{counts[filter.key as keyof typeof counts]}</span>
          </Button>
        ))}
      </ButtonGroup>

      <EnterpriseDataTable
        data={visible}
        columns={columns}
        getRowId={(row) => row.shipmentId}
        density="compact"
        stickyHeader
        maxBodyHeight="40rem"
        /* Seven columns do not survive a phone, even with a scroll bar under
           them. Below `md` the framework stacks each row as a card from these
           same column definitions — no second set of columns to keep in step. */
        responsive
        searchPlaceholder="Search reference, corridor or transporter…"
        onRowClick={onOpenShipment}
        caption={`Shipments for this shipper — ${STATUS_FILTERS.find((f) => f.key === status)?.label.toLowerCase()}`}
        emptyState={{
          title: 'No shipments on this account yet',
          description: 'Bookings appear here as soon as the first one is registered.',
        }}
        noResultsState={{
          title: 'No shipments match',
          description: 'Clear the search term or pick another lifecycle filter.',
        }}
      />
    </div>
  );
}

/**
 * Stage colour follows lifecycle position, not a per-stage lookup.
 *
 * Eleven stages would need eleven decisions and would drift the first time one
 * is added; three bands — booked, moving, done — is what a reader actually
 * distinguishes at a glance in a column of two hundred rows.
 */
function StageBadge({ row }: { row: ShipperShipmentRow }) {
  const position = STAGE_ORDER[row.stage];
  const intent =
    position >= STAGE_ORDER.delivered
      ? 'success'
      : position >= STAGE_ORDER.picked_up
        ? 'primary'
        : 'default';

  return (
    <Badge intent={intent} size="sm">
      {row.stageLabel}
    </Badge>
  );
}

/**
 * One column for "will it miss" and "did it miss".
 *
 * They are the same question asked before and after the fact, and splitting
 * them into two columns leaves each half empty for half the table.
 */
function VarianceCell({ row }: { row: ShipperShipmentRow }) {
  if (row.varianceMinutes === undefined) {
    return <span className="type-body-sm text-muted-foreground">Not forecast</span>;
  }

  const late = row.varianceMinutes > 0;
  const settled = row.status !== 'open';

  return (
    <div>
      <p
        className={cn(
          'type-body-sm whitespace-nowrap tabular-nums',
          late ? 'text-destructive-subtle-foreground' : 'text-foreground',
        )}
      >
        {formatVariance(row.varianceMinutes)}
      </p>
      <p className="type-caption whitespace-nowrap text-muted-foreground">
        {settled ? 'Delivered' : 'ETA'} {formatDate(row.arrivalAt)}
      </p>
    </div>
  );
}

/**
 * The box, and how long is left on it.
 *
 * Free time is the clock that costs money, so it is reported as headroom rather
 * than as an expiry date — "18h left" is actionable in a way that a date two
 * columns from today's is not.
 */
function ContainerCell({ row }: { row: ShipperShipmentRow }) {
  const isBulky = Boolean(
    row.cargoType?.toLowerCase().includes('bulky') ||
    (row.cargoType?.toLowerCase().includes('bulk') && !row.containerNo)
  );

  if (!row.containerNo) {
    if (isBulky) {
      return (
        <div className="min-w-0 whitespace-nowrap">
          <span className="type-caption text-info-subtle-foreground bg-info-subtle px-2 py-0.5 rounded-md inline-block">
            Bulky Goods (Direct)
          </span>
        </div>
      );
    }
    return <span className="type-body-sm text-muted-foreground">—</span>;
  }

  const headroom = row.freeTimeHoursRemaining;
  const returned = Boolean(row.returnedAt);

  return (
    <div className="min-w-0 whitespace-nowrap">
      <p className="flex items-center gap-1.5 type-mono whitespace-nowrap text-foreground">
        <Container className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="truncate">{row.containerNo}</span>
      </p>
      {returned ? (
        <p className="type-caption whitespace-nowrap text-muted-foreground">Returned</p>
      ) : headroom === undefined ? (
        <p className="type-caption whitespace-nowrap text-muted-foreground">{row.containerType}</p>
      ) : headroom <= 0 ? (
        <p className="type-caption font-medium whitespace-nowrap text-destructive-subtle-foreground">
          {formatDuration(-headroom * 60)} overdue
        </p>
      ) : headroom <= 48 ? (
        <p className="type-caption font-medium whitespace-nowrap text-warning-subtle-foreground">
          {formatDuration(headroom * 60)} left
        </p>
      ) : (
        <p className="type-caption whitespace-nowrap text-muted-foreground">
          {formatDuration(headroom * 60)} left
        </p>
      )}
    </div>
  );
}
