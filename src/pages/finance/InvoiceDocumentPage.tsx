import { Link, useParams } from 'react-router-dom';

import { COMPANY, COMPANY_ADDRESS_LINES } from '@/config/company';
import { ROUTES } from '@/config/routes';
import { ArrowLeft, Printer } from '@/design-system/icons';
import { amountInWords, fmtDjfPlain, fmtDocDate, overdueDays } from '@/lib/finance';
import { useFinanceStore } from '@/stores/finance.store';
import type { ClientInvoice, FinanceBooking } from '@/types/finance';

import { ActionButton, EmptyState, Panel, Pill } from './components/kit';
import { useFinanceModel } from './model';

/**
 * THE SHIPPER'S DOCUMENT: one invoice for one consignment.
 *
 * It says, in the client's own terms: we delivered shipment SHI-#####, here are
 * its twenty bookings by number, here is what each was billed at, here is the
 * total. Every booking on the consignment is a line — that is the whole
 * document, and it is why the invoice is shipment-scoped rather than one
 * envelope per container.
 *
 * A real document, not a data view: letterhead with the mark, the parties
 * side by side, the lines, the total in words as well as figures, the bank
 * details to pay into, a signature-and-stamp block, and a footer carrying the
 * registration numbers. Everything is sized in millimetres against an A4
 * sheet so the screen and the print are the same object — `@media print`
 * drops the app chrome and the toolbar, nothing else changes.
 *
 * Amounts are whole DJF (zero-decimal), so no cents column exists anywhere.
 */
