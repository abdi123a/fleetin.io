import { useMemo, useState } from 'react';
import type { ApexOptions } from 'apexcharts';

import {
  FilterMenu,
  PageHeader,
  TablePager,
  ViewTabs,
  usePagedRows,
  type FilterMenuGroup,
} from '@/components';
import { Badge, Card, Input } from '@/design-system';
import { ContainerIcon, Gauge, Leaf, Route, Truck } from '@/design-system/icons';
import { ApexChart } from '@/features/shipper-bi/charts/ApexChart';
import { baseChartOptions } from '@/features/shipper-bi/charts/apexChartTheme';
import { resolveColor } from '@/features/shipper-bi/charts/apexChartTheme';
import { seriesColor } from '@/features/shipper-bi/charts/chartTheme';
import {
  Co2Kpi,
  useEmissionsDashboard,
  useEmissionsFilterOptions,
  type EmissionsFilters,
  type EmissionsSlice,
} from '@/features/emissions';
import { co2Label, formatCo2, formatFactor, formatKm } from '@/lib/co2';

/**
 * The fleet's carbon.
 *
 * ## What this page is a reading of
 *
 * One number, cut six ways. Every panel here is the same filtered set of
 * bookings — the KPI row, the trend, the three rankings and the scatter — and
 * they arrive in **one** response for exactly that reason: six endpoints would
 * be six passes over the book and six chances for the tiles to disagree with
 * the chart beneath them.
 *
 * ## What is deliberately not on it
 *
 * A target, a trend arrow, and a projection. Fleetin measures what its trucks
 * did; it does not have a reduction plan to score against, and a delta against
 * "last period" on a book whose volume swings with the shipping calendar says
 * more about how many boxes moved than about how cleanly they moved. The rate
 * — kg per kilometre — is the figure that survives that, which is why it is a
 * KPI tile rather than a footnote.
 *
 * ## Measured versus estimated
 *
 * Every figure here comes from drives that actually happened: a container earns
 * its loaded leg when it reaches the consignee and its return leg when the
 * empty is collected. Nothing is forecast, so a booking still on the road
 * contributes what it has covered and nothing more — which is also why the
 * totals move through a month rather than landing at the end of one.
 */
