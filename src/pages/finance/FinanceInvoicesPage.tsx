import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { TablePager, usePagedRows } from '@/components';
import { ROUTES } from '@/config/routes';
import { CircleCheck, Hourglass, Receipt, Search, TriangleAlert } from '@/design-system/icons';
import { fmtDjf } from '@/lib/finance';
import { useInvoices, useMarkInvoicePaid, type InvoiceRecord } from '@/features/finance';
import { useShipmentsRaw } from '@/features/shipments/api/queries';
import { cn } from '@/utils';

import { BankAccountSelect } from './components/BankAccountSelect';
import { ActionButton, DataTable, EmptyState, FilterPills, MoneyAmount, PageHead, Panel, Pill, StatCard, Td, Th } from './components/kit';

type Filter = 'all' | 'outstanding' | 'overdue' | 'settled';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'outstanding', label: 'Outstanding' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'settled', label: 'Settled' },
];

function overdueNow(invoice: InvoiceRecord): boolean {
  return invoice.status !== 'Paid' && new Date(invoice.contractDeadline).getTime() < Date.now();
}

/**
 * Every invoice Fleetin has issued, in one book. Invoices are auto-issued
 * server-side the moment a priced shipment's bookings are all proven — this
 * page is the ledger of what that produced, plus the manual "Issue Invoice"/
 * "Set client rate" paths on the shipment page for anything that missed it.
 */
