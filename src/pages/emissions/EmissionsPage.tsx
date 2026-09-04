import { forwardRef, useMemo, useState, type ComponentType, type CSSProperties, type ReactNode, type SVGProps } from 'react';
import type { ApexOptions } from 'apexcharts';

import {
  FilterMenu,
  PageHeader,
  TablePager,
  ViewTabs,
  usePagedRows,
  type FilterMenuGroup,
} from '@/components';
import { Badge, Card, IconChip, Input, Skeleton } from '@/design-system';
import { ContainerIcon, Gauge, Handshake, Leaf, Route, Truck } from '@/design-system/icons';
import { ApexChart } from '@/features/shipper-bi/charts/ApexChart';
import { baseChartOptions, buildTooltipHtml, chartAnimSpeed, resolveColor } from '@/features/shipper-bi/charts/apexChartTheme';
import {
  Co2Kpi,
  ImpactStatusBadge,
  SavedForest,
  shortPlace,
  useCountUp,
  useEmissionsDashboard,
  useInView,
  useEmissionsFilterOptions,
  type CycleImpact,
  type EmissionsFilters,
  type EmissionsSlice,
} from '@/features/emissions';
import { co2Label, formatCo2, formatFactor, formatKm, treesPlantedLabel } from '@/lib/co2';
import { CompanyName } from '@/pages/empty-returns/components/marks';
import { cn } from '@/utils';

/**
 * The fleet's carbon: what it generated, and what Fleetin saved.
 *
 * ## One comparison
 *
 * The first version of this page was five tiles, two charts, three rankings
 * and a scatter — every cut of the book at once. The user's verdict on
 * 2026-09-03: "this page is hard to understand … show the saved vs the
 * generated." So the page is now one comparison, read top to bottom:
 *
 *   1. Two figures side by side. **Generated** is the carbon the trucks put
 *      out, with its sum written under it: kilometres driven × the fleet's
 *      rate. **Saved** is the carbon a realized match kept off the road, with
 *      its sum: the garage round trips that were not driven, times the truck's
 *      factor.
 *   2. The two on one scale, as two bars — so the size of one against the
 *      other is seen, not calculated.
 *   3. The same two, month by month, on one chart. Same unit, one axis.
 *   4. The details under one set of tabs: who generated it, and which matches
 *      saved it.
 *
 * Green is generated, yellow is saved, everywhere on the page and nowhere
 * else. Nothing here subtracts one from the other: a truck that drove 35 km
 * emitted 35 km of carbon, whatever else it did not have to drive.
 *
 * ## Nothing is forecast
 *
 * Every figure comes from drives that happened. A container earns its loaded
 * leg when it reaches the consignee and its return leg when the empty is
 * collected; a match counts as saved only once the truck was seen at the port
 * within hours of leaving the free zone. A booking still on the road
 * contributes what it has covered and nothing more.
 */
/**
 * The window the page opens on: this month and the eleven before it.
 *
 * Both boxes used to start empty, which is not "no filter" to a reader — it is
 * a form asking to be filled in before the numbers below can be trusted, on a
 * page whose numbers were already there. A carbon account is read by period,
 * so the page has to arrive holding one; twelve months is the span the monthly
 * chart is drawn at, so the dates and the bars agree from the first paint.
 *
 * Widening is a click. Arriving at a blank pair of date boxes over a populated
 * chart is a question the reader cannot answer without knowing what the chart
 * was already showing.
 */
function defaultRange(): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  const from = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { dateFrom: iso(from), dateTo: iso(to) };
}

