import type { ReactNode } from 'react';

import { CompanyAvatar } from '@/design-system';
import { AlertTriangle, ArrowRight, Clock, CornerDownLeft, Timer } from '@/design-system/icons';
import {
  DEADLINE_VERIFICATION_META,
  EMPTY_RETURN_STATUS_META,
  RETURN_RISK_META,
  companyInitials,
  getEmptyReturnCompanyLogo,
} from '@/data/emptyReturnData';
import {
  formatClock,
  formatDateTime,
  formatDuration,
  useEmptyReturnStore,
} from '@/stores/emptyReturn.store';
import type {
  DeadlineVerification,
  EmptyReturnStatus,
  ReturnRiskLevel,
} from '@/types/emptyReturn';
import { cn } from '@/utils';

/**
 * The empty-return module's shared vocabulary — nine marks, one file.
 *
 * These are here rather than inside the views because five separate routes
 * render the same nine things, and a risk pill that drifts between the
 * dashboard and the matching panel is worse than no pill at all. Every one of
 * them is declared at module top level and takes plain props; `EmptyReturnClock`
 * is the single exception and reads only `now`, because a clock that had to be
 * threaded through five page components would simply not be on five pages.
 *
 * The colour law they encode: **escalation is carried by fill, never by a
 * frame.** Cards keep the plain default border everywhere in this module; what
 * changes as a return goes bad is the pill behind the words. Two levels go
 * solid on purpose — `overdue`, the only animated thing in the module, and
 * `protected`, the only permanent one — and everything between them stays
 * subtle so those two still land.
 */

/* ---------------------------------------------------------------------------
 * Mono
 * ------------------------------------------------------------------------- */

export interface MonoProps {
  children: ReactNode;
  className?: string;
}

/**
 * Container, cycle and chain ids.
 *
 * These are compared down a column far more often than they are read as words,
 * so they are tabular and tightened — a column of `MSKU7070707` above
 * `MSCU4433221` should differ at the character that actually differs.
 */
export function Mono({ children, className }: MonoProps) {
  return <span className={cn('font-mono tabular-nums tracking-tight', className)}>{children}</span>;
}

/* ---------------------------------------------------------------------------
 * RiskBadge
 * ------------------------------------------------------------------------- */

export interface RiskBadgeProps {
  /** Null when the record has no deadline — renders an em dash, not a pill. */
  risk: ReturnRiskLevel | null;
  /** Render for the `bg-primary-bold` slab in Matching. See below. */
  onBold?: boolean;
  className?: string;
}

/**
 * Every `*-subtle` level inverted for the brand slab.
 *
 * The six normal levels are alpha washes designed for a light or dark page
 * canvas: in `.dark` each one resolves to a 14% mix of its hue with whatever is
 * behind it, and `--primary-bold` is pinned to teal-700 in *both* themes. Put
 * one on the other and `safe` lands near 2.5:1 — while `protected`, which is
 * itself `bg-primary-bold` with a `border-primary-bold`, disappears entirely
 * into the slab it is sitting on.
 *
 * So on brand the pill goes opaque and inverts instead: a white chip with teal
 * type, identical in both themes, matching the inversion the slab already uses
 * for `CompanyName tone="inverse"`. The level is then carried by the label and
 * the Timer alone, which is the same trade the slack figure beside it makes.
 */
const RISK_ON_BOLD = 'bg-primary-bold-foreground text-primary-bold border-primary-bold-foreground';

/**
 * The six-level deadline risk pill.
 *
 * Always carrying a Timer. Shape stays `rounded-md` so it reads as the urgency
 * chip beside the square lifecycle chip — not a competing saturated pill row.
 */
export function RiskBadge({ risk, onBold = false, className }: RiskBadgeProps) {
  if (!risk) {
    return (
      <span
        className={cn(
          'type-body-xs',
          onBold ? 'text-primary-bold-foreground/70' : 'text-muted-foreground',
          className,
        )}
      >
        —
      </span>
    );
  }

  const meta = RETURN_RISK_META[risk];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-semibold',
        onBold
          ? cn(RISK_ON_BOLD, risk === 'overdue' && 'animate-pulse motion-reduce:animate-none')
          : meta.className,
        className,
      )}
    >
      <Timer className="h-[11px] w-[11px] shrink-0" aria-hidden />
      {meta.label}
    </span>
  );
}

/* ---------------------------------------------------------------------------
 * StatusChip
 * ------------------------------------------------------------------------- */

export interface StatusChipProps {
  status: EmptyReturnStatus;
  className?: string;
}

/** Lifecycle state as a dot + label. Square corners, so it never reads as a risk pill. */
export function StatusChip({ status, className }: StatusChipProps) {
  const meta = EMPTY_RETURN_STATUS_META[status];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium',
        meta.chipClassName,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', meta.dotClassName)} aria-hidden />
      {meta.label}
    </span>
  );
}

/* ---------------------------------------------------------------------------
 * CyclePair
 * ------------------------------------------------------------------------- */