export function EmissionsPage() {
  const [filters, setFilters] = useState<EmissionsFilters>({});
  const { data, isLoading } = useEmissionsDashboard(filters);
  const { data: options } = useEmissionsFilterOptions();

  const kpis = data?.kpis;
  const co2 = formatCo2(kpis?.totalCo2Kg);
  const distance = formatKm(kpis?.totalDistanceKm);

  /* Which grain the ranking is cut at. One panel, three answers — see
     `RankPanel`. */
  const [dimension, setDimension] = useState<RankDimension>('vehicle');
  const ranked =
    (dimension === 'vehicle'
      ? data?.byVehicle
      : dimension === 'transporter'
        ? data?.byTransporter
        : data?.byShipment) ?? [];

  const set = (patch: Partial<EmissionsFilters>) =>
    setFilters((prev) => {
      const next = { ...prev, ...patch };
      /* An empty string is "no filter", not a filter for the empty value —
         otherwise clearing a date narrows the book to nothing. */
      for (const key of Object.keys(next) as (keyof EmissionsFilters)[]) {
        if (!next[key]) delete next[key];
      }
      return next;
    });

  /* Every filter in one menu, the way every other list on this app narrows
     itself — see `FilterMenu`. Transporter, vehicle and vehicle type are the
     three that answer "who is burning it"; the date range is its own pair of
     fields because a range is not a choice from a list. */
  const filterGroups: FilterMenuGroup[] = useMemo(
    () => [
      {
        key: 'transporterId',
        label: 'Transporter',
        value: filters.transporterId ?? 'all',
        onChange: (value) => set({ transporterId: value === 'all' ? '' : value }),
        options: [
          { value: 'all', label: 'All transporters' },
          ...(options?.transporters ?? []).map((t) => ({ value: t.id, label: t.name })),
        ],
      },
      {
        key: 'truckType',
        label: 'Vehicle type',
        value: filters.truckType ?? 'all',
        onChange: (value) => set({ truckType: value === 'all' ? '' : value }),
        options: [
          { value: 'all', label: 'All types' },
          ...(options?.truckTypes ?? []).map((t) => ({ value: t, label: t })),
        ],
      },
      {
        key: 'vehicleId',
        label: 'Vehicle',
        value: filters.vehicleId ?? 'all',
        onChange: (value) => set({ vehicleId: value === 'all' ? '' : value }),
        options: [
          { value: 'all', label: 'All vehicles' },
          /* The factor rides in the label. Picking a truck to look at is a
             question about how dirty it is, and the answer is one column away
             — so it comes with the name rather than after the click. */
          ...(options?.vehicles ?? []).map((v) => ({
            value: v.id,
            label: `${v.plateNumber} · ${formatFactor(v.co2PerKm)}`,
          })),
        ],
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters.transporterId, filters.truckType, filters.vehicleId, options],
  );

  return (
    /* `@container/page` on the root, not just the query classes below it: a
       page that names a container it never declares silently falls back to its
       narrowest layout at every width. `w-full min-w-0` because a page root is
       a flex item here. */
    <div className="@container/page w-full min-w-0 space-y-5 pb-12">
      <PageHeader
        title="CO₂ Emissions"
        badge={
          kpis && kpis.bookingCount > 0 ? (
            <Badge intent="default" variant="subtle" size="sm">
              {kpis.measuredBookingCount} of {kpis.bookingCount} on a measured route
            </Badge>
          ) : undefined
        }
      />

      {/* ── The filters ────────────────────────────────────────────────── */}
      {/* One "Filter By" menu, as every list in this app narrows itself, plus
          the date pair beside it — a range is not a choice from a list, so it
          stays two fields rather than being crammed into the menu.

          `flex-wrap-reverse` with `items-start`: when the row runs out of
          width the menu drops BELOW the dates rather than the dates dropping
          below the menu, which keeps the control that is always present on
          the top line. Same rule as the page header bands. */}
      <div className="flex flex-wrap-reverse items-start justify-between gap-2">
        {/* The width goes on a wrapper, not on the input: `Input` renders its
            own `w-full` shell, so a width class on the control itself is
            overruled and both dates take a line each. */}
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <div className="w-[10.5rem]">
            <Input
              type="date"
              aria-label="From"
              value={filters.dateFrom ?? ''}
              onChange={(e) => set({ dateFrom: e.target.value })}
              className="h-9"
            />
          </div>
          <span className="text-xs font-semibold text-muted-foreground">to</span>
          <div className="w-[10.5rem]">
            <Input
              type="date"
              aria-label="To"
              value={filters.dateTo ?? ''}
              onChange={(e) => set({ dateTo: e.target.value })}
              className="h-9"
            />
          </div>
        </div>

        <FilterMenu
          groups={filterGroups}
          onReset={() => setFilters({})}
          resetActive={Object.keys(filters).length > 0}
        />
      </div>

      {/* ── The five figures ───────────────────────────────────────────── */}
      {/* Five tiles, not four: `Total CO₂` and `Distance driven` are a pair,
          and the rate between them is the one an operator can act on — so it
          gets its own tile rather than being left for the reader to divide.
          The unit rides beside each number rather than under it, because
          "2.3" and "t CO₂" are one fact. */}
      <div className="grid grid-cols-2 gap-3 @[46rem]/page:grid-cols-3 @[64rem]/page:grid-cols-5">
        <Co2Kpi
          lead
          label="Total CO₂"
          value={co2.value}
          unit={co2.unit}
          icon={Leaf}
          loading={isLoading}
        />
        <Co2Kpi
          label="Distance driven"
          value={distance.value}
          unit="km"
          icon={Route}
          loading={isLoading}
        />
        <Co2Kpi
          label="Rate"
          value={kpis?.avgCo2PerKm?.toFixed(3) ?? '—'}
          unit="kg/km"
          icon={Gauge}
          loading={isLoading}
        />
        <Co2Kpi
          label="Bookings"
          value={kpis?.bookingCount ?? 0}
          icon={ContainerIcon}
          loading={isLoading}
        />
        <Co2Kpi
          label="Shipments"
          value={kpis?.shipmentCount ?? 0}
          icon={Truck}
          loading={isLoading}
        />
      </div>

      {/* ── The trend ──────────────────────────────────────────────────── */}
      {/*
       * One series, labelled — not CO₂ over distance on one grid.
       *
       * That was the first attempt and it failed for an instructive reason:
       * on this corridor a kilometre costs almost exactly a kilogramme, so the
       * two lines land on top of each other and the chart reads as one shape
       * drawn twice. A second axis would separate them and is exactly the
       * thing this codebase does not do — a dual axis lets you draw any
       * relationship you like by choosing the scales.
       *
       * So the columns are carbon, each one carrying its own figure, and the
       * rate underneath is what distance is actually *for*: it is the number
       * that says whether a heavy month was a dirty one. The month with the
       * tallest column and the lowest rate is a good month, and you can see
       * both without holding either in your head.
       */}
      <ChartPanel title="Emissions over time" isEmpty={!data?.series.length} height={300}>
        <ApexChart
          type="bar"
          height={300}
          series={[{ name: 'CO₂', data: (data?.series ?? []).map((p) => p.co2Kg) }]}
          options={baseChartOptions({
            colors: [resolveSuccess()],
            plotOptions: { bar: { columnWidth: '46%', borderRadius: 6, dataLabels: { position: 'top' } } },
            dataLabels: {
              enabled: true,
              offsetY: -20,
              formatter: (value: number) => co2Label(value),
              /* A literal, not the token. This lands as an SVG `fill`
                 attribute, and a presentation attribute does not resolve
                 `var()` — the label silently falls back to black on the one
                 chart where it sits on a dark green column. Same reason the
                 bar colour above is resolved. */
              style: { fontSize: '11px', fontWeight: 700, colors: [resolveMuted()] },
            },
            legend: { show: false },
            xaxis: {
              categories: (data?.series ?? []).map((p) => monthLabel(p.month)),
              /* No hover band. The shared theme paints one behind the hovered
                 category, which reads as a stray grey block on a three-column
                 chart — and a column already highlights itself. */
              crosshairs: { show: false },
              /* The rate belongs under the month it describes, not in a
                 legend — a two-line category label costs nothing and saves
                 the reader a lookup. */
              labels: {
                formatter: (value: string) => value,
                style: { fontSize: '11px', fontWeight: 600 },
              },
            },
            /* Headroom for the labels. Apex scales the axis to the tallest
               column, which puts that column's own label off the top of the
               plot — so the ceiling is lifted a fifth above the peak and the
               figure always has somewhere to sit. */
            yaxis: {
              /* Pinned at zero. Naming only a `max` let Apex choose its own
                 floor, and it chose a negative one — an axis that offers to
                 show less than no carbon. */
              min: 0,
              max: Math.max(...(data?.series ?? []).map((p) => p.co2Kg), 0) * 1.2 || undefined,
              tickAmount: 4,
              labels: { formatter: (value: number) => `${Math.round(value)}` },
            },
            grid: { padding: { top: 8 } },
          } as ApexOptions)}
        />

        {/* The rate per month, on the same rhythm as the columns above it. */}
        <div
          className="grid gap-2 pt-1"
          style={{ gridTemplateColumns: `repeat(${data?.series.length || 1}, minmax(0, 1fr))` }}
        >
          {(data?.series ?? []).map((point) => (
            <div key={point.month} className="text-center">
              <span className="block text-[11px] font-bold tabular-nums text-foreground">
                {point.distanceKm > 0 ? formatFactor(point.co2Kg / point.distanceKm) : '—'}
              </span>
              <span className="block text-[10px] text-muted-foreground">
                {point.bookings} container{point.bookings === 1 ? '' : 's'}
              </span>
            </div>
          ))}
        </div>
      </ChartPanel>

      {/* ── Who and what ───────────────────────────────────────────────── */}
      <RankPanel
        dimension={dimension}
        onDimension={setDimension}
        rows={ranked}
        totalCo2Kg={kpis?.totalCo2Kg ?? 0}
      />

      {/* ── Distance against carbon ────────────────────────────────────── */}
      {/* One dot per container run. The diagonal it forms IS the fleet's
          factor, so a dot sitting above the crowd at the same distance is a
          truck burning more to cover the same road — the single most useful
          thing this page can show, and impossible to see in any of the
          rankings above. */}
      <ChartPanel
        title="Distance against carbon"
        isEmpty={!data?.scatter.length}
        height={320}
      >
        <ApexChart
          type="scatter"
          height={320}
          series={scatterSeries(data?.scatter ?? [])}
          options={baseChartOptions({
            colors: [seriesColor(0), seriesColor(1), seriesColor(2), seriesColor(3), seriesColor(4)],
            xaxis: {
              type: 'numeric',
              title: { text: 'km driven', style: { fontSize: '11px', fontWeight: 600 } },
              labels: { formatter: (value: string) => `${Math.round(Number(value))}` },
            },
            yaxis: {
              title: { text: 'kg CO₂', style: { fontSize: '11px', fontWeight: 600 } },
              labels: { formatter: (value: number) => `${Math.round(value)}` },
            },
            legend: { show: true, position: 'top', horizontalAlign: 'right', fontWeight: 600 },
            markers: { size: 6, strokeWidth: 0, hover: { size: 8 } },
            grid: { xaxis: { lines: { show: true } } },
          } as ApexOptions)}
        />
      </ChartPanel>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Pieces
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * A chart in a card, sized so the card does not jump when data arrives.
 *
 * Local rather than the BI module's `ChartCard`: that one carries a
 * download-as-table affordance and a subtitle slot this page has no use for —
 * every panel here is one clause, and the house rule is that a second line
 * only survives if it carries a number the title cannot.
 */
function ChartPanel({
  title,
  height,
  isEmpty,
  children,
}: {
  title: string;
  height: number;
  isEmpty?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card className="space-y-3 rounded-lg border border-border/80 bg-card p-4 sm:p-5">
      <h3 className="text-sm font-bold text-foreground">{title}</h3>
      {isEmpty ? (
        <div
          className="flex items-center justify-center text-sm text-muted-foreground"
          style={{ height }}
        >
          Nothing has been driven in this range yet.
        </div>
      ) : (
        <div style={{ height }}>{children}</div>
      )}
    </Card>
  );
}

/** The three grains one ranking can be cut at. */
export type RankDimension = 'vehicle' | 'transporter' | 'shipment';

const RANK_TABS: { key: RankDimension; label: string; noun: string }[] = [
  { key: 'vehicle', label: 'By vehicle', noun: 'vehicles' },
  { key: 'transporter', label: 'By transporter', noun: 'transporters' },
  { key: 'shipment', label: 'By shipment', noun: 'shipments' },
];

/** Rows per page. Eight is what fits without the card outgrowing the chart. */
const RANK_PAGE_SIZE = 8;

/**
 * Who emitted the most — at whichever grain you ask.
 *
 * ## Why one panel and not three
 *
 * This began as three cards side by side, ten rows each. That is thirty rows
 * of the same list answering the same question three times, and it made the
 * page a scroll before it made it useful. Worse, each card was capped at ten
 * with no way past it: on a fleet of five hundred trucks "top 10 of 500" is
 * not a ranking, it is a teaser.
 *
 * So: **one panel, a switcher, and a pager.** The three lists were never
 * three questions — they are one question at three grains, and the reader
 * wants them one at a time. The card is now a fixed height whatever the book
 * holds, and every row is reachable rather than the first ten.
 *
 * ## Why the bar is the row
 *
 * The old row was a name, a figure, and a hairline bar underneath — three
 * elements and two lines each. The fill is now the row's own background, so a
 * row is one line and the bar costs no height at all. Eight of these occupy
 * less page than three of the old ones.
 *
 * It is also measured against a **better denominator**. The old bar was a
 * share of the leader, which says only "this one is shorter than the top
 * one"; this is a share of the filtered total, so the number beside it is
 * worth reading: 24% of the fleet's carbon came from one carrier is a fact
 * somebody can act on.
 */
function RankPanel({
  dimension,
  onDimension,
  rows,
  totalCo2Kg,
}: {
  dimension: RankDimension;
  onDimension: (next: RankDimension) => void;
  rows: EmissionsSlice[];
  totalCo2Kg: number;
}) {
  const noun = RANK_TABS.find((t) => t.key === dimension)?.noun ?? 'rows';
  /* The bar is drawn against the LEADER, and the percentage is read against
     the TOTAL. Two denominators on purpose, because they are doing two
     different jobs: carbon is long-tailed, so a bar scaled to the total leaves
     the top row at 9% and every row after it a stub — the shape stops being a
     ranking. Scaled to the leader the shape reads, and the figure beside it
     still says what the row is worth of the whole. */
  const leaderCo2Kg = rows[0]?.co2Kg ?? 0;
  /* `resetKey` on the dimension: switching from a 3-page vehicle list to a
     1-page transporter list must not leave the reader on page 3 of nothing. */
  const paged = usePagedRows(rows, { pageSize: RANK_PAGE_SIZE, resetKey: dimension });

  return (
    <Card className="space-y-3 rounded-lg border border-border/80 bg-card p-4 sm:p-5">
      <ViewTabs
        label="Rank emissions by"
        tabs={RANK_TABS.map((t) => ({ key: t.key, label: t.label }))}
        value={dimension}
        onChange={onDimension}
      />

      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Nothing has been driven in this range yet.
        </p>
      ) : (
        <>
          <ol className="space-y-1">
            {paged.rows.map((row, index) => {
              const share = totalCo2Kg > 0 ? (row.co2Kg / totalCo2Kg) * 100 : 0;
              const barWidth = leaderCo2Kg > 0 ? (row.co2Kg / leaderCo2Kg) * 100 : 0;
              return (
                <li
                  key={row.id}
                  className="relative flex items-center gap-3 overflow-hidden rounded-md px-2.5 py-2"
                >
                  {/* The bar, as the row's own ground. `aria-hidden` because
                      the percentage beside it says the same thing in words. */}
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 rounded-md bg-success/15"
                    style={{ width: `${Math.max(barWidth, 1.5)}%` }}
                  />

                  <span className="relative w-5 shrink-0 text-[11px] font-bold tabular-nums text-muted-foreground">
                    {paged.rangeStart + index}
                  </span>

                  <span className="relative min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-foreground" title={row.label}>
                      {row.label}
                    </span>
                    {row.sublabel && (
                      <span className="block truncate text-[10px] text-muted-foreground">
                        {row.sublabel}
                      </span>
                    )}
                  </span>

                  <span className="relative shrink-0 text-right">
                    <span className="block text-xs font-bold tabular-nums text-foreground">
                      {co2Label(row.co2Kg)}
                    </span>
                    <span className="block text-[10px] font-medium tabular-nums text-muted-foreground">
                      {share >= 0.1 ? `${share.toFixed(1)}%` : '<0.1%'}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>

          <TablePager paged={paged} noun={noun} />
        </>
      )}
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Shaping
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * The scatter, split into one series per vehicle type.
 *
 * Split rather than drawn as one cloud because the colour is what makes the
 * chart answer its question: a 40ft tractor sitting on the same line as a box
 * truck is expected, and a box truck sitting on the tractors' line is not.
 * Capped at five series so the legend stays readable; the rest fall into one
 * "Other" group rather than being dropped.
 */
function scatterSeries(points: { distanceKm: number; co2Kg: number; truckType: string }[]) {
  const byType = new Map<string, { x: number; y: number }[]>();
  for (const point of points) {
    const list = byType.get(point.truckType) ?? [];
    list.push({ x: point.distanceKm, y: point.co2Kg });
    byType.set(point.truckType, list);
  }

  const ranked = [...byType.entries()].sort((a, b) => b[1].length - a[1].length);
  const head = ranked.slice(0, 5);
  const tail = ranked.slice(5);

  const series = head.map(([name, data]) => ({ name, data }));
  if (tail.length > 0) {
    series.push({ name: 'Other', data: tail.flatMap(([, data]) => data) });
  }
  return series;
}

/**
 * The carbon green, resolved to a literal.
 *
 * ApexCharts paints into a canvas and cannot read a CSS custom property, so
 * every token a chart uses has to be resolved at render. Same helper the BI
 * charts use, and the same fallback rule: a hex that matches the token's
 * light-theme value, so a chart drawn before styles settle is the right colour
 * rather than black.
 */
function resolveSuccess(): string {
  return resolveColor('var(--success)', '#2E7D32');
}

/** The quiet ink a chart's own labels take. */
function resolveMuted(): string {
  return resolveColor('var(--muted-foreground)', '#64748B');
}

/** `2026-08` → `Aug 2026`. */
function monthLabel(month: string): string {
  const [year, index] = month.split('-');
  const date = new Date(Number(year), Number(index) - 1, 1);
  return date.toLocaleString(undefined, { month: 'short', year: 'numeric' });
}