export function FinanceInvoicesPage() {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [bankAccountId, setBankAccountId] = useState('');

  const { data, isLoading } = useInvoices({ limit: 200 });
  const markPaid = useMarkInvoicePaid();

  const invoices = useMemo(() => data?.items ?? [], [data]);

  /**
   * `missionIds` holds shipment keys, not references, so the book has to
   * resolve them itself — one fetch for the whole page rather than a raw
   * thirty-six-character key in a column headed SHIPMENT.
   */
  const { data: shipmentsData } = useShipmentsRaw({ limit: 500 }, { enabled: true });
  const referenceById = useMemo(
    () => new Map((shipmentsData?.items ?? []).map((s) => [s.id, s.reference])),
    [shipmentsData],
  );
  /** `MSN-08802`, or `MSN-08802 +2` when the invoice is a month's statement. */
  const shipmentLabel = (invoice: InvoiceRecord): string => {
    const first = invoice.missionIds[0];
    const reference = first ? referenceById.get(first) : undefined;
    if (!reference) return '—';
    return invoice.missionIds.length > 1 ? `${reference} +${invoice.missionIds.length - 1}` : reference;
  };

  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return invoices
      .filter((invoice) => {
        const late = overdueNow(invoice);
        if (filter === 'outstanding' && invoice.status === 'Paid') return false;
        if (filter === 'settled' && invoice.status !== 'Paid') return false;
        if (filter === 'overdue' && (invoice.status === 'Paid' || !late)) return false;
        if (!term) return true;
        return (
          invoice.number.toLowerCase().includes(term) ||
          invoice.shipperCompany.toLowerCase().includes(term) ||
          invoice.missionIds.some((id) => (referenceById.get(id) ?? id).toLowerCase().includes(term))
        );
      })
      .sort((a, b) => new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime());
  }, [invoices, filter, query, referenceById]);

  /** The book pages — a year of invoices is not one scroll. */
  const [pageSize, setPageSize] = useState(25);
  const paged = usePagedRows(rows, { pageSize, resetKey: `${filter}|${query}` });

  const open = invoices.filter((invoice) => invoice.status !== 'Paid');
  const overdue = open.filter(overdueNow);
  const settled = invoices.filter((invoice) => invoice.status === 'Paid');
  const sum = (list: InvoiceRecord[]) => list.reduce((total, entry) => total + Number(entry.totalMinorUnits), 0);

  const handleMarkPaid = async (id: string) => {
    if (!bankAccountId) return;
    await markPaid.mutateAsync({ id, bankAccountId });
    setMarkingId(null);
    setBankAccountId('');
  };

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-4 pb-8 pt-1 sm:px-6">
      <PageHead title="Invoices" subtitle="Invoices raised from shipments" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Receipt} tint="teal" label="Issued" value={String(invoices.length)} hint={fmtDjf(sum(invoices))} />
        <StatCard icon={Hourglass} tint="orange" label="Outstanding" value={String(open.length)} hint={fmtDjf(sum(open))} />
        <StatCard
          icon={TriangleAlert}
          tint="amber"
          label="Overdue"
          value={String(overdue.length)}
          hint={fmtDjf(sum(overdue))}
          tone={overdue.length > 0 ? 'attention' : 'plain'}
        />
        <StatCard icon={CircleCheck} tint="teal" label="Settled" value={String(settled.length)} hint={fmtDjf(sum(settled))} />
      </div>

      <Panel
        title="Invoices"
        subtitle="Raised once every booking on a priced shipment has POD"
        padded={false}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative">
              <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Invoice, shipper or shipment"
                className="w-56 rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-xs font-semibold text-foreground outline-none transition-colors placeholder:font-medium placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring"
              />
            </label>
            <FilterPills options={FILTERS} active={filter} onChange={setFilter} />
          </div>
        }
      >
        {isLoading ? (
          <div className="px-5 py-6">
            <EmptyState message="Loading invoices…" />
          </div>
        ) : rows.length === 0 ? (
          <div className="px-5 py-6">
            <EmptyState message="No invoices match this view." />
          </div>
        ) : (
          <DataTable>
            <thead>
              <tr>
                <Th>Invoice</Th>
                <Th>Shipper</Th>
                <Th>Shipment</Th>
                <Th align="right">Amount</Th>
                <Th>Issued</Th>
                <Th>Due</Th>
                <Th align="right">Status</Th>
              </tr>
            </thead>
            <tbody>
              {paged.rows.map((invoice) => {
                const late = overdueNow(invoice);
                return (
                  <tr key={invoice.id} className="transition-colors hover:bg-surface-sunken/60">
                    <Td>
                      <Link to={`${ROUTES.financeInvoices}/${invoice.id}`} className="font-mono text-sm font-bold text-primary-subtle-foreground hover:underline">
                        {invoice.number}
                      </Link>
                    </Td>
                    <Td>
                      <span className="text-sm font-bold text-foreground">{invoice.shipperCompany}</span>
                    </Td>
                    <Td>
                      <span className="font-mono text-xs font-semibold text-muted-foreground">{shipmentLabel(invoice)}</span>
                    </Td>
                    <Td align="right">
                      <MoneyAmount value={Number(invoice.totalMinorUnits)} direction="in" className="text-sm" />
                    </Td>
                    <Td>
                      <span className="text-xs font-semibold text-muted-foreground">{formatDate(invoice.issueDate)}</span>
                    </Td>
                    <Td>
                      <span className={cn('text-xs font-bold', late ? 'text-accent-subtle-foreground' : 'text-muted-foreground')}>
                        {formatDate(invoice.contractDeadline)}
                      </span>
                    </Td>
                    <Td align="right">
                      {invoice.status === 'Paid' ? (
                        <span className="flex items-center justify-end gap-2">
                          <Pill tone="teal">Settled</Pill>
                        </span>
                      ) : markingId === invoice.id ? (
                        <span className="flex items-center justify-end gap-2">
                          <div className="w-44">
                            <BankAccountSelect value={bankAccountId} onChange={setBankAccountId} />
                          </div>
                          <ActionButton variant="primary" onClick={() => handleMarkPaid(invoice.id)} disabled={!bankAccountId || markPaid.isPending}>
                            {markPaid.isPending ? '…' : 'Confirm'}
                          </ActionButton>
                        </span>
                      ) : (
                        <span className="flex items-center justify-end gap-2">
                          <Pill tone={late ? 'orange' : 'amber'}>{late ? 'Overdue' : 'Outstanding'}</Pill>
                          <ActionButton variant="ghost" onClick={() => setMarkingId(invoice.id)}>
                            Mark paid
                          </ActionButton>
                        </span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        )}
        {rows.length > 0 ? (
          <TablePager
            paged={paged}
            noun="invoices"
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
            className="px-5 pb-4"
          />
        ) : null}
      </Panel>
    </div>
  );
}

const formatDate = (iso: string): string => new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

export default FinanceInvoicesPage;
