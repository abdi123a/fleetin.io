import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { ROUTES } from '@/config/routes';
import { IconChip } from '@/design-system';
import {
  ArrowLeft,
  Banknote,
  Camera,
  Check,
  CircleCheck,
  Clock,
  FileText,
  MapPin,
  PauseCircle,
  Receipt,
} from '@/design-system/icons';
import { clockLabel, fmtDjf, pct, wasReleasedEarly } from '@/lib/finance';
import { useFinanceStore } from '@/stores/finance.store';
import type {
  PaymentMethod,
  PodDocument,
  TransporterSettlement,
} from '@/types/finance';
import { cn } from '@/utils';

import { ChannelBadge } from './components/ChannelTabs';
import {
  BookingQuickViewDialog,
  PAYMENT_METHOD_LABEL,
  PayDialog,
  PodDialog,
} from './components/dialogs';
import { CargoChip } from './components/ShipmentsTable';
import {
  ActionButton,
  Avatar,
  BookingStageChip,
  DataTable,
  EmptyState,
  HeldChip,
  MoneyAmount,
  PageHead,
  Panel,
  Pill,
  RiskTag,
  SettlementChip,
  StageChip,
  Td,
  Th,
  UnpricedChip,
  ValidationTrack,
} from './components/kit';
import { useFinanceModel, type BookingRow, type ShipmentRow } from './model';

/**
 * ONE CONSIGNMENT — and the page where money actually moves.
 *
 * Rebuilt 2026-08-13 around the shipment tier. Before this, paying happened
 * inside each booking: a twenty-container consignment split between two
 * hauliers meant twenty releases and twenty payments for work that is one
 * release and two payments. This page is the correction.
 *
 * It answers three questions in order, top to bottom:
 *
 *   1. Is the consignment finished?  — every booking, its proof, and the ones
 *      still missing NAMED rather than counted.
 *   2. Can the money go?             — one release for the whole shipment.
 *   3. Who gets paid, and how much?  — one row per transporter: the bookings
 *      they carried × the total, one Pay button, one signed voucher.
 *
 * A single unproven container blocks the whole consignment, so it is called
 * out by id — "release blocked" is useless, "BKG-00412 has no signed note" is
 * something someone can act on.
 */
