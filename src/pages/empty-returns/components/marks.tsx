import type { ReactNode } from 'react';

import { CompanyAvatar } from '@/design-system';
import { useCompanyLogo } from '@/features/companies/companyLogos';
import { AlertTriangle, MapPin, Package, PackageOpen, Timer } from '@/design-system/icons';
import {
  CONTAINER_OUTCOME_LABEL,
  CONTAINER_STAGE_META,
  RETURN_RISK_META,
  companyInitials,
  detentionFor,
  formatDetention,
  getEmptyReturnCompanyLogo,
  riskTextClass,
} from '@/data/emptyReturnData';
import {
  achievedMarginOf,
  formatSpan,
  formatStamp,
  isAccruingDetention,
  riskOf,
} from '@/stores/emptyReturn.store';
import type { EmptyReturnRecord, ReturnRiskLevel } from '@/types/emptyReturn';
import { cn } from '@/utils';

/**
 * The module's shared vocabulary — eight marks, one file.
 *
 * Five views render the same eight things, and a risk pill that drifts between
 * the Control Tower and the Matching workbench is worse than no pill at all.
 *
 * ## The one rule this file exists to hold
 *
 * **FULL and EMPTY must never be mistakable for each other.** A pairing links
 * two different physical containers, and every misreading of this product comes
 * from someone thinking the empty box becomes the next full box. So the two
 * marks differ in every channel at once: a full container is a solid brand slab
 * with a closed-box icon, an empty one is a dashed outline with an open-box
 * icon. Colour alone would not survive a monochrome print or a colour-blind
 * reader; the dash and the icon do.
 *
 * ## The colour law
 *
 * Teal is the good outcome (a full load, a pairing, a deadline protected). Blue
 * is a container still asking. Orange asks (return planned, watch). Red fails
 * (critical, overdue). Green confirms. Everything resolves through a semantic
 * token — no raw palette step appears here, and `npm run check:ds` enforces it.
 *
 * Stage and urgency collide in hue by construction, so they are separated by
 * *shape*: the risk pill is `rounded-md` with a Timer, the stage chip is a
 * neutral outline with a 6px dot. One saturated colour per row, and urgency
 * owns it.
 */

/* ---------------------------------------------------------------------------
 * Mono
 * ------------------------------------------------------------------------- */

export interface MonoProps {
  children: ReactNode;
  className?: string;
}

/**
 * Container, booking, cycle and chain references.
 *
 * Compared down a column far more often than read as words, so they are tabular
 * and tightened — `MSKU7070707` above `MSCU4433221` should differ at the
 * character that actually differs.
 */
export function Mono({ children, className }: MonoProps) {
  return <span className={cn('font-mono tabular-nums tracking-tight', className)}>{children}</span>;
}

/* ---------------------------------------------------------------------------
 * FULL / EMPTY tags
 * ------------------------------------------------------------------------- */

export interface ContainerTagProps {
  small?: boolean;
  className?: string;
}

/** A loaded container. Solid brand slab, closed box. */
export function FullTag({ small, className }: ContainerTagProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm bg-primary-bold font-extrabold uppercase tracking-widest text-primary-bold-foreground',
        small ? 'px-1 py-px text-[8px]' : 'px-1.5 py-0.5 text-[9px]',
        className,
      )}
    >
      <Package className={small ? 'size-2' : 'size-2.5'} aria-hidden />
      Full
    </span>
  );
}

/** An empty container. Dashed outline, open box — the visual opposite of Full. */
export function EmptyTag({ small, className }: ContainerTagProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm border border-dashed border-info bg-surface font-extrabold uppercase tracking-widest text-info-subtle-foreground',
        small ? 'px-1 py-px text-[8px]' : 'px-1.5 py-0.5 text-[9px]',
        className,
      )}
    >
      <PackageOpen className={small ? 'size-2' : 'size-2.5'} aria-hidden />
      Empty
    </span>
  );
}

/* ---------------------------------------------------------------------------
 * RiskBadge
 * ------------------------------------------------------------------------- */

