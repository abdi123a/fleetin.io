import { useCallback, useEffect } from 'react';
import type { ComponentType, ReactNode, SVGProps } from 'react';
import { Badge, Card, IconChip, type IconChipTint } from '@/design-system';
import { ExternalLink } from '@/design-system/icons';
import { cn } from '@/utils';
import type { ReportBadgeStatus } from './missionReport';
import { formatDuration } from './reportFormat';

/**
 * The small vocabulary both shipper reports are typeset in.
 *
 * One status badge, one field, one KPI tile, one proportional bar — so the
 * mission report and the monthly report read as two pages of the same document
 * rather than two dashboards. Frames stay plain: no accent stripes, no coloured
 * card edges. Status speaks through the badge and through the one figure it
 * qualifies, never through the furniture.
 *
 * Colour discipline, from the specification's UX section: teal is the working
 * colour of every bar and every neutral figure; orange marks the one stage
 * asking for attention; the three semantic status colours appear only inside a
 * status badge or on the number a deadline was missed by.
 */

/* ═══════════════════════════════════════════════════════════════════════════
 * Status (§9, §16)
 * ═══════════════════════════════════════════════════════════════════════ */

const STATUS_META: Record<
  ReportBadgeStatus,
  { label: string; intent: 'success' | 'warning' | 'destructive' | 'info' | 'default' }
> = {
  ontime: { label: 'On Time', intent: 'success' },
  attention: { label: 'Attention', intent: 'warning' },
  delayed: { label: 'Delayed', intent: 'destructive' },
  due_soon: { label: 'Deadline Soon', intent: 'warning' },
  awaiting: { label: 'In Progress', intent: 'info' },
  not_applicable: { label: 'Not Applicable', intent: 'default' },
};

