import type { ReactNode } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Compass,
  Container,
  Gauge,
  Package,
  Wallet,
} from '@/design-system/icons';
import { Card } from '@/design-system';
import { deltaIntent, formatDelta, formatMetric } from '@/features/shipper-bi/format';
import type { KpiMetric } from '@/features/shipper-bi/contracts';
import { cn, formatDate } from '@/utils';

/**
 * The page's one masthead: who is signed in, what window they are looking at,
 * what they can do, and the five numbers that decide whether they need to do
 * anything at all.
 *
 * Built as a single panel rather than a greeting with metrics floating under it.
 * Loose figures on the canvas read as five unrelated facts; enclosed and
 * divided, they read as one status line — and the window they are scoped to is
 * stated in the same box, right under the greeting, so no figure here is ever
 * ambiguous about which days it counted.
 *
 * Five, not nine. Anything that needs a second number to be understood belongs
 * in Analytics; this strip only has to answer "is today normal".
 */

export interface MastheadMetrics {
  totalShipments: KpiMetric;
  activeShipments: KpiMetric;
  emptyReturnPending: KpiMetric;
  onTimeRate: KpiMetric;
  totalCost: KpiMetric;
}

export interface DashboardMastheadProps {
  greeting: string;
  firstName: string;
  /** The account these figures belong to. */
  companyName: string;
  from: string;
  to: string;
  /** Timeframe control and primary actions. */
  actions: ReactNode;
  metrics?: MastheadMetrics;
  /** Containers already past free time — the qualifier on the pending tile. */
  containersOverdue: number;
  /** Contractual on-time floor, 0–1. */
  onTimeTarget: number;
}

export function DashboardMasthead({
  greeting,
  firstName,
  companyName,
  from,
  to,
  actions,
  metrics,
  containersOverdue,
  onTimeTarget,
}: DashboardMastheadProps) {
  return (
    <Card variant="default" padding="none" className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 px-6 pb-5 pt-5">
        <div className="min-w-0">
          <h1 className="truncate text-[1.6rem] font-semibold leading-tight tracking-tight text-foreground">
            {greeting}, {firstName}
          </h1>
          <p className="mt-1 truncate text-[13px] text-muted-foreground">
            <span className="font-medium text-foreground">{companyName}</span>
            {' · '}
            {formatDate(from, 'date')} — {formatDate(to, 'date')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">{actions}</div>
      </div>

      <div className="grid gap-3 border-t border-border-subtle bg-surface-sunken/40 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {metrics ? (
          <>
            <MetricTile
              icon={<Compass className="size-3.5" />}
              label="Total Shipments"
              metric={metrics.totalShipments}
            />
            <MetricTile
              icon={<Package className="size-3.5" />}
              label="Active Shipments"
              metric={metrics.activeShipments}
              note="moving right now"
            />
            <MetricTile
              icon={<Container className="size-3.5" />}
              label="Empty Return Pending"
              metric={metrics.emptyReturnPending}
              note={
                containersOverdue > 0
                  ? `${containersOverdue} past free time`
                  : 'all inside free time'
              }
              noteTone={containersOverdue > 0 ? 'critical' : 'good'}
            />
            <MetricTile
              icon={<Gauge className="size-3.5" />}
              label="On-Time Delivery"
              metric={metrics.onTimeRate}
              note={`target ${Math.round(onTimeTarget * 100)}%`}
              noteTone={metrics.onTimeRate.value >= onTimeTarget ? 'good' : 'critical'}
            />
            <MetricTile
              icon={<Wallet className="size-3.5" />}
              label="Total Logistics Cost"
              metric={metrics.totalCost}
            />
          </>
        ) : (
          [0, 1, 2, 3, 4].map((tile) => (
            <div
              key={tile}
              className="h-[86px] animate-pulse motion-reduce:animate-none rounded-card-nested border border-border-subtle bg-surface"
            />
          ))
        )}
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------------------
 * Tile
 * ------------------------------------------------------------------------ */

function MetricTile({
  icon,
  label,
  metric,
  note,
  noteTone = 'muted',
}: {
  icon: ReactNode;
  label: string;
  metric: KpiMetric;
  note?: string;
  noteTone?: 'muted' | 'good' | 'critical';
}) {
  const { figure, unit } = splitUnit(formatMetric(metric.value, metric.unit));
  const delta = formatDelta(metric.deltaPct);
  const tone = deltaIntent(metric.deltaPct, metric.polarity);
  const DeltaIcon = (metric.deltaPct ?? 0) < 0 ? ArrowDownRight : ArrowUpRight;

  return (
    <div className="rounded-card-nested border border-border-subtle bg-surface px-4 py-3.5">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        <span className="text-primary">{icon}</span>
        <span className="truncate">{label}</span>
      </p>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-2">
        <span className="text-[1.55rem] font-semibold leading-none tracking-tight text-foreground">
          {figure}
          {unit ? (
            <span className="ml-1 align-baseline text-xs font-medium text-muted-foreground">
              {unit}
            </span>
          ) : null}
        </span>

        {delta ? (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 text-xs font-semibold leading-none',
              tone === 'good' && 'text-success',
              tone === 'bad' && 'text-destructive',
              tone === 'neutral' && 'text-muted-foreground',
            )}
          >
            {delta}
            <DeltaIcon className="size-3" />
          </span>
        ) : null}
      </div>

      {note ? (
        <p
          className={cn(
            'mt-1.5 truncate text-[11px]',
            noteTone === 'muted' && 'text-muted-foreground',
            noteTone === 'good' && 'text-success',
            noteTone === 'critical' && 'text-destructive',
          )}
        >
          {note}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Split a trailing unit token off a formatted value.
 *
 * "11.55M DJF" is one number and one unit; set at the same size the currency
 * code reads as part of the magnitude.
 */
function splitUnit(formatted: string): { figure: string; unit?: string } {
  const match = /^(.*?)\s([A-Za-z]{2,})$/.exec(formatted);
  if (!match) return { figure: formatted };
  return { figure: match[1] ?? formatted, unit: match[2] };
}
