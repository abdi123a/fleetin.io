import { Card, Skeleton } from '@/design-system';
import {
  CheckCircle2,
  ContainerIcon,
  DollarSign,
  Package,
  TrendingUp,
  Truck,
} from '@/design-system/icons';
import type { DrillDown, OverviewSection as OverviewData } from '@/features/shipper-bi/contracts';
import { MetricTile } from '@/features/shipper-bi/sections/cards/MetricTile';

export interface KpiStripProps {
  data?: OverviewData;
  onDrillDown: (drillDown: DrillDown | undefined) => void;
}

export function KpiStrip({ data, onDrillDown }: KpiStripProps) {
  if (!data) return <KpiStripSkeleton />;

  const { kpis } = data;
  const overdueReturns = data.returnHeadroom.find((slice) => slice.key === 'overdue');

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
      <MetricTile
        metric={kpis.totalShipments}
        label="Total Shipments"
        icon={<Package className="size-4" />}
        subAnalysis={`${(kpis.totalShipments.value / 30).toFixed(1)} loads / day avg`}
        shape="none"
        onClick={() => onDrillDown(kpis.totalShipments.drillDown)}
      />
      <MetricTile
        metric={kpis.onTimeRate}
        label="On-Time Delivery Rate"
        icon={<CheckCircle2 className="size-4" />}
        subAnalysis="SLA Target: 90.0%"
        shape="none"
        onClick={() => onDrillDown(kpis.onTimeRate.drillDown)}
      />
      <MetricTile
        metric={kpis.totalCost}
        label="Total Cost"
        icon={<DollarSign className="size-4" />}
        subAnalysis="Freight & fees"
        shape="none"
        onClick={() => onDrillDown(kpis.totalCost.drillDown)}
      />
      <MetricTile
        metric={kpis.activeShipments}
        label="Active Shipments"
        icon={<Truck className="size-4" />}
        subAnalysis="In-transit & gate-in"
        shape="none"
        onClick={() => onDrillDown(kpis.activeShipments.drillDown)}
      />
      <MetricTile
        metric={kpis.emptyReturnPending}
        label="Empty Return Pending"
        icon={<ContainerIcon className="size-4" />}
        subAnalysis={overdueReturns?.value ? `${overdueReturns.value} past free time` : 'All in free time'}
        badge={
          overdueReturns?.value
            ? { text: `${overdueReturns.value} overdue`, intent: 'critical' }
            : undefined
        }
        shape="none"
        onClick={() => onDrillDown(kpis.emptyReturnPending.drillDown)}
      />
      <MetricTile
        metric={kpis.costPerShipment}
        label="Cost / Shipment"
        icon={<TrendingUp className="size-4" />}
        subAnalysis="Avg load economics"
        shape="none"
        onClick={() => onDrillDown(kpis.costPerShipment.drillDown)}
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
