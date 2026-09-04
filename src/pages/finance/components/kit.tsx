import type { MouseEvent, ReactNode } from 'react';

import { IconChip, type IconChipTint } from '@/design-system';
import { ArrowDownLeft, ArrowUpRight, EllipsisVertical, PauseCircle, TrendingDown, TrendingUp } from '@/design-system/icons';
import { fmtDjf, fmtDjfPlain } from '@/lib/finance';
import { cn } from '@/utils';

/** Real-data string-literal unions — kept local rather than imported from the (deleted) mock `@/types/finance`. */
type ShipmentStage = 'awaiting_pod' | 'ready' | 'released' | 'settled';
type BookingStage = 'in_transit' | 'awaiting_pod' | 'proven';
type SettlementStatus = 'blocked' | 'payable' | 'part_paid' | 'paid';

/**
 * The finance module's visual vocabulary.
 *
 * Rebuilt 2026-08-12 after the first pass came back as unreadable: 10px type,
 * eight-column tables and a paragraph of explanation under every heading. The
 * rule now is the one every finance dashboard worth copying follows — **one
 * card answers one question, and the answer is the biggest thing in it.**
 *
 * So a KPI is an icon chip, a three-word label, a huge figure and at most one
 * delta chip. A party is an avatar and a name. A state is a dot and a word.
 * Nothing on a finance screen is smaller than 12px, and no table runs past six
 * columns; anything extra belongs in the row's expansion, not in the row.
 *
 * The four money rules from the build brief are still enforced here by
 * construction, because they are correctness, not decoration:
 *
 * 1. Out and in are never confusable — `MoneyAmount` owns the sign and hue.
 * 2. Held never reads as payable — `HeldChip` is dashed and carries a pause.
 * 3. Fleetin's risk never reads like the bank's — `RiskTag` carries words.
 * 4. Unpriced is never a zero — `UnpricedChip` states the gap.
 */

/* ═══════════════════════════════════════════════════════════════════════════
 * Money
 * ═══════════════════════════════════════════════════════════════════════ */

export type MoneyDirection = 'out' | 'in' | 'neutral' | 'held';

const MONEY_TONE: Record<MoneyDirection, string> = {
  out: 'text-accent-subtle-foreground',
  in: 'text-primary-subtle-foreground',
  neutral: 'text-foreground',
  held: 'text-warning-subtle-foreground',
};

/**
 * Every franc renders through this: tabular figures, explicit sign the moment
 * the money is actually moving, so the direction survives greyscale and a
 * screenshot.
 */
export function MoneyAmount({
  value,
  direction = 'neutral',
  unit = true,
  className,
}: {
  value: number;
  direction?: MoneyDirection;
  /** Show the DJF mark; a column that heads its own currency turns it off. */
  unit?: boolean;
  className?: string;
}) {
  // Zero has no direction. "−0 DJF" reads as a loss of nothing; it is nothing.
  const sign = value === 0 ? '' : direction === 'out' ? '−' : direction === 'in' ? '+' : '';
  const body = unit ? fmtDjf(Math.abs(value)) : fmtDjfPlain(Math.abs(value));
  return (
    <span className={cn('font-mono font-bold tabular-nums', MONEY_TONE[direction], className)}>
      {sign}
      {body}
    </span>
  );
}

