import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { ROUTES, buildPath } from '@/config/routes';
import { ArrowRight, Banknote, Clock, FileText, Landmark, PauseCircle, Receipt, TrendingUp } from '@/design-system/icons';
import { compactDjf, fmtDjf, pct } from '@/lib/finance';
import { useShippers } from '@/features/shippers/api/queries';
import { useRepriceUnpricedShipments, useShipmentsRaw } from '@/features/shipments/api/queries';
import { useCreditFacilities, useDrawdowns, useInvoices, useOpenHolds, usePaymentOrders } from '@/features/finance';
import { cn } from '@/utils';

import { ContractRemindersPanel } from './components/ContractReminders';
import { ExposureChart, type ExposurePoint } from './components/ExposureChart';
import { ActionButton, Bar, DirectionGlyph, EmptyState, FilterPills, ListRow, MoneyAmount, PageHead, Panel, Pill, Ring, StatCard } from './components/kit';
import { aggregateMoneyPosition } from './shipmentFinance';

interface QueueItem {
  id: string;
  title: string;
  detail: string;
  direction: 'out' | 'in';
  amountDjf?: number;
}

/**
 * The one-screen answer to "where is our money right now" — built against
 * real, book-wide data. A few of the mock's queue kinds needed per-booking
 * data to compute (missing PoD, per-transporter settlement pending), which
 * would be N+1 at this scale; those still surface on the shipment's own
 * detail page, just not summarized here. Credit facilities/drawdowns are
 * standalone real objects (no per-shipment funding link), so "capacity by
 * funding source" reads from those directly rather than a per-shipment
 * `FundingSource` that doesn't exist.
 */
