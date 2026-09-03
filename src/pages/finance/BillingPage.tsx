import { useMemo, useState, type ComponentType } from 'react';
import { Link } from 'react-router-dom';

import { PageHeader, TablePager, usePagedRows } from '@/components';
import { Button, Card, IconChip, Skeleton, StatisticCard } from '@/design-system';
import { ArrowDownLeft, ArrowUpRight, CheckCircle, Wallet } from '@/design-system/icons';
import { ROUTES } from '@/config/routes';
import { commissionOf, resolveCommission, useInvoices, type InvoiceRecord } from '@/features/finance';
import { usePartners } from '@/features/partners/api/queries';
import { useSettings } from '@/features/settings/api/queries';
import { useShippers } from '@/features/shippers/api/queries';
import { useAllShipmentsRaw, usePayTransporter } from '@/features/shipments/api/queries';
import type { ShipmentRecord } from '@/features/shipments/api/shipmentsService';
import { fmtDjf, fmtDocDate, fromMinorUnits } from '@/lib/finance';
import { CompanyName } from '@/pages/empty-returns/components/marks';
import { cn } from '@/utils';

/**
 * The money, and it only ever runs one way.
 *
 * **The shipper pays Fleetin the whole job. Fleetin pays the transporter that
 * amount less its share.** Every figure on this page is one half of that
 * sentence, and the page is laid out so the two halves stay visibly apart:
 * money IN is teal and arrives from a client, money OUT is orange and goes to
 * a haulier. Nothing here nets them together, because a business that funds
 * the gap between them has to see both sizes, not the difference.
 *
 * Three things, in the order they get asked:
 *
 *   1. **Where it stands** — four figures across the top.
 *   2. **What is due** — clients past their date, and hauliers still owed.
 *      Each haulier row carries its Pay button, because a queue that names an
 *      obligation and makes you go elsewhere to discharge it is a list, not a
 *      workflow.
 *   3. **What has happened** — the recent payments, both directions, newest
 *      first.
 *
 * Documents are raised on the Invoices page, never here. Billing is where you
 * watch the money move; Invoices is where you make the paper.
 */

/** Statuses that mean the containers are off the truck and the work is owed for. */
const DELIVERED = ['POD Submitted', 'Completed', 'Delivered'];

const DAY_MS = 86_400_000;

/** One movement of money, either direction — the shared shape of the feed. */
interface Movement {
  id: string;
  direction: 'in' | 'out';
  party: string;
  reference: string;
  amount: number;
  at: string;
}

/** A haulier owed for one delivered job. */
interface DueToTransporter {
  shipmentId: string;
  reference: string;
  transporter: string;
  amount: number;
  deliveredAt: string;
}

/** A client past their invoice date. */
interface OverdueInvoice {
  id: string;
  number: string;
  shipper: string;
  amount: number;
  daysLate: number;
}

