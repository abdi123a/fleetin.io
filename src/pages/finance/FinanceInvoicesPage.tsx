import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { ROUTES } from '@/config/routes';
import { CircleCheck, Hourglass, Receipt, Search, TriangleAlert } from '@/design-system/icons';
import { fmtDjf, overdueDays } from '@/lib/finance';
import { useFinanceStore } from '@/stores/finance.store';
import type { ClientInvoice } from '@/types/finance';
import { cn } from '@/utils';

import {
  ActionButton,
  Avatar,
  DataTable,
  EmptyState,
  FilterPills,
  MoneyAmount,
  PageHead,
  Panel,
  Pill,
  StatCard,
  Td,
  Th,
} from './components/kit';
import { useFinanceModel } from './model';

/**
 * Every invoice Fleetin has issued, in one book.
 *
 * Invoices are not created here — they are raised inside a booking the moment
 * proof of delivery is confirmed on a priced shipment, because that is when
 * the client's payment terms start. This page is the ledger of what that has
 * produced, and the way into each printable document.
 */

type Filter = 'all' | 'outstanding' | 'overdue' | 'settled';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'outstanding', label: 'Outstanding' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'settled', label: 'Settled' },
];

export function FinanceInvoicesPage() {
  const model = useFinanceModel();
  const markInvoicePaid = useFinanceStore((state) => state.markInvoicePaid);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return model.invoices
      .filter((invoice) => {
        const late = overdueDays(invoice, model.nowMs) > 0;
        if (filter === 'outstanding' && invoice.paidAt) return false;
        if (filter === 'settled' && !invoice.paidAt) return false;
        if (filter === 'overdue' && (invoice.paidAt || !late)) return false;
        if (!term) return true;
        const client = model.clientById.get(invoice.clientId)?.name ?? '';
        return (
          invoice.id.toLowerCase().includes(term) ||
          client.toLowerCase().includes(term) ||
          invoice.shipmentId.toLowerCase().includes(term) ||
          invoice.bookingIds.some((id) => id.toLowerCase().includes(term))
        );
      })
      .sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime());
  }, [model.invoices, model.clientById, model.nowMs, filter, query]);

  const open = model.invoices.filter((invoice) => !invoice.paidAt);
  const overdue = open.filter((invoice) => overdueDays(invoice, model.nowMs) > 0);
  const settled = model.invoices.filter((invoice) => invoice.paidAt);
  const sum = (list: ClientInvoice[]) => list.reduce((total, entry) => total + entry.amountDjf, 0);

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-4 pb-8 pt-1 sm:px-6">
      <PageHead
        title="Invoices"
        subtitle="Every invoice raised from a booking, and what it is doing"
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Receipt}
          tint="teal"
          label="Issued"
          value={String(model.invoices.length)}
          hint={fmtDjf(sum(model.invoices))}
        />
        <StatCard
          icon={Hourglass}
          tint="orange"
          label="Outstanding"
          value={String(open.length)}
          hint={fmtDjf(sum(open))}
        />
        <StatCard
          icon={TriangleAlert}
          tint="amber"
          label="Overdue"
          value={String(overdue.length)}
          hint={fmtDjf(sum(overdue))}
          tone={overdue.length > 0 ? 'attention' : 'plain'}
        />
        <StatCard
          icon={CircleCheck}
          tint="teal"
          label="Settled"
          value={String(settled.length)}
          hint={fmtDjf(sum(settled))}
        />
      </div>

      <Panel
        title="Invoice book"
        subtitle="Raised automatically when a priced booking's PoD is confirmed"
        padded={false}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative">
              <Search
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Invoice, client or booking"
                className="w-56 rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-xs font-semibold text-foreground outline-none transition-colors placeholder:font-medium placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring"
              />
            </label>
            <FilterPills options={FILTERS} active={filter} onChange={setFilter} />
          </div>
        }
      >
        {rows.length === 0 ? (
          <div className="px-5 py-6">
            <EmptyState message="No invoice matches this view." />
          </div>
        ) : (
          <DataTable>
            <thead>
              <tr>
                <Th>Invoice</Th>
                <Th>Client</Th>
                <Th>Shipment</Th>
                <Th align="right">Amount</Th>
                <Th>Issued</Th>
                <Th>Due</Th>
                <Th align="right">Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((invoice) => {
                const client = model.clientById.get(invoice.clientId);
                const late = !invoice.paidAt && overdueDays(invoice, model.nowMs) > 0;
                const shipmentRow = model.shipmentById.get(invoice.shipmentId);
                return (
                  <tr key={invoice.id} className="transition-colors hover:bg-surface-sunken/60">
                    <Td>
                      <Link
                        to={`${ROUTES.financeInvoices}/${invoice.id}`}
                        className="font-mono text-sm font-bold text-primary-subtle-foreground hover:underline"
                      >
                        {invoice.id}
                      </Link>
                    </Td>
                    <Td>
                      <span className="flex items-center gap-2">
                        <Avatar name={client?.name ?? invoice.clientId} logoUrl={client?.logoUrl} size={24} />
                        <span className="text-sm font-bold text-foreground">
                          {client?.name ?? invoice.clientId}
                        </span>
                      </span>
                    </Td>
                    <Td>
{/* The invoice bills a whole consignment, so it links to the
                          shipment and says how many bookings it covers. */}
                      <Link
                        to={`${ROUTES.financeShipments}/shipment/${invoice.shipmentId}`}
                        className="font-mono text-xs font-semibold text-muted-foreground hover:text-foreground hover:underline"
                      >
                        {invoice.shipmentId}
                      </Link>
                      <span className="mt-0.5 block text-xs font-semibold text-muted-foreground">
                        {invoice.bookingIds.length} booking
                        {invoice.bookingIds.length === 1 ? '' : 's'}
                        {shipmentRow?.shipment.reference ? ` · ${shipmentRow.shipment.reference}` : ''}
                      </span>
                    </Td>
                    <Td align="right">
                      <MoneyAmount value={invoice.amountDjf} direction="in" className="text-sm" />
                    </Td>
                    <Td>
                      <span className="text-xs font-semibold text-muted-foreground">
                        {formatDate(invoice.issuedAt)}
                      </span>
                    </Td>
                    <Td>
                      <span
                        className={cn(
                          'text-xs font-bold',
                          late ? 'text-accent-subtle-foreground' : 'text-muted-foreground',
                        )}
                      >
                        {formatDate(invoice.dueAt)}
                        {late ? ` · ${overdueDays(invoice, model.nowMs)}d late` : ''}
                      </span>
                    </Td>
                    <Td align="right">
                      <span className="flex items-center justify-end gap-2">
                        {invoice.paidAt ? (
                          <Pill tone="teal">Settled</Pill>
                        ) : (
                          <>
                            <Pill tone={late ? 'orange' : 'amber'}>
                              {late ? 'Overdue' : 'Outstanding'}
                            </Pill>
                            <ActionButton
                              variant="ghost"
                              onClick={() => markInvoicePaid(invoice.id)}
                            >
                              Mark paid
                            </ActionButton>
                          </>
                        )}
                      </span>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        )}
      </Panel>
    </div>
  );
}

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

export default FinanceInvoicesPage;
