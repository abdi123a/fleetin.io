import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { COMPANY, COMPANY_ADDRESS_LINES } from '@/config/company';
import { ROUTES } from '@/config/routes';
import { ArrowLeft, Printer } from '@/design-system/icons';
import { amountInWords, fmtDjfPlain, fmtDocDate } from '@/lib/finance';
import { useFinanceStore } from '@/stores/finance.store';
import type { FinanceBooking, ShipmentPayment } from '@/types/finance';

import { PAYMENT_METHOD_LABEL, SignVoucherDialog } from './components/dialogs';
import { ActionButton, EmptyState, Panel, Pill } from './components/kit';
import { useFinanceModel } from './model';

/**
 * THE TRANSPORTER'S DOCUMENT: one voucher for one transporter, one shipment.
 *
 * The counterpart to the client invoice, and the second half of what the user
 * asked for: "it should have a shipment ID and the total of the bookings you
 * delivered, and then we sign him." So it says, in the haulier's own terms:
 * you carried these ten containers on shipment SHI-#####, here they are by
 * number, here is the total, sign here.
 *
 * Why it is shipment-scoped and not per container: a transporter who hauls ten
 * of a consignment's twenty boxes is paid ONCE for all ten. Ten vouchers for
 * one transfer would be ten signatures for one act, and would make the bank
 * statement impossible to reconcile against the paperwork.
 *
 * The signature block is not decoration. Money leaves on Monday and the signed
 * sheet comes back on Thursday; until it does, the voucher prints UNSIGNED and
 * the desk can see the gap. `acknowledgedAt` closes it, and the sheet then
 * prints the name and date over the line.
 *
 * Same paper as the invoice — `.invoice-sheet` in index.css — so the two
 * documents are visibly one house's stationery.
 */
