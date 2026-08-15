import { Link, useParams } from 'react-router-dom';

import { ROUTES, buildPath } from '@/config/routes';
import { ArrowLeft, Printer } from '@/design-system/icons';
import { useSystemSettings } from '@/features/settings';
import { amountInWords, fmtDjfPlain, fmtDocDate } from '@/lib/finance';
import { usePaymentOrder } from '@/features/finance';
import type { PaymentOrderRecord } from '@/features/finance';
import { useBookingsForShipment } from '@/features/bookings/api/queries';
import type { BookingRecord } from '@/features/bookings/api/bookingsService';
import { useShipmentRaw } from '@/features/shipments/api/queries';

import { ActionButton, EmptyState, Panel, Pill } from './components/kit';
import {
  DocumentFooter,
  DocumentLetterhead,
  DocumentSignatureBlock,
  DocumentStampWatermark,
} from './components/documentChrome';

/**
 * THE TRANSPORTER'S DOCUMENT: one voucher for one transporter, one shipment.
 *
 * Real `PaymentOrder` carries no signing field, so nothing here records that a
 * transporter acknowledged receipt — the document prints the signatories
 * configured under Settings → Documents and leaves a rule for the transporter's
 * own signature. It still carries the one idea the user asked for: a
 * transporter who hauls ten of a shipment's bookings is paid ONCE for all ten,
 * one voucher, not ten.
 */
export function PaymentVoucherPage() {
  const { paymentId = '' } = useParams();
  const { data: payment, isLoading } = usePaymentOrder(paymentId);
  const { data: shipment } = useShipmentRaw(payment?.missionId);
  const { data: bookingsData } = useBookingsForShipment(payment?.missionId);

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-[1600px] px-4 pt-6 sm:px-6">
        <Panel title="Loading…">
          <EmptyState message="Fetching this voucher." />
        </Panel>
      </div>
    );
  }

  if (!payment) {
    return (
      <div className="mx-auto w-full max-w-[1600px] px-4 pt-6 sm:px-6">
        <Panel title="Voucher not found">
          <EmptyState message="No payment with that reference." />
        </Panel>
      </div>
    );
  }

  const bookings = (bookingsData ?? []).filter((b) => b.partnerId === payment.transporterId);

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 px-4 pb-8 pt-1 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link to={buildPath(ROUTES.financeShipmentDetail, { shipmentId: payment.missionId })} className="w-fit">
          <ActionButton variant="quiet" icon={ArrowLeft}>
            {shipment?.reference ?? payment.missionId}
          </ActionButton>
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="teal">Paid {payment.paidAt ? fmtDocDate(payment.paidAt) : ''}</Pill>
          <ActionButton variant="primary" icon={Printer} onClick={() => window.print()}>
            Print / PDF
          </ActionButton>
        </div>
      </div>

      <VoucherSheet payment={payment} bookings={bookings} shipmentReference={shipment?.reference} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * The sheet
 * ═══════════════════════════════════════════════════════════════════════ */