/** Shown in the teal half while no full load has been chosen. */
export const FULL_LOAD_PLACEHOLDER = 'to select';

export interface CyclePairProps {
  /** The empty container going back. */
  empty: string;
  /** The full container coming out, or null/undefined while unchosen. */
  full?: string | null;
  /** Denser type for the Cycles table. Nothing else scales. */
  small?: boolean;
  className?: string;
}

/**
 * The module's signature mark: one cycle, both halves, flush.
 *
 * Left is the return — a `CornerDownLeft` arrow turning back, on a recessed
 * neutral. Right is the outbound full load — an `ArrowRight`, on saturated
 * brand. They share one rounded-sm border with no gap because they are one
 * movement, not two shipments.
 *
 * The teal half is *always* present and always occupied: when no mission has
 * been picked it says "to select" in the same mono, same colour, same weight.
 * An empty return without a full load is meant to look like a coloured,
 * unfinished thing — greying it out would let it be ignored, which is exactly
 * the outcome the mark exists to prevent.
 *
 * `bg-muted` rather than a literal near-black: `bg-foreground` inverts to
 * near-white in dark mode and would make the "empty" half the brightest object
 * on the page. `--primary-bold` is teal-700 in both themes, so the right half
 * never shifts and the recessed/saturated contrast survives the theme switch.
 */
export function CyclePair({ empty, full, small = false, className }: CyclePairProps) {
  const outbound = full || FULL_LOAD_PLACEHOLDER;
  const pending = !full;

  return (
    <span
      aria-label={`Empty ${empty} returning, full ${outbound} outbound`}
      title={`${empty} → ${outbound}`}
      className={cn(
        'inline-flex w-fit max-w-full items-stretch overflow-hidden rounded-md border border-border',
        small ? 'text-[11px]' : 'text-xs',
        className,
      )}
    >
      <span className="flex min-w-0 max-w-[9.5rem] items-center gap-1 bg-muted px-2 py-1 text-foreground">
        <CornerDownLeft className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
        <Mono className="truncate font-medium">{empty}</Mono>
      </span>
      <span
        className={cn(
          'flex min-w-0 max-w-[9.5rem] items-center gap-1 px-2 py-1',
          pending
            ? 'bg-primary-subtle text-primary-subtle-foreground'
            : 'bg-primary-bold text-primary-bold-foreground',
        )}
      >
        <ArrowRight
          className={cn(
            'h-3 w-3 shrink-0',
            pending ? 'text-primary/70' : 'text-primary-bold-foreground/70',
          )}
          aria-hidden
        />
        <Mono className="truncate font-medium">{outbound}</Mono>
      </span>
    </span>
  );
}

/* ---------------------------------------------------------------------------
 * SlackValue / DeadlineCell
 * ------------------------------------------------------------------------- */

/**
 * How hard the slack figure argues.
 *
 * `list` is the two-step Cycles column (late or not). `urgent` is the
 * three-step dashboard rail, which also calls out the last six hours. `plain`
 * is for the dark matching panel, where a semantic text colour would be
 * unreadable against an inverting surface — there the risk badge beside it
 * carries the meaning instead.
 */
export type SlackTone = 'list' | 'urgent' | 'plain';

export interface SlackValueProps {
  /** Milliseconds of margin, or null when there is no deadline. */
  value: number | null;
  tone?: SlackTone;
  /** Override the hours-and-minutes default — the risk board reads in days. */
  format?: (value: number | null) => string;
  className?: string;
}

const CRITICAL_WINDOW_MS = 6 * 3_600_000;

function slackToneClass(value: number | null, tone: SlackTone): string {
  // `?? 0` deliberately: a record with no deadline reads "—" and is not red.
  const slack = value ?? 0;

  if (tone === 'plain') return '';
  if (slack < 0) return 'text-destructive';
  // `text-accent` is orange-500 — a fill, 1.9:1 on a white card. Amber type in
  // this app is always the `-subtle-foreground` pair.
  if (tone === 'urgent') {
    return slack < CRITICAL_WINDOW_MS ? 'text-accent-subtle-foreground' : 'text-foreground';
  }
  return 'text-muted-foreground';
}

/** Signed hours-and-minutes margin. `+4h00` / `−1h30` / `—`. */
export function SlackValue({ value, tone = 'list', format = formatDuration, className }: SlackValueProps) {
  return (
    <span
      className={cn(
        'font-mono font-bold tabular-nums',
        slackToneClass(value, tone),
        className,
      )}
    >
      {format(value)}
    </span>
  );
}

export interface DeadlineCellProps {
  deadline: number | null;
  slack: number | null;
  tone?: SlackTone;
  className?: string;
}

/** The deadline stamp with its margin underneath — one cell, two facts. */
export function DeadlineCell({ deadline, slack, tone = 'list', className }: DeadlineCellProps) {
  return (
    <span className={cn('flex min-w-0 flex-col text-xs', className)}>
      <Mono className="text-foreground">{formatDateTime(deadline)}</Mono>
      <SlackValue value={slack} tone={tone} />
    </span>
  );
}