export function DirectionGlyph({
  direction,
  className,
}: {
  direction: 'out' | 'in';
  className?: string;
}) {
  return direction === 'out' ? (
    <ArrowUpRight
      aria-label="Debit"
      className={cn('size-4 shrink-0 text-accent-subtle-foreground', className)}
    />
  ) : (
    <ArrowDownLeft
      aria-label="Credit"
      className={cn('size-4 shrink-0 text-primary-subtle-foreground', className)}
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Primitives — icon chip, avatar, pill
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * The tinted disc that opens every card, panel and row — SOLID, round, 44px
 * with a 20px glyph (36/18 in dense rows).
 *
 * Lifted into the design system 2026-08-12 so the rest of the app speaks the
 * same dialect; finance keeps the alias because half the module imports
 * `IconChip` from this kit. The rules and the token pairings live with the
 * component now — see `Display/IconChip`.
 */
export { IconChip };
export type ChipTint = IconChipTint;

/** Seven-slot rotation so a party keeps the same colour everywhere it appears. */
const AVATAR_SLOTS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
  'var(--chart-7)',
];

function slotFor(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 997;
  }
  return AVATAR_SLOTS[hash % AVATAR_SLOTS.length] ?? AVATAR_SLOTS[0] ?? 'var(--chart-1)';
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter((word) => /[a-z0-9]/i.test(word))
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

/**
 * Circular party mark. A named company shows its logo; a role (port handling,
 * customs, escort) has no brand to show, so it keeps tinted initials — the
 * house rule, unchanged.
 */
export function Avatar({
  name,
  logoUrl,
  size = 40,
  className,
}: {
  name: string;
  logoUrl?: string;
  size?: number;
  className?: string;
}) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt=""
        style={{ width: size, height: size }}
        className={cn('shrink-0 rounded-full object-cover', className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        background: `color-mix(in srgb, ${slotFor(name)} 18%, transparent)`,
        color: slotFor(name),
        fontSize: Math.max(10, Math.round(size * 0.32)),
      }}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-extrabold',
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

export type PillTone = 'teal' | 'orange' | 'amber' | 'red' | 'blue' | 'neutral';

const PILL_TONE: Record<PillTone, { wrap: string; dot: string }> = {
  teal: { wrap: 'bg-primary-subtle text-primary-subtle-foreground', dot: 'bg-primary' },
  orange: { wrap: 'bg-accent-subtle text-accent-subtle-foreground', dot: 'bg-accent' },
  amber: { wrap: 'bg-warning-subtle text-warning-subtle-foreground', dot: 'bg-warning' },
  red: { wrap: 'bg-destructive-subtle text-destructive-subtle-foreground', dot: 'bg-destructive' },
  blue: { wrap: 'bg-info-subtle text-info-subtle-foreground', dot: 'bg-info' },
  neutral: { wrap: 'bg-surface-sunken text-muted-foreground', dot: 'bg-muted-foreground' },
};

/** Dot + word. The only way a state is shown — never colour on its own. */
export function Pill({
  tone = 'neutral',
  dot = true,
  icon: Icon,
  children,
  className,
}: {
  tone?: PillTone;
  dot?: boolean;
  icon?: (props: { className?: string; 'aria-hidden'?: boolean }) => ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold',
        PILL_TONE[tone].wrap,
        className,
      )}
    >
      {Icon ? (
        <Icon aria-hidden className="size-3.5 shrink-0" />
      ) : dot ? (
        <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', PILL_TONE[tone].dot)} />
      ) : null}
      {children}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Sparkline & ring — the small charts that live inside a KPI
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * A shape, not a chart: no axes, no ticks, no tooltip. It says "this has been
 * rising" beside a figure that says by how much.
 */
export function Sparkline({
  points,
  tone = 'teal',
  width = 88,
  height = 34,
  className,
}: {
  points: number[];
  tone?: 'teal' | 'orange' | 'muted';
  width?: number;
  height?: number;
  className?: string;
}) {
  if (points.length < 2) return null;
  const stroke =
    tone === 'teal' ? 'var(--primary)' : tone === 'orange' ? 'var(--accent)' : 'var(--chart-axis)';
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const step = width / (points.length - 1);
  const coords = points.map((value, index) => {
    const x = index * step;
    const y = height - 3 - ((value - min) / span) * (height - 6);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={cn('shrink-0 overflow-visible', className)}
    >
      <polyline
        points={coords.join(' ')}
        fill="none"
        stroke={stroke}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Donut with the figure in the middle. Used where a share of a ceiling is the
 * whole point — a ring reads as "how full" faster than a bar does.
 */
export function Ring({
  value,
  label,
  caption,
  tone = 'teal',
  size = 132,
  className,
}: {
  /** 0–1, clamped. */
  value: number;
  label: string;
  caption?: string;
  /** `onFill` is the variant for a ring drawn on a brand tile. */
  tone?: 'teal' | 'orange' | 'red' | 'onFill';
  size?: number;
  className?: string;
}) {
  const fraction = Math.max(0, Math.min(1, value));
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const colour =
    tone === 'orange'
      ? 'var(--accent)'
      : tone === 'red'
        ? 'var(--destructive)'
        : tone === 'onFill'
          ? 'var(--tile-teal-foreground)'
          : 'var(--primary)';
  // On a tile the unfilled track has to be a wash of the ring itself; the
  // page's sunken grey would read as a hole punched in the card.
  const track =
    tone === 'onFill'
      ? 'color-mix(in srgb, var(--tile-teal-foreground) 25%, transparent)'
      : 'var(--surface-sunken)';
  return (
    <div className={cn('relative shrink-0', className)} style={{ width: size, height: size }}>
      <svg aria-hidden width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={track}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colour}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          className="transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-lg font-extrabold tabular-nums text-foreground">
          {label}
        </span>
        {caption ? (
          <span className="mt-0.5 text-[11px] font-semibold text-muted-foreground">{caption}</span>
        ) : null}
      </div>
    </div>
  );
}

/** Horizontal track. Label above, figure right — never the bar alone. */
export function Bar({
  value,
  tone = 'teal',
  height = 8,
  className,
}: {
  value: number;
  tone?: 'teal' | 'orange' | 'amber' | 'red' | 'muted';
  height?: number;
  className?: string;
}) {
  const fill =
    tone === 'orange'
      ? 'bg-accent'
      : tone === 'amber'
        ? 'bg-warning'
        : tone === 'red'
          ? 'bg-destructive'
          : tone === 'muted'
            ? 'bg-[var(--chart-axis)]'
            : 'bg-primary';
  return (
    <div
      className={cn('w-full overflow-hidden rounded-full bg-surface-sunken', className)}
      style={{ height }}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-500', fill)}
        style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * StatCard — the workhorse
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * The brand tile fills. These are the design system's answer for a dashboard
 * KPI block — solid colour rather than an outlined card — and they are shared
 * with the transporter console so a metric tile looks the same everywhere.
 *
 * Teal is dark enough to need inverted text; the three pastels carry the
 * near-black. Both foregrounds come from tokens, so a theme swap follows.
 */
export type TileFill = 'teal' | 'sky' | 'peach' | 'pink';

const TILE: Record<
  TileFill,
  { card: string; disc: string; chip: string; ink: string; muted: string }
> = {
  teal: {
    card: 'border-transparent bg-tile-teal',
    // A solid white disc with the tile's own hue inside it, rather than the
    // translucent wash the console uses — a wash over a pastel reads as a grey
    // smudge, and this matches the white logo discs on the channel tabs above.
    disc: 'bg-white text-tile-teal',
    chip: 'bg-white/20 text-tile-teal-foreground',
    ink: 'text-tile-teal-foreground',
    muted: 'text-tile-teal-foreground/75',
  },
  sky: {
    card: 'border-transparent bg-tile-sky',
    disc: 'bg-white text-tile-foreground',
    chip: 'bg-white/70 text-tile-foreground',
    ink: 'text-tile-foreground',
    muted: 'text-tile-foreground/65',
  },
  peach: {
    card: 'border-transparent bg-tile-peach',
    disc: 'bg-white text-tile-foreground',
    chip: 'bg-white/70 text-tile-foreground',
    ink: 'text-tile-foreground',
    muted: 'text-tile-foreground/65',
  },
  pink: {
    card: 'border-transparent bg-tile-pink',
    disc: 'bg-white text-tile-foreground',
    chip: 'bg-white/70 text-tile-foreground',
    ink: 'text-tile-foreground',
    muted: 'text-tile-foreground/65',
  },
};

/**
 * The badge that rides on a filled tile.
 *
 * `Pill` cannot be used here: its tones are tinted surfaces meant for the card
 * background, and they disappear on a saturated fill. This washes the tile's
 * own colour instead, so the chip belongs to the block it sits on.
 */
export function TileBadge({
  fill,
  children,
  className,
}: {
  fill: TileFill;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold',
        TILE[fill].chip,
        className,
      )}
    >
      {children}
    </span>
  );
}

export interface StatCardProps {
  icon: (props: { className?: string; 'aria-hidden'?: boolean }) => ReactNode;
  tint?: ChipTint;
  /** Three words at most. This is a label, not a sentence. */
  label: string;
  /** The hero. Pre-formatted so the card never guesses a currency. */
  value: ReactNode;
  /** One short clause under the figure. Optional and usually unnecessary. */
  hint?: ReactNode;
  /** The single badge allowed on a card — a delta, a count, an alert. */
  badge?: ReactNode;
  spark?: number[];
  sparkTone?: 'teal' | 'orange' | 'muted';
  ring?: { value: number; label: string; tone?: 'teal' | 'orange' | 'red' };
  /** Frames the whole card when the figure itself is the alarm. */
  tone?: 'plain' | 'attention' | 'critical' | 'held';
  /**
   * Renders the card as a solid brand tile. Takes precedence over `tone` —
   * a fill and an alarm frame would fight, and a filled card is a headline,
   * not a warning. Anything that must read as held or overdue keeps `tone`.
   */
  fill?: TileFill;
  onClick?: () => void;
  className?: string;
}

const CARD_TONE: Record<NonNullable<StatCardProps['tone']>, string> = {
  plain: 'border-border bg-card',
  attention: 'border-accent/40 bg-accent-subtle',
  critical: 'border-destructive/40 bg-destructive-subtle',
  // Dashed, like every other held surface, so paused money never reads solid.
  held: 'border-dashed border-warning/60 bg-warning-subtle',
};

export function StatCard({
  icon: Icon,
  tint = 'teal',
  label,
  value,
  hint,
  badge,
  spark,
  sparkTone = 'teal',
  ring,
  tone = 'plain',
  fill,
  onClick,
  className,
}: StatCardProps) {
  const interactive = onClick !== undefined;
  const tile = fill ? TILE[fill] : undefined;
  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      className={cn(
        'rounded-card border p-5 shadow-card',
        tile ? tile.card : CARD_TONE[tone],
        interactive &&
          'cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        interactive && !tile && 'hover:bg-surface-sunken',
        interactive && tile && 'hover:brightness-[0.97]',
        className,
      )}
    >
      {/*
        The header wraps rather than truncates. A KPI card is read at every
        width the grid puts it at, and a label clipped to "Shipm…" has lost the
        only thing that says what the figure means — so when the badge cannot
        sit beside the label it drops to its own line instead.
      */}
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-[8.5rem] items-center gap-3">
          {tile ? (
            <span
              className={cn(
                'inline-flex size-11 shrink-0 items-center justify-center rounded-full',
                tile.disc,
              )}
            >
              <Icon aria-hidden className="size-5" />
            </span>
          ) : (
            <IconChip icon={Icon} tint={tint} />
          )}
          <span
            className={cn(
              'text-sm font-bold leading-tight',
              tile ? tile.ink : 'text-foreground',
            )}
          >
            {label}
          </span>
        </div>
        {badge ??
          (tile ? null : (
            <EllipsisVertical aria-hidden className="mt-1 size-4 shrink-0 text-muted-foreground/60" />
          ))}
      </div>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-x-3 gap-y-3">
        <div className="min-w-0">
          {/* Figures never wrap mid-number; they step down a size instead. */}
          <p
            className={cn(
              'whitespace-nowrap font-mono text-2xl font-extrabold leading-none tracking-tight tabular-nums sm:text-[28px]',
              tile ? tile.ink : 'text-foreground',
            )}
          >
            {value}
          </p>
          {hint ? (
            <p
              className={cn(
                'mt-2 text-xs font-semibold leading-snug',
                tile ? tile.muted : 'text-muted-foreground',
              )}
            >
              {hint}
            </p>
          ) : null}
        </div>
        {ring ? (
          <Ring value={ring.value} label={ring.label} tone={ring.tone} size={64} />
        ) : spark ? (
          <Sparkline points={spark} tone={sparkTone} />
        ) : null}
      </div>
    </div>
  );
}

/** The delta chip that rides in a StatCard's badge slot. */
export function Delta({
  value,
  suffix = 'vs last month',
  invert = false,
}: {
  /** Fraction, e.g. 0.128 → "+12.8%". */
  value: number;
  suffix?: string;
  /** For expense-like figures, where up is bad. */
  invert?: boolean;
}) {
  const up = value >= 0;
  const good = invert ? !up : up;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-1 text-xs font-bold',
        good
          ? 'bg-primary-subtle text-primary-subtle-foreground'
          : 'bg-accent-subtle text-accent-subtle-foreground',
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {up ? '+' : '−'}
      {Math.abs(value * 100).toFixed(1)}%
      {suffix ? <span className="font-semibold opacity-70">{suffix}</span> : null}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Panels
 * ═══════════════════════════════════════════════════════════════════════ */

/** A titled surface. One line of subtitle, maximum — usually none. */
export function Panel({
  title,
  subtitle,
  action,
  children,
  padded = true,
  dense = false,
  className,
  bodyClassName,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  /** Off for a full-bleed table. */
  padded?: boolean;
  /**
   * Tighter header/body padding for pages that stack many panels in one
   * scroll — the client, project and shipment tiers. Off by default so the
   * rest of the module (overview, invoices) keeps its current rhythm.
   */
  dense?: boolean;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn('overflow-hidden rounded-card border border-border bg-card shadow-card', className)}>
      {/* Wraps rather than truncates: a panel's subtitle is the sentence that
          says what the panel is for, and half of it is worth nothing. The
          header itself wraps too, so a wide action never squeezes the title. */}
      <div
        className={cn(
          'flex flex-wrap items-start justify-between gap-x-4 gap-y-2',
          dense ? 'px-4 pb-3 pt-3.5' : 'px-5 pb-4 pt-5',
        )}
      >
        <div className="min-w-[10rem] flex-1">
          <h2 className="text-base font-extrabold leading-tight text-foreground">{title}</h2>
          {subtitle ? (
            <p className="mt-1 text-xs font-semibold leading-snug text-muted-foreground">
              {subtitle}
            </p>
          ) : null}
        </div>
        {/*
          `shrink-0` keeps a small action — one button, one pill — from being
          squashed by a long title. `max-w-full` is what stops the opposite
          case: a wide action (a search box plus a filter rail) sized itself
          past the header and the panel's own `overflow-hidden` clipped it
          silently, so on a phone the right-hand end of the toolbar simply
          was not there. Capped at the header's width it wraps instead.
        */}
        {action ? <div className="min-w-0 max-w-full shrink-0">{action}</div> : null}
      </div>
      <div className={cn(padded && (dense ? 'px-4 pb-4' : 'px-5 pb-5'), bodyClassName)}>
        {children}
      </div>
    </section>
  );
}

/** Page heading + actions. One short line of context, never a paragraph. */
export function PageHead({
  title,
  subtitle,
  badge,
  actions,
}: {
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[26px] font-extrabold tracking-tight text-foreground">{title}</h1>
          {badge}
        </div>
        {subtitle ? (
          <p className="mt-1 text-sm font-medium text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Rounded-full segmented filter. Each option may carry its own dot colour. */
export function FilterPills<K extends string>({
  options,
  active,
  onChange,
  className,
}: {
  options: Array<{ key: K; label: string; count?: number; tone?: PillTone }>;
  active: K;
  onChange: (key: K) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn('inline-flex flex-wrap gap-1 rounded-full bg-surface-sunken p-1', className)}
    >
      {options.map((option) => {
        const isActive = option.key === active;
        return (
          <button
            key={option.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(option.key)}
            className={cn(
              'inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isActive
                ? 'bg-surface text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.tone ? (
              <span
                aria-hidden
                className={cn('size-1.5 shrink-0 rounded-full', PILL_TONE[option.tone].dot)}
              />
            ) : null}
            {option.label}
            {option.count !== undefined ? (
              <span className={cn('font-bold', isActive ? 'text-muted-foreground' : 'opacity-70')}>
                {option.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Avatar + name + one-line subtitle + right-hand figure. The list row shape
 * every reference dashboard uses, and the reason their lists scan in a glance.
 */
export function ListRow({
  name,
  logoUrl,
  sub,
  right,
  rightSub,
  leading,
  action,
  tone = 'plain',
  className,
}: {
  name: string;
  logoUrl?: string;
  sub?: ReactNode;
  right?: ReactNode;
  rightSub?: ReactNode;
  /** Replaces the avatar — for a direction glyph or a stage icon. */
  leading?: ReactNode;
  action?: ReactNode;
  tone?: 'plain' | 'attention' | 'critical';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-card-nested px-3 py-3',
        tone === 'critical'
          ? 'bg-destructive-subtle'
          : tone === 'attention'
            ? 'bg-accent-subtle'
            : 'hover:bg-surface-sunken',
        className,
      )}
    >
      {leading ?? <Avatar name={name} logoUrl={logoUrl} />}
      {/* Wraps rather than truncates. On a narrow screen the figure drops to
          its own line before a single word of the row's subject is cut. */}
      <div className="min-w-[9rem] flex-1">
        <p className="text-sm font-bold leading-snug text-foreground">{name}</p>
        {sub ? (
          <p className="mt-0.5 text-xs font-medium leading-snug text-muted-foreground">{sub}</p>
        ) : null}
      </div>
      {right !== undefined || rightSub !== undefined ? (
        <div className="shrink-0 text-right">

          {right !== undefined ? <div className="text-sm font-bold">{right}</div> : null}
          {rightSub !== undefined ? (
            <div className="mt-0.5 text-xs font-semibold text-muted-foreground">{rightSub}</div>
          ) : null}
        </div>
      ) : null}
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Buttons
 * ═══════════════════════════════════════════════════════════════════════ */

export function ActionButton({
  children,
  onClick,
  variant = 'ghost',
  icon: Icon,
  className,
  disabled,
}: {
  children: ReactNode;
  /* Takes the event, so a button sitting inside a link can stop the row's
     navigation before doing its own thing. `() => void` callers still fit. */
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  variant?: 'primary' | 'ghost' | 'quiet';
  icon?: (props: { className?: string; 'aria-hidden'?: boolean }) => ReactNode;
  className?: string;
  /** Reserved for controls that need a value first — never for permissions. */
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        variant === 'primary'
          ? 'bg-primary-bold text-primary-bold-foreground hover:bg-primary-active'
          : variant === 'ghost'
            ? 'border border-border text-foreground hover:bg-surface-sunken'
            : 'text-primary-subtle-foreground hover:bg-primary-subtle',
        disabled ? 'pointer-events-none opacity-45' : '',
        className,
      )}
    >
      {Icon ? <Icon aria-hidden className="size-4" /> : null}
      {children}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Risk / held / unpriced / stage — the semantic guarantees
 * ═══════════════════════════════════════════════════════════════════════ */

/** Paused money. Dashed and marked, so it can never pass for payable. */
export function HeldChip({ label = 'On hold', className }: { label?: string; className?: string }) {
  return (
    <Pill
      tone="amber"
      icon={PauseCircle}
      className={cn('border border-dashed border-warning/60', className)}
    >
      {label}
    </Pill>
  );
}

/** The visible gap. Louder once money has actually left. */
export function UnpricedChip({ moneyOut, className }: { moneyOut?: boolean; className?: string }) {
  if (moneyOut) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-accent-bold px-2.5 py-1 text-xs font-extrabold text-accent-bold-foreground',
          className,
        )}
      >
        Unpriced
      </span>
    );
  }
  return (
    <Pill tone="orange" className={cn('border border-accent/40', className)}>
      Unpriced
    </Pill>
  );
}

/** A rate: the real figure, or the honest gap. Never an estimate, never zero. */
export function RateCell({ rateDjf, moneyOut }: { rateDjf: number | null; moneyOut?: boolean }) {
  if (rateDjf === null) return <UnpricedChip moneyOut={moneyOut} />;
  return <MoneyAmount value={rateDjf} className="text-sm" />;
}

/*
 * Shipment stage tones. `awaiting_pod` is the only orange one because it is
 * the only stage that is somebody's fault: a container was delivered and
 * nobody brought back the paper, and until they do the whole consignment's
 * money is frozen. `ready` is teal — the desk's move. `released` and `settled`
 * are quiet: the decision is behind them.
 */
const SHIPMENT_STAGE_TONE: Record<ShipmentStage, PillTone> = {
  awaiting_pod: 'orange',
  ready: 'teal',
  released: 'neutral',
  settled: 'neutral',
};

const SHIPMENT_STAGE_LABEL: Record<ShipmentStage, string> = {
  awaiting_pod: 'Awaiting PoD',
  ready: 'Ready to release',
  released: 'Released',
  settled: 'Settled',
};

export function StageChip({
  stage,
  held,
  className,
}: {
  stage: ShipmentStage;
  held?: boolean;
  className?: string;
}) {
  if (held) return <HeldChip className={className} />;
  return (
    <Pill tone={SHIPMENT_STAGE_TONE[stage]} className={className}>
      {SHIPMENT_STAGE_LABEL[stage]}
    </Pill>
  );
}

const BOOKING_STAGE_TONE: Record<BookingStage, PillTone> = {
  in_transit: 'neutral',
  awaiting_pod: 'orange',
  proven: 'teal',
};

const BOOKING_STAGE_LABEL: Record<BookingStage, string> = {
  in_transit: 'In transit',
  awaiting_pod: 'Awaiting PoD',
  proven: 'Proven',
};

/**
 * One container's state. Separate from `StageChip` on purpose: a booking never
 * has a payout stage, and letting the two share a component is how a screen
 * ends up implying a single container can be released.
 */
export function BookingStageChip({
  stage,
  className,
}: {
  stage: BookingStage;
  className?: string;
}) {
  return (
    <Pill tone={BOOKING_STAGE_TONE[stage]} className={className}>
      {BOOKING_STAGE_LABEL[stage]}
    </Pill>
  );
}

const SETTLEMENT_TONE: Record<SettlementStatus, PillTone> = {
  blocked: 'neutral',
  payable: 'orange',
  part_paid: 'amber',
  paid: 'teal',
};

const SETTLEMENT_LABEL: Record<SettlementStatus, string> = {
  blocked: 'On hold',
  payable: 'Payable now',
  part_paid: 'Part settled',
  paid: 'Settled',
};

/** Where one transporter's settlement stands on one shipment. */
export function SettlementChip({
  status,
  className,
}: {
  status: SettlementStatus;
  className?: string;
}) {
  return (
    <Pill tone={SETTLEMENT_TONE[status]} className={className}>
      {SETTLEMENT_LABEL[status]}
    </Pill>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Parties
 * ═══════════════════════════════════════════════════════════════════════ */

/** Avatar + name (+ one line under). Never a bare company name. */
export function PartyCell({
  name,
  logoUrl,
  sub,
  size = 34,
  className,
}: {
  name: string;
  logoUrl?: string;
  sub?: ReactNode;
  size?: number;
  className?: string;
}) {
  return (
    <span className={cn('flex min-w-0 items-center gap-2.5', className)}>
      <Avatar name={name} logoUrl={logoUrl} size={size} />
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold text-foreground">{name}</span>
        {sub ? (
          <span className="block truncate text-xs font-medium text-muted-foreground">{sub}</span>
        ) : null}
      </span>
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Table — six columns, 68px rows, 13px text
 * ═══════════════════════════════════════════════════════════════════════ */

export function DataTable({
  children,
  minWidth = 860,
  className,
}: {
  children: ReactNode;
  minWidth?: number;
  className?: string;
}) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full border-collapse text-left" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

export function Th({
  children,
  align = 'left',
  className,
}: {
  children?: ReactNode;
  align?: 'left' | 'right';
  className?: string;
}) {
  return (
    <th
      className={cn(
        'whitespace-nowrap border-y border-border bg-surface-sunken/50 px-4 py-3 text-[11px] font-extrabold uppercase tracking-[0.07em] text-muted-foreground',
        align === 'right' && 'text-right',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = 'left',
  colSpan,
  className,
}: {
  children?: ReactNode;
  align?: 'left' | 'right';
  colSpan?: number;
  className?: string;
}) {
  return (
    <td
      colSpan={colSpan}
      className={cn(
        'border-b border-border-subtle px-4 py-3.5 align-middle text-sm',
        align === 'right' && 'text-right',
        className,
      )}
    >
      {children}
    </td>
  );
}

/** The ⋮ affordance at the end of a row. */
export function RowMenu({ label }: { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      className="cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-surface-sunken hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <EllipsisVertical aria-hidden className="size-4" />
    </button>
  );
}

export function TableFoot({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 text-xs font-semibold text-muted-foreground">
      {children}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <p className="px-4 py-12 text-center text-sm font-semibold text-muted-foreground">{message}</p>
  );
}
