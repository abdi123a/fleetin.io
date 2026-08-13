import type { ReactNode } from 'react';
import { ArrowRight, Container, Gauge, Package } from '@/design-system/icons';
import { Card, LinearProgress, type ProgressStatus } from '@/design-system';
import type { ShipperAccountSummary, ShipmentFilterKey } from '@/features/shipper-bi';
import { formatDate, formatNumber } from '@/utils';
import type { ShipperTabKey } from './ShipperTabNav';

/**
 * Four numbers, each with the comparison that makes it a decision.
 *
 * A count on its own is trivia. "34 open" only means something next to how many
 * are moving and how many are stuck; an on-time rate only means something next
 * to the target it is contracted against; a spend figure only means something
 * next to the share of it nobody had to pay. So every tile carries a value, the
 * slice of that value that matters, and a bar showing the ratio between them.
 *
 * All four are links. A metric a reader cannot follow to its evidence is a
 * metric they have to take on faith, and the evidence for each of these is
 * already on the page — one tab away.
 */

export interface AccountHealthStripProps {
  summary: ShipperAccountSummary;
  onNavigate: (tab: ShipperTabKey, filter?: ShipmentFilterKey) => void;
}

export function AccountHealthStrip({ summary, onNavigate }: AccountHealthStripProps) {
  const {
    openShipments,
    inProgress,
    awaitingReturn,
    onTimeRate,
    onTimeTarget,
    lateDeliveries,
    deliveredShipments,
    containersOverdue,
    totalShipments,
  } = summary;

  const onTimePct = onTimeRate * 100;
  const targetPct = onTimeTarget * 100;

  return (
    <section aria-labelledby="account-health-heading" className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="account-health-heading" className="type-label text-muted-foreground">
          Overview
        </h2>
        {/* Stated per tile window for context */}
        <p className="type-caption text-muted-foreground">
          Live position · totals since {formatDate(summary.since)}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <HealthTile
          icon={<Package />}
          label="Total Shipments"
          value={formatNumber(totalShipments, { maximumFractionDigits: 0 })}
          support={
            <>
              <strong className="font-medium text-foreground">{formatNumber(deliveredShipments)}</strong> delivered ·{' '}
              <strong className="font-medium text-foreground">{openShipments}</strong> open
            </>
          }
          meterLabel={`Volume handled · since ${formatDate(summary.since, 'monthYear')}`}
          meterValue={100}
          meterStatus="default"
          onSelect={() => onNavigate('shipments', 'all')}
        />

        <HealthTile
          icon={<Package />}
          label="Active Shipments"
          value={formatNumber(inProgress, { maximumFractionDigits: 0 })}
          support={
            <>
              <strong className="font-medium text-foreground">{inProgress}</strong> in transit ·{' '}
              <strong className="font-medium text-foreground">{awaitingReturn}</strong> awaiting return
            </>
          }
          meterLabel="Cargo in transit · now"
          meterValue={share(inProgress, openShipments || totalShipments)}
          meterStatus="default"
          onSelect={() => onNavigate('shipments', 'open')}
        />

        <HealthTile
          icon={<Container />}
          label="Empty Return Pending"
          value={formatNumber(awaitingReturn, { maximumFractionDigits: 0 })}
          support={
            containersOverdue > 0 ? (
              <span className="font-medium text-destructive-subtle-foreground">
                {containersOverdue} past free time
              </span>
            ) : (
              'All inside free time'
            )
          }
          meterLabel="Awaiting empty return"
          meterValue={share(awaitingReturn, openShipments || totalShipments)}
          meterStatus={containersOverdue > 0 ? 'warning' : 'default'}
          onSelect={() => onNavigate('shipments', 'delivered')}
        />

        <HealthTile
          icon={<Gauge />}
          label="On-Time Delivery Rate"
          value={`${onTimePct.toFixed(1)}%`}
          support={
            <>
              <strong className="font-medium text-foreground">{lateDeliveries}</strong> late of{' '}
              {formatNumber(deliveredShipments, { maximumFractionDigits: 0 })} delivered
            </>
          }
          meterLabel={`Target ${targetPct.toFixed(0)}% · since ${formatDate(summary.since, 'monthYear')}`}
          meterValue={onTimePct}
          meterStatus={
            onTimeRate >= onTimeTarget
              ? 'success'
              : onTimeRate >= onTimeTarget - 0.1
                ? 'warning'
                : 'danger'
          }
          onSelect={() => onNavigate('analytics')}
        />
      </div>
    </section>
  );
}

function share(part: number, whole: number): number {
  return whole <= 0 ? 0 : (part / whole) * 100;
}

interface HealthTileProps {
  icon: ReactNode;
  label: string;
  value: string;
  support: ReactNode;
  meterLabel: string;
  meterValue: number;
  meterStatus: ProgressStatus;
  onSelect: () => void;
}

/**
 * The value stays `text-foreground` whatever the reading.
 *
 * Colouring the headline number turns a dashboard into a set of traffic lights
 * that all shout at once; the signal belongs on the one line that carries the
 * comparison, so a reader's eye lands on the exception rather than on the wall.
 */
function HealthTile({
  icon,
  label,
  value,
  support,
  meterLabel,
  meterValue,
  meterStatus,
  onSelect,
}: HealthTileProps) {
  return (
    <Card
      asButton
      clickable
      padding="md"
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
      className="group gap-3"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 type-label text-muted-foreground">
          <span className="[&_svg]:size-3.5" aria-hidden>
            {icon}
          </span>
          {label}
        </span>
        <ArrowRight
          className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          aria-hidden
        />
      </div>

      <div className="space-y-1">
        <p className="type-display tabular-nums text-foreground">{value}</p>
        <p className="type-caption text-muted-foreground">{support}</p>
      </div>

      <LinearProgress
        value={meterValue}
        size="xs"
        status={meterStatus}
        aria-label={meterLabel}
        className="mt-auto"
      />
      <p className="type-caption text-muted-foreground">{meterLabel}</p>
    </Card>
  );
}
