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
import { ContainerIcon, Gauge, Handshake, Leaf, Route, Truck } from '@/design-system/icons';
import { ApexChart } from '@/features/shipper-bi/charts/ApexChart';
import { baseChartOptions } from '@/features/shipper-bi/charts/apexChartTheme';
import { resolveColor } from '@/features/shipper-bi/charts/apexChartTheme';
import { seriesColor } from '@/features/shipper-bi/charts/chartTheme';
import {
  Co2Kpi,
  ImpactStatusBadge,
  useEmissionsDashboard,
  useEmissionsFilterOptions,
  type EmissionsFilters,
  type EmissionsSlice,
  type ImpactSummary,
} from '@/features/emissions';
import { co2Label, formatCo2, formatFactor, formatKm } from '@/lib/co2';
import { CompanyName } from '@/pages/empty-returns/components/marks';

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

      {/* ── Fleetin Impact ─────────────────────────────────────────────── */}
      {/* The other question, under its own heading and in its own colour,
          directly under the figures it must never be added to. Everything
          above is what the trucks put out; this is what a realized match
          stopped them driving. Same filters, same request, separate block —
          so the two can be read side by side and never as one column. */}
      <ImpactSection impact={data?.impact} loading={isLoading} />

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
      <ChartPanel title="Emissions over time" isEmpty={!data?.series?.length} height={330}>
        <ApexChart
          type="bar"
          height={330}
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
              /*
               * Three lines per category, handed to Apex as an array — the
               * month, the rate it ran at, and how many containers made it.
               *
               * These used to be a CSS grid of equal columns underneath the
               * chart, and they did not line up: a grid spans the whole card
               * while the columns live inside the plot area, which is inset by
               * however wide the y-axis labels happen to be. Any padding that
               * fixed it would be a guess that breaks the moment the figures
               * gain a digit. Apex positions its own category labels exactly
               * under their columns, so the alignment stops being something
               * this file has to get right.
               */
              categories: (data?.series ?? []).map((p) => [
                monthLabel(p.month),
                p.distanceKm > 0 ? formatFactor(p.co2Kg / p.distanceKm) : '—',
                `${p.bookings} container${p.bookings === 1 ? '' : 's'}`,
              ]),
              /* No hover band. The shared theme paints one behind the hovered
                 category, which reads as a stray grey block on a three-column
                 chart — and a column already highlights itself. */
              crosshairs: { show: false },
              labels: { style: { fontSize: '11px', fontWeight: 600 } },
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

      </ChartPanel>

      {/* ── Who and what ───────────────────────────────────────────────── */}
      <RankPanel
        dimension={dimension}
        onDimension={setDimension}
        rows={ranked}
        totalCo2Kg={kpis?.totalCo2Kg ?? 0}
        /* The true population, before the server capped the list — so a fleet
           of five thousand trucks is never shown two hundred rows and left to
           assume that is all of them. */
        population={
          dimension === 'vehicle'
            ? data?.counts?.vehicles
            : dimension === 'transporter'
              ? data?.counts?.transporters
              : data?.counts?.shipments
        }
      />

      {/* ── Distance against carbon ────────────────────────────────────── */}
      {/* One dot per container run. The diagonal it forms IS the fleet's
          factor, so a dot sitting above the crowd at the same distance is a
          truck burning more to cover the same road — the single most useful
          thing this page can show, and impossible to see in any of the
          rankings above. */}
      <ChartPanel
        title="Distance against carbon"
        isEmpty={!data?.scatter?.length}
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
  emptyText = 'Nothing has been driven in this range yet.',
  children,
}: {
  title: string;
  height: number;
  isEmpty?: boolean;
  emptyText?: string;
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
          {emptyText}
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
 * ## One denominator, and it is named
 *
 * The first version of this row was unreadable, for a reason worth writing
 * down: the bar was scaled to the **leader** while the percentage beside it
 * was a share of the **total**. Two quantities, two denominators, neither
 * stated — so a full green bar meant "biggest" and "19%" meant something
 * else entirely, and a reader could only conclude the green was decorative.
 *
 * Now there is one quantity: **this row's share of the CO₂ in view**. The bar
 * is that share, the percentage is that share, and the denominator is printed
 * twice where it cannot be missed — as the total in the tab band, and as the
 * column heading over the figures. "19.1% of 2.3 t CO₂" is answerable from
 * the card without leaving it.
 *
 * The bar is drawn in a **track** rather than as a fill bleeding off the row.
 * A share of 9% painted across a full-width row is a sliver at the left edge
 * with no visible end, which reads as an accident; the same 9% inside a
 * bounded track reads as a ninth, because the empty part of the track is what
 * makes the scale visible.
 */
function RankPanel({
  dimension,
  onDimension,
  rows,
  totalCo2Kg,
  population,
}: {
  dimension: RankDimension;
  onDimension: (next: RankDimension) => void;
  rows: EmissionsSlice[];
  totalCo2Kg: number;
  population?: number;
}) {
  const noun = RANK_TABS.find((t) => t.key === dimension)?.noun ?? 'rows';
  const total = formatCo2(totalCo2Kg);
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
        /* The denominator, in the band. Every bar and every percentage below
           is a share of THIS figure, and it is the same number the "Total CO₂"
           tile at the top of the page shows — so the card can be read on its
           own without anybody having to guess what 19% is 19% of. */
        actions={
          <span className="whitespace-nowrap text-xs font-semibold text-muted-foreground">
            of{' '}
            <strong className="font-bold tabular-nums text-foreground">
              {total.value} {total.unit}
            </strong>
          </span>
        }
      />

      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Nothing has been driven in this range yet.
        </p>
      ) : (
        <>
          {/* A column heading, not a caption. It names the unit of the two
              columns under it, which is the whole of what was missing. */}
          <div className="flex items-center gap-3 px-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <span className="w-5 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">{noun}</span>
            {/* Names the bar AND the percentage beside it — they are one
                quantity, so they get one heading rather than one each. */}
            <span className="hidden w-32 shrink-0 @[46rem]/page:block @[46rem]/page:w-48">
              Share of total
            </span>
            <span className="w-24 shrink-0 text-right">CO₂</span>
          </div>

          <ol className="space-y-1">
            {paged.rows.map((row, index) => {
              const share = totalCo2Kg > 0 ? (row.co2Kg / totalCo2Kg) * 100 : 0;
              return (
                <li
                  key={row.id}
                  className="flex items-center gap-3 rounded-md px-2.5 py-2 odd:bg-secondary/30"
                >
                  <span className="w-5 shrink-0 text-[11px] font-bold tabular-nums text-muted-foreground">
                    {paged.rangeStart + index}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-foreground" title={row.label}>
                      {row.label}
                    </span>
                    {row.sublabel && (
                      <span className="block truncate text-[10px] text-muted-foreground">
                        {row.sublabel}
                      </span>
                    )}
                  </span>

                  {/* The share, in a bounded track. The empty part of the
                      track is what makes the filled part mean something —
                      without it a small share is just a mark near the left. */}
                  {/* Wide enough to be read as a proportion. At 96px the
                      top five carriers — 19%, 18%, 15%, 11%, 11% — all drew
                      the same stub; the comparison the bar exists for only
                      appears once the track has the resolution to show it. */}
                  <span
                    className="hidden h-2 w-32 shrink-0 overflow-hidden rounded-full bg-secondary @[46rem]/page:block @[46rem]/page:w-48"
                    /* Announced on the row's figures instead, which say the
                       same thing in words. */
                    aria-hidden
                  >
                    <span
                      className="block h-full rounded-full bg-success"
                      style={{ width: `${Math.max(share, 1.5)}%` }}
                    />
                  </span>

                  <span className="w-24 shrink-0 text-right">
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

          <TablePager
            paged={paged}
            noun={noun}
            /* Said out loud when the server capped the list. A silent cap
               reads as "this is everything", which it is not. */
            summary={
              population && population > rows.length
                ? `top ${rows.length} of ${population.toLocaleString()}`
                : undefined
            }
          />
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

/* ═══════════════════════════════════════════════════════════════════════════
 * Fleetin Impact
 * ═══════════════════════════════════════════════════════════════════════ */

/** Continuations per page. Eight, like the ranking — the card stays chart-height. */
const IMPACT_PAGE_SIZE = 8;

/**
 * What Fleetin stopped the trucks driving.
 *
 * ## What the figures are
 *
 * A truck that has just finished at a free zone normally goes home before its
 * next job — `Free Zone → Garage → Port` — and a realized match lets it
 * continue straight to the port instead. The distance avoided is those two
 * legs and nothing else: not the shipment's lane, not a share of the total,
 * not a theoretical match. Every kilometre here belongs to a continuation
 * that physically happened, judged from the bookings' own rungs and counted
 * once per trip.
 *
 * ## Why it is yellow
 *
 * The carbon above is green, and this sits beside it in the other
 * environmental hue — yellow, never the console's teal, which the user ruled
 * out on 2026-09-03 as flattening the one row that is about the road. A
 * different colour, more to the point, so that "2.3 t emitted" and "0.4 t
 * avoided" can never be read as one column of figures.
 *
 * ## The rate
 *
 * Shown only when both sides exist. It is the avoided share of the road these
 * jobs would have needed — driven plus avoided — which is the one baseline
 * this data can defend. There is no "Fleetin cuts CO₂ by 30%" here, because
 * there is no book that says so.
 */
function ImpactSection({ impact, loading }: { impact?: ImpactSummary; loading: boolean }) {
  const co2 = formatCo2(impact?.co2AvoidedKg);
  const km = formatKm(impact?.distanceAvoidedKm);
  const rows = impact?.continuations ?? [];
  const series = impact?.series ?? [];
  const paged = usePagedRows(rows, { pageSize: IMPACT_PAGE_SIZE });

  return (
    <section className="space-y-3 border-t border-border/80 pt-5" aria-labelledby="fleetin-impact-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="fleetin-impact-title" className="text-base font-bold text-foreground">
          Fleetin Impact
        </h2>
        {/* The pipeline, in the band: matches waiting to be driven, matches
            that were not, and the counted savings that could not be measured
            or were measured as a straight line. Each is a number the tiles
            cannot carry, and each says exactly what the tiles leave out. */}
        {impact && (
          <div className="flex flex-wrap items-center gap-1.5">
            {impact.matchedPending > 0 && (
              <Badge intent="default" variant="subtle" size="sm">
                {impact.matchedPending} matched, not yet driven
              </Badge>
            )}
            {impact.notRealized > 0 && (
              <Badge intent="warning" variant="subtle" size="sm">
                {impact.notRealized} not realized
              </Badge>
            )}
            {impact.unmeasured > 0 && (
              <Badge intent="warning" variant="subtle" size="sm">
                {impact.unmeasured} realized, no garage to measure from
              </Badge>
            )}
            {impact.realizedMatches - impact.pricedMatches > 0 && (
              <Badge intent="default" variant="subtle" size="sm">
                {impact.realizedMatches - impact.pricedMatches} not priced, truck not established
              </Badge>
            )}
            {impact.straightLine > 0 && (
              <Badge intent="default" variant="subtle" size="sm">
                {impact.straightLine} on a straight line
              </Badge>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 @[46rem]/page:grid-cols-4">
        <Co2Kpi lead tone="impact" label="CO₂ Avoided" value={co2.value} unit={co2.unit} icon={Leaf} loading={loading} />
        <Co2Kpi tone="impact" label="Distance Avoided" value={km.value} unit={km.unit} icon={Route} loading={loading} />
        <Co2Kpi
          tone="impact"
          label="Realized Matches"
          value={impact?.realizedMatches ?? 0}
          icon={Handshake}
          loading={loading}
        />
        {impact?.avoidanceRate != null && (
          <Co2Kpi
            tone="impact"
            label="Avoidance Rate"
            value={impact.avoidanceRate.toFixed(1)}
            unit="%"
            icon={Gauge}
            loading={loading}
          />
        )}
      </div>

      <div className="grid gap-4 @[64rem]/page:grid-cols-2">
        {/* Distance, not carbon, on the columns: the kilometres are the fact
            every counted continuation carries, while the carbon needs the
            truck to have been established. The month's carbon and its match
            count ride under the label instead. */}
        <ChartPanel
          title="Distance avoided over time"
          isEmpty={series.length === 0}
          emptyText="No continuation has been realized in this range yet."
          height={300}
        >
          <ApexChart
            type="bar"
            height={300}
            series={[{ name: 'Distance avoided', data: series.map((p) => p.distanceAvoidedKm) }]}
            options={baseChartOptions({
              colors: [resolveImpact()],
              plotOptions: { bar: { columnWidth: '46%', borderRadius: 6, dataLabels: { position: 'top' } } },
              dataLabels: {
                enabled: true,
                offsetY: -20,
                formatter: (value: number) => `${formatKm(value).value} km`,
                style: { fontSize: '11px', fontWeight: 700, colors: [resolveMuted()] },
              },
              legend: { show: false },
              xaxis: {
                categories: series.map((p) => [
                  monthLabel(p.month),
                  p.co2AvoidedKg > 0 ? `${co2Label(p.co2AvoidedKg)} avoided` : 'carbon not priced',
                  `${p.matches} match${p.matches === 1 ? '' : 'es'}`,
                ]),
                crosshairs: { show: false },
                labels: { style: { fontSize: '11px', fontWeight: 600 } },
              },
              yaxis: {
                min: 0,
                max: Math.max(...series.map((p) => p.distanceAvoidedKm), 0) * 1.2 || undefined,
                tickAmount: 4,
                labels: { formatter: (value: number) => `${Math.round(value)}` },
              },
              grid: { padding: { top: 8 } },
            } as ApexOptions)}
          />
        </ChartPanel>

        {/* Every pairing, with its verdict — the audit trail the totals
            stand on. A saving a shipper can be told about is one that can
            be shown: which two bookings, which transporter, which road, and
            whether it was counted. */}
        <Card className="space-y-3 rounded-lg border border-border/80 bg-card p-4 sm:p-5">
          <h3 className="text-sm font-bold text-foreground">Continuations</h3>
          {rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No pairing has been made in this range yet.
            </p>
          ) : (
            <>
              <ol className="space-y-1">
                {paged.rows.map((row) => (
                  <li
                    key={row.cycleId}
                    className="flex items-center gap-3 rounded-md px-2.5 py-2 odd:bg-secondary/30"
                  >
                    <ImpactStatusBadge impact={row} className="w-[5.75rem] justify-center" />

                    <span className="min-w-0 flex-1">
                      {row.transporter ? (
                        <CompanyName
                          name={row.transporter.name}
                          size="xs"
                          className="text-xs font-semibold text-foreground"
                        />
                      ) : (
                        <span className="block text-xs font-semibold text-muted-foreground">
                          Transporter not set
                        </span>
                      )}
                      <span className="block truncate text-[10px] text-muted-foreground">
                        <span className="tabular-nums">
                          {row.empty.reference} → {row.nextLoad.reference}
                        </span>
                        <span className="mx-1">·</span>
                        {row.from?.name ?? 'Free Zone'} → {row.to?.name ?? 'Port'}
                      </span>
                    </span>

                    <span className="w-24 shrink-0 text-right">
                      {row.avoided ? (
                        <>
                          <span className="block text-xs font-bold tabular-nums text-foreground">
                            {formatKm(row.avoided.distanceKm).value} km
                          </span>
                          <span className="block text-[10px] font-medium tabular-nums text-muted-foreground">
                            {row.avoided.co2Kg !== null ? co2Label(row.avoided.co2Kg) : 'not priced'}
                            {row.avoided.provider === 'haversine' && ' · straight line'}
                          </span>
                        </>
                      ) : (
                        <span className="block text-[10px] font-medium text-muted-foreground">
                          {row.status === 'realized' ? 'not measured' : '—'}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>

              <TablePager
                paged={paged}
                noun="continuations"
                summary={
                  impact && impact.continuationsOf > rows.length
                    ? `latest ${rows.length} of ${impact.continuationsOf.toLocaleString()}`
                    : undefined
                }
              />
            </>
          )}
        </Card>
      </div>
    </section>
  );
}

/** Fleetin Impact's yellow, resolved to a literal for the same reason as the green. */
function resolveImpact(): string {
  return resolveColor('var(--impact)', '#f9ac17');
}
