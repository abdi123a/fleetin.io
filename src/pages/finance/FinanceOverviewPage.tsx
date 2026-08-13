import { useState } from 'react';
import { Link } from 'react-router-dom';

import { ROUTES } from '@/config/routes';
import { ArrowRight, Banknote, Clock, FileText, Landmark, PauseCircle, Receipt, TrendingUp, Wallet } from '@/design-system/icons';
import { compactDjf, fmtDjf, pct } from '@/lib/finance';

import { cn } from '@/utils';

import { ContractRemindersPanel } from './components/ContractReminders';
import { ExposureChart, type ExposurePoint } from './components/ExposureChart';
import {
  ActionButton,
  Bar,
  DirectionGlyph,
  EmptyState,
  FilterPills,
  ListRow,
  MoneyAmount,
  PageHead,
  Panel,
  Pill,
  RiskTag,
  Ring,
  StatCard,
} from './components/kit';
import { useFinanceModel } from './model';

/**
 * The one-screen answer to "where is our money right now".
 *
 * Four figures carry the whole working-capital loop: what is payable, what is
 * frozen, what CAC has funded, what clients still owe. Everything else on this
 * page is a list of names — because that is what an operator acts on.
 */
export function FinanceOverviewPage() {
  const model = useFinanceModel();
  const [feed, setFeed] = useState<'queue' | 'paid'>('queue');

  const utilisation = model.bankCeilingTotal > 0 ? model.bankDrawnTotal / model.bankCeilingTotal : 0;
  const topQueue = model.queue.slice(0, 5);
  // Largest exposure first, so the curve opens on the client that matters most.
  const exposure: ExposurePoint[] = [...model.clientAr]
    .filter((row) => row.openTotal > 0)
    .sort((a, b) => b.openTotal - a.openTotal)
    .map((row) => ({
      id: row.client.id,
      label: row.client.name,
      withinTermsDjf: row.openTotal - row.overdueTotal,
      pastDueDjf: row.overdueTotal,
      dso: row.dso,
      termsDays: row.client.paymentTermsDays,
    }));
  const worstClient = [...exposure].sort((a, b) => b.pastDueDjf - a.pastDueDjf)[0];
  /*
   * The payout feed lists VOUCHERS, not cost lines. One voucher is one promise
   * kept — "you delivered ten containers, here is the money for all ten" — and
   * showing ten rows for one transfer would misrepresent both the count and
   * the work.
   */
  const recentPayouts = [...model.payments]
    .sort((a, b) => b.paidAt.localeCompare(a.paidAt))
    .slice(0, 4);

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-4 pb-8 pt-1 sm:px-6">
      <PageHead
        title="Finance"
        subtitle="Payouts out on CAC money, receivables closing the loop."
        badge={
          model.queue.filter((item) => item.priority === 'now').length > 0 ? (
            <Pill tone="red">
              {model.queue.filter((item) => item.priority === 'now').length} need a decision
            </Pill>
          ) : (
            <Pill tone="teal">Nothing urgent</Pill>
          )
        }
        actions={
          <Link to={ROUTES.financeShipments}>
            <ActionButton variant="primary" icon={ArrowRight}>
              Open shipment book
            </ActionButton>
          </Link>
        }
      />

      <ContractRemindersPanel />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          {/* ── The hero: money Fleetin has fronted and not yet recovered ── */}
          {/* The hero is a brand tile like the Shipments row: solid teal fill,
              white disc with the mark in the tile's own colour. */}
          <div className="relative overflow-hidden rounded-card bg-tile-teal p-6 shadow-card">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-white text-tile-teal">
                    <Landmark aria-hidden className="size-5" />
                  </span>
                  <span className="text-sm font-bold text-tile-teal-foreground">
                    Drawn from CAC Bank
                  </span>
                </div>
                <p className="mt-4 font-mono text-[40px] font-extrabold leading-none tracking-tight tabular-nums text-tile-teal-foreground">
                  {fmtDjf(model.bankDrawnTotal)}
                </p>
                <p className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-tile-teal-foreground/75">
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 font-bold text-tile-teal-foreground">
                    <TrendingUp aria-hidden className="size-3.5" />
                    {pct(utilisation)} of ceilings
                  </span>
                  {fmtDjf(model.bankCeilingTotal - model.bankDrawnTotal)} headroom left across{' '}
                  {model.sources.length} sources
                </p>
              </div>
              <Ring
                value={utilisation}
                label={pct(utilisation)}
                caption="used"
                tone="onFill"
                size={118}
                className="[&_span]:text-tile-teal-foreground"
              />
            </div>
          </div>

          {/* ── The four positions ─────────────────────────────────────────── */}
          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard
              icon={Banknote}
              tint="orange"
              label="Payable now"
              value={compactDjf(model.payableNowTotal)}
              hint="Released legs, not yet paid"
              badge={<Pill tone="orange">Money out</Pill>}
            />
            <StatCard
              icon={PauseCircle}
              tint="amber"
              label="Frozen on hold"
              value={compactDjf(model.frozenOnHoldTotal)}
              hint="Paused — not payable"
              tone={model.frozenOnHoldTotal > 0 ? 'held' : 'plain'}
              badge={<Pill tone="amber">Held</Pill>}
            />
            <StatCard
              icon={Receipt}
              tint="teal"
              label="Receivables open"
              value={compactDjf(model.arOpenTotal)}
              hint={`${model.invoices.filter((invoice) => !invoice.paidAt).length} invoices out`}
              badge={<Pill tone="teal">Money in</Pill>}
            />
            <StatCard
              icon={Clock}
              tint="red"
              label="Past due"
              value={compactDjf(model.arOverdueTotal)}
              hint={
                model.dsoOverall !== null
                  ? `DSO ${model.dsoOverall.toFixed(0)} days`
                  : 'No settled history'
              }
              tone={model.arOverdueTotal > 0 ? 'critical' : 'plain'}
              badge={<Pill tone="red">Chase</Pill>}
            />
          </div>

          {/* ── Client exposure — the deadline is the zero line ────────────── */}
          <Panel
            title="Client exposure"
            subtitle={`${compactDjf(model.arOpenTotal)} open · ${compactDjf(model.arOverdueTotal)} of it past due`}
            action={
              <div className="flex items-center gap-4 text-xs font-bold text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="size-2 rounded-full bg-primary" />
                  Within terms
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="size-2 rounded-full bg-accent" />
                  Past due
                </span>
              </div>
            }
          >
            {exposure.length > 1 ? (
              <>
                <ExposureChart points={exposure} />
                <p className="mt-2 text-xs font-semibold leading-relaxed text-muted-foreground">
                  {worstClient ? (
                    <>
                      <span className="text-foreground">
                        {worstClient.label} carries the most late money —{' '}
                        {compactDjf(worstClient.pastDueDjf)} of{' '}
                        {compactDjf(worstClient.withinTermsDjf + worstClient.pastDueDjf)} is past
                        its due date.
                      </span>{' '}
                      Anything below the line is money the facility is still funding.
                    </>
                  ) : (
                    'Every client is inside their agreed terms.'
                  )}
                </p>
              </>
            ) : (
              <EmptyState message="Not enough open receivables to chart." />
            )}
          </Panel>

          {/* ── Facility capacity — one bar per ceiling ────────────────────── */}
          <Panel
            title="Capacity by funding source"
            subtitle="An exhausted ceiling stops transporter payouts"
            action={
              <Link to={ROUTES.financeShipments}>
                <ActionButton variant="quiet">Shipments</ActionButton>
              </Link>
            }
          >
            <div className="flex flex-col gap-4">
              {model.sources.map((source) => {
                const position = model.positions.get(source.id);
                if (!position) return null;
                const hot = position.utilisation >= 0.8;
                return (
                  <div key={source.id} className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-[9rem] items-center gap-2.5">
                        <span className="text-sm font-bold leading-snug text-foreground">
                          {source.name}
                        </span>
                        <RiskTag bearer={source.riskBearer} />
                      </div>
                      <span className="shrink-0 font-mono text-sm font-bold tabular-nums text-foreground">
                        {compactDjf(position.drawnDjf)}
                        <span className="font-sans font-semibold text-muted-foreground">
                          {' '}
                          / {compactDjf(source.ceilingDjf)}
                        </span>
                      </span>
                    </div>
                    <Bar value={position.utilisation} tone={hot ? 'orange' : 'teal'} />
                    <p className="mt-1.5 text-xs font-semibold text-muted-foreground">
                      {pct(position.utilisation)} used · {compactDjf(position.availableDjf)} available
                      {hot ? ' · running hot' : ''}
                    </p>
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>

        {/* ── Right rail: the names that need something ─────────────────────── */}
        <div className="flex min-w-0 flex-col gap-4">
          {/* One panel, two sides of the same day: what still needs a call,
              and what has already gone out. Tabs rather than two stacked
              cards — they are read one at a time, never compared. */}
          <Panel
            title="Activity"
            padded={false}
            action={
              <FilterPills
                options={[
                  { key: 'queue', label: 'To decide', count: model.queue.length, tone: 'orange' },
                  { key: 'paid', label: 'Paid', count: recentPayouts.length, tone: 'teal' },
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
                        <span
                          className={cn(
                            'inline-flex size-9 shrink-0 items-center justify-center rounded-full',
                            item.direction === 'out' ? 'bg-accent-bold' : 'bg-primary-bold',
                          )}
                        >
                          <DirectionGlyph
                            direction={item.direction}
                            className={
                              item.direction === 'out'
                                ? 'text-accent-bold-foreground'
                                : 'text-primary-bold-foreground'
                            }
                          />
                        </span>
                      }
                      right={
                        item.amountDjf !== undefined ? (
                          <MoneyAmount
                            value={item.amountDjf}
                            direction={item.direction}
                            unit={false}
                            className="text-sm"
                          />
                        ) : undefined
                      }
                    />
                  ))
                ) : (
                  <EmptyState message="Nothing waiting on a human." />
                )
              ) : recentPayouts.length > 0 ? (
                recentPayouts.map((payment) => (
                  <ListRow
                    key={payment.id}
                    name={payment.transporterName}
                    logoUrl={model.transporterById.get(payment.transporterId)?.logoUrl}
                    sub={`${payment.bookingIds.length} booking${
                      payment.bookingIds.length === 1 ? '' : 's'
                    } on ${payment.shipmentId} · ${payment.id}`}
                    right={
                      <MoneyAmount
                        value={payment.amountDjf}
                        direction="out"
                        unit={false}
                        className="text-sm"
                      />
                    }
                    rightSub={new Date(payment.paidAt).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: 'short',
                    })}
                  />
                ))
              ) : (
                <EmptyState message="No payments yet." />
              )}
            </div>
            <div className="border-t border-border-subtle px-5 py-3">
              <Link to={feed === 'queue' ? ROUTES.financeShipments : ROUTES.financeShipments}>
                <ActionButton variant="quiet">Open the shipment book</ActionButton>
              </Link>
            </div>
          </Panel>


          <Panel title="Unpriced work" padded={false}>
            <div className="flex flex-col gap-1 px-3 pb-4">
              {model.economics.unpricedRows.length > 0 ? (
                model.economics.unpricedRows.map((row) => {
                  // Whether money has LEFT is the difference between a pricing
                  // chore and an emergency, and that is a shipment fact.
                  const parent = model.shipmentOfBooking.get(row.booking.id);
                  const moneyOut = parent?.shipment.payout.releasedAt !== undefined;
                  return (
                    <ListRow
                      key={row.booking.id}
                      name={row.booking.id}
                      leading={
                        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-bold">
                          <FileText aria-hidden className="size-[18px] text-accent-bold-foreground" />
                        </span>
                      }
                      sub={`${parent?.client?.name ?? ''} · ${parent?.shipment.id ?? ''} · ${compactDjf(
                        row.costTotal,
                      )} cost committed`}
                      right={
                        moneyOut ? (
                          <Pill tone="orange">Money out</Pill>
                        ) : (
                          <Pill tone="neutral">No price</Pill>
                        )
                      }
                      tone={moneyOut ? 'attention' : 'plain'}
                    />
                  );
                })
              ) : (
                <EmptyState message="Every booking is priced." />
              )}
            </div>
          </Panel>

          <Link to={ROUTES.financeShipments} className="block">
            <StatCard
              icon={Wallet}
              tint="neutral"
              label="Transporter promise"
              value={
                model.transporterRows.length > 0
                  ? pct(
                      model.transporterRows
                        .map((row) => row.promiseKeptRate)
                        .filter((rate): rate is number => rate !== null)
                        .reduce((sum, rate, _index, all) => sum + rate / all.length, 0),
                    )
                  : '—'
              }
              hint={`Paid within ${model.settings.payoutPromiseDays} days of release`}
              badge={<Pill tone="neutral">Fast pay</Pill>}
            />
          </Link>
        </div>
      </div>
    </div>
  );
}

export default FinanceOverviewPage;