export function ReportStatusBadge({
  status,
  size = 'sm',
  className,
}: {
  status: ReportBadgeStatus;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const meta = STATUS_META[status];
  return (
    <Badge
      variant="subtle"
      intent={meta.intent}
      size={size}
      className={cn('uppercase tracking-[0.08em]', className)}
    >
      {meta.label}
    </Badge>
  );
}

/**
 * One line that wants a second look before the reader moves on — the month's
 * standout metric, named. `onClick` marks it interactive (jumps to the
 * section it summarises) and grows a trailing icon; without one it is a plain
 * flag, not a false promise of somewhere to go.
 */
export function ReportAlertPill({
  icon: Icon,
  children,
  onClick,
  className,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (event) => (event.key === 'Enter' || event.key === ' ') && onClick() : undefined}
      className={cn(
        'inline-flex items-center gap-2 self-start rounded-full bg-warning-subtle px-3.5 py-2 text-[13px] font-semibold text-warning-subtle-foreground',
        onClick &&
          'cursor-pointer transition-colors hover:bg-warning-subtle/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className="text-left">{children}</span>
      {onClick && <ExternalLink className="size-3.5 shrink-0" aria-hidden />}
    </div>
  );
}

/**
 * A figure that needs its box: a hypothetical or a headline cost, set apart
 * from the section's ordinary stats so the reader reads it as "the number
 * that matters here" rather than one more field in the grid.
 */
export function ReportCallout({
  value,
  caption,
  tone = 'warning',
  className,
}: {
  value: ReactNode;
  caption: ReactNode;
  tone?: 'warning' | 'accent' | 'neutral';
  className?: string;
}) {
  const toneClass =
    tone === 'warning'
      ? 'bg-warning-subtle text-warning-subtle-foreground'
      : tone === 'accent'
        ? 'bg-accent-subtle text-accent-subtle-foreground'
        : 'bg-muted text-foreground';
  return (
    <div className={cn('flex items-center gap-4 rounded-lg p-4', toneClass, className)}>
      <p className="shrink-0 whitespace-nowrap font-mono text-2xl font-extrabold tabular-nums leading-none">
        {value}
      </p>
      <p className="text-[11.5px] leading-snug opacity-80">{caption}</p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * The printable sheet
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * Swaps a dark theme for light while the print dialog is open.
 *
 * A report is a document: it is the same object on screen, in a PDF and in a
 * printer's tray, and paper does not follow the viewer's theme. Registering on
 * `beforeprint` rather than wrapping `window.print()` means Ctrl-P produces the
 * same PDF as the button does.
 */
export function useReportPrint(): () => void {
  useEffect(() => {
    const root = document.documentElement;
    let restoreDark = false;

    const before = () => {
      restoreDark = root.classList.contains('dark');
      if (!restoreDark) return;
      root.classList.remove('dark');
      root.classList.add('light');
      root.style.colorScheme = 'light';
    };
    const after = () => {
      if (!restoreDark) return;
      root.classList.remove('light');
      root.classList.add('dark');
      root.style.colorScheme = 'dark';
      restoreDark = false;
    };

    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, []);

  return useCallback(() => window.print(), []);
}

export interface ReportSheetProps {
  /** Printed above the first section on paper only — the document's letterhead. */
  letterhead: ReactNode;
  /** Printed below the last section on paper only. */
  footnote?: ReactNode;
  className?: string;
  children: ReactNode;
}

/**
 * The report's paper. `report-sheet` is what the print stylesheet keys on: the
 * application shell around it is removed, and this becomes the document.
 */
export function ReportSheet({ letterhead, footnote, className, children }: ReportSheetProps) {
  return (
    <div className={cn('report-sheet flex flex-col gap-3', className)}>
      <div className="hidden print:block">{letterhead}</div>
      {children}
      {footnote && <div className="hidden print:block">{footnote}</div>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Sections and fields
 * ═══════════════════════════════════════════════════════════════════════ */

export interface ReportCardProps {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  tint?: IconChipTint;
  title: string;
  subtitle?: ReactNode;
  right?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** The shell every report section shares: icon chip, title, optional right slot. */
export function ReportCard({
  icon,
  tint,
  title,
  subtitle,
  right,
  className,
  children,
}: ReportCardProps) {
  return (
    <Card
      className={cn(
        'report-block space-y-4 rounded-lg border border-border/80 bg-card p-4 shadow-xs sm:p-5',
        className,
      )}
    >
      {/* `flex-wrap` with a `basis` floor on the title: a card whose `right`
          slot holds two status chips squeezed the heading into a three-line
          column on a phone. Below that width the chips take their own line
          instead, and `ml-auto` still pins them right on a wrapped row. */}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
        <IconChip icon={icon} tint={tint} size={36} />
        <div className="min-w-0 flex-1 basis-40">
          <p className="text-sm font-bold leading-tight text-foreground">{title}</p>
          {subtitle && <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>}
        </div>
        {right && <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">{right}</div>}
      </div>
      {children}
    </Card>
  );
}

export function ReportField({
  label,
  value,
  mono = false,
  className,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <p className="text-[10px] uppercase tracking-[0.09em] text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-0.5 break-words text-[13px] font-medium leading-snug text-foreground',
          mono && 'font-mono tabular-nums',
        )}
      >
        {value}
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Bars
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * Bar length ∝ time consumed. Teal is the report's working colour; the single
 * orange bar is the stage that consumed the most — the bottleneck the
 * specification asks to make immediately visible.
 */
export function DurationBar({
  value,
  max,
  accented = false,
  className,
}: {
  value: number;
  max: number;
  accented?: boolean;
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(2, (value / max) * 100)) : 0;
  return (
    <div className={cn('h-1.5 overflow-hidden rounded-full bg-secondary', className)}>
      <div
        className={cn('h-full rounded-full', accented ? 'bg-accent' : 'bg-primary/70')}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** Active operational time against waiting time — §4's one composition figure. */
export function ActiveWaitingBar({ activePct }: { activePct: number }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[11.5px] text-muted-foreground">
        <span>
          Active operations <b className="font-mono tabular-nums text-foreground">{activePct}%</b>
        </span>
        <span>
          Waiting / idle{' '}
          <b className="font-mono tabular-nums text-foreground">{100 - activePct}%</b>
        </span>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-secondary">
        <div className="h-full bg-primary" style={{ width: `${activePct}%` }} />
        <div className="h-full flex-1 bg-accent/50" />
      </div>
    </div>
  );
}

export interface ProportionBarRow {
  key: string;
  label: string;
  /** Whatever the bars are measured in — ms, a count, a percentage point. Scales the bar only. */
  value: number;
  /** Already formatted for display, e.g. "1d 18h" or "42%". */
  displayValue: string;
  /** The one row the section wants the eye to land on first. */
  accented?: boolean;
  /** Bad-news tone for a row whose *value* is unwelcome — a fee, a late count. */
  tone?: 'neutral' | 'bad';
}

/**
 * A label, a proportional bar, a figure — repeated. The report's default shape
 * for "compare N things on one scale": responsibility shares, a container's
 * flow counts, exception counts. Every row shares one `max` so the bars are
 * comparable at a glance, and the widest block needs no annotation to be found.
 */
export function ProportionBarList({
  rows,
  compact = false,
  className,
}: {
  rows: ProportionBarRow[];
  /** Narrower label column, for a block that sits beside a chart rather than filling the section. */
  compact?: boolean;
  className?: string;
}) {
  const max = Math.max(...rows.map((row) => row.value), 0);
  return (
    <div className={cn('grid gap-2', className)}>
      {rows.map((row) => (
        <div
          key={row.key}
          className={cn(
            'grid items-center gap-2.5 sm:gap-3',
            compact
              ? 'grid-cols-[92px_1fr_60px] sm:grid-cols-[112px_1fr_68px]'
              : 'grid-cols-[124px_1fr_78px] sm:grid-cols-[168px_1fr_92px]',
          )}
        >
          <span
            className={cn(
              'truncate text-[12.5px]',
              row.accented ? 'font-semibold text-foreground' : 'text-muted-foreground',
            )}
          >
            {row.label}
          </span>
          <DurationBar
            value={row.value}
            max={max}
            accented={row.accented}
            className="max-w-[420px]"
          />
          <span
            className={cn(
              'text-right font-mono text-xs tabular-nums',
              row.tone === 'bad'
                ? 'font-semibold text-destructive'
                : row.accented
                  ? 'font-semibold text-accent'
                  : 'text-foreground',
            )}
          >
            {row.displayValue}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Small type helpers
 * ═══════════════════════════════════════════════════════════════════════ */

/** The uppercase label that opens a sub-block inside a section. */
export function ReportEyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-[10px] uppercase tracking-[0.09em] text-muted-foreground">{children}</p>
  );
}

/** What a section says when the month, or the mission, genuinely has nothing. */
export function ReportEmpty({ children }: { children: ReactNode }) {
  return <p className="text-[12.5px] text-muted-foreground">{children}</p>;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Paper furniture
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * The letterhead, printed at the top of the PDF only — on screen the page's
 * own header already carries the identity, and printing it twice would cost a
 * third of the first page.
 */
export function ReportLetterhead({
  shipperName,
  title,
  period,
  generatedAt,
}: {
  shipperName: string;
  title: string;
  period: string;
  generatedAt: string;
}) {
  return (
    <div className="mb-2 flex items-end justify-between gap-4 border-b-2 border-foreground pb-2">
      <div>
        <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
          Fleetin · {title}
        </p>
        <p className="text-base font-bold leading-tight text-foreground">{shipperName}</p>
        <p className="text-[11px] text-muted-foreground">{period}</p>
      </div>
      <p className="text-right font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
        Generated {generatedAt}
      </p>
    </div>
  );
}

/** The one sentence every printed report closes with. */
export function ReportFootnote() {
  return (
    <p className="mt-1 border-t border-border pt-1.5 text-center text-[9px] text-muted-foreground">
      Every duration and indicator on this report is computed automatically from recorded mission
      event timestamps. Nothing is entered by hand.
    </p>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Data graphics
 *
 * Hand-drawn in CSS and SVG rather than through the charting library, for two
 * reasons: a report is printed, and a canvas-sized Apex chart is unreliable on
 * paper; and these are small, exact shapes (a proportional ribbon, a ring, a
 * dated track) where a chart library's axes and legends would add furniture
 * without adding information.
 *
 * Colour follows the design system's rule that a series which *means* something
 * wears a status colour and a series that is merely identity wears the ordinal
 * ramp: working time takes `--chart-step-*` in lifecycle order, waiting takes
 * the report's one orange, and a missed deadline takes destructive.
 * ═══════════════════════════════════════════════════════════════════════ */

const STEP_FILL: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: 'bg-[var(--chart-step-1)]',
  2: 'bg-[var(--chart-step-2)]',
  3: 'bg-[var(--chart-step-3)]',
  4: 'bg-[var(--chart-step-4)]',
  5: 'bg-[var(--chart-step-5)]',
};

/**
 * How each operational stage is drawn, by key.
 *
 * The mission report's own ribbon is built stage by stage inside
 * `missionReport.ts`; every *aggregate* of missions — a month, a shipment —
 * redraws the same seven intervals and needs the same tone and rung, so the
 * three pictures read as one shape. Keys mirror `STAGE_ROWS` in
 * `monthlyReport.ts`.
 */
export const STAGE_VISUAL: Record<string, { tone: 'active' | 'waiting'; step: 1 | 2 | 3 | 4 | 5 }> = {
  wait_pickup: { tone: 'waiting', step: 1 },
  loading: { tone: 'active', step: 1 },
  transit: { tone: 'active', step: 2 },
  wait_dropoff: { tone: 'waiting', step: 1 },
  unloading: { tone: 'active', step: 3 },
  depotage: { tone: 'active', step: 4 },
  empty_return: { tone: 'active', step: 5 },
};

export interface RibbonSegment {
  key: string;
  label: string;
  /** Share of the ribbon, 0–100. */
  share: number;
  /** Rendered under the label in the legend — already formatted. */
  value: string;
  tone: 'active' | 'waiting';
  step: 1 | 2 | 3 | 4 | 5;
  isLongest?: boolean;
}

/**
 * Which rung of the teal ramp each working arc gets.
 *
 * `segment.step` is the stage's position in the *lifecycle*, and using it
 * directly meant a mission that only recorded its last two stages drew
 * teal-800 beside teal-900 — two arcs the eye reads as one solid ring. So the
 * ramp is spread across the working segments that are actually present, in
 * lifecycle order: light for the earliest stage, darkest for the last, with
 * the full brand range in between however many there are. Waiting is exempt —
 * it keeps the report's one orange, and would only eat a rung of separation.
 */
/**
 * A share, rounded without lying.
 *
 * `Math.round` printed a one-minute hold inside a twenty-hour mission as "0%"
 * next to a "100%" — two figures that add to a hundred and describe a split
 * that is not one. Anything measured but sub-1% says so instead.
 */
export function formatShare(share: number): string {
  if (share > 0 && share < 0.5) return '<1%';
  if (share < 100 && share >= 99.5) return '>99%';
  return `${Math.round(share)}%`;
}

export function rampSteps(
  segments: RibbonSegment[],
  /** `reverse` gives rung 5 — the deepest teal — to the FIRST segment. Use it
      where the order is rank (the biggest holder leads) rather than lifecycle. */
  direction: 'forward' | 'reverse' = 'forward',
): Map<string, 1 | 2 | 3 | 4 | 5> {
  const working = segments.filter((segment) => segment.tone !== 'waiting');
  const span = working.length - 1;
  const ramp = new Map<string, 1 | 2 | 3 | 4 | 5>();
  working.forEach((segment, index) => {
    /* One lone stage sits mid-ramp rather than at an extreme end. */
    const position = direction === 'reverse' ? span - index : index;
    const rung = span <= 0 ? 3 : 1 + Math.round((position * 4) / span);
    ramp.set(segment.key, Math.min(5, Math.max(1, rung)) as 1 | 2 | 3 | 4 | 5);
  });
  return ramp;
}

const segmentFill = (segment: RibbonSegment, ramp?: Map<string, 1 | 2 | 3 | 4 | 5>): string =>
  segment.tone === 'waiting' ? 'bg-accent' : STEP_FILL[ramp?.get(segment.key) ?? segment.step];

const STEP_STROKE: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: 'stroke-[var(--chart-step-1)]',
  2: 'stroke-[var(--chart-step-2)]',
  3: 'stroke-[var(--chart-step-3)]',
  4: 'stroke-[var(--chart-step-4)]',
  5: 'stroke-[var(--chart-step-5)]',
};

const segmentStroke = (segment: RibbonSegment, ramp?: Map<string, 1 | 2 | 3 | 4 | 5>): string =>
  segment.tone === 'waiting' ? 'stroke-accent' : STEP_STROKE[ramp?.get(segment.key) ?? segment.step];

/**
 * Where the time went, as one bar.
 *
 * Width is time, so the bottleneck is the widest block and needs no annotation
 * to be found. The legend underneath carries the exact figure for every segment,
 * which is what keeps this a report rather than a picture.
 */
export function TimeRibbon({
  segments,
  className,
}: {
  segments: RibbonSegment[];
  className?: string;
}) {
  const ramp = rampSteps(segments);

  if (segments.length === 0) return null;

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex h-7 w-full overflow-hidden rounded-md bg-secondary">
        {segments.map((segment) => (
          <div
            key={segment.key}
            title={`${segment.label} — ${segment.value} (${Math.round(segment.share)}%)`}
            style={{ width: `${Math.max(segment.share, 1.2)}%` }}
            className={cn(
              'flex items-center justify-center overflow-hidden border-r border-card/60 last:border-r-0',
              segmentFill(segment, ramp),
            )}
          >
            {segment.share >= 11 && (
              <span className="truncate px-1 font-mono text-[10px] font-semibold text-white">
                {formatShare(segment.share)}
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-4">
        {segments.map((segment) => (
          <div key={segment.key} className="flex items-baseline gap-2">
            <span
              aria-hidden
              className={cn('mt-1 size-2 shrink-0 rounded-sm', segmentFill(segment, ramp))}
            />
            <span className="min-w-0 flex-1 truncate text-[11.5px] text-muted-foreground">
              {segment.label}
            </span>
            <span
              className={cn(
                'shrink-0 font-mono text-[11.5px] tabular-nums',
                segment.tone === 'waiting' ? 'text-accent' : 'text-foreground',
                segment.isLongest ? 'font-bold' : 'font-semibold',
              )}
            >
              {segment.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Where the time went, as ranked rails.
 *
 * The ring this replaces spent 168px stating one conclusion — that a single
 * pair of hands held nearly the whole mission — and then repeated every figure
 * beside it in a legend, each row carrying its own hairline bar. Two graphics,
 * one fact. A rail per holder says it once: the name, a bar drawn to its share,
 * the duration, the share. Ranked, so the answer is the top line; and the ramp
 * runs deepest-first, so the order is legible before any number is read.
 *
 * Rows, not one stacked bar: the journey below this card is already a stacked
 * bar, and the point of the block is that it is NOT a second reading of the
 * journey. Rows also keep a two-minute holder visible, which a 1% sliver of a
 * shared bar is not.
 */
export function TimeRail({
  segments,
  rampDirection = 'forward',
  className,
}: {
  segments: RibbonSegment[];
  /** `reverse` gives the deepest teal to the FIRST row — use it when ranked. */
  rampDirection?: 'forward' | 'reverse';
  className?: string;
}) {
  const ramp = rampSteps(segments, rampDirection);

  if (segments.length === 0) return null;

  return (
    <div className={cn('space-y-2', className)}>
      {segments.map((segment) => (
        <div key={segment.key} className="flex items-center gap-3">
          <span
            className={cn(
              'w-24 shrink-0 truncate text-[12px] sm:w-44',
              segment.isLongest ? 'font-semibold text-foreground' : 'text-muted-foreground',
            )}
          >
            {segment.label}
          </span>
          {/* The bar keeps a visible stub at 0%: a party that held the mission
              for a measured minute is not the same as one that never touched
              it, and a zero-width div says the wrong one. */}
          <div className="h-6 min-w-0 flex-1 overflow-hidden rounded-md bg-secondary">
            <div
              title={`${segment.label} — ${segment.value} (${formatShare(segment.share)})`}
              style={{ width: `${Math.max(segment.share, 1.5)}%` }}
              className={cn('h-full rounded-md', segmentFill(segment, ramp))}
            />
          </div>
          <span
            className={cn(
              'w-[52px] shrink-0 text-right font-mono text-[12.5px] tabular-nums',
              segment.tone === 'waiting' ? 'text-accent' : 'text-foreground',
              segment.isLongest ? 'font-bold' : 'font-semibold',
            )}
          >
            {segment.value}
          </span>
          <span className="w-9 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
            {formatShare(segment.share)}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Where the time went, as one ring.
 *
 * A stacked bar was tried first and failed on real data: one mission spent 79%
 * of its clock in dépotage, so the other six intervals collapsed into 1–3%
 * slivers with no room for a label. A ring reads as "share of a whole" at a
 * glance, holds the same seven arcs without pretending the small ones are
 * legible, and frees its centre for the one figure that matters most — active
 * time against waiting. The exact durations live in the legend, which is what
 * keeps this a report rather than a picture.
 */
export function TimeDonut({
  segments,
  centerValue,
  centerLabel,
  centerCaption,
  size = 168,
  rampDirection = 'forward',
}: {
  segments: RibbonSegment[];
  centerValue: string;
  centerLabel: string;
  centerCaption?: string;
  size?: number;
  rampDirection?: 'forward' | 'reverse';
}) {
  const ramp = rampSteps(segments, rampDirection);
  const stroke = 22;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  /* A hairline of card colour between arcs, so neighbouring teals stay countable. */
  const gap = 2;

  let offset = 0;
  const arcs = segments.map((segment) => {
    const length = Math.max((segment.share / 100) * circumference, 1);
    const drawn = Math.max(length - gap, 0.6);
    const arc = { segment, length: drawn, offset };
    offset += length;
    return arc;
  });

  return (
    <div className="flex shrink-0 flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            className="stroke-secondary"
          />
          {arcs.map(({ segment, length, offset: start }) => (
            <circle
              key={segment.key}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              strokeWidth={stroke}
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={-start}
              className={segmentStroke(segment, ramp)}
            >
              <title>{`${segment.label} — ${segment.value} (${formatShare(segment.share)})`}</title>
            </circle>
          ))}
        </svg>
        {/* The centre figure carries the brand teal: it is the conclusion the
            ring exists to state, and the arcs around it are the evidence. */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-[26px] font-extrabold tabular-nums leading-none text-primary-bold">
            {centerValue}
          </span>
          <span className="mt-1 text-[9.5px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
            {centerLabel}
          </span>
        </div>
      </div>
      {centerCaption && (
        <p className="text-center text-[11px] text-muted-foreground">{centerCaption}</p>
      )}
    </div>
  );
}

/**
 * The legend that carries the donut's figures — name, duration, share.
 *
 * Rails rather than a dot-and-label grid. Two stages in a two-column grid left
 * a legend of two lonely rows and a lake of white beside a 168px ring; and a
 * dot the size of a full stop is a poor colour key for an arc 22px thick. Each
 * stage now gets its own bar, in its own arc's colour, drawn to its own share —
 * so the ring's proportions are legible a second way, and the block that ate
 * the mission is the longest bar without needing to be labelled as such.
 */
export function TimeLegend({
  segments,
  rampDirection = 'forward',
}: {
  segments: RibbonSegment[];
  rampDirection?: 'forward' | 'reverse';
}) {
  const ramp = rampSteps(segments, rampDirection);

  return (
    <div className="flex min-w-0 flex-1 flex-col justify-center gap-2.5 self-stretch">
      {segments.map((segment) => (
        <div key={segment.key} className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span
              className={cn(
                'min-w-0 flex-1 truncate text-[12px]',
                segment.isLongest ? 'font-semibold text-foreground' : 'text-muted-foreground',
              )}
            >
              {segment.label}
            </span>
            <span
              className={cn(
                'shrink-0 font-mono text-[12.5px] tabular-nums',
                segment.tone === 'waiting' ? 'text-accent' : 'text-foreground',
                segment.isLongest ? 'font-bold' : 'font-semibold',
              )}
            >
              {segment.value}
            </span>
            <span className="w-9 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
              {formatShare(segment.share)}
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className={cn('h-full rounded-full', segmentFill(segment, ramp))}
              style={{ width: `${Math.max(segment.share, 2)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * A ring, for the one percentage that answers a question — active operations
 * against waiting. The figure sits in the middle because that is where a reader
 * looks first; the ring is the sanity check, not the message.
 */
export function RadialGauge({
  value,
  label,
  caption,
  size = 108,
  tone = 'primary',
}: {
  /** 0–100. */
  value: number;
  label: string;
  caption?: string;
  size?: number;
  tone?: 'primary' | 'accent' | 'destructive';
}) {
  const stroke = 9;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (Math.min(100, Math.max(0, value)) / 100) * circumference;
  const strokeClass =
    tone === 'destructive'
      ? 'stroke-destructive'
      : tone === 'accent'
        ? 'stroke-accent'
        : 'stroke-primary';

  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            className="stroke-secondary"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference - dash}`}
            className={strokeClass}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-xl font-bold tabular-nums leading-none text-foreground">
            {Math.round(value)}%
          </span>
          <span className="mt-0.5 text-[9.5px] uppercase tracking-[0.08em] text-muted-foreground">
            {label}
          </span>
        </div>
      </div>
      {caption && <p className="text-center text-[10.5px] text-muted-foreground">{caption}</p>}
    </div>
  );
}

export interface RingSegment {
  key: string;
  label: string;
  /** Already formatted for the legend, e.g. "8" or "3". */
  displayValue: string;
  /** Share of the ring, 0–100 — a report's segments should sum to at most 100. */
  share: number;
  strokeClassName: string;
  dotClassName: string;
}

/**
 * A donut for the one composition that answers "what is this month made of" —
 * missions by outcome, a fleet by status. The centre carries the total, because
 * that is the number the ring's slices are shares of; the legend underneath
 * carries the exact count behind every slice, which is what keeps it a report.
 */
export function CompositionRing({
  segments,
  centerValue,
  centerLabel,
  size = 108,
  className,
}: {
  segments: RingSegment[];
  centerValue: ReactNode;
  centerLabel: string;
  size?: number;
  className?: string;
}) {
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  let cumulative = 0;

  return (
    <div className={cn('flex shrink-0 flex-col items-center gap-2.5', className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            className="stroke-secondary"
          />
          {segments
            .filter((segment) => segment.share > 0)
            .map((segment) => {
              const dash = (segment.share / 100) * circumference;
              const offset = -((cumulative / 100) * circumference);
              cumulative += segment.share;
              return (
                <circle
                  key={segment.key}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  strokeWidth={stroke}
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={offset}
                  className={segment.strokeClassName}
                />
              );
            })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-xl font-bold tabular-nums leading-none text-foreground">
            {centerValue}
          </span>
          <span className="mt-0.5 text-[9.5px] uppercase tracking-[0.08em] text-muted-foreground">
            {centerLabel}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
        {segments.map((segment) => (
          <span
            key={segment.key}
            className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"
          >
            <span aria-hidden className={cn('size-2 rounded-sm', segment.dotClassName)} />
            {segment.label}
            <b className="font-mono text-foreground">{segment.displayValue}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * The journey
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * The seven journey hues, by position in the ladder.
 *
 * Written as literal class strings rather than composed with a template so
 * Tailwind's scanner can see every one of them; the tokens themselves live in
 * `tokens.semantic.css` with the reasoning for the ramp.
 */
export type JourneyHue = 1 | 2 | 3 | 4 | 5 | 6 | 7;

const JOURNEY_COLOR: Record<JourneyHue, string> = {
  1: 'var(--journey-1)',
  2: 'var(--journey-2)',
  3: 'var(--journey-3)',
  4: 'var(--journey-4)',
  5: 'var(--journey-5)',
  6: 'var(--journey-6)',
  7: 'var(--journey-7)',
};

export interface JourneyRailRow {
  key: string;
  /** The step's name, in the operator's own vocabulary. */
  label: string;
  /** What the step means, in one clause. */
  caption?: string;
  /** The party the step waited on. */
  responsible?: string;
  icon?: ComponentType<{ className?: string }>;
  /** Which of the seven journey hues this step takes — its position in the ladder. */
  hue: JourneyHue;
  /** Formatted timestamp. Every row here is a recorded step, so never null. */
  at: string;
  /** The gap since the previous recorded step, formatted. Null on the first row. */
  duration: string | null;
  /** What that gap is called (Transit, Dépotage, …). */
  intervalLabel?: string;
  /** The gap's share of the whole journey, 0-100. Null on the first row. */
  sharePct: number | null;
  /** The longest gap of the mission — the bottleneck. */
  isLongest?: boolean;
  /** Where the container stands right now — set on the last step of a mission
      that is still running, and on nothing at all once it has closed. */
  isCurrent?: boolean;
}

/**
 * The mission as a chain of coloured links.
 *
 * Two drawings of one fact, stacked. The ribbon puts every interval side by
 * side at its true share, so "where did the week go" is answered before a word
 * is read. The rail under it names the steps, and the spine between two of them
 * *is* the interval — same hue, carrying its own name and duration on it. The
 * previous version drew twelve identical grey dots down a hairline, which made
 * a four-hour gate wait and a six-day dépotage the same picture.
 *
 * Colour is per step, not per state: seven kinds of event owned by three
 * parties, so the eye can find "the box was stripped" by hue instead of reading
 * seven labels.
 */
export function JourneyRail({ rows, className }: { rows: JourneyRailRow[]; className?: string }) {
  if (rows.length === 0) return null;

  const intervals = rows.filter(
    (row): row is JourneyRailRow & { duration: string; sharePct: number } =>
      row.duration !== null && row.sharePct !== null,
  );

  /* One interval is not a distribution: the ribbon would be a single full-width
     band saying "100% of the time was the only thing measured", and the pill on
     the rail already carries the figure. Two is where a comparison starts. */
  const showRibbon = intervals.length > 1;

  return (
    <div className={cn('space-y-3.5', className)}>
      {showRibbon && (
        /* Every interval at its true width. A segment narrower than a tenth of
           the run cannot hold its own duration, so it keeps only its colour and
           hands the figure to the rail below — printing a clipped "2h" is worse
           than printing nothing. */
        <div className="flex h-7 w-full overflow-hidden rounded-md" role="img"
          aria-label={intervals
            .map((row) => `${row.intervalLabel ?? row.label} ${row.duration}`)
            .join(', ')}
        >
          {intervals.map((row) => (
            <div
              key={row.key}
              title={`${row.intervalLabel ?? row.label} — ${row.duration}`}
              className="flex min-w-[3px] items-center justify-center overflow-hidden border-r border-card/70 last:border-r-0"
              style={{ width: `${Math.max(1.2, row.sharePct)}%`, backgroundColor: JOURNEY_COLOR[row.hue] }}
            >
              {row.sharePct >= 10 && (
                <span className="truncate px-1 font-mono text-[10.5px] font-bold tabular-nums text-[var(--journey-foreground)]">
                  {row.duration}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      <ol className="space-y-0">
        {rows.map((row, index) => {
          const previous = rows[index - 1];
          const color = JOURNEY_COLOR[row.hue];
          const isLast = index === rows.length - 1;
          return (
            <li key={row.key}>
              {/* The link into this step: the spine, running from the previous
                  step's colour into this one's, with the interval named on it. */}
              {index > 0 && row.duration && (
                <div className="flex gap-3">
                  <div className="flex w-7 shrink-0 justify-center">
                    <span
                      aria-hidden
                      className="w-[3px]"
                      style={{
                        backgroundImage: `linear-gradient(to bottom, ${previous ? JOURNEY_COLOR[previous.hue] : color}, ${color})`,
                      }}
                    />
                  </div>
                  <div className="flex min-h-[34px] flex-1 items-center py-1">
                    <span
                      className={cn(
                        'inline-flex items-baseline gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-semibold',
                        showRibbon && row.isLongest && 'ring-1 ring-accent',
                      )}
                      style={{
                        backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)`,
                      }}
                    >
                      {row.intervalLabel && (
                        <span className="uppercase tracking-[0.07em] text-muted-foreground">
                          {row.intervalLabel}
                        </span>
                      )}
                      <span className="font-mono font-bold tabular-nums text-foreground">
                        {row.duration}
                      </span>
                      {showRibbon && row.sharePct !== null && row.sharePct >= 1 && (
                        <span className="font-mono text-[9.5px] tabular-nums text-muted-foreground">
                          {Math.round(row.sharePct)}%
                        </span>
                      )}
                      {showRibbon && row.isLongest && (
                        <span className="text-[9px] font-bold uppercase tracking-[0.07em] text-accent">
                          longest
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-3">
                {/*
                 * The mark, and the rail continuing past it.
                 *
                 * The connector has to be drawn twice — once here and once on
                 * the link above — because a step's row is taller than its
                 * disc: the label, the party and the caption stack to about
                 * 36px against the disc's 28. Drawing the rail only between
                 * rows left an unpainted band under every mark, so the chain
                 * came apart at each of the seven discs. `self-stretch` gives
                 * this column the row's full height and `flex-1` paints what
                 * the disc does not cover.
                 */}
                <div className="flex w-7 shrink-0 flex-col items-center self-stretch">
                  <span className="relative flex size-7 shrink-0 items-center justify-center">
                    {row.isCurrent && (
                      /* Where the container is right now. The halo is the house
                         `pulse-ring`, tinted to the step's own hue — and it is
                         never the only signal, because motion says nothing to a
                         reader with reduced motion on: the `NOW` mark beside the
                         label carries the same fact in words. */
                      <span
                        aria-hidden
                        className="pulse-ring absolute inset-0 rounded-full"
                        style={{ color: `color-mix(in oklab, ${color} 55%, transparent)` }}
                      />
                    )}
                    <span
                      aria-hidden
                      className="relative z-10 flex size-7 items-center justify-center rounded-full text-[var(--journey-foreground)]"
                      style={{ backgroundColor: color }}
                    >
                      {row.icon ? (
                        <row.icon className="size-[15px]" />
                      ) : (
                        <span className="size-2 rounded-full bg-current" />
                      )}
                    </span>
                  </span>
                  {!isLast && (
                    <span
                      aria-hidden
                      className="-mt-px w-[3px] flex-1"
                      style={{ backgroundColor: color }}
                    />
                  )}
                </div>

                <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5 pb-1 pt-0.5">
                  <span className="text-[13px] font-bold leading-tight text-foreground">
                    {row.label}
                  </span>
                  {row.isCurrent && (
                    <span
                      className="rounded-full px-1.5 py-px text-[9px] font-bold uppercase tracking-[0.09em] text-[var(--journey-foreground)]"
                      style={{ backgroundColor: color }}
                    >
                      now
                    </span>
                  )}
                  {row.responsible && (
                    <span className="text-[9.5px] uppercase tracking-[0.06em] text-muted-foreground">
                      {row.responsible}
                    </span>
                  )}
                  {/* The step and its time are the two ends of one fact, and on
                      a wide report a hand's width of nothing sat between them —
                      the eye had to track across the card to find out when
                      "Delivered" happened, seven times down the page. This is
                      the hairline the booking cards use: one pixel, invisible at
                      the label you have already read, resolving as it travels
                      right so it lands on the time. It keeps the times in a
                      scannable right-hand column, which moving them next to the
                      label would have cost. */}
                  <span
                    aria-hidden
                    className="ml-auto h-px min-w-4 flex-1 self-center bg-gradient-to-r from-transparent via-border to-border-strong"
                  />
                  <span className="shrink-0 font-mono text-[11.5px] font-semibold tabular-nums text-foreground">
                    {row.at}
                  </span>
                  {row.caption && (
                    <span className="w-full text-[10.5px] leading-snug text-muted-foreground">
                      {row.caption}
                    </span>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * The whole run against the deadline: what it used, and what it saved.
 *
 * Three drawings came before this one and each failed differently. A continuous
 * bar of free time used against free time remaining died on real data — a box
 * back two minutes into a six-day window filled 0.02% of it. Day blocks fixed
 * the legibility and introduced an ambiguity: a full bar conventionally means
 * *consumed*, and here it meant the opposite. A ring removed the ambiguity and
 * was simply ugly in the space it had.
 *
 * The change that mattered was not the shape, it was the span. All three
 * measured from *delivery*, because that is when the line's free time formally
 * starts — which is correct and useless: it left the days the shipment spent
 * getting to the consignee out of the picture entirely. This measures the whole
 * thing, from the day the shipment was created to the day the empty came home,
 * against the deadline it had to beat. Two figures, one bar: **used** is the
 * run, **saved** is the margin it finished with.
 */
export function ReturnSpanBar({
  startAt,
  endAt,
  deadlineAt,
  settled,
  detentionDays,
  startLabel,
  endLabel,
  caption,
}: {
  /** The day the shipment became somebody's job. */
  startAt: number;
  /** The empty back at the depot, or now while it is still out. */
  endAt: number;
  /** What the whole run had to beat. */
  deadlineAt: number;
  /** True once the empty is back: the figures stop moving. */
  settled: boolean;
  detentionDays: number;
  startLabel: string;
  endLabel: string;
  /** Only where there is something the picture cannot say. */
  caption?: string;
}) {
  const usedMs = Math.max(0, endAt - startAt);
  const windowMs = Math.max(1, deadlineAt - startAt);
  const savedMs = deadlineAt - endAt;
  const late = savedMs < 0;

  /* Late runs extend the track past the deadline rather than squeezing the
     window to nothing — capped at one further window so a badly late return
     cannot shrink the part being explained down to a sliver. */
  const overrunMs = late ? Math.min(-savedMs, windowMs) : 0;
  const totalMs = windowMs + overrunMs;
  const pct = (ms: number) => (ms / totalMs) * 100;
  const usedPct = pct(Math.min(usedMs, windowMs));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <SpanFigure
          label={settled ? 'Used' : 'Used so far'}
          value={formatDuration(usedMs, { compact: true })}
          caption="created → empty back"
        />
        <SpanFigure
          align="right"
          label={late ? (settled ? 'Over by' : 'Overdue by') : settled ? 'Saved' : 'Still in hand'}
          value={formatDuration(Math.abs(savedMs), { compact: true })}
          caption={
            late
              ? `${detentionDays} detention day${detentionDays === 1 ? '' : 's'} charged`
              : 'empty back → deadline'
          }
          tone={late ? 'bad' : 'good'}
        />
      </div>

      {/* One bar, two parts, and the join is the moment the empty came home. */}
      <div className="flex h-5 w-full gap-[3px] overflow-hidden rounded-md">
        <div
          className="h-full rounded-l-md bg-primary-bold"
          style={{ width: `${usedPct}%`, minWidth: usedMs > 0 ? 6 : 0 }}
          title={`Used — ${formatDuration(usedMs, { compact: true })}`}
        />
        <div
          className={cn(
            'h-full flex-1 rounded-r-md',
            late
              ? 'bg-destructive'
              : 'bg-primary/25 ring-1 ring-inset ring-primary/30',
          )}
          title={
            late
              ? `Over by ${formatDuration(-savedMs, { compact: true })}`
              : `Saved — ${formatDuration(savedMs, { compact: true })}`
          }
        />
      </div>

      <div className="flex items-baseline justify-between gap-3 text-[10px] uppercase tracking-[0.07em] text-muted-foreground">
        <span className="truncate">{startLabel}</span>
        <span className="truncate text-right">{endLabel}</span>
      </div>

      {caption && <p className="text-[11.5px] leading-relaxed text-muted-foreground">{caption}</p>}
    </div>
  );
}

/** One of the bar's two answers — the label, the figure, and what it spans. */
function SpanFigure({
  label,
  value,
  caption,
  tone,
  align = 'left',
}: {
  label: string;
  value: string;
  caption: string;
  tone?: 'good' | 'bad';
  align?: 'left' | 'right';
}) {
  return (
    <div className={cn('min-w-0', align === 'right' && 'text-right')}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          'mt-0.5 font-mono text-[24px] font-extrabold tabular-nums leading-none tracking-tight sm:text-[27px]',
          tone === 'bad' ? 'text-destructive' : 'text-primary-bold',
        )}
      >
        {value}
      </p>
      <p className="mt-1 truncate text-[10.5px] text-muted-foreground">{caption}</p>
    </div>
  );
}

/** A headline figure with its label — the report's smallest unit of news. */
export function ReportStat({
  label,
  value,
  caption,
  tone = 'neutral',
  size = 'md',
}: {
  label: string;
  value: ReactNode;
  caption?: ReactNode;
  tone?: 'neutral' | 'good' | 'bad' | 'accent';
  size?: 'md' | 'lg';
}) {
  const toneClass =
    tone === 'bad'
      ? 'text-destructive'
      : tone === 'good'
        ? 'text-success'
        : tone === 'accent'
          ? 'text-accent'
          : 'text-foreground';
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-[0.09em] text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-0.5 font-mono font-bold tabular-nums leading-none',
          size === 'lg' ? 'text-2xl' : 'text-lg',
          toneClass,
        )}
      >
        {value}
      </p>
      {caption && (
        <p className="mt-1 text-[11px] leading-tight text-muted-foreground">{caption}</p>
      )}
    </div>
  );
}