export function EmissionsPage() {
  const [filters, setFilters] = useState<EmissionsFilters>(defaultRange);
  const { data, isLoading } = useEmissionsDashboard(filters);
  const { data: options } = useEmissionsFilterOptions();

  const kpis = data?.kpis;
  const impact = data?.impact;

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
     itself — see `FilterMenu`. The date range is its own pair of fields
     because a range is not a choice from a list. */
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

  const generated = formatCo2(kpis?.totalCo2Kg);
  const saved = formatCo2(impact?.co2AvoidedKg);

  /**
   * What the same work would have cost under the ordinary workflow.
   *
   * `generated + avoided`, and the addition is the only safe way round. The
   * saving is NOT derived by subtracting one total from another — it is built
   * per realized optimisation from a measured baseline (the Free Zone →
   * Garage → Port repositioning that a match removed) and summed. This figure
   * then reads that saving back on top of what was actually driven, so both
   * halves come from the same set of movements.
   *
   * Doing it the other way — taking a separately-sourced "expected" total and
   * subtracting actuals — is how a shipment's own emissions end up counted as
   * carbon saved. Nothing here can do that: the only thing added to the actual
   * figure is the repositioning distance the server measured and priced.
   */
  const driven = formatKm(kpis?.totalDistanceKm);
  const notDriven = formatKm(impact?.distanceAvoidedKm);

  return (
    /* `@container/page` on the root, not just the query classes below it: a
       page that names a container it never declares silently falls back to its
       narrowest layout at every width. `w-full min-w-0` because a page root is
       a flex item here. */
    <div className="@container/page w-full min-w-0 space-y-5 pb-12">
      <div className="animate-rise-in">
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
      </div>

      {/* ── The filters ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap-reverse items-start justify-between gap-2">
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

      {/* ── 1. Generated and saved ─────────────────────────────────────── */}
      {/* Two figures, and under each the sum that made it. The generated sum
          is the fleet's kilometres times its realised rate; the saved sum is
          the kilometres a matched truck did not drive, over the matches that
          physically happened. A reader can check either by hand. */}
      {/* The saving is the hero: two rows tall from two columns up, and two
          columns wide as well on a wide page, with the generated and the
          baseline figures stacked beside it. Auto-placement does the rest. */}
      <div className="grid gap-4 @[40rem]/page:grid-cols-2 @[64rem]/page:grid-cols-3">
        <HeroFigure
          tone="generated"
          label="Generated"
          kg={kpis?.totalCo2Kg ?? 0}
          icon={Leaf}
          loading={isLoading}
          enterDelayMs={60}
          sum={
            kpis && kpis.totalDistanceKm > 0
              ? `${driven.value} km driven × ${formatFactor(kpis.avgCo2PerKm)}`
              : 'Nothing driven in this range'
          }
          detail={
            kpis && kpis.bookingCount > 0
              ? `${kpis.bookingCount} container${kpis.bookingCount === 1 ? '' : 's'} on ${kpis.shipmentCount} shipment${kpis.shipmentCount === 1 ? '' : 's'}`
              : undefined
          }
        />
        <HeroFigure
          tone="saved"
          label="Saved"
          kg={impact?.co2AvoidedKg ?? 0}
          icon={Route}
          loading={isLoading}
          enterDelayMs={160}
          className="@[40rem]/page:row-span-2 @[64rem]/page:col-span-2"
          sum={
            impact && impact.realizedMatches > 0
              ? `${notDriven.value} km of garage trips not driven · ${impact.realizedMatches} match${impact.realizedMatches === 1 ? '' : 'es'}`
              : 'No match has been driven in this range'
          }
          detail={[
            impact && impact.co2AvoidedKg > 0 ? treesPlantedLabel(impact.co2AvoidedKg) : undefined,
            impact && impact.realizedMatches - impact.pricedMatches > 0
              ? `${impact.realizedMatches - impact.pricedMatches} of ${impact.realizedMatches} not priced — the next load has no truck yet`
              : undefined,
          ]
            .filter(Boolean)
            .join(' · ') || undefined}
        >
          {/* The trees grow once the figure has counted up — the signature
              moment of the page, and it is one moment, not two. */}
          {impact && impact.co2AvoidedKg > 0 && (
            <SavedForest co2Kg={impact.co2AvoidedKg} onGreen ground={false} startDelayMs={1000} treeScale={1.25} />
          )}
        </HeroFigure>
        {/* The baseline. Colourless on purpose: it is the one figure on this
            page that did not happen, and painting a counterfactual like a
            measurement is exactly the confusion the impact account exists to
            prevent. */}
        <HeroFigure
          tone="baseline"
          label="Expected without Fleetin"
          kg={(kpis?.totalCo2Kg ?? 0) + (impact?.co2AvoidedKg ?? 0)}
          icon={Route}
          loading={isLoading}
          enterDelayMs={260}
          sum={
            kpis && impact && impact.co2AvoidedKg > 0
              ? `${generated.value} ${generated.unit} driven + ${saved.value} ${saved.unit} of repositioning`
              : 'Same as generated — no match has been driven yet'
          }
          detail={
            impact && impact.realizedMatches > 0
              ? `The garage round trips ${impact.realizedMatches} match${impact.realizedMatches === 1 ? '' : 'es'} removed`
              : undefined
          }
        />
      </div>

      {/* ── The figures behind the two ──────────────────────────────────── */}
      {/* Six tiles, in the two colours: what the generated figure is made of
          on the yellow side, what the saving is made of on the green. Each
          counts up as it enters. The user asked for the page to carry more
          cards than the three above (2026-09-04); these are the numbers the
          sums already name, given room of their own. */}
      <div className="grid grid-cols-2 gap-3 @[46rem]/page:grid-cols-3 @[64rem]/page:grid-cols-6">
        <FigureTile tone="impact" label="Distance driven" value={kpis?.totalDistanceKm ?? 0} kind="km" icon={Route} loading={isLoading} delayMs={320} />
        <FigureTile tone="impact" label="Rate" value={kpis?.avgCo2PerKm ?? 0} kind="rate" icon={Gauge} loading={isLoading} delayMs={380} />
        <FigureTile tone="impact" label="Containers" value={kpis?.bookingCount ?? 0} kind="count" icon={ContainerIcon} loading={isLoading} delayMs={440} />
        <FigureTile tone="impact" label="Shipments" value={kpis?.shipmentCount ?? 0} kind="count" icon={Truck} loading={isLoading} delayMs={500} />
        <FigureTile tone="green" label="Distance avoided" value={impact?.distanceAvoidedKm ?? 0} kind="km" icon={Route} loading={isLoading} delayMs={560} />
        <FigureTile tone="green" label="Matches" value={impact?.realizedMatches ?? 0} kind="count" icon={Handshake} loading={isLoading} delayMs={620} />
      </div>

      {/* ── 2. One against the other ───────────────────────────────────── */}
      {/* Two bars on one scale. The number that answers "how much did we
          save compared to what we generated" is the length of the yellow bar
          against the green one, and it is printed beside them as a share. */}
      {kpis && impact && kpis.totalCo2Kg > 0 && (
        <ComparisonCard generatedKg={kpis.totalCo2Kg} savedKg={impact.co2AvoidedKg} />
      )}

      {/* ── 3. Month by month ──────────────────────────────────────────── */}
      {/* Both on one chart because they share a unit. Two series on one axis
          is the honest version of "saved vs generated" over time; a second
          axis would let the yellow columns be drawn any height at all. */}
      <MonthlyChart
        generated={data?.series ?? []}
        saved={impact?.series ?? []}
        loading={isLoading}
      />

      {/* ── 4. The details ─────────────────────────────────────────────── */}
      <DetailsPanel
        rankings={{
          vehicle: data?.byVehicle ?? [],
          transporter: data?.byTransporter ?? [],
          shipment: data?.byShipment ?? [],
        }}
        counts={data?.counts}
        totalCo2Kg={kpis?.totalCo2Kg ?? 0}
        matches={impact?.continuations ?? []}
        matchesOf={impact?.continuationsOf ?? 0}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * The two figures
 * ═══════════════════════════════════════════════════════════════════════ */

type Tone = 'generated' | 'saved' | 'baseline';

/**
 * Green is what did NOT go into the air; yellow is what did.
 *
 * This was the other way round for a revision and it read as praise for the
 * wrong number: green is the app's "good" everywhere else, so putting the
 * fleet's own exhaust in it congratulated the reader for emitting and left the
 * saving in the warning colour. Carbon generated is the cost — yellow, the
 * same accent every outstanding obligation wears — and carbon avoided is the
 * only thing on this page worth being pleased about.
 *
 * The baseline is deliberately colourless. It is the one figure here that did
 * not happen, and a counterfactual painted like a measurement is the whole
 * failure mode this page has to avoid.
 */
const TONE = {
  generated: {
    /* Yellow, deepening towards the corner, with a hairline of light on the
       top edge. The card is the cost side of the page and wears the accent
       every outstanding obligation wears. */
    card: 'border-transparent text-impact-foreground bg-[linear-gradient(150deg,var(--impact)_0%,var(--fl-orange-600)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]',
    label: 'text-impact-foreground/80',
    dot: 'bg-white/85',
    unit: 'text-impact-foreground/75',
    chip: 'bg-white/22 text-impact-foreground ring-1 ring-white/25',
    op: 'text-impact-foreground/60',
    detail: 'text-impact-foreground/75',
    disc: 'on-impact' as const,
    bar: 'bg-impact',
  },
  saved: {
    card: 'border-transparent text-success-foreground bg-[linear-gradient(160deg,var(--success)_0%,var(--success-deep)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]',
    label: 'text-success-foreground/85',
    dot: 'bg-white/90',
    unit: 'text-success-foreground/80',
    chip: 'bg-white/15 text-success-foreground ring-1 ring-white/25',
    op: 'text-success-foreground/60',
    detail: 'text-success-foreground/85',
    disc: 'on-green' as const,
    bar: 'bg-success',
  },
  baseline: {
    /* Dashed, on a dotted field: the one figure on the page that did not
       happen, drawn the way a plan is drawn. */
    card: 'border-dashed border-border-strong text-foreground bg-surface',
    label: 'text-muted-foreground',
    dot: 'bg-border-strong',
    unit: 'text-muted-foreground',
    chip: 'bg-foreground/[0.05] text-foreground ring-1 ring-border',
    op: 'text-muted-foreground',
    detail: 'text-muted-foreground',
    disc: 'on-muted' as const,
    bar: 'bg-border-strong',
  },
};

/**
 * One of the three headline figures, drawn as a small scene.
 *
 * The figure counts up when the card enters — in its final unit, so "3.5 t"
 * climbs 0 → 1.2 → 2.4 → 3.5 rather than passing through kilogrammes and
 * flipping units halfway. Under it, the sum that made it is set as an
 * equation in chips ("3,562 km driven × 0.972 kg/km"), so the arithmetic is
 * something the eye parses rather than a sentence it reads. Behind
 * everything, each card has its own weather: exhaust waves on the yellow,
 * hills and a sun on the green, a dotted field on the dashed baseline — all
 * inert, all behind the words.
 */
function HeroFigure({
  tone,
  label,
  kg,
  icon,
  sum,
  detail,
  loading,
  enterDelayMs = 0,
  className,
  children,
}: {
  tone: Tone;
  label: string;
  /** The figure, in kg CO₂. Formatted here so the count-up and the final print agree. */
  kg: number;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  sum: string;
  detail?: string;
  loading?: boolean;
  enterDelayMs?: number;
  className?: string;
  children?: ReactNode;
}) {
  const t = TONE[tone];
  const target = formatCo2(kg);
  /* Count in the unit the figure will land in. */
  const inTonnes = Math.abs(kg) >= 1000;
  const finalNumber = inTonnes ? kg / 1000 : kg;
  const decimals = inTonnes ? (finalNumber >= 100 ? 0 : 1) : kg < 100 ? 1 : 0;
  const count = useCountUp(finalNumber, { durationMs: 1000, delayMs: enterDelayMs + 200, active: !loading });
  const shown = loading
    ? '—'
    : count.done
      ? target.value
      : count.value.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

  if (loading) {
    return (
      <div className={cn('flex min-h-[11rem] flex-col justify-between gap-3 rounded-card border border-border bg-surface p-6', className)}>
        <Skeleton className="h-4 w-24 rounded-md" shape="text" />
        <Skeleton className="h-12 w-36 rounded-md" />
        <Skeleton className="h-3 w-56 rounded-md" shape="text" />
      </div>
    );
  }
  return (
    <div
      className={cn(
        'group relative flex min-h-[11rem] flex-col overflow-hidden rounded-card border p-6',
        'animate-rise-in transition-[transform,box-shadow] duration-fast hover:-translate-y-0.5 hover:shadow-lg',
        t.card,
        className,
      )}
      style={{ animationDelay: `${enterDelayMs}ms` } as CSSProperties}
    >
      <Scenery tone={tone} />

      <div className="relative flex items-start justify-between gap-3">
        <span className={cn('inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em]', t.label)}>
          <span className={cn('size-1.5 rounded-full', t.dot)} aria-hidden />
          {label}
        </span>
        <span className="transition-transform duration-fast group-hover:scale-105">
          <IconChip icon={icon} tint={t.disc} size={44} />
        </span>
      </div>

      <span className="relative mt-4 flex items-baseline gap-2">
        <strong className="text-6xl font-semibold leading-none tracking-tighter tabular-nums">{shown}</strong>
        {target.unit && <span className={cn('text-base font-semibold', t.unit)}>{target.unit}</span>}
      </span>

      {/* The sum as an equation, then the smaller facts under it. When the card
          carries the forest these hug the figure; otherwise they hold the
          bottom edge. */}
      <div className={cn('relative', children ? 'mt-4' : 'mt-auto pt-5')}>
        <SumChips text={sum} chip={t.chip} op={t.op} />
        {detail && <p className={cn('mt-2 text-xs font-semibold tabular-nums', t.detail)}>{detail}</p>}
      </div>

      {children && <div className="relative mt-auto pt-8">{children}</div>}
    </div>
  );
}

/**
 * A sum set as chips: operands in translucent pills, operators between them
 * in the quiet ink. "3,562 km driven × 0.972 kg/km" arrives as two pills and
 * a ×; "396 km … · 12 matches" as two pills with a dot. A sentence with no
 * operator in it is one pill.
 */
function SumChips({ text, chip, op }: { text: string; chip: string; op: string }) {
  const parts = text.split(/\s(×|\+|−|·)\s/);
  const pill = (part: string) => (
    <span className={cn('rounded-md px-2 py-0.5 leading-5 backdrop-blur-[2px]', chip)}>{part}</span>
  );
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5 text-[13px] font-semibold tabular-nums">
      {pill(parts[0] ?? text)}
      {/* Each operator is glued to the operand after it: when the sum wraps
          in a narrow card, the line breaks before the "+", never after it —
          a line ending on a dangling operator reads as an unfinished sum. */}
      {parts.slice(1).reduce<ReactNode[]>((nodes, part, index) => {
        if (index % 2 === 0) return nodes;
        const operator = parts[index] ?? '';
        nodes.push(
          <span key={index} className="inline-flex items-center gap-x-1.5 whitespace-nowrap">
            <span className={cn('px-0.5 text-sm', op)} aria-hidden={operator === '·'}>
              {operator === '·' ? '' : operator}
            </span>
            {pill(part)}
          </span>,
        );
        return nodes;
      }, [])}
    </p>
  );
}

/**
 * The scene behind a hero figure. Decorative and inert: `aria-hidden`, no
 * pointer events, everything light and translucent so the words on top never
 * fight it.
 */
function Scenery({ tone }: { tone: Tone }) {
  if (tone === 'saved') {
    return (
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* The sun, high on the right: a crisp disc inside a soft glow. */}
        <span className="absolute -right-6 -top-8 size-44 rounded-full bg-white/20 blur-2xl animate-glow" />
        {/* Clear of the icon disc in the corner. */}
        <span className="absolute right-32 top-7 size-9 rounded-full bg-white/30" />
        {/* Three hills, back to front, for the trees to stand on. */}
        <svg className="absolute inset-x-0 bottom-0 h-[58%] w-full" viewBox="0 0 800 200" preserveAspectRatio="none">
          <path d="M0 120 C 120 60, 260 70, 400 110 S 660 150, 800 90 V200 H0 Z" fill="white" fillOpacity="0.08" />
          <path d="M0 160 C 160 110, 300 130, 460 150 S 700 170, 800 140 V200 H0 Z" fill="white" fillOpacity="0.1" />
          <path d="M0 185 C 200 160, 420 175, 600 170 S 760 165, 800 172 V200 H0 Z" fill="white" fillOpacity="0.14" />
        </svg>
      </div>
    );
  }
  if (tone === 'generated') {
    return (
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* Exhaust: three layered waves rising through the lower right. */}
        <svg className="absolute inset-x-0 bottom-0 h-[70%] w-full" viewBox="0 0 800 200" preserveAspectRatio="none">
          <path d="M0 190 C 140 150, 260 200, 400 160 S 660 100, 800 130 V200 H0 Z" fill="white" fillOpacity="0.08" />
          <path d="M0 200 C 180 170, 320 210, 480 180 S 700 130, 800 160 V200 H0 Z" fill="white" fillOpacity="0.1" />
          <path d="M240 200 C 360 185, 520 205, 640 190 S 760 170, 800 180 V200 H240 Z" fill="white" fillOpacity="0.14" />
        </svg>
        <span className="absolute -left-10 -top-12 size-40 rounded-full bg-white/15 blur-3xl" />
      </div>
    );
  }
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 opacity-70"
      /* A dotted field, in the border grey: the texture of a plan. */
      style={{
        backgroundImage: 'radial-gradient(circle, var(--border-strong) 1px, transparent 1px)',
        backgroundSize: '18px 18px',
        maskImage: 'linear-gradient(180deg, transparent 20%, black 100%)',
        WebkitMaskImage: 'linear-gradient(180deg, transparent 20%, black 100%)',
      }}
    />
  );
}

