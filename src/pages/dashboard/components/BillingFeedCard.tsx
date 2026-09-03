import { Link } from 'react-router-dom';

import { ROUTES } from '@/config/routes';
import { CheckCircle, FileText, Receipt } from '@/design-system/icons';
import type { InvoiceRecord } from '@/features/finance';
import { formatMoneyMinorUnits } from '@/lib/finance';
import {
  ConsolePanel,
  PanelLink,
  PartyBadge,
} from '@/pages/transporter-portal/components/dashboard/console/kit';

/**
 * What billing actually did, most recent first.
 *
 * This replaced a ledger feed when the ledger was removed. The substitute is
 * honest rather than decorative: every row is a real document — a quote sent,
 * a bill raised, a payment recorded — with the client it went to and the
 * amount on it. A feed of "X updated Y" tells an administrator nothing they
 * can act on; a feed of documents does.
 *
 * The state is carried twice on purpose — by the glyph and by the word — so it
 * survives a greyscale screenshot.
 */
export function BillingFeedCard({
  documents,
  className,
}: {
  documents: InvoiceRecord[];
  className?: string;
}) {
  return (
    <ConsolePanel
      className={className}
      title="Billing Activity"
      action={
        <Link to={ROUTES.financeInvoices}>
          <PanelLink>Documents</PanelLink>
        </Link>
      }
    >
      {documents.length === 0 ? (
        <p className="py-10 text-center text-sm font-semibold text-muted-foreground">
          Nothing issued yet.
        </p>
      ) : (
        <div className="flex flex-col">
          {documents.map((doc, index) => {
            const paid = doc.status === 'Paid';
            const quote = doc.kind === 'proforma';
            const Glyph = paid ? CheckCircle : quote ? FileText : Receipt;
            /* A settled bill is money in; a quote is not money at all. The two
               must not wear the same colour — the whole point of the feed is
               telling them apart at a glance. */
            const tone = paid
              ? 'text-primary-subtle-foreground'
              : quote
                ? 'text-muted-foreground'
                : 'text-accent-subtle-foreground';
            const when = paid ? doc.paidAt ?? doc.issueDate : doc.issueDate;

            return (
              <div
                key={doc.id}
                className={
                  index === documents.length - 1
                    ? 'flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5'
                    : 'flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border-subtle py-2.5'
                }
              >
                <PartyBadge
                  initials={initialsOf(doc.shipperCompany)}
                  tone={paid ? 'calm' : 'attention'}
                />
                <span className="min-w-[10rem] flex-1">
                  <span className="block truncate text-xs font-bold text-foreground">
                    {doc.shipperCompany}
                  </span>
                  <span className="type-body-xs mt-0.5 block truncate text-muted-foreground">
                    {doc.number} · {paid ? 'paid' : quote ? 'quoted' : 'invoiced'} ·{' '}
                    {new Date(when).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <Glyph
                    aria-label={paid ? 'Paid' : quote ? 'Quoted' : 'Invoiced'}
                    className={`size-3.5 shrink-0 ${tone}`}
                  />
                  <span className={`text-xs font-extrabold tabular-nums ${tone}`}>
                    {formatMoneyMinorUnits(doc.totalMinorUnits, doc.currency)}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </ConsolePanel>
  );
}

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter((word) => /[a-z0-9]/i.test(word))
      .slice(0, 2)
      .map((word) => word[0])
      .join('')
      .toUpperCase() || '—'
  );
}