export function InvoiceDocumentPage() {
  const model = useFinanceModel();
  const { invoiceId = '' } = useParams();
  const markInvoicePaid = useFinanceStore((state) => state.markInvoicePaid);

  const invoice = model.invoiceById.get(invoiceId);
  if (!invoice) {
    return (
      <div className="mx-auto w-full max-w-[1600px] px-4 pt-6 sm:px-6">
        <Panel title="Invoice not found">
          <EmptyState message="No invoice with that reference." />
        </Panel>
      </div>
    );
  }

  const client = model.clientById.get(invoice.clientId);
  const bookings = invoice.bookingIds
    .map((id) => model.bookingById.get(id)?.booking)
    .filter((booking): booking is FinanceBooking => booking !== undefined);
  const shipmentRow = model.shipmentById.get(invoice.shipmentId);
  const late = !invoice.paidAt && overdueDays(invoice, model.nowMs) > 0;

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
          <Link to={`${ROUTES.financeShipments}/shipment/${invoice.shipmentId}`} className="w-fit">
            <ActionButton variant="quiet">{invoice.shipmentId}</ActionButton>
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {invoice.paidAt ? (
            <Pill tone="teal">Settled {formatDate(invoice.paidAt)}</Pill>
          ) : (
            <>
              <Pill tone={late ? 'orange' : 'amber'}>
                {late ? `Overdue by ${overdueDays(invoice, model.nowMs)} days` : 'Outstanding'}
              </Pill>
              <ActionButton variant="ghost" onClick={() => markInvoicePaid(invoice.id)}>
                Mark settled
              </ActionButton>
            </>
          )}
          <ActionButton variant="primary" icon={Printer} onClick={() => window.print()}>
            Print / PDF
          </ActionButton>
        </div>
      </div>

      <InvoiceSheet
        invoice={invoice}
        clientName={client?.name ?? invoice.clientId}
        bookings={bookings}
        shipmentReference={shipmentRow?.shipment.reference}
        termsDays={client?.paymentTermsDays ?? 30}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * The sheet
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * A4 at 210mm wide. Fixed millimetre padding rather than the app's spacing
 * scale, because this element's job is to be a piece of paper.
 */
export function InvoiceSheet({
  invoice,
  clientName,
  bookings,
  shipmentReference,
  termsDays,
}: {
  invoice: ClientInvoice;
  clientName: string;
  bookings: FinanceBooking[];
  shipmentReference?: string;
  termsDays: number;
}) {
  const lines = bookings.length > 0 ? bookings : null;
  // One booking = one line at its own rate. The subtotal is only computed from
  // the lines when EVERY line has a price; otherwise the stored total stands
  // alone rather than being reconstructed from a partial set.
  const priced = bookings.filter((booking) => booking.clientRateDjf !== null);
  const linesAreComplete = priced.length === bookings.length && bookings.length > 0;

  // Paper and ink come from `.invoice-sheet` in index.css — see the note there
  // on why this one surface ignores the viewer's theme.
  return (
    <article className="invoice-sheet mx-auto w-full shadow-card print:shadow-none">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-start justify-between gap-6 border-b-[3px] border-[var(--invoice-brand)] px-[14mm] pb-[8mm] pt-[12mm]">
        <div className="flex items-start gap-4">
          <img
            src={COMPANY.logoSrc}
            alt={COMPANY.tradingName}
            className="h-[16mm] w-auto object-contain"
          />
          <div className="text-[9pt] leading-[1.5]">
            <p className="text-[11pt] font-extrabold tracking-tight text-[var(--invoice-ink)]">
              {COMPANY.legalName}
            </p>
            <p className="text-[var(--invoice-muted)]">{COMPANY.tagline}</p>
            {COMPANY_ADDRESS_LINES.map((line) => (
              <p key={line} className="text-[var(--invoice-muted)]">
                {line}
              </p>
            ))}
          </div>
        </div>

        <div className="text-right text-[9pt] leading-[1.6]">
          <p className="text-[20pt] font-extrabold uppercase leading-none tracking-[0.08em] text-[var(--invoice-brand)]">
            Invoice
          </p>
          <p className="mt-[3mm] font-mono text-[11pt] font-bold">{invoice.id}</p>
          <p className="font-mono text-[9pt] font-bold text-[var(--invoice-brand)]">
            {invoice.shipmentId}
          </p>
          <p className="text-[var(--invoice-muted)]">
            Issued <span className="font-semibold text-[var(--invoice-ink)]">{formatDate(invoice.issuedAt)}</span>
          </p>
          <p className="text-[var(--invoice-muted)]">
            Due <span className="font-semibold text-[var(--invoice-ink)]">{formatDate(invoice.dueAt)}</span>
          </p>
          <p className="text-[var(--invoice-muted)]">Terms: {termsDays} days</p>
        </div>
      </header>

      {/* ── Parties ────────────────────────────────────────────────────── */}
      <section className="grid gap-6 px-[14mm] pt-[8mm] sm:grid-cols-2">
        <div>
          <p className="text-[8pt] font-extrabold uppercase tracking-[0.12em] text-[var(--invoice-faint)]">
            Billed to
          </p>
          <p className="mt-[2mm] text-[12pt] font-extrabold text-[var(--invoice-ink)]">{clientName}</p>
          {shipmentReference ? (
            <p className="text-[9pt] text-[var(--invoice-muted)]">
              Your reference {shipmentReference}
            </p>
          ) : null}
        </div>
        <div className="sm:text-right">
          <p className="text-[8pt] font-extrabold uppercase tracking-[0.12em] text-[var(--invoice-faint)]">
            Amount due
          </p>
          <p className="mt-[2mm] font-mono text-[18pt] font-extrabold tabular-nums text-[var(--invoice-ink)]">
            {fmtDjfPlain(invoice.amountDjf)} DJF
          </p>
          {invoice.paidAt ? (
            <p className="text-[9pt] font-bold text-[var(--invoice-settled)]">
              Settled {formatDate(invoice.paidAt)}
            </p>
          ) : null}
        </div>
      </section>

      {/*
        The statement of delivery. The user's brief for this document was
        literally a sentence: "we delivered for you this shipment, which has
        all of these bookings, and the total of the amount." It goes above the
        table so the document says what it is before it proves it.
      */}
      <section className="px-[14mm] pt-[8mm]">
        <div className="rounded-[2mm] border border-[var(--invoice-rule)] bg-[var(--invoice-wash)] px-[4mm] py-[3.5mm]">
          <p className="text-[9.5pt] leading-[1.6] text-[var(--invoice-ink)]">
            Delivered under shipment{' '}
            <span className="font-mono font-bold">{invoice.shipmentId}</span>
            {shipmentReference ? (
              <>
                {' '}(your reference <span className="font-mono font-bold">{shipmentReference}</span>)
              </>
            ) : null}
            :{' '}
            <span className="font-bold">
              {bookings.length} booking{bookings.length === 1 ? '' : 's'}
            </span>{' '}
            completed and signed for, itemised below.
          </p>
        </div>
      </section>

      {/* ── Lines ──────────────────────────────────────────────────────── */}
      <section className="px-[14mm] pt-[5mm]">
        <table className="w-full border-collapse text-[9pt]">
          <thead>
            <tr className="bg-[var(--invoice-wash)]">
              <th className="border-b border-[var(--invoice-rule)] px-[3mm] py-[2.5mm] text-left text-[8pt] font-extrabold uppercase tracking-[0.08em] text-[var(--invoice-muted)]">
                Description
              </th>
              <th className="border-b border-[var(--invoice-rule)] px-[3mm] py-[2.5mm] text-left text-[8pt] font-extrabold uppercase tracking-[0.08em] text-[var(--invoice-muted)]">
                Route
              </th>
              <th className="border-b border-[var(--invoice-rule)] px-[3mm] py-[2.5mm] text-left text-[8pt] font-extrabold uppercase tracking-[0.08em] text-[var(--invoice-muted)]">
                Booking
              </th>
              <th className="border-b border-[var(--invoice-rule)] px-[3mm] py-[2.5mm] text-right text-[8pt] font-extrabold uppercase tracking-[0.08em] text-[var(--invoice-muted)]">
                Amount (DJF)
              </th>
            </tr>
          </thead>
          <tbody>
            {lines ? (
              lines.map((booking) => (
                <tr key={booking.id}>
                  <td className="border-b border-[var(--invoice-rule-soft)] px-[3mm] py-[3mm] align-top">
                    <span className="font-bold">{booking.cargoSummary}</span>
                    <span className="block text-[8pt] text-[var(--invoice-muted)]">
                      Inland freight
                      {booking.containerNumber ? ` · ${booking.containerNumber}` : ''}
                    </span>
                  </td>
                  <td className="border-b border-[var(--invoice-rule-soft)] px-[3mm] py-[3mm] align-top text-[var(--invoice-muted)]">
                    {booking.origin} → {booking.destination}
                  </td>
                  <td className="border-b border-[var(--invoice-rule-soft)] px-[3mm] py-[3mm] align-top font-mono text-[8pt]">
                    {booking.id}
                  </td>
                  <td className="border-b border-[var(--invoice-rule-soft)] px-[3mm] py-[3mm] text-right align-top font-mono font-bold tabular-nums">
                    {booking.clientRateDjf !== null ? fmtDjfPlain(booking.clientRateDjf) : '—'}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="border-b border-[var(--invoice-rule-soft)] px-[3mm] py-[3mm] text-[var(--invoice-muted)]">
                  Freight services as agreed
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="px-[3mm] py-[2mm] text-right text-[var(--invoice-muted)]">
                Subtotal
              </td>
              <td className="px-[3mm] py-[2mm] text-right font-mono font-bold tabular-nums">
                {fmtDjfPlain(
                  linesAreComplete
                    ? priced.reduce((sum, booking) => sum + (booking.clientRateDjf ?? 0), 0)
                    : invoice.amountDjf,
                )}
              </td>
            </tr>
            {/*
             * No VAT line is invented here. Whether these services carry tax
             * in Djibouti is a question nobody has answered for this build, and
             * an invoice that states a rate it made up is worse than one that
             * says nothing. Add the row once the rate is confirmed.
             */}
            <tr>
              <td
                colSpan={3}
                className="border-t-2 border-[var(--invoice-brand)] px-[3mm] py-[3mm] text-right text-[10pt] font-extrabold uppercase tracking-wide"
              >
                Total due · {bookings.length} booking{bookings.length === 1 ? '' : 's'}
              </td>
              <td className="border-t-2 border-[var(--invoice-brand)] px-[3mm] py-[3mm] text-right font-mono text-[13pt] font-extrabold tabular-nums">
                {fmtDjfPlain(invoice.amountDjf)}
              </td>
            </tr>
          </tfoot>
        </table>

        <p className="mt-[3mm] text-[8.5pt] italic text-[var(--invoice-muted)]">
          {amountInWords(invoice.amountDjf)}
        </p>
      </section>

      {/* ── Payment + stamp ────────────────────────────────────────────── */}
      <section className="grid gap-6 px-[14mm] pt-[9mm] sm:grid-cols-2">
        <div>
          <p className="text-[8pt] font-extrabold uppercase tracking-[0.12em] text-[var(--invoice-faint)]">
            Payable to
          </p>
          <dl className="mt-[2mm] text-[9pt] leading-[1.7]">
            <PayRow label="Bank" value={COMPANY.bank.name} />
            <PayRow label="Account name" value={COMPANY.bank.accountName} />
            <PayRow label="Account" value={COMPANY.bank.accountNumber} mono />
            <PayRow label="SWIFT" value={COMPANY.bank.swift} mono />
          </dl>
          <p className="mt-[3mm] text-[8pt] text-[var(--invoice-muted)]">
            Please quote <span className="font-mono font-bold">{invoice.id}</span> as the payment
            reference.
          </p>
        </div>

        {/* The stamp block: a real box left empty on purpose, sized for a
            company stamp to be applied over the signature line. */}
        <div className="flex flex-col items-end justify-end">
          <div className="w-full max-w-[70mm]">
            <div className="h-[30mm] rounded-[2mm] border-[1.5px] border-dashed border-[var(--invoice-rule)]" />
            <div className="mt-[2mm] border-t border-[var(--invoice-ink)] pt-[1.5mm] text-center text-[8pt] font-semibold text-[var(--invoice-muted)]">
              Signature &amp; company stamp
            </div>
            <p className="mt-[1mm] text-center text-[8pt] text-[var(--invoice-faint)]">
              For and on behalf of {COMPANY.legalName}
            </p>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="mt-[10mm] border-t border-[var(--invoice-rule)] px-[14mm] py-[6mm]">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 text-[8pt] text-[var(--invoice-muted)]">
          <span className="flex items-center gap-2">
            <img src={COMPANY.markSrc} alt="" className="h-[5mm] w-auto object-contain" />
            <span className="font-bold text-[var(--invoice-ink)]">{COMPANY.legalName}</span>
          </span>
          <span>{COMPANY.registration.tradeRegister}</span>
          <span>{COMPANY.registration.taxId}</span>
          <span>{COMPANY.contact.phone}</span>
          <span>{COMPANY.contact.email}</span>
          <span>{COMPANY.contact.website}</span>
        </div>
        <p className="mt-[2mm] text-center text-[7.5pt] text-[var(--invoice-faint)]">
          This invoice is issued electronically and is valid without a handwritten signature unless
          stamped above.
        </p>
      </footer>
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

// The document date format lives in `@/lib/finance` so the invoice and the
// transporter's voucher can never drift apart on how they print a date.
const formatDate = fmtDocDate;

export default InvoiceDocumentPage;
