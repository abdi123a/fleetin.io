import { ArrowUpRight } from '@/design-system/icons';
import { formatKm } from '@/features/transporter-bi';
import { cn } from '@/utils';
import { ConsolePanel, Meter } from './kit';
import type { EmptyLegs } from './model';
import { djfCard, pct } from './money';

/**
 * The share of finished moves that drove home with nothing on the trailer.
 *
 * A donut here rather than another bar because this is one number with a
 * remainder, and the remainder is the good news: the teal arc is every move
 * that found a return load. The three rows underneath break the same total
 * apart so the reader can see which slice is actually growing, and the strip
 * at the foot converts the percentage into the two figures a dispatcher can
 * act on — kilometres run empty, and what they cost.
 */

const RADIUS = 70;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export interface EmptyLegsCardProps {
  data: EmptyLegs;
  onOpenBackhaul?: () => void;
  className?: string;
}

export function EmptyLegsCard({ data, onOpenBackhaul, className }: EmptyLegsCardProps) {
  const arcs = [
    { key: 'matched', share: data.matchedShare, color: 'var(--primary)' },
    { key: 'empty', share: data.emptyShare, color: 'var(--accent-bold)' },
    { key: 'pending', share: data.pendingShare, color: 'var(--chart-other)' },
  ];

  let offset = 0;
  const segments = arcs.map((arc) => {
    const length = arc.share * CIRCUMFERENCE;
    const segment = { ...arc, length, offset };
    offset += length;
    return segment;
  });

  const rows = [
    {
      key: 'matched',
      label: 'Loaded both ways',
      share: data.matchedShare,
      color: 'var(--primary)',
      chip: 'bg-primary-subtle text-primary-subtle-foreground',
    },
    {
      key: 'empty',
      label: 'Empty to depot',
      share: data.emptyShare,
      color: 'var(--accent-bold)',
      chip: 'bg-accent-subtle text-accent-subtle-foreground',
      leak: true,
    },
    {
      key: 'pending',
      label: 'Still unmatched',
      share: data.pendingShare,
      color: 'var(--chart-other)',
      chip: 'bg-surface-sunken text-muted-foreground',
      leak: true,
    },
  ].filter((row) => row.share > 0);

  return (
    <ConsolePanel
      className={className}
      title="Empty Legs"
      subtitle="Return leg of every completed booking"
      action={
        <span className="type-body-xs inline-flex items-center gap-1.5 text-muted-foreground">
          <span className="size-1.5 rounded-full bg-destructive" aria-hidden />
          Red mark = lost revenue
        </span>
      }
    >
      <div className="flex justify-center pb-2 pt-1">
        <svg viewBox="0 0 200 200" className="h-[190px] w-[190px]" role="img" aria-label={`Empty return rate ${pct(data.emptyRate)}`}>
          <circle
            cx="100"
            cy="100"
            r={RADIUS}
            fill="none"
            stroke="var(--surface-sunken)"
            strokeWidth="26"
          />
          {segments.map((segment) => (
            <circle
              key={segment.key}
              cx="100"
              cy="100"
              r={RADIUS}
              fill="none"
              stroke={segment.color}
              strokeWidth="26"
              strokeDasharray={`${segment.length} ${CIRCUMFERENCE}`}
              strokeDashoffset={-segment.offset}
              transform="rotate(-90 100 100)"
            />
          ))}
          <text
            x="100"
            y="94"
            textAnchor="middle"
            className="fill-muted-foreground text-[11px] font-medium"
          >
            Empty return rate
          </text>
          <text
            x="100"
            y="122"
            textAnchor="middle"
            className="fill-foreground text-[27px] font-extrabold tabular-nums"
          >
            {pct(data.emptyRate)}
          </text>
        </svg>
      </div>

      <div className="flex flex-col gap-3.5">
        {rows.map((row) => (
          <div key={row.key} className="grid grid-cols-[minmax(0,9.25rem)_1fr_2.75rem] items-center gap-2.5">
            <span className="type-body-xs inline-flex min-w-0 items-center gap-2 text-foreground">
              <span
                className="size-[7px] shrink-0 rounded-full"
                style={{ background: row.color }}
                aria-hidden
              />
              <span className="truncate">{row.label}</span>
            </span>
            <div className="relative">
              <Meter value={row.share} color={row.color} height={6} />
              {row.leak ? (
                <span
                  aria-hidden
                  className="absolute top-0 h-1.5 w-[3px] bg-destructive"
                  style={{ left: `${Math.min(100, row.share * 100)}%` }}
                />
              ) : null}
            </div>
            <span
              className={cn(
                'rounded-md px-1.5 py-0.5 text-center text-[10.5px] font-bold tabular-nums',
                row.chip,
              )}
            >
              {pct(row.share)}
            </span>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onOpenBackhaul}
        className="mt-auto flex w-full cursor-pointer items-center justify-between gap-3 rounded-card-nested border border-border px-3.5 py-3 text-left transition-colors hover:bg-surface-sunken"
      >
        <span className="type-body-xs text-foreground">
          {formatKm(data.emptyKm)} run empty · est. {djfCard(data.emptyCostUsd)} lost
        </span>
        <ArrowUpRight className="size-4 shrink-0 text-primary" aria-hidden />
      </button>
    </ConsolePanel>
  );
}

export default EmptyLegsCard;
