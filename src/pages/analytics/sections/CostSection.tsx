import { useMemo, useState } from 'react';
import { Receipt, Wallet } from '@/design-system/icons';
import { Card, Skeleton } from '@/design-system';
import { TablePager, usePagedRows } from '@/components';
import { bucketLabel, chooseGranularity } from '@/lib/bi/time';
import { CategoryBarChart, ChartCard, TrendChart, X_AXIS_HEIGHT } from '@/features/shipper-bi/charts';
import { RankedBarList } from '../components/RankedBarList';
import { SpendOverviewCard } from '@/features/shipper-bi/sections/cards/SpendOverviewCard';
import type {
  BiDataset,
  BiFilters,
  CategorySlice,
  DrillDown,
  OverviewSection as OverviewData,
} from '@/features/shipper-bi/contracts';
import { formatCompact, formatCurrencyFull } from '@/features/shipper-bi/format';
import type { ShipmentFact } from '@/lib/bi/derive';

const CATEGORY_ROW_HEIGHT = 34;
const TREND_PLOT_HEIGHT = 208;

export interface CostSectionProps {
  facts: ShipmentFact[];
  dataset: BiDataset;
  /** The real, filtered aggregation — undefined only for the first tick before it loads. */
  overview?: OverviewData;
  filters: BiFilters;
  onDrillDown: (drillDown: DrillDown | undefined) => void;
}

/**
 * Cost Analytics — what the freight cost, and why.
 *
 * Spend over time leads (the real, filter-aware trend), then the two cuts that
 * explain it — by cargo type and by charge type — then the line-item detail
 * for detention and demurrage. Cost by transporter and the cost of a late
 * empty return live with their own subjects, in Transporter Performance and
 * Containers & Empty Return, rather than repeating here.
 */