/**
 * A small figure that counts up as it enters — `Co2Kpi`, fed a number that
 * is still moving. Kilometres, a count, or a rate, each printed the way the
 * page prints it once it has landed.
 */
function FigureTile({
  tone,
  label,
  value,
  kind,
  icon,
  loading,
  delayMs,
}: {
  tone: 'green' | 'impact';
  label: string;
  value: number;
  kind: 'km' | 'count' | 'rate';
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  loading?: boolean;
  delayMs: number;
}) {
  const count = useCountUp(value, { durationMs: 900, delayMs: delayMs + 200, active: !loading });
  const shown = count.done ? value : count.value;
  const printed =
    kind === 'km'
      ? formatKm(shown).value
      : kind === 'rate'
        ? shown.toFixed(3)
        : Math.round(shown).toLocaleString();
  const unit = kind === 'km' ? 'km' : kind === 'rate' ? 'kg/km' : undefined;
  return (
    <div
      className="animate-rise-in transition-transform duration-fast hover:-translate-y-0.5"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <Co2Kpi tone={tone} label={label} value={printed} unit={unit} icon={icon} loading={loading} />
    </div>
  );
}

/** A hundred cells, twenty to a row: one per hundredth of the expected carbon. */
const CELLS = 100;
const COLUMNS = 20;