export function PaymentVoucherPage() {
  const model = useFinanceModel();
  const { paymentId = '' } = useParams();
  const acknowledgePayment = useFinanceStore((state) => state.acknowledgePayment);
  const [signing, setSigning] = useState(false);

  const payment = model.paymentById.get(paymentId);
  if (!payment) {
    return (
      <div className="mx-auto w-full max-w-[1600px] px-4 pt-6 sm:px-6">
        <Panel title="Voucher not found">
          <EmptyState message="No payment with that reference." />
        </Panel>
      </div>
    );
  }

  const shipmentRow = model.shipmentById.get(payment.shipmentId);
  /*
   * The lines are rebuilt from the cost lines STAMPED with this voucher's id,
   * not from the live settlement. A settlement is a running position — it moves
   * as more of the shipment is paid — and a document must say what it said the
   * day it was signed.
   */
  const lines = payment.bookingIds
    .map((id) => model.bookingById.get(id)?.booking)
    .filter((booking): booking is FinanceBooking => booking !== undefined)
    .map((booking) => ({
      booking,
      amountDjf: booking.costLines
        .filter(
          (line) =>
            line.counterpartyId === payment.transporterId &&
            (line.paymentId === payment.id || line.paymentId === undefined),
        )
        .reduce((sum, line) => sum + line.amountDjf, 0),
    }));

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 px-4 pb-8 pt-1 sm:px-6">
      {/* Toolbar — screen only. */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <Link to={`${ROUTES.financeShipments}/shipment/${payment.shipmentId}`} className="w-fit">
            <ActionButton variant="quiet" icon={ArrowLeft}>
              {payment.shipmentId}
            </ActionButton>
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {payment.acknowledgedAt ? (
            <Pill tone="teal">
              Signed by {payment.acknowledgedBy} · {fmtDocDate(payment.acknowledgedAt)}
            </Pill>
          ) : (
            <>
              <Pill tone="orange">Not signed back</Pill>
              <ActionButton variant="ghost" onClick={() => setSigning(true)}>
                Record signature
              </ActionButton>
            </>
          )}
          <ActionButton variant="primary" icon={Printer} onClick={() => window.print()}>
            Print / PDF
          </ActionButton>
        </div>
      </div>

      <VoucherSheet
        payment={payment}
        lines={lines}
        shipmentReference={shipmentRow?.shipment.reference}
        clientName={shipmentRow?.client?.name}
      />

      <SignVoucherDialog
        open={signing}
        onClose={() => setSigning(false)}
        paymentId={payment.id}
        transporterName={payment.transporterName}
        amountDjf={payment.amountDjf}
        bookingsCount={payment.bookingIds.length}
        onSign={(signedBy) => acknowledgePayment(payment.id, signedBy)}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * The sheet
 * ═══════════════════════════════════════════════════════════════════════ */

export interface VoucherLine {
  booking: FinanceBooking;
  amountDjf: number;
}

/**
 * A4 at 210mm, in millimetres like the invoice, because both are paper.
 *
 * The visual difference from the invoice is deliberate and small: the accent
 * rule is the same house colour, but the document is headed PAYMENT VOUCHER
 * and the largest figure on the page is what is being PAID OUT rather than
 * what is owed in. Someone holding both should be able to tell them apart at
 * arm's length without reading a word.
 */
export function VoucherSheet({
  payment,
  lines,
  shipmentReference,
  clientName,
}: {
  payment: ShipmentPayment;
  lines: VoucherLine[];
  shipmentReference?: string;
  clientName?: string;
}) {
  const count = payment.bookingIds.length;
  // Only trust the line sum when every covered booking resolved to an amount;
  // otherwise the stored total stands alone rather than being reconstructed
  // from a partial set — the same rule the invoice follows.
  const lineSum = lines.reduce((sum, line) => sum + line.amountDjf, 0);
  const linesAreComplete = lines.length === count && lineSum > 0;

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
          <p className="text-[17pt] font-extrabold uppercase leading-none tracking-[0.08em] text-[var(--invoice-brand)]">
            Payment voucher
          </p>
          <p className="mt-[3mm] font-mono text-[11pt] font-bold">{payment.id}</p>
          <p className="font-mono text-[9pt] font-bold text-[var(--invoice-brand)]">
            {payment.shipmentId}
          </p>
          <p className="text-[var(--invoice-muted)]">
            Paid{' '}
            <span className="font-semibold text-[var(--invoice-ink)]">
              {fmtDocDate(payment.paidAt)}
            </span>
          </p>
          <p className="text-[var(--invoice-muted)]">
            By{' '}
            <span className="font-semibold text-[var(--invoice-ink)]">
              {PAYMENT_METHOD_LABEL[payment.paidVia]}
            </span>
          </p>
        </div>
      </header>

      {/* ── Parties ────────────────────────────────────────────────────── */}
      <section className="grid gap-6 px-[14mm] pt-[8mm] sm:grid-cols-2">
        <div>
          <p className="text-[8pt] font-extrabold uppercase tracking-[0.12em] text-[var(--invoice-faint)]">
            Paid to
          </p>
          <p className="mt-[2mm] text-[12pt] font-extrabold text-[var(--invoice-ink)]">
            {payment.transporterName}
          </p>
          <p className="font-mono text-[9pt] text-[var(--invoice-muted)]">
            {payment.transporterId}
          </p>
        </div>
        <div className="sm:text-right">
          <p className="text-[8pt] font-extrabold uppercase tracking-[0.12em] text-[var(--invoice-faint)]">
            Amount paid
          </p>
          <p className="mt-[2mm] font-mono text-[18pt] font-extrabold tabular-nums text-[var(--invoice-ink)]">
            {fmtDjfPlain(payment.amountDjf)} DJF
          </p>
          {payment.paymentRef ? (
            <p className="font-mono text-[9pt] text-[var(--invoice-muted)]">
              Ref {payment.paymentRef}
            </p>
          ) : null}
        </div>
      </section>

      {/*
        The statement of work, in the words the user used for it: you delivered
        this many bookings on this shipment, and this is the one payment that
        covers all of them. It sits above the table so the sheet says what it is
        before it itemises.
      */}
      <section className="px-[14mm] pt-[8mm]">
        <div className="rounded-[2mm] border border-[var(--invoice-rule)] bg-[var(--invoice-wash)] px-[4mm] py-[3.5mm]">
          <p className="text-[9.5pt] leading-[1.6] text-[var(--invoice-ink)]">
            Payment for{' '}
            <span className="font-bold">
              {count} booking{count === 1 ? '' : 's'}
            </span>{' '}
            delivered under shipment{' '}
            <span className="font-mono font-bold">{payment.shipmentId}</span>
            {shipmentReference ? (
              <>
                {' '}(reference <span className="font-mono font-bold">{shipmentReference}</span>)
              </>
            ) : null}
            {clientName ? ` for ${clientName}` : ''}. This voucher settles every one of them in a
            single transfer — there is no separate payment per container.
          </p>
        </div>
      </section>

      {/* ── Lines ──────────────────────────────────────────────────────── */}
      <section className="px-[14mm] pt-[5mm]">
        <table className="w-full border-collapse text-[9pt]">
          <thead>
            <tr className="bg-[var(--invoice-wash)]">
              <th className="border-b border-[var(--invoice-rule)] px-[3mm] py-[2.5mm] text-left text-[8pt] font-extrabold uppercase tracking-[0.08em] text-[var(--invoice-muted)]">
                Booking
              </th>
              <th className="border-b border-[var(--invoice-rule)] px-[3mm] py-[2.5mm] text-left text-[8pt] font-extrabold uppercase tracking-[0.08em] text-[var(--invoice-muted)]">
                Container
              </th>
              <th className="border-b border-[var(--invoice-rule)] px-[3mm] py-[2.5mm] text-left text-[8pt] font-extrabold uppercase tracking-[0.08em] text-[var(--invoice-muted)]">
                Route
              </th>
              <th className="border-b border-[var(--invoice-rule)] px-[3mm] py-[2.5mm] text-left text-[8pt] font-extrabold uppercase tracking-[0.08em] text-[var(--invoice-muted)]">
                Delivered
              </th>
              <th className="border-b border-[var(--invoice-rule)] px-[3mm] py-[2.5mm] text-right text-[8pt] font-extrabold uppercase tracking-[0.08em] text-[var(--invoice-muted)]">
                Amount (DJF)
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.length > 0 ? (
              lines.map(({ booking, amountDjf }) => (
                <tr key={booking.id}>
                  <td className="border-b border-[var(--invoice-rule-soft)] px-[3mm] py-[3mm] align-top font-mono text-[8pt] font-bold">
                    {booking.id}
                  </td>
                  <td className="border-b border-[var(--invoice-rule-soft)] px-[3mm] py-[3mm] align-top font-mono text-[8pt]">
                    {booking.containerNumber ?? '—'}
                  </td>
                  <td className="border-b border-[var(--invoice-rule-soft)] px-[3mm] py-[3mm] align-top text-[var(--invoice-muted)]">
                    {booking.origin} → {booking.destination}
                  </td>
                  <td className="border-b border-[var(--invoice-rule-soft)] px-[3mm] py-[3mm] align-top text-[var(--invoice-muted)]">
                    {booking.proof.podSentAt ? fmtDocDate(booking.proof.podSentAt) : '—'}
                  </td>
                  <td className="border-b border-[var(--invoice-rule-soft)] px-[3mm] py-[3mm] text-right align-top font-mono font-bold tabular-nums">
                    {amountDjf > 0 ? fmtDjfPlain(amountDjf) : '—'}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={5}
                  className="border-b border-[var(--invoice-rule-soft)] px-[3mm] py-[3mm] text-[var(--invoice-muted)]"
                >
                  Transport services as agreed
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td
                colSpan={4}
                className="px-[3mm] py-[2mm] text-right text-[var(--invoice-muted)]"
              >
                Subtotal
              </td>
              <td className="px-[3mm] py-[2mm] text-right font-mono font-bold tabular-nums">
                {fmtDjfPlain(linesAreComplete ? lineSum : payment.amountDjf)}
              </td>
            </tr>
            <tr>
              <td
                colSpan={4}
                className="border-t-2 border-[var(--invoice-brand)] px-[3mm] py-[3mm] text-right text-[10pt] font-extrabold uppercase tracking-wide"
              >
                Total paid · {count} booking{count === 1 ? '' : 's'}
              </td>
              <td className="border-t-2 border-[var(--invoice-brand)] px-[3mm] py-[3mm] text-right font-mono text-[13pt] font-extrabold tabular-nums">
                {fmtDjfPlain(payment.amountDjf)}
              </td>
            </tr>
          </tfoot>
        </table>

        <p className="mt-[3mm] text-[8.5pt] italic text-[var(--invoice-muted)]">
          {amountInWords(payment.amountDjf)}
        </p>
      </section>

      {/* ── How it was paid + the signature ────────────────────────────── */}
      <section className="grid gap-6 px-[14mm] pt-[9mm] sm:grid-cols-2">
        <div>
          <p className="text-[8pt] font-extrabold uppercase tracking-[0.12em] text-[var(--invoice-faint)]">
            Payment details
          </p>
          <dl className="mt-[2mm] text-[9pt] leading-[1.7]">
            <PayRow label="Method" value={PAYMENT_METHOD_LABEL[payment.paidVia]} />
            <PayRow label="Date" value={fmtDocDate(payment.paidAt)} />
            <PayRow label="Reference" value={payment.paymentRef ?? '—'} mono />
            <PayRow label="Released by" value={payment.paidBy} />
          </dl>
          <p className="mt-[3mm] text-[8pt] text-[var(--invoice-muted)]">
            Quote <span className="font-mono font-bold">{payment.id}</span> in any query about this
            payment.
          </p>
        </div>

        {/*
          The receipt half. An unsigned voucher prints an empty ruled box for a
          wet signature; once the signed sheet is back, the same box prints the
          name and the date it was collected, so the two states are the same
          document rather than two layouts.
        */}
        <div className="flex flex-col items-end justify-end">
          <div className="w-full max-w-[75mm]">
            <p className="text-[8pt] font-extrabold uppercase tracking-[0.12em] text-[var(--invoice-faint)]">
              Received in full
            </p>
            <div className="mt-[2mm] flex h-[26mm] flex-col items-center justify-center rounded-[2mm] border-[1.5px] border-dashed border-[var(--invoice-rule)] px-[3mm] text-center">
              {payment.acknowledgedAt ? (
                <>
                  <p className="text-[11pt] font-extrabold text-[var(--invoice-ink)]">
                    {payment.acknowledgedBy}
                  </p>
                  <p className="text-[8pt] text-[var(--invoice-muted)]">
                    Signed {fmtDocDate(payment.acknowledgedAt)}
                  </p>
                </>
              ) : (
                <p className="text-[8pt] text-[var(--invoice-faint)]">
                  To be signed on collection
                </p>
              )}
            </div>
            <div className="mt-[2mm] border-t border-[var(--invoice-ink)] pt-[1.5mm] text-center text-[8pt] font-semibold text-[var(--invoice-muted)]">
              Signature &amp; stamp — {payment.transporterName}
            </div>
            <p className="mt-[1mm] text-center text-[8pt] text-[var(--invoice-faint)]">
              I confirm receipt of {fmtDjfPlain(payment.amountDjf)} DJF in full settlement of the{' '}
              {count} booking{count === 1 ? '' : 's'} listed above.
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
        </div>
        <p className="mt-[2mm] text-center text-[7.5pt] text-[var(--invoice-faint)]">
          This voucher covers every booking listed and settles them in one payment. Retain the
          signed copy — it is the receipt for the whole shipment, not for any single container.
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

export default PaymentVoucherPage;
