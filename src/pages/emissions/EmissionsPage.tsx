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
import { Leaf, Route } from '@/design-system/icons';
import { ApexChart } from '@/features/shipper-bi/charts/ApexChart';
import { baseChartOptions, buildTooltipHtml, chartAnimSpeed, resolveColor } from '@/features/shipper-bi/charts/apexChartTheme';
import {
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
import { co2Label, formatCo2, formatFactor, formatKm, treeYearEquivalent } from '@/lib/co2';
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
            impact && impact.co2AvoidedKg > 0 ? `≈ ${treeYearEquivalent(impact.co2AvoidedKg)}` : undefined,
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
            <SavedForest co2Kg={impact.co2AvoidedKg} onGreen startDelayMs={1000} className="mt-3" />
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
    card: 'border-transparent bg-impact text-impact-foreground',
    label: 'text-impact-foreground/85',
    unit: 'text-impact-foreground/80',
    sum: 'text-impact-foreground/95',
    detail: 'text-impact-foreground/75',
    chip: 'on-impact' as const,
    bar: 'bg-impact',
  },
  saved: {
    card: 'border-transparent bg-success text-success-foreground',
    label: 'text-success-foreground/90',
    unit: 'text-success-foreground/85',
    sum: 'text-success-foreground/95',
    detail: 'text-success-foreground/80',
    chip: 'on-green' as const,
    bar: 'bg-success',
  },
  baseline: {
    card: 'border-border bg-surface-sunken text-foreground',
    label: 'text-muted-foreground',
    unit: 'text-muted-foreground',
    sum: 'text-foreground/90',
    detail: 'text-muted-foreground',
    chip: 'neutral' as const,
    bar: 'bg-border-strong',
  },
};

/**
 * One of the three headline figures, with its sum written under it.
 *
 * The sum is the point. "3.5 t" alone is a number to be trusted; "3,562 km
 * driven × 0.972 kg/km" is a number to be checked, and a page the user found
 * hard to understand needed the second kind.
 *
 * The figure counts up when the card enters — in its final unit, so "3.5 t"
 * climbs 0 → 1.2 → 2.4 → 3.5 rather than passing through kilogrammes and
 * flipping units halfway. Behind the words, each tone carries its own faint
 * weather: drifting particles and airflow for the carbon that went up, a
 * breathing glow and leaf curves for the carbon that did not, a still haze
 * for the baseline. Opacity and transforms only, behind everything, and
 * never in the way of a figure.
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
      <div className={cn('flex min-h-[10rem] flex-col justify-between gap-3 rounded-card border border-border bg-surface p-5', className)}>
        <Skeleton className="h-4 w-24 rounded-md" shape="text" />
        <Skeleton className="h-10 w-32 rounded-md" />
        <Skeleton className="h-3 w-56 rounded-md" shape="text" />
      </div>
    );
  }
  return (
    <div
      className={cn(
        'group relative flex min-h-[10rem] flex-col gap-3 overflow-hidden rounded-card border p-5 shadow-2xs',
        'animate-rise-in transition-[transform,box-shadow] duration-fast hover:-translate-y-0.5 hover:shadow-md',
        t.card,
        className,
      )}
      style={{ animationDelay: `${enterDelayMs}ms` } as CSSProperties}
    >
      <Weather tone={tone} />
      <div className="relative flex items-start justify-between gap-2">
        <span className={cn('text-xs font-bold uppercase tracking-wider', t.label)}>{label}</span>
        <span className="transition-transform duration-fast group-hover:scale-105">
          <IconChip icon={icon} tint={t.chip} size={44} />
        </span>
      </div>
      <span className="relative flex items-baseline gap-2">
        <strong className="text-5xl font-semibold leading-none tracking-tight tabular-nums">{shown}</strong>
        {target.unit && <span className={cn('text-sm font-semibold', t.unit)}>{target.unit}</span>}
      </span>
      <div className="relative mt-auto space-y-0.5">
        <p className={cn('text-sm font-semibold tabular-nums', t.sum)}>{sum}</p>
        {detail && <p className={cn('text-xs font-medium tabular-nums', t.detail)}>{detail}</p>}
      </div>
      {children && <div className="relative">{children}</div>}
    </div>
  );
}

/**
 * The faint weather behind a hero figure. Decorative and inert: it is
 * `aria-hidden`, takes no pointer events, and stays under 20% opacity so the
 * words on top never have to fight it.
 */
function Weather({ tone }: { tone: Tone }) {
  if (tone === 'saved') {
    return (
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <span className="absolute -right-16 -top-20 size-64 rounded-full bg-white/20 blur-3xl animate-glow" />
        <span className="absolute -bottom-24 -left-10 size-56 rounded-full bg-white/10 blur-3xl animate-glow" style={{ animationDelay: '3s' }} />
        <svg className="absolute inset-0 h-full w-full opacity-[0.14]" viewBox="0 0 400 160" preserveAspectRatio="none">
          <path d="M-20 130 C 80 90, 140 150, 240 100 S 380 60, 440 90" fill="none" stroke="white" strokeWidth="1.5" />
          <path d="M-20 150 C 100 120, 180 165, 300 120 S 400 95, 440 110" fill="none" stroke="white" strokeWidth="1" />
        </svg>
        <Particles color="rgba(255,255,255,0.55)" />
      </div>
    );
  }
  if (tone === 'generated') {
    return (
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <svg className="absolute inset-0 h-full w-full opacity-[0.16]" viewBox="0 0 400 160" preserveAspectRatio="none">
          <path d="M-20 40 C 60 20, 120 60, 200 40 S 330 20, 440 45" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <path d="M-20 70 C 80 55, 150 90, 240 70 S 360 50, 440 75" fill="none" stroke="currentColor" strokeWidth="1" />
        </svg>
        <Particles color="rgba(0,0,0,0.28)" />
      </div>
    );
  }
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <Particles color="rgba(0,0,0,0.16)" still />
    </div>
  );
}

