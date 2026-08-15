import { Coins, Landmark, Scale, Truck } from '@/design-system/icons';
import { compactDjf, fmtDjf, pct } from '@/lib/finance';
import { cn } from '@/utils';

import type { MoneyPosition } from '../shipmentFinance';
import { Bar, HeldChip, IconChip, MoneyAmount, Pill } from './kit';

/**
 * Every franc attached to a client, project or shipment, laid out in the
 * three questions an operator actually asks: has the client paid us back,
 * how much of our own money is still out with transporters, and what does
 * Fleetin keep once both sides settle.
 *
 * They are kept apart on purpose. Netting "the client owes us 4M and we owe
 * transporters 3M" into a single balance hides which of the two is late, and a
 * held payout folded into payables would read as money we are about to send.
 * The header badge on each card is a live read of that card's own state
 * rather than a static label — "On time" or "3 held" earns its place; a tag
 * that just repeats the title does not.
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
  const owedByUs = money.payableDjf + money.frozenDjf + money.pipelineDjf;

  return (
    <div className={cn('grid gap-3 lg:grid-cols-3', className)}>
      {/* ── Recovery from the client ────────────────────────────────────── */}
      <section className="rounded-card border border-border bg-card p-4 shadow-card">
        <div className="flex items-center gap-2.5">
          <IconChip icon={Coins} tint="teal" size={36} />
          <h3 className="min-w-0 flex-1 text-sm font-extrabold leading-tight text-foreground">
            Recovery from client
          </h3>
          {money.overdueDjf > 0 ? (
            <Pill tone="red">{compactDjf(money.overdueDjf)} overdue</Pill>
          ) : (
            <Pill tone="teal">On time</Pill>
          )}
        </div>
        <p className="mt-3 font-mono text-2xl font-extrabold leading-none tabular-nums text-foreground">
          {compactDjf(money.revenueDjf)}
        </p>
        <p className="mt-1.5 text-xs font-semibold text-muted-foreground">Total billed to the client</p>

        <div className="mt-3">
          <Bar value={collectedShare} tone="teal" />
          <p className="mt-1.5 text-xs font-bold text-muted-foreground">
            {pct(collectedShare)} recovered so far
          </p>
        </div>

        <dl className="mt-3 flex flex-col gap-2 border-t border-border-subtle pt-3">
          <Line label="Recovered" value={money.collectedDjf} direction="in" />
          <Line label="Still to recover" value={money.outstandingDjf} direction="neutral" />
          <Line
            label="Overdue"
            value={money.overdueDjf}
            direction="neutral"
            tone={money.overdueDjf > 0 ? 'alarm' : undefined}
            zeroLabel="On time"
          />
        </dl>
      </section>

      {/* ── Paid out to transporters ─────────────────────────────────────── */}
      <section className="rounded-card border border-border bg-card p-4 shadow-card">
        <div className="flex items-center gap-2.5">
          <IconChip icon={Truck} tint="orange" size={36} />
          <h3 className="min-w-0 flex-1 text-sm font-extrabold leading-tight text-foreground">
            Paid to transporters
          </h3>
          {money.frozenDjf > 0 ? <HeldChip label={`${compactDjf(money.frozenDjf)} held`} /> : null}
        </div>
        <p className="mt-3 font-mono text-2xl font-extrabold leading-none tabular-nums text-foreground">
          {compactDjf(money.costDjf)}
        </p>
        <p className="mt-1.5 text-xs font-semibold text-muted-foreground">
          Transport, handling and every other cost
        </p>

        <div className="mt-3">
          <Bar value={paidShare} tone="orange" />
          <p className="mt-1.5 text-xs font-bold text-muted-foreground">{pct(paidShare)} paid out</p>
        </div>

        <dl className="mt-3 flex flex-col gap-2 border-t border-border-subtle pt-3">
          <Line label="Paid" value={money.paidOutDjf} direction="out" />
          <Line label="Payable now" value={money.payableDjf} direction="neutral" />
          <Line
            label="Frozen on hold"
            value={money.frozenDjf}
            direction="held"
            zeroLabel="Nothing held"
          />
          <Line label="Awaiting release" value={money.pipelineDjf} direction="neutral" />
        </dl>
      </section>

      {/* ── What Fleetin keeps ───────────────────────────────────────────── */}
      <section
        className={cn(
          'rounded-card border p-4 shadow-card',
          (money.grossDjf ?? 0) < 0 ? 'border-destructive/40 bg-destructive-subtle' : 'border-border bg-card',
        )}
      >
        <div className="flex items-center gap-2.5">
          <IconChip
            icon={Scale}
            tint={money.marginPct !== null && money.marginPct < 0 ? 'red' : 'neutral'}
            size={36}
          />
          <h3 className="min-w-0 flex-1 text-sm font-extrabold leading-tight text-foreground">
            Net margin
          </h3>
          {money.marginPct !== null ? (
            <Pill tone={money.marginPct < 0 ? 'red' : 'teal'}>{pct(money.marginPct, 1)}</Pill>
          ) : (
            <Pill tone="orange">No price</Pill>
          )}
        </div>
        {money.grossDjf !== null ? (
          <p
            className={cn(
              'mt-3 font-mono text-2xl font-extrabold leading-none tabular-nums',
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
          What Fleetin keeps once transporters are paid
        </p>

        {money.unpricedCount > 0 ? (
          <div className="mt-3 rounded-card-nested border border-accent/40 bg-accent-subtle px-3 py-2.5">
            <p className="text-xs font-extrabold text-accent-subtle-foreground">
              {money.unpricedCount} shipment{money.unpricedCount === 1 ? '' : 's'} unpriced
            </p>
            <p className="mt-1 text-xs font-semibold text-accent-subtle-foreground">
              {fmtDjf(money.unpricedCostDjf)} of cost committed against no agreed price. The margin
              above excludes them — it is not a zero.
            </p>
          </div>
        ) : (
          <div className="mt-3 rounded-card-nested bg-surface-sunken px-3 py-2.5">
            <p className="text-xs font-semibold text-muted-foreground">
              Every shipment carries a real client rate.
            </p>
          </div>
        )}

        <dl className="mt-3 flex flex-col gap-2 border-t border-border-subtle pt-3">
          <Line label="Still to collect" value={money.outstandingDjf} direction="in" />
          <Line label="Still to pay out" value={owedByUs} direction="out" />
        </dl>
      </section>
    </div>
  );
}

/**
 * How much Fleetin has paid transporters, ahead of what this client has paid
 * back — money is pooled in one bank account, so a specific transporter
 * payment can never be traced to a specific drawdown or a specific client
 * payment. What CAN be shown honestly is this gap: paid out minus collected.
 * When it's positive, that gap was funded by something other than this
 * client's own money — Fleetin's cash, or a credit facility draw.
 */
export function FinancedExposureCard({ money, className }: { money: MoneyPosition; className?: string }) {
  const exposureDjf = money.paidOutDjf - money.collectedDjf;
  const isExposed = exposureDjf > 0;

  return (
    <section
      className={cn(
        'rounded-card border p-4 shadow-card',
        isExposed ? 'border-warning/40 bg-warning-subtle' : 'border-border bg-card',
        className,
      )}
    >
      <div className="flex items-center gap-2.5">
        <IconChip icon={Landmark} tint={isExposed ? 'orange' : 'neutral'} size={36} />
        <h3 className="min-w-0 flex-1 text-sm font-extrabold leading-tight text-foreground">
          Financed exposure
        </h3>
        <Pill tone={isExposed ? 'amber' : 'teal'}>{isExposed ? 'Fronted by Fleetin' : 'Covered'}</Pill>
      </div>
      <p className="mt-3 font-mono text-2xl font-extrabold leading-none tabular-nums text-foreground">
        {compactDjf(Math.abs(exposureDjf))}
      </p>
      <p className="mt-1.5 text-xs font-semibold leading-relaxed text-muted-foreground">
        {isExposed
          ? "Paid to transporters ahead of what this client has paid back. That gap is currently covered by Fleetin's own cash or a credit facility draw — not by this client's money."
          : "This client's payments have covered everything paid out to transporters so far. No advance financing outstanding."}
      </p>
    </section>
  );
}

function Line({
  label,
  value,
  direction,
  tone,
  badge,
  zeroLabel,
}: {
  label: string;
  value: number;
  direction: 'in' | 'out' | 'neutral' | 'held';
  tone?: 'alarm';
  badge?: React.ReactNode;
  /** Replaces a bare "0" with a human read — "On time", "Nothing held". */
  zeroLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        {label}
        {badge}
      </dt>
      <dd>
        {value === 0 && zeroLabel ? (
          <span className="text-sm font-bold text-muted-foreground">{zeroLabel}</span>
        ) : (
          <MoneyAmount
            value={value}
            direction={direction}
            unit={false}
            className={cn('text-sm', tone === 'alarm' && value > 0 && 'text-destructive-subtle-foreground')}
          />
        )}
      </dd>
    </div>
  );
}