/* ---------------------------------------------------------------------------
 * DeadlineStatusLabel
 * ------------------------------------------------------------------------- */

export interface DeadlineStatusLabelProps {
  state: DeadlineVerification;
  /** Drop the colour — the dark matching panel prints this label plain. */
  plain?: boolean;
  className?: string;
}

/** Whether the deadline has been confirmed with the line. Text only, never a chip. */
export function DeadlineStatusLabel({ state, plain = false, className }: DeadlineStatusLabelProps) {
  const meta = DEADLINE_VERIFICATION_META[state];
  return (
    <span className={cn('font-semibold', !plain && meta.className, className)}>{meta.label}</span>
  );
}

/* ---------------------------------------------------------------------------
 * ExceptionBadge
 * ------------------------------------------------------------------------- */

export interface ExceptionBadgeProps {
  message: string;
  className?: string;
}

/** The red flag under a status chip. Small, but it is why a container stopped moving. */
export function ExceptionBadge({ message, className }: ExceptionBadgeProps) {
  return (
    <span
      title={message}
      className={cn(
        'inline-flex max-w-full min-w-0 items-center gap-1 rounded-sm border border-destructive/30 bg-destructive-subtle px-1.5 py-0.5 text-[10px] font-semibold text-destructive-subtle-foreground',
        className,
      )}
    >
      <AlertTriangle className="h-2.5 w-2.5 shrink-0" aria-hidden />
      <span className="truncate">{message}</span>
    </span>
  );
}

/* ---------------------------------------------------------------------------
 * CompanyName
 * ------------------------------------------------------------------------- */

export type CompanyNameTone = 'default' | 'muted' | 'strong' | 'inverse';

const COMPANY_TONE: Record<CompanyNameTone, string> = {
  default: 'text-foreground',
  muted: 'text-muted-foreground',
  strong: 'font-medium text-foreground',
  /** For the brand slab in Matching — see SelectedEmptyPanel. */
  inverse: 'text-primary-bold-foreground',
};

export interface CompanyNameProps {
  name: string;
  /** Override the registry lookup. Rarely needed. */
  logoUrl?: string;
  size?: 'xs' | 'sm';
  tone?: CompanyNameTone;
  /** Avatar only — for the tightest cells. */
  showName?: boolean;
  className?: string;
  textClassName?: string;
}

/**
 * A shipper or transporter, always with its mark.
 *
 * No company in this module is ever rendered as a bare string: a dispatcher
 * scanning eight rows finds the carrier by its logo, not by reading four
 * similarly-shaped names. Carriers with no mark in the system fall back to two
 * letters, which is the same behaviour the partners page already has.
 */
export function CompanyName({
  name,
  logoUrl,
  size = 'xs',
  tone = 'default',
  showName = true,
  className,
  textClassName,
}: CompanyNameProps) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      <CompanyAvatar
        src={logoUrl ?? getEmptyReturnCompanyLogo(name)}
        name={name}
        fallback={companyInitials(name)}
        size={size}
        shape="circle"
        className="shrink-0"
      />
      {showName && (
        <span className={cn('truncate', COMPANY_TONE[tone], textClassName)}>{name}</span>
      )}
    </span>
  );
}

/* ---------------------------------------------------------------------------
 * PanelHeading
 * ------------------------------------------------------------------------- */

export interface PanelHeadingProps {
  children: ReactNode;
  /** A rendered icon, e.g. `<Clock className="h-3 w-3" />`. */
  icon?: ReactNode;
  /** Heading level. 2 for a view section, 3 for a panel inside one. */
  level?: 2 | 3;
  className?: string;
}

/** The uppercase micro-heading every panel in this module wears. */
export function PanelHeading({ children, icon, level = 3, className }: PanelHeadingProps) {
  const content = (
    <>
      {icon}
      {children}
    </>
  );
  const classes = cn(
    'flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground',
    className,
  );

  return level === 2 ? <h2 className={classes}>{content}</h2> : <h3 className={classes}>{content}</h3>;
}

/* ---------------------------------------------------------------------------
 * EmptyReturnClock
 * ------------------------------------------------------------------------- */

export interface EmptyReturnClockProps {
  className?: string;
}

/**
 * The module's live clock, in every page header.
 *
 * Every risk pill and every slack figure in this module is arithmetic against
 * `store.now`, and none of them says so. The clock is the only thing on screen
 * that admits the numbers are moving — which is why it belongs on all five
 * views and not just the dashboard, and most of all on Cycles and Matching,
 * where a slack figure that had quietly frozen would be read as current.
 *
 * It subscribes to `now` alone, so a tick re-renders this span and nothing else
 * in the header.
 */
export function EmptyReturnClock({ className }: EmptyReturnClockProps) {
  const now = useEmptyReturnStore((state) => state.now);

  return (
    <span className={cn('inline-flex items-center gap-1.5 text-muted-foreground', className)}>
      <Clock className="h-4 w-4 shrink-0" aria-hidden />
      <Mono className="text-sm font-medium">{formatClock(now)}</Mono>
    </span>
  );
}
