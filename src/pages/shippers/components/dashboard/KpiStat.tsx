import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight } from '@/design-system/icons';
import { cn } from '@/utils';
import { IconChip } from '@/design-system';

/**
 * A headline figure, stated inline rather than boxed.
 *
 * The shipper's landing page leads with six numbers, and six bordered cards
 * would spend the whole first screen on chrome before a single chart. So these
 * sit directly on the canvas: a round icon chip, the figure with its change
 * beside it, and the name underneath — the smallest arrangement that still
 * reads as one unit at a glance.
 *
 * The change is coloured by *meaning*, not direction: cost rising and on-time
 * rate rising are both "up", and colouring them alike is how a dashboard ends up
 * painting a demurrage spike green.
 */

export type KpiTone = 'good' | 'bad' | 'neutral';

export interface KpiStatProps {
  icon: ReactNode;
  label: string;
  value: string;
  /** Split off the figure so a currency code never reads as magnitude. */
  unit?: string;
  /** Already formatted and signed, e.g. "+1.92%". */
  delta?: string;
  deltaTone?: KpiTone;
  /** Which way the figure actually moved — the arrow follows this, not the tone. */
  deltaDirection?: 'up' | 'down';
  onClick?: () => void;
}

export function KpiStat({
  icon,
  label,
  value,
  unit,
  delta,
  deltaTone = 'neutral',
  deltaDirection = 'up',
  onClick,
}: KpiStatProps) {
  const DeltaIcon = deltaDirection === 'down' ? ArrowDownRight : ArrowUpRight;

  const body = (
    <>
      <IconChip>{icon}</IconChip>

      <span className="min-w-0">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[1.75rem] font-semibold leading-none tracking-tight text-foreground">
            {value}
            {unit ? (
              <span className="ml-1 align-baseline text-sm font-medium text-muted-foreground">
                {unit}
              </span>
            ) : null}
          </span>

          {delta ? (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 text-[13px] font-semibold leading-none',
                deltaTone === 'good' && 'text-success',
                deltaTone === 'bad' && 'text-destructive',
                deltaTone === 'neutral' && 'text-muted-foreground',
              )}
            >
              {delta}
              <DeltaIcon className="size-3.5" />
            </span>
          ) : null}
        </span>

        <span className="mt-1.5 block truncate text-[13px] text-muted-foreground">{label}</span>
      </span>
    </>
  );

  const shell = 'flex items-center gap-3.5 text-left';

  if (!onClick) {
    return <div className={shell}>{body}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label}: ${value}${unit ? ` ${unit}` : ''}. Open details.`}
      className={cn(
        shell,
        'rounded-card p-1 -m-1 transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
      )}
    >
      {body}
    </button>
  );
}
