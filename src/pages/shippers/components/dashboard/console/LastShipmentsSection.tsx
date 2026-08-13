import { useMemo, useState } from 'react';
import { ArrowRight, Package } from '@/design-system/icons';
import { Card, CompanyAvatar } from '@/design-system';
import type { ShipperShipmentRow } from '@/features/shipper-bi';
import { getTransporterLogoUrl } from '@/features/shipper-bi/mocks/transporterProfiles';
import { cn, formatDate } from '@/utils';
import { PanelHeader, PanelLink, PANEL_SURFACE } from './PanelHeader';

const VISIBLE_LIMIT = 5;

type ActiveTab = 'ongoing' | 'past';

export interface LastShipmentsSectionProps {
  rows: ShipperShipmentRow[];
  organization?: string;
  createdBy?: string;
  onViewAll?: () => void;
  onOpenShipment?: (row: ShipperShipmentRow) => void;
  className?: string;
}

/** Shared by header + every row so columns stay locked. */
const ROW_GRID =
  'lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.35fr)_minmax(0,0.9fr)_minmax(0,0.75fr)_minmax(0,1.05fr)_minmax(0,0.85fr)] lg:items-center lg:gap-x-4';

/**
 * Closing section — same shell as Container Return Status:
 * header + Ongoing/Past tabs + compact table rows.
 */
