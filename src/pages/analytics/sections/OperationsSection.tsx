import { useMemo } from 'react';
import { AlertTriangle, Clock, MapPin } from '@/design-system/icons';
import { Card } from '@/design-system';
import { cn } from '@/utils';
import {
  ChartCard,
  ParetoChart,
  TrackingMap,
  TrendChart,
  X_AXIS_HEIGHT,
} from '@/features/shipper-bi/charts';
import type {
  BiDataset,
  BiFilters,
  DelayOwner,
  DrillDown,
  StageKey,
} from '@/features/shipper-bi/contracts';
import {
  DELAY_OWNER_LABELS,
  STAGE_KEYS,
  STAGE_LABELS,
  TERMINAL_STAGE,
} from '@/features/shipper-bi/contracts';
import { formatCompact, formatDuration } from '@/features/shipper-bi/format';
import type { ShipmentFact } from '@/lib/bi/derive';
import {
  RISK_ALERT_THRESHOLD,
  RISK_CRITICAL_THRESHOLD,
  buildTrendSeries,
} from '../analyticsConfig';

const TREND_PLOT_HEIGHT = 220;
const PARETO_HEIGHT = 240;

export interface OperationsSectionProps {
  facts: ShipmentFact[];
  dataset: BiDataset;
  filters: BiFilters;
  onDrillDown: (drillDown: DrillDown | undefined) => void;
}

/**
 * Operations — where freight is, what is about to go wrong, and why.
 *
 * Told once, in order: current position (pipeline, map), what needs a call
 * today (risk alerts), then the single breakdown of where the delay comes from.
 *
 * **That last card used to be two.** "Delay root cause analysis" and "Delay
 * responsibility" were both built from the same `responsibilityTotals` array —
 * `rootCauses` was a straight `.map` over it — so they rendered identical rows
 * in identical order, ~700px apart, one formatted as a share and one as
 * minutes. They are now one table with both columns, which is what a reader was
 * having to assemble by scrolling between them.
 *
 * The four stat tiles that opened this section are gone too: three of them were
 * summaries of the delay card and now sit in its header, and the fourth ("at
 * risk now") is the count on the risk card and the badge on the tab.
 */