/** A handful of soft dots, drifting slowly — or held still for the baseline. */
function Particles({ color, still = false }: { color: string; still?: boolean }) {
  return (
    <>
      {PARTICLES.map((p, index) => (
        <span
          key={`${p.x}-${p.y}`}
          className={cn('absolute rounded-full', !still && 'animate-drift')}
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            background: color,
            opacity: p.opacity,
            animationDelay: `${index * 1.3}s`,
            animationDuration: `${8 + index * 1.7}s`,
          }}
        />
      ))}
    </>
  );
}

/** Fixed positions, so the weather is the same on every render. */
const PARTICLES = [
  { x: 12, y: 70, size: 5, opacity: 0.7 },
  { x: 28, y: 32, size: 3, opacity: 0.55 },
  { x: 47, y: 78, size: 4, opacity: 0.6 },
  { x: 63, y: 22, size: 6, opacity: 0.45 },
  { x: 78, y: 62, size: 3, opacity: 0.65 },
  { x: 90, y: 40, size: 4, opacity: 0.5 },
];

/**
 * The two bars, drawn the moment the reader reaches them.
 *
 * Both grow from nothing to their length on entry, the green segment last,
 * so the reduction is seen happening rather than found. The share counts up
 * behind the bars and slides in once they have settled.
 */
function ComparisonCard({ generatedKg, savedKg }: { generatedKg: number; savedKg: number }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const savedShare = generatedKg > 0 && savedKg > 0 ? (savedKg / generatedKg) * 100 : null;
  const share = useCountUp(savedShare ?? 0, { durationMs: 700, delayMs: 700, active: inView });
  return (
    <Card
      ref={ref}
      className="space-y-3 rounded-lg border border-border/80 bg-card p-4 shadow-2xs transition-[transform,box-shadow] duration-fast hover:-translate-y-0.5 hover:shadow-md sm:p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-foreground">Saved against generated</h3>
        {savedShare !== null && (
          <span
            className={cn(
              'text-xs font-semibold text-muted-foreground transition-[opacity,transform] duration-normal',
              inView ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0',
            )}
            style={{ transitionDelay: '700ms' }}
          >
            Saved{' '}
            <strong className="tabular-nums text-foreground">
              {share.value >= 10 ? share.value.toFixed(0) : share.value.toFixed(1)}%
            </strong>{' '}
            of what was generated
          </span>
        )}
      </div>
      {/* Two bars on one scale. The grey one is what the road would have
          cost without the matches. The second is the same road with
          Fleetin: yellow for what was generated, green for the part that
          was not driven — the two add up to the grey bar above, which is
          the whole comparison in one glance. The user's own layout,
          2026-09-03: "so we can see a yellow and a green". */}
      <CompareBar label="Without Fleetin" tone="baseline" kg={generatedKg + savedKg} maxKg={generatedKg + savedKg} grown={inView} />
      <WithFleetinBar generatedKg={generatedKg} savedKg={savedKg} grown={inView} />
    </Card>
  );
}

/** One bar of the comparison: a label, a fill on the shared scale, the figure. */
function CompareBar({
  label,
  tone,
  kg,
  maxKg,
  grown,
}: {
  label: string;
  tone: Tone;
  kg: number;
  maxKg: number;
  /** False until the card is in view; the fill grows from nothing when it flips. */
  grown: boolean;
}) {
  const share = maxKg > 0 ? Math.min(100, (kg / maxKg) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 text-xs font-semibold text-muted-foreground">{label}</span>
      <span className="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-secondary" aria-hidden>
        <span
          className={cn('block h-full rounded-full transition-[width] duration-slow ease-out', TONE[tone].bar)}
          style={{ width: grown ? `${Math.max(share, kg > 0 ? 1 : 0)}%` : '0%', transitionDuration: '800ms' }}
        />
      </span>
      <span className="w-44 shrink-0 text-right text-sm font-bold tabular-nums text-foreground">{co2Label(kg)}</span>
    </div>
  );
}

/**
 * The road with Fleetin, as one bar in two colours: yellow for the carbon
 * generated, green for the carbon that was not, laid end to end on the
 * baseline's scale so together they reach the grey bar above.
 */
function WithFleetinBar({ generatedKg, savedKg, grown }: { generatedKg: number; savedKg: number; grown: boolean }) {
  const total = generatedKg + savedKg;
  const generatedShare = total > 0 ? (generatedKg / total) * 100 : 0;
  const savedShare = total > 0 ? (savedKg / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 text-xs font-semibold text-muted-foreground">With Fleetin</span>
      <span className="flex h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-secondary" aria-hidden>
        <span
          className={cn('block h-full transition-[width] ease-out', TONE.generated.bar)}
          style={{ width: grown ? `${generatedShare}%` : '0%', transitionDuration: '800ms' }}
        />
        {/* The green grows in after the yellow has landed. */}
        <span
          className={cn('block h-full transition-[width] ease-out', TONE.saved.bar)}
          style={{
            width: grown ? `${Math.max(savedShare, savedKg > 0 ? 1 : 0)}%` : '0%',
            transitionDuration: '600ms',
            transitionDelay: '500ms',
          }}
        />
      </span>
      <span className="flex w-44 shrink-0 flex-wrap items-baseline justify-end gap-x-1.5 text-right tabular-nums">
        <span className="text-sm font-bold text-foreground">{co2Label(generatedKg)}</span>
        {savedKg > 0 && (
          <span className="text-xs font-semibold text-success-subtle-foreground">+ {co2Label(savedKg)} saved</span>
        )}
      </span>
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
