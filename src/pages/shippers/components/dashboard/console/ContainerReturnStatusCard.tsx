import { useState, useMemo } from 'react';
import { ArrowRight } from '@/design-system/icons';
import { Card, CompanyAvatar } from '@/design-system';
import { getTransporterLogoUrl } from '@/features/shipper-bi/mocks/transporterProfiles';
import { MOCK_TRANSPORTERS } from '@/features/shipper-bi/mocks/dimensions';
import type { ShipperShipmentRow } from '@/features/shipper-bi';
import { cn, formatDate } from '@/utils';
import { PanelHeader, PanelLink, PANEL_SURFACE } from './PanelHeader';

/* ---------------------------------------------------------------------------
 * Types
 * ------------------------------------------------------------------------ */

type ReturnStatus = 'overdue' | 'due_today' | 'due_soon' | 'on_track';
type FlowType = 'import' | 'export';
type ActiveTab = 'import' | 'export';

/** Only these three parties own return delays on the shipper console. */
type DelayParty = 'shipper' | 'transporter' | 'fleetin';

/** Closed root-cause set — what happened, not who is responsible. */
type RootCause =
  | 'documentation'
  | 'empty_return'
  | 'communication'
  | 'dispatching'
  | 'force_majeure';

interface ReturnDelay {
  party: DelayParty;
  cause: RootCause;
  /** Named transporter when the party is a carrier. */
  transporterId?: string;
}

interface PendingReturn {
  shipmentRef: string;
  containerNo: string;
  deliveredDate: string;
  dueDate: string;
  route: string;
  status: ReturnStatus;
  flow: FlowType;
  daysOverdue?: number;
  daysUntilDue?: number;
  /** Present when free time has lapsed or the return is at risk of delay. */
  delay?: ReturnDelay;
}

const FLEETIN_LOGO = '/logo/fleetin-icon.png';

/* ---------------------------------------------------------------------------
 * Mock data — Import containers incur Detention, Export incur Demurrage
 * ------------------------------------------------------------------------ */

const PARTY_LABELS: Record<DelayParty, string> = {
  shipper: 'Shipper',
  transporter: 'Transporter',
  fleetin: 'Fleetin',
};

const ROOT_CAUSE_LABELS: Record<RootCause, string> = {
  documentation: 'Documentation',
  empty_return: 'Empty return',
  communication: 'Communication',
  dispatching: 'Dispatching',
  force_majeure: 'Force majeure',
};


/** Shared by header + every row so columns stay locked left-to-right.
 *  No `auto` tracks — those shift Responsible/Root cause when Status width changes. */
const ROW_GRID =
  'lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1.25fr)_minmax(0,0.95fr)_minmax(0,0.7fr)_minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-center lg:gap-x-4';

/* ---------------------------------------------------------------------------
 * Presentation
 * ------------------------------------------------------------------------ */

/**
 * Status chip colour:
 * - red when free time has already lapsed
 * - orange (brand accent) when the due date is near
 * - primary (brand teal) when the return is still on a normal schedule
 */
function chipFor(status: ReturnStatus): string {
  switch (status) {
    case 'overdue':
      return 'border border-destructive/40 bg-destructive-subtle text-destructive-subtle-foreground';
    case 'due_today':
    case 'due_soon':
      return 'border border-accent/40 bg-accent-subtle text-accent-subtle-foreground';
    case 'on_track':
      return 'bg-primary-subtle text-primary-subtle-foreground';
  }
}

function isPastDue(status: ReturnStatus): boolean {
  return status === 'overdue';
}

function isDueNear(status: ReturnStatus): boolean {
  return status === 'due_today' || status === 'due_soon';
}

function getStatusLabel(item: PendingReturn): string {
  if (item.status === 'overdue') return `${item.daysOverdue}d overdue`;
  if (item.status === 'due_today') return 'Due today';
  return `Due in ${item.daysUntilDue}d`;
}

function splitRoute(route: string): { origin: string; destination: string } {
  const [origin, destination] = route.split(/\s*→\s*/);
  return {
    origin: origin?.trim() ?? route,
    destination: destination?.trim() ?? '',
  };
}

function partyIdentity(
  delay: ReturnDelay,
  shipper: { name: string; logoUrl?: string },
): { name: string; logoUrl?: string } {
  switch (delay.party) {
    case 'fleetin':
      return { name: 'Fleetin', logoUrl: FLEETIN_LOGO };
    case 'shipper':
      return {
        name: shipper.name || PARTY_LABELS.shipper,
        logoUrl: shipper.logoUrl,
      };
    case 'transporter': {
      const transporter = MOCK_TRANSPORTERS.find((t) => t.id === delay.transporterId);
      return {
        name: transporter?.name ?? PARTY_LABELS.transporter,
        logoUrl: getTransporterLogoUrl(delay.transporterId),
      };
    }
  }
}

