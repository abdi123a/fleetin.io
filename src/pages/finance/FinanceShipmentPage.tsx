import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { ROUTES, buildPath } from '@/config/routes';
import { Button, IconChip, Input } from '@/design-system';
import {
  ArrowLeft,
  Banknote,
  Check,
  Clock,
  FileText,
  MapPin,
  PauseCircle,
  Receipt,
} from '@/design-system/icons';
import { fmtDjf } from '@/lib/finance';
import { useShipper } from '@/features/shippers/api/queries';
import { useClearHold, useIssueInvoiceForShipment, usePayTransporter } from '@/features/finance';
import { useReleaseShipment, useRepriceShipment, useUpdateShipmentRaw } from '@/features/shipments/api/queries';
import { cn } from '@/utils';

import { BankAccountSelect } from './components/BankAccountSelect';
import { ChannelBadge, type OriginationChannel } from './components/ChannelTabs';
import { MoneyBreakdown } from './components/MoneyBreakdown';
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
  SettlementChip,
  StageChip,
  Td,
  Th,
} from './components/kit';
import { bookingStage, useShipmentFinanceDetail, type TransporterSettlement } from './shipmentFinance';

/**
 * ONE CONSIGNMENT — and the page where money actually moves.
 *
 * Rebuilt on real data: `useShipmentFinanceDetail` assembles the shipment,
 * its bookings, holds, payment orders and invoice from independent queries.
 * PoD is no longer a Finance action — it already happens in Operations
 * (`BookingPreviewSheet.tsx`); this page only reads the resulting booking
 * status and the invoice it auto-issues. Client pricing is shipment-level
 * only (no per-booking rate exists in the real model), so a shipment left
 * unpriced gets an inline "Set client rate" action instead of a booking-level
 * one.
 */
