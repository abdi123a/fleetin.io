import { useMemo, useState } from 'react';
import { Truck } from '@/design-system/icons';
import { Card, Skeleton } from '@/design-system';
import { TablePager, usePagedRows } from '@/components';
import { ChartCard, ChartHoverPortal } from '@/features/shipper-bi/charts';
import { FleetSpotlightCard } from '@/features/shipper-bi/sections/cards/FleetSpotlightCard';
import type {
  BiDataset,
  DrillDown,
  SpotlightTransporter,
} from '@/features/shipper-bi/contracts';
import { formatCompact, formatCurrencyFull } from '@/features/shipper-bi/format';
import type { ShipmentFact } from '@/lib/bi/derive';
import { cn } from '@/utils';

export interface PerformanceSectionProps {
  facts: ShipmentFact[];
  dataset: BiDataset;
  /** Top transporters by volume, for the spotlight carousel — undefined only for the first tick. */
  spotlightTransporters?: SpotlightTransporter[];
  onDrillDown: (drillDown: DrillDown | undefined) => void;
}

/**
 * Transporters — who is carrying your freight, and how well.
 *
 * **One table, one plot, one contact card.** This section used to be four cards
 * over the same set of transporters: the leaderboard, a cost-vs-reliability
 * quadrant whose x and y axes were two of the leaderboard's own columns, a
 * "cost by transporter" list that was a third column, and the spotlight.
 *
 * The list is now the leaderboard's `Total cost` column, which is where a
 * reader was already comparing it against volume and on-time rate. The quadrant
 * stays because a scatter answers something a sorted table cannot — who is
 * expensive *and* unreliable — and it is now built from the table's rows rather
 * than a parallel computation.
 */
