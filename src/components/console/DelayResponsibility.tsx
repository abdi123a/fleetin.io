import { CompanyAvatar } from '@/design-system';
import { cn } from '@/utils';

/**
 * Delay responsibility — the two blocks both consoles are built from.
 *
 * The shipper dashboard settled the shape of this panel: a one-line-per-party
 * list of who owns the delay, and clicking a party opens *their* root causes as
 * circles sized by share. The transporter console asks the same question of the
 * same corridor, so it runs the same two blocks rather than a lookalike — the
 * only thing that differs between the two seats is who the cast is and whether
 * the shares are counted in shipments or in hours.
 *
 * Each card keeps its own frame, headings and empty-state copy; what lives here
 * is the list, the causes and the bubbles.
 *
 * Colour: the root-cause graphics use the console brand pair — teal + orange —
 * at five depths and nothing else. A cause is not a status, so no greens, reds
 * or chart hues, and the depth carries rank rather than meaning.
 */

export type DelayCauseTone =
  | 'primary-bold'
  | 'primary'
  | 'primary-soft'
  | 'accent-bold'
  | 'accent-soft';

const CAUSE_TONE: Record<
  DelayCauseTone,
  { fill: string; text: string; swatch: string }
> = {
  'primary-bold': {
    fill: 'var(--primary-bold)',
    text: 'var(--primary-bold-foreground)',
    swatch: 'bg-primary-bold',
  },
  primary: {
    fill: 'var(--primary)',
    text: 'var(--primary-foreground)',
    swatch: 'bg-primary',
  },
  'primary-soft': {
    fill: 'color-mix(in srgb, var(--primary) 55%, var(--surface))',
    text: 'var(--primary-subtle-foreground)',
    swatch: 'bg-primary/55',
  },
  'accent-bold': {
    fill: 'var(--accent-bold)',
    text: 'var(--accent-bold-foreground)',
    swatch: 'bg-accent-bold',
  },
  'accent-soft': {
    fill: 'color-mix(in srgb, var(--accent) 45%, var(--surface))',
    text: 'var(--accent-subtle-foreground)',
    swatch: 'bg-accent/45',
  },
};

export interface DelayPartyRow {
  key: string;
  /** Company name — shown beside its logo, never instead of it. */
  name: string;
  logoUrl?: string;
  /** Two letters for a party that has no company behind it (Port, Customs). */
  fallback?: string;
  /** Marks the row as the logged-in side, which earns the "You" tag. */
  isOwn?: boolean;
  /** Nothing attributed = the row is present but not selectable. */
  count: number;
  share: number;
  /** The muted figure left of the percentage — "6/10" on shipments, "32 h" on hours. */
  valueLabel: string;
}

export interface DelayCauseRow {
  key: string;
  label: string;
  share: number;
  tone: DelayCauseTone;
}

/* ---------------------------------------------------------------------------
 * Who is responsible
 * ------------------------------------------------------------------------ */

export function DelayPartyList({
  parties,
  selected,
  onSelect,
  label = 'Responsible party',
  className,
}: {
  parties: DelayPartyRow[];
  selected: string | null;
  onSelect: (key: string) => void;
  label?: string;
  className?: string;
}) {
  return (
    <ul className={cn('flex flex-col gap-1', className)} role="listbox" aria-label={label}>
      {parties.map((party) => {
        const pct = Math.round(party.share * 100);
        const isSelected = selected === party.key;
        const disabled = party.count === 0;
        return (
          <li key={party.key}>
            <button
              type="button"
              role="option"
              aria-selected={isSelected}
              disabled={disabled}
              onClick={() => onSelect(party.key)}
              className={cn(
                'flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                disabled && 'cursor-not-allowed opacity-40',
                !disabled && 'cursor-pointer hover:bg-muted/60',
                isSelected && 'bg-muted/80',
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                <CompanyAvatar
                  src={party.logoUrl}
                  name={party.name}
                  fallback={party.fallback ?? party.name.substring(0, 2).toUpperCase()}
                  size="xs"
                  shape="circle"
                  className="shrink-0"
                />
                <span className="type-body-sm truncate font-medium text-foreground">
                  {party.name}
                  {party.isOwn ? (
                    <span className="ml-1.5 text-[10px] font-semibold text-muted-foreground">
                      You
                    </span>
                  ) : null}
                </span>
              </span>
              <span className="type-body-sm shrink-0 tabular-nums text-muted-foreground">
                {party.valueLabel}
                <span className="ml-2 font-semibold text-foreground">{pct}%</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/* ---------------------------------------------------------------------------
 * Root causes — the list, and the same shares as circles
 * ------------------------------------------------------------------------ */

export function DelayCauseBreakdown({
  causes,
  className,
}: {
  causes: DelayCauseRow[];
  className?: string;
}) {
  if (causes.length === 0) return null;

  return (
    <div className={cn('flex items-center justify-between gap-4', className)}>
      <ul className="flex min-w-0 flex-1 flex-col gap-2">
        {causes.map((cause) => (
          <li key={cause.key} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <span
                className={cn('size-2.5 shrink-0 rounded-full', CAUSE_TONE[cause.tone].swatch)}
                aria-hidden
              />
              <span className="type-body-sm truncate font-medium text-foreground">
                {cause.label}
              </span>
            </span>
            <span className="type-body-sm shrink-0 tabular-nums text-muted-foreground">
              {Math.round(cause.share * 100)}%
            </span>
          </li>
        ))}
      </ul>

      <CauseBubbles causes={causes} />
    </div>
  );
}

function CauseBubbles({ causes }: { causes: DelayCauseRow[] }) {
  const ranked = [...causes].sort((a, b) => b.share - a.share);
  const [a, b, c] = ranked;
  if (!a) return null;

  const size = (share: number) => Math.round(36 + share * 52);

  return (
    <div
      className="relative h-[7.25rem] w-[8.25rem] shrink-0"
      role="img"
      aria-label={causes
        .map((cause) => `${cause.label} ${Math.round(cause.share * 100)}%`)
        .join(', ')}
    >
      <Bubble cause={a} diameter={size(a.share)} className="absolute left-0 top-0" />
      {b ? <Bubble cause={b} diameter={size(b.share)} className="absolute right-0 top-7" /> : null}
      {c ? <Bubble cause={c} diameter={size(c.share)} className="absolute bottom-0 left-6" /> : null}
    </div>
  );
}

function Bubble({
  cause,
  diameter,
  className,
}: {
  cause: DelayCauseRow;
  diameter: number;
  className?: string;
}) {
  const tone = CAUSE_TONE[cause.tone];
  const pct = Math.round(cause.share * 100);
  const fontSize = diameter >= 56 ? 13 : diameter >= 44 ? 11 : 10;

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full font-bold tabular-nums shadow-sm',
        className,
      )}
      style={{
        width: diameter,
        height: diameter,
        background: tone.fill,
        color: tone.text,
        fontSize,
      }}
      title={`${cause.label}: ${pct}%`}
    >
      {pct}%
    </span>
  );
}