export function FinanceShipmentPage() {
  const { shipmentId = '' } = useParams();
  const navigate = useNavigate();
  const detail = useShipmentFinanceDetail(shipmentId);
  const { data: shipper } = useShipper(detail.shipment?.shipperId);

  const releaseShipment = useReleaseShipment();
  const payTransporter = usePayTransporter();
  const clearHold = useClearHold();
  const issueInvoice = useIssueInvoiceForShipment();
  const setClientRate = useUpdateShipmentRaw();
  const reprice = useRepriceShipment();

  const [paying, setPaying] = useState<TransporterSettlement | null>(null);
  const [payBankAccountId, setPayBankAccountId] = useState('');
  const [payError, setPayError] = useState<string | null>(null);

  const [settingRate, setSettingRate] = useState(false);
  const [rateInput, setRateInput] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  if (detail.isLoading) {
    return (
      <div className="mx-auto w-full max-w-[1600px] px-4 pt-6 sm:px-6">
        <Panel title="Loading…">
          <EmptyState message="Fetching this shipment's finance detail." />
        </Panel>
      </div>
    );
  }

  if (!detail.shipment) {
    return (
      <div className="mx-auto w-full max-w-[1600px] px-4 pt-6 sm:px-6">
        <Panel title="Shipment not found">
          <EmptyState message="No shipment with that reference." />
        </Panel>
      </div>
    );
  }

  const { shipment, bookings, holds, settlements, money, unproven, held, invoice, stage } = detail;
  const payable = settlements.filter((s) => s.status === 'payable');
  const payableTotal = payable.reduce((sum, s) => sum + s.totalMinorUnits, 0);
  const settledCount = settlements.filter((s) => s.status === 'paid').length;

  const handleRelease = async () => {
    setActionError(null);
    try {
      await releaseShipment.mutateAsync(shipment.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not release this shipment.');
    }
  };

  const handleClearHold = async (holdId: string) => {
    setActionError(null);
    try {
      await clearHold.mutateAsync({ id: holdId, shipmentId: shipment.id });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not clear that hold.');
    }
  };

  const handleIssueInvoice = async () => {
    setActionError(null);
    try {
      await issueInvoice.mutateAsync(shipment.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not issue an invoice for this shipment.');
    }
  };

  const handleSetRate = async (e: FormEvent) => {
    e.preventDefault();
    if (!rateInput.trim()) return;
    setActionError(null);
    try {
      await setClientRate.mutateAsync({ id: shipment.id, payload: { clientRateMinorUnits: Number(rateInput) } });
      setSettingRate(false);
      setRateInput('');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not set the client rate.');
    }
  };

  const handlePay = async () => {
    if (!paying || !payBankAccountId) return;
    setPayError(null);
    try {
      await payTransporter.mutateAsync({
        shipmentId: shipment.id,
        transporterId: paying.partnerId,
        bankAccountId: payBankAccountId,
      });
      setPaying(null);
      setPayBankAccountId('');
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'Could not pay this transporter.');
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-4 pb-6 pt-1 sm:px-6">
      <Link
        to={
          shipment.projectId
            ? buildPath(ROUTES.financeShipmentProject, { projectId: shipment.projectId })
            : buildPath(ROUTES.financeShipmentClient, { clientId: shipment.shipperId })
        }
        className="w-fit"
      >
        <ActionButton variant="quiet" icon={ArrowLeft}>
          {shipper?.companyLegalName ?? 'Back'}
        </ActionButton>
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHead
          title={shipment.reference}
          subtitle={`${bookings.length} booking${bookings.length === 1 ? '' : 's'} · ${
            settlements.length
          } counterpart${settlements.length === 1 ? 'y' : 'ies'}`}
          badge={<StageChip stage={stage} held={held} />}
        />
        <ChannelBadge channel={shipment.source as OriginationChannel} />
      </div>

      {actionError ? (
        <div className="rounded-card border border-destructive/40 bg-destructive-subtle px-4 py-3 text-sm font-semibold text-destructive-subtle-foreground">
          {actionError}
        </div>
      ) : null}

      {/* Route + client */}
      <div className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-card px-4 py-3 shadow-card">
        <MapPin aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-foreground">
          <span>{shipment.pickupLocationCity}</span>
          <span className="text-muted-foreground">→</span>
          <span>{shipment.deliveryLocationCity}</span>
        </div>
        {shipper ? (
          <span className="ml-auto flex items-center gap-2">
            <Avatar name={shipper.companyLegalName} logoUrl={shipper.logoUrl} size={24} />
            <span className="text-sm font-bold text-foreground">{shipper.companyLegalName}</span>
          </span>
        ) : null}
      </div>

      {/* ── The money path ────────────────────────────────────────────────── */}
      <Panel
        title="Paying this shipment"
        subtitle="Every booking proven → release the consignment → pay each transporter once"
        dense
      >
        <ol className="flex flex-col gap-2.5">
          <PayStep
            index={1}
            icon={FileText}
            title="Proof of delivery"
            state={bookings.length > 0 && unproven.length === 0 ? 'done' : 'current'}
            detail={
              bookings.length === 0
                ? 'No bookings on this shipment yet.'
                : unproven.length === 0
                  ? `All ${bookings.length} booking${bookings.length === 1 ? '' : 's'} proven — the shipment is complete.`
                  : `${bookings.length - unproven.length} of ${bookings.length} proven. ${unproven.length} booking${
                      unproven.length === 1 ? '' : 's'
                    } still hold the whole payout: ${unproven.map((b) => b.reference).join(', ')}`
            }
          >
            {unproven.length > 0 ? (
              <div className="mt-2.5 flex flex-col gap-1.5">
                {unproven.map((booking) => (
                  <div
                    key={booking.id}
                    className="flex flex-wrap items-center gap-3 rounded-card-nested border border-dashed border-accent/50 bg-accent-subtle/40 px-3.5 py-2.5"
                  >
                    <span className="font-mono text-xs font-bold text-foreground">{booking.reference}</span>
                    <span className="min-w-[7rem] flex-1 truncate text-xs font-semibold text-muted-foreground">
                      {booking.containerNumber ? `${booking.containerNumber} · ` : ''}
                      {booking.cargoType}
                    </span>
                    <Link to={buildPath(ROUTES.financeShipmentBooking, { bookingId: booking.id })}>
                      <ActionButton variant="ghost" icon={Clock}>
                        {booking.status}
                      </ActionButton>
                    </Link>
                  </div>
                ))}
              </div>
            ) : null}
          </PayStep>

          <PayStep
            index={2}
            icon={Banknote}
            title="Release the shipment"
            state={shipment.payoutReleasedAt ? 'done' : unproven.length > 0 ? 'waiting' : 'current'}
            detail={releaseDetail(shipment, unproven, held)}
            action={
              shipment.payoutReleasedAt ? null : unproven.length > 0 ? null : held ? (
                <HeldChip label="Blocked by hold" />
              ) : (
                <ActionButton
                  variant="primary"
                  icon={Banknote}
                  onClick={handleRelease}
                  disabled={releaseShipment.isPending}
                >
                  {releaseShipment.isPending ? 'Releasing…' : `Release ${fmtDjf(money.costDjf)}`}
                </ActionButton>
              )
            }
          />

          <PayStep
            index={3}
            icon={Receipt}
            title={`Pay ${settlements.length === 1 ? 'the transporter' : 'each transporter'}`}
            state={
              settlements.length > 0 && settledCount === settlements.length
                ? 'done'
                : payable.length > 0
                  ? 'current'
                  : 'waiting'
            }
            detail={
              settlements.length === 0
                ? 'No transporter costs recorded yet.'
                : settledCount === settlements.length
                  ? `All ${settlements.length} settlement${settlements.length === 1 ? '' : 's'} paid · ${fmtDjf(money.paidOutDjf)} out`
                  : payable.length > 0
                    ? `${payable.length} transporter${payable.length === 1 ? '' : 's'} payable now · ${fmtDjf(payableTotal)}`
                    : held
                      ? 'Frozen while the hold stands — held money is never payable.'
                      : 'Payable as soon as the shipment is released.'
            }
          />
        </ol>

        {holds.length > 0 ? (
          <div className="mt-4 flex flex-col gap-2">
            {holds.map((hold) => (
              <div
                key={hold.id}
                className={cn(
                  'flex flex-wrap items-center gap-3 rounded-card-nested border px-4 py-3',
                  hold.clearedAt ? 'border-border bg-card' : 'border-dashed border-warning/60 bg-warning-subtle',
                )}
              >
                <PauseCircle
                  aria-hidden
                  className={cn('size-4 shrink-0', hold.clearedAt ? 'text-muted-foreground' : 'text-warning-subtle-foreground')}
                />
                <div className="min-w-0 flex-1">
                  <p className={cn('truncate text-sm font-bold', hold.clearedAt ? 'text-muted-foreground' : 'text-warning-subtle-foreground')}>
                    {hold.reason}
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-muted-foreground">
                    {hold.category.replace('_', ' ')}
                    {hold.bookingId ? ` · ${hold.bookingId}` : ''} · raised by {hold.raisedByName} ·{' '}
                    {new Date(hold.raisedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                {hold.clearedAt ? (
                  <Pill tone="neutral">Cleared</Pill>
                ) : (
                  <ActionButton variant="ghost" onClick={() => handleClearHold(hold.id)} disabled={clearHold.isPending}>
                    Clear hold
                  </ActionButton>
                )}
              </div>
            ))}
          </div>
        ) : null}
      </Panel>

      <MoneyBreakdown money={money} />

      {/* ── Settlement table ─────────────────────────────────────────────── */}
      <Panel
        title="Transporter settlements"
        subtitle="One row per transporter: everything they carried on this shipment, paid in one transfer"
        padded={false}
        dense
        action={
          payable.length > 0 ? (
            <Pill tone="orange">{fmtDjf(payableTotal)} payable</Pill>
          ) : settlements.length > 0 && settledCount === settlements.length ? (
            <Pill tone="teal">All settled</Pill>
          ) : null
        }
      >
        {settlements.length === 0 ? (
          <EmptyState message="No transporter costs recorded against this shipment yet." />
        ) : (
          <DataTable minWidth={900}>
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
              {settlements.map((settlement) => (
                <tr key={settlement.partnerId} className="transition-colors hover:bg-surface-sunken/60">
                  <Td>
                    <span className="flex items-center gap-3">
                      <Avatar name={settlement.partnerName} size={36} />
                      <span className="min-w-0">
                        <span className="block text-sm font-bold text-foreground">{settlement.partnerName}</span>
                      </span>
                    </span>
                  </Td>
                  <Td align="right">
                    <span className="font-mono text-sm font-extrabold tabular-nums text-foreground">{settlement.bookingsCount}</span>
                    {settlement.hasUnpricedBookings ? (
                      <span className="mt-0.5 block text-xs font-semibold text-accent-subtle-foreground">unpriced booking(s)</span>
                    ) : null}
                  </Td>
                  <Td align="right">
                    <MoneyAmount value={settlement.totalMinorUnits} direction="out" className="text-sm" />
                  </Td>
                  <Td>
                    <SettlementChip status={held ? 'blocked' : settlement.status} />
                  </Td>
                  <Td align="right">
                    {settlement.status === 'payable' ? (
                      <ActionButton variant="primary" icon={Banknote} onClick={() => setPaying(settlement)}>
                        Pay {fmtDjf(settlement.totalMinorUnits)}
                      </ActionButton>
                    ) : settlement.paidOrder ? (
                      <Link to={buildPath(ROUTES.financePayment, { paymentId: settlement.paidOrder.id })}>
                        <ActionButton variant="ghost" icon={Receipt}>
                          Voucher
                        </ActionButton>
                      </Link>
                    ) : (
                      <span className="text-xs font-semibold text-muted-foreground">
                        {held ? 'Frozen by the hold' : shipment.payoutReleasedAt ? '—' : 'Waiting on release'}
                      </span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Panel>

      {/* ── Bookings + sidebar ───────────────────────────────────────────── */}
      <div className="grid gap-3 xl:grid-cols-3">
        <Panel
          className="xl:col-span-2"
          title="Bookings"
          subtitle="One container or one vehicle each — delivered and proven separately, paid together"
          padded={false}
          dense
          action={
            <Pill tone={unproven.length > 0 ? 'orange' : 'teal'}>
              {bookings.length - unproven.length}/{bookings.length} proven
            </Pill>
          }
        >
          {bookings.length === 0 ? (
            <EmptyState message="No bookings on this shipment." />
          ) : (
            <DataTable minWidth={880}>
              <thead>
                <tr>
                  <Th>Booking</Th>
                  <Th>Cargo</Th>
                  <Th>Transporter</Th>
                  <Th>Proof</Th>
                  <Th align="right">Cost</Th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((booking) => (
                  <tr
                    key={booking.id}
                    onClick={() => navigate(buildPath(ROUTES.financeShipmentBooking, { bookingId: booking.id }))}
                    className="cursor-pointer transition-colors hover:bg-surface-sunken/60"
                  >
                    <Td>
                      <span className="font-mono text-sm font-bold text-foreground">{booking.reference}</span>
                      {booking.containerNumber ? (
                        <span className="mt-0.5 block font-mono text-xs font-medium text-muted-foreground">{booking.containerNumber}</span>
                      ) : null}
                    </Td>
                    <Td>
                      <span className="text-sm font-semibold text-foreground">{booking.cargoType}</span>
                    </Td>
                    <Td>
                      <span className="text-sm font-bold text-foreground">{booking.partner?.companyLegalName ?? '—'}</span>
                    </Td>
                    <Td>
                      <BookingStageChip stage={bookingStage(booking)} />
                    </Td>
                    <Td align="right">
                      {booking.transporterCostMinorUnits != null ? (
                        <MoneyAmount value={Number(booking.transporterCostMinorUnits)} direction="out" unit={false} className="text-sm" />
                      ) : (
                        <Pill tone="orange">Unpriced</Pill>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </Panel>

        {invoice ? (
          <Panel
            title="Client invoice"
            dense
            action={
              <Link to={`${ROUTES.financeInvoices}/${invoice.id}`}>
                <ActionButton variant="ghost" icon={Receipt}>
                  Open invoice
                </ActionButton>
              </Link>
            }
          >
            <dl className="flex flex-col gap-3">
              <Econ label="Invoice">
                <span className="font-mono text-sm font-bold text-foreground">{invoice.number}</span>
              </Econ>
              <Econ label="Amount">
                <MoneyAmount value={Number(invoice.totalMinorUnits)} direction="in" className="text-sm" />
              </Econ>
              <Econ label="Due">
                <span className="text-sm font-bold text-foreground">
                  {new Date(invoice.contractDeadline).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                </span>
              </Econ>
              <Econ label="Status">
                {invoice.status === 'Paid' ? <Pill tone="teal">Settled</Pill> : <Pill tone="amber">Outstanding</Pill>}
              </Econ>
            </dl>
          </Panel>
        ) : (
          <Panel title="Client invoice" dense>
            {shipment.clientRateMinorUnits == null ? (
              settingRate ? (
                <form onSubmit={handleSetRate} className="flex flex-col gap-2.5">
                  <label className="text-[11px] font-bold text-foreground block">Client rate (what the shipper is billed)</label>
                  <Input type="number" min={0} value={rateInput} onChange={(e) => setRateInput(e.target.value)} placeholder="e.g. 250000" />
                  <div className="flex items-center gap-2">
                    <Button type="submit" size="sm" disabled={setClientRate.isPending} className="rounded-lg bg-primary px-4 font-semibold text-primary-foreground">
                      {setClientRate.isPending ? 'Saving…' : 'Save rate'}
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setSettingRate(false)} className="rounded-lg">
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {/* Typing a figure is the fallback, not the first move: the
                      price is containers × the transporter's own per-mission
                      price, and one button applies it. */}
                  <p className="text-xs font-semibold leading-relaxed text-muted-foreground">
                    No price on this shipment — it predates automatic pricing. The transporter's price list can fill it in.
                  </p>
                  <ActionButton
                    variant="primary"
                    icon={Banknote}
                    onClick={() => reprice.mutate(shipment.id)}
                    disabled={reprice.isPending}
                  >
                    {reprice.isPending ? 'Pricing…' : 'Price from the price list'}
                  </ActionButton>
                  <button
                    type="button"
                    onClick={() => setSettingRate(true)}
                    className="w-fit text-[11px] font-bold text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  >
                    Enter a negotiated price instead
                  </button>
                </div>
              )
            ) : bookings.length > 0 && unproven.length === 0 ? (
              <div className="flex flex-col gap-2.5">
                <p className="text-xs font-semibold leading-relaxed text-muted-foreground">
                  Delivered and on the month's statement. Bill it on its own only if it shouldn't wait for month end.
                </p>
                <ActionButton variant="primary" icon={Receipt} onClick={handleIssueInvoice} disabled={issueInvoice.isPending}>
                  {issueInvoice.isPending ? 'Issuing…' : 'Issue invoice'}
                </ActionButton>
              </div>
            ) : (
              <p className="text-xs font-semibold leading-relaxed text-muted-foreground">
                Priced. It goes onto the client's end-of-month statement — Fleetin funds it until then.
              </p>
            )}
          </Panel>
        )}
      </div>

      {/* ── Pay transporter ──────────────────────────────────────────────── */}
      {paying ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 cursor-default"
            onClick={() => {
              setPaying(null);
              setPayError(null);
            }}
          />
          <div role="dialog" aria-modal="true" className="relative flex w-full max-w-md flex-col overflow-hidden rounded-card border border-border bg-card shadow-2xl">
            <div className="flex items-start gap-3 border-b border-border-subtle px-5 py-4">
              <IconChip icon={Banknote} tint="teal" size={36} />
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-extrabold tracking-tight text-foreground">Pay {paying.partnerName}</h2>
                <p className="mt-0.5 text-xs font-semibold text-muted-foreground">
                  {paying.bookingsCount} booking{paying.bookingsCount === 1 ? '' : 's'} · {fmtDjf(paying.totalMinorUnits)}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-3 px-5 py-4">
              {payError ? (
                <div className="rounded-lg border border-destructive/40 bg-destructive-subtle px-3 py-2 text-xs font-semibold text-destructive-subtle-foreground">
                  {payError}
                </div>
              ) : null}
              <label className="text-[11px] font-bold text-foreground block">Pay from</label>
              <BankAccountSelect value={payBankAccountId} onChange={setPayBankAccountId} />
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border-subtle bg-surface-sunken px-5 py-3.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-lg"
                onClick={() => {
                  setPaying(null);
                  setPayError(null);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!payBankAccountId || payTransporter.isPending}
                onClick={handlePay}
                className="rounded-lg bg-primary px-5 font-semibold text-primary-foreground"
              >
                {payTransporter.isPending ? 'Paying…' : `Pay ${fmtDjf(paying.totalMinorUnits)}`}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ── Pieces ──────────────────────────────────────────────────────────────── */

const formatDate = (iso?: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

function releaseDetail(
  shipment: { payoutReleasedAt: string | null },
  unproven: { reference: string }[],
  held: boolean,
): string {
  if (shipment.payoutReleasedAt) {
    return `Released ${formatDate(shipment.payoutReleasedAt)}. The whole shipment's money is authorised to leave.`;
  }
  if (unproven.length > 0) {
    return `Blocked: ${unproven.length} booking${unproven.length === 1 ? '' : 's'} ${unproven.length === 1 ? 'has' : 'have'} no proof of delivery yet. One unproven booking freezes the entire shipment.`;
  }
  if (held) return 'A hold is open. Clear it and this releases immediately.';
  return 'Ready now — every booking is proven.';
}

type StepState = 'done' | 'current' | 'waiting';

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
        'rounded-card-nested border px-3.5 py-3 transition-colors',
        state === 'current' ? 'border-primary/40 bg-primary-subtle/30' : state === 'done' ? 'border-border-subtle bg-card' : 'border-border-subtle bg-surface-sunken',
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        {state === 'done' ? (
          <IconChip icon={Check} tint="teal" size={36} />
        ) : (
          <IconChip icon={Icon} tint={state === 'current' ? 'orange' : 'neutral'} size={36} />
        )}
        <div className="min-w-[10rem] flex-1">
          <p className={cn('text-sm font-bold', state === 'waiting' ? 'text-muted-foreground' : 'text-foreground')}>
            <span className="mr-1.5 font-mono text-xs text-muted-foreground">{index}</span>
            {title}
          </p>
          <p className="mt-0.5 text-xs font-semibold leading-relaxed text-muted-foreground">{detail}</p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </li>
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
