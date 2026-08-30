import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { ROUTES, buildPath } from '@/config/routes';
import { ArrowLeft, Printer } from '@/design-system/icons';
import { RecordRaise } from '@/features/workspace';
import { useSystemSettings } from '@/features/settings';
import { amountInWords, fmtDjfPlain, fmtDocDate } from '@/lib/finance';
import { useInvoice, useMarkInvoicePaid, type InvoiceRecord } from '@/features/finance';
import { useBookingsForShipment } from '@/features/bookings/api/queries';
import { useShipmentRaw, useShipmentsRaw } from '@/features/shipments/api/queries';
import { useBreadcrumbLabel } from '@/hooks/useBreadcrumbLabel';

import { BankAccountSelect } from './components/BankAccountSelect';
import {
  DocumentFooter,
  DocumentLetterhead,
  DocumentSignatureBlock,
  DocumentStampWatermark,
  useRemittanceAccount,
} from './components/documentChrome';
import { ActionButton, EmptyState, Panel, Pill } from './components/kit';

/**
 * THE SHIPPER'S DOCUMENT — in two shapes, from one component.
 *
 * The normal one is a MONTHLY STATEMENT: every shipment the client ran that
 * month, one line each with its own total, and one amount due at the end of
 * the month. That is the whole billing arrangement made visible — Fleetin
 * funds the month, the client settles it in one payment against this page.
 *
 * The other is a single-shipment invoice, for work billed outside a month's
 * statement. Both print from `missionIds`; a statement simply has more than
 * one element in it, and only the statement carries `periodStart`.
 *
 * Pricing is shipment-level only — there is no per-booking client rate to
 * itemise, so a shipment's bookings print as a statement of what was
 * delivered, never as separately priced lines.
 */