export function CostSection({ facts, dataset, overview, filters, onDrillDown }: CostSectionProps) {
  const [cargoSeries, setCargoSeries] = useState('blended');

  const granularity = chooseGranularity({ from: filters.from, to: filters.to });
  const formatBucket = (key: string) => bucketLabel(key, granularity);

  const costData = useMemo(() => buildCostData(facts), [facts]);
  const detentionRows = useMemo(() => buildDetentionRows(facts, dataset), [facts, dataset]);
  const [detentionPageSize, setDetentionPageSize] = useState(25);
  const pagedDetention = usePagedRows(detentionRows, { pageSize: detentionPageSize });

  if (!costData) return <CostSkeleton />;

  const cargoPlotHeight = overview ? Math.max(120, overview.costByCargoType.length * CATEGORY_ROW_HEIGHT) : 120;

  return (
    <div className="flex flex-col gap-5">
      {/* Spend over time — the real, period-aware trend */}
      {overview ? (
        <SpendOverviewCard
          total={overview.kpis.totalCost}
          buckets={overview.spendByBucket}
          from={filters.from}
          to={filters.to}
          onDrillDown={(metric) => onDrillDown(metric.drillDown)}
        />
      ) : (
        <SpendCardSkeleton />
      )}

      {/* Cost by cargo type */}
      <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-2">
        {overview ? (
          <ChartCard
            title="Average cost per cargo type"
            subtitle="A per-category metric has no single value"
            icon={<Wallet className="size-4" />}
            className="h-full"
            isEmpty={overview.costByCargoType.length === 0}
            bodyHeight={cargoPlotHeight + X_AXIS_HEIGHT}
            tableRows={overview.costByCargoType}
            tableColumns={[
              { key: 'label', header: 'Cargo type', align: 'left', render: (row) => row.label },
              {
                key: 'value',
                header: 'Average cost',
                render: (row) => formatCurrencyFull(row.value),
              },
            ]}
          >
            <CategoryBarChart
              slices={overview.costByCargoType}
              formatValue={(value) => formatCompact(value)}
              valueLabel="Average cost"
              onSelect={(slice: CategorySlice) => onDrillDown(slice.drillDown)}
              height={cargoPlotHeight}
            />
          </ChartCard>
        ) : (
          <ChartSkeletonCard />
        )}

        {overview ? (
          <ChartCard
            title="Cost trend by cargo type"
            subtitle={
              filters.compare
                ? 'Solid is this period; dashed is the window before it'
                : 'Average cost per shipment over time'
            }
            icon={<Wallet className="size-4" />}
            className="h-full"
            isEmpty={overview.costByCargoTypeTrend.length === 0}
            bodyHeight={TREND_PLOT_HEIGHT + X_AXIS_HEIGHT}
            actions={
              <select
                value={cargoSeries}
                onChange={(event) => setCargoSeries(event.target.value)}
                aria-label="Cargo type to plot"
                className="h-8 max-w-28 rounded-md border border-border bg-surface px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {overview.costByCargoTypeTrend.map((series) => (
                  <option key={series.key} value={series.key}>
                    {series.label}
                  </option>
                ))}
              </select>
            }
            tableRows={overview.costByCargoTypeTrend.find((s) => s.key === cargoSeries)?.points ?? []}
            tableColumns={[
              { key: 't', header: 'Period', align: 'left', render: (row) => formatBucket(row.t) },
              { key: 'v', header: 'Average cost', render: (row) => formatCurrencyFull(row.v) },
            ]}
          >
            <TrendChart
              series={overview.costByCargoTypeTrend}
              visibleKeys={[cargoSeries]}
              formatValue={(value) => formatCompact(value)}
              formatBucket={formatBucket}
              height={TREND_PLOT_HEIGHT}
            />
          </ChartCard>
        ) : (
          <ChartSkeletonCard />
        )}
      </div>

      {/* What the total is made of */}
      <ChartCard
        title="Cost breakdown"
        subtitle={`How ${formatCurrencyFull(costData.total)} splits between freight and penalties`}
        icon={<Receipt className="size-4" />}
        isEmpty={costData.costBreakdown.length === 0}
        tableRows={costData.costBreakdown}
        tableColumns={[
          { key: 'label', header: 'Charge', align: 'left', render: (row) => row.label },
          { key: 'value', header: 'Amount', render: (row) => formatCurrencyFull(row.value) },
          {
            key: 'share',
            header: 'Share',
            render: (row) =>
              costData.total === 0 ? '—' : `${((row.value / costData.total) * 100).toFixed(1)}%`,
          },
        ]}
      >
        <RankedBarList
          rows={costData.costBreakdown}
          showShare
          formatValue={(value) => formatCurrencyFull(value)}
          onSelect={(row) => onDrillDown({ title: `${row.label} cost`, filters: {} })}
        />
      </ChartCard>

      {/* Detention and demurrage */}
      <ChartCard
        title="Detention and demurrage"
        subtitle="Charges by shipment and transporter"
        icon={<Receipt className="size-4" />}
        isEmpty={detentionRows.length === 0}
        emptyMessage="No detention or demurrage charges in this period."
        tableRows={detentionRows}
        tableColumns={[
          { key: 'reference', header: 'Shipment', align: 'left', render: (row) => row.reference },
          { key: 'transporter', header: 'Transporter', align: 'left', render: (row) => row.transporter },
          { key: 'containerNo', header: 'Container', align: 'left', render: (row) => row.containerNo ?? '—' },
          { key: 'chargeType', header: 'Charge type', align: 'left', render: (row) => row.chargeType },
          { key: 'amount', header: 'Amount', render: (row) => formatCurrencyFull(row.amount) },
        ]}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-4">Shipment</th>
                <th className="py-2 pr-4">Transporter</th>
                <th className="py-2 pr-4">Container</th>
                <th className="py-2 pr-4">Charge type</th>
                <th className="py-2">Amount</th>
              </tr>
            </thead>
            <tbody>
              {pagedDetention.rows.map((row) => (
                <tr key={`${row.shipmentId}-${row.chargeType}`} className="border-b border-border/60 last:border-0">
                  <td className="py-2.5 pr-4 font-medium text-foreground">{row.reference}</td>
                  <td className="py-2.5 pr-4 text-muted-foreground">{row.transporter}</td>
                  <td className="py-2.5 pr-4 text-muted-foreground">{row.containerNo ?? '—'}</td>
                  <td className="py-2.5 pr-4 text-muted-foreground">{row.chargeType}</td>
                  <td className="py-2.5 text-muted-foreground">{formatCurrencyFull(row.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {detentionRows.length > 0 ? (
          <TablePager
            paged={pagedDetention}
            noun="charges"
            pageSize={detentionPageSize}
            onPageSizeChange={setDetentionPageSize}
          />
        ) : null}
      </ChartCard>
    </div>
  );
}

function CostSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <SpendCardSkeleton />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ChartSkeletonCard />
        <ChartSkeletonCard />
      </div>
      <Card variant="default" padding="lg" className="gap-4">
        <Skeleton shape="text" className="h-4 w-32" />
        <Skeleton shape="block" className="h-40 w-full" />
      </Card>
    </div>
  );
}

function SpendCardSkeleton() {
  return (
    <Card variant="default" padding="lg" className="gap-4">
      <Skeleton shape="text" className="h-4 w-32" />
      <Skeleton shape="text" className="h-8 w-40" />
      <Skeleton shape="block" className="h-40 w-full" />
    </Card>
  );
}

function ChartSkeletonCard() {
  return (
    <Card variant="default" padding="lg" className="gap-4">
      <Skeleton shape="text" className="h-4 w-32" />
      <Skeleton shape="block" className="h-48 w-full" />
    </Card>
  );
}

function buildCostData(facts: ShipmentFact[]) {
  if (facts.length === 0) return null;

  const totalCost = facts.reduce((sum, f) => sum + f.costTotal, 0);
  const accessorial = facts.reduce((sum, f) => sum + f.accessorialCost, 0);
  const detention = facts.reduce((sum, f) => sum + (f.costByType.detention ?? 0), 0);
  const demurrage = facts.reduce((sum, f) => sum + (f.costByType.demurrage ?? 0), 0);

  return {
    total: totalCost,
    costBreakdown: [
      { key: 'base', label: 'Transport tariff', value: totalCost - accessorial },
      { key: 'detention', label: 'Detention', value: detention },
      { key: 'demurrage', label: 'Demurrage', value: demurrage },
      { key: 'other', label: 'Other charges', value: accessorial - detention - demurrage },
    ]
      // A charge type nobody was billed for is not a zero row worth drawing.
      .filter((row) => row.value > 0)
      .sort((a, b) => b.value - a.value),
  };
}

function buildDetentionRows(facts: ShipmentFact[], dataset: BiDataset) {
  return facts
    .filter((f) => (f.costByType.detention ?? 0) > 0 || (f.costByType.demurrage ?? 0) > 0)
    .slice(0, 20)
    .flatMap((f) => {
      const rows: Array<{
        shipmentId: string;
        reference: string;
        transporter: string;
        containerNo?: string;
        chargeType: string;
        amount: number;
      }> = [];
      const transporter = dataset.transporters.find((t) => t.id === f.transporterId)?.name ?? f.transporterId;
      const container = dataset.containers.find((c) => c.id === f.containerId);
      if ((f.costByType.detention ?? 0) > 0) {
        rows.push({
          shipmentId: f.shipmentId,
          reference: f.reference,
          transporter,
          containerNo: container?.containerNo,
          chargeType: 'Detention',
          amount: f.costByType.detention ?? 0,
        });
      }
      if ((f.costByType.demurrage ?? 0) > 0) {
        rows.push({
          shipmentId: f.shipmentId,
          reference: f.reference,
          transporter,
          containerNo: container?.containerNo,
          chargeType: 'Demurrage',
          amount: f.costByType.demurrage ?? 0,
        });
      }
      return rows;
    });
}