/**
 * The comparison, as a hundred cells.
 *
 * Two bars on one scale were the first answer, and the user wanted a
 * different idea altogether — "a new concept that is not this style"
 * (2026-09-04). So the carbon the same work would have cost without Fleetin
 * — what was generated plus what was saved — is a dashed frame, drawn the
 * way the baseline is drawn everywhere else on the page, carrying its own
 * figure and holding a hundred cells, one per hundredth of it. The green
 * cells at the top-left never went out; the yellow ones did. The last green
 * cell is filled to the exact fraction, so the picture and the percentage
 * beside it agree to a decimal, and the caption under the grid says what one
 * cell weighs, so the picture stays a quantity rather than a decoration.
 *
 * Twenty to a row, the cells sized by the room they have: a ten-by-ten
 * block left most of the card empty ("the screen is not actually full"),
 * and drawing the same hundred twice — once all yellow for the baseline —
 * was "duplicate, only use one" (2026-09-05). Green at the top-left, where
 * reading starts: on the ground row the laptop fold hid it.
 */
function ComparisonCard({ generatedKg, savedKg }: { generatedKg: number; savedKg: number }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const total = generatedKg + savedKg;
  const savedShare = total > 0 ? (savedKg / total) * 100 : 0;
  const share = useCountUp(savedShare, { durationMs: 900, delayMs: 400, active: inView });
  const shown = share.done ? savedShare : share.value;
  const printedShare = shown < 10 ? shown.toFixed(1) : shown.toFixed(0);

  return (
    <Card
      ref={ref}
      className="rounded-lg border border-border/80 bg-card p-4 shadow-2xs transition-[transform,box-shadow] duration-fast hover:-translate-y-0.5 hover:shadow-md sm:p-5"
    >
      <h3 className="text-sm font-bold text-foreground">Saved against generated</h3>
      {/* The grid takes the width and the figures the end of the row; below
          64rem the figures drop under it, centred. */}
      <div className="mt-4 grid gap-6 @[64rem]/page:grid-cols-[minmax(0,1fr)_auto] @[64rem]/page:items-center @[64rem]/page:gap-10">
        <GridFrame label="Without Fleetin" figure={co2Label(total)} caption={`1 cell = ${co2Label(total / CELLS)}`}>
          <UnitGrid savedShare={savedShare} inView={inView} />
        </GridFrame>
        <div className="min-w-0 text-center @[64rem]/page:pr-4 @[64rem]/page:text-left">
          <p className="text-6xl font-bold leading-none tracking-tight tabular-nums text-success-subtle-foreground">
            {printedShare}%
          </p>
          <p className="mt-2 text-sm font-semibold text-muted-foreground">of the expected carbon, saved</p>
          <dl className="mt-6 flex flex-wrap justify-center gap-x-10 gap-y-4 @[64rem]/page:justify-start">
            <KeyFigure swatch="bg-success" label="Saved" value={co2Label(savedKg)} />
            <KeyFigure swatch="bg-impact/75" label="Generated" value={co2Label(generatedKg)} />
          </dl>
        </div>
      </div>
    </Card>
  );
}

