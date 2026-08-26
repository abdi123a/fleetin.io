import { Card, Skeleton } from '@/design-system';
import {
  Banknote,
  CheckCircle2,
  Gauge,
  Timer,
  TrendingUp,
  Wallet,
} from '@/design-system/icons';
import {
  MetricTile,
  onTimeTarget,
  utilizationTarget,
  formatMoney,
  type DetailRequest,
  type TransporterOverview,
} from '@/features/transporter-bi';
import { formatDate } from '@/utils';

/**
 * The six headline numbers of the scope's Business Overview, always visible
 * above the tabs — same calm tile language as the shipper suite (no sparklines
 * fighting truncated captions).
 */

export interface KpiStripProps {
  data?: TransporterOverview;
  /** Sum of invoices past due, for the outstanding tile's alert badge. */
  overdueAmount: number;
  onOpenDetail: (request: DetailRequest | undefined) => void;
}

export function KpiStrip({ data, overdueAmount, onOpenDetail }: KpiStripProps) {
  if (!data) return <KpiStripSkeleton />;

  const { kpis, nextSettlement } = data;
  const utilizationShort = kpis.fleetUtilization.value < utilizationTarget();

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
      <MetricTile
        metric={kpis.fleetUtilization}
        label="Fleet Utilisation"
        icon={<Gauge className="size-4" />}
        subAnalysis={`Target ${(utilizationTarget() * 100).toFixed(0)}.0%`}
        badge={
          utilizationShort
            ? { text: 'below target', intent: 'warning' }
            : { text: 'on target', intent: 'good' }
        }
        shape="none"
        onClick={() => onOpenDetail(kpis.fleetUtilization.detail)}
      />
      <MetricTile
        metric={kpis.idleFleet}
        label="Idle Fleet"
        icon={<Timer className="size-4" />}
        subAnalysis="Vehicle-days idle"
        shape="none"
        onClick={() => onOpenDetail(kpis.idleFleet.detail)}
      />
      <MetricTile
        metric={kpis.totalEarnings}
        label="Total Earnings"
        // A banknote, not a dollar sign: the figure beneath it is in francs.
        icon={<Banknote className="size-4" />}
        subAnalysis={kpis.totalEarnings.caption ?? 'Completed trips'}
        shape="none"
        onClick={() => onOpenDetail(kpis.totalEarnings.detail)}
      />
      <MetricTile
        metric={kpis.earningsPerTrip}
        label="Earnings / Trip"
        icon={<TrendingUp className="size-4" />}
        subAnalysis="Avg trip economics"
        shape="none"
        onClick={() => onOpenDetail(kpis.earningsPerTrip.detail)}
      />
      <MetricTile
        metric={kpis.onTimeRate}
        label="On-Time Rate"
        icon={<CheckCircle2 className="size-4" />}
        subAnalysis={`SLA Target: ${(onTimeTarget() * 100).toFixed(1)}%`}
        shape="none"
        onClick={() => onOpenDetail(kpis.onTimeRate.detail)}
      />
      <MetricTile
        metric={kpis.outstandingPayments}
        label="Outstanding Payments"
        icon={<Wallet className="size-4" />}
        subAnalysis={
          nextSettlement
            ? `Next ${formatDate(nextSettlement.date, 'date')}`
            : 'No settlement queued'
        }
        badge={
          overdueAmount > 0
            ? { text: `${formatMoney(overdueAmount)} overdue`, intent: 'critical' }
            : undefined
        }
        shape="none"
        onClick={() => onOpenDetail(kpis.outstandingPayments.detail)}
      />
    </div>
  );
}

function KpiStripSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
      {[1, 2, 3, 4, 5, 6].map((tile) => (
        <Card key={tile} variant="default" padding="lg" className="min-h-[122px] gap-3">
          <Skeleton shape="text" className="h-4 w-20" />
          <Skeleton shape="text" className="h-8 w-16" />
        </Card>
      ))}
    </div>
  );
}