export function FinanceOverviewPage() {
  const [feed, setFeed] = useState<'queue' | 'paid'>('queue');

  const { data: shippersData } = useShippers({ limit: 200 });
  const { data: shipmentsData } = useShipmentsRaw({ limit: 500 });
  const { data: invoicesData } = useInvoices({ limit: 500 });
  const { data: paidOrdersData } = usePaymentOrders({ status: 'Paid', limit: 20 });
  const { data: openHolds = [] } = useOpenHolds();
  const { data: facilities = [] } = useCreditFacilities();
  const { data: drawdowns = [] } = useDrawdowns();

  const shippers = useMemo(() => shippersData?.items ?? [], [shippersData]);
  const shipments = useMemo(() => shipmentsData?.items ?? [], [shipmentsData]);
  const invoices = useMemo(() => invoicesData?.items ?? [], [invoicesData]);
  const paidOrders = useMemo(() => paidOrdersData?.items ?? [], [paidOrdersData]);

  const money = useMemo(() => aggregateMoneyPosition(shipments, invoices, paidOrders), [shipments, invoices, paidOrders]);

  const bankDrawnTotal = drawdowns.reduce((sum, d) => sum + Number(d.amountMinorUnits) - Number(d.repaidMinorUnits), 0);
  const bankCeilingTotal = facilities.reduce((sum, f) => sum + Number(f.limitMinorUnits), 0);
  const utilisation = bankCeilingTotal > 0 ? bankDrawnTotal / bankCeilingTotal : 0;

  const exposure: ExposurePoint[] = useMemo(() => {
    const byShipper = new Map<string, typeof shipments>();
    for (const shipment of shipments) {
      const list = byShipper.get(shipment.shipperId) ?? [];
      list.push(shipment);
      byShipper.set(shipment.shipperId, list);
    }
    return shippers
      .map((shipper): ExposurePoint | null => {
        const list = byShipper.get(shipper.id) ?? [];
        if (list.length === 0) return null;
        const shipperInvoices = invoices.filter((inv) => inv.shipperId === shipper.id);
        const pos = aggregateMoneyPosition(list, shipperInvoices, paidOrders);
        if (pos.outstandingDjf <= 0) return null;
        return {
          id: shipper.id,
          label: shipper.companyLegalName,
          withinTermsDjf: pos.outstandingDjf - pos.overdueDjf,
          pastDueDjf: pos.overdueDjf,
          dso: null,
          // The real per-shipper payment-terms field doesn't exist yet — the
          // backend's own invoice-issuing code uses a fixed 30-day placeholder
          // (`contractDeadline = issueDate + 30 days`), so this mirrors that,
          // not an invented number.
          termsDays: 30,
        };
      })
      .filter((point): point is ExposurePoint => point !== null)
      .sort((a, b) => b.pastDueDjf + b.withinTermsDjf - (a.pastDueDjf + a.withinTermsDjf));
  }, [shippers, shipments, invoices, paidOrders]);
  const worstClient = [...exposure].sort((a, b) => b.pastDueDjf - a.pastDueDjf)[0];

  const repriceUnpriced = useRepriceUnpricedShipments();

  const unpricedShipments = useMemo(
    () => shipments.filter((s) => s.clientRateMinorUnits == null).sort((a, b) => Number(b.rateMinorUnits) - Number(a.rateMinorUnits)),
    [shipments],
  );

  const queue: QueueItem[] = useMemo(() => {
    const items: QueueItem[] = [];
    for (const shipment of shipments) {
      if (shipment.payoutReleasedAt && shipment.clientRateMinorUnits == null) {
        items.push({
          id: `unpriced-released-${shipment.id}`,
          title: `${shipment.reference} released, still unpriced`,
          detail: 'Price it from the transporter\'s price list.',
          direction: 'in',
        });
      } else if (!shipment.payoutReleasedAt && shipment.clientRateMinorUnits == null && ['POD Submitted', 'Completed'].includes(shipment.status)) {
        items.push({
          id: `unpriced-pending-${shipment.id}`,
          title: `${shipment.reference} delivered, still unpriced`,
          detail: 'Price it from the transporter\'s price list.',
          direction: 'in',
        });
      }
    }
    for (const hold of openHolds) {
      items.push({ id: `hold-${hold.id}`, title: `Hold open on a shipment`, detail: hold.reason, direction: 'out' });
    }
    for (const invoice of invoices) {
      if (invoice.status !== 'Paid' && new Date(invoice.contractDeadline).getTime() < Date.now()) {
        items.push({
          id: `overdue-${invoice.id}`,
          title: `${invoice.number} overdue`,
          detail: `${invoice.shipperCompany} — due ${new Date(invoice.contractDeadline).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`,
          direction: 'in',
          amountDjf: Number(invoice.remainingMinorUnits),
        });
      }
    }
    return items;
  }, [shipments, openHolds, invoices]);
  const topQueue = queue.slice(0, 5);

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-4 pb-8 pt-1 sm:px-6">
      <PageHead
        title="Finance"
        subtitle="Releases, receivables and facility drawdowns"
        badge={queue.length > 0 ? <Pill tone="red">{queue.length} pending</Pill> : <Pill tone="teal">All clear</Pill>}
        actions={
          <Link to={ROUTES.financeShipments}>
            <ActionButton variant="primary" icon={ArrowRight}>
              Open shipments
            </ActionButton>
          </Link>
        }
      />

      <ContractRemindersPanel />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="relative overflow-hidden rounded-card bg-tile-teal p-6 shadow-card">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-white text-tile-teal">
                    <Landmark aria-hidden className="size-5" />
                  </span>
                  <span className="text-sm font-bold text-tile-teal-foreground">Outstanding Drawdowns</span>
                </div>
                <p className="mt-4 font-mono text-[40px] font-extrabold leading-none tracking-tight tabular-nums text-tile-teal-foreground">{fmtDjf(bankDrawnTotal)}</p>
                <p className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-tile-teal-foreground/75">
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 font-bold text-tile-teal-foreground">
                    <TrendingUp aria-hidden className="size-3.5" />
                    {pct(utilisation)} of limit
                  </span>
                  {fmtDjf(bankCeilingTotal - bankDrawnTotal)} available across {facilities.length} facilit{facilities.length === 1 ? 'y' : 'ies'}
                </p>
              </div>
              <Ring value={utilisation} label={pct(utilisation)} caption="drawn" tone="onFill" size={118} className="[&_span]:text-tile-teal-foreground" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard icon={Banknote} tint="orange" label="Payable now" value={compactDjf(money.payableDjf)} hint="Released, not yet settled" badge={<Pill tone="orange">Debit</Pill>} />
            <StatCard
              icon={PauseCircle}
              tint="amber"
              label="Open holds"
              value={String(openHolds.length)}
              hint="Disputes stopping settlement"
              tone={openHolds.length > 0 ? 'held' : 'plain'}
              badge={<Pill tone="amber">On hold</Pill>}
            />
            <StatCard icon={Receipt} tint="teal" label="Receivables" value={compactDjf(money.outstandingDjf)} hint={`${invoices.filter((i) => i.status !== 'Paid').length} invoices open`} badge={<Pill tone="teal">Credit</Pill>} />
            <StatCard
              icon={Clock}
              tint="red"
              label="Overdue"
              value={compactDjf(money.overdueDjf)}
              hint="Invoiced, deadline passed"
              tone={money.overdueDjf > 0 ? 'critical' : 'plain'}
              badge={<Pill tone="red">Receivables</Pill>}
            />
          </div>

          <Panel
            title="Shipper Exposure"
            subtitle={`${compactDjf(money.outstandingDjf)} receivables · ${compactDjf(money.overdueDjf)} overdue`}
            action={
              <div className="flex items-center gap-4 text-xs font-bold text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="size-2 rounded-full bg-primary" />
                  Within terms
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="size-2 rounded-full bg-accent" />
                  Overdue
                </span>
              </div>
            }
          >
            {exposure.length > 1 ? (
              <>
                <ExposureChart points={exposure} />
                <p className="mt-2 text-xs font-semibold leading-relaxed text-muted-foreground">
                  {worstClient ? (
                    <span className="text-foreground">
                      {worstClient.label} — {compactDjf(worstClient.pastDueDjf)} overdue of{' '}
                      {compactDjf(worstClient.withinTermsDjf + worstClient.pastDueDjf)}
                    </span>
                  ) : (
                    'Every shipper is within terms.'
                  )}
                </p>
              </>
            ) : (
              <EmptyState message="Not enough open receivables to chart." />
            )}
          </Panel>

          <Panel
            title="Facilities"
            subtitle="Drawn against each limit"
            action={
              <Link to={ROUTES.financeFunding}>
                <ActionButton variant="quiet">Funding</ActionButton>
              </Link>
            }
          >
            <div className="flex flex-col gap-4">
              {facilities.length === 0 ? (
                <EmptyState message="No facilities yet." />
              ) : (
                facilities.map((facility) => {
                  const facilityDrawdowns = drawdowns.filter((d) => d.facilityId === facility.id);
                  const drawn = facilityDrawdowns.reduce((sum, d) => sum + Number(d.amountMinorUnits) - Number(d.repaidMinorUnits), 0);
                  const limit = Number(facility.limitMinorUnits);
                  const util = limit > 0 ? drawn / limit : 0;
                  const hot = util >= 0.8;
                  return (
                    <div key={facility.id} className="min-w-0">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-bold leading-snug text-foreground">{facility.bankName}</span>
                        <span className="shrink-0 font-mono text-sm font-bold tabular-nums text-foreground">
                          {compactDjf(drawn)}
                          <span className="font-sans font-semibold text-muted-foreground"> / {compactDjf(limit)}</span>
                        </span>
                      </div>
                      <Bar value={util} tone={hot ? 'orange' : 'teal'} />
                      <p className="mt-1.5 text-xs font-semibold text-muted-foreground">
                        {pct(util)} drawn · {compactDjf(Math.max(0, limit - drawn))} available{hot ? ' · near limit' : ''}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Panel
            title="Activity"
            padded={false}
            action={
              <FilterPills
                options={[
                  { key: 'queue', label: 'To decide', count: queue.length, tone: 'orange' },
                  { key: 'paid', label: 'Settled', count: paidOrders.length, tone: 'teal' },
                ]}
                active={feed}
                onChange={setFeed}
              />
            }
          >
            <div className="flex flex-col gap-1 px-3 pb-3">
              {feed === 'queue' ? (
                topQueue.length > 0 ? (
                  topQueue.map((item) => (
                    <ListRow
                      key={item.id}
                      name={item.title}
                      sub={item.detail}
                      leading={
                        <span className={cn('inline-flex size-9 shrink-0 items-center justify-center rounded-full', item.direction === 'out' ? 'bg-accent-bold' : 'bg-primary-bold')}>
                          <DirectionGlyph direction={item.direction} className={item.direction === 'out' ? 'text-accent-bold-foreground' : 'text-primary-bold-foreground'} />
                        </span>
                      }
                      right={item.amountDjf !== undefined ? <MoneyAmount value={item.amountDjf} direction={item.direction} unit={false} className="text-sm" /> : undefined}
                    />
                  ))
                ) : (
                  <EmptyState message="Nothing to decide." />
                )
              ) : paidOrders.length > 0 ? (
                paidOrders.slice(0, 4).map((payment) => (
                  <ListRow
                    key={payment.id}
                    name={payment.transporterName}
                    sub={`${payment.number} on ${payment.missionId}`}
                    right={<MoneyAmount value={Number(payment.amountMinorUnits)} direction="out" unit={false} className="text-sm" />}
                    rightSub={payment.paidAt ? new Date(payment.paidAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : undefined}
                  />
                ))
              ) : (
                <EmptyState message="No settlements yet." />
              )}
            </div>
            <div className="border-t border-border-subtle px-5 py-3">
              <Link to={ROUTES.financeShipments}>
                <ActionButton variant="quiet">Open shipments</ActionButton>
              </Link>
            </div>
          </Panel>

          {/* A shipment created through the wizard is always priced now —
              containers × the transporter's own per-mission price. Anything
              listed here predates that, so the fix is one button, not nine
              trips into nine shipments to type a figure. */}
          <Panel
            title="Unpriced Work"
            subtitle={
              unpricedShipments.length > 0 ? 'Created before automatic pricing' : undefined
            }
            padded={false}
          >
            {unpricedShipments.length > 0 ? (
              <div className="flex flex-wrap items-center gap-3 border-b border-border-subtle px-5 pb-3">
                <ActionButton
                  variant="primary"
                  disabled={repriceUnpriced.isPending}
                  onClick={() => repriceUnpriced.mutate(undefined)}
                >
                  {repriceUnpriced.isPending
                    ? 'Pricing…'
                    : `Price all ${unpricedShipments.length} from the price list`}
                </ActionButton>
                {repriceUnpriced.isSuccess ? (
                  <span className="text-xs font-bold text-muted-foreground">
                    Priced {repriceUnpriced.data.priced} of {repriceUnpriced.data.considered}.
                  </span>
                ) : null}
              </div>
            ) : null}
            <div className="flex flex-col gap-1 px-3 pb-4">
              {unpricedShipments.length > 0 ? (
                unpricedShipments.slice(0, 8).map((shipment) => (
                  <ListRow
                    key={shipment.id}
                    name={shipment.reference}
                    leading={
                      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-bold">
                        <FileText aria-hidden className="size-[18px] text-accent-bold-foreground" />
                      </span>
                    }
                    sub={`${shipment.customerCompany} · ${compactDjf(Number(shipment.rateMinorUnits))} transport cost`}
                    right={shipment.payoutReleasedAt ? <Pill tone="orange">Released</Pill> : <Pill tone="neutral">Unpriced</Pill>}
                    tone={shipment.payoutReleasedAt ? 'attention' : 'plain'}
                    action={
                      <Link to={buildPath(ROUTES.financeShipmentDetail, { shipmentId: shipment.id })}>
                        <ActionButton variant="ghost">Open</ActionButton>
                      </Link>
                    }
                  />
                ))
              ) : (
                <EmptyState message="Every shipment is priced." />
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

export default FinanceOverviewPage;