/**
 * The frame around the grid: the baseline's name, its figure, and the
 * cells. Dashed, because what the road would have cost is a plan, and it is
 * drawn like one everywhere on this page.
 */
function GridFrame({
  label,
  figure,
  caption,
  children,
}: {
  label: string;
  figure: string;
  caption: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-lg border-2 border-dashed border-border-strong p-3 sm:p-4">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className="text-sm font-bold tabular-nums text-foreground">{figure}</span>
      </div>
      {children}
      <p className="mt-3 text-xs font-semibold tabular-nums text-muted-foreground">{caption}</p>
    </div>
  );
}

/**
 * The hundred cells, sized by the width they are given. Counted from the
 * top-left, so the saving is the first thing read; the entrance runs the
 * other way, from the bottom-right up, so the green cells are the last to
 * land.
 */
function UnitGrid({ savedShare, inView }: { savedShare: number; inView: boolean }) {
  const savedCells = (savedShare / 100) * CELLS;
  const whole = Math.floor(savedCells);
  const fraction = savedCells - whole;
  return (
    <div
      className="grid gap-1 @[40rem]/page:gap-1.5"
      style={{ gridTemplateColumns: `repeat(${COLUMNS}, minmax(0, 1fr))` }}
      role="img"
      aria-label={`Of every 100 kg of carbon expected, ${savedShare.toFixed(1)} kg were saved`}
    >
      {Array.from({ length: CELLS }, (_, index) => {
        const saved = index < whole;
        const part = index === whole && fraction >= 0.05 ? fraction : 0;
        return (
          <span
            key={index}
            className={cn(
              'aspect-square w-full rounded-[18%] transition-[transform,opacity] duration-normal ease-out',
              saved ? 'bg-success' : 'bg-impact/75',
              inView ? 'scale-100 opacity-100' : 'scale-50 opacity-0',
            )}
            style={{
              transitionDelay: `${(CELLS - 1 - index) * 6}ms`,
              ...(part > 0 && {
                backgroundImage: `linear-gradient(to right, var(--success) ${part * 100}%, transparent ${part * 100}%)`,
              }),
            }}
          />
        );
      })}
    </div>
  );
}

