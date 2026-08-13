import { useMemo } from 'react';
import { CalendarDays, ClipboardList, Receipt, Wallet } from '@/design-system/icons';
import { Badge } from '@/design-system';
import {
  CategoryBarChart,
  ChartCard,
  X_AXIS_HEIGHT,
  type Intent,
} from '@/features/shipper-bi/charts';
import type { CategorySlice } from '@/features/shipper-bi/contracts';
import {
  AGING_BUCKETS,
  CompanyLabel,
  AGING_BUCKET_LABELS,
  PAYMENT_STATUSES,
  PAYMENT_STATUS_LABELS,
  SETTLEMENT_WEEKDAY,
  formatCompact,
  formatMoney,
  formatMoneyFull,
  type AgingBucket,
  type PaymentStatus,
  type TripFact,
} from '@/features/transporter-bi';
import { cn, formatDate } from '@/utils';
import type { TransporterSectionProps } from '../sectionContract';
import { TablePager, usePagedRows } from './cards/TablePager';

/** A trip fact narrowed to the ones that actually carry a payment record. */
type PaidTripFact = TripFact & { payment: NonNullable<TripFact['payment']> };

const BAR_ROW_HEIGHT = 34;
const STATUS_BODY = 240;

const STATUS_INTENT: Record<PaymentStatus, Intent> = {
  paid: 'good',
  pending: 'warning',
  overdue: 'critical',
};

const STATUS_SWATCH: Record<PaymentStatus, string> = {
  paid: 'bg-primary',
  pending: 'bg-warning',
  overdue: 'bg-destructive',
};

const AGING_INTENT: Partial<Record<AgingBucket, Intent>> = {
  current: 'good',
  b1_15: 'warning',
  b16_30: 'warning',
  b31_45: 'critical',
  b46_plus: 'critical',
};

/**
 * Payments — receivables aging, status mix, reconciliation, and unsettled invoices.
 *
 * Outstanding is a stock figure: it ignores the date window so the board
 * always shows what is still owed, not what was invoiced this period.
 */
