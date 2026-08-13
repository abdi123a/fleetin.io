import type { ReactNode } from 'react';
import { Card } from '@/design-system';
import { cn } from '@/utils';

/**
 * The small vocabulary every panel of the transporter console is built from.
 *
 * The shipper console proved the point: once six panels each invent their own
 * title size, their own meter height and their own footnote treatment, the grid
 * stops reading as one instrument and starts reading as six unrelated cards.
 * These are the shared parts — frame, section label, meter, legend, footnote —
 * so a new panel is an arrangement of known pieces rather than a new dialect.
 *
 * Colour discipline, inherited from the shipper dashboard: **teal reports,
 * amber asks.** Teal is what happened, amber is what wants attention, and red
 * is reserved for a clock that has already run out. No chart hues, no success
 * green as decoration, and no coloured rule along a card's top edge.
 */

/* ---------------------------------------------------------------------------
 * Frame
 * ------------------------------------------------------------------------ */

/** Every console panel carries the card shadow, and nothing else. */
export const PANEL_SURFACE = 'shadow-card';

export interface ConsolePanelProps {
  title: string;
  /** One clause under the title saying what the panel answers. */
  subtitle?: ReactNode;
  /** Sits opposite the title — a link, a chip, a pair of figures. */
  action?: ReactNode;
  /** Rendered below the header inside the same bordered band (tabs, toggles). */
  band?: ReactNode;
  /** Rendered under a hairline at the foot of the panel — the conclusion. */
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}

export function ConsolePanel({
  title,
  subtitle,
  action,
  band,
  footer,
  className,
  bodyClassName,
  children,
}: ConsolePanelProps) {
  return (
    <Card
      variant="default"
      padding="none"
      className={cn('flex h-full min-h-0 flex-col overflow-visible', PANEL_SURFACE, className)}
    >
      <div className={cn('px-5 pt-5', band ? 'pb-0' : 'pb-0')}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="type-h3 truncate text-foreground">{title}</h3>
            {subtitle ? (
              <div className="type-body-xs mt-1 text-muted-foreground">{subtitle}</div>
            ) : null}
          </div>
          {action ? <div className="shrink-0 text-right">{action}</div> : null}
        </div>
        {band}
      </div>

      <div className={cn('flex min-h-0 flex-1 flex-col px-5 pt-4 pb-5', bodyClassName)}>
        {children}
      </div>

      {footer ? (
        <div className="border-t border-border-subtle px-5 py-3.5">{footer}</div>
      ) : null}
    </Card>
  );
}

/* ---------------------------------------------------------------------------
 * Labels and links
 * ------------------------------------------------------------------------ */

/** The all-caps rule that opens a block inside a panel. */
export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        'text-[10px] font-extrabold uppercase tracking-[0.09em] text-muted-foreground',
        className,
      )}
    >
      {children}
    </p>
  );
}

export function PanelLink({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="type-body-xs shrink-0 cursor-pointer rounded-full bg-primary-subtle px-3 py-1.5 text-primary-subtle-foreground transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
    >
      {children}
    </button>
  );
}

export function PanelOutlineLink({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="type-body-xs shrink-0 cursor-pointer whitespace-nowrap rounded-md border border-border px-3 py-1.5 text-foreground transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------------------
 * Legend
 * ------------------------------------------------------------------------ */

export interface LegendItem {
  label: string;
  /** Any CSS colour — pass a token like `var(--primary)`. */
  color: string;
  shape?: 'dot' | 'square';
}

export function Legend({ items, className }: { items: LegendItem[]; className?: string }) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] font-semibold text-muted-foreground',
        className,
      )}
    >
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className={cn('size-2 shrink-0', item.shape === 'square' ? 'rounded-[2px]' : 'rounded-full')}
            style={{ background: item.color }}
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Meters
 * ------------------------------------------------------------------------ */

export interface MeterProps {
  /** 0–1. Clamped, so a value over target cannot overrun the track. */
  value: number;
  color: string;
  /** 0–1. Draws the black network tick — the comparison the row exists for. */
  benchmark?: number;
  height?: number;
  className?: string;
}

/**
 * A single track with an optional benchmark tick.
 *
 * The tick is the whole point of most rows on this page: 3.6 h at a consignee
 * site means nothing until you can see the network sits at 2.4 h.
 */
