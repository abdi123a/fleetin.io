import { Link, useParams } from 'react-router-dom';

import { ROUTES, buildPath } from '@/config/routes';
import { IconChip } from '@/design-system';
import { ArrowLeft, Banknote, CircleCheck, Clock, Container, MapPin, Receipt } from '@/design-system/icons';
import { fmtDjf } from '@/lib/finance';
import { useBooking } from '@/features/bookings/api/queries';

import {
  ActionButton,
  Avatar,
  BookingStageChip,
  EmptyState,
  MoneyAmount,
  PageHead,
  Panel,
  Pill,
  StageChip,
} from './components/kit';
import { Econ } from './FinanceShipmentPage';
import { bookingStage, useShipmentFinanceDetail } from './shipmentFinance';

/**
 * ONE BOOKING — and deliberately no way to pay it.
 *
 * The booking owns delivery: where it went, who hauled it, what it cost. It
 * owns no payment control — a transporter who carried ten of this shipment's
 * bookings is paid once for all ten, one tier up. Proof of delivery is no
 * longer confirmed here either: real status advancement (Pending → ... →
 * POD Submitted → Completed) already happens in Operations
 * (`BookingPreviewSheet.tsx`); this page only reads the resulting status and
 * the shipment's real timeline. There is no per-booking client price or
 * cost-line breakdown in the real model — only the one transporter cost this
 * booking was auto-priced at.
 */
export function FinanceBookingPage() {
  const { bookingId = '' } = useParams();
  const bookingQuery = useBooking(bookingId);
  const booking = bookingQuery.data;
  const shipmentDetail = useShipmentFinanceDetail(booking?.shipmentId);

  if (bookingQuery.isLoading || shipmentDetail.isLoading) {
    return (
      <div className="mx-auto w-full max-w-[1600px] px-4 pt-6 sm:px-6">
        <Panel title="Loading…">
          <EmptyState message="Loading booking…" />
        </Panel>
      </div>
    );
  }

  if (!booking || !shipmentDetail.shipment) {
    return (
      <div className="mx-auto w-full max-w-[1600px] px-4 pt-6 sm:px-6">
        <Panel title="Booking not found">
          <EmptyState message="No booking with that reference." />
        </Panel>
      </div>
    );
  }

  const { shipment, settlements, invoice, stage, held } = shipmentDetail;
  const shipmentHref = buildPath(ROUTES.financeShipmentDetail, { shipmentId: shipment.id });
  const settlement = booking.partnerId ? settlements.find((s) => s.partnerId === booking.partnerId) : undefined;
  const proven = bookingStage(booking) === 'proven';

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-4 pb-8 pt-1 sm:px-6">
      <Link to={shipmentHref} className="w-fit">
        <ActionButton variant="quiet" icon={ArrowLeft}>
          {shipment.reference}
        </ActionButton>
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHead
          title={booking.reference}
          subtitle={booking.containerNumber ? `${booking.containerNumber} · ${booking.cargoType}` : booking.cargoType}
          badge={<BookingStageChip stage={bookingStage(booking)} />}
        />
        <Pill tone="neutral" icon={Container}>
          On {shipment.reference}
        </Pill>
      </div>

      {/* Route + who hauled it */}
      <div className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-card px-5 py-4 shadow-card">
        <MapPin aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-foreground">
          <span>{shipment.pickupLocationCity}</span>
          <span className="text-muted-foreground">→</span>
          <span>{shipment.deliveryLocationCity}</span>
        </div>
        {booking.partner ? (
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-2">
              <Avatar name={booking.partner.companyLegalName} size={24} />
              <span className="text-sm font-bold text-foreground">{booking.partner.companyLegalName}</span>
            </span>
          </div>
        ) : null}
      </div>

      {/* Money moves on the shipment, not on this booking */}
      <div className="flex flex-wrap items-center gap-4 rounded-card border border-primary/30 bg-primary-subtle/30 px-5 py-4">
        <IconChip icon={Banknote} tint="teal" size={44} />
        <div className="min-w-[14rem] flex-1">
          <p className="text-sm font-bold text-foreground">Money moves on the shipment, not on this booking</p>
          <p className="mt-0.5 text-xs font-semibold leading-relaxed text-muted-foreground">
            {settlement
              ? `${settlement.partnerName} carried ${settlement.bookingsCount} booking${
                  settlement.bookingsCount === 1 ? '' : 's'
                } on ${shipment.reference} and is paid ${fmtDjf(settlement.totalMinorUnits)} once, in a single transfer — not ${
                  settlement.bookingsCount
                } separate payments.`
              : `Release and settlement for this booking are decided on ${shipment.reference}.`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StageChip stage={stage} held={held} />
          <Link to={shipmentHref}>
            <ActionButton variant="primary" icon={Receipt}>
              Open shipment
            </ActionButton>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {/* ── Status — read-only, advanced from Operations ────────────────── */}
        <Panel
          className="xl:col-span-2"
          title="Delivery Status"
          subtitle="Read-only, advanced from Operations"
          action={
            proven ? (
              <Pill tone="teal" icon={CircleCheck}>
                {booking.status}
              </Pill>
            ) : (
              <Pill tone="neutral" icon={Clock}>
                {booking.status}
              </Pill>
            )
          }
        >
          {booking.timeline && booking.timeline.length > 0 ? (
            <div className="flex flex-col gap-2">
              {booking.timeline.map((step) => (
                <div key={step.id} className="flex items-center gap-3 rounded-card-nested bg-surface-sunken px-3.5 py-3">
                  <IconChip icon={step.timestamp ? CircleCheck : Clock} tint={step.timestamp ? 'teal' : 'neutral'} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-foreground">{step.title}</p>
                    <p className="mt-0.5 text-xs font-semibold leading-relaxed text-muted-foreground">
                      {step.timestamp
                        ? new Date(step.timestamp).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                        : step.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState message="No timeline yet." />
          )}
        </Panel>

        {/* ── What this booking is worth ───────────────────────────────────── */}
        <div className="flex flex-col gap-4">
          <Panel title="Booking">
            <dl className="flex flex-col gap-3">
              <Econ label="Transporter cost">
                {booking.transporterCostMinorUnits != null ? (
                  <MoneyAmount value={Number(booking.transporterCostMinorUnits)} direction="out" className="text-sm" />
                ) : (
                  <Pill tone="orange">Unpriced</Pill>
                )}
              </Econ>
              <Econ label="Status">
                <span className="text-sm font-bold text-foreground">{booking.status}</span>
              </Econ>
            </dl>
            <p className="mt-4 rounded-card-nested bg-surface-sunken px-3.5 py-3 text-xs font-semibold leading-relaxed text-muted-foreground">
              Nothing is invoiced at booking level. The shipment carries the shipper rate and the margin; this booking
              carries only the transporter cost, priced from their rate list.
            </p>
          </Panel>

          <Panel title="Linked To">
            <dl className="flex flex-col gap-3">
              <Econ label="Shipment">
                <Link to={shipmentHref} className="font-mono text-sm font-bold text-foreground hover:underline">
                  {shipment.reference}
                </Link>
              </Econ>
              <Econ label="Invoiced on">
                {invoice ? (
                  <Link to={`${ROUTES.financeInvoices}/${invoice.id}`} className="font-mono text-sm font-bold text-foreground hover:underline">
                    {invoice.number}
                  </Link>
                ) : (
                  <span className="text-sm font-bold text-muted-foreground">Not yet issued</span>
                )}
              </Econ>
            </dl>
          </Panel>
        </div>
      </div>
    </div>
  );
}

export default FinanceBookingPage;
