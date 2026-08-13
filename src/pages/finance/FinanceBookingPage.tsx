import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { ROUTES } from '@/config/routes';
import { IconChip } from '@/design-system';
import {
  ArrowLeft,
  Banknote,
  CircleCheck,
  Clock,
  Container,
  FileText,
  MapPin,
  Receipt,
  Truck,
} from '@/design-system/icons';
import {
  POD_DOCUMENT_LABEL,
  costLineStatus,
  daysAwaitingPod,
  fmtDjf,
  missingPodDocuments,
  pct,
} from '@/lib/finance';
import { useFinanceStore } from '@/stores/finance.store';
import type { CostLine, PodDocument, PodDocumentKind } from '@/types/finance';
import { cn } from '@/utils';

import { PAYMENT_METHOD_LABEL, PodDialog } from './components/dialogs';
import { CargoChip } from './components/ShipmentsTable';
import {
  ActionButton,
  Avatar,
  BookingStageChip,
  DataTable,
  EmptyState,
  MoneyAmount,
  PageHead,
  Panel,
  Pill,
  StageChip,
  Td,
  Th,
  UnpricedChip,
} from './components/kit';
import { Econ, PodChip } from './FinanceShipmentPage';
import { useFinanceModel } from './model';

/**
 * ONE CONTAINER — and deliberately no way to pay it.
 *
 * This page is the other half of the 2026-08-13 restructure. The booking owns
 * everything about the delivery itself: where the box went, who hauled it, the
 * two proofs it was signed for with, and what it cost. It owns NO payment
 * control, because a transporter who carried ten of this shipment's containers
 * is paid once for all ten — the decision belongs one tier up and this page
 * says so out loud rather than quietly omitting a button.
 *
 * The one action it does carry is CONFIRMING PROOF, which is per-container by
 * nature: twenty boxes arrive at twenty moments and are signed for twenty
 * times. Proof is evidence, not money. What the shipment does with twenty
 * proofs is decide, once, whether money may leave.
 *
 * The cost lines still show — with the voucher reference each was settled
 * under, so reconciliation can walk backwards from one bank entry to the
 * container it covered — but they are a statement of fact, not a control.
 */
