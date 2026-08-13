import { useMemo, useState } from 'react';
import { AlertTriangle, Container, DollarSign, RotateCcw, TrendingUp } from '@/design-system/icons';
import { Card, IconChip, Skeleton } from '@/design-system';
import { ChartCard, ChartHoverPortal, TrendChart, X_AXIS_HEIGHT } from '@/features/shipper-bi/charts';
import { ContainerFreeTimeCard } from '@/features/shipper-bi/sections/cards/ContainerFreeTimeCard';
import type { BiFilters, CategorySlice, DrillDown } from '@/features/shipper-bi/contracts';
import { formatCompact, formatCurrencyFull } from '@/features/shipper-bi/format';
import type { ShipmentFact } from '@/lib/bi/derive';
import { cn } from '@/utils';
import { buildTrendSeries } from '../analyticsConfig';

const TREND_PLOT_HEIGHT = 220;

export interface EmptyReturnSectionProps {
  facts: ShipmentFact[];
  filters: BiFilters;
  /** Free-time headroom for containers still out — undefined only for the first tick. */
  returnHeadroom?: CategorySlice[];
  onDrillDown: (drillDown: DrillDown | undefined) => void;
}

/**
 * Containers — how much free time is left, how long the cycle takes, and what
 * running late costs.
 */
export function EmptyReturnSection({
  facts,
  filters,
  returnHeadroom,
  onDrillDown,
}: EmptyReturnSectionProps) {
  const returnData = useMemo(() => buildEmptyReturnData(facts), [facts]);

  const cycleTrend = useMemo(
    () =>
      buildTrendSeries({
        facts,
        filters,
        // A cycle is finished on the day the container comes back.
        dateOf: (fact) => fact.returnedAt,
        valueOf: (fact) => fact.emptyReturnCycleDays,
        aggregate: 'mean',
      }),
    [facts, filters],
  );

  if (!returnData) return <EmptyReturnSkeleton />;

  return (
    <div className="flex flex-col gap-5">
      {/* Free-time urgency — which containers need a call, and how long is left */}
      <ContainerFreeTimeCard
        returnHeadroom={returnHeadroom}
        onOpenReturns={() => onDrillDown({ title: 'Container Free Time & Returns', filters: {} })}
      />

      {/* How long the cycle takes */}
      <ChartCard
        title="Empty return cycle time"
        subtitle={`${returnData.medianCycleDays.toFixed(1)}d median · ${(returnData.onTimeReturnRate * 100).toFixed(1)}% returned within free time`}
        icon={<RotateCcw className="size-4" />}
        isEmpty={cycleTrend.points.every((point) => point.v === 0)}
        emptyMessage="No containers returned in this period."
        bodyHeight={TREND_PLOT_HEIGHT + X_AXIS_HEIGHT}
        tableRows={cycleTrend.points}
        tableColumns={[
          {
            key: 't',
            header: 'Period',
            align: 'left',
            render: (row) => cycleTrend.formatBucket(row.t),
          },
          { key: 'v', header: 'Average cycle days', render: (row) => `${row.v}d` },
        ]}
      >
        <TrendChart
          series={[{ key: 'cycle', label: 'Cycle days', points: cycleTrend.points }]}
          formatValue={(value) => `${value}d`}
          formatBucket={cycleTrend.formatBucket}
          height={TREND_PLOT_HEIGHT}
        />
      </ChartCard>

      {/* What running late costs */}
      <ChartCard
        title="What a late return costs"
        subtitle="Detention and demurrage against days past free time"
        icon={<Container className="size-4" />}
        isEmpty={returnData.costImpact.length === 0}
        emptyMessage="No containers went past their free time in this period."
        bodyHeight={380}
        tableRows={returnData.costImpact}
        tableColumns={[
          { key: 'reference', header: 'Shipment', align: 'left', render: (row) => row.reference },
          { key: 'x', header: 'Days late', render: (row) => `${row.x}d` },
          { key: 'y', header: 'Penalty charges', render: (row) => formatCurrencyFull(row.y) },
        ]}
      >
        <CostImpactScatter
          points={returnData.costImpact}
          onSelect={(point) =>
            onDrillDown({ title: `Shipment ${point.reference}`, filters: {} })
          }
        />
      </ChartCard>
    </div>
  );
}

export interface CostImpactPoint {
  key: string;
  reference: string;
  /** Days past free time. */
  x: number;
  /** Penalty charges incurred. */
  y: number;
}

/**
 * Days-late against money with executive metrics, escalation bands, and shaded slope fill.
 */