export function VoucherSheet({
  payment,
  bookings,
  shipmentReference,
}: {
  payment: PaymentOrderRecord;
  bookings: BookingRecord[];
  shipmentReference?: string;
}) {
  const documents = useSystemSettings().documents;
  const count = bookings.length;
  const amount = Number(payment.amountMinorUnits);

  return (
    <article className="invoice-sheet relative mx-auto w-full shadow-card print:shadow-none">
      <DocumentStampWatermark document="voucher" />

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-start justify-between gap-6 border-b-[3px] border-[var(--invoice-brand)] px-[14mm] pb-[8mm] pt-[12mm]">
        <DocumentLetterhead />

        <div className="text-right text-[9pt] leading-[1.6]">
          <p className="text-[17pt] font-extrabold uppercase leading-none tracking-[0.08em] text-[var(--invoice-brand)]">Payment voucher</p>
          <p className="mt-[3mm] font-mono text-[11pt] font-bold">{payment.number}</p>
          <p className="font-mono text-[9pt] font-bold text-[var(--invoice-brand)]">{shipmentReference ?? payment.missionId}</p>
          <p className="text-[var(--invoice-muted)]">
            Paid <span className="font-semibold text-[var(--invoice-ink)]">{payment.paidAt ? fmtDocDate(payment.paidAt) : '—'}</span>
          </p>
          <p className="text-[var(--invoice-muted)]">
            By <span className="font-semibold text-[var(--invoice-ink)]">{payment.paymentMethod ?? 'bank transfer'}</span>
          </p>
        </div>
      </header>

      {/* ── Parties ────────────────────────────────────────────────────── */}
      <section className="grid gap-6 px-[14mm] pt-[8mm] sm:grid-cols-2">
        <div>
          <p className="text-[8pt] font-extrabold uppercase tracking-[0.12em] text-[var(--invoice-faint)]">Paid to</p>
          <p className="mt-[2mm] text-[12pt] font-extrabold text-[var(--invoice-ink)]">{payment.transporterName}</p>
          <p className="text-[9pt] text-[var(--invoice-muted)]">{payment.transporterCompany}</p>
        </div>
        <div className="sm:text-right">
          <p className="text-[8pt] font-extrabold uppercase tracking-[0.12em] text-[var(--invoice-faint)]">Amount paid</p>
          <p className="mt-[2mm] font-mono text-[18pt] font-extrabold tabular-nums text-[var(--invoice-ink)]">
            {fmtDjfPlain(amount)} {payment.currency}
          </p>
        </div>
      </section>

      <section className="px-[14mm] pt-[8mm]">
        <div className="rounded-[2mm] border border-[var(--invoice-rule)] bg-[var(--invoice-wash)] px-[4mm] py-[3.5mm]">
          <p className="text-[9.5pt] leading-[1.6] text-[var(--invoice-ink)]">
            Payment for <span className="font-bold">{count} booking{count === 1 ? '' : 's'}</span> delivered under shipment{' '}
            <span className="font-mono font-bold">{shipmentReference ?? payment.missionId}</span>. This voucher settles every one of them
            in a single transfer — there is no separate payment per booking.
          </p>
        </div>
      </section>

      {/* ── Lines ──────────────────────────────────────────────────────── */}
      <section className="px-[14mm] pt-[5mm]">
        <table className="w-full border-collapse text-[9pt]">
          <thead>
            <tr className="bg-[var(--invoice-wash)]">
              <th className="border-b border-[var(--invoice-rule)] px-[3mm] py-[2.5mm] text-left text-[8pt] font-extrabold uppercase tracking-[0.08em] text-[var(--invoice-muted)]">Booking</th>
              <th className="border-b border-[var(--invoice-rule)] px-[3mm] py-[2.5mm] text-left text-[8pt] font-extrabold uppercase tracking-[0.08em] text-[var(--invoice-muted)]">Container</th>
              <th className="border-b border-[var(--invoice-rule)] px-[3mm] py-[2.5mm] text-left text-[8pt] font-extrabold uppercase tracking-[0.08em] text-[var(--invoice-muted)]">Status</th>
              <th className="border-b border-[var(--invoice-rule)] px-[3mm] py-[2.5mm] text-right text-[8pt] font-extrabold uppercase tracking-[0.08em] text-[var(--invoice-muted)]">Amount</th>
            </tr>
          </thead>
          <tbody>
            {bookings.length > 0 ? (
              bookings.map((booking) => (
                <tr key={booking.id}>
                  <td className="border-b border-[var(--invoice-rule-soft)] px-[3mm] py-[3mm] align-top font-mono text-[8pt] font-bold">{booking.reference}</td>
                  <td className="border-b border-[var(--invoice-rule-soft)] px-[3mm] py-[3mm] align-top font-mono text-[8pt]">{booking.containerNumber ?? '—'}</td>
                  <td className="border-b border-[var(--invoice-rule-soft)] px-[3mm] py-[3mm] align-top text-[var(--invoice-muted)]">{booking.status}</td>
                  <td className="border-b border-[var(--invoice-rule-soft)] px-[3mm] py-[3mm] text-right align-top font-mono font-bold tabular-nums">
                    {booking.transporterCostMinorUnits != null ? fmtDjfPlain(Number(booking.transporterCostMinorUnits)) : '—'}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="border-b border-[var(--invoice-rule-soft)] px-[3mm] py-[3mm] text-[var(--invoice-muted)]">
                  Transport services as agreed
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="border-t-2 border-[var(--invoice-brand)] px-[3mm] py-[3mm] text-right text-[10pt] font-extrabold uppercase tracking-wide">
                Total paid · {count} booking{count === 1 ? '' : 's'}
              </td>
              <td className="border-t-2 border-[var(--invoice-brand)] px-[3mm] py-[3mm] text-right font-mono text-[13pt] font-extrabold tabular-nums">
                {fmtDjfPlain(amount)}
              </td>
            </tr>
          </tfoot>
        </table>

        <p className="mt-[3mm] text-[8.5pt] italic text-[var(--invoice-muted)]">{amountInWords(amount)}</p>
      </section>

      {/* ── Payment details + signature ────────────────────────────────── */}
      <section className="grid gap-6 px-[14mm] pt-[9mm] sm:grid-cols-2">
        <div>
          <p className="text-[8pt] font-extrabold uppercase tracking-[0.12em] text-[var(--invoice-faint)]">Payment details</p>
          <dl className="mt-[2mm] text-[9pt] leading-[1.7]">
            <PayRow label="Method" value={payment.paymentMethod ?? 'bank transfer'} />
            <PayRow label="Date" value={payment.paidAt ? fmtDocDate(payment.paidAt) : '—'} />
            <PayRow label="Approved by" value={payment.approvedByName ?? '—'} />
          </dl>
          <p className="mt-[3mm] text-[8pt] text-[var(--invoice-muted)]">
            Quote <span className="font-mono font-bold">{payment.number}</span> in any query about this payment.
          </p>
          {documents.voucherTerms ? (
            <p className="mt-[3mm] max-w-[80mm] text-[8pt] leading-[1.55] text-[var(--invoice-faint)]">
              {documents.voucherTerms}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col items-end justify-end">
          <DocumentSignatureBlock document="voucher" />
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <DocumentFooter note="This voucher covers every booking listed and settles them in one payment." />
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
