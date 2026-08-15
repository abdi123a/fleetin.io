import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { ROUTES } from '@/config/routes';
import { ApexChart } from '@/features/shipper-bi/charts/ApexChart';
import { compact, compactDjf, fmtDjf } from '@/lib/finance';
import {
  ConsolePanel,
  InsightNote,
  PanelLink,
} from '@/pages/transporter-portal/components/dashboard/console/kit';

import { buildTooltipHtml, rankedBarOptions } from './charts';
import type { MoneyModel } from '../model';

/**
 * How late the money owed to Fleetin is.
 *
 * Horizontal bars rather than a donut: ageing is ordered — within terms, then
 * 30, then 60, then worse — and a donut throws that order away by arranging
 * the same four figures in a ring where nothing comes before anything else.
 *
 * The bars carry their own colour ramp rather than one hue, because each
 * bucket means something different: teal is money behaving, the two oranges
 * are money asking, and red is money that has been out long enough to be a
 * write-off candidate.
 */
export function ReceivablesCard({ money, className }: { money: MoneyModel; className?: string }) {
  const buckets = money.ageing;
  const late = buckets.filter((bucket) => bucket.key !== 'current').reduce((sum, b) => sum + b.amountDjf, 0);
  const worst = buckets.find((bucket) => bucket.key === 'd60plus');

  const options = useMemo(
    () =>
      rankedBarOptions({
        categories: buckets.map((bucket) => bucket.label),
        colors: buckets.map((bucket) => bucket.color),
        distributed: true,
        formatter: (value) => compact(value),
        tooltip: {
          shared: false,
          intersect: true,
          custom: ({ dataPointIndex }) => {
            const bucket = buckets[dataPointIndex];
            if (!bucket) return '';
            return buildTooltipHtml(
              bucket.label,
              [{ key: 'amount', label: 'Outstanding', value: fmtDjf(bucket.amountDjf), color: bucket.color }],
              `${bucket.count} ${bucket.count === 1 ? 'invoice' : 'invoices'}`,
            );
          },
        },
      }),
    [buckets],
  );

  const series = useMemo(
    () => [{ name: 'Outstanding', data: buckets.map((bucket) => Math.round(bucket.amountDjf)) }],
    [buckets],
  );

  return (
    <ConsolePanel
      className={className}
      title="Money owed to Fleetin"
      subtitle={`${compactDjf(money.outstandingDjf)} open across ${money.openInvoices} ${money.openInvoices === 1 ? 'invoice' : 'invoices'}`}
      action={
        <Link to={ROUTES.financeInvoices}>
          <PanelLink>Invoices</PanelLink>
        </Link>
      }
      footer={
        <InsightNote tone={late > 0 ? 'attention' : 'neutral'}>
          {late > 0 ? (
            <>
              <span className="font-bold text-foreground">{fmtDjf(late)} is past its contract date</span> across{' '}
              {money.overdueInvoices} {money.overdueInvoices === 1 ? 'invoice' : 'invoices'}
              {worst && worst.amountDjf > 0 ? `, ${compactDjf(worst.amountDjf)} of it over 60 days old` : ''}. Every
              day it stays open is a day the credit facility funds the gap instead of the client.
            </>
          ) : money.openInvoices > 0 ? (
            <>
              <span className="font-bold text-foreground">Nothing is past its contract date.</span> All{' '}
              {money.openInvoices} open {money.openInvoices === 1 ? 'invoice is' : 'invoices are'} still inside
              agreed terms.
            </>
          ) : (
            <>
              <span className="font-bold text-foreground">Every issued invoice has been paid.</span>{' '}
              {compactDjf(money.collectedDjf)} collected, nothing outstanding.
            </>
          )}
        </InsightNote>
      }
    >
      {money.openInvoices === 0 && money.collectedDjf === 0 ? (
        <p className="py-10 text-center text-sm font-semibold text-muted-foreground">
          No invoice has been issued yet.
        </p>
      ) : (
        <div className="min-h-0 flex-1">
          <ApexChart type="bar" series={series} options={options} height={200} />
        </div>
      )}
    </ConsolePanel>
  );
}