/** One figure of the key: the swatch the cells wear, the name, the amount. */
function KeyFigure({ swatch, label, value }: { swatch: string; label: string; value: string }) {
  return (
    <div>
      <dt className="flex items-center justify-center gap-2 text-xs font-semibold text-muted-foreground @[64rem]/page:justify-start">
        <span className={cn('h-3 w-3 shrink-0 rounded-[3px]', swatch)} aria-hidden />
        {label}
      </dt>
      <dd className="mt-1 text-2xl font-bold tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Month by month
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * One column per month, in two colours.
 *
 * The same picture as the comparison bars above, stood on end: yellow for
 * what was generated, the green saving stacked on top, so the column's full
 * height is what the month would have cost without Fleetin — printed once,
 * above it. The first cut drew three columns per month (generated, saved,
 * and a grey one that was simply the first two added), which the user
 * called unprofessional: thin bars, a third bar saying nothing new, an axis
 * in bare numbers. Now the axis reads in kilogrammes and tonnes, the columns
 * are wide enough to carry a figure, and the legend sits in the card header
 * where the title is, not floating inside the plot.
 */
function MonthlyChart({
  generated,
  saved,
  loading,
}: {
  generated: { month: string; co2Kg: number }[];
  saved: { month: string; co2AvoidedKg: number }[];
  loading: boolean;
}) {
  const months = [...new Set([...generated.map((p) => p.month), ...saved.map((p) => p.month)])].sort();
  const generatedByMonth = new Map(generated.map((p) => [p.month, p.co2Kg]));
  const savedByMonth = new Map(saved.map((p) => [p.month, p.co2AvoidedKg]));
  const totalFor = (m: string) => (generatedByMonth.get(m) ?? 0) + (savedByMonth.get(m) ?? 0);
  const axis = niceAxis(Math.max(...months.map(totalFor), 0));

  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.3 });

  return (
    <ChartPanel
      ref={ref}
      title="Month by month"
      isEmpty={!loading && months.length === 0}
      height={320}
      legend={
        <>
          <LegendItem swatch="bg-impact" label="Generated" />
          <LegendItem swatch="bg-success" label="Saved" />
          <LegendItem swatch="border border-border-strong bg-transparent" label="Without Fleetin" />
        </>
      }
    >
      {/* Mounted when reached, so the columns grow up as the reader arrives
          rather than having finished off-screen. The panel keeps its height
          either way — nothing below it moves. */}
      {inView && (
        <ApexChart
          type="bar"
          height={320}
          series={[
            { name: 'Generated', data: months.map((m) => round1(generatedByMonth.get(m) ?? 0)) },
            { name: 'Saved', data: months.map((m) => round1(savedByMonth.get(m) ?? 0)) },
          ]}
          options={baseChartOptions({
            colors: [resolveImpact(), resolveSuccess()],
            chart: {
              stacked: true,
              /* Up from the ground, the saving a beat after the carbon. */
              animations: {
                enabled: chartAnimSpeed(800) > 0,
                speed: chartAnimSpeed(800),
                animateGradually: { enabled: true, delay: 140 },
                dynamicAnimation: { enabled: true, speed: 320 },
              },
            },
            plotOptions: {
              bar: {
                columnWidth: months.length <= 3 ? '34%' : '48%',
                borderRadius: 5,
                borderRadiusApplication: 'end',
                borderRadiusWhenStacked: 'last',
                dataLabels: {
                  position: 'top',
                  /* One figure per column — the total, which is the month
                     without Fleetin. Nothing inside the segments: the tooltip
                     carries the split. */
                  total: {
                    enabled: true,
                    offsetY: -4,
                    formatter: (value: number | string) => co2Label(Number(value)),
                    style: { fontSize: '11px', fontWeight: 700, color: resolveMuted() },
                  },
                },
              },
            },
            dataLabels: { enabled: true, formatter: () => '' },
            legend: { show: false },
            stroke: { show: true, width: 2, colors: ['transparent'] },
            /* The house tooltip card, not Apex's own: the chart wrapper strips
               Apex's box, so anything but a custom card lands as bare text.
               It prints the same words the page does, a month with nothing
               saved says "none", and the footer is the one figure the
               columns are for. */
            tooltip: {
              shared: true,
              intersect: false,
              custom: ({ dataPointIndex }: { dataPointIndex: number }) => {
                const month = months[dataPointIndex];
                if (!month) return '';
                const g = generatedByMonth.get(month) ?? 0;
                const sv = savedByMonth.get(month) ?? 0;
                return buildTooltipHtml(
                  monthLabel(month),
                  [
                    { key: 'generated', label: 'Generated', value: co2Label(g), color: resolveImpact() },
                    { key: 'saved', label: 'Saved', value: sv > 0 ? co2Label(sv) : 'none', color: resolveSuccess() },
                    { key: 'baseline', label: 'Without Fleetin', value: co2Label(g + sv), color: resolveBaseline() },
                  ],
                  g > 0 && sv > 0 ? `Saved ${((sv / g) * 100).toFixed(1)}% of what was generated` : undefined,
                );
              },
            },
            xaxis: {
              categories: months.map(monthLabel),
              crosshairs: { show: false },
              labels: { style: { fontSize: '11px', fontWeight: 600 } },
            },
            yaxis: {
              min: 0,
              /* Headroom for the total above the tallest column, on ticks
                 that land on round figures — see `niceAxis`. */
              max: axis.max || undefined,
              tickAmount: axis.ticks,
              labels: {
                style: { fontSize: '11px', fontWeight: 600 },
                formatter: (value: number) => axisCo2(value),
              },
            },
            grid: { padding: { top: 12, left: 4, right: 8 }, strokeDashArray: 3 },
          } as ApexOptions)}
        />
      )}
    </ChartPanel>
  );
}

