import { useMemo } from 'react';
import type { ApexOptions } from 'apexcharts';
import { Card } from '@/design-system';
import type { DatePreset } from '@/features/shipper-bi/contracts';
import type { ShipperShipmentRow } from '@/features/shipper-bi';
import { ApexChart } from '@/features/shipper-bi/charts/ApexChart';
import {
  baseChartOptions,
  buildTooltipHtml,
  chartAnimSpeed,
  quietStates,
  resolveColor,
} from '@/features/shipper-bi/charts/apexChartTheme';

export interface ShipmentAnalyticsCardProps {
  preset?: DatePreset;
  from?: string;
  to?: string;
  className?: string;
  /** The account's own shipments — what this chart counts. */
  rows: ShipperShipmentRow[];
}

interface AnalyticsDataPoint {
  /** Axis label — a date, or the Monday of the week. */
  timeLabel: string;
  /** What the tooltip says the bucket covers. */
  rangeLabel: string;
  total: number;
  onTime: number;
  delayed: number;
}

const DAY_MS = 86_400_000;

/**
 * Shipments per bucket, and how many of them ran late — counted off the
 * account's own rows.
 *
 * Two decisions this chart used to get wrong:
 *
 * **The bucket follows the window.** Thirty daily columns for twenty-five
 * shipments is twenty empty slots and bars a few pixels wide. Past a fortnight
 * the count is grouped by week, which is also how a shipper talks about volume.
 *
 * **Delayed is a share, not a rival.** It was drawn as a second bar beside the
 * total — but a delayed shipment is *inside* that total, so the pair either
 * double-counted or, as here, showed one full bar next to one of height zero and
 * a legend promising a series nobody could see. The bar is now the total, split
 * into the part that landed on time and the part that did not.
 *
 * The previous version generated the curve from the day index: `230 + (i*29 +
 * day*11) % 150` on a weekday, 12% of that "delayed". It drew a plausible,
 * busy-looking chart totalling 7,455 shipments for a shipper with ninety-nine,
 * and the shape moved when you changed the date range because the *index*
 * changed, not because anything happened.
 */
function buildSeries(
  rows: ShipperShipmentRow[],
  fromStr?: string,
  toStr?: string,
): { points: AnalyticsDataPoint[]; weekly: boolean } {
  const end = toStr ? new Date(toStr.slice(0, 10) + 'T00:00:00') : new Date();
  const start = fromStr
    ? new Date(fromStr.slice(0, 10) + 'T00:00:00')
    : new Date(end.getTime() - 29 * DAY_MS);

  const spanDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1);
  const weekly = spanDays > 14;

  const label = (date: Date) =>
    `${date.toLocaleString('en-US', { month: 'short' })} ${date.getDate()}`;
  const dayKey = (value: string | Date) =>
    (value instanceof Date ? value : new Date(value)).toISOString().slice(0, 10);

  /** The bucket a date belongs to: itself, or the Monday of its week. */
  const bucketStart = (date: Date): Date => {
    if (!weekly) return new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    return monday;
  };

  const counts = new Map<string, { total: number; delayed: number }>();
  for (const row of rows) {
    // Dated by the promise, so a bucket's bar and its late share describe the
    // same set of jobs rather than two different populations.
    const at = new Date(row.plannedDeliveryAt);
    if (at < start || at > new Date(end.getTime() + DAY_MS - 1)) continue;
    const key = dayKey(bucketStart(at));
    const bucket = counts.get(key) ?? { total: 0, delayed: 0 };
    bucket.total += 1;
    if (row.outcome === 'late') bucket.delayed += 1;
    counts.set(key, bucket);
  }

  const points: AnalyticsDataPoint[] = [];
  const cursor = bucketStart(start);
  const maxBuckets = 120;

  while (cursor <= end && points.length < maxBuckets) {
    const bucket = counts.get(dayKey(cursor)) ?? { total: 0, delayed: 0 };
    const last = new Date(cursor);
    if (weekly) last.setDate(last.getDate() + 6);

    points.push({
      timeLabel: label(cursor),
      rangeLabel: weekly ? `${label(cursor)} – ${label(last > end ? end : last)}` : label(cursor),
      total: bucket.total,
      onTime: bucket.total - bucket.delayed,
      delayed: bucket.delayed,
    });

    cursor.setDate(cursor.getDate() + (weekly ? 7 : 1));
  }

  /* An empty window is drawn as an empty window. The placeholder curve that
   * used to stand in here was indistinguishable from real traffic. */
  return { points, weekly };
}