export interface RiskBadgeProps {
  /** Null when the container has no deadline — renders an em dash, not a pill. */
  risk: ReturnRiskLevel | null;
  /**
   * The container is closed — the clock has stopped.
   *
   * `overdue` on a finished container is the right *severity* and the wrong
   * *tense*: the box is not running late, it came back late, and nothing anybody
   * does now changes that. A settled badge says so and drops the pulse — an
   * animation on a page of history is an alarm nobody can answer.
   */
  settled?: boolean;
  /** Render against the `bg-primary-bold` slab, where the alpha washes vanish. */
  onBold?: boolean;
  className?: string;
}

/**
 * Every level inverted for the brand slab.
 *
 * The normal levels are alpha washes designed for a page canvas: put one on a
 * teal slab and `safe` lands near 2.5:1, while `protected` — itself a teal tint
 * — disappears into the surface it sits on. On brand the pill goes opaque and
 * inverts instead, matching the inversion `CompanyName tone="inverse"` already
 * uses, and the level is carried by the label and the Timer alone.
 */
const RISK_ON_BOLD = 'bg-primary-bold-foreground text-primary-bold border-primary-bold-foreground';

/** The five-level urgency pill, always carrying a Timer. */
export function RiskBadge({ risk, settled = false, onBold = false, className }: RiskBadgeProps) {
  if (!risk) {
    return (
      <span
        className={cn(
          'text-xs',
          onBold ? 'text-primary-bold-foreground/70' : 'text-muted-foreground',
          className,
        )}
      >
        —
      </span>
    );
  }

  const finishedLate = settled && risk === 'overdue';
  const meta = RETURN_RISK_META[risk];
  const label = finishedLate ? 'Returned late' : meta.label;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-semibold',
        onBold
          ? cn(RISK_ON_BOLD, risk === 'overdue' && !settled && 'animate-pulse motion-reduce:animate-none')
          : finishedLate
            ? RETURN_RISK_META.critical.className
            : meta.className,
        className,
      )}
    >
      <Timer className="size-[11px] shrink-0" aria-hidden />
      {label}
    </span>
  );
}

/* ---------------------------------------------------------------------------
 * StageChip
 * ------------------------------------------------------------------------- */

export interface StageChipProps {
  record: EmptyReturnRecord;
  className?: string;
}

/**
 * What is happening, as a dot and a label.
 *
 * A closed container says its *outcome* rather than "Closed" — the mechanism is
 * not what anybody reads. Square corners so it never reads as a risk pill.
 */
export function StageChip({ record, className }: StageChipProps) {
  const meta = CONTAINER_STAGE_META[record.stage];
  const label =
    record.stage === 'closed' && record.outcome
      ? CONTAINER_OUTCOME_LABEL[record.outcome]
      : meta.label;
  const dot =
    record.stage === 'closed' && record.outcome === 'returned_late'
      ? 'bg-destructive'
      : record.stage === 'closed' && record.outcome === 'paired'
        ? 'bg-primary'
        : record.stage === 'closed'
          ? 'bg-success'
          : meta.dotClassName;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium',
        meta.chipClassName,
        className,
      )}
    >
      <span className={cn('size-1.5 shrink-0 rounded-full', dot)} aria-hidden />
      {label}
    </span>
  );
}

/* ---------------------------------------------------------------------------
 * DeadlineCell
 * ------------------------------------------------------------------------- */

export interface DeadlineCellProps {
  record: EmptyReturnRecord;
  now: number;
  className?: string;
}

/**
 * The decision window — the single most consequential figure on a row.
 *
 * Three lines, in the order they are read: how long is left, when the deadline
 * actually falls, and what it is already costing. The money line only appears
 * once there is money, so a healthy row stays quiet.
 *
 * A closed container reports the margin it *achieved* rather than one that
 * keeps shrinking after the fact — the clock stopped when the box came home.
 */