export function LastShipmentsSection({
  rows,
  onViewAll,
  onOpenShipment,
  className,
}: LastShipmentsSectionProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('ongoing');

  const { ongoing, past } = useMemo(() => {
    const sortNewest = (list: ShipperShipmentRow[]) =>
      [...list].sort((a, b) =>
        (b.arrivalAt ?? b.plannedDeliveryAt).localeCompare(
          a.arrivalAt ?? a.plannedDeliveryAt,
        ),
      );

    return {
      ongoing: sortNewest(rows.filter((row) => row.status === 'open')),
      past: sortNewest(
        rows.filter((row) => row.status === 'delivered' || row.status === 'closed'),
      ),
    };
  }, [rows]);

  const tabRows = activeTab === 'ongoing' ? ongoing : past;
  const visible = tabRows.slice(0, VISIBLE_LIMIT);
  const total = ongoing.length + past.length;

  return (
    <section aria-label="Last Shipments">
      <Card
        variant="default"
        padding="none"
        className={cn('flex min-h-0 flex-col', PANEL_SURFACE, className)}
      >
        <div className="flex flex-col gap-4 border-b border-border/60 px-6 pt-5 pb-4">
          <PanelHeader
            title="Last Shipments"
            hint={
              total > 0
                ? `${total} shipment${total === 1 ? '' : 's'} on this account`
                : 'No movements on this account yet'
            }
            action={
              onViewAll ? <PanelLink onClick={onViewAll}>View all</PanelLink> : undefined
            }
          />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div
              role="tablist"
              aria-label="Shipment status"
              className="grid w-full max-w-xs grid-cols-2 gap-1 rounded-card-nested bg-surface-sunken p-1"
            >
              <FlowTab
                active={activeTab === 'ongoing'}
                onClick={() => setActiveTab('ongoing')}
                label="Ongoing"
                count={ongoing.length}
              />
              <FlowTab
                active={activeTab === 'past'}
                onClick={() => setActiveTab('past')}
                label="Past"
                count={past.length}
              />
            </div>

            <p className="type-body-xs text-muted-foreground">
              Sorted by newest — route · date · status · transporter
            </p>
          </div>
        </div>

        {/* Column headers */}
        <div
          className={cn('hidden border-b border-border-subtle px-6 py-2.5', ROW_GRID)}
          aria-hidden
        >
          <span className="type-label text-muted-foreground">Shipment</span>
          <span className="type-label text-muted-foreground">Route</span>
          <span className="type-label text-muted-foreground">Date</span>
          <span className="type-label text-muted-foreground">Status</span>
          <span className="type-label text-muted-foreground">Transporter</span>
          <span className="type-label text-muted-foreground">Cargo</span>
        </div>

        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1.5 px-6 py-12 text-center">
            <Package className="size-6 text-muted-foreground/50" aria-hidden />
            <p className="type-body-sm text-muted-foreground">
              {activeTab === 'ongoing'
                ? 'No ongoing shipments.'
                : 'No past shipments.'}
            </p>
          </div>
        ) : (
          <ul className="flex min-h-0 flex-1 flex-col divide-y divide-border-subtle">
            {visible.map((row) => (
              <li key={row.shipmentId}>
                <button
                  type="button"
                  disabled={!onOpenShipment}
                  onClick={onOpenShipment ? () => onOpenShipment(row) : undefined}
                  className={cn(
                    'flex w-full flex-col gap-2 px-6 py-3 text-left transition-colors',
                    ROW_GRID,
                    onOpenShipment &&
                      'cursor-pointer hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                    !onOpenShipment && 'cursor-default',
                  )}
                >
                  {/* Shipment */}
                  <div className="min-w-0">
                    <p className="type-body-sm truncate text-foreground">
                      {row.reference}
                      {row.containerNo ? (
                        <>
                          <span className="mx-1.5 font-normal text-muted-foreground/60">
                            ·
                          </span>
                          {row.containerNo}
                        </>
                      ) : null}
                    </p>
                    <p className="type-body-xs mt-0.5 flex min-w-0 items-center gap-1.5 text-muted-foreground lg:hidden">
                      <span className="truncate">{row.origin}</span>
                      <ArrowRight
                        className="size-3 shrink-0 text-muted-foreground/50"
                        aria-hidden
                      />
                      <span className="truncate">{row.destination}</span>
                    </p>
                  </div>

                  {/* Route — desktop */}
                  <p className="type-body-xs hidden min-w-0 items-center gap-1.5 text-muted-foreground lg:flex">
                    <span className="min-w-0 truncate">{row.origin}</span>
                    <ArrowRight
                      className="size-3 shrink-0 text-muted-foreground/50"
                      aria-hidden
                    />
                    <span className="min-w-0 truncate">{row.destination}</span>
                  </p>

                  {/* Date */}
                  <div className="type-body-xs min-w-0 tabular-nums text-muted-foreground">
                    <p className="truncate">
                      {formatDate(row.arrivalAt ?? row.plannedDeliveryAt, 'date')}
                    </p>
                    {row.vehiclePlate ? (
                      <p className="truncate font-mono text-[10px]">{row.vehiclePlate}</p>
                    ) : null}
                  </div>

                  {/* Status */}
                  <div className="min-w-0">
                    <span
                      className={cn(
                        'inline-flex max-w-full truncate rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
                        statusChipClass(row),
                      )}
                    >
                      {row.stageLabel}
                    </span>
                  </div>

                  {/* Transporter */}
                  <div className="min-w-0">
                    <span className="inline-flex max-w-full items-center gap-2">
                      <CompanyAvatar
                        src={getTransporterLogoUrl(row.transporter)}
                        name={row.transporter}
                        fallback={row.transporter.substring(0, 2).toUpperCase()}
                        size="xs"
                        shape="circle"
                        className="shrink-0"
                      />
                      <span className="truncate text-[11px] font-semibold text-foreground">
                        {row.transporter}
                      </span>
                    </span>
                  </div>

                  {/* Cargo */}
                  <p className="type-body-xs min-w-0 truncate text-muted-foreground">
                    {row.cargoType}
                    {row.containerType ? (
                      <span className="text-muted-foreground/70"> · {row.containerType}</span>
                    ) : null}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}

        {tabRows.length > 0 ? (
          <p className="type-body-xs border-t border-border-subtle px-6 py-3 text-muted-foreground">
            Showing the {visible.length} most recent of {tabRows.length}{' '}
            {activeTab} shipment{tabRows.length === 1 ? '' : 's'}
          </p>
        ) : null}
      </Card>
    </section>
  );
}

function FlowTab({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'flex items-center justify-center gap-1.5 rounded-[calc(var(--radius-card-nested)-4px)] px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'bg-surface text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <span>{label}</span>
      <span
        className={cn(
          'tabular-nums',
          active ? 'text-muted-foreground' : 'text-muted-foreground/70',
        )}
      >
        {count}
      </span>
    </button>
  );
}

function statusChipClass(row: ShipperShipmentRow): string {
  if (row.status === 'closed' || row.status === 'delivered') {
    return 'bg-success-subtle text-success-subtle-foreground';
  }
  if (
    row.stage === 'dispatched' ||
    row.stage === 'gate_in' ||
    row.stage === 'picked_up' ||
    row.stage === 'in_transit' ||
    row.stage === 'arrived' ||
    row.stage === 'unloading'
  ) {
    return 'bg-primary-subtle text-primary-subtle-foreground';
  }
  if (row.stage === 'empty_awaiting') {
    return 'border border-accent/40 bg-accent-subtle text-accent-subtle-foreground';
  }
  if (row.stage === 'empty_returned') {
    return 'bg-muted text-muted-foreground';
  }
  return 'border border-warning/40 bg-warning-subtle text-warning-subtle-foreground';
}

export default LastShipmentsSection;
