import type { ReactNode } from 'react';
import { AlertTriangle, Package, Repeat, RotateCcw, Zap } from '@/design-system/icons';
import { IconChip, type IconChipTint } from '@/design-system';
import type { EmptyReturnFilters, EmptyReturnKpis } from '@/types/emptyReturn';
import { cn } from '@/utils';

/**
 * The five numbers the module opens with, wearing the console tile fills the
 * shipper and transporter strips share — teal, sky, peach, amber — and the
 * same rule about what a tile says: a label, one figure, and a line of
 * arithmetic underneath showing where the figure came from.
 *
 * Two departures from the sibling strips, both this module's own. Every tile
 * is a door: it is a real `<button>` that opens the Cycles list with the
 * matching filter already applied, which is the behaviour the old dashboard
 * trained and the reason the row exists. And the fifth tile changes colour
 * with its count — red is reserved for a clock that has already run out, so
 * the Overdue tile is only allowed to wear it while something actually is.
 */

type TileTone = 'teal' | 'sky' | 'peach' | 'amber' | 'alarm' | 'quiet';

const TILE: Record<
  TileTone,
  {
    card: string;
    label: string;
    value: string;
    description: string;
    /** The one solid disc used app-wide; white on a filled tile. */
    icon: IconChipTint;
  }
> = {
  teal: {
    card: 'border-transparent bg-tile-teal text-tile-teal-foreground shadow-sm hover:shadow-card',
    label: 'text-tile-teal-foreground/85',
    value: 'text-tile-teal-foreground',
    description: 'text-tile-teal-foreground/75',
    icon: 'on-teal',
  },
  sky: {
    card: 'border-transparent bg-tile-sky text-tile-foreground shadow-sm hover:shadow-card',
    label: 'text-tile-foreground/80',
    value: 'text-tile-foreground',
    description: 'text-tile-foreground/70',
    icon: 'on-light',
  },
  peach: {
    card: 'border-transparent bg-tile-peach text-tile-foreground shadow-sm hover:shadow-card',
    label: 'text-tile-foreground/80',
    value: 'text-tile-foreground',
    description: 'text-tile-foreground/70',
    icon: 'on-light',
  },
  amber: {
    card: 'border-transparent bg-accent-bold text-accent-bold-foreground shadow-sm hover:shadow-card',
    label: 'text-accent-bold-foreground/80',
    value: 'text-accent-bold-foreground',
    description: 'text-accent-bold-foreground/75',
    icon: 'on-light',
  },
  /** Overdue with a live count — the one red surface the console permits. */
  alarm: {
    card: 'border-transparent bg-destructive text-destructive-foreground shadow-sm hover:shadow-card',
    label: 'text-destructive-foreground/85',
    value: 'text-destructive-foreground',
    description: 'text-destructive-foreground/75',
    icon: 'on-light',
  },
  /** Overdue at zero — good news wears no colour at all. */
  quiet: {
    card: 'border-border bg-card text-foreground shadow-sm hover:shadow-card',
    label: 'text-muted-foreground',
    value: 'text-foreground',
    description: 'text-muted-foreground',
    icon: 'neutral',
  },
};

interface TileSpec {
  key: keyof EmptyReturnKpis;
  title: string;
  icon: ReactNode;
  tone: (value: number) => TileTone;
  description: (value: number) => string;
  preset: EmptyReturnFilters;
}

export interface ReturnKpiTilesProps {
  kpis: EmptyReturnKpis;
  /** How the assigned figure splits — the tile prints the receipt. */
  assignedSplit: { ready: number; inProgress: number };
  /** Containers not yet back at the depot — the Empty Ready tile's denominator. */
  stillOut: number;
  onSelect: (preset: EmptyReturnFilters) => void;
  className?: string;
}

export function ReturnKpiTiles({
  kpis,
  assignedSplit,
  stillOut,
  onSelect,
  className,
}: ReturnKpiTilesProps) {
  const tiles: TileSpec[] = [
    {
      key: 'emptyReady',
      title: 'Empty Ready',
      icon: <Package className="size-3.5" aria-hidden />,
      tone: () => 'teal',
      description: () => `of ${stillOut} containers still out`,
      preset: { q: '', status: 'empty_ready', risk: 'all' },
    },
    {
      key: 'assigned',
      title: 'Assigned Cycles',
      icon: <Repeat className="size-3.5" aria-hidden />,
      tone: () => 'sky',
      description: () => `${assignedSplit.ready} ready + ${assignedSplit.inProgress} in progress`,
      preset: { q: '', status: 'assigned', risk: 'all' },
    },
    {
      key: 'standalone',
      title: 'Standalone Returns',
      icon: <RotateCcw className="size-3.5" aria-hidden />,
      tone: () => 'peach',
      description: () => 'returning without a full load',
      preset: { q: 'Standalone', status: 'all', risk: 'all' },
    },
    {
      key: 'critical',
      title: 'Critical Window',
      icon: <AlertTriangle className="size-3.5" aria-hidden />,
      tone: () => 'amber',
      description: () => 'slack under 6 h',
      preset: { q: '', status: 'all', risk: 'crit' },
    },
    {
      key: 'overdue',
      title: 'Overdue',
      icon: <Zap className="size-3.5" aria-hidden />,
      tone: (value) => (value > 0 ? 'alarm' : 'quiet'),
      description: (value) =>
        value > 0 ? 'deadline passed, container still out' : 'all containers inside deadline',
      preset: { q: '', status: 'all', risk: 'overdue' },
    },
  ];

  return (
    <div className={cn('grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5', className)}>
      {tiles.map((tile) => {
        const value = kpis[tile.key];
        const tone = TILE[tile.tone(value)];
        return (
          <button
            key={tile.key}
            type="button"
            onClick={() => onSelect(tile.preset)}
            className={cn(
              'group relative flex cursor-pointer flex-col overflow-hidden rounded-card border p-4 text-left transition duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
              tone.card,
            )}
          >
            <span className="flex items-start justify-between gap-2">
              <span
                className={cn(
                  'min-w-0 line-clamp-2 text-[10px] font-extrabold uppercase leading-tight tracking-[0.09em]',
                  tone.label,
                )}
              >
                {tile.title}
              </span>
              <IconChip
                tint={tone.icon}
                size={36}
                className="transition-transform duration-200 group-hover:scale-110"
              >
                {tile.icon}
              </IconChip>
            </span>

            <span
              className={cn(
                'mt-4 min-w-0 truncate text-2xl font-extrabold tracking-tight tabular-nums',
                tone.value,
              )}
            >
              {value}
            </span>

            <span className={cn('mt-2 truncate text-[11px] font-medium', tone.description)}>
              {tile.description(value)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default ReturnKpiTiles;
