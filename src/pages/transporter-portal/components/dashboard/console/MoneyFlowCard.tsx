import { ConsolePanel, PanelOutlineLink } from './kit';
import { cn } from '@/utils';
import type { MoneyLeg } from './model';
import { compact, djfCard, pct, toDjf } from './money';

/**
 * One move's money, split once.
 *
 * This was a waterfall and nobody could read it: floating bars, connector
 * lines, and a deduction so small its bar disappeared. The question underneath
 * was always simpler than the chart — *of everything a move invoices, how much
 * do I keep?* — so it is now a single bar totalling 100% of the invoice, with
 * the kept share first and each cost taking its slice, and a plain list under
 * it giving the same four numbers in francs.
 *
 * Teal is what you keep, amber is what is taken, strongest for the biggest
 * leak. Nothing floats and nothing has to be traced across the panel.
 */

/** Amber, strongest first — the leaks in the order they cost you. */
const COST_COLORS = ['var(--accent-bold)', 'var(--fl-orange-300)', 'var(--fl-orange-200)'];
const KEEP_COLOR = 'var(--fl-teal-700)';

export interface MoneyFlowCardProps {
  legs: MoneyLeg[];
  onOpenCosts?: () => void;
  className?: string;
}

export function MoneyFlowCard({ legs, onOpenCosts, className }: MoneyFlowCardProps) {
  /** Everything a move invoices: the tariff plus any backhaul on the return. */
  const invoiced = legs
    .filter((leg) => leg.kind === 'gain')
    .reduce((total, leg) => total + leg.value, 0);

  const kept = legs.find((leg) => leg.kind === 'total')?.value ?? 0;

  const costs = legs
    .filter((leg) => leg.kind === 'cost')
    .map((leg, index) => ({
      key: leg.key,
      label: leg.label,
      amount: Math.abs(leg.value),
      color: COST_COLORS[index] ?? COST_COLORS[COST_COLORS.length - 1] ?? 'var(--accent-bold)',
    }))
    .sort((a, b) => b.amount - a.amount)
    // Re-colour after sorting so the strongest amber always lands on the
    // biggest leak, whatever order the model happened to list them in.
    .map((cost, index) => ({
      ...cost,
      color: COST_COLORS[index] ?? COST_COLORS[COST_COLORS.length - 1] ?? 'var(--accent-bold)',
    }));

  const rows = [
    { key: 'keep', label: 'You keep', amount: kept, color: KEEP_COLOR, isKeep: true },
    ...costs.map((cost) => ({ ...cost, isKeep: false })),
  ];

  const share = (amount: number) => (invoiced > 0 ? amount / invoiced : 0);
  const biggest = costs[0];

  /** A cost under one percent still deserves a digit — "0%" reads as nothing. */
  const shareLabel = (amount: number) => {
    const value = share(amount);
    return pct(value, value > 0 && value < 0.01 ? 1 : 0);
  };

  return (
    <ConsolePanel
      className={className}
      title="Money Per Booking"
      subtitle={`Average per booking · ${djfCard(invoiced)} invoiced, ${djfCard(kept)} kept`}
      action={
        <span className="type-body-xs rounded-md bg-surface-sunken px-3 py-1.5 text-foreground">
          DJF per booking
        </span>
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="type-body-xs text-muted-foreground">
            <span className="font-bold text-foreground">
              {pct(share(kept))} kept per booking
            </span>
            {biggest ? (
              <>
                . Largest cost: {biggest.label}, {djfCard(biggest.amount)}.
              </>
            ) : (
              '.'
            )}
          </p>
          {onOpenCosts ? (
            <PanelOutlineLink onClick={onOpenCosts}>Cost detail →</PanelOutlineLink>
          ) : null}
        </div>
      }
    >
      {/* The headline: what a move is worth once the day is paid for. */}
      <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
        <span className="text-3xl font-extrabold tracking-tight tabular-nums text-foreground">
          {compact(toDjf(kept))}
        </span>
        <span className="type-body-xs pb-1 text-muted-foreground">
          DJF kept per booking · {pct(share(kept))} of invoiced
        </span>
      </div>

      {/* One bar, 100% of the invoice. Kept first, then each cost. */}
      <div className="mt-4 flex h-11 gap-[3px] overflow-hidden rounded-md" role="img"
        aria-label={`Of every booking invoiced, ${pct(share(kept))} kept and the rest taken by ${costs.map((c) => c.label).join(', ')}`}
      >
        {rows.map((row) => (
          <div
            key={row.key}
            className="flex min-w-0 items-center justify-center px-1"
            style={{
              flex: `${Math.max(share(row.amount), 0.02)} 1 0%`,
              background: row.color,
              color: row.isKeep ? 'var(--fl-neutral-0)' : 'var(--accent-bold-foreground)',
            }}
            title={`${row.label} — ${djfCard(row.amount)} (${shareLabel(row.amount)})`}
          >
            {/* A sliver cannot hold a label; the row beneath carries its figure. */}
            {share(row.amount) >= 0.05 ? (
              <span className="truncate text-xs font-extrabold tabular-nums">
                {shareLabel(row.amount)}
              </span>
            ) : null}
          </div>
        ))}
      </div>

      {/* The same four numbers, in francs, for anyone who wants the figure. */}
      <ul className="mt-5 flex flex-col divide-y divide-border-subtle">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center justify-between gap-3 py-2.5">
            <span className="type-body-sm inline-flex min-w-0 items-center gap-2.5 text-foreground">
              <span
                className="size-2.5 shrink-0 rounded-[3px]"
                style={{ background: row.color }}
                aria-hidden
              />
              <span className="truncate">{row.label}</span>
              {row.isKeep ? null : (
                <span className="type-body-xs shrink-0 font-medium text-muted-foreground">
                  taken
                </span>
              )}
            </span>
            <span className="shrink-0 tabular-nums">
              <span
                className={cn(
                  'type-body-sm',
                  row.isKeep ? 'text-foreground' : 'text-accent-subtle-foreground',
                )}
              >
                {row.isKeep ? '' : '−'}
                {djfCard(row.amount)}
              </span>
              <span className="type-body-xs ml-2 text-muted-foreground">
                {shareLabel(row.amount)}
              </span>
            </span>
          </li>
        ))}
      </ul>

    </ConsolePanel>
  );
}

export default MoneyFlowCard;