/** A swatch and a word, for the card header's own legend. */
function LegendItem({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
      <span className={cn('inline-block size-2.5 rounded-[3px]', swatch)} aria-hidden />
      {label}
    </span>
  );
}

/**
 * A ceiling for the axis that puts every tick on a round figure.
 *
 * Apex divides `max` evenly, so a max of 1.18 × the peak gave ticks like
 * "697 kg". This picks the smallest round step and tick count that clear the
 * tallest column with room for its label: 2.4 t becomes 0 · 1 t · 2 t · 3 t.
 */
function niceAxis(peakKg: number): { max: number; ticks: number } {
  if (!(peakKg > 0)) return { max: 0, ticks: 4 };
  const needed = peakKg * 1.14;
  const steps = [50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 50000];
  let best: { max: number; ticks: number } | null = null;
  for (const ticks of [3, 4, 5]) {
    for (const step of steps) {
      const max = step * ticks;
      if (max < needed) continue;
      if (!best || max < best.max || (max === best.max && ticks < best.ticks)) best = { max, ticks };
      break;
    }
  }
  return best ?? { max: needed, ticks: 4 };
}

/** An axis tick in the unit that reads: `700 kg`, `1.4 t`, and a bare `0`. */
function axisCo2(value: number): string {
  if (!(value > 0)) return '0';
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)} t`;
  return `${Math.round(value)} kg`;
}

/**
 * A chart in a card, sized so the card does not jump when data arrives.
 *
 * The hover classes reach into Apex's SVG: a column under the pointer
 * brightens a touch and lifts, which the theme's own hover state cannot do
 * because it is switched off for every chart.
 */
const ChartPanel = forwardRef<
  HTMLDivElement,
  {
    title: string;
    height: number;
    isEmpty?: boolean;
    /** The card's own legend, in the header beside the title. */
    legend?: ReactNode;
    children: ReactNode;
  }
>(function ChartPanel({ title, height, isEmpty, legend, children }, ref) {
  return (
    <Card
      ref={ref}
      className={cn(
        'space-y-3 rounded-lg border border-border/80 bg-card p-4 shadow-2xs sm:p-5',
        /* A column under the pointer brightens a touch — the theme's own
           hover state is switched off for every chart. Brightness only: a
           stacked column is two shapes, and scaling them apart would split it. */
        '[&_.apexcharts-bar-area]:transition-[filter] [&_.apexcharts-bar-area]:duration-fast',
        '[&_.apexcharts-bar-area:hover]:brightness-110',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
        <h3 className="text-sm font-bold text-foreground">{title}</h3>
        {legend && <div className="flex flex-wrap items-center gap-x-4 gap-y-1">{legend}</div>}
      </div>
      {isEmpty ? (
        <div className="flex items-center justify-center text-sm text-muted-foreground" style={{ height }}>
          Nothing has been driven in this range yet.
        </div>
      ) : (
        <div style={{ height }}>{children}</div>
      )}
    </Card>
  );
});

/* ═══════════════════════════════════════════════════════════════════════════
 * The details
 * ═══════════════════════════════════════════════════════════════════════ */

type DetailTab = 'vehicle' | 'transporter' | 'shipment' | 'match';

const DETAIL_TABS: { key: DetailTab; label: string; noun: string }[] = [
  { key: 'vehicle', label: 'By vehicle', noun: 'vehicles' },
  { key: 'transporter', label: 'By transporter', noun: 'transporters' },
  { key: 'shipment', label: 'By shipment', noun: 'shipments' },
  { key: 'match', label: 'Saved by match', noun: 'matches' },
];

/** Rows per page. Eight is what fits without the card outgrowing the chart. */
const PAGE_SIZE = 8;

/**
 * Where the two figures came from, one list at a time.
 *
 * Three cuts of the generated figure — who burned it, at which grain — and
 * one cut of the saved figure — which matches, between which two places. One
 * panel and a switcher rather than four cards, so the page ends with one
 * question answered at a time instead of thirty rows answering four.
 *
 * The rankings share one denominator, and it is named: every bar and every
 * percentage is this row's share of the CO₂ generated in view, the same
 * number the green figure at the top of the page shows.
 */
function DetailsPanel({
  rankings,
  counts,
  totalCo2Kg,
  matches,
  matchesOf,
}: {
  rankings: Record<'vehicle' | 'transporter' | 'shipment', EmissionsSlice[]>;
  counts?: { vehicles: number; transporters: number; shipments: number };
  totalCo2Kg: number;
  matches: CycleImpact[];
  matchesOf: number;
}) {
  const [tab, setTab] = useState<DetailTab>('transporter');
  const noun = DETAIL_TABS.find((t) => t.key === tab)?.noun ?? 'rows';
  const rows: (EmissionsSlice | CycleImpact)[] = tab === 'match' ? matches : rankings[tab];
  /* `resetKey` on the tab: switching from a 3-page vehicle list to a 1-page
     transporter list must not leave the reader on page 3 of nothing. */
  const paged = usePagedRows(rows, { pageSize: PAGE_SIZE, resetKey: tab });
  const population =
    tab === 'vehicle'
      ? counts?.vehicles
      : tab === 'transporter'
        ? counts?.transporters
        : tab === 'shipment'
          ? counts?.shipments
          : matchesOf;
  const total = formatCo2(totalCo2Kg);
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.15 });

  return (
    <Card ref={ref} className="space-y-3 rounded-lg border border-border/80 bg-card p-4 shadow-2xs sm:p-5">
      <ViewTabs
        label="Details"
        accent="success"
        tabs={DETAIL_TABS.map((t) => ({ key: t.key, label: t.label }))}
        value={tab}
        onChange={setTab}
        actions={
          tab === 'match' ? undefined : (
            <span className="whitespace-nowrap text-xs font-semibold text-muted-foreground">
              of{' '}
              <strong className="font-bold tabular-nums text-foreground">
                {total.value} {total.unit}
              </strong>{' '}
              generated
            </span>
          )
        }
      />

      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {tab === 'match' ? 'No match has been made in this range yet.' : 'Nothing has been driven in this range yet.'}
        </p>
      ) : (
        <>
          {/* `key` on the tab and page: a fresh list arrives row by row. */}
          <ol key={`${tab}-${paged.rangeStart}`} className="space-y-1">
            {tab === 'match'
              ? (paged.rows as CycleImpact[]).map((row, index) => (
                  <MatchRow key={row.cycleId} row={row} index={index} />
                ))
              : (paged.rows as EmissionsSlice[]).map((row, index) => (
                  <RankRow
                    key={row.id}
                    row={row}
                    index={index}
                    rank={paged.rangeStart + index}
                    totalCo2Kg={totalCo2Kg}
                    grown={inView}
                  />
                ))}
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

/** One row of a ranking: who, their share of the generated figure, the figure. */
function RankRow({
  row,
  index,
  rank,
  totalCo2Kg,
  grown,
}: {
  row: EmissionsSlice;
  index: number;
  rank: number;
  totalCo2Kg: number;
  grown: boolean;
}) {
  const share = totalCo2Kg > 0 ? (row.co2Kg / totalCo2Kg) * 100 : 0;
  return (
    <li
      className="flex items-center gap-3 rounded-md px-2.5 py-2 odd:bg-secondary/30 animate-rise-in transition-[background-color,box-shadow,transform] duration-fast hover:-translate-y-px hover:bg-secondary/60 hover:shadow-2xs"
      style={{ animationDelay: `${index * 45}ms` }}
    >
      <span className="w-5 shrink-0 text-[11px] font-bold tabular-nums text-muted-foreground">{rank}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold text-foreground" title={row.label}>
          {row.label}
        </span>
        {row.sublabel && <span className="block truncate text-[10px] text-muted-foreground">{row.sublabel}</span>}
      </span>
      {/* The share, in a bounded track: the empty part of the track is what
          makes the filled part mean something. */}
      <span
        className="hidden h-2 w-32 shrink-0 overflow-hidden rounded-full bg-secondary @[46rem]/page:block @[46rem]/page:w-48"
        aria-hidden
      >
        <span
          className="block h-full rounded-full bg-success transition-[width] ease-out"
          style={{
            width: grown ? `${Math.max(share, 1.5)}%` : '0%',
            transitionDuration: '700ms',
            transitionDelay: `${120 + index * 60}ms`,
          }}
        />
      </span>
      <span className="w-24 shrink-0 text-right">
        <span className="block text-xs font-bold tabular-nums text-foreground">{co2Label(row.co2Kg)}</span>
        <span className="block text-[10px] font-medium tabular-nums text-muted-foreground">
          {share >= 0.1 ? `${share.toFixed(1)}%` : '<0.1%'}
        </span>
      </span>
    </li>
  );
}

/** One match: its state, whose truck, the two bookings and the two places, and what it saved. */
function MatchRow({ row, index }: { row: CycleImpact; index: number }) {
  return (
    <li
      className="flex items-center gap-3 rounded-md px-2.5 py-2 odd:bg-secondary/30 animate-rise-in transition-[background-color,box-shadow,transform] duration-fast hover:-translate-y-px hover:bg-secondary/60 hover:shadow-2xs"
      style={{ animationDelay: `${index * 45}ms` }}
    >
      <ImpactStatusBadge impact={row} className="w-[5.75rem] justify-center" />
      <span className="min-w-0 flex-1">
        {row.transporter ? (
          <CompanyName name={row.transporter.name} size="xs" className="text-xs font-semibold text-foreground" />
        ) : (
          <span className="block text-xs font-semibold text-muted-foreground">Transporter not set</span>
        )}
        <span className="block truncate text-[10px] text-muted-foreground">
          <span className="tabular-nums">
            {row.empty.reference} → {row.nextLoad.reference}
          </span>
          <span className="mx-1">·</span>
          {shortPlace(row.from?.name ?? 'Free Zone')} → {shortPlace(row.to?.name ?? 'Port')}
          {/* A handover names the truck's carrier too: the box was one
              company's, the truck another's. */}
          {row.nextTransporter && row.transporter && row.nextTransporter.id !== row.transporter.id && (
            <>
              <span className="mx-1">·</span>
              {row.nextTransporter.name}'s truck
            </>
          )}
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
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Helpers
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * Token colours resolved to literals.
 *
 * ApexCharts paints into SVG presentation attributes, which cannot read a CSS
 * custom property, so every token a chart uses is resolved at render. The
 * fallback is the token's light-theme value, so a chart drawn before styles
 * settle is the right colour rather than black.
 */
function resolveSuccess(): string {
  return resolveColor('var(--success)', '#2E7D32');
}

function resolveImpact(): string {
  return resolveColor('var(--impact)', '#f9ac17');
}

/** The colourless baseline — the border grey its tile and bar use. */
function resolveBaseline(): string {
  return resolveColor('var(--border-strong)', '#9aa8b5');
}

function resolveMuted(): string {
  return resolveColor('var(--muted-foreground)', '#64748B');
}

/** `2026-08` → `Aug 2026`. */
function monthLabel(month: string): string {
  const [year, index] = month.split('-');
  const date = new Date(Number(year), Number(index) - 1, 1);
  return date.toLocaleString(undefined, { month: 'short', year: 'numeric' });
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