export function PerformanceSection({
  facts,
  dataset,
  spotlightTransporters,
  onDrillDown,
}: PerformanceSectionProps) {
  const performance = useMemo(() => buildPerformanceData(facts, dataset), [facts, dataset]);

  /* Declared above the early return — a hook cannot sit behind a condition.
     Rows carry their own `rank`, so a page 2 row still prints rank 26. */
  const [pageSize, setPageSize] = useState(25);
  const pagedLeaderboard = usePagedRows(performance?.leaderboard ?? [], { pageSize });

  if (!performance) return <PerformanceSkeleton />;

  const { leaderboard, maxCost } = performance;

  return (
    <div className="flex flex-col gap-5">
      {/* The ranking, with the money in the same row as the service */}
      <ChartCard
        title="Transporter ranking"
        subtitle="Ranked by on-time rate, then delay rate, then volume"
        icon={<Truck className="size-4" />}
        isEmpty={leaderboard.length === 0}
        tableRows={leaderboard}
        tableColumns={[
          { key: 'rank', header: 'Rank', align: 'left', render: (row) => row.rank },
          { key: 'name', header: 'Transporter', align: 'left', render: (row) => row.name },
          { key: 'shipments', header: 'Shipments', render: (row) => formatCompact(row.shipments) },
          {
            key: 'onTimeRate',
            header: 'On-time rate',
            render: (row) => `${(row.onTimeRate * 100).toFixed(1)}%`,
          },
          {
            key: 'delayRate',
            header: 'Delay rate',
            render: (row) => `${(row.delayRate * 100).toFixed(1)}%`,
          },
          {
            key: 'costPerShipment',
            header: 'Cost / shipment',
            render: (row) => formatCurrencyFull(row.costPerShipment),
          },
          { key: 'totalCost', header: 'Total cost', render: (row) => formatCurrencyFull(row.totalCost) },
        ]}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-4">Rank</th>
                <th className="py-2 pr-4">Transporter</th>
                <th className="py-2 pr-4 text-right">Shipments</th>
                <th className="py-2 pr-4 text-right">On-time rate</th>
                <th className="py-2 pr-4 text-right">Delay rate</th>
                <th className="py-2 pr-4 text-right">Cost / shipment</th>
                <th className="py-2 text-right">Total cost</th>
              </tr>
            </thead>
            <tbody>
              {pagedLeaderboard.rows.map((row) => (
                <tr
                  key={row.transporterId}
                  className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-surface-sunken"
                  onClick={() =>
                    onDrillDown({
                      title: `${row.name} performance`,
                      filters: { transporterIds: [row.transporterId] },
                    })
                  }
                >
                  <td className="py-2.5 pr-4 font-semibold tabular-nums text-foreground">
                    {row.rank}
                  </td>
                  <td className="py-2.5 pr-4 font-medium text-foreground">{row.name}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums text-muted-foreground">
                    {formatCompact(row.shipments)}
                  </td>
                  <td
                    className={cn(
                      'py-2.5 pr-4 text-right font-medium tabular-nums',
                      row.onTimeRate >= 0.9 ? 'text-success' : 'text-warning-foreground',
                    )}
                  >
                    {(row.onTimeRate * 100).toFixed(1)}%
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums text-muted-foreground">
                    {(row.delayRate * 100).toFixed(1)}%
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums text-muted-foreground">
                    {formatCurrencyFull(row.costPerShipment)}
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-foreground">
                    {formatCurrencyFull(row.totalCost)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {leaderboard.length > 0 ? (
          <TablePager
            paged={pagedLeaderboard}
            noun="transporters"
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
          />
        ) : null}
      </ChartCard>

      {/* Strategic quadrant matrix */}
      <ChartCard
        title="Cost against reliability"
        subtitle="Bottom-right is what you want: cheap and dependable"
        icon={<Truck className="size-4" />}
        isEmpty={leaderboard.length === 0}
        bodyHeight={300}
        tableRows={leaderboard}
        tableColumns={[
          { key: 'name', header: 'Transporter', align: 'left', render: (row) => row.name },
          {
            key: 'onTimeRate',
            header: 'On-time rate',
            render: (row) => `${(row.onTimeRate * 100).toFixed(1)}%`,
          },
          {
            key: 'costPerShipment',
            header: 'Cost / shipment',
            render: (row) => formatCurrencyFull(row.costPerShipment),
          },
        ]}
      >
        <QuadrantMatrix
          leaderboard={leaderboard}
          maxCost={maxCost}
          onDrillDown={onDrillDown}
        />
      </ChartCard>


      {/* A face and a phone number, not just a row */}
      {spotlightTransporters ? (
        <FleetSpotlightCard
          transporters={spotlightTransporters}
          onOpenTransporter={(transporter) =>
            onDrillDown({
              title: transporter.name,
              filters: { transporterIds: [transporter.transporterId] },
            })
          }
        />
      ) : (
        <Card variant="default" padding="lg" className="min-h-64 gap-4">
          <Skeleton shape="text" className="h-4 w-32" />
          <Skeleton shape="block" className="h-40 w-full" />
        </Card>
      )}
    </div>
  );
}

/** "Dubai Express Logistics" -> "DE". Two letters fit the marker; one is ambiguous. */
function initials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '??';
  if (words.length === 1) return (words[0] ?? '').slice(0, 2);
  return `${(words[0] ?? '').charAt(0)}${(words[1] ?? '').charAt(0)}`;
}

/**
 * A premium 4-zone strategic quadrant chart.
 * Zones are split on the medians (not midpoints), so there are always two
 * halves regardless of how clustered the data is.
 */
function QuadrantMatrix({
  leaderboard,
  maxCost,
  onDrillDown,
}: {
  leaderboard: Array<{
    transporterId: string;
    name: string;
    shipments: number;
    onTimeRate: number;
    costPerShipment: number;
    rank: number;
  }>;
  maxCost: number;
  onDrillDown: (drillDown: { title: string; filters: { transporterIds: string[] } }) => void;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoverAnchor, setHoverAnchor] = useState<DOMRect | null>(null);
  const hoveredRow = leaderboard.find((r) => r.transporterId === hoveredId) ?? null;

  const maxShipments = Math.max(...leaderboard.map((r) => r.shipments), 1);

  /**
   * Normalize a value within [min, max] to [PADDING, 1-PADDING] so dots
   * always spread across the full chart area rather than clustering in a corner.
   */
  const PAD = 0.10; // 10% inset from each edge
  const minRate = Math.min(...leaderboard.map((r) => r.onTimeRate));
  const maxRate = Math.max(...leaderboard.map((r) => r.onTimeRate));
  const minCost = Math.min(...leaderboard.map((r) => r.costPerShipment));

  const normX = (rate: number) => {
    if (maxRate === minRate) return 0.5;
    return PAD + ((rate - minRate) / (maxRate - minRate)) * (1 - 2 * PAD);
  };
  const normY = (cost: number) => {
    if (maxCost === minCost) return 0.5;
    return PAD + ((cost - minCost) / (maxCost - minCost)) * (1 - 2 * PAD);
  };

  /**
   * Zone is determined by normalized position vs the 50% threshold so it
   * always matches whichever visual quadrant the dot sits in.
   */
  const zone = (row: { onTimeRate: number; costPerShipment: number }) => {
    const nx = normX(row.onTimeRate);
    const ny = normY(row.costPerShipment);
    const isReliable = nx >= 0.5;   // right half  = reliable
    const isCheap    = ny <= 0.5;   // bottom half = cheap  (low cost norm)
    if (isReliable && isCheap)  return 'sweet'    as const;
    if (isReliable && !isCheap) return 'premium'  as const;
    if (!isReliable && isCheap) return 'watchlist' as const;
    return 'risky' as const;
  };

  const ZONE_COLORS = {
    sweet:     { bg: 'rgba(16,185,129,0.08)',  bubble: '#10b981', ring: 'rgba(16,185,129,0.25)',  text: '#059669' },
    premium:   { bg: 'rgba(245,158,11,0.07)',  bubble: '#f59e0b', ring: 'rgba(245,158,11,0.25)',  text: '#d97706' },
    watchlist: { bg: 'rgba(99,102,241,0.07)',  bubble: '#6366f1', ring: 'rgba(99,102,241,0.25)',  text: '#4f46e5' },
    risky:     { bg: 'rgba(239,68,68,0.07)',   bubble: '#ef4444', ring: 'rgba(239,68,68,0.25)',   text: '#dc2626' },
  };

  const ZONE_LABELS = {
    sweet:     { label: 'Sweet Spot',  sub: 'Cheap & reliable',       corner: 'bottom-right' },
    premium:   { label: 'Premium',     sub: 'Reliable but costly',     corner: 'top-right'    },
    watchlist: { label: 'Watchlist',   sub: 'Cheap but unreliable',    corner: 'bottom-left'  },
    risky:     { label: 'Risky',       sub: 'Expensive & unreliable',  corner: 'top-left'     },
  };

  const ZONE_ICONS = {
    sweet: '✓', premium: '$', watchlist: '⚠', risky: '✕',
  };

  return (
    <div className="relative w-full overflow-visible" style={{ height: 300 }}>

      {/* ── Quadrant background zones — always equal 50/50 split ── */}
      <div className="absolute inset-0 overflow-hidden rounded-lg">
        {/* Top-left: Risky */}
        <div
          className="absolute"
          style={{
            top: 0, left: 0, right: '50%', bottom: '50%',
            background: ZONE_COLORS.risky.bg,
            borderRight: '1.5px dashed rgba(0,0,0,0.08)',
            borderBottom: '1.5px dashed rgba(0,0,0,0.08)',
          }}
        />
        {/* Top-right: Premium */}
        <div
          className="absolute"
          style={{
            top: 0, left: '50%', right: 0, bottom: '50%',
            background: ZONE_COLORS.premium.bg,
            borderBottom: '1.5px dashed rgba(0,0,0,0.08)',
          }}
        />
        {/* Bottom-left: Watchlist */}
        <div
          className="absolute"
          style={{
            top: '50%', left: 0, right: '50%', bottom: 0,
            background: ZONE_COLORS.watchlist.bg,
            borderRight: '1.5px dashed rgba(0,0,0,0.08)',
          }}
        />
        {/* Bottom-right: Sweet Spot */}
        <div
          className="absolute"
          style={{
            top: '50%', left: '50%', right: 0, bottom: 0,
            background: ZONE_COLORS.sweet.bg,
          }}
        />
      </div>


      {/* ── Zone labels (corner-anchored inside each quadrant) ── */}
      {(Object.entries(ZONE_LABELS) as [keyof typeof ZONE_LABELS, typeof ZONE_LABELS[keyof typeof ZONE_LABELS]][]).map(([key, z]) => {
        const color = ZONE_COLORS[key];
        const isTopRight    = z.corner === 'top-right';
        const isTopLeft     = z.corner === 'top-left';
        const isBottomRight = z.corner === 'bottom-right';

        return (
          <div
            key={key}
            className="pointer-events-none absolute flex flex-col gap-0.5 p-3"
            style={{
              top:    (isTopRight || isTopLeft)     ? 0 : undefined,
              bottom: (!isTopRight && !isTopLeft)   ? 0 : undefined,
              left:   (isTopLeft || !isTopRight && !isBottomRight) ? 0 : undefined,
              right:  (isTopRight || isBottomRight)  ? 0 : undefined,
            }}
          >
            <span
              className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest"
              style={{ color: color.text }}
            >
              <span
                className="inline-flex size-3.5 items-center justify-center rounded-full text-[8px] font-black"
                style={{ background: color.ring, color: color.bubble }}
              >
                {ZONE_ICONS[key]}
              </span>
              {z.label}
            </span>
            <span className="text-[9px] text-muted-foreground">{z.sub}</span>
          </div>
        );
      })}

      {/* ── Axis labels ── */}
      <span className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] font-medium text-muted-foreground">
        ← Lower reliability · Higher reliability →
      </span>
      <span
        className="pointer-events-none absolute left-2 top-1/2 origin-left -translate-y-1/2 -rotate-90 text-[10px] font-medium text-muted-foreground"
        style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', top: '50%', left: 4 }}
      >
        ↑ Higher cost · Lower cost ↓
      </span>

      {/* ── Transporter bubbles ── */}
      {leaderboard.map((row) => {
        const z      = zone(row);
        const color  = ZONE_COLORS[z];
        const pct    = row.shipments / maxShipments;
        const size   = Math.round(28 + pct * 16);   // 28–44 px
        const isHov  = hoveredId === row.transporterId;
        const isBest = row.rank === 1;

        const left = `${normX(row.onTimeRate) * 100}%`;
        // Y is inverted: high cost → top of chart (low top %), low cost → bottom
        const top  = `${(1 - normY(row.costPerShipment)) * 100}%`;

        return (
          <div
            key={row.transporterId}
            className="absolute"
            style={{ left, top, transform: 'translate(-50%, -50%)', zIndex: isHov ? 30 : 10 }}
          >
            {/* Pulsing ring on the #1 transporter */}
            {isBest && (
              <span
                className="animate-ping motion-reduce:animate-none absolute inset-0 rounded-full opacity-30"
                style={{ background: color.bubble }}
              />
            )}

            <button
              type="button"
              onClick={() =>
                onDrillDown({
                  title: `${row.name} performance`,
                  filters: { transporterIds: [row.transporterId] },
                })
              }
              onMouseEnter={(e) => {
                setHoveredId(row.transporterId);
                setHoverAnchor(e.currentTarget.getBoundingClientRect());
              }}
              onMouseLeave={() => {
                setHoveredId(null);
                setHoverAnchor(null);
              }}
              className="relative flex items-center justify-center rounded-full font-bold uppercase text-white transition duration-150 focus-visible:outline-none"
              style={{
                width: size,
                height: size,
                fontSize: size >= 36 ? 11 : 9,
                background: color.bubble,
                boxShadow: isHov
                  ? `0 0 0 4px ${color.ring}, 0 8px 24px ${color.ring}`
                  : `0 0 0 3px ${color.ring}`,
                transform: isHov ? 'scale(1.18)' : 'scale(1)',
              }}
              aria-label={`${row.name}: ${(row.onTimeRate * 100).toFixed(0)}% on-time, ${formatCurrencyFull(row.costPerShipment)} per shipment`}
            >
              {initials(row.name)}
            </button>
          </div>
        );
      })}

      <ChartHoverPortal open={Boolean(hoveredRow)} anchor={hoverAnchor}>
        {hoveredRow ? (
          <div className="min-w-[160px] rounded-lg border border-border bg-surface p-3 shadow-xl">
            <p className="mb-1.5 text-[11px] font-bold text-foreground">{hoveredRow.name}</p>
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-4">
                <span className="text-[10px] text-muted-foreground">On-time</span>
                <span
                  className="text-[10px] font-semibold tabular-nums"
                  style={{ color: ZONE_COLORS[zone(hoveredRow)].text }}
                >
                  {(hoveredRow.onTimeRate * 100).toFixed(1)}%
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-[10px] text-muted-foreground">Cost / shipment</span>
                <span className="text-[10px] font-semibold tabular-nums text-foreground">
                  {formatCurrencyFull(hoveredRow.costPerShipment)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-[10px] text-muted-foreground">Shipments</span>
                <span className="text-[10px] font-semibold tabular-nums text-foreground">
                  {hoveredRow.shipments}
                </span>
              </div>
              <div
                className="mt-1 rounded-md px-2 py-0.5 text-center text-[9px] font-bold uppercase tracking-wider"
                style={{
                  background: ZONE_COLORS[zone(hoveredRow)].ring,
                  color: ZONE_COLORS[zone(hoveredRow)].bubble,
                }}
              >
                {ZONE_LABELS[zone(hoveredRow)].label}
              </div>
            </div>
          </div>
        ) : null}
      </ChartHoverPortal>
    </div>
  );
}


function PerformanceSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <Card variant="default" padding="lg" className="gap-4">
        <Skeleton shape="text" className="h-4 w-40" />
        <Skeleton shape="block" className="h-48 w-full" />
      </Card>
      <Card variant="default" padding="lg" className="gap-4">
        <Skeleton shape="text" className="h-4 w-32" />
        <Skeleton shape="block" className="h-[340px] w-full" />
      </Card>
    </div>
  );
}

/**
 * One pass over the facts, producing the rows both the table and the plot use.
 *
 * Previously `buildPerformanceData` and `buildCostByTransporter` walked the
 * same array separately to produce the same per-transporter totals, and the
 * quadrant kept a third normalised copy of two of those columns.
 */
function buildPerformanceData(facts: ShipmentFact[], dataset: BiDataset) {
  const transporters = dataset.transporters ?? [];
  if (facts.length === 0 || transporters.length === 0) return null;

  const stats = transporters
    .map((transporter) => {
      const theirs = facts.filter((f) => f.transporterId === transporter.id);
      const delivered = theirs.filter((f) => f.isDelivered);
      const onTime = delivered.filter(
        (f) =>
          f.plannedDeliveryAt &&
          f.deliveredAt &&
          new Date(f.deliveredAt) <= new Date(f.plannedDeliveryAt),
      );
      const delayed = theirs.filter((f) => f.totalDelayMinutes > 0);
      const totalCost = theirs.reduce((sum, f) => sum + f.costTotal, 0);

      return {
        transporterId: transporter.id,
        name: transporter.name,
        shipments: theirs.length,
        onTimeRate: delivered.length > 0 ? onTime.length / delivered.length : 0,
        delayRate: theirs.length > 0 ? delayed.length / theirs.length : 0,
        costPerShipment: theirs.length > 0 ? totalCost / theirs.length : 0,
        totalCost,
      };
    })
    // A transporter who carried nothing this period is not rank 12, it is
    // absent — otherwise the bottom of the table is padding with 0% beside it.
    .filter((row) => row.shipments > 0);

  if (stats.length === 0) return null;

  const leaderboard = [...stats]
    .sort((a, b) => {
      if (b.onTimeRate !== a.onTimeRate) return b.onTimeRate - a.onTimeRate;
      if (a.delayRate !== b.delayRate) return a.delayRate - b.delayRate;
      return b.shipments - a.shipments;
    })
    .map((row, index) => ({ ...row, rank: index + 1 }));

  const costValues = stats.map((s) => s.costPerShipment).sort((a, b) => a - b);
  const rateValues = stats.map((s) => s.onTimeRate).sort((a, b) => a - b);
  const medianCost = costValues[Math.floor(costValues.length / 2)] ?? 0;
  const medianRate = rateValues[Math.floor(rateValues.length / 2)] ?? 0;
  const maxCost = Math.max(...stats.map((s) => s.costPerShipment), 1);

  return {
    leaderboard,
    maxCost,
    quadrantOrigin: { x: medianRate, y: medianCost / maxCost },
  };
}