function CostImpactScatter({
  points,
  onSelect,
}: {
  points: CostImpactPoint[];
  onSelect: (point: CostImpactPoint) => void;
}) {
  const [hoveredPoint, setHoveredPoint] = useState<CostImpactPoint | null>(null);
  const [hoverAnchor, setHoverAnchor] = useState<DOMRect | null>(null);

  const maxX = useMemo(() => Math.max(...points.map((p) => p.x), 1), [points]);
  const maxY = useMemo(() => Math.max(...points.map((p) => p.y), 1), [points]);
  const totalPenalty = useMemo(() => points.reduce((sum, p) => sum + p.y, 0), [points]);
  const fit = useMemo(() => leastSquaresFit(points), [points]);
  const criticalCount = useMemo(() => points.filter((p) => p.x > 7).length, [points]);

  /**
   * Smart collision resolution for overlapping container points on the timeline.
   * If points land on top of each other, offset them in a small flower ring.
   */
  const pointsWithOffsets = useMemo(() => {
    const thresholdX = 0.018; // ~1.8% width proximity
    const thresholdY = 0.025; // ~2.5% height proximity

    const clusters: CostImpactPoint[][] = [];

    for (const pt of points) {
      const normX = pt.x / maxX;
      const normY = pt.y / maxY;

      let added = false;
      for (const cluster of clusters) {
        const rep = cluster[0];
        if (!rep) continue;
        const repX = rep.x / maxX;
        const repY = rep.y / maxY;
        if (Math.abs(normX - repX) < thresholdX && Math.abs(normY - repY) < thresholdY) {
          cluster.push(pt);
          added = true;
          break;
        }
      }
      if (!added) {
        clusters.push([pt]);
      }
    }

    const offsetMap = new Map<string, { dx: number; dy: number }>();

    for (const cluster of clusters) {
      const size = cluster.length;
      cluster.forEach((pt, i) => {
        if (size === 1) {
          offsetMap.set(pt.key, { dx: 0, dy: 0 });
        } else {
          const angle = (i * (2 * Math.PI)) / size - Math.PI / 2;
          const radius = Math.min(14, 6 + size * 1.5);
          const dx = Math.round(Math.cos(angle) * radius);
          const dy = Math.round(Math.sin(angle) * radius);
          offsetMap.set(pt.key, { dx, dy });
        }
      });
    }

    return points.map((pt) => ({
      ...pt,
      offset: offsetMap.get(pt.key) ?? { dx: 0, dy: 0 },
    }));
  }, [points, maxX, maxY]);

  const yTicks = [0, 0.25, 0.5, 0.75, 1];
  const xTicks = [0, 0.25, 0.5, 0.75, 1];

  const y1Pct = fit ? Math.min(100, Math.max(0, (fit.intercept / maxY) * 100)) : 0;
  const y2Pct = fit ? Math.min(100, Math.max(0, ((fit.intercept + fit.slope * maxX) / maxY) * 100)) : 0;

  return (
    <div className="flex flex-col gap-4 py-1">
      {/* Executive Summary Metrics Strip */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-surface-sunken/40 px-3.5 py-2.5">
          <IconChip icon={DollarSign} tint="red" size={36} />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total Penalty Fees</p>
            <p className="text-sm font-extrabold tabular-nums text-foreground">{formatCurrencyFull(totalPenalty)}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-surface-sunken/40 px-3.5 py-2.5">
          <IconChip icon={TrendingUp} size={36} />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Escalation Rate</p>
            <p className="text-sm font-extrabold tabular-nums text-foreground">
              {fit ? `+${formatCurrencyFull(Math.max(0, fit.slope))}/day` : '—'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-surface-sunken/40 px-3.5 py-2.5">
          <IconChip icon={AlertTriangle} tint="amber" size={36} />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Critical Overdue (&gt;7d)</p>
            <p className="text-sm font-extrabold tabular-nums text-foreground">{criticalCount} containers</p>
          </div>
        </div>
      </div>

      {/* Main Chart Area */}
      <div className="relative h-[230px] w-full overflow-visible pl-16 pr-4 pt-4">
        {/* Background Escalation Severity Tiers */}
        <div className="pointer-events-none absolute inset-0 pb-6 pl-16 pr-4 pt-4">
          <div className="relative size-full overflow-hidden rounded-md border border-border/40 bg-surface-sunken/20">
            {/* 0-3 days zone: Standard */}
            <div
              className="absolute inset-y-0 left-0 border-r border-dashed border-border/40 bg-success/[0.03]"
              style={{ width: `${Math.min(100, (3 / maxX) * 100)}%` }}
            >
              <span className="absolute left-2 top-1.5 text-[9px] font-bold uppercase tracking-wider text-success-subtle-foreground">
                Standard (1-3d)
              </span>
            </div>
            {/* 3-7 days zone: Elevated */}
            {maxX > 3 && (
              <div
                className="absolute inset-y-0 border-r border-dashed border-border/40 bg-warning/[0.04]"
                style={{
                  left: `${(3 / maxX) * 100}%`,
                  width: `${Math.min(100 - (3 / maxX) * 100, ((7 - 3) / maxX) * 100)}%`,
                }}
              >
                <span className="absolute left-2 top-1.5 text-[9px] font-bold uppercase tracking-wider text-warning-subtle-foreground">
                  Elevated (4-7d)
                </span>
              </div>
            )}
            {/* 7+ days zone: Critical */}
            {maxX > 7 && (
              <div
                className="absolute inset-y-0 right-0 bg-destructive/[0.05]"
                style={{ left: `${(7 / maxX) * 100}%` }}
              >
                <span className="absolute left-2 top-1.5 text-[9px] font-bold uppercase tracking-wider text-destructive-subtle-foreground">
                  Critical (&gt;7d)
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Grid lines & Y-axis labels */}
        <div className="relative size-full">
          {yTicks.map((tick) => (
            <div
              key={tick}
              className="absolute inset-x-0 flex items-center"
              style={{ bottom: `${tick * 100}%` }}
            >
              <span className="absolute -left-16 w-14 text-right text-[10px] font-medium tabular-nums text-muted-foreground">
                {formatCompact(maxY * tick)}
              </span>
              <span className="h-px w-full bg-border/40" />
            </div>
          ))}

          {/* SVG Trend Area Fill & Line */}
          {fit && (
            <svg
              className="pointer-events-none absolute inset-0 size-full overflow-visible"
              aria-hidden
              preserveAspectRatio="none"
              viewBox="0 0 100 100"
            >
              <defs>
                <linearGradient id="cost-trend-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              {/* Shaded Area under trend slope */}
              <polygon
                points={`0,100 0,${100 - y1Pct} 100,${100 - y2Pct} 100,100`}
                fill="url(#cost-trend-fill)"
              />
              {/* Trend Line */}
              <line
                x1={0}
                y1={100 - y1Pct}
                x2={100}
                y2={100 - y2Pct}
                stroke="var(--color-primary)"
                strokeWidth={2}
                strokeDasharray="4 3"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          )}

          {/* Data Points (Containers with Cluster Offsets) */}
          {pointsWithOffsets.map((point) => {
            const displayDays = Math.round(point.x);
            const isCritical = point.x > 7;
            const isElevated = point.x > 3 && point.x <= 7;
            const isHovered = hoveredPoint?.key === point.key;

            const colorClass = isCritical
              ? 'bg-destructive shadow-destructive/40'
              : isElevated
                ? 'bg-warning shadow-warning/40'
                : 'bg-primary shadow-primary/40';

            return (
              <div
                key={point.key}
                className="absolute transition-transform duration-150"
                style={{
                  left: `${(point.x / maxX) * 100}%`,
                  bottom: `${(point.y / maxY) * 100}%`,
                  transform: `translate(calc(-50% + ${point.offset.dx}px), calc(50% + ${point.offset.dy}px))`,
                  zIndex: isHovered ? 50 : 10,
                }}
              >
                {/* Pulse effect for critical overdue containers */}
                {isCritical && (
                  <span className="animate-ping motion-reduce:animate-none absolute inset-0 size-3 rounded-full bg-destructive opacity-40" />
                )}

                <button
                  type="button"
                  onClick={() => onSelect(point)}
                  onMouseEnter={(e) => {
                    setHoveredPoint(point);
                    setHoverAnchor(e.currentTarget.getBoundingClientRect());
                  }}
                  onMouseLeave={() => {
                    setHoveredPoint(null);
                    setHoverAnchor(null);
                  }}
                  title={`${point.reference}: ${displayDays}d late, ${formatCurrencyFull(point.y)}`}
                  aria-label={`${point.reference}, ${displayDays} days late, ${formatCurrencyFull(point.y)}`}
                  className={cn(
                    'relative size-3 rounded-full border-2 border-background shadow-xs transition duration-200 focus-visible:outline-none',
                    colorClass,
                    isHovered ? 'scale-150 ring-2 ring-primary' : 'hover:scale-130',
                  )}
                />
              </div>
            );
          })}
        </div>
      </div>

      <ChartHoverPortal open={Boolean(hoveredPoint)} anchor={hoverAnchor}>
        {hoveredPoint ? (
          <div className="min-w-[165px] rounded-lg border border-border bg-surface p-3 shadow-xl">
            <div className="mb-1.5 flex items-center justify-between gap-2 border-b border-border/50 pb-1.5">
              <span className="text-[11px] font-bold text-foreground">{hoveredPoint.reference}</span>
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[9px] font-extrabold uppercase',
                  hoveredPoint.x > 7
                    ? 'bg-destructive-subtle text-destructive-subtle-foreground'
                    : hoveredPoint.x > 3
                      ? 'bg-warning-subtle text-warning-subtle-foreground'
                      : 'bg-primary/15 text-primary',
                )}
              >
                {Math.round(hoveredPoint.x)}d Overdue
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-3 text-[10px]">
                <span className="text-muted-foreground">Penalty Charge</span>
                <span className="font-extrabold tabular-nums text-destructive">
                  {formatCurrencyFull(hoveredPoint.y)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 text-[10px]">
                <span className="text-muted-foreground">Avg Fee / Day</span>
                <span className="font-semibold tabular-nums text-foreground">
                  {formatCurrencyFull(Math.round(hoveredPoint.y / Math.max(1, hoveredPoint.x)))}/d
                </span>
              </div>
            </div>
          </div>
        ) : null}
      </ChartHoverPortal>

      {/* X-axis labels & Caption */}
      <div className="relative mt-2 pl-16 pr-4">
        <div className="flex justify-between border-t border-border/60 pt-1.5">
          {xTicks.map((tick) => (
            <span key={tick} className="text-[10px] font-semibold tabular-nums text-muted-foreground">
              {Math.round(maxX * tick)}d overdue
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Ordinary least squares through the cloud.
 *
 * Returns null when there is nothing a line could honestly describe — fewer
 * than three points, or no spread in x (every container the same days late),
 * where the "trend" would be an artefact of two points rather than a finding.
 */
function leastSquaresFit(points: CostImpactPoint[]): { slope: number; intercept: number } | null {
  if (points.length < 3) return null;

  const n = points.length;
  const meanX = points.reduce((sum, p) => sum + p.x, 0) / n;
  const meanY = points.reduce((sum, p) => sum + p.y, 0) / n;

  let covariance = 0;
  let varianceX = 0;
  for (const point of points) {
    covariance += (point.x - meanX) * (point.y - meanY);
    varianceX += (point.x - meanX) ** 2;
  }
  if (varianceX === 0) return null;

  const slope = covariance / varianceX;
  return { slope, intercept: meanY - slope * meanX };
}

function EmptyReturnSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <Card variant="default" padding="lg" className="gap-4">
        <Skeleton shape="text" className="h-4 w-40" />
        <Skeleton shape="block" className="h-40 w-full" />
      </Card>
      <Card variant="default" padding="lg" className="gap-4">
        <Skeleton shape="text" className="h-4 w-32" />
        <Skeleton shape="block" className="h-48 w-full" />
      </Card>
    </div>
  );
}

function buildEmptyReturnData(facts: ShipmentFact[]) {
  const containers = facts.filter((f) => f.containerId);
  if (containers.length === 0) return null;

  const cycleDays = containers
    .map((f) => f.emptyReturnCycleDays)
    .filter((d): d is number => d !== undefined)
    .sort((a, b) => a - b);
  const medianCycleDays =
    cycleDays.length > 0 ? (cycleDays[Math.floor(cycleDays.length / 2)] ?? 0) : 0;

  const onTimeCount = containers.filter((f) => f.emptyReturnOverdueDays === 0).length;
  const onTimeReturnRate = containers.length > 0 ? onTimeCount / containers.length : 0;

  const costImpact: CostImpactPoint[] = containers
    .filter((f) => f.emptyReturnOverdueDays > 0)
    .map((f) => ({
      key: f.shipmentId,
      reference: f.reference,
      x: f.emptyReturnOverdueDays,
      // Only the penalties a late return actually causes, not the whole
      // accessorial bill — fuel surcharges do not grow because a box sat.
      y: (f.costByType.detention ?? 0) + (f.costByType.demurrage ?? 0),
    }))
    .filter((point) => point.y > 0)
    .sort((a, b) => b.y - a.y)
    .slice(0, 60);

  return { medianCycleDays, onTimeReturnRate, costImpact };
}