export function ShipmentAnalyticsCard({
  from,
  to,
  className = '',
  rows,
}: ShipmentAnalyticsCardProps) {
  const { points, weekly } = useMemo(() => buildSeries(rows, from, to), [rows, from, to]);

  const summary = useMemo(() => {
    const total = points.reduce((sum, point) => sum + point.total, 0);
    const delayed = points.reduce((sum, point) => sum + point.delayed, 0);
    const busiest = points.reduce<AnalyticsDataPoint | null>(
      (max, point) => (point.total > (max?.total ?? 0) ? point : max),
      null,
    );
    return {
      total,
      delayed,
      onTimePct: total > 0 ? Math.round(((total - delayed) / total) * 100) : null,
      busiest,
    };
  }, [points]);

  const count = points.length;
  const primary = useMemo(() => resolveColor('var(--primary)', '#60969d'), []);
  const accent = useMemo(() => resolveColor('var(--accent)', '#f9ac17'), []);

  const options: ApexOptions = useMemo(
    () =>
      baseChartOptions({
        chart: {
          type: 'bar',
          stacked: true,
          selection: { enabled: false },
          animations: {
            enabled: chartAnimSpeed() > 0,
            speed: chartAnimSpeed(750),
            animateGradually: { enabled: true, delay: 40 },
          },
        },
        colors: [primary, accent],
        plotOptions: {
          bar: {
            borderRadius: 5,
            borderRadiusApplication: 'end',
            borderRadiusWhenStacked: 'last',
            /* Weekly buckets are few and deserve presence; daily ones stay slim
               so thirty of them still read as a rhythm rather than a wall. */
            columnWidth: count > 20 ? '62%' : count > 10 ? '48%' : '38%',
          },
        },
        fill: { opacity: 1, type: 'solid' },
        // Solid hairline, not dashed — `baseChartOptions` already sets the
        // recessive grid color and `strokeDashArray: 0`; only the spacing
        // and axis visibility are specific to this chart.
        grid: {
          xaxis: { lines: { show: false } },
          yaxis: { lines: { show: true } },
          padding: { left: 4, right: 8, top: 8, bottom: 0 },
        },
        xaxis: {
          categories: points.map((point) => point.timeLabel),
          tickAmount: count > 20 ? 10 : undefined,
          labels: {
            rotate: 0,
            hideOverlappingLabels: true,
            style: {
              fontSize: count > 20 ? '10px' : '11px',
              fontWeight: 700,
              colors: 'var(--muted-foreground)',
            },
          },
          crosshairs: {
            show: true,
            width: 'tickWidth',
            position: 'back',
            opacity: 1,
            fill: {
              type: 'solid',
              color: 'var(--surface-sunken)',
            },
            stroke: { width: 0 },
          },
        },
        yaxis: {
          min: 0,
          forceNiceScale: true,
          labels: {
            style: {
              fontSize: '11px',
              fontWeight: 600,
              colors: 'var(--muted-foreground)',
            },
            formatter: (val: number) => String(Math.round(val)),
          },
        },
        legend: { show: false },
        states: quietStates,
        tooltip: {
          shared: true,
          intersect: false,
          followCursor: false,
          custom: ({ dataPointIndex }) => {
            const point = points[dataPointIndex];
            if (!point) return '';
            return buildTooltipHtml(point.rangeLabel, [
              {
                key: 'total',
                label: 'Shipments',
                value: point.total.toLocaleString(),
                color: primary,
              },
              {
                key: 'delayed',
                label: 'Delayed',
                value: point.delayed.toLocaleString(),
                color: accent,
              },
            ]);
          },
        },
      }),
    [accent, points, count, primary],
  );

  return (
    <Card variant="default" padding="lg" className={`flex flex-col justify-between ${className}`}>
      <div className="flex flex-col gap-4 border-b border-border/60 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-extrabold tracking-tight text-foreground md:text-2xl">
            Shipment Analytics
          </h2>
          {/* The chart's own conclusion, in words, before anybody reads a bar. */}
          <p className="mt-1 text-xs font-semibold text-muted-foreground md:text-[13px]">
            <span className="font-extrabold text-foreground">{summary.total.toLocaleString()}</span>{' '}
            shipment{summary.total === 1 ? '' : 's'} promised in this window
            {summary.onTimePct !== null && (
              <>
                {' · '}
                <span className="font-extrabold text-foreground">{summary.onTimePct}%</span> landed
                on time
              </>
            )}
            {summary.busiest && summary.busiest.total > 0 && (
              <>
                {' · busiest '}
                <span className="font-extrabold text-foreground">
                  {summary.busiest.rangeLabel}
                </span>{' '}
                with {summary.busiest.total}
              </>
            )}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-5 text-xs font-bold text-foreground">
          <div className="flex items-center gap-2">
            <span
              className="h-3.5 w-3.5 shrink-0 rounded-full"
              style={{ backgroundColor: primary }}
            />
            <span>On time</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="h-3.5 w-3.5 shrink-0 rounded-full"
              style={{ backgroundColor: accent }}
            />
            <span>Delayed</span>
          </div>
        </div>
      </div>

      {summary.total === 0 ? (
        <div className="flex h-[220px] flex-col items-center justify-center gap-1 text-center">
          <p className="text-sm font-bold text-foreground">No shipment promised in this window</p>
          <p className="text-xs text-muted-foreground">
            Widen the date range above to see the account&rsquo;s volume.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-4 h-[260px] min-h-[260px] w-full shrink-0 sm:h-[300px]">
            <ApexChart
              type="bar"
              series={[
                { name: 'On time', data: points.map((point) => point.onTime) },
                { name: 'Delayed', data: points.map((point) => point.delayed) },
              ]}
              options={options}
              height="100%"
            />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {weekly ? 'Grouped by week' : 'By day'}, dated by the promised delivery — the bar is the
            week&rsquo;s volume and the amber part is what landed late.
          </p>
        </>
      )}
    </Card>
  );
}

export default ShipmentAnalyticsCard;
