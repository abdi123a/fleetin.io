import { useMemo } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  ContainerIcon,
} from '@/design-system/icons';
import { Card, IconChip } from '@/design-system';
import type { ShipperShipmentRow } from '@/features/shipper-bi';
import { cn } from '@/utils';
import { detentionRatePerContainerDay } from '@/lib/bi/config';
import { detentionCost, formatDetention, isContainerOut } from './detention';
import { PANEL_SURFACE_ALERT } from './PanelHeader';

/**
 * The only panel on the page that asks the reader for something.
 *
 * The old dashboard held the same facts, split across an empty-return banner, a
 * Delayed count and a risk list, each ranked by its own rule. Nothing said which
 * of the three to open first, so in practice a reader opened whichever sat
 * highest — which is a layout deciding priority, not the data.
 *
 * One queue, one rule: cost, descending. A container thirty days past free time
 * outranks a shipment running four hours late, because the container is taking
 * money out of the account right now and the shipment is not. Rows that cost
 * nothing yet still appear, under the ones that do, because a late delivery is
 * a promise broken even when the invoice is clean.
 *
 * Every row opens the shipment. A queue you cannot act from is a list of
 * complaints.
 */

export interface ActionQueueCardProps {
  /** The whole account, not the window — a box that went out in March is still
   *  out today, and detention does not stop for a date filter. */
  rows: ShipperShipmentRow[];
  onOpenShipment: (row: ShipperShipmentRow) => void;
  onViewAll: () => void;
}

type ActionKind = 'detention' | 'free_time' | 'late';

interface ActionItem {
  key: string;
  kind: ActionKind;
  row: ShipperShipmentRow;
  title: string;
  detail: string;
  /** What it is costing right now. Zero when nothing is accruing yet. */
  cost: number;
  /** The figure shown on the right when there is no cost to show. */
  metric: string;
}

const KIND: Record<ActionKind, { label: string; icon: typeof ContainerIcon }> = {
  detention: { label: 'Charging', icon: AlertTriangle },
  free_time: { label: 'Due soon', icon: ContainerIcon },
  late: { label: 'Running late', icon: Clock3 },
};

/** Six rows fills the panel beside the bill without turning it into a table. */
const MAX_ROWS = 6;

export function ActionQueueCard({ rows, onOpenShipment, onViewAll }: ActionQueueCardProps) {
  const items = useMemo(() => buildQueue(rows), [rows]);

  const accruing = items.reduce((total, item) => total + item.cost, 0);
  const shown = items.slice(0, MAX_ROWS);
  const clear = items.length === 0;

  return (
    <Card
      variant="default"
      padding="none"
      className={cn('h-full flex flex-col overflow-hidden shadow-sm', PANEL_SURFACE_ALERT)}
    >
      {/* ── Executive Header ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-5 border-b border-border-subtle bg-surface/80 backdrop-blur-sm">
        <div className="flex items-center gap-3.5 min-w-0">
          <IconChip
            icon={clear ? CheckCircle2 : AlertTriangle}
            size={36}
            tint={clear ? 'teal' : 'orange'}
          />

          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h3 className="type-h3 font-bold text-foreground tracking-tight">
                {clear
                  ? 'All Shipments On Plan'
                  : `${items.length} Shipment${items.length === 1 ? '' : 's'} Need Attention`}
              </h3>
              {!clear && (
                <span className="type-label px-2.5 py-0.5 rounded-full bg-warning-subtle text-warning-subtle-foreground font-bold text-[10px] tracking-wider uppercase border border-warning/20">
                  Priority
                </span>
              )}
            </div>
            <p className="type-body-xs mt-0.5 text-muted-foreground truncate">
              {accruing > 0
                ? `${formatDetention(accruing)} total accrued (${formatDetention(detentionRatePerContainerDay())}/container/day)`
                : clear
                  ? 'Zero detention accruing across active shipments'
                  : 'Action required before detention charges begin'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onViewAll}
          className="type-body-xs inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 border border-border/80 hover:bg-surface-sunken hover:border-border text-foreground transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          All shipments
          <ArrowRight className="size-3.5" aria-hidden />
        </button>
      </div>

      {/* ── Queue Items List ───────────────────────────────────────── */}
      {shown.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
          <IconChip icon={CheckCircle2} className="mb-3" />
          <p className="type-body-sm text-foreground">Zero Active Penalties</p>
          <p className="type-body-xs text-muted-foreground mt-1 max-w-sm">
            All containers have been returned or are within free time boundaries.
          </p>
        </div>
      ) : (
        <ul className="flex flex-1 flex-col divide-y divide-border-subtle/60">
          {shown.map((item) => {
            const Icon = KIND[item.kind].icon;
            const isCharging = item.cost > 0;

            return (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => onOpenShipment(item.row)}
                  className="group flex w-full items-center gap-4 px-6 py-3.5 text-left transition hover:bg-surface-sunken/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  {/* Orange only where money is actually leaking. */}
                  <IconChip
                    icon={Icon}
                    size={36}
                    tint={isCharging ? 'orange' : item.kind === 'free_time' ? 'teal' : 'neutral'}
                  />

                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="type-body-sm truncate text-foreground group-hover:text-primary transition-colors">
                        {item.title}
                      </span>
                      <span
                        className={cn(
                          'type-label shrink-0 rounded-sm font-bold px-2 py-0.5 text-[10px] tracking-wide uppercase',
                          isCharging
                            ? 'bg-warning-subtle text-warning-subtle-foreground border border-warning/20'
                            : item.kind === 'free_time'
                              ? 'bg-info-subtle text-info-subtle-foreground border border-info/20'
                              : 'bg-muted text-muted-foreground border border-border-subtle',
                        )}
                      >
                        {KIND[item.kind].label}
                      </span>
                    </span>
                    <span className="type-body-xs mt-0.5 block truncate text-muted-foreground">
                      {item.detail}
                    </span>
                  </span>

                  <span className="shrink-0 text-right">
                    <span
                      className={cn(
                        'type-body-md block font-extrabold tabular-nums tracking-tight',
                        isCharging ? 'text-warning-subtle-foreground' : 'text-foreground',
                      )}
                    >
                      {isCharging ? formatDetention(item.cost) : item.metric}
                    </span>
                    <span className="type-body-xs block text-muted-foreground/80 text-[11px]">
                      {isCharging ? 'so far' : 'behind plan'}
                    </span>
                  </span>

                  <ArrowRight
                    className="size-4 shrink-0 text-muted-foreground/30 transition-transform group-hover:translate-x-1 group-hover:text-primary"
                    aria-hidden
                  />
                </button>
              </li>
            );
          })}

          {items.length > shown.length ? (
            <li className="px-6 py-3 bg-surface-sunken/40 border-t border-border-subtle/60">
              <button
                type="button"
                onClick={onViewAll}
                className="type-body-xs rounded-full text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                + {items.length - shown.length} more item{items.length - shown.length === 1 ? '' : 's'} needing review →
              </button>
            </li>
          ) : null}
        </ul>
      )}
    </Card>
  );
}

