import { ConsolePanel, Meter, PanelLink, SectionLabel, StatBox } from './kit';
import type { PaymentsSummary } from './model';
import { djfCard, djfPlain } from './money';

/**
 * What has been paid, what is waiting, and what is late.
 *
 * The three boxes are a stock, not a flow — they answer "where is my money
 * right now", which is why they ignore the page timeframe. The aging rows
 * below them are the part worth acting on: money in the top band is simply not
 * due yet, and every band under it is a phone call whose urgency the bar
 * length already states.
 */

export interface PaymentsCardProps {
  data: PaymentsSummary;
  onReconcile?: () => void;
  className?: string;
}

export function PaymentsCard({ data, onReconcile, className }: PaymentsCardProps) {
  const settlementLabel = data.nextSettlement
    ? new Date(`${data.nextSettlement.date}T00:00:00.000Z`).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
      })
    : undefined;

  return (
    <ConsolePanel
      className={className}
      title="Payments"
      subtitle={
        settlementLabel
          ? `Next settlement ${settlementLabel} · ${djfCard(data.nextSettlement?.amount ?? 0)}`
          : 'No settlement run scheduled · DJF'
      }
      action={onReconcile ? <PanelLink onClick={onReconcile}>Reconcile</PanelLink> : undefined}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatBox label="Paid" value={djfCard(data.paid)} />
        <StatBox
          label="Pending"
          value={<span className="text-primary">{djfCard(data.pending)}</span>}
        />
        <StatBox label="Overdue" value={djfCard(data.overdue)} tone="attention" />
      </div>

      <SectionLabel className="mt-6">Aging of outstanding</SectionLabel>

      <div className="mt-3.5 flex flex-col gap-3">
        {data.aging.map((band) => (
          <div
            key={band.key}
            className="grid grid-cols-[minmax(0,4.5rem)_1fr_auto] items-center gap-3"
          >
            <span className="type-body-xs truncate text-muted-foreground">
              {band.label}
            </span>
            <Meter value={band.share} color={band.color} height={7} />
            <span className="type-body-xs shrink-0 font-bold tabular-nums text-foreground">
              {djfPlain(band.amount)}
            </span>
          </div>
        ))}
      </div>

      <p className="type-body-xs mt-auto pt-4 text-muted-foreground">
        Amounts in DJF. Overdue is anything past its invoice due date, whichever settlement run it
        was meant to clear in.
      </p>
    </ConsolePanel>
  );
}

export default PaymentsCard;