export function InvoiceDocumentPage() {
  const { invoiceId = '' } = useParams();
  const { data: invoice, isLoading } = useInvoice(invoiceId);
  const isStatement = invoice != null && invoice.periodStart != null;
  const shipmentId = invoice?.missionIds[0];
  // A single-shipment invoice fetches just its own shipment and that
  // shipment's bookings. A statement covers many, so it pulls the shipper's
  // book once and picks out the ones it bills — one request either way.
  const { data: shipment } = useShipmentRaw(isStatement ? undefined : shipmentId);
  const { data: bookingsData } = useBookingsForShipment(isStatement ? undefined : shipmentId);
  const { data: shipperShipmentsData } = useShipmentsRaw(
    { customerId: invoice?.shipperId, limit: 500 },
    { enabled: isStatement && Boolean(invoice?.shipperId) },
  );

  /**
   * The billed shipments, in the order they were billed. Falls back to the
   * raw id when a shipment can't be resolved, so a line is never silently
   * dropped from a document someone is going to pay against.
   */
  const statementLines = useMemo(() => {
    if (!invoice) return [];
    const byId = new Map((shipperShipmentsData?.items ?? []).map((s) => [s.id, s]));
    return invoice.missionIds.map((id) => {
      const found = byId.get(id);
      return {
        id,
        reference: found?.reference ?? id,
        route: found ? `${found.pickupLocationCity} → ${found.deliveryLocationCity}` : '',
        pickupAt: found?.scheduledPickupTime ?? null,
        bookingCount: found?.bookingCount ?? 0,
        amountDjf: found?.clientRateMinorUnits != null ? Number(found.clientRateMinorUnits) : null,
      };
    });
  }, [invoice, shipperShipmentsData]);
  const markPaid = useMarkInvoicePaid();
  // The URL segment is the invoice's database key; the trail shows the number
  // that is printed on the document instead.
  useBreadcrumbLabel(invoice?.number);

  const [markingPaid, setMarkingPaid] = useState(false);
  const [bankAccountId, setBankAccountId] = useState('');

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-[1600px] px-4 pt-6 sm:px-6">
        <Panel title="Loading…">
          <EmptyState message="Fetching this invoice." />
        </Panel>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="mx-auto w-full max-w-[1600px] px-4 pt-6 sm:px-6">
        <Panel title="Invoice not found">
          <EmptyState message="No invoice with that reference." />
        </Panel>
      </div>
    );
  }

  const late = invoice.status !== 'Paid' && new Date(invoice.contractDeadline).getTime() < Date.now();
  const bookings = bookingsData ?? [];

  const handleMarkPaid = async () => {
    if (!bankAccountId) return;
    await markPaid.mutateAsync({ id: invoice.id, bankAccountId });
    setMarkingPaid(false);
    setBankAccountId('');
  };

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 px-4 pb-8 pt-1 sm:px-6">
      {/* Toolbar — screen only. */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <Link to={ROUTES.financeInvoices} className="w-fit">
            <ActionButton variant="quiet" icon={ArrowLeft}>
              Invoices
            </ActionButton>
          </Link>
          {/* Only a single-shipment invoice has one shipment to jump to, and
              only once its reference has resolved — the raw key is not a
              label anyone recognises. */}
          {shipmentId && shipment?.reference ? (
            <Link to={buildPath(ROUTES.financeShipmentDetail, { shipmentId })} className="w-fit">
              <ActionButton variant="quiet">{shipment.reference}</ActionButton>
            </Link>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RecordRaise
            recordType="INVOICE"
            recordId={invoice.id}
            recordRef={invoice.number}
            label={invoice.status}
            size="sm"
          />
          {invoice.status === 'Paid' ? (
            <Pill tone="teal">Settled</Pill>
          ) : (
            <>
              <Pill tone={late ? 'orange' : 'amber'}>{late ? 'Overdue' : 'Outstanding'}</Pill>
              {markingPaid ? (
                <div className="flex items-center gap-2">
                  <div className="w-56">
                    <BankAccountSelect value={bankAccountId} onChange={setBankAccountId} />
                  </div>
                  <ActionButton variant="primary" onClick={handleMarkPaid} disabled={!bankAccountId || markPaid.isPending}>
                    {markPaid.isPending ? 'Marking…' : 'Confirm'}
                  </ActionButton>
                  <ActionButton variant="ghost" onClick={() => setMarkingPaid(false)}>
                    Cancel
                  </ActionButton>
                </div>
              ) : (
                <ActionButton variant="ghost" onClick={() => setMarkingPaid(true)}>
                  Mark settled
                </ActionButton>
              )}
            </>
          )}
          <ActionButton variant="primary" icon={Printer} onClick={() => window.print()}>
            Print / PDF
          </ActionButton>
        </div>
      </div>

      <InvoiceSheet
        invoice={invoice}
        shipmentReference={shipment?.reference}
        bookingCount={bookings.length}
        statementLines={statementLines}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * The sheet
 * ═══════════════════════════════════════════════════════════════════════ */

export interface StatementLine {
  id: string;
  reference: string;
  route: string;
  pickupAt: string | null;
  /** Containers carried under this shipment. The line's unit of work. */
  bookingCount: number;
  /** Null only if the billed shipment couldn't be resolved — the line still prints. */
  amountDjf: number | null;
}

/**
 * `3 trips` — what the shipper calls a run. Internally these rows are
 * bookings, one per container; on a document a client reads, they are trips.
 * Null when the count is unknown, so the line simply omits it.
 */
function tripLabel(count: number): string | null {
  if (count < 1) return null;
  return `${count} trip${count === 1 ? '' : 's'}`;
}

/**
 * `invoice.missionIds` holds database keys, not references — a shipment's
 * printable `MSN-#####` has to be resolved from the shipment itself. Until it
 * is, a raw UUID must never reach the page: it is thirty-six characters of
 * noise on a document a client reads, and it isn't the number they'd quote.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function printableReference(...candidates: (string | undefined)[]): string | null {
  return candidates.find((value) => value && !UUID.test(value)) ?? null;
}

export function InvoiceSheet({
  invoice,
  shipmentReference,
  bookingCount,
  statementLines = [],
}: {
  invoice: InvoiceRecord;
  shipmentReference?: string;
  bookingCount: number;
  /** One row per shipment on a monthly statement. Empty for a single-shipment invoice. */
  statementLines?: StatementLine[];
}) {
  const documents = useSystemSettings().documents;
  const remittance = useRemittanceAccount();
  const total = Number(invoice.totalMinorUnits);
  const isStatement = invoice.periodStart != null;
  const statementBookings = statementLines.reduce((sum, line) => sum + line.bookingCount, 0);
  // A statement covers many shipments, so it names the month under the
  // invoice number instead of any single one.
  const headerSubtitle = isStatement
    ? new Date(invoice.periodStart as string).toLocaleDateString('en-GB', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : printableReference(shipmentReference, statementLines[0]?.reference, invoice.missionIds[0]);
  const lineReference = printableReference(shipmentReference, invoice.missionIds[0]);

  return (
    <article className="invoice-sheet relative mx-auto w-full shadow-card print:shadow-none">
      <DocumentStampWatermark document="invoice" />

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-start justify-between gap-6 border-b-[3px] border-[var(--invoice-brand)] px-[14mm] pb-[8mm] pt-[12mm]">
        <DocumentLetterhead />

        <div className="text-right text-[9pt] leading-[1.6]">
          <p className="text-[20pt] font-extrabold uppercase leading-none tracking-[0.08em] text-[var(--invoice-brand)]">Invoice</p>
          <p className="mt-[3mm] font-mono text-[11pt] font-bold">{invoice.number}</p>
          {headerSubtitle ? (
            <p className="font-mono text-[9pt] font-bold text-[var(--invoice-brand)]">{headerSubtitle}</p>
          ) : null}
          <p className="text-[var(--invoice-muted)]">
            Issued <span className="font-semibold text-[var(--invoice-ink)]">{fmtDocDate(invoice.issueDate)}</span>
          </p>
          <p className="text-[var(--invoice-muted)]">
            Due <span className="font-semibold text-[var(--invoice-ink)]">{fmtDocDate(invoice.contractDeadline)}</span>
          </p>
        </div>
      </header>

      {/* ── Parties ────────────────────────────────────────────────────── */}
      <section className="grid gap-6 px-[14mm] pt-[8mm] sm:grid-cols-2">
        <div>
          <p className="text-[8pt] font-extrabold uppercase tracking-[0.12em] text-[var(--invoice-faint)]">Billed to</p>
          <p className="mt-[2mm] text-[12pt] font-extrabold text-[var(--invoice-ink)]">{invoice.shipperCompany}</p>
          <p className="text-[9pt] text-[var(--invoice-muted)]">{invoice.shipperName}</p>
        </div>
        <div className="sm:text-right">
          <p className="text-[8pt] font-extrabold uppercase tracking-[0.12em] text-[var(--invoice-faint)]">Amount due</p>
          <p className="mt-[2mm] font-mono text-[18pt] font-extrabold tabular-nums text-[var(--invoice-ink)]">
            {fmtDjfPlain(total)} {invoice.currency}
          </p>
          {invoice.status === 'Paid' ? <p className="text-[9pt] font-bold text-[var(--invoice-settled)]">Settled</p> : null}
        </div>
      </section>

      <section className="px-[14mm] pt-[8mm]">
        <div className="rounded-[2mm] border border-[var(--invoice-rule)] bg-[var(--invoice-wash)] px-[4mm] py-[3.5mm]">
          {isStatement ? (
            <p className="text-[9.5pt] leading-[1.6] text-[var(--invoice-ink)]">
              Statement for{' '}
              <span className="font-bold">
                {new Date(invoice.periodStart as string).toLocaleDateString('en-GB', {
                  month: 'long',
                  year: 'numeric',
                  timeZone: 'UTC',
                })}
              </span>{' '}
              — <span className="font-bold">{invoice.missionIds.length} shipment{invoice.missionIds.length === 1 ? '' : 's'}</span>
              {statementBookings > 0 ? (
                <>
                  {' '}
                  covering <span className="font-bold">{tripLabel(statementBookings)}</span>
                </>
              ) : null}{' '}
              carried and delivered, itemised below. Payable in full by {fmtDocDate(invoice.contractDeadline)}.
            </p>
          ) : (
            <p className="text-[9.5pt] leading-[1.6] text-[var(--invoice-ink)]">
              Delivered under shipment <span className="font-mono font-bold">{lineReference ?? '—'}</span>:{' '}
              <span className="font-bold">{bookingCount} trip{bookingCount === 1 ? '' : 's'}</span> completed and signed for.
            </p>
          )}
        </div>
      </section>

      {/* ── Lines — one per shipment covered, always one in practice ─────── */}
      <section className="px-[14mm] pt-[5mm]">
        <table className="w-full border-collapse text-[9pt]">
          <thead>
            <tr className="bg-[var(--invoice-wash)]">
              <th className="border-b border-[var(--invoice-rule)] px-[3mm] py-[2.5mm] text-left text-[8pt] font-extrabold uppercase tracking-[0.08em] text-[var(--invoice-muted)]">Description</th>
              <th className="border-b border-[var(--invoice-rule)] px-[3mm] py-[2.5mm] text-left text-[8pt] font-extrabold uppercase tracking-[0.08em] text-[var(--invoice-muted)]">Shipment</th>
              <th className="border-b border-[var(--invoice-rule)] px-[3mm] py-[2.5mm] text-right text-[8pt] font-extrabold uppercase tracking-[0.08em] text-[var(--invoice-muted)]">Amount</th>
            </tr>
          </thead>
          <tbody>
            {isStatement ? (
              statementLines.map((line) => (
                <tr key={line.id}>
                  <td className="border-b border-[var(--invoice-rule-soft)] px-[3mm] py-[3mm] align-top">
                    <span className="font-bold">{line.route || 'Freight services as agreed'}</span>
                    {line.pickupAt ? (
                      <span className="ml-[2mm] text-[8pt] text-[var(--invoice-muted)]">{fmtDocDate(line.pickupAt)}</span>
                    ) : null}
                  </td>
                  <td className="border-b border-[var(--invoice-rule-soft)] px-[3mm] py-[3mm] align-top font-mono text-[8pt]">
                    {line.reference}
                    {tripLabel(line.bookingCount) ? (
                      <span className="block font-sans text-[8pt] text-[var(--invoice-muted)]">
                        {tripLabel(line.bookingCount)}
                      </span>
                    ) : null}
                  </td>
                  <td className="border-b border-[var(--invoice-rule-soft)] px-[3mm] py-[3mm] text-right align-top font-mono font-bold tabular-nums">
                    {line.amountDjf != null ? fmtDjfPlain(line.amountDjf) : '—'}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="border-b border-[var(--invoice-rule-soft)] px-[3mm] py-[3mm] align-top">
                  <span className="font-bold">{invoice.description || 'Freight services as agreed'}</span>
                </td>
                <td className="border-b border-[var(--invoice-rule-soft)] px-[3mm] py-[3mm] align-top font-mono text-[8pt]">
                  {lineReference ?? '—'}
                  {tripLabel(bookingCount) ? (
                    <span className="block font-sans text-[8pt] text-[var(--invoice-muted)]">
                      {tripLabel(bookingCount)}
                    </span>
                  ) : null}
                </td>
                <td className="border-b border-[var(--invoice-rule-soft)] px-[3mm] py-[3mm] text-right align-top font-mono font-bold tabular-nums">
                  {fmtDjfPlain(total)}
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2} className="border-t-2 border-[var(--invoice-brand)] px-[3mm] py-[3mm] text-right text-[10pt] font-extrabold uppercase tracking-wide">
                Total due
              </td>
              <td className="border-t-2 border-[var(--invoice-brand)] px-[3mm] py-[3mm] text-right font-mono text-[13pt] font-extrabold tabular-nums">
                {fmtDjfPlain(total)}
              </td>
            </tr>
          </tfoot>
        </table>

        <p className="mt-[3mm] text-[8.5pt] italic text-[var(--invoice-muted)]">{amountInWords(total)}</p>
      </section>

      {/* ── Payment + stamp ────────────────────────────────────────────── */}
      <section className="grid gap-6 px-[14mm] pt-[9mm] sm:grid-cols-2">
        <div>
          <p className="text-[8pt] font-extrabold uppercase tracking-[0.12em] text-[var(--invoice-faint)]">Payable to</p>
          <dl className="mt-[2mm] text-[9pt] leading-[1.7]">
            <PayRow label="Bank" value={remittance.bankName} />
            <PayRow label="Account name" value={remittance.accountHolder} />
            <PayRow label="Account" value={remittance.accountNumber} mono />
            {remittance.swiftCode ? <PayRow label="SWIFT" value={remittance.swiftCode} mono /> : null}
          </dl>
          <p className="mt-[3mm] text-[8pt] text-[var(--invoice-muted)]">
            Please quote <span className="font-mono font-bold">{invoice.number}</span> as the payment reference.
          </p>
          {documents.invoiceTerms ? (
            <p className="mt-[3mm] max-w-[80mm] text-[8pt] leading-[1.55] text-[var(--invoice-faint)]">
              {documents.invoiceTerms}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col items-end justify-end">
          <DocumentSignatureBlock document="invoice" />
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <DocumentFooter note={documents.invoiceDisclaimer} />
    </article>
  );
}

function PayRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <dt className="w-[28mm] shrink-0 text-[var(--invoice-faint)]">{label}</dt>
      <dd className={mono ? 'font-mono font-semibold' : 'font-semibold'}>{value}</dd>
    </div>
  );
}

export default InvoiceDocumentPage;