/* ---------------------------------------------------------------------------
 * Derivation
 * ------------------------------------------------------------------------ */

/** Below this, a late shipment is drift rather than a problem to act on. */
const LATE_THRESHOLD_HOURS = 12;

/** Free time inside this window is close enough to plan a return around. */
const DUE_SOON_HOURS = 48;

function buildQueue(rows: ShipperShipmentRow[]): ActionItem[] {
  const items: ActionItem[] = [];

  for (const row of rows) {
    if (isContainerOut(row) && row.emptyReturnOverdueDays > 0) {
      items.push({
        key: `detention-${row.shipmentId}`,
        kind: 'detention',
        row,
        title: row.containerNo ?? row.reference,
        detail: `${Math.round(row.emptyReturnOverdueDays)}d past free time · ${row.destination}`,
        cost: detentionCost(row),
        metric: `${Math.round(row.emptyReturnOverdueDays)}d`,
      });
      continue;
    }

    if (
      isContainerOut(row) &&
      row.freeTimeHoursRemaining !== undefined &&
      row.freeTimeHoursRemaining > 0 &&
      row.freeTimeHoursRemaining <= DUE_SOON_HOURS
    ) {
      items.push({
        key: `free-${row.shipmentId}`,
        kind: 'free_time',
        row,
        title: row.containerNo ?? row.reference,
        detail: `Free time ends in ${Math.round(row.freeTimeHoursRemaining)}h · ${row.destination}`,
        cost: 0,
        metric: `${Math.round(row.freeTimeHoursRemaining)}h`,
      });
      continue;
    }

    // Open and forecast to miss. A delivered-late row is history: it belongs in
    // the on-time rate, not in a queue of things somebody can still change.
    if (row.status === 'open' && (row.varianceMinutes ?? 0) > 0) {
      const hours = (row.varianceMinutes ?? 0) / 60;
      if (hours < LATE_THRESHOLD_HOURS) continue;

      items.push({
        key: `late-${row.shipmentId}`,
        kind: 'late',
        row,
        title: row.reference,
        detail: `${row.origin} → ${row.destination} · ${row.transporter}`,
        cost: 0,
        metric: hours >= 24 ? `${Math.round(hours / 24)}d` : `${Math.round(hours)}h`,
      });
    }
  }

  // Cost first, then how far past the promise — both descending, so the top of
  // the list is always the most expensive thing still worth fixing.
  return items.sort(
    (a, b) => b.cost - a.cost || b.row.emptyReturnOverdueDays - a.row.emptyReturnOverdueDays,
  );
}