export function Meter({ value, color, benchmark, height = 9, className }: MeterProps) {
  const width = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div
      className={cn('relative w-full rounded-full bg-surface-sunken', className)}
      style={{ height }}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${width}%`, background: color }}
      />
      {benchmark !== undefined ? (
        <span
          aria-hidden
          className="absolute rounded-sm bg-foreground"
          style={{
            left: `${Math.max(0, Math.min(1, benchmark)) * 100}%`,
            top: -3,
            width: 2,
            height: height + 6,
          }}
        />
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Segmented bar — one row, several shares
 * ------------------------------------------------------------------------ */

export interface Segment {
  key: string;
  label?: string;
  value: number;
  color: string;
  /** Text colour for the inline caption, when the segment carries one. */
  foreground?: string;
  caption?: string;
}

export function SegmentBar({
  segments,
  height = 46,
  className,
}: {
  segments: Segment[];
  height?: number;
  className?: string;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0) || 1;
  return (
    <div className={cn('flex gap-[3px] overflow-hidden rounded-md', className)} style={{ height }}>
      {segments.map((segment) => (
        <div
          key={segment.key}
          className="flex min-w-0 flex-col justify-center overflow-hidden px-2.5"
          style={{
            flex: `${(segment.value / total) * 100} 1 0%`,
            background: segment.color,
            color: segment.foreground ?? 'var(--tile-teal-foreground)',
          }}
          title={segment.label ? `${segment.label} — ${segment.value}` : undefined}
        >
          <span className="truncate text-sm font-extrabold leading-none tracking-tight">
            {segment.value}
          </span>
          {segment.caption ? (
            <span className="mt-0.5 truncate text-[9.5px] font-semibold opacity-80">
              {segment.caption}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Footnotes and boxed stats
 * ------------------------------------------------------------------------ */

/**
 * The sentence at the foot of a panel that says what the chart means.
 *
 * `tone="attention"` is the amber version, for a conclusion that is asking for
 * something rather than reporting it.
 */
export function InsightNote({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'attention';
  className?: string;
}) {
  return (
    <p
      className={cn(
        'type-body-xs rounded-card-nested px-3.5 py-3 leading-relaxed',
        tone === 'attention'
          ? 'border border-accent/35 bg-accent-subtle text-accent-subtle-foreground'
          : 'bg-surface-sunken text-muted-foreground',
        className,
      )}
    >
      {children}
    </p>
  );
}

export function StatBox({
  label,
  value,
  note,
  tone = 'neutral',
  className,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: 'neutral' | 'attention';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'min-w-0 rounded-card-nested px-3.5 py-3',
        tone === 'attention'
          ? 'border border-accent/35 bg-accent-subtle'
          : 'border border-border',
        className,
      )}
    >
      <SectionLabel
        className={tone === 'attention' ? 'text-accent-subtle-foreground' : undefined}
      >
        {label}
      </SectionLabel>
      <p
        className={cn(
          'mt-2 truncate text-lg font-extrabold tracking-tight tabular-nums',
          tone === 'attention' ? 'text-accent-subtle-foreground' : 'text-foreground',
        )}
      >
        {value}
      </p>
      {note ? (
        <p
          className={cn(
            'mt-1.5 truncate text-[11px] font-semibold',
            tone === 'attention' ? 'text-accent-subtle-foreground' : 'text-muted-foreground',
          )}
        >
          {note}
        </p>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Tabs
 * ------------------------------------------------------------------------ */

export interface PanelTab<K extends string> {
  key: K;
  label: string;
  count?: number;
}

/** Underline tabs — used where the tabs slice the same chart. */
export function UnderlineTabs<K extends string>({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: PanelTab<K>[];
  active: K;
  onChange: (key: K) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn('-mb-px flex gap-1 overflow-x-auto border-b border-border-subtle', className)}
    >
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.key)}
            className={cn(
              'shrink-0 cursor-pointer whitespace-nowrap border-b-2 px-3 py-2.5 text-xs font-bold transition-colors focus-visible:outline-none',
              isActive
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
            {tab.count !== undefined ? (
              <span className="ml-1.5 font-semibold text-muted-foreground">{tab.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Pill toggle — used where the tabs swap the whole table underneath. */
export function PillTabs<K extends string>({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: PanelTab<K>[];
  active: K;
  onChange: (key: K) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn('inline-flex gap-1 rounded-card-nested bg-surface-sunken p-1', className)}
    >
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.key)}
            className={cn(
              'cursor-pointer whitespace-nowrap rounded-[7px] px-5 py-2 text-xs font-bold transition-colors focus-visible:outline-none',
              isActive
                ? 'bg-surface text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
            {tab.count !== undefined ? (
              <span className="ml-1.5 font-semibold text-muted-foreground">{tab.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Status chips
 * ------------------------------------------------------------------------ */

export type ChipTone = 'critical' | 'attention' | 'info' | 'calm' | 'quiet';

const CHIP_TONE: Record<ChipTone, string> = {
  critical:
    'border border-destructive/40 bg-destructive-subtle text-destructive-subtle-foreground dark:bg-destructive-subtle dark:text-destructive-subtle-foreground',
  attention: 'border border-accent/40 bg-accent-subtle text-accent-subtle-foreground',
  info: 'border border-info/30 bg-info-subtle text-info-subtle-foreground',
  calm: 'bg-primary-subtle text-primary-subtle-foreground',
  quiet: 'bg-surface-sunken text-muted-foreground',
};

export function StatusChip({
  tone,
  children,
  pulse = false,
  className,
}: {
  tone: ChipTone;
  children: ReactNode;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold',
        CHIP_TONE[tone],
        className,
      )}
    >
      {pulse ? (
        <span className="relative flex size-1.5 shrink-0" aria-hidden>
          <span
            className={cn(
              'absolute inline-flex h-full w-full animate-ping motion-reduce:animate-none rounded-full opacity-75',
              tone === 'critical' ? 'bg-destructive' : 'bg-accent',
            )}
          />
          <span
            className={cn(
              'relative inline-flex size-1.5 rounded-full',
              tone === 'critical' ? 'bg-destructive' : 'bg-accent',
            )}
          />
        </span>
      ) : null}
      <span className="truncate">{children}</span>
    </span>
  );
}

/* ---------------------------------------------------------------------------
 * Party badge — the two-letter square that names who owns something
 * ------------------------------------------------------------------------ */

export function PartyBadge({
  initials,
  tone = 'calm',
  className,
}: {
  initials: string;
  tone?: 'calm' | 'attention' | 'info' | 'quiet';
  className?: string;
}) {
  const tones: Record<string, string> = {
    calm: 'bg-primary-subtle text-primary-subtle-foreground',
    attention: 'bg-accent-subtle text-accent-subtle-foreground',
    info: 'bg-info-subtle text-info-subtle-foreground',
    quiet: 'bg-surface-sunken text-muted-foreground',
  };
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex size-6 shrink-0 items-center justify-center rounded-md text-[9px] font-extrabold',
        tones[tone],
        className,
      )}
    >
      {initials}
    </span>
  );
}