export function DeadlineCell({ record, now, className }: DeadlineCellProps) {
  if (!record.deadline) {
    return (
      <div className={className}>
        <div className="flex items-center gap-1 text-xs font-medium text-destructive">
          <AlertTriangle className="size-3 shrink-0" aria-hidden />
          No return deadline
        </div>
        <div className="text-2xs text-muted-foreground">Nothing to measure this box against</div>
      </div>
    );
  }

  if (record.returnedAt) {
    const late = record.returnedAt > record.deadline;
    return (
      <div className={className}>
        <div
          className={cn(
            'font-mono text-sm font-bold',
            late ? 'text-destructive' : 'text-success-subtle-foreground',
          )}
        >
          {late ? `${formatSpan(record.returnedAt - record.deadline)} late` : 'Back on time'}
        </div>
        <div className="text-2xs text-muted-foreground">
          Deadline <Mono>{formatStamp(record.deadline)}</Mono>
        </div>
      </div>
    );
  }

  const risk = riskOf(record, now);

  /* A pairing that beat the deadline has already settled this container's
     clock: the box leaves under that load, so no detention can follow. Counting
     down past a deadline it can no longer miss — and pricing detention on it —
     is the screen arguing with its own badge. */
  if (risk === 'protected') {
    const margin = achievedMarginOf(record);
    return (
      <div className={className}>
        <div className="text-2xs font-extrabold uppercase tracking-widest text-muted-foreground">
          Deadline settled
        </div>
        <div className="font-mono text-sm font-bold text-primary-subtle-foreground">
          {margin === null ? 'Protected' : `${formatSpan(margin)} to spare`}
        </div>
        <div className="text-2xs text-muted-foreground">
          Deadline <Mono>{formatStamp(record.deadline)}</Mono>
        </div>
      </div>
    );
  }

  const remaining = record.deadline - now;
  const detention = isAccruingDetention(record, now) ? detentionFor(-remaining) : 0;

  return (
    <div className={className}>
      <div className="text-2xs font-extrabold uppercase tracking-widest text-muted-foreground">
        Return deadline
      </div>
      <div className={cn('font-mono text-sm font-bold', riskTextClass(risk))}>
        {remaining < 0
          ? `${formatSpan(remaining)} overdue`
          : `${formatSpan(remaining)} remaining`}
      </div>
      <div className="text-2xs text-muted-foreground">
        <Mono>{formatStamp(record.deadline)}</Mono>
      </div>
      {detention > 0 && (
        <div className="text-2xs font-semibold text-destructive">
          Estimated detention {formatDetention(detention)}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * CompanyName
 * ------------------------------------------------------------------------- */

export interface CompanyNameProps {
  name: string;
  /** Render on a brand slab, where the neutral avatar frame disappears. */
  tone?: 'default' | 'inverse';
  size?: 'xs' | 'sm';
  className?: string;
}

/**
 * A company, always with its mark.
 *
 * Never the bare name: every shipper and transporter in Fleetin is a real
 * account with a logo, and a board that shows some marks and some plain strings
 * reads as two different kinds of company.
 */
export function CompanyName({ name, tone = 'default', size = 'xs', className }: CompanyNameProps) {
  /* The real account's mark first — this module names companies by their legal
     name, which is exactly how the registry is keyed. The demo fixture table
     stays behind it for the handful of names the API does not carry. */
  const registered = useCompanyLogo(name);

  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)} title={name}>
      <CompanyAvatar
        size={size}
        src={registered ?? getEmptyReturnCompanyLogo(name)}
        name={name}
        fallback={companyInitials(name)}
        className={cn('shrink-0', tone === 'inverse' && 'bg-primary-bold-foreground')}
      />
      <span className="truncate">{name}</span>
    </span>
  );
}

/* ---------------------------------------------------------------------------
 * LocationLine
 * ------------------------------------------------------------------------- */

export interface LocationLineProps {
  children: ReactNode;
  /** Hover text, so a name the column had to ellipse is still readable. */
  title?: string;
  className?: string;
}

/** A place, with the pin that says it is one. Truncates rather than wrapping. */
export function LocationLine({ children, title, className }: LocationLineProps) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1', className)} title={title}>
      <MapPin className="size-3 shrink-0 text-muted-foreground" aria-hidden />
      <span className="truncate">{children}</span>
    </span>
  );
}

/* ---------------------------------------------------------------------------
 * SectionLabel
 * ------------------------------------------------------------------------- */

export interface SectionLabelProps {
  children: ReactNode;
  className?: string;
}

/** The small all-caps rule this module titles every block with. */
export function SectionLabel({ children, className }: SectionLabelProps) {
  return (
    <h3
      className={cn(
        'text-2xs font-extrabold uppercase tracking-widest text-muted-foreground',
        className,
      )}
    >
      {children}
    </h3>
  );
}