/* ---------------------------------------------------------------------------
 * Component
 * ------------------------------------------------------------------------ */

export interface ContainerReturnStatusCardProps {
  className?: string;
  /** Logged-in shipper — their logo is used when they own the delay. */
  shipperName?: string;
  shipperLogoUrl?: string;
  /** Opens the full returns list. The link renders only when wired — a header
   *  affordance that navigates nowhere is a promise the card cannot keep. */
  onViewAll?: () => void;
  /** The account's own containers — the source of every row and count here. */
  rows: ShipperShipmentRow[];
}

/**
 * The containers this shipper still owes the lines, worst first.
 *
 * Import vs export is read off the lane: a box coming *off* a terminal is an
 * import to be stripped and returned; one going *to* a terminal is an export.
 * Responsibility follows the same timestamps the mission report uses — the
 * empty not ready inside free time is the consignee's depotage, a box ready in
 * time but still out is the return leg.
 */
function toPendingReturns(rows: ShipperShipmentRow[]): PendingReturn[] {
  const isTerminal = (place: string) => /terminal|port|dct|sgtd|horizon/i.test(place);

  return rows
    .filter((row) => row.containerNo && !row.returnedAt)
    .map((row) => {
      const overdue = row.emptyReturnOverdueDays;
      const dueInHours = row.freeTimeHoursRemaining ?? 0;
      const status: ReturnStatus =
        overdue > 0 ? 'overdue' : dueInHours <= 24 ? 'due_today' : 'on_track';

      return {
        shipmentRef: row.parentReference ?? row.reference,
        containerNo: row.containerNo as string,
        deliveredDate: row.arrivalAt ? formatDate(row.arrivalAt, 'dateShort') : '—',
        dueDate: row.freeTimeExpiresAt ? formatDate(row.freeTimeExpiresAt, 'dateShort') : '—',
        route: `${row.origin} → ${row.destination}`,
        status,
        flow: isTerminal(row.origin) ? 'import' : 'export',
        daysOverdue: overdue > 0 ? overdue : undefined,
        daysUntilDue: overdue > 0 ? undefined : Math.max(0, Math.round(dueInHours / 24)),
        delay:
          overdue > 0
            ? {
                party: row.primaryDelayOwner?.startsWith('shipper') ? 'shipper' : 'transporter',
                cause: 'empty_return',
              }
            : undefined,
      } satisfies PendingReturn;
    })
    .sort((a, b) => (b.daysOverdue ?? -1) - (a.daysOverdue ?? -1));
}

