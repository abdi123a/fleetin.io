import { compactDjf, fmtDjf, pct } from '@/lib/finance';
import { cn } from '@/utils';

import type { MoneyPosition } from '../model';
import { Bar, HeldChip, MoneyAmount, Pill } from './kit';

/**
 * Every franc attached to a project or a shipment, laid out in the three
 * questions an operator actually asks.
 *
 * They are kept apart on purpose. Netting "the client owes us 4M and we owe
 * transporters 3M" into a single balance hides which of the two is late, and a
 * held payout folded into payables would read as money we are about to send.
 */
export function MoneyBreakdown({
  money,
  className,
}: {
  money: MoneyPosition;
  className?: string;
}) {
  const collectedShare =
    money.revenueDjf > 0 ? money.collectedDjf / money.revenueDjf : 0;
  const paidShare = money.costDjf > 0 ? money.paidOutDjf / money.costDjf : 0;

  return (
    <div className={cn('grid gap-4 lg:grid-cols-3', className)}>
      {/* ── Money in ─────────────────────────────────────────────────────── */}
      <section className="rounded-card border border-border bg-card p-5 shadow-card">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-extrabold text-foreground">Money in</h3>
          <Pill tone="teal">Client</Pill>
        </div>
        <p className="mt-3 font-mono text-[26px] font-extrabold leading-none tabular-nums text-foreground">
          {compactDjf(money.revenueDjf)}
        </p>
        <p className="mt-1.5 text-xs font-semibold text-muted-foreground">Billed to the client</p>

        <div className="mt-4">
          <Bar value={collectedShare} tone="teal" />
          <p className="mt-1.5 text-xs font-bold text-muted-foreground">
            {pct(collectedShare)} collected
          </p>
        </div>

        <dl className="mt-4 flex flex-col gap-2.5 border-t border-border-subtle pt-3.5">
          <Line label="Collected" value={money.collectedDjf} direction="in" />
          <Line label="Still outstanding" value={money.outstandingDjf} direction="neutral" />
          <Line
            label="Past due"
            value={money.overdueDjf}
            direction="neutral"
            tone={money.overdueDjf > 0 ? 'alarm' : undefined}
          />
        </dl>
      </section>

      {/* ── Money out ────────────────────────────────────────────────────── */}
      <section className="rounded-card border border-border bg-card p-5 shadow-card">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-extrabold text-foreground">Money out</h3>
          <Pill tone="orange">Transporters</Pill>
        </div>
        <p className="mt-3 font-mono text-[26px] font-extrabold leading-none tabular-nums text-foreground">
          {compactDjf(money.costDjf)}
        </p>
        <p className="mt-1.5 text-xs font-semibold text-muted-foreground">
          Transport, handling and every other cost
        </p>

        <div className="mt-4">
          <Bar value={paidShare} tone="orange" />
          <p className="mt-1.5 text-xs font-bold text-muted-foreground">{pct(paidShare)} paid out</p>
        </div>

        <dl className="mt-4 flex flex-col gap-2.5 border-t border-border-subtle pt-3.5">
          <Line label="Paid" value={money.paidOutDjf} direction="out" />
          <Line label="Payable now" value={money.payableDjf} direction="neutral" />
          <Line
            label="Frozen on hold"
            value={money.frozenDjf}
            direction="held"
            badge={money.frozenDjf > 0 ? <HeldChip /> : undefined}
          />
          <Line label="Before release" value={money.pipelineDjf} direction="neutral" />
        </dl>
      </section>

      {/* ── What is left ─────────────────────────────────────────────────── */}
      <section
        className={cn(
          'rounded-card border p-5 shadow-card',
          (money.grossDjf ?? 0) < 0 ? 'border-destructive/40 bg-destructive-subtle' : 'border-border bg-card',
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-extrabold text-foreground">What is left</h3>
          {money.marginPct !== null ? (
            <Pill tone={money.marginPct < 0 ? 'red' : 'teal'}>{pct(money.marginPct, 1)}</Pill>
          ) : (
            <Pill tone="orange">No price</Pill>
          )}
        </div>
        {money.grossDjf !== null ? (
          <p
            className={cn(
              'mt-3 font-mono text-[26px] font-extrabold leading-none tabular-nums',
              money.grossDjf < 0 ? 'text-destructive-subtle-foreground' : 'text-foreground',
            )}
          >
            {money.grossDjf < 0 ? '−' : ''}
            {compactDjf(Math.abs(money.grossDjf))}
          </p>
        ) : (
          <p className="mt-3 text-lg font-extrabold text-muted-foreground">Unknowable</p>
        )}
        <p className="mt-1.5 text-xs font-semibold text-muted-foreground">
          Gross margin on priced shipments
        </p>

        {money.unpricedCount > 0 ? (
          <div className="mt-4 rounded-card-nested border border-accent/40 bg-accent-subtle px-3.5 py-3">
            <p className="text-xs font-extrabold text-accent-subtle-foreground">
              {money.unpricedCount} shipment{money.unpricedCount === 1 ? '' : 's'} unpriced
            </p>
            <p className="mt-1 text-xs font-semibold text-accent-subtle-foreground">
              {fmtDjf(money.unpricedCostDjf)} of cost committed against no agreed price. The margin
              above excludes them — it is not a zero.
            </p>
          </div>
        ) : (
          <div className="mt-4 rounded-card-nested bg-surface-sunken px-3.5 py-3">
            <p className="text-xs font-semibold text-muted-foreground">
              Every shipment carries a real client rate.
            </p>
          </div>
        )}

        <dl className="mt-4 flex flex-col gap-2.5 border-t border-border-subtle pt-3.5">
          <Line label="Still owed to us" value={money.outstandingDjf} direction="in" />
          <Line
            label="Still owed by us"
            value={money.payableDjf + money.frozenDjf + money.pipelineDjf}
            direction="out"
          />
        </dl>
      </section>
    </div>
  );
}

function Line({
  label,
  value,
  direction,
  tone,
  badge,
}: {
  label: string;
  value: number;
  direction: 'in' | 'out' | 'neutral' | 'held';
  tone?: 'alarm';
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        {label}
        {badge}
      </dt>
      <dd>
        <MoneyAmount
          value={value}
          direction={direction}
          unit={false}
          className={cn('text-sm', tone === 'alarm' && value > 0 && 'text-destructive-subtle-foreground')}
        />
      </dd>
    </div>
  );
}