export function FinanceBookingPage() {
  const model = useFinanceModel();
  const { bookingId = '' } = useParams();
  const confirmPod = useFinanceStore((state) => state.confirmPod);
  const [podOpen, setPodOpen] = useState(false);

  const row = model.bookingById.get(bookingId);
  const shipmentRow = model.shipmentOfBooking.get(bookingId);
  if (!row || !shipmentRow) {
    return (
      <div className="mx-auto w-full max-w-[1600px] px-4 pt-6 sm:px-6">
        <Panel title="Booking not found">
          <EmptyState message="No container with that reference." />
        </Panel>
      </div>
    );
  }

  const { booking } = row;
  const shipmentHref = `${ROUTES.financeShipments}/shipment/${shipmentRow.shipment.id}`;
  const missing = missingPodDocuments(booking.proof);
  const settlement = shipmentRow.settlements.find(
    (entry) => entry.transporterId === booking.transporterId,
  );
  const awaiting = booking.proof.completedAt
    ? Math.floor(daysAwaitingPod(booking.proof, model.nowMs))
    : 0;

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-4 pb-8 pt-1 sm:px-6">
      <Link to={shipmentHref} className="w-fit">
        <ActionButton variant="quiet" icon={ArrowLeft}>
          {shipmentRow.shipment.id}
        </ActionButton>
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHead
          title={booking.id}
          subtitle={
            booking.containerNumber
              ? `${booking.containerNumber} · ${booking.cargoSummary}`
              : booking.cargoSummary
          }
          badge={<BookingStageChip stage={row.stage} />}
        />
        <div className="flex flex-wrap items-center gap-2">
          <CargoChip type={booking.cargoType} />
          <Pill tone="neutral" icon={Container}>
            1 of {shipmentRow.bookingCount} on {shipmentRow.shipment.id}
          </Pill>
        </div>
      </div>

      {/* Route + who hauled it */}
      <div className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-card px-5 py-4 shadow-card">
        <MapPin aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-foreground">
          <span>{booking.origin}</span>
          {(booking.transitPoints ?? []).map((point) => (
            <span key={point} className="flex items-center gap-2">
              <span className="text-muted-foreground">→</span>
              <span className="font-semibold text-muted-foreground">{point}</span>
            </span>
          ))}
          <span className="text-muted-foreground">→</span>
          <span>{booking.destination}</span>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-2">
            <Avatar
              name={row.transporter?.name ?? booking.transporterId}
              logoUrl={row.transporter?.logoUrl}
              size={24}
            />
            <span className="text-sm font-bold text-foreground">
              {row.transporter?.name ?? booking.transporterId}
            </span>
          </span>
        </div>
      </div>

      {/*
       * The point of the whole page, said once at the top: this container is
       * not a payment. If a desk arrives here looking for a Pay button, this
       * tells them where it went and why, and hands them the link.
       */}
      <div className="flex flex-wrap items-center gap-4 rounded-card border border-primary/30 bg-primary-subtle/30 px-5 py-4">
        <IconChip icon={Banknote} tint="teal" size={44} />
        <div className="min-w-[14rem] flex-1">
          <p className="text-sm font-bold text-foreground">
            Money moves on the shipment, not on this container
          </p>
          <p className="mt-0.5 text-xs font-semibold leading-relaxed text-muted-foreground">
            {settlement
              ? `${settlement.transporterName} carried ${settlement.bookingsCount} booking${
                  settlement.bookingsCount === 1 ? '' : 's'
                } on ${shipmentRow.shipment.id} and is paid ${fmtDjf(
                  settlement.totalDjf,
                )} once, in a single transfer under one voucher — not ${
                  settlement.bookingsCount
                } separate payments.`
              : `Release and settlement for this container are decided on ${shipmentRow.shipment.id}.`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StageChip stage={shipmentRow.stage} held={shipmentRow.held} />
          <Link to={shipmentHref}>
            <ActionButton variant="primary" icon={Receipt}>
              Open shipment
            </ActionButton>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {/* ── Proof of delivery — the one thing this page can change ────── */}
        <Panel
          className="xl:col-span-2"
          title="Proof of delivery"
          subtitle="Both proofs are required: the signed note says it was accepted, the photograph says in what condition"
          action={
            booking.proof.podSentAt ? (
              <Pill tone="teal" icon={CircleCheck}>
                Proven
              </Pill>
            ) : booking.proof.completedAt ? (
              <ActionButton variant="primary" icon={FileText} onClick={() => setPodOpen(true)}>
                Confirm PoD
              </ActionButton>
            ) : (
              <Pill tone="neutral" icon={Clock}>
                Still on the road
              </Pill>
            )
          }
        >
          <div className="flex flex-col gap-3">
            <ProofStep
              icon={Truck}
              label="Delivered"
              done={booking.proof.completedAt !== undefined}
              detail={
                booking.proof.completedAt
                  ? `Arrived ${formatStamp(booking.proof.completedAt)}`
                  : 'This container has not reported arrival yet.'
              }
            />
            <ProofStep
              icon={FileText}
              label="Proof confirmed"
              done={booking.proof.podSentAt !== undefined}
              detail={
                booking.proof.podSentAt
                  ? `Confirmed ${formatStamp(booking.proof.podSentAt)} — the client's payment terms started here`
                  : booking.proof.completedAt
                    ? `Delivered ${awaiting} day${
                        awaiting === 1 ? '' : 's'
                      } ago with no proof on file. This container alone is holding the whole consignment's payout.`
                    : 'Nothing to prove until it arrives.'
              }
              warn={booking.proof.completedAt !== undefined && !booking.proof.podSentAt}
            />
          </div>

          {booking.proof.podDocuments.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {booking.proof.podDocuments.map((doc: PodDocument) => (
                <PodChip key={`${doc.kind}-${doc.fileName}`} doc={doc} />
              ))}
            </div>
          ) : null}

          {missing.length > 0 && booking.proof.completedAt ? (
            <div className="mt-4 rounded-card-nested border border-dashed border-accent/50 bg-accent-subtle/40 px-4 py-3">
              <p className="text-xs font-bold text-foreground">
                Missing: {missing.map((kind: PodDocumentKind) => POD_DOCUMENT_LABEL[kind]).join(' and ')}
              </p>
              <p className="mt-0.5 text-xs font-semibold text-muted-foreground">
                A signature with no photo cannot show condition; a photo with no signature proves
                nothing was accepted. PoD stays unconfirmed until both are on file.
              </p>
            </div>
          ) : null}
        </Panel>

        {/* ── What this container is worth ──────────────────────────────── */}
        <div className="flex flex-col gap-4">
          <Panel title="This container">
            <dl className="flex flex-col gap-3">
              <Econ label="Client rate">
                {booking.clientRateDjf !== null ? (
                  <MoneyAmount value={booking.clientRateDjf} direction="in" className="text-sm" />
                ) : (
                  <UnpricedChip moneyOut={shipmentRow.shipment.payout.releasedAt !== undefined} />
                )}
              </Econ>
              {booking.rateSource ? (
                <Econ label="Priced from">
                  <span className="text-sm font-bold text-foreground">
                    {booking.rateSource.replace('_', ' ')}
                  </span>
                </Econ>
              ) : null}
              <Econ label="Cost">
                <MoneyAmount value={row.costTotal} direction="out" className="text-sm" />
              </Econ>
              <Econ label="Gross">
                {row.gross !== null ? (
                  <MoneyAmount
                    value={row.gross}
                    direction={row.gross < 0 ? 'out' : 'in'}
                    className="text-sm"
                  />
                ) : (
                  <span className="text-sm font-bold text-muted-foreground">Unknowable</span>
                )}
              </Econ>
              <Econ label="Margin %">
                <span
                  className={cn(
                    'font-mono text-sm font-bold tabular-nums',
                    row.marginPct === null
                      ? 'text-muted-foreground'
                      : row.marginPct < 0
                        ? 'text-destructive-subtle-foreground'
                        : 'text-foreground',
                  )}
                >
                  {row.marginPct !== null ? pct(row.marginPct, 1) : '—'}
                </span>
              </Econ>
            </dl>
            {/*
             * Per-container margin is a judgement about whether this box was
             * worth moving. It is NOT cash: nothing is invoiced or financed at
             * this level, and a page that let it read as cash would invite
             * exactly the per-container thinking the restructure removed.
             */}
            <p className="mt-4 rounded-card-nested bg-surface-sunken px-3.5 py-3 text-xs font-semibold leading-relaxed text-muted-foreground">
              Was this box worth moving — not a cash figure. Nothing is invoiced or financed at
              container level; the consignment's real margin is on {shipmentRow.shipment.id}.
            </p>
          </Panel>

          <Panel title="Belongs to">
            <dl className="flex flex-col gap-3">
              <Econ label="Shipment">
                <Link to={shipmentHref} className="font-mono text-sm font-bold text-foreground hover:underline">
                  {shipmentRow.shipment.id}
                </Link>
              </Econ>
              {shipmentRow.project ? (
                <Econ label="Project">
                  <Link
                    to={`${ROUTES.financeShipments}/project/${shipmentRow.project.id}`}
                    className="text-sm font-bold text-foreground hover:underline"
                  >
                    {shipmentRow.project.name}
                  </Link>
                </Econ>
              ) : (
                <Econ label="Project">
                  <span className="text-sm font-bold text-muted-foreground">One-off consignment</span>
                </Econ>
              )}
              <Econ label="Client">
                <span className="text-sm font-bold text-foreground">
                  {shipmentRow.client?.name ?? shipmentRow.shipment.clientId}
                </span>
              </Econ>
              <Econ label="Invoiced on">
                {shipmentRow.invoice ? (
                  <Link
                    to={`${ROUTES.financeInvoices}/${shipmentRow.invoice.id}`}
                    className="font-mono text-sm font-bold text-foreground hover:underline"
                  >
                    {shipmentRow.invoice.id}
                  </Link>
                ) : (
                  <span className="text-sm font-bold text-muted-foreground">Not yet issued</span>
                )}
              </Econ>
            </dl>
          </Panel>
        </div>
      </div>

      {/* ── Cost lines: a statement, not a control ────────────────────────── */}
      <Panel
        title="What this container cost"
        subtitle="One line per party owed. Each is settled by its shipment's voucher — never on its own"
        padded={false}
        action={<Pill tone="neutral">{fmtDjf(row.costTotal)} total</Pill>}
      >
        {booking.costLines.length === 0 ? (
          <EmptyState message="No costs recorded against this container." />
        ) : (
          <DataTable minWidth={860}>
            <thead>
              <tr>
                <Th>Party</Th>
                <Th>Role</Th>
                <Th align="right">Amount</Th>
                <Th>Status</Th>
                <Th>Settled under</Th>
              </tr>
            </thead>
            <tbody>
              {booking.costLines.map((line: CostLine) => {
                const status = costLineStatus(shipmentRow.shipment.payout, line);
                const payment = line.paymentId ? model.paymentById.get(line.paymentId) : undefined;
                return (
                  <tr key={line.id} className="transition-colors hover:bg-surface-sunken/60">
                    <Td>
                      <span className="flex items-center gap-3">
                        <Avatar
                          name={line.counterpartyName}
                          logoUrl={model.transporterById.get(line.counterpartyId)?.logoUrl}
                          size={36}
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-bold text-foreground">
                            {line.counterpartyName}
                          </span>
                          <span className="mt-0.5 block font-mono text-xs font-semibold text-muted-foreground">
                            {line.id}
                          </span>
                        </span>
                      </span>
                    </Td>
                    <Td>
                      <span className="text-sm font-semibold capitalize text-muted-foreground">
                        {line.type.replace('_', ' ')}
                      </span>
                    </Td>
                    <Td align="right">
                      <MoneyAmount value={line.amountDjf} direction="out" unit={false} className="text-sm" />
                    </Td>
                    <Td>
                      <Pill
                        tone={status === 'paid' ? 'teal' : status === 'payable' ? 'orange' : 'neutral'}
                      >
                        {status === 'paid' ? 'Paid' : status === 'payable' ? 'Payable' : 'Blocked'}
                      </Pill>
                    </Td>
                    <Td>
                      {payment ? (
                        <Link
                          to={ROUTES.financePayment.replace(':paymentId', payment.id)}
                          className="block"
                        >
                          <span className="font-mono text-xs font-bold text-foreground hover:underline">
                            {payment.id}
                          </span>
                          <span className="mt-0.5 block text-xs font-semibold text-muted-foreground">
                            {PAYMENT_METHOD_LABEL[payment.paidVia]} · covers{' '}
                            {payment.bookingIds.length} booking
                            {payment.bookingIds.length === 1 ? '' : 's'}
                          </span>
                        </Link>
                      ) : (
                        <span className="text-xs font-semibold text-muted-foreground">
                          {status === 'payable'
                            ? `Payable on ${shipmentRow.shipment.id}`
                            : 'Waiting on release'}
                        </span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        )}
      </Panel>

      <PodDialog
        open={podOpen}
        onClose={() => setPodOpen(false)}
        bookingId={booking.id}
        onConfirm={(documents: PodDocument[]) => confirmPod(booking.id, documents)}
      />
    </div>
  );
}

/* ── Pieces ──────────────────────────────────────────────────────────────── */

const formatStamp = (iso: string): string =>
  new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

/** One of the two things that has to have happened for a container to count. */
function ProofStep({
  icon: Icon,
  label,
  detail,
  done,
  warn,
}: {
  icon: (props: { className?: string; 'aria-hidden'?: boolean }) => React.ReactNode;
  label: string;
  detail: string;
  done: boolean;
  warn?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-card-nested px-3.5 py-3',
        warn ? 'border border-dashed border-accent/50 bg-accent-subtle/40' : 'bg-surface-sunken',
      )}
    >
      <IconChip icon={done ? CircleCheck : Icon} tint={done ? 'teal' : warn ? 'orange' : 'neutral'} size={36} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-foreground">{label}</p>
        <p className="mt-0.5 text-xs font-semibold leading-relaxed text-muted-foreground">
          {detail}
        </p>
      </div>
    </div>
  );
}

export default FinanceBookingPage;