export function PaymentsSection({
  dataset,
  facts,
  onOpenDetail,
}: TransporterSectionProps) {
  const paymentFacts = useMemo(
    () => facts.filter((fact) => fact.payment !== undefined),
    [facts],
  );

  const unpaid = useMemo(
    () =>
      paymentFacts
        .filter((fact) => (fact.payment?.outstanding ?? 0) > 0)
        .sort((a, b) => (b.payment?.agingDays ?? 0) - (a.payment?.agingDays ?? 0)),
    [paymentFacts],
  );

  const agingSlices = useMemo<CategorySlice[]>(() => {
    const totals: Record<AgingBucket, number> = {
      current: 0,
      b1_15: 0,
      b16_30: 0,
      b31_45: 0,
      b46_plus: 0,
    };
    for (const fact of unpaid) {
      const payment = fact.payment;
      if (!payment) continue;
      totals[payment.agingBucket] += payment.outstanding;
    }
    return AGING_BUCKETS.map((bucket) => ({
      key: bucket,
      label: AGING_BUCKET_LABELS[bucket],
      value: Math.round(totals[bucket]),
      intent: AGING_INTENT[bucket],
    })).filter((slice) => slice.value > 0);
  }, [unpaid]);

  const statusSlices = useMemo<CategorySlice[]>(() => {
    const totals: Record<PaymentStatus, number> = { paid: 0, pending: 0, overdue: 0 };
    for (const fact of paymentFacts) {
      const payment = fact.payment;
      if (!payment) continue;
      totals[payment.status] += payment.status === 'paid' ? payment.amount : payment.outstanding;
    }
    return PAYMENT_STATUSES.map((status) => ({
      key: status,
      label: PAYMENT_STATUS_LABELS[status],
      value: Math.round(totals[status]),
      intent: STATUS_INTENT[status],
    })).filter((slice) => slice.value > 0);
  }, [paymentFacts]);

  const reconciliationRows = useMemo(() => {
    const rows = paymentFacts
      .filter((fact): fact is PaidTripFact => {
        const payment = fact.payment;
        if (!payment) return false;
        if (payment.outstanding > 0) return true;
        // Recent paid: settled within the last ~45 days of the dataset clock.
        if (!payment.paidAt) return false;
        const asOf = new Date(dataset.generatedAt).getTime();
        const paidAt = new Date(payment.paidAt).getTime();
        return asOf - paidAt <= 45 * 86_400_000;
      })
      .map((fact) => {
        const { payment } = fact;
        const paid = payment.status === 'paid' ? payment.amount : 0;
        return {
          tripId: fact.tripId,
          ref: fact.ref,
          invoiceNo: payment.invoiceNo,
          tripAmount: fact.totalRevenue,
          invoiced: payment.amount,
          paid,
          outstanding: payment.outstanding,
          settlementDate: payment.expectedSettlementAt,
          status: payment.status,
        };
      })
      .sort((a, b) => {
        if (b.outstanding !== a.outstanding) return b.outstanding - a.outstanding;
        return b.settlementDate.localeCompare(a.settlementDate);
      });
    // No top-N cut: the table pages, so every invoice in scope is reachable
    // rather than the largest two dozen standing in for the rest.
    return rows;
  }, [paymentFacts, dataset.generatedAt]);

  const nextSettlement = useMemo(
    () => computeNextSettlement(unpaid, dataset.generatedAt),
    [unpaid, dataset.generatedAt],
  );

  const outstandingTotal = unpaid.reduce(
    (sum, fact) => sum + (fact.payment?.outstanding ?? 0),
    0,
  );
  const statusTotal = statusSlices.reduce((sum, slice) => sum + slice.value, 0);
  const agingHeight = Math.max(140, agingSlices.length * BAR_ROW_HEIGHT);

  const customerById = useMemo(
    () => new Map(dataset.customers.map((customer) => [customer.id, customer])),
    [dataset.customers],
  );

  // Both invoice tables run to hundreds of rows, so both page. The filter bar
  // above changes what is in them, which is what resets them to page one.
  const reconciliation = usePagedRows(reconciliationRows, {
    resetKey: reconciliationRows.length,
  });
  const openInvoices = usePagedRows(unpaid, { resetKey: unpaid.length });

  return (
    <div className="flex flex-col gap-5">
      {nextSettlement ? (
        <ChartCard
          title="Next settlement"
          subtitle="The nearest weekly run and what clears in it"
          icon={<CalendarDays className="size-4" />}
        >
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Settlement date
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                {formatDate(nextSettlement.date, 'date')}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Expected clear
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                {formatMoney(nextSettlement.amount)}
              </p>
            </div>
          </div>
        </ChartCard>
      ) : null}

      <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-2">
        <ChartCard
          title="Outstanding by aging"
          subtitle={`${formatMoneyFull(outstandingTotal)} still unpaid`}
          icon={<Wallet className="size-4" />}
          className="h-full"
          isEmpty={agingSlices.length === 0}
          emptyMessage="Nothing outstanding — every invoice is settled."
          bodyHeight={agingHeight + X_AXIS_HEIGHT}
          tableRows={agingSlices}
          tableColumns={[
            { key: 'label', header: 'Bucket', align: 'left', render: (row) => row.label },
            {
              key: 'value',
              header: 'Amount',
              render: (row) => formatMoneyFull(row.value),
            },
            {
              key: 'share',
              header: 'Share',
              render: (row) =>
                outstandingTotal === 0
                  ? '—'
                  : `${((row.value / outstandingTotal) * 100).toFixed(1)}%`,
            },
          ]}
        >
          <CategoryBarChart
            slices={agingSlices}
            formatValue={(value) => formatMoney(value)}
            valueLabel="Outstanding"
            height={agingHeight}
          />
        </ChartCard>

        <ChartCard
          title="Payment status"
          subtitle="Paid vs still collecting"
          icon={<Receipt className="size-4" />}
          className="h-full"
          isEmpty={statusSlices.length === 0}
          emptyMessage="No invoices in scope."
          bodyHeight={STATUS_BODY}
          tableRows={statusSlices}
          tableColumns={[
            { key: 'label', header: 'Status', align: 'left', render: (row) => row.label },
            {
              key: 'value',
              header: 'Amount',
              render: (row) => formatMoneyFull(row.value),
            },
            {
              key: 'share',
              header: 'Share',
              render: (row) =>
                statusTotal === 0
                  ? '—'
                  : `${((row.value / statusTotal) * 100).toFixed(1)}%`,
            },
          ]}
        >
          <div className="flex h-full flex-col justify-center gap-3.5 px-2 py-2">
            <div className="flex items-center justify-between border-b border-border-subtle/50 pb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <span>Status</span>
              <span>Amount (% Share)</span>
            </div>
            {statusSlices.map((slice) => {
              const share =
                statusTotal > 0
                  ? ((slice.value / statusTotal) * 100).toFixed(1)
                  : '0.0';
              const swatch =
                STATUS_SWATCH[slice.key as PaymentStatus] ?? 'bg-muted-foreground';
              return (
                <div key={slice.key} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                    <div className="flex items-center gap-2">
                      <span className={cn('size-2.5 rounded-full', swatch)} />
                      <span>{slice.label}</span>
                    </div>
                    <div className="flex items-center gap-2 tabular-nums">
                      <span className="font-bold text-foreground">
                        {formatMoney(slice.value)}
                      </span>
                      <span className="text-muted-foreground">({share}%)</span>
                    </div>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken">
                    <div
                      className={cn('h-full rounded-full transition-all', swatch)}
                      style={{ width: `${share}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </ChartCard>
      </div>

      <ChartCard
        title="Payment reconciliation"
        subtitle="Unpaid and recently settled trips — invoice vs cash"
        icon={<ClipboardList className="size-4" />}
        isEmpty={reconciliationRows.length === 0}
        emptyMessage="No invoices to reconcile."
        tableRows={reconciliationRows}
        tableColumns={[
          { key: 'ref', header: 'Trip', align: 'left', render: (row) => row.ref },
          {
            key: 'tripAmount',
            header: 'Trip amount',
            render: (row) => formatMoneyFull(row.tripAmount),
          },
          {
            key: 'invoiced',
            header: 'Invoiced',
            render: (row) => formatMoneyFull(row.invoiced),
          },
          {
            key: 'paid',
            header: 'Paid',
            render: (row) => formatMoneyFull(row.paid),
          },
          {
            key: 'outstanding',
            header: 'Outstanding',
            render: (row) => formatMoneyFull(row.outstanding),
          },
          {
            key: 'settlement',
            header: 'Settlement',
            align: 'left',
            render: (row) => formatDate(row.settlementDate, 'date'),
          },
        ]}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-4">Invoice</th>
                <th className="py-2 pr-4">Trip</th>
                <th className="py-2 pr-4 text-right">Trip amount</th>
                <th className="py-2 pr-4 text-right">Invoiced</th>
                <th className="py-2 pr-4 text-right">Paid</th>
                <th className="py-2 pr-4 text-right">Outstanding</th>
                <th className="py-2 text-right">Settlement</th>
              </tr>
            </thead>
            <tbody>
              {reconciliation.rows.map((row) => (
                <tr
                  key={row.tripId}
                  className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-surface-sunken"
                  onClick={() =>
                    onOpenDetail({ kind: 'trip', tripId: row.tripId, focus: 'payment' })
                  }
                >
                  <td className="py-2.5 pr-4 font-medium text-foreground">
                    {row.invoiceNo}
                  </td>
                  <td className="py-2.5 pr-4 text-muted-foreground">{row.ref}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums text-muted-foreground">
                    {formatMoneyFull(row.tripAmount)}
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums text-muted-foreground">
                    {formatMoneyFull(row.invoiced)}
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums text-foreground">
                    {formatMoneyFull(row.paid)}
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums text-foreground">
                    {formatMoneyFull(row.outstanding)}
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                    {formatDate(row.settlementDate, 'date')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <TablePager paged={reconciliation} noun="invoices" />
      </ChartCard>

      <ChartCard
        title="Unpaid & overdue invoices"
        subtitle={`${formatCompact(unpaid.length)} open invoices`}
        icon={<Wallet className="size-4" />}
        isEmpty={unpaid.length === 0}
        emptyMessage="No unpaid invoices."
        tableRows={unpaid}
        tableColumns={[
          {
            key: 'invoice',
            header: 'Invoice',
            align: 'left',
            render: (row) => row.payment?.invoiceNo ?? '—',
          },
          { key: 'ref', header: 'Trip', align: 'left', render: (row) => row.ref },
          {
            key: 'customer',
            header: 'Customer',
            align: 'left',
            render: (row) => (
              <CompanyLabel
                id={row.customerId}
                name={customerById.get(row.customerId)?.name ?? row.customerId}
              />
            ),
          },
          {
            key: 'status',
            header: 'Status',
            align: 'left',
            render: (row) =>
              row.payment ? PAYMENT_STATUS_LABELS[row.payment.status] : '—',
          },
          {
            key: 'amount',
            header: 'Outstanding',
            render: (row) => formatMoneyFull(row.payment?.outstanding ?? 0),
          },
          {
            key: 'due',
            header: 'Due',
            align: 'left',
            render: (row) =>
              row.payment ? formatDate(row.payment.dueAt, 'date') : '—',
          },
        ]}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-4">Invoice</th>
                <th className="py-2 pr-4">Trip</th>
                <th className="py-2 pr-4">Customer</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4 text-right">Outstanding</th>
                <th className="py-2 text-right">Due</th>
              </tr>
            </thead>
            <tbody>
              {openInvoices.rows.map((row) => {
                const payment = row.payment;
                if (!payment) return null;
                return (
                  <tr
                    key={row.tripId}
                    className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-surface-sunken"
                    onClick={() =>
                      onOpenDetail({ kind: 'trip', tripId: row.tripId, focus: 'payment' })
                    }
                  >
                    <td className="py-2.5 pr-4 font-medium text-foreground">
                      {payment.invoiceNo}
                    </td>
                    <td className="py-2.5 pr-4 text-muted-foreground">{row.ref}</td>
                    <td className="py-2.5 pr-4">
                      <CompanyLabel
                        id={row.customerId}
                        name={customerById.get(row.customerId)?.name ?? row.customerId}
                      />
                    </td>
                    <td className="py-2.5 pr-4">
                      <Badge
                        variant="subtle"
                        intent={
                          payment.status === 'overdue'
                            ? 'destructive'
                            : payment.status === 'pending'
                              ? 'warning'
                              : 'success'
                        }
                        size="sm"
                      >
                        {PAYMENT_STATUS_LABELS[payment.status]}
                      </Badge>
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-foreground">
                      {formatMoneyFull(payment.outstanding)}
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                      {formatDate(payment.dueAt, 'date')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <TablePager
          paged={openInvoices}
          noun="invoices"
          summary={`${formatMoneyFull(outstandingTotal)} outstanding`}
        />
      </ChartCard>
    </div>
  );
}

function computeNextSettlement(
  unpaid: TripFact[],
  generatedAt: string,
): { date: string; amount: number } | undefined {
  if (unpaid.length === 0) return undefined;

  const today = generatedAt.slice(0, 10);
  const nextRun = (() => {
    const date = new Date(`${today}T00:00:00.000Z`);
    while (date.getUTCDay() !== SETTLEMENT_WEEKDAY) {
      date.setUTCDate(date.getUTCDate() + 1);
    }
    return date.toISOString().slice(0, 10);
  })();

  const settlements = new Map<string, number>();
  for (const fact of unpaid) {
    const payment = fact.payment;
    if (!payment) continue;
    const scheduled = payment.expectedSettlementAt;
    const date = scheduled >= today ? scheduled : nextRun;
    settlements.set(date, (settlements.get(date) ?? 0) + payment.outstanding);
  }

  const upcoming = Array.from(settlements.entries()).sort(([a], [b]) => a.localeCompare(b));
  const first = upcoming[0];
  return first ? { date: first[0], amount: first[1] } : undefined;
}