export function ContainerReturnStatusCard({
  className = '',
  shipperName = 'Shipper',
  shipperLogoUrl,
  onViewAll,
  rows,
}: ContainerReturnStatusCardProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('import');

  const pending = useMemo(() => toPendingReturns(rows), [rows]);
  const filteredReturns = useMemo(
    () => pending.filter((r) => r.flow === activeTab),
    [pending, activeTab],
  );

  const total = filteredReturns.length;
  const chargeLabel = activeTab === 'import' ? 'detention' : 'demurrage';
  const alertCount = pending.length;

  return (
    <Card
      variant="default"
      padding="none"
      className={cn('flex h-full min-h-0 flex-col', PANEL_SURFACE, className)}
    >
      {/* Header — title, scope, flow switcher */}
      <div className="flex flex-col gap-4 border-b border-border/60 px-6 pt-5 pb-4">
        <PanelHeader
          title="Container Return Status"
          hint={`${alertCount} containers awaiting empty return`}
          hintCritical={alertCount > 0}
          action={onViewAll ? <PanelLink onClick={onViewAll}>View all</PanelLink> : undefined}
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div
            role="tablist"
            aria-label="Return flow"
            className="grid w-full max-w-xs grid-cols-2 gap-1 rounded-card-nested bg-surface-sunken p-1"
          >
            <FlowTab
              active={activeTab === 'import'}
              onClick={() => setActiveTab('import')}
              label="Import"
              count={pending.filter((r) => r.flow === 'import').length}
            />
            <FlowTab
              active={activeTab === 'export'}
              onClick={() => setActiveTab('export')}
              label="Export"
              count={pending.filter((r) => r.flow === 'export').length}
            />
          </div>

          <p className="type-body-xs text-muted-foreground">
            Sorted by urgency — {chargeLabel} exposure · who is responsible · root cause
          </p>
        </div>
      </div>

      {/* Column headers — desktop table */}
      <div
        className={cn(
          'hidden border-b border-border-subtle px-6 py-2.5 lg:grid',
          ROW_GRID,
        )}
        aria-hidden
      >
        <span className="type-label text-muted-foreground">Shipment</span>
        <span className="type-label text-muted-foreground">Route</span>
        <span className="type-label text-muted-foreground">Dates</span>
        <span className="type-label text-muted-foreground">Status</span>
        <span className="type-label text-muted-foreground">Responsible</span>
        <span className="type-label text-muted-foreground">Root cause</span>
      </div>

      {/* Return rows */}
      <ul className="flex min-h-0 flex-1 flex-col divide-y divide-border-subtle">
        {filteredReturns.map((item) => {
          const { origin, destination } = splitRoute(item.route);
          const party = item.delay
            ? partyIdentity(item.delay, {
                name: shipperName,
                logoUrl: shipperLogoUrl,
              })
            : null;

          return (
            <li
              key={`${item.shipmentRef}-${item.containerNo}`}
              className={cn(
                'flex flex-col gap-3 px-6 py-3.5',
                ROW_GRID,
              )}
            >
              {/* Shipment + container */}
              <div className="min-w-0">
                <p className="type-body-sm truncate text-foreground">
                  {item.shipmentRef}
                  <span className="mx-1.5 font-normal text-muted-foreground/60">·</span>
                  {item.containerNo}
                </p>
                {/* Route under shipment on small screens */}
                <p className="type-body-xs mt-0.5 flex min-w-0 items-center gap-1.5 text-muted-foreground lg:hidden">
                  <span className="truncate">{origin}</span>
                  {destination ? (
                    <>
                      <ArrowRight
                        className="size-3 shrink-0 text-muted-foreground/50"
                        aria-hidden
                      />
                      <span className="truncate">{destination}</span>
                    </>
                  ) : null}
                </p>
              </div>

              {/* Route — desktop */}
              <p className="type-body-xs hidden min-w-0 items-center gap-1.5 text-muted-foreground lg:flex">
                <span className="min-w-0 truncate">{origin}</span>
                {destination ? (
                  <>
                    <ArrowRight
                      className="size-3 shrink-0 text-muted-foreground/50"
                      aria-hidden
                    />
                    <span className="min-w-0 truncate">{destination}</span>
                  </>
                ) : null}
              </p>

              {/* Dates — stacked so the column width stays consistent */}
              <div className="type-body-xs min-w-0 tabular-nums text-muted-foreground">
                <p className="truncate">Delivered {item.deliveredDate}</p>
                <p className="truncate">due {item.dueDate}</p>
              </div>

              {/* Status — fixed column; badge stays left-aligned */}
              <div className="min-w-0">
                <span
                  className={cn(
                    'inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
                    chipFor(item.status),
                  )}
                >
                  {isPastDue(item.status) ? (
                    <span className="relative flex h-1.5 w-1.5 shrink-0" aria-hidden>
                      <span className="absolute inline-flex h-full w-full animate-ping motion-reduce:animate-none rounded-full bg-destructive opacity-75" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-destructive" />
                    </span>
                  ) : isDueNear(item.status) ? (
                    <span className="relative flex h-1.5 w-1.5 shrink-0" aria-hidden>
                      <span className="absolute inline-flex h-full w-full animate-ping motion-reduce:animate-none rounded-full bg-accent opacity-75" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
                    </span>
                  ) : null}
                  <span className="truncate">{getStatusLabel(item)}</span>
                </span>
              </div>

              {/* Responsible — circular logo + name, always left-aligned */}
              <div className="min-w-0">
                {party ? (
                  <span
                    className="inline-flex max-w-full items-center gap-2"
                    title={party.name}
                  >
                    <CompanyAvatar
                      src={party.logoUrl}
                      name={party.name}
                      fallback={party.name.substring(0, 2).toUpperCase()}
                      size="xs"
                      shape="circle"
                      className="shrink-0"
                    />
                    <span className="truncate text-[11px] font-semibold text-foreground">
                      {party.name}
                    </span>
                  </span>
                ) : (
                  <span className="type-body-xs text-muted-foreground/50">—</span>
                )}
              </div>

              {/* Root cause */}
              <div className="min-w-0">
                {item.delay ? (
                  <p className="type-body-xs truncate text-muted-foreground">
                    <span className="font-medium text-foreground/80 lg:hidden">Root cause · </span>
                    {ROOT_CAUSE_LABELS[item.delay.cause]}
                  </p>
                ) : (
                  <span className="type-body-xs text-muted-foreground/50">
                    On track — no delay attributed
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {total > filteredReturns.length ? (
        <p className="type-body-xs border-t border-border-subtle px-6 py-3 text-muted-foreground">
          Showing the {filteredReturns.length} most urgent of {total} {activeTab} returns
        </p>
      ) : null}
    </Card>
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

export default ContainerReturnStatusCard;
