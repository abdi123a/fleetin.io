import { useState, useMemo } from 'react';
import { ArrowRight } from '@/design-system/icons';
import { Card, CompanyAvatar } from '@/design-system';
import { getTransporterLogoUrl } from '@/features/shipper-bi/mocks/transporterProfiles';
import { MOCK_TRANSPORTERS } from '@/features/shipper-bi/mocks/dimensions';
import { cn } from '@/utils';
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

const MOCK_RETURNS: PendingReturn[] = [
  // IMPORT — Detention
  {
    shipmentRef: 'SHP-2291',
    containerNo: 'CNT-88213',
    deliveredDate: 'Aug 2',
    dueDate: 'Aug 5',
    route: 'Doraleh Container Terminal → Doraleh Multi-Purpose Port',
    status: 'overdue',
    flow: 'import',
    daysOverdue: 3,
    delay: {
      party: 'shipper',
      cause: 'empty_return',
    },
  },
  {
    shipmentRef: 'SHP-2288',
    containerNo: 'CNT-88190',
    deliveredDate: 'Aug 3',
    dueDate: 'Aug 6',
    route: 'Port of Djibouti → Doraleh Container Terminal',
    status: 'due_today',
    flow: 'import',
    delay: {
      party: 'fleetin',
      cause: 'documentation',
    },
  },
  {
    shipmentRef: 'SHP-2301',
    containerNo: 'CNT-88240',
    deliveredDate: 'Aug 4',
    dueDate: 'Aug 7',
    route: 'Damerjog Livestock Port → Port of Djibouti',
    status: 'due_soon',
    flow: 'import',
    daysUntilDue: 1,
    delay: {
      party: 'transporter',
      cause: 'dispatching',
      transporterId: 'TRP-01',
    },
  },
  {
    shipmentRef: 'SHP-2305',
    containerNo: 'CNT-88255',
    deliveredDate: 'Aug 5',
    dueDate: 'Aug 9',
    route: 'Port of Tadjourah → Doraleh Container Terminal',
    status: 'on_track',
    flow: 'import',
    daysUntilDue: 3,
  },
  // EXPORT — Demurrage
  {
    shipmentRef: 'SHP-2310',
    containerNo: 'CNT-88271',
    deliveredDate: 'Aug 1',
    dueDate: 'Aug 4',
    route: 'Doraleh Multi-Purpose Port → Port of Djibouti',
    status: 'overdue',
    flow: 'export',
    daysOverdue: 4,
    delay: {
      party: 'transporter',
      cause: 'empty_return',
      transporterId: 'TRP-02',
    },
  },
  {
    shipmentRef: 'SHP-2318',
    containerNo: 'CNT-88299',
    deliveredDate: 'Aug 4',
    dueDate: 'Aug 6',
    route: 'Doraleh Container Terminal → Damerjog Livestock Port',
    status: 'due_today',
    flow: 'export',
    delay: {
      party: 'fleetin',
      cause: 'force_majeure',
    },
  },
  {
    shipmentRef: 'SHP-2322',
    containerNo: 'CNT-88304',
    deliveredDate: 'Aug 5',
    dueDate: 'Aug 8',
    route: 'Port of Djibouti → Port of Tadjourah',
    status: 'due_soon',
    flow: 'export',
    daysUntilDue: 2,
    delay: {
      party: 'shipper',
      cause: 'communication',
    },
  },
  {
    shipmentRef: 'SHP-2330',
    containerNo: 'CNT-88315',
    deliveredDate: 'Aug 5',
    dueDate: 'Aug 10',
    route: 'Doraleh Container Terminal → Port of Djibouti',
    status: 'on_track',
    flow: 'export',
    daysUntilDue: 4,
  },
];

const IMPORT_TOTAL = 28;
const EXPORT_TOTAL = 18;

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
}

export function ContainerReturnStatusCard({
  className = '',
  shipperName = 'Shipper',
  shipperLogoUrl,
  onViewAll,
}: ContainerReturnStatusCardProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('import');

  const filteredReturns = useMemo(
    () => MOCK_RETURNS.filter((r) => r.flow === activeTab),
    [activeTab],
  );

  const total = activeTab === 'import' ? IMPORT_TOTAL : EXPORT_TOTAL;
  const chargeLabel = activeTab === 'import' ? 'detention' : 'demurrage';
  const alertCount = IMPORT_TOTAL + EXPORT_TOTAL;

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
              count={IMPORT_TOTAL}
            />
            <FlowTab
              active={activeTab === 'export'}
              onClick={() => setActiveTab('export')}
              label="Export"
              count={EXPORT_TOTAL}
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