export function BillingPage() {
  const [tab, setTab] = useState<'due' | 'recent'>('due');

  const { data: shipments = [], isLoading: shipmentsLoading } = useAllShipmentsRaw({});
  const { data: documents = [], isLoading: docsLoading } = useInvoices({ kind: 'all' });
  const { data: shipperPage } = useShippers({ limit: 200 });
  const { data: partnerPage } = usePartners({ limit: 200 });
  const { data: settings } = useSettings();
  const pay = usePayTransporter();

  const isLoading = shipmentsLoading || docsLoading;

  const model = useMemo(
    () =>
      buildMoney({
        shipments,
        documents,
        shippers: shipperPage?.items ?? [],
        partners: partnerPage?.items ?? [],
        housePct: settings?.fleetinCommissionPct ?? 0,
        now: Date.now(),
      }),
    [shipments, documents, shipperPage, partnerPage, settings],
  );

  const duePaged = usePagedRows(model.dueToTransporters);
  const recentPaged = usePagedRows(model.recent);

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <PageHeader title="Money" />

      {/*
        The four figures, as the house's filled KPI tiles.
        Colour carries the direction and nothing else: **teal is money coming
        in**, **orange is money going out**. They are the same two hues the
        rest of the app uses for "reports" and "asks", and putting the two
        directions in the same colour — which the bordered version did — made
        a reader work out from the words which way each number pointed.
        Collected is green because it is the one figure that is finished, and
        commission is the neutral slab: it is what is left over, not an
        obligation in either direction.
      */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MoneyTile
          title="Coming in"
          value={model.owedByShippers}
          note={
            model.overdue.length > 0
              ? `${model.overdue.length} invoice${model.overdue.length === 1 ? '' : 's'} overdue`
              : 'all within terms'
          }
          icon={ArrowDownLeft}
          variant="teal"
          loading={isLoading}
        />
        <MoneyTile
          title="Going out"
          value={model.owedToTransporters}
          note={
            model.dueToTransporters.length > 0
              ? `${model.dueToTransporters.length} job${model.dueToTransporters.length === 1 ? '' : 's'} awaiting payment`
              : 'every job paid'
          }
          icon={ArrowUpRight}
          variant="orange"
          loading={isLoading}
        />
        <MoneyTile
          title="Collected"
          value={model.collected}
          note={`${model.paidCount} invoice${model.paidCount === 1 ? '' : 's'} settled`}
          icon={CheckCircle}
          variant="green"
          loading={isLoading}
        />
        <MoneyTile
          title="Our commission"
          value={model.commission}
          note={model.takeRate !== null ? `${model.takeRate.toFixed(1)}% of billing` : 'nothing billed yet'}
          icon={Wallet}
          variant="slate"
          loading={isLoading}
        />
      </div>

      {/* Two questions, one control. "What do I owe" and "what has moved" are
          the same screen's two moods, and a page that shows both at once buries
          each in the other. */}
      <div className="flex gap-1 border-b border-border">
        {(
          [
            ['due', `Due${model.dueCount > 0 ? ` · ${model.dueCount}` : ''}`],
            ['recent', 'Recent payments'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              tab === key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {pay.isError ? (
        <p className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {(pay.error as Error).message}
        </p>
      ) : null}

      {tab === 'due' ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <Card className="flex flex-col p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-foreground">Transporters waiting to be paid</h2>
              <span className="text-xs tabular-nums text-muted-foreground">
                {fmtDjf(model.owedToTransporters)}
              </span>
            </div>

            {isLoading ? (
              <Skeletons />
            ) : model.dueToTransporters.length === 0 ? (
              <Empty copy="Every delivered job has been paid." />
            ) : (
              <>
                <ul className="flex flex-col">
                  {duePaged.rows.map((row) => (
                    <li
                      key={row.shipmentId}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border-subtle py-2.5 last:border-b-0"
                    >
                      <CompanyName
                        name={row.transporter}
                        size="sm"
                        className="min-w-[9rem] flex-1 text-sm font-medium"
                      />
                      <span className="shrink-0 text-right">
                        <span className="block text-sm font-semibold tabular-nums text-accent-subtle-foreground">
                          {fmtDjf(row.amount)}
                        </span>
                        <span className="block text-[11px] text-muted-foreground">
                          {row.reference} · {fmtDocDate(row.deliveredAt)}
                        </span>
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pay.isPending}
                        onClick={() => pay.mutate(row.shipmentId)}
                      >
                        Pay
                      </Button>
                    </li>
                  ))}
                </ul>
                <TablePager paged={duePaged} noun="jobs" className="mt-2" />
              </>
            )}
          </Card>

          <Card className="flex flex-col p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-foreground">Shippers past their date</h2>
              <Link to={ROUTES.financeInvoices} className="text-xs font-medium text-primary hover:underline">
                Invoices
              </Link>
            </div>

            {isLoading ? (
              <Skeletons />
            ) : model.overdue.length === 0 ? (
              <Empty copy="Nothing overdue. Every invoice is inside its terms." />
            ) : (
              <ul className="flex flex-col">
                {model.overdue.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center gap-3 border-b border-border-subtle py-2.5 last:border-b-0"
                  >
                    <CompanyName name={row.shipper} size="sm" className="min-w-0 flex-1 text-sm font-medium" />
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-semibold tabular-nums text-foreground">
                        {fmtDjf(row.amount)}
                      </span>
                      {/* The number of days is the point, not the date — a
                          reader scanning this column is ranking lateness. */}
                      <span className="block text-[11px] font-medium text-destructive">
                        {row.number} · {row.daysLate}d late
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      ) : (
        <Card className="flex flex-col p-4">
          {isLoading ? (
            <Skeletons />
          ) : model.recent.length === 0 ? (
            <Empty copy="No payments recorded yet." />
          ) : (
            <>
              <ul className="flex flex-col">
                {recentPaged.rows.map((move) => {
                  const out = move.direction === 'out';
                  const Glyph = out ? ArrowUpRight : ArrowDownLeft;
                  return (
                    <li
                      key={move.id}
                      className="flex items-center gap-3 border-b border-border-subtle py-2.5 last:border-b-0"
                    >
                      <IconChip
                        icon={Glyph}
                        size={36}
                        tint={out ? 'orange' : 'teal'}
                        className="shrink-0"
                      />
                      <span className="min-w-0 flex-1">
                        <CompanyName name={move.party} size="xs" className="text-sm font-medium" />
                        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                          {out ? 'Paid to transporter' : 'Received from shipper'} · {move.reference} ·{' '}
                          {fmtDocDate(move.at)}
                        </span>
                      </span>
                      {/* Direction twice — glyph and sign — so it survives a
                          greyscale screenshot. */}
                      <span
                        className={cn(
                          'shrink-0 text-sm font-semibold tabular-nums',
                          out ? 'text-accent-subtle-foreground' : 'text-primary-subtle-foreground',
                        )}
                      >
                        {out ? '−' : '+'}
                        {fmtDjf(move.amount)}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <TablePager paged={recentPaged} noun="payments" className="mt-2" />
            </>
          )}
        </Card>
      )}
    </div>
  );
}

/**
 * One pass over the book, producing both directions.
 *
 * The two sides are counted from different records on purpose, because they
 * mean different things:
 *
 *   - **In** comes from ISSUED INVOICES. A shipper cannot owe money nobody has
 *     billed them for.
 *   - **Out** comes from DELIVERED SHIPMENTS, whether or not the client has
 *     been billed or has paid. The haulier did the work; Fleetin owes them
 *     regardless of how slowly the invoice moves. Funding that gap is the
 *     business, and it is the reason both figures share one screen.
 *
 * Proformas are excluded throughout. A quotation is not a receivable.
 */
function buildMoney({
  shipments,
  documents,
  shippers,
  partners,
  housePct,
  now,
}: {
  shipments: ShipmentRecord[];
  documents: InvoiceRecord[];
  shippers: { id: string; commissionMode?: 'percent' | 'fixed' | null; commissionPct?: number | null; commissionFixedMinorUnits?: string | null }[];
  partners: { id: string; companyLegalName: string; commissionMode?: 'percent' | 'fixed' | null; commissionPct?: number | null; commissionFixedMinorUnits?: string | null }[];
  housePct: number;
  now: number;
}) {
  const shipperById = new Map(shippers.map((row) => [row.id, row]));
  const partnerById = new Map(partners.map((row) => [row.id, row]));

  const invoices = documents.filter((doc) => doc.kind === 'invoice' && doc.status !== 'Cancelled');
  const invoiceByShipment = new Map(
    invoices.filter((doc) => doc.shipmentId).map((doc) => [doc.shipmentId as string, doc]),
  );

  const movements: Movement[] = [];
  const overdue: OverdueInvoice[] = [];
  let owedByShippers = 0;
  let collected = 0;
  let commission = 0;
  let billed = 0;
  let paidCount = 0;

  for (const doc of invoices) {
    commission += fromMinorUnits(doc.commissionMinorUnits, doc.currency);
    const amount = fromMinorUnits(doc.totalMinorUnits, doc.currency);
    billed += amount;

    if (doc.status === 'Paid') {
      collected += amount;
      paidCount += 1;
      movements.push({
        id: `in-${doc.id}`,
        direction: 'in',
        party: doc.shipperCompany,
        reference: doc.number,
        amount,
        at: doc.paidAt ?? doc.issueDate,
      });
      continue;
    }

    owedByShippers += amount;
    // Ceil, not floor: past the deadline at all is day one late.
    const daysLate = Math.ceil((now - new Date(doc.contractDeadline).getTime()) / DAY_MS);
    if (daysLate > 0) {
      overdue.push({
        id: doc.id,
        number: doc.number,
        shipper: doc.shipperCompany,
        amount,
        daysLate,
      });
    }
  }

  const dueToTransporters: DueToTransporter[] = [];
  let owedToTransporters = 0;

  for (const shipment of shipments) {
    if (['Cancelled', 'Failed'].includes(shipment.status)) continue;
    if (shipment.clientRateMinorUnits == null) continue;

    if (shipment.transporterPaidAt) {
      movements.push({
        id: `out-${shipment.id}`,
        direction: 'out',
        party: shipment.transporterCompany,
        reference: shipment.reference,
        amount: Number(shipment.transporterPaidMinorUnits ?? 0),
        at: shipment.transporterPaidAt,
      });
      continue;
    }

    if (!DELIVERED.includes(shipment.status)) continue;

    /* What the haulier is owed: the job less Fleetin's share. On an already
       invoiced job the document's STORED cut is the truth — the same figure
       the client was billed against — rather than a fresh calculation that a
       renegotiated deal could quietly change. */
    const total = fromMinorUnits(shipment.clientRateMinorUnits, shipment.clientRateCurrency ?? 'DJF');
    const invoice = invoiceByShipment.get(shipment.id);
    const cut = invoice
      ? fromMinorUnits(invoice.commissionMinorUnits, invoice.currency)
      : commissionOf(
          total,
          resolveCommission({
            shipper: shipperById.get(shipment.shipperId) ?? null,
            transporter: partnerById.get(shipment.partnerId) ?? null,
            housePct,
          }),
          shipment.bookingCount ?? 1,
        );

    const due = Math.max(0, total - cut);
    owedToTransporters += due;
    dueToTransporters.push({
      shipmentId: shipment.id,
      reference: shipment.reference,
      transporter: partnerById.get(shipment.partnerId)?.companyLegalName ?? shipment.transporterCompany,
      amount: due,
      deliveredAt: shipment.scheduledPickupTime,
    });
  }

  return {
    owedByShippers,
    owedToTransporters,
    collected,
    commission,
    paidCount,
    /* What the book actually kept, against everything billed. Null rather than
       0% with nothing billed — a take rate on no billing is unknown, not
       zero. */
    takeRate: billed > 0 ? (commission / billed) * 100 : null,
    /* Oldest first — the haulier who has been waiting longest is paid first,
       which is the order the desk actually works in. */
    dueToTransporters: dueToTransporters.sort((a, b) => a.deliveredAt.localeCompare(b.deliveredAt)),
    overdue: overdue.sort((a, b) => b.daysLate - a.daysLate),
    recent: movements.sort((a, b) => b.at.localeCompare(a.at)),
    dueCount: dueToTransporters.length + overdue.length,
  };
}

/**
 * One figure on a filled slab.
 *
 * `note` is only ever a count or a rate the headline cannot carry — never a
 * restatement of it. "32,861,016 DJF / Coming in / 14 invoices overdue" says
 * three different things; "…/ Coming in / money coming in" would say one thing
 * twice.
 */
function MoneyTile({
  title,
  value,
  note,
  icon,
  variant,
  loading,
}: {
  title: string;
  value: number;
  note: string;
  icon: ComponentType<{ className?: string }>;
  variant: 'teal' | 'orange' | 'green' | 'slate';
  loading: boolean;
}) {
  const Icon = icon;
  return (
    <StatisticCard
      variant={variant}
      loading={loading}
      title={title}
      value={fmtDjf(value)}
      subtitle={note}
      icon={<Icon className="size-[18px]" />}
    />
  );
}

function Skeletons() {
  return (
    <div className="space-y-2">
      {[0, 1, 2, 3].map((n) => (
        <Skeleton key={n} className="h-11 w-full rounded-md" />
      ))}
    </div>
  );
}

function Empty({ copy }: { copy: string }) {
  return <p className="py-10 text-center text-sm text-muted-foreground">{copy}</p>;
}
