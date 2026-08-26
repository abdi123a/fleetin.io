import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ClipboardList, X } from '@/design-system/icons';
import { Badge, Card, CompanyAvatar, IconChip } from '@/design-system';
import { formatCurrencyFull, formatVariance } from '@/features/shipper-bi/format';
import type { StageKey } from '@/features/shipper-bi/contracts';
import type { ShipperShipmentRow } from '@/features/shipper-bi';
import { getTransporterLogoUrl } from '@/features/shipper-bi/mocks/transporterProfiles';
import { cn, formatDate } from '@/utils';

/**
 * Recent shipping activity, filtered the way a shipper asks about it.
 *
 * The tabs are lifecycle questions, not a partition — "delivered" and "awaiting
 * return" deliberately overlap, because a container still out is both. Sorting
 * is inherited from the account derivation: open work first, most at risk first,
 * settled work newest first. A table an operator works down should not open on
 * the load due furthest out.
 *
 * A stage selected in the pipeline above overrides the tabs, so the two controls
 * cannot both claim to describe what is on screen.
 */

const PAGE_SIZE = 8;

type TabKey = 'all' | 'inTransit' | 'bulkyGoods' | 'pending' | 'delivered' | 'awaitingReturn';

const IN_TRANSIT_STAGES: StageKey[] = [
  'dispatched',
  'gate_in',
  'picked_up',
  'in_transit',
  'arrived',
  'unloading',
];

const TABS: { key: TabKey; label: string; match: (row: ShipperShipmentRow) => boolean }[] = [
  { key: 'all', label: 'All Shipments', match: () => true },
  {
    key: 'inTransit',
    label: 'In Transit',
    match: (row) => IN_TRANSIT_STAGES.includes(row.stage),
  },
  {
    key: 'bulkyGoods',
    label: 'Bulky Goods',
    match: (row) =>
      Boolean(
        row.cargoType?.toLowerCase().includes('bulky') ||
          (row.cargoType?.toLowerCase().includes('bulk') && !row.containerNo),
      ),
  },
  {
    key: 'pending',
    label: 'Pending',
    match: (row) => row.stage === 'created' || row.stage === 'documentation',
  },
  {
    key: 'delivered',
    label: 'Delivered',
    match: (row) => row.status === 'delivered' || row.status === 'closed',
  },
  {
    key: 'awaitingReturn',
    label: 'Awaiting Return',
    match: (row) => row.status === 'delivered',
  },
];

export interface ShipmentActivityCardProps {
  rows: ShipperShipmentRow[];
  /** A stage picked in the pipeline. Overrides the tabs while set. */
  stageFilter?: { key: string; label: string; stages: StageKey[] } | null;
  onClearStageFilter?: () => void;
  onOpenShipment?: (row: ShipperShipmentRow) => void;
}