export function OperationsSection({
  facts,
  dataset,
  filters,
  onDrillDown,
}: OperationsSectionProps) {
  const openPipeline = useMemo(() => buildOpenPipeline(facts), [facts]);
  const liveShipments = useMemo(() => buildLiveShipments(facts, dataset), [facts, dataset]);
  const delay = useMemo(() => buildDelayData(facts), [facts]);

  const riskRows = useMemo(
    () =>
      facts
        .filter((f) => f.isOpen && f.riskScore >= RISK_ALERT_THRESHOLD)
        .sort((a, b) => b.riskScore - a.riskScore)
        .slice(0, 12),
    [facts],
  );

  const delayTrend = useMemo(
    () =>
      buildTrendSeries({
        facts,
        filters,
        // Delay is realised on arrival, so that is the day it belongs to.
        dateOf: (fact) => fact.deliveredAt,
        valueOf: (fact) => fact.totalDelayMinutes / 60,
        aggregate: 'sum',
      }),
    [facts, filters],
  );

  const openCount = liveShipments.length;

  return (
    <div className="flex flex-col gap-5">
      {/* Where the open work is right now */}
      <ChartCard
        title="Open shipment pipeline"
        subtitle={`${formatCompact(openCount)} still open · ${formatCompact(facts.length - openCount)} closed out`}
        icon={<MapPin className="size-4" />}
        isEmpty={openPipeline.every((stage) => stage.value === 0)}
        emptyMessage="Nothing is open — every shipment has been returned."
        tableRows={openPipeline}
        tableColumns={[
          { key: 'label', header: 'Stage', align: 'left', render: (row) => row.label },
          { key: 'value', header: 'Shipments', render: (row) => row.value },
          {
            key: 'share',
            header: 'Share of open',
            render: (row) =>
              openCount === 0 ? '—' : `${((row.value / openCount) * 100).toFixed(1)}%`,
          },
        ]}
      >
        <LogisticsPipeline
          rows={openPipeline}
          openCount={openCount}
          onSelect={(row) =>
            onDrillDown({
              title: `${row.label} shipments`,
              filters: { stages: [row.key as StageKey] },
            })
          }
        />
      </ChartCard>

      {/* Live tracking map */}
      <Card variant="default" padding="none" className="overflow-hidden">
        <TrackingMap
          shipments={liveShipments}
          bounds={computeBounds(dataset.routes)}
          routes={dataset.routes}
          onSelect={(shipment) =>
            onDrillDown({ title: `Shipment ${shipment.reference}`, filters: {} })
          }
          className="h-[420px] w-full"
        />
      </Card>

      {/* What needs a call today */}
      <ChartCard
        title="Needs a call today"
        subtitle={`${riskRows.length} open shipments scoring ${RISK_ALERT_THRESHOLD} or above`}
        icon={<AlertTriangle className="size-4" />}
        isEmpty={riskRows.length === 0}
        emptyMessage="No shipments currently at risk."
        tableRows={riskRows}
        tableColumns={[
          { key: 'reference', header: 'Reference', align: 'left', render: (row) => row.reference },
          {
            key: 'currentStage',
            header: 'Stage',
            align: 'left',
            render: (row) => STAGE_LABELS[row.currentStage],
          },
          {
            key: 'transporterId',
            header: 'Transporter',
            align: 'left',
            render: (row) => transporterName(dataset, row.transporterId),
          },
          { key: 'riskScore', header: 'Risk score', render: (row) => row.riskScore },
          { key: 'freeTime', header: 'Free time left', render: (row) => freeTimeLeft(row) },
        ]}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-4">Reference</th>
                <th className="py-2 pr-4">Stage</th>
                <th className="py-2 pr-4">Transporter</th>
                <th className="py-2 pr-4 text-right">Risk score</th>
                <th className="py-2 text-right">Free time left</th>
              </tr>
            </thead>
            <tbody>
              {riskRows.map((row) => (
                <tr
                  key={row.shipmentId}
                  className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-surface-sunken"
                  onClick={() =>
                    onDrillDown({ title: `Shipment ${row.reference}`, filters: {} })
                  }
                >
                  <td className="py-2.5 pr-4 font-medium text-foreground">{row.reference}</td>
                  <td className="py-2.5 pr-4 text-muted-foreground">
                    {STAGE_LABELS[row.currentStage]}
                  </td>
                  <td className="py-2.5 pr-4 text-muted-foreground">
                    {transporterName(dataset, row.transporterId)}
                  </td>
                  <td className="py-2.5 pr-4 text-right">
                    <span
                      className={
                        row.riskScore >= RISK_CRITICAL_THRESHOLD
                          ? 'font-semibold tabular-nums text-destructive'
                          : 'font-semibold tabular-nums text-warning-foreground'
                      }
                    >
                      {row.riskScore}
                    </span>
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                    {freeTimeLeft(row)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>

      {/* Where the delay comes from — one card, formerly two identical ones */}
      {delay && (
        <ChartCard
          title="Where the delay comes from"
          subtitle={`${formatCompact(delay.delayedShipments)} delayed shipments · ${formatCompact(delay.totalDelayHours)} hours lost · ${delay.medianDelayHours}h median`}
          icon={<Clock className="size-4" />}
          isEmpty={delay.owners.length === 0}
          emptyMessage="No delays recorded in this period."
          tableRows={delay.owners}
          tableColumns={[
            { key: 'label', header: 'Responsible party', align: 'left', render: (row) => row.label },
            { key: 'shipments', header: 'Shipments', render: (row) => row.shipments },
            { key: 'hours', header: 'Delay hours', render: (row) => formatCompact(row.value) },
            { key: 'share', header: 'Share', render: (row) => `${(row.share * 100).toFixed(1)}%` },
            {
              key: 'cumulative',
              header: 'Cumulative',
              render: (row) => `${(row.cumulativeShare * 100).toFixed(1)}%`,
            },
          ]}
        >
          {/* A Pareto, because the question is "how few parties do I have to
              call to fix most of this" — which a ranked list answers only if
              the reader adds the shares up themselves. Bars are each party's
              share and the line is the running total, so both are percentages
              and the chart keeps one honest axis. */}
          <ParetoChart
            rows={delay.owners}
            formatValue={(hours) => `${formatCompact(hours)}h`}
            height={PARETO_HEIGHT}
            onSelect={(row) => {
              const owner = delay.owners.find((entry) => entry.key === row.key)?.owner;
              onDrillDown({
                title: `${row.label} delays`,
                // "Unattributed" is a bucket, not a filterable owner.
                filters: owner ? { delayOwners: [owner] } : {},
              });
            }}
          />
        </ChartCard>
      )}

      {/* Delay over time — real calendar buckets */}
      <ChartCard
        title="Delay trend"
        subtitle="Hours lost per period, by delivery date"
        icon={<Clock className="size-4" />}
        isEmpty={delayTrend.points.every((point) => point.v === 0)}
        emptyMessage="No completed deliveries in this period."
        bodyHeight={TREND_PLOT_HEIGHT + X_AXIS_HEIGHT}
        tableRows={delayTrend.points}
        tableColumns={[
          {
            key: 't',
            header: 'Period',
            align: 'left',
            render: (row) => delayTrend.formatBucket(row.t),
          },
          { key: 'v', header: 'Delay hours', render: (row) => formatCompact(row.v) },
        ]}
      >
        <TrendChart
          series={[{ key: 'delay', label: 'Delay hours', points: delayTrend.points }]}
          formatValue={(value) => `${formatCompact(value)}h`}
          formatBucket={delayTrend.formatBucket}
          height={TREND_PLOT_HEIGHT}
        />
      </ChartCard>
    </div>
  );
}

function transporterName(dataset: BiDataset, transporterId: string): string {
  return dataset.transporters.find((t) => t.id === transporterId)?.name ?? transporterId;
}

function freeTimeLeft(fact: ShipmentFact): string {
  if (!fact.freeTimeExpiresAt) return '—';
  const minutes = (new Date(fact.freeTimeExpiresAt).getTime() - Date.now()) / 60_000;
  return minutes <= 0 ? 'expired' : formatDuration(minutes);
}

/**
 * The open stages, in order, including the ones nobody is sitting in.
 *
 * Driven by `STAGE_KEYS` rather than a hand-written list — the previous local
 * copy omitted `empty_awaiting`, so shipments waiting on an empty return were
 * missing from the pipeline entirely while still being counted everywhere else.
 *
 * `empty_returned` is dropped because it is the terminal stage: it holds every
 * shipment that ever finished, so including it makes the bar for "where is my
 * freight now" a single full-width block with nine slivers beside it.
 */
function buildOpenPipeline(facts: ShipmentFact[]) {
  return STAGE_KEYS.filter((key) => key !== TERMINAL_STAGE).map((key) => ({
    key,
    label: STAGE_LABELS[key],
    value: facts.filter((f) => f.currentStage === key).length,
  }));
}

function buildLiveShipments(facts: ShipmentFact[], dataset: BiDataset) {
  return facts
    .filter((f) => f.isOpen)
    .map((f) => {
      const route = dataset.routes.find((r) => r.id === f.routeId);
      const position = dataset.positions.find((p) => p.shipmentId === f.shipmentId);
      return {
        shipmentId: f.shipmentId,
        reference: f.reference,
        stage: f.currentStage,
        stageLabel: STAGE_LABELS[f.currentStage],
        transporterName: transporterName(dataset, f.transporterId),
        routeName: route?.name ?? f.routeId,
        riskScore: f.riskScore,
        lat: position?.lat ?? route?.originLat ?? 0,
        lng: position?.lng ?? route?.originLng ?? 0,
        lastPingAt: position?.recordedAt ?? f.currentStageAt,
        plannedArrivalAt: f.plannedDeliveryAt,
        etaAt: f.predictedArrivalAt,
      };
    });
}

function computeBounds(routes: BiDataset['routes']) {
  if (routes.length === 0) {
    return { minLat: 0, maxLat: 1, minLng: 0, maxLng: 1 };
  }
  const lats = routes.flatMap((r) => [r.originLat, r.destinationLat]);
  const lngs = routes.flatMap((r) => [r.originLng, r.destinationLng]);
  return {
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
    minLng: Math.min(...lngs),
    maxLng: Math.max(...lngs),
  };
}

/**
 * One pass over the delayed shipments, producing one ranked table.
 *
 * Both the "how many hours" and "how many shipments" measures come out of the
 * same grouping, which is the whole point — they were previously two functions
 * feeding two cards that could not disagree but looked like they might.
 */
function buildDelayData(facts: ShipmentFact[]) {
  if (facts.length === 0) return null;

  const delayed = facts.filter((f) => f.totalDelayMinutes > 0);
  if (delayed.length === 0) {
    return { delayedShipments: 0, totalDelayHours: 0, medianDelayHours: 0, owners: [] };
  }

  const totalDelayMinutes = delayed.reduce((sum, f) => sum + f.totalDelayMinutes, 0);
  const sortedDelays = delayed.map((f) => f.totalDelayMinutes).sort((a, b) => a - b);
  const medianDelayHours = Math.round(
    (sortedDelays[Math.floor(sortedDelays.length / 2)] ?? 0) / 60,
  );

  const byOwner = new Map<string, { minutes: number; shipments: number }>();
  for (const fact of delayed) {
    const owner = fact.primaryDelayOwner ?? 'unknown';
    const entry = byOwner.get(owner) ?? { minutes: 0, shipments: 0 };
    entry.minutes += fact.totalDelayMinutes;
    entry.shipments += 1;
    byOwner.set(owner, entry);
  }

  const ranked = Array.from(byOwner.entries())
    .map(([owner, entry]) => ({
      key: owner,
      label: ownerLabel(owner),
      /** Set only for real owners, so the drill-down can filter by it. */
      owner: owner === 'unknown' ? undefined : (owner as DelayOwner),
      /** Hours — the bar's magnitude and the primary figure. */
      value: Math.round(entry.minutes / 60),
      shipments: entry.shipments,
    }))
    .sort((a, b) => a.value - b.value);

  const total = ranked.reduce((sum, row) => sum + row.value, 0);
  let cumulative = 0;
  const owners = ranked.map((row) => {
    const share = total > 0 ? row.value / total : 0;
    cumulative += share;
    return {
      ...row,
      share,
      cumulativeShare: cumulative,
      detail: `${row.shipments} shipment${row.shipments === 1 ? '' : 's'}`,
    };
  });

  return {
    delayedShipments: delayed.length,
    totalDelayHours: Math.round(totalDelayMinutes / 60),
    medianDelayHours,
    owners,
  };
}

/**
 * `unknown` is a real bucket in the data, so it needs a real label.
 *
 * It previously fell through the lookup and rendered as the raw key, which read
 * as a rendering bug sitting between two properly named parties.
 */
function ownerLabel(owner: string): string {
  if (owner === 'unknown') return 'Unattributed';
  return DELAY_OWNER_LABELS[owner as keyof typeof DELAY_OWNER_LABELS] ?? owner;
}

function LogisticsPipeline({
  rows,
  openCount,
  onSelect,
}: {
  rows: { key: string; label: string; value: number }[];
  openCount: number;
  onSelect: (row: { key: string; label: string; value: number }) => void;
}) {
  /**
   * Fixed SVG coordinate space. The SVG will be rendered at width="100%" so
   * every column automatically expands to fill the card. preserveAspectRatio="none"
   * lets the bars stretch horizontally — desirable for a bar chart.
   */
  const COLS    = rows.length;          // 10 stages
  const STAGE_W = 100;                  // viewBox units per stage column
  const BAR_W   = 44;                   // viewBox units — bar width
  const CHART_H = 160;                  // viewBox units — chart height
  const VB_W    = STAGE_W * COLS;       // total viewBox width (1000)

  const maxVal = Math.max(...rows.map((r) => r.value), 1);

  /** Bar height in viewBox units (min 4 for ghost bars, min 14 for active) */
  const barH = (val: number) =>
    val === 0 ? 4 : Math.max(Math.round((val / maxVal) * CHART_H * 0.84), 14);

  /** Horizontal centre of a column in viewBox coords */
  const cx = (i: number) => i * STAGE_W + STAGE_W / 2;

  return (
    <div className="flex flex-col gap-3 pt-3 pb-1 w-full">

      {/* ── SVG funnel chart ── */}
      <svg
        width="100%"
        height={CHART_H}
        viewBox={`0 0 ${VB_W} ${CHART_H}`}
        preserveAspectRatio="none"
        className="block w-full overflow-visible"
        aria-hidden
      >
        <defs>
          {/* Teal gradient for active bars */}
          <linearGradient id="fpl-bar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="var(--color-primary)" stopOpacity="1"    />
            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0.6"  />
          </linearGradient>
          {/* Amber gradient for alert bars */}
          <linearGradient id="fpl-bar-alert" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#f59e0b" stopOpacity="1"   />
            <stop offset="100%" stopColor="#d97706" stopOpacity="0.85"/>
          </linearGradient>
          {/* Connector fill: subtle primary wash */}
          <linearGradient id="fpl-conn" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="var(--color-primary)" stopOpacity="0.10" />
            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0.03" />
          </linearGradient>
        </defs>

        {/* ── Trapezoidal connectors (drawn first, bars sit on top) ── */}
        {rows.map((row, i) => {
          if (i >= COLS - 1) return null;
          const next = rows[i + 1];
          if (!next) return null;
          const bh  = barH(row.value);
          const nbh = barH(next.value);
          const x1  = cx(i)     + BAR_W / 2;   // right edge of left bar
          const x2  = cx(i + 1) - BAR_W / 2;   // left  edge of right bar
          return (
            <polygon
              key={`conn-${row.key}`}
              points={`${x1},${CHART_H - bh} ${x2},${CHART_H - nbh} ${x2},${CHART_H} ${x1},${CHART_H}`}
              fill="url(#fpl-conn)"
            />
          );
        })}

        {/* ── Bars ── */}
        {rows.map((row, i) => {
          const isAlert  = row.key === 'empty_awaiting' && row.value > 0;
          const hasCount = row.value > 0;
          const bh       = barH(row.value);
          const bx       = cx(i) - BAR_W / 2;
          const by       = CHART_H - bh;

          return (
            <g
              key={row.key}
              style={{ cursor: hasCount ? 'pointer' : 'default' }}
              onClick={() => hasCount && onSelect(row)}
              role={hasCount ? 'button' : undefined}
              tabIndex={hasCount ? 0 : -1}
            >
              {/* Bar shadow for depth */}
              {hasCount && (
                <rect
                  x={bx + 2} y={by + 2} width={BAR_W} height={bh}
                  rx={6} ry={6}
                  fill={isAlert ? '#d97706' : 'var(--color-primary)'}
                  fillOpacity={0.18}
                />
              )}

              {/* Main bar */}
              <rect
                x={bx} y={by} width={BAR_W} height={bh}
                rx={6} ry={6}
                fill={isAlert ? 'url(#fpl-bar-alert)' : hasCount ? 'url(#fpl-bar)' : 'var(--color-border)'}
                fillOpacity={hasCount ? 1 : 0.2}
              />

              {/* Count label — inside bar when tall enough */}
              {bh >= 28 && (
                <text
                  x={cx(i)} y={by + bh / 2}
                  textAnchor="middle" dominantBaseline="middle"
                  fill="white" fontSize={13} fontWeight={800}
                  style={{ fontFamily: 'inherit', pointerEvents: 'none', letterSpacing: '-0.3px' }}
                >
                  {row.value}
                </text>
              )}

              {/* Count label — above bar when bar is too short */}
              {bh < 28 && hasCount && (
                <text
                  x={cx(i)} y={by - 6}
                  textAnchor="middle" dominantBaseline="auto"
                  fill={isAlert ? '#d97706' : 'var(--color-primary)'}
                  fontSize={11} fontWeight={800}
                  style={{ fontFamily: 'inherit', pointerEvents: 'none' }}
                >
                  {row.value}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* ── Stage labels row (flex-1 per column so it always aligns with SVG) ── */}
      <div className="flex w-full">
        {rows.map((row) => {
          const isAlert  = row.key === 'empty_awaiting' && row.value > 0;
          const hasCount = row.value > 0;
          const share    = openCount > 0 ? Math.round((row.value / openCount) * 100) : 0;

          return (
            <button
              key={row.key}
              type="button"
              onClick={() => hasCount && onSelect(row)}
              className={cn(
                'flex flex-1 flex-col items-center gap-1 focus-visible:outline-none group min-w-0',
                !hasCount && 'cursor-default pointer-events-none',
              )}
            >
              {/* Dot */}
              <div
                className={cn(
                  'size-1.5 rounded-full transition-transform group-hover:scale-150',
                  isAlert ? 'bg-warning' : hasCount ? 'bg-primary' : 'bg-border/50',
                )}
              />

              {/* Stage name */}
              <span
                className={cn(
                  'text-[10px] font-medium leading-snug text-center px-1 w-full',
                  isAlert
                    ? 'text-warning-subtle-foreground'
                    : hasCount
                      ? 'text-foreground group-hover:text-primary'
                      : 'text-muted-foreground/30',
                )}
              >
                {row.label}
              </span>

              {/* Share */}
              {hasCount ? (
                <span
                  className={cn(
                    'text-[10px] font-bold tabular-nums',
                    isAlert ? 'text-warning-subtle-foreground' : 'text-primary',
                  )}
                >
                  {share}%
                </span>
              ) : (
                <span className="text-[10px] text-muted-foreground/25">—</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}


