import { useCallback, useEffect } from 'react';
import type { ComponentType, ReactNode, SVGProps } from 'react';
import { Badge, Card, IconChip, type IconChipTint } from '@/design-system';
import { ExternalLink } from '@/design-system/icons';
import { cn } from '@/utils';
import type { ReportBadgeStatus } from './missionReport';

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
      <div className="flex items-center gap-2.5">
        <IconChip icon={icon} tint={tint} size={36} />
        <div className="min-w-0">
          <p className="text-sm font-bold leading-tight text-foreground">{title}</p>
          {subtitle && <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>}
        </div>
        {right && <div className="ml-auto flex shrink-0 items-center gap-2">{right}</div>}
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

const segmentFill = (segment: RibbonSegment): string =>
  segment.tone === 'waiting' ? 'bg-accent' : STEP_FILL[segment.step];

const STEP_STROKE: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: 'stroke-[var(--chart-step-1)]',
  2: 'stroke-[var(--chart-step-2)]',
  3: 'stroke-[var(--chart-step-3)]',
  4: 'stroke-[var(--chart-step-4)]',
  5: 'stroke-[var(--chart-step-5)]',
};

const segmentStroke = (segment: RibbonSegment): string =>
  segment.tone === 'waiting' ? 'stroke-accent' : STEP_STROKE[segment.step];

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
              segmentFill(segment),
            )}
          >
            {segment.share >= 11 && (
              <span className="truncate px-1 font-mono text-[10px] font-semibold text-white">
                {Math.round(segment.share)}%
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
              className={cn('mt-1 size-2 shrink-0 rounded-sm', segmentFill(segment))}
            />
            <span className="min-w-0 flex-1 truncate text-[11.5px] text-muted-foreground">
              {segment.label}
            </span>
            <span
              className={cn(
                'shrink-0 font-mono text-[11.5px] tabular-nums',
                segment.isLongest ? 'font-bold text-accent' : 'font-semibold text-foreground',
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
}: {
  segments: RibbonSegment[];
  centerValue: string;
  centerLabel: string;
  centerCaption?: string;
  size?: number;
}) {
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
              className={segmentStroke(segment)}
            >
              <title>{`${segment.label} — ${segment.value} (${Math.round(segment.share)}%)`}</title>
            </circle>
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-[26px] font-extrabold tabular-nums leading-none text-foreground">
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

/** The legend that carries the donut's figures — colour, name, duration, share. */
export function TimeLegend({ segments }: { segments: RibbonSegment[] }) {
  return (
    <div className="grid min-w-0 flex-1 gap-x-5 gap-y-2 sm:grid-cols-2">
      {segments.map((segment) => (
        <div
          key={segment.key}
          className="flex items-center gap-2 border-b border-border/50 pb-1.5 last:border-0 sm:last:border-b sm:[&:nth-last-child(-n+2)]:border-0"
        >
          <span
            aria-hidden
            className={cn('size-2.5 shrink-0 rounded-full', segmentFill(segment))}
          />
          <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">
            {segment.label}
          </span>
          <span
            className={cn(
              'shrink-0 font-mono text-[12px] tabular-nums',
              segment.isLongest ? 'font-bold text-accent' : 'font-semibold text-foreground',
            )}
          >
            {segment.value}
          </span>
          <span className="w-8 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
            {Math.round(segment.share)}%
          </span>
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

/**
 * The ordinal ramp, as CSS values.
 *
 * The design system's teal ramp encodes *order*, which is exactly what a
 * journey's chapters have: light at the pickup, dark at the depot. `tint` is the
 * same hue at reading strength for a surface behind small text.
 */
export function stepTone(step: 1 | 2 | 3 | 4 | 5): {
  solid: string;
  rail: string;
  tint: string;
} {
  const solid = `var(--chart-step-${step})`;
  return {
    solid,
    rail: `color-mix(in oklab, ${solid} 45%, transparent)`,
    tint: `color-mix(in oklab, ${solid} 12%, transparent)`,
  };
}

export interface MilestoneRailTone {
  /** Fill of a recorded milestone's dot, and of the connector. */
  solid: string;
  rail: string;
  /** Surface behind the duration pill. */
  tint: string;
}

export interface MilestoneRow {
  key: string;
  label: string;
  /**
   * The milestone's own mark. A rail of identical dots makes every rung look
   * like the same event, so the eye has to read all twelve labels to find the
   * one it wants; a truck, a gate and a warehouse are picked out at a glance.
   * Falls back to a dot when a row has no icon.
   */
  icon?: ComponentType<{ className?: string }>;
  note?: string;
  responsible?: string;
  /** Formatted timestamp, or null while the milestone is pending. */
  at: string | null;
  /** Formatted duration since the previous milestone. */
  duration: string | null;
  /** Names the interval ending here, where it has a name (dépotage). */
  intervalLabel?: string;
  isLongest?: boolean;
}

/**
 * The milestones as a rail, not a table.
 *
 * A table of twelve rows and three columns is the same information, and it reads
 * as a wall. A rail gives each milestone one line, the connector does the work
 * the "stage" column header used to do, and the duration sits in a pill on the
 * right so the eye can run down the gaps without reading a word.
 */
export function MilestoneRail({
  rows,
  tone,
  className,
}: {
  rows: MilestoneRow[];
  /** The chapter's colour. Falls back to the brand teal when unset. */
  tone?: MilestoneRailTone;
  className?: string;
}) {
  return (
    <ol className={cn('relative space-y-0', className)}>
      {/* The rail itself, run between the first and last mark's centres. The
          insets are pixel values, not spacing steps: they track the disc's
          geometry (18px, nudged up 1px onto the label's line), and a rounded
          step left a visible stub above the first icon. */}
      <span
        aria-hidden
        className={cn('absolute bottom-[15px] left-2 top-[14px] w-0.5 rounded-full', !tone && 'bg-border')}
        style={tone ? { backgroundColor: tone.rail } : undefined}
      />
      {rows.map((row) => {
        const isPending = row.at === null;
        return (
          <li key={row.key} className={cn('relative flex gap-3 py-1.5', isPending && 'opacity-45')}>
            <span
              aria-hidden
              className={cn(
                'relative z-10 -mt-px flex size-[18px] shrink-0 items-center justify-center rounded-full ring-2 ring-card',
                isPending
                  ? 'border border-dashed border-muted-foreground bg-card text-muted-foreground'
                  : row.isLongest
                    ? 'bg-accent text-accent-foreground'
                    : tone
                      ? 'text-white'
                      : 'bg-primary text-primary-foreground',
              )}
              style={!isPending && !row.isLongest && tone ? { backgroundColor: tone.solid } : undefined}
            >
              {row.icon ? (
                <row.icon className="size-[11px]" />
              ) : (
                <span className="size-[7px] rounded-full bg-current" />
              )}
            </span>
            <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span
                className={cn(
                  'text-[12.5px] leading-tight text-foreground',
                  row.isLongest ? 'font-bold' : 'font-medium',
                )}
              >
                {row.label}
              </span>
              {row.note && <span className="text-[10px] text-muted-foreground">{row.note}</span>}
              {row.responsible && !isPending && (
                <span className="text-[9.5px] uppercase tracking-[0.06em] text-muted-foreground">
                  {row.responsible}
                </span>
              )}
              <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                {row.at ?? 'pending'}
              </span>
            </div>
            {/*
             * The gap, as a figure in a column — not a chip.
             *
             * These were tinted rounded boxes: a 12% wash reads as a smudge at
             * this size, and every duration being a different string made the
             * boxes different widths, so the right edge of the rail came out
             * ragged. A fixed column right-aligns the numbers under each other,
             * which is the whole point of printing them.
             */}
            <span
              className={cn(
                'w-[66px] shrink-0 text-right font-mono text-[10.5px] font-semibold leading-tight tabular-nums',
                row.isLongest ? 'text-accent' : 'text-foreground',
              )}
            >
              {row.intervalLabel && row.duration && (
                <span className="block font-sans text-[8.5px] font-bold uppercase tracking-[0.07em] text-accent">
                  {row.intervalLabel}
                </span>
              )}
              {row.duration}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Free time, drawn against the deadline the shipping line set.
 *
 * The track is always two named parts, because the shipper's question has two
 * halves: how long we held the box, and how much room was left. An earlier
 * version drew only the consumed part and left the margin as unlabelled grey —
 * the answer was there but nobody could read it. Now the second part carries its
 * own duration and its own colour: green when it is time we still had, red when
 * it is time we owe.
 */
export function FreeTimeTrack({
  usedPct,
  usedLabel,
  restPct,
  restLabel,
  restTone,
  startLabel,
  markerLabel,
  endLabel,
  caption,
}: {
  /** Delivery → the empty coming back (or the deadline, whichever comes first). */
  usedPct: number;
  usedLabel: string;
  /** What is left of the window, or what was overrun. */
  restPct: number;
  restLabel: string;
  restTone: 'spare' | 'late';
  startLabel: string;
  /** Sits over the boundary between the two parts — where the empty came back. */
  markerLabel?: string;
  endLabel: string;
  caption?: string;
}) {
  const clamp = (value: number) => Math.min(100, Math.max(0, value));
  const used = clamp(usedPct);
  const rest = clamp(restPct);
  const isLate = restTone === 'late';

  return (
    <div>
      {/* Three anchors: where it started, where the empty landed, where free time ends. */}
      <div className="relative mb-1.5 h-8">
        <span className="absolute left-0 top-0 max-w-[38%] text-[10px] uppercase leading-tight tracking-[0.07em] text-muted-foreground">
          {startLabel}
        </span>
        {markerLabel && used > 18 && used < 82 && (
          <span
            className="absolute top-0 max-w-[36%] -translate-x-1/2 text-center text-[10px] font-semibold uppercase leading-tight tracking-[0.07em] text-foreground"
            style={{ left: `${used}%` }}
          >
            {markerLabel}
          </span>
        )}
        <span className="absolute right-0 top-0 max-w-[38%] text-right text-[10px] uppercase leading-tight tracking-[0.07em] text-muted-foreground">
          {endLabel}
        </span>
      </div>

      {/* The bar. Two parts, and the boundary is the moment the empty came back. */}
      <div className="relative flex h-4 w-full gap-[3px] overflow-hidden rounded-full">
        <div
          className="h-full rounded-l-full bg-primary"
          style={{ width: `${used}%` }}
          title={usedLabel}
        />
        <div
          className={cn('h-full flex-1 rounded-r-full', isLate ? 'bg-destructive' : 'bg-success')}
          style={{ width: `${rest}%` }}
          title={restLabel}
        />
      </div>

      {/* Each part says what it is, under itself. */}
      <div className="mt-1.5 flex w-full gap-[3px]">
        <span
          className="min-w-0 truncate text-[11px] font-semibold text-primary"
          style={{ width: `${used}%` }}
        >
          {usedLabel}
        </span>
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-right text-[11px] font-bold',
            isLate ? 'text-destructive' : 'text-success',
          )}
          style={{ width: `${rest}%` }}
        >
          {restLabel}
        </span>
      </div>

      {caption && <p className="mt-2.5 text-[11.5px] leading-relaxed text-muted-foreground">{caption}</p>}
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

/**
 * A party or a piece of equipment, as one labelled group.
 *
 * The alternative — one bordered chip per attribute — turned seven facts into a
 * tag cloud: seven identical pills, no hierarchy, and the eye reading every one
 * of them to find the container number. Grouping gives each fact a place
 * ("who", "what box", "who moved it"), so the reader looks once.
 */
export function ReportIdentityGroup({
  label,
  primary,
  lines = [],
  mono = false,
}: {
  label: string;
  primary: ReactNode;
  /** Supporting lines, in decreasing importance. Empty ones are dropped. */
  lines?: Array<ReactNode | null | undefined>;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0 px-0 sm:px-4 sm:first:pl-0 sm:last:pr-0">
      <p className="text-[10px] uppercase tracking-[0.09em] text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 truncate text-[13.5px] font-semibold leading-tight text-foreground',
          mono && 'font-mono tabular-nums',
        )}
      >
        {primary}
      </p>
      {lines.filter(Boolean).map((line, index) => (
        <p
          key={index}
          className="mt-0.5 truncate text-[11.5px] leading-tight text-muted-foreground"
        >
          {line}
        </p>
      ))}
    </div>
  );
}

export interface DateMilestone {
  label: string;
  /** Already formatted, or null when the moment has not happened. */
  value: string | null;
  /** Drawn on the rail in place of a bare dot — see `MilestoneRow.icon`. */
  icon?: ComponentType<{ className?: string }>;
}

/**
 * The mission's four headline dates as a strip, not a field grid.
 *
 * Same four facts either way; drawn on a hairline with a dot each, they read as
 * a sequence — which is what they are — and the eye gets the shape of the job
 * before it reads a single number.
 */
export function DateMilestoneStrip({ items }: { items: DateMilestone[] }) {
  return (
    <div className="relative grid grid-cols-2 gap-x-4 gap-y-3 sm:flex sm:justify-between">
      {/* The hairline the marks sit on — through their centres, which moved when
          the 8px dots became 18px icon discs. Behind the row, one line only. */}
      <span
        aria-hidden
        className="absolute left-1 right-1 top-[28px] hidden h-px bg-border sm:block"
      />
      {items.map((item) => (
        <div key={item.label} className="relative min-w-0 sm:flex-1">
          <p className="truncate text-[10px] uppercase tracking-[0.09em] text-muted-foreground">
            {item.label}
          </p>
          <span
            aria-hidden
            className={cn(
              'relative z-10 my-1 flex size-[18px] items-center justify-center rounded-full ring-2 ring-card',
              item.value
                ? 'bg-primary text-primary-foreground'
                : 'border border-dashed border-muted-foreground bg-card text-muted-foreground',
            )}
          >
            {item.icon ? (
              <item.icon className="size-[11px]" />
            ) : (
              <span className="size-[7px] rounded-full bg-current" />
            )}
          </span>
          <p
            className={cn(
              'truncate font-mono text-[12px] tabular-nums',
              item.value ? 'font-medium text-foreground' : 'text-muted-foreground',
            )}
          >
            {item.value ?? 'pending'}
          </p>
        </div>
      ))}
    </div>
  );
}