export function ShipmentActivityCard({
  rows,
  stageFilter,
  onClearStageFilter,
  onOpenShipment,
}: ShipmentActivityCardProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    if (stageFilter) return rows.filter((row) => stageFilter.stages.includes(row.stage));
    const match = TABS.find((entry) => entry.key === activeTab)?.match;
    return match ? rows.filter(match) : rows;
  }, [rows, activeTab, stageFilter]);

  // A filter change that leaves the reader on page 4 of a 2-page result reads as
  // an empty table rather than as a filter.
  useEffect(() => {
    setPage(1);
  }, [activeTab, stageFilter?.key, rows]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * PAGE_SIZE;
  const visible = filtered.slice(start, start + PAGE_SIZE);

  return (
    <Card variant="default" padding="lg" className="gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex items-center gap-3">
          <IconChip icon={ClipboardList} size={36} />
          <div>
            <h2 className="text-[15px] font-semibold leading-tight text-foreground">
              Shipment Activity
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Open work first, then recent history
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {filtered.length === 0
              ? '0 of 0'
              : `${start + 1} – ${Math.min(start + PAGE_SIZE, filtered.length)} of ${filtered.length}`}
          </span>
          <div className="flex gap-1">
            <PageButton
              label="Previous page"
              disabled={safePage <= 1}
              onClick={() => setPage(safePage - 1)}
            >
              <ChevronLeft className="size-3.5" />
            </PageButton>
            <PageButton
              label="Next page"
              disabled={safePage >= pageCount}
              onClick={() => setPage(safePage + 1)}
            >
              <ChevronRight className="size-3.5" />
            </PageButton>
          </div>
        </div>
      </div>

      {stageFilter ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-subtle px-3 py-1.5 text-xs font-medium text-primary-subtle-foreground">
            Stage: {stageFilter.label}
            <button
              type="button"
              onClick={onClearStageFilter}
              aria-label="Clear stage filter"
              className="rounded-full p-0.5 transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <X className="size-3" />
            </button>
          </span>
          <span className="text-[11px] text-muted-foreground">Selected in the pipeline above</span>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {TABS.map((tab) => {
            const count = rows.filter(tab.match).length;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                aria-pressed={isActive}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-surface-sunken hover:text-foreground',
                )}
              >
                {tab.label}
                <span className={cn('tabular-nums', isActive ? 'opacity-80' : 'opacity-60')}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="overflow-x-auto rounded-card-nested border border-border-subtle">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-border-subtle bg-surface-sunken/60">
              {['Reference', 'Cargo', 'Transporter', 'Arrival', 'Route', 'Cost', 'Status'].map(
                (header) => (
                  <th
                    key={header}
                    scope="col"
                    className={cn(
                      'whitespace-nowrap px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground',
                      header === 'Cost' ? 'text-right' : 'text-left',
                    )}
                  >
                    {header}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {visible.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-xs text-muted-foreground">
                  No shipments match this filter.
                </td>
              </tr>
            ) : (
              visible.map((row) => (
                <tr
                  key={row.shipmentId}
                  tabIndex={onOpenShipment ? 0 : undefined}
                  role={onOpenShipment ? 'button' : undefined}
                  onClick={() => onOpenShipment?.(row)}
                  onKeyDown={(event) => {
                    if (onOpenShipment && (event.key === 'Enter' || event.key === ' ')) {
                      event.preventDefault();
                      onOpenShipment(row);
                    }
                  }}
                  className={cn(
                    'transition-colors',
                    onOpenShipment &&
                      'cursor-pointer hover:bg-surface-sunken/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
                  )}
                >
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-semibold text-foreground">
                    {row.reference}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                    {row.cargoType}
                  </td>
                  <td className="max-w-[170px] px-4 py-3 text-xs font-medium text-foreground">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <CompanyAvatar
                        src={getTransporterLogoUrl(row.transporter)}
                        name={row.transporter}
                        fallback={row.transporter.substring(0, 2).toUpperCase()}
                        size="xs"
                        shape="circle"
                        className="shrink-0"
                      />
                      <span className="block truncate">{row.transporter}</span>
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs">
                    <span className="block text-foreground">
                      {formatDate(row.arrivalAt ?? row.plannedDeliveryAt)}
                    </span>
                    {row.varianceMinutes !== undefined ? (
                      <span
                        className={cn(
                          'mt-0.5 block text-[11px]',
                          row.varianceMinutes > 0 ? 'text-destructive' : 'text-muted-foreground',
                        )}
                      >
                        {formatVariance(row.varianceMinutes)}
                      </span>
                    ) : null}
                  </td>
                  <td className="max-w-[190px] px-4 py-3 text-xs text-muted-foreground">
                    <span className="block truncate">
                      {row.origin} → {row.destination}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold tabular-nums text-foreground">
                    {formatCurrencyFull(row.cost)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <RowStatusBadge row={row} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function PageButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded-md border border-border p-1 text-muted-foreground transition-colors hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {children}
    </button>
  );
}

/** The lifecycle in five words, matching the pipeline's vocabulary. */
function RowStatusBadge({ row }: { row: ShipperShipmentRow }) {
  if (row.status === 'closed') {
    return (
      <Badge intent="success" size="sm">
        Completed
      </Badge>
    );
  }
  if (row.status === 'delivered') {
    return (
      <Badge intent="warning" size="sm">
        Awaiting return
      </Badge>
    );
  }
  if (IN_TRANSIT_STAGES.includes(row.stage)) {
    return (
      <Badge intent="primary" size="sm">
        In transit
      </Badge>
    );
  }
  return (
    <Badge intent="info" size="sm">
      {row.stageLabel}
    </Badge>
  );
}