export function FinanceShipmentPage() {
  const model = useFinanceModel();
  const { shipmentId = '' } = useParams();
  const releaseShipment = useFinanceStore((state) => state.releaseShipment);
  const payTransporter = useFinanceStore((state) => state.payTransporter);
  const confirmPod = useFinanceStore((state) => state.confirmPod);
  const clearHold = useFinanceStore((state) => state.clearHold);

  /** Which container's proof is being confirmed. */
  const [podFor, setPodFor] = useState<string | null>(null);
  /** Which transporter's settlement the pay dialog is committing. */
  const [paying, setPaying] = useState<TransporterSettlement | null>(null);
  /** Which booking's quick-view popup is open. */
  const [viewing, setViewing] = useState<BookingRow | null>(null);

  const row = model.shipmentById.get(shipmentId);
  if (!row) {
    return (
      <div className="mx-auto w-full max-w-[1600px] px-4 pt-6 sm:px-6">
        <Panel title="Shipment not found">
          <EmptyState message="No consignment with that reference." />
        </Panel>
      </div>
    );
  }

  const { shipment } = row;
  const windowMs = model.settings.validationWindowHours * 3_600_000;
  const released = shipment.payout.releasedAt !== undefined;
  const payable = row.settlements.filter((entry) => entry.payableDjf > 0);
  const payableTotal = payable.reduce((sum, entry) => sum + entry.payableDjf, 0);
  const settledCount = row.settlements.filter((entry) => entry.status === 'paid').length;
  const first = row.bookings[0]?.booking;

  const handlePay = (method: PaymentMethod, reference: string) => {
    if (!paying) return;
    payTransporter(shipment.id, paying.transporterId, method, reference);
  };

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-4 pb-8 pt-1 sm:px-6">
      {/* A one-off has no project to go back to — it returns to its client. */}
      <Link
        to={
          shipment.projectId
            ? `${ROUTES.financeShipments}/project/${shipment.projectId}`
            : `${ROUTES.financeShipments}/client/${shipment.clientId}?channel=${shipment.originationChannel}`
        }
        className="w-fit"
      >
        <ActionButton variant="quiet" icon={ArrowLeft}>
          {row.project?.name ?? row.client?.name ?? 'Back'}
        </ActionButton>
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHead
          title={shipment.id}
          subtitle={`${row.bookingCount} booking${row.bookingCount === 1 ? '' : 's'} · ${
            row.settlements.length
          } counterpart${row.settlements.length === 1 ? 'y' : 'ies'}${
            shipment.reference ? ` · ${shipment.reference}` : ''
          }`}
          badge={<StageChip stage={row.stage} held={row.held} />}
        />
        <div className="flex flex-wrap items-center gap-2">
          <ChannelBadge channel={shipment.originationChannel} />
          {row.source ? <RiskTag bearer={row.source.riskBearer} /> : null}
        </div>
      </div>

      {/* Route + client */}
      <div className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-card px-5 py-4 shadow-card">
        <MapPin aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-foreground">
          <span>{first?.origin ?? 'Djibouti Port'}</span>
          {(first?.transitPoints ?? []).map((point) => (
            <span key={point} className="flex items-center gap-2">
              <span className="text-muted-foreground">→</span>
              <span className="font-semibold text-muted-foreground">{point}</span>
            </span>
          ))}
          <span className="text-muted-foreground">→</span>
          <span>{first?.destination ?? '—'}</span>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          {row.client ? (
            <span className="flex items-center gap-2">
              <Avatar name={row.client.name} logoUrl={row.client.logoUrl} size={24} />
              <span className="text-sm font-bold text-foreground">{row.client.name}</span>
            </span>
          ) : null}
        </div>
      </div>

      {/* ── The money path: three steps, one live action ─────────────────── */}
      <Panel
        title="Paying this shipment"
        subtitle="Every booking proven → release the consignment → pay each transporter once"
      >
        <ol className="flex flex-col gap-2.5">
          <PayStep
            index={1}
            icon={FileText}
            title="Proof of delivery"
            state={row.provenCount === row.bookingCount && row.bookingCount > 0 ? 'done' : 'current'}
            detail={
              row.bookingCount === 0
                ? 'No bookings on this consignment yet.'
                : row.unproven.length === 0
                  ? `All ${row.bookingCount} booking${
                      row.bookingCount === 1 ? '' : 's'
                    } proven — the consignment is complete.`
                  : `${row.provenCount} of ${row.bookingCount} proven. ${row.unproven.length} booking${
                      row.unproven.length === 1 ? '' : 's'
                    } still hold the whole payout: ${row.unproven
                      .map((booking) => booking.id)
                      .join(', ')}`
            }
          >
            {/*
             * Naming the blockers is the point. A count tells the desk there is
             * a problem; the ids tell them which truck to ring about.
             */}
            {row.unproven.length > 0 ? (
              <div className="mt-2.5 flex flex-col gap-1.5">
                {row.unproven.map((booking) => (
                  <div
                    key={booking.id}
                    className="flex flex-wrap items-center gap-3 rounded-card-nested border border-dashed border-accent/50 bg-accent-subtle/40 px-3.5 py-2.5"
                  >
                    <span className="font-mono text-xs font-bold text-foreground">{booking.id}</span>
                    <span className="min-w-[7rem] flex-1 truncate text-xs font-semibold text-muted-foreground">
                      {booking.containerNumber ? `${booking.containerNumber} · ` : ''}
                      {booking.destination} · {booking.cargoSummary}
                    </span>
                    {booking.proof.completedAt ? (
                      <ActionButton variant="primary" icon={FileText} onClick={() => setPodFor(booking.id)}>
                        Confirm PoD
                      </ActionButton>
                    ) : (
                      <Pill tone="neutral" icon={Clock}>
                        Still on the road
                      </Pill>
                    )}
                  </div>
                ))}
              </div>
            ) : null}
          </PayStep>

          <PayStep
            index={2}
            icon={Banknote}
            title="Release the consignment"
            state={released ? 'done' : row.unproven.length > 0 ? 'waiting' : 'current'}
            detail={releaseDetail(row, windowMs, released)}
            action={
              released ? null : row.unproven.length > 0 ? null : row.held ? (
                <HeldChip label="Blocked by hold" />
              ) : (
                <ActionButton
                  variant="primary"
                  icon={Banknote}
                  onClick={() => releaseShipment(shipment.id)}
                >
                  Release {fmtDjf(row.money.costDjf)}
                </ActionButton>
              )
            }
          >
            {/*
             * The window is shown because the desk wants to know where it
             * stands, NOT because it decides anything. The button above stays
             * live at every point on this track.
             */}
            {row.stage === 'ready' ? (
              <div className="mt-2.5 flex flex-wrap items-end gap-3">
                <ValidationTrack
                  elapsedMs={row.clock.elapsedMs}
                  windowMs={windowMs}
                  paused={row.held}
                  className="max-w-xs flex-1"
                />
                {row.clock.closingSoon ? (
                  <Pill tone="amber" icon={Clock}>
                    Closes in {clockLabel(row.clock.remainingMs)}
                  </Pill>
                ) : null}
              </div>
            ) : null}
          </PayStep>

          <PayStep
            index={3}
            icon={Receipt}
            title={`Pay ${row.settlements.length === 1 ? 'the transporter' : 'each transporter'}`}
            state={
              row.settlements.length > 0 && settledCount === row.settlements.length
                ? 'done'
                : payable.length > 0
                  ? 'current'
                  : 'waiting'
            }
            detail={
              row.settlements.length === 0
                ? 'No counterparties on this consignment.'
                : settledCount === row.settlements.length
                  ? `All ${row.settlements.length} settlement${
                      row.settlements.length === 1 ? '' : 's'
                    } paid · ${fmtDjf(row.money.paidOutDjf)} out across ${row.bookingCount} booking${
                      row.bookingCount === 1 ? '' : 's'
                    }`
                  : payable.length > 0
                    ? `${payable.length} transporter${
                        payable.length === 1 ? '' : 's'
                      } payable now · ${fmtDjf(payableTotal)} in ${payable.length} transfer${
                        payable.length === 1 ? '' : 's'
                      }`
                    : row.held
                      ? 'Frozen while the hold stands — held money is never payable.'
                      : 'Payable as soon as the consignment is released.'
            }
          />
        </ol>

        {shipment.payout.holds.length > 0 ? (
          <div className="mt-4 flex flex-col gap-2">
            {shipment.payout.holds.map((hold) => (
              <div
                key={hold.id}
                className={cn(
                  'flex flex-wrap items-center gap-3 rounded-card-nested border px-4 py-3',
                  hold.clearedAt
                    ? 'border-border bg-card'
                    : 'border-dashed border-warning/60 bg-warning-subtle',
                )}
              >
                <PauseCircle
                  aria-hidden
                  className={cn(
                    'size-4 shrink-0',
                    hold.clearedAt ? 'text-muted-foreground' : 'text-warning-subtle-foreground',
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      'truncate text-sm font-bold',
                      hold.clearedAt ? 'text-muted-foreground' : 'text-warning-subtle-foreground',
                    )}
                  >
                    {hold.reason}
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-muted-foreground">
                    {hold.category.replace('_', ' ')}
                    {/* The container in dispute, when the dispute is about one. */}
                    {hold.bookingId ? ` · ${hold.bookingId}` : ''} · raised by {hold.raisedBy} ·{' '}
                    {new Date(hold.raisedAt).toLocaleString('en-GB', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                {hold.clearedAt ? (
                  <Pill tone="neutral">Cleared</Pill>
                ) : (
                  <ActionButton variant="ghost" onClick={() => clearHold(shipment.id, hold.id)}>
                    Clear hold
                  </ActionButton>
                )}
              </div>
            ))}
            {row.held ? (
              <p className="text-xs font-semibold text-warning-subtle-foreground">
                A dispute is the one thing that still stops money. The counter is paused where it
                stands — clearing the hold resumes it from there and makes the whole consignment
                releasable immediately.
              </p>
            ) : null}
          </div>
        ) : null}
      </Panel>

      {/* ── THE SETTLEMENT TABLE — the reason this page exists ───────────── */}
      <Panel
        title="Transporter settlements"
        subtitle="One row per transporter: everything they carried on this shipment, paid in one transfer"
        padded={false}
        action={
          payable.length > 0 ? (
            <Pill tone="orange">{fmtDjf(payableTotal)} payable</Pill>
          ) : row.settlements.length > 0 && settledCount === row.settlements.length ? (
            <Pill tone="teal">All settled</Pill>
          ) : null
        }
      >
        {row.settlements.length === 0 ? (
          <EmptyState message="No costs recorded against this consignment yet." />
        ) : (
          <DataTable minWidth={980}>
            <thead>
              <tr>
                <Th>Transporter</Th>
                <Th align="right">Bookings</Th>
                <Th align="right">Total owed</Th>
                <Th>Status</Th>
                <Th align="right">Action</Th>
              </tr>
            </thead>
            <tbody>
              {row.settlements.map((settlement) => {
                const payment = settlement.paymentId
                  ? model.paymentById.get(settlement.paymentId)
                  : undefined;
                return (
                  <tr
                    key={settlement.transporterId}
                    className="transition-colors hover:bg-surface-sunken/60"
                  >
                    <Td>
                      <span className="flex items-center gap-3">
                        <Avatar
                          name={settlement.transporterName}
                          logoUrl={model.transporterById.get(settlement.transporterId)?.logoUrl}
                          size={36}
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-bold text-foreground">
                            {settlement.transporterName}
                          </span>
                          <span className="mt-0.5 block font-mono text-xs font-semibold text-muted-foreground">
                            {settlement.transporterId}
                          </span>
                        </span>
                      </span>
                    </Td>
                    <Td align="right">
                      {/*
                       * The multiplication the user asked for, stated: ten
                       * bookings at this rate is one payment of ten times it.
                       */}
                      <span className="font-mono text-sm font-extrabold tabular-nums text-foreground">
                        {settlement.bookingsCount}
                      </span>
                      <span className="mt-0.5 block text-xs font-semibold text-muted-foreground">
                        {settlement.bookingsCount === 1
                          ? 'booking'
                          : `× ${fmtDjf(
                              Math.round(settlement.totalDjf / settlement.bookingsCount),
                            )} avg`}
                      </span>
                    </Td>
                    <Td align="right">
                      <MoneyAmount value={settlement.totalDjf} direction="out" className="text-sm" />
                      {settlement.paidDjf > 0 && settlement.paidDjf < settlement.totalDjf ? (
                        <span className="mt-0.5 block text-xs font-semibold text-muted-foreground">
                          {fmtDjf(settlement.paidDjf)} already paid
                        </span>
                      ) : null}
                    </Td>
                    <Td>
                      <div className="flex flex-col items-start gap-1.5">
                        <SettlementChip status={row.held ? 'blocked' : settlement.status} />
                        {payment ? (
                          <span className="font-mono text-xs font-semibold text-muted-foreground">
                            {payment.id}
                            {payment.paidVia ? ` · ${PAYMENT_METHOD_LABEL[payment.paidVia]}` : ''}
                          </span>
                        ) : null}
                        {payment && !payment.acknowledgedAt ? (
                          <span className="text-xs font-bold text-accent-subtle-foreground">
                            Voucher not signed back
                          </span>
                        ) : null}
                      </div>
                    </Td>
                    <Td align="right">
                      {settlement.payableDjf > 0 ? (
                        <ActionButton
                          variant="primary"
                          icon={Banknote}
                          onClick={() => setPaying(settlement)}
                        >
                          Pay {fmtDjf(settlement.payableDjf)}
                        </ActionButton>
                      ) : payment ? (
                        <Link to={`${ROUTES.financePayment.replace(':paymentId', payment.id)}`}>
                          <ActionButton variant="ghost" icon={Receipt}>
                            Voucher
                          </ActionButton>
                        </Link>
                      ) : (
                        <span className="text-xs font-semibold text-muted-foreground">
                          {row.held
                            ? 'Frozen by the hold'
                            : released
                              ? '—'
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

      {/* ── The bookings themselves ──────────────────────────────────────── */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Panel
          className="xl:col-span-2"
          title="Bookings"
          subtitle="One container or one vehicle each — delivered and proven separately, paid together"
          padded={false}
          action={
            <Pill tone={row.unproven.length > 0 ? 'orange' : 'teal'}>
              {row.provenCount}/{row.bookingCount} proven
            </Pill>
          }
        >
          {row.bookings.length === 0 ? (
            <EmptyState message="No bookings on this consignment." />
          ) : (
            <DataTable minWidth={880}>
              <thead>
                <tr>
                  <Th>Booking</Th>
                  <Th>Cargo</Th>
                  <Th>Transporter</Th>
                  <Th>Proof</Th>
                  <Th align="right">Cost</Th>
                  <Th align="right">Rate</Th>
                </tr>
              </thead>
              <tbody>
                {row.bookings.map((entry) => (
                  <tr
                    key={entry.booking.id}
                    onClick={() => setViewing(entry)}
                    className="cursor-pointer transition-colors hover:bg-surface-sunken/60"
                  >
                    <Td>
                      <span className="font-mono text-sm font-bold text-foreground">
                        {entry.booking.id}
                      </span>
                      {entry.booking.containerNumber ? (
                        <span className="mt-0.5 block font-mono text-xs font-medium text-muted-foreground">
                          {entry.booking.containerNumber}
                        </span>
                      ) : null}
                    </Td>
                    <Td>
                      <CargoChip type={entry.booking.cargoType} />
                      <span className="mt-1.5 block text-xs font-semibold text-muted-foreground">
                        {entry.booking.destination}
                      </span>
                    </Td>
                    <Td>
                      <span className="text-sm font-bold text-foreground">
                        {entry.transporter?.name ?? entry.booking.transporterId}
                      </span>
                    </Td>
                    <Td>
                      <BookingStageChip stage={entry.stage} />
                    </Td>
                    <Td align="right">
                      <MoneyAmount
                        value={entry.costTotal}
                        direction="out"
                        unit={false}
                        className="text-sm"
                      />
                    </Td>
                    <Td align="right">
                      {entry.booking.clientRateDjf !== null ? (
                        <MoneyAmount
                          value={entry.booking.clientRateDjf}
                          direction="in"
                          unit={false}
                          className="text-sm"
                        />
                      ) : (
                        <UnpricedChip moneyOut={released} />
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel title="Payment summary">
            <div className="flex flex-col gap-3">
              <SummaryRow
                icon={CircleCheck}
                tint="teal"
                label="Paid"
                sub={`${settledCount} of ${row.settlements.length} settlements`}
                value={row.money.paidOutDjf}
                direction="out"
              />
              <SummaryRow
                icon={row.held ? PauseCircle : payable.length > 0 ? Banknote : Clock}
                tint={row.held ? 'amber' : payable.length > 0 ? 'orange' : 'neutral'}
                label={
                  row.held
                    ? 'Frozen on hold'
                    : payable.length > 0
                      ? 'Payable now'
                      : 'Waiting for release'
                }
                sub={`${row.settlements.length - settledCount} settlement${
                  row.settlements.length - settledCount === 1 ? '' : 's'
                } outstanding`}
                value={
                  row.money.payableDjf + row.money.frozenDjf + row.money.pipelineDjf
                }
                direction={row.held ? 'held' : 'out'}
                badge={row.held ? <HeldChip /> : undefined}
              />
            </div>
            {payable.length > 0 ? (
              <div className="mt-4 rounded-card-nested bg-surface-sunken px-3.5 py-3">
                <p className="text-xs font-semibold text-muted-foreground">
                  {payable.map((entry) => entry.transporterName).join(', ')}{' '}
                  {payable.length === 1 ? 'is' : 'are'} waiting on {fmtDjf(payableTotal)} across{' '}
                  {payable.reduce((sum, entry) => sum + entry.bookingsCount, 0)} bookings.
                </p>
              </div>
            ) : (
              <p className="mt-4 rounded-card-nested bg-surface-sunken px-3.5 py-3 text-xs font-semibold text-muted-foreground">
                {row.settlements.length > 0 && settledCount === row.settlements.length
                  ? 'Every transporter on this consignment has been paid.'
                  : 'Nothing is payable until the consignment is released.'}
              </p>
            )}
          </Panel>

          <Panel title="Shipment economics">
            <dl className="flex flex-col gap-3">
              <Econ label="Client total">
                {row.money.revenueDjf > 0 ? (
                  <MoneyAmount value={row.money.revenueDjf} direction="in" className="text-sm" />
                ) : (
                  <UnpricedChip moneyOut={released} />
                )}
              </Econ>
              {row.money.unpricedCount > 0 ? (
                <Econ label="Unpriced">
                  <span className="text-sm font-bold text-accent-subtle-foreground">
                    {row.money.unpricedCount} booking
                    {row.money.unpricedCount === 1 ? '' : 's'} · {fmtDjf(row.money.unpricedCostDjf)}{' '}
                    cost
                  </span>
                </Econ>
              ) : null}
              <Econ label="Total expenses">
                <MoneyAmount value={row.money.costDjf} direction="out" className="text-sm" />
              </Econ>
              <Econ label="Gross margin">
                {row.money.grossDjf !== null ? (
                  <MoneyAmount
                    value={row.money.grossDjf}
                    direction={row.money.grossDjf < 0 ? 'out' : 'in'}
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
                    row.money.marginPct === null
                      ? 'text-muted-foreground'
                      : row.money.marginPct < 0
                        ? 'text-destructive-subtle-foreground'
                        : 'text-foreground',
                  )}
                >
                  {row.money.marginPct !== null ? pct(row.money.marginPct, 1) : '—'}
                </span>
              </Econ>
              <Econ label="Funded by">
                <span className="font-mono text-sm font-bold text-foreground">
                  {shipment.fundingSourceId}
                </span>
              </Econ>
            </dl>
          </Panel>

          {row.invoice ? (
            <Panel
              title="Client invoice"
              action={
                <Link to={`${ROUTES.financeInvoices}/${row.invoice.id}`}>
                  <ActionButton variant="ghost" icon={Receipt}>
                    Open invoice
                  </ActionButton>
                </Link>
              }
            >
              <dl className="flex flex-col gap-3">
                <Econ label="Invoice">
                  <span className="font-mono text-sm font-bold text-foreground">
                    {row.invoice.id}
                  </span>
                </Econ>
                <Econ label="Covers">
                  <span className="text-sm font-bold text-foreground">
                    {row.invoice.bookingIds.length} booking
                    {row.invoice.bookingIds.length === 1 ? '' : 's'}
                  </span>
                </Econ>
                <Econ label="Amount">
                  <MoneyAmount value={row.invoice.amountDjf} direction="in" className="text-sm" />
                </Econ>
                <Econ label="Due">
                  <span className="text-sm font-bold text-foreground">
                    {new Date(row.invoice.dueAt).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: 'short',
                    })}
                  </span>
                </Econ>
                <Econ label="Status">
                  {row.invoice.paidAt ? (
                    <Pill tone="teal">Settled</Pill>
                  ) : (
                    <Pill tone="amber">Outstanding</Pill>
                  )}
                </Econ>
              </dl>
            </Panel>
          ) : (
            <Panel title="Client invoice">
              <p className="text-xs font-semibold leading-relaxed text-muted-foreground">
                No invoice issued. A consignment is billable once every booking on it is proven
                {row.money.revenueDjf === 0 ? ' and at least one client rate is agreed' : ''}.
              </p>
            </Panel>
          )}
        </div>
      </div>

      <PodDialog
        open={podFor !== null}
        onClose={() => setPodFor(null)}
        bookingId={podFor ?? ''}
        onConfirm={(documents: PodDocument[]) => {
          if (podFor) confirmPod(podFor, documents);
        }}
      />
      <PayDialog
        open={paying !== null}
        onClose={() => setPaying(null)}
        settlement={paying}
        shipmentId={shipment.id}
        logoFor={(id) => model.transporterById.get(id)?.logoUrl}
        onPay={handlePay}
      />
      <BookingQuickViewDialog open={viewing !== null} onClose={() => setViewing(null)} entry={viewing} />
    </div>
  );
}

/* ── Pieces ──────────────────────────────────────────────────────────────── */

const formatDate = (iso?: string): string =>
  iso
    ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

/** What step 2 says about itself, in one line. */
function releaseDetail(row: ShipmentRow, windowMs: number, released: boolean): string {
  if (released) {
    const early = wasReleasedEarly(
      row.shipment,
      row.bookings.map((entry) => entry.booking),
      windowMs,
    );
    return `Released ${formatDate(row.shipment.payout.releasedAt)}${
      early ? ' — early, ahead of the review window' : ''
    }. The whole consignment's money is authorised to leave.`;
  }
  if (row.unproven.length > 0) {
    return `Blocked: ${row.unproven.length} of ${row.bookingCount} booking${
      row.bookingCount === 1 ? '' : 's'
    } has no proof of delivery. One unproven container freezes the entire consignment.`;
  }
  if (row.held) return 'A hold is open. Clear it and this releases immediately.';
  if (row.clock.expired) return 'The review window has closed. This is overdue for release.';
  return `Ready now. The ${Math.round(windowMs / 3_600_000)}h review window has ${clockLabel(
    row.clock.remainingMs,
  )} left, but it does not have to be waited out.`;
}

type StepState = 'done' | 'current' | 'waiting';

/**
 * One station on the money path.
 *
 * The current step is the loud one and carries the only primary button on the
 * panel; done steps recede to a tick; future steps state their precondition
 * rather than showing a dead control.
 */
function PayStep({
  index,
  icon: Icon,
  title,
  detail,
  state,
  action,
  children,
}: {
  index: number;
  icon: (props: { className?: string; 'aria-hidden'?: boolean }) => React.ReactNode;
  title: string;
  detail: string;
  state: StepState;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <li
      className={cn(
        'rounded-card-nested border px-4 py-3.5 transition-colors',
        state === 'current'
          ? 'border-primary/40 bg-primary-subtle/30'
          : state === 'done'
            ? 'border-border-subtle bg-card'
            : 'border-border-subtle bg-surface-sunken',
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        {state === 'done' ? (
          <IconChip icon={Check} tint="teal" size={36} />
        ) : (
          <IconChip icon={Icon} tint={state === 'current' ? 'orange' : 'neutral'} size={36} />
        )}
        <div className="min-w-[10rem] flex-1">
          <p
            className={cn(
              'text-sm font-bold',
              state === 'waiting' ? 'text-muted-foreground' : 'text-foreground',
            )}
          >
            <span className="mr-1.5 font-mono text-xs text-muted-foreground">{index}</span>
            {title}
          </p>
          <p className="mt-0.5 text-xs font-semibold leading-relaxed text-muted-foreground">
            {detail}
          </p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </li>
  );
}

export function PodChip({ doc }: { doc: PodDocument }) {
  const Icon = doc.kind === 'signed_pdf' ? FileText : Camera;
  const chip = (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-bold text-foreground">
      <Icon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
      {doc.fileName}
    </span>
  );
  // Session uploads can be opened; seeded history has no file behind it.
  return doc.previewUrl ? (
    <a href={doc.previewUrl} target="_blank" rel="noreferrer" className="hover:opacity-80">
      {chip}
    </a>
  ) : (
    chip
  );
}

function SummaryRow({
  icon: Icon,
  tint,
  label,
  sub,
  value,
  direction,
  badge,
}: {
  icon: (props: { className?: string; 'aria-hidden'?: boolean }) => React.ReactNode;
  tint: 'teal' | 'orange' | 'amber' | 'neutral';
  label: string;
  sub: string;
  value: number;
  direction: 'out' | 'held';
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-card-nested bg-surface-sunken px-3.5 py-3">
      <IconChip icon={Icon} tint={tint} size={36} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-bold text-foreground">
          {label}
          {badge}
        </p>
        <p className="text-xs font-semibold text-muted-foreground">{sub}</p>
      </div>
      <MoneyAmount value={value} direction={direction} unit={false} className="text-sm" />
    </div>
  );
}

export function Econ({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export default FinanceShipmentPage;
