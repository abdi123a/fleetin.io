import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import { ROUTES } from '@/config/routes';
import { IconChip, type IconChipTint } from '@/design-system';
import { AlertTriangle, Banknote, ContainerIcon, Percent, Truck, Users } from '@/design-system/icons';
import { compactDjf, pct } from '@/lib/finance';
import { cn } from '@/utils';

import type { AdminConsoleModel } from '../model';

/**
 * The six figures the console opens with, wearing the same tile fills the
 * shipper, transporter and Empty Returns strips share.
 *
 * The rules are the sibling strips' rules, unchanged: a label in caps, one
 * figure, and a line of arithmetic underneath showing where the figure came
 * from — never a bare number nobody can trace. Every tile is a door onto the
 * module that owns it.
 *
 * The one departure is the last tile, which follows the Empty Returns
 * precedent: red is reserved for a rule that is already broken, so the breach
 * tile only wears it while something actually is breached, and drops to a
 * plain card the moment the count reaches zero.
 */

type TileTone = 'teal' | 'sky' | 'peach' | 'pink' | 'amber' | 'alarm' | 'quiet';

const TILE: Record<
  TileTone,
  { card: string; label: string; value: string; description: string; icon: IconChipTint }
> = {
  teal: {
    card: 'border-transparent bg-tile-teal shadow-sm hover:shadow-card',
    label: 'text-tile-teal-foreground/85',
    value: 'text-tile-teal-foreground',
    description: 'text-tile-teal-foreground/75',
    icon: 'on-teal',
  },
  sky: {
    card: 'border-transparent bg-tile-sky shadow-sm hover:shadow-card',
    label: 'text-tile-foreground/80',
    value: 'text-tile-foreground',
    description: 'text-tile-foreground/70',
    icon: 'on-light',
  },
  peach: {
    card: 'border-transparent bg-tile-peach shadow-sm hover:shadow-card',
    label: 'text-tile-foreground/80',
    value: 'text-tile-foreground',
    description: 'text-tile-foreground/70',
    icon: 'on-light',
  },
  pink: {
    card: 'border-transparent bg-tile-pink shadow-sm hover:shadow-card',
    label: 'text-tile-foreground/80',
    value: 'text-tile-foreground',
    description: 'text-tile-foreground/70',
    icon: 'on-light',
  },
  amber: {
    card: 'border-transparent bg-accent-bold shadow-sm hover:shadow-card',
    label: 'text-accent-bold-foreground/80',
    value: 'text-accent-bold-foreground',
    description: 'text-accent-bold-foreground/75',
    icon: 'on-light',
  },
  alarm: {
    card: 'border-transparent bg-destructive shadow-sm hover:shadow-card',
    label: 'text-destructive-foreground/85',
    value: 'text-destructive-foreground',
    description: 'text-destructive-foreground/75',
    icon: 'on-light',
  },
  quiet: {
    card: 'border-border bg-card shadow-sm hover:shadow-card',
    label: 'text-muted-foreground',
    value: 'text-foreground',
    description: 'text-muted-foreground',
    icon: 'neutral',
  },
};

interface Tile {
  key: string;
  title: string;
  icon: ReactNode;
  tone: TileTone;
  value: string;
  description: string;
  to: string;
}

export function AdminKpiTiles({ model, className }: { model: AdminConsoleModel; className?: string }) {
  const navigate = useNavigate();
  const { operations, returns, money, workforce } = model;

  const breaches = model.attention
    .filter((item) => item.severity === 'breach')
    .reduce((sum, item) => sum + item.count, 0);

  const tiles: Tile[] = [
    {
      key: 'shipments',
      title: 'SHIPMENTS RUNNING',
      icon: <Truck className="size-3.5" aria-hidden />,
      tone: 'teal',
      value: String(operations.live),
      description: `${operations.containers} containers under them, of ${operations.total} on the book`,
      to: ROUTES.shipmentsList,
    },
    {
      key: 'containers',
      title: 'EMPTIES STILL OUT',
      icon: <ContainerIcon className="size-3.5" aria-hidden />,
      tone: 'sky',
      value: String(returns.stillOut),
      description:
        returns.onTimeRate !== null
          ? `${pct(returns.onTimeRate)} of returned boxes made their deadline`
          : 'no box has come back yet',
      to: ROUTES.emptyReturnsCycles,
    },
    {
      key: 'commission',
      title: 'COMMISSION EARNED',
      icon: <Percent className="size-3.5" aria-hidden />,
      tone: 'peach',
      value: money.grossDjf !== null ? compactDjf(money.grossDjf) : '—',
      description:
        money.marginPct !== null
          ? `${pct(money.marginPct, 1)} kept of ${compactDjf(money.revenueDjf)} billed`
          : 'nothing priced yet — no commission to report',
      to: ROUTES.finance,
    },
    {
      key: 'payable',
      title: 'OWED TO TRANSPORTERS',
      icon: <Banknote className="size-3.5" aria-hidden />,
      tone: 'pink',
      value: compactDjf(money.payableDjf),
      description: `${compactDjf(money.pipelineDjf)} more still locked behind proof of delivery`,
      to: ROUTES.finance,
    },
    {
      key: 'people',
      title: 'PEOPLE ON PAYROLL',
      icon: <Users className="size-3.5" aria-hidden />,
      tone: 'amber',
      value: workforce ? String(workforce.headcount) : '—',
      description: workforce
        ? `${workforce.active} active across ${workforce.byDepartment.length} departments`
        : 'payroll module returned nothing',
      to: ROUTES.hrEmployees,
    },
    {
      key: 'breaches',
      title: 'RULES ALREADY BROKEN',
      icon: <AlertTriangle className="size-3.5" aria-hidden />,
      tone: breaches > 0 ? 'alarm' : 'quiet',
      value: String(breaches),
      description:
        breaches > 0
          ? 'passed deadlines, expired papers and overdue money'
          : 'no deadline passed and no paper expired',
      to: ROUTES.shipmentsList,
    },
  ];

  return (
    <div className={cn('grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6', className)}>
      {tiles.map((tile) => {
        const tone = TILE[tile.tone];
        return (
          <button
            key={tile.key}
            type="button"
            onClick={() => navigate(tile.to)}
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
              {tile.value}
            </span>

            <span className={cn('mt-2 line-clamp-2 text-[11px] font-medium leading-snug', tone.description)}>
              {tile.description}
            </span>
          </button>
        );
      })}
    </div>
  );
}
