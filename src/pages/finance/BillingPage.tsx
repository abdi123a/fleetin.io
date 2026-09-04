import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { returnState } from '@/components/common/ReturnLink';

import { TablePager, usePagedRows } from '@/components';
import { CompanyAvatar, Skeleton, useConfirm } from '@/design-system';
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Coins,
  FileText,
  Hourglass,
  Receipt,
  Wallet,
} from '@/design-system/icons';
import { ROUTES, buildPath } from '@/config/routes';
import { commissionOf, resolveCommission, useInvoices, type InvoiceRecord } from '@/features/finance';
import { usePartners } from '@/features/partners/api/queries';
import { paymentTermsDays } from '@/features/settings';
import { useSettings } from '@/features/settings/api/queries';
import { useShippers } from '@/features/shippers/api/queries';
import { useAllShipmentsRaw, usePayTransporter } from '@/features/shipments/api/queries';
import type { ShipmentRecord } from '@/features/shipments/api/shipmentsService';
import { ApexChart } from '@/features/shipper-bi/charts/ApexChart';
import { baseChartOptions, buildTooltipHtml, resolveColor } from '@/features/shipper-bi/charts/apexChartTheme';
import { shortPlace } from '@/features/emissions';
import { compactDjf, fmtDjf, fmtDocDate, fromMinorUnits } from '@/lib/finance';
import { useCompanyLogo } from '@/features/companies/companyLogos';
import { CompanyName } from '@/pages/empty-returns/components/marks';
import { cn } from '@/utils';

import {
  ActionButton,
  EmptyState,
  FilterPills,
  PageHead,
  Panel,
  Pill,
} from './components/kit';

/**
 * The Book — Fleetin's money, told as one sentence rather than a wall of tiles.
 *
 * The sentence is: **shippers owe us, we keep a slice, transporters are owed
 * the rest.** Three terms, one direction, and every surface on this page is
 * either one of those terms, the calendar that says WHEN they settle, or the
 * work that moves them.
 *
 * The page it replaced put eleven equal white cards in a column — four tiles,
 * a funnel, a month chart, an ageing ring, two ranking panels and two queues
 * behind a tab — and restated the same four figures across the first three of
 * them. Nothing was bigger than anything else, so nothing was first.
 *
 * What is here now, top to bottom:
 *
 *   1. **The position** — one filled rail carrying the whole equation. The
 *      only saturated surface on the page, so the eye lands on it.
 *   2. **Coverage** — the question a broker's treasurer actually asks: on the
 *      paper we have issued, WHEN do receipts cover what we already owe? A
 *      cumulative line against a flat obligation, with the crossing week
 *      named. This is the page's forward view; it had none before.
 *   3. **The gap** — what is left after the obligation is met, and how much of
 *      the debt behind it is late.
 *   4. **The desk** — every outstanding obligation in ONE ranked worklist with
 *      its control on the row: bill it, chase it, pay it. Not two lists behind
 *      a tab, half of them below the fold.
 *   5. **Concentration** — who the money sits with. Demoted to the bottom,
 *      because it is something to know, not something to do.
 *
 * Documents are still raised on the Invoices page. The Book is where you watch
 * the money; Invoices is where you make the paper.
 */

/** Statuses that mean the containers are off the truck and the work is owed for. */
const DELIVERED = ['POD Submitted', 'Completed', 'Delivered'];

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

/** How far forward the coverage chart looks. Ten weeks ≈ one quarter of paper. */
const COVERAGE_WEEKS = 10;

type AgeingKey = 'current' | 'd30' | 'd60' | 'd60plus';

const AGEING_ORDER: readonly AgeingKey[] = ['current', 'd30', 'd60', 'd60plus'];

const AGEING_LABEL: Record<AgeingKey, string> = {
  current: 'Current',
  d30: '1–30',
  d60: '31–60',
  d60plus: '60+',
};

const AGEING_FILL: Record<AgeingKey, string> = {
  current: 'bg-primary',
  d30: 'bg-warning',
  d60: 'bg-accent',
  d60plus: 'bg-destructive',
};

/*
 * ApexCharts paints into SVG presentation attributes, which cannot read a CSS
 * custom property, so every token a chart uses is resolved at render time. The
 * fallbacks are the tokens' light-theme values, so a chart drawn before styles
 * settle is the right colour rather than black.
 */
const chartInk = {
  /** Receipts we have actually billed for. */
  issued: () => resolveColor('var(--primary)', '#60969D'),
  /** The same line with the unbilled book projected onto it. */
  projected: () => resolveColor('var(--accent-bold)', '#E0A020'),
  /** What we owe out — the bar the receipts have to clear. */
  owed: () => resolveColor('var(--destructive)', '#C0392B'),
};

/* ═══════════════════════════════════════════════════════════════════════════
 * The desk
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * One outstanding obligation, whichever direction it points.
 *
 * The old page split these across two lists in two cards behind a tab, which
 * meant the biggest thing owing was never necessarily on screen. One shape for
 * all three lets them be ranked against each other by the only measure that
 * matters at a finance desk: how much money is sitting still, and for how long.
 */
type DeskKind = 'bill' | 'chase' | 'pay';

interface DeskRow {
  id: string;
  kind: DeskKind;
  party: string;
  /** The paper's own number — an invoice number, or the shipment's reference. */
  reference: string;
  /** The job under the paper. Null on a statement covering several. */
  shipmentRef: string | null;
  /** "Doraleh → DFZ", already shortened. Null when the job is not resolvable. */
  route: string | null;
  /** The date the age is counted from: due date to chase, delivery to bill or pay. */
  date: string | null;
  amount: number;
  /** Days the obligation has been outstanding. Drives the ranking. */
  days: number;
  /**
   * The paper behind the item.
   *
   * An overdue row opens its invoice; the other two have no invoice of their
   * own yet — an unbilled job has not been papered, and a payable is settled
   * against the shipment — so both open the shipment, where the rate, the
   * proofs and the raise control already live. A row that shows a figure
   * always has somewhere to go and check it.
   */
  to: string;
  /** Only a `pay` row is settled from here. */
  shipmentId?: string;
}

const DESK_META: Record<
  DeskKind,
  {
    label: string;
    /** What the control opens — the destination, not an instruction. */
    verb: string;
    tone: 'teal' | 'orange' | 'red';
    /** What the date column means on this lane. */
    dated: string;
    /** Whether the age is worth colouring. Only lateness is. */
    late?: boolean;
  }
> = {
  bill: { label: 'Unbilled', verb: 'Shipment', tone: 'orange', dated: 'delivered' },
  chase: { label: 'Overdue', verb: 'Invoice', tone: 'red', dated: 'due', late: true },
  pay: { label: 'Payable', verb: 'Pay', tone: 'teal', dated: 'delivered' },
};

/**
 * Which obligation is read first when nothing is filtered.
 *
 * Money already billed and already late outranks money we have not asked for,
 * which outranks money we owe — a receivable slipping costs us the float, an
 * unraised invoice costs us the whole cycle, and a payable is only ever ours to
 * time. Within a rung, the biggest figure wins.
 */
const DESK_PRIORITY: Record<DeskKind, number> = { chase: 0, bill: 1, pay: 2 };

/**
 * The desk's columns, shared by the header and every row so the two can never
 * drift apart. Eight tracks: status, counterparty, reference, route, date,
 * age, amount, control. The panel scrolls sideways below the minimum rather
 * than dropping columns — a ledger with fields missing is worse than one that
 * has to be pushed.
 */
const DESK_GRID =
  'grid grid-cols-[6rem_minmax(9rem,1.3fr)_minmax(6.5rem,0.8fr)_minmax(7rem,1fr)_minmax(5.5rem,0.7fr)_3rem_minmax(7.5rem,auto)_auto] items-center gap-x-3';

/** One column heading. Uppercase and quiet — the rail, not the content. */
function DeskHead({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <span className={cn('text-[10px] font-bold uppercase tracking-wide text-muted-foreground', className)}>
      {children}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Model shapes
 * ═══════════════════════════════════════════════════════════════════════ */

/** A counterparty ranked by money — billed/ours for a client, paid/owed for a haulier. */
interface PartyRow {
  id: string;
  name: string;
  jobs: number;
  amount: number;
  secondary: number;
}

/** One month of the commission trail, keyed so the bars are not index-keyed. */
interface MonthPoint {
  key: string;
  value: number;
}

/** One week of the coverage chart. */
interface CoverageWeek {
  label: string;
  /** Cumulative receipts from invoices already issued. */
  issued: number;
  /** The same, plus the unbilled book if it were invoiced today. */
  projected: number;
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** "72%" — whole points; a billing backlog is not a decimal matter. */
function pctOf(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—';
}

/** The Monday of the week a date falls in, so weeks bucket consistently. */
function weekStart(ms: number): number {
  const date = new Date(ms);
  const day = (date.getUTCDay() + 6) % 7;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - day);
}

function weekLabel(ms: number): string {
  return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function BillingPage() {
  const [lane, setLane] = useState<DeskKind | 'all'>('all');

  const { data: shipments = [], isLoading: shipmentsLoading } = useAllShipmentsRaw({});
  const { data: documents = [], isLoading: docsLoading } = useInvoices({ kind: 'all' });
  const { data: shipperPage } = useShippers({ limit: 200 });
  const { data: partnerPage } = usePartners({ limit: 200 });
  const { data: settings } = useSettings();
  const pay = usePayTransporter();
  const { confirm, confirmDialog } = useConfirm();

  const isLoading = shipmentsLoading || docsLoading;

  /**
   * Paying a haulier is money leaving the account, and it was once firing on
   * the click that requested it. The confirm names WHO, HOW MUCH and WHICH
   * JOB, because those are the three things a mis-click gets wrong and the row
   * alone does not restate them once the pointer has moved.
   */
  async function confirmPay(row: DeskRow) {
    if (!row.shipmentId) return;
    const ok = await confirm({
      title: `Pay ${row.party}?`,
      description: `${fmtDjf(row.amount)} for shipment ${row.reference}. This records the transfer as made — it cannot be undone here.`,
      confirmLabel: `Pay ${fmtDjf(row.amount)}`,
      destructive: false,
    });
    if (ok) pay.mutate(row.shipmentId);
  }

  const book = useMemo(
    () =>
      buildBook({
        shipments,
        documents,
        shippers: shipperPage?.items ?? [],
        partners: partnerPage?.items ?? [],
        housePct: settings?.fleetinCommissionPct ?? 0,
        termsDays: paymentTermsDays(),
        now: Date.now(),
      }),
    [shipments, documents, shipperPage, partnerPage, settings],
  );

  const deskRows = useMemo(
    () => (lane === 'all' ? book.desk : book.desk.filter((row) => row.kind === lane)),
    [book.desk, lane],
  );
  /* `resetKey` on the lane: switching a filter has to land on page 1. Without
     it, moving from page 5 of the whole desk to a 2-page lane clamps to page 2
     and the reader opens a filter halfway down it. */
  const deskPaged = usePagedRows(deskRows, { resetKey: lane });

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <PageHead
        title="Billing"
        actions={
          <>
            <Link to={ROUTES.financeProjects}>
              <ActionButton icon={FileText}>Projects</ActionButton>
            </Link>
            <Link to={ROUTES.financeInvoices}>
              <ActionButton icon={Receipt} variant="primary">
                Invoices
              </ActionButton>
            </Link>
          </>
        }
      />

      {/*
        THE POSITION — the only filled surface on the page.

        Four white tiles of equal weight was the version that had no focus. One
        saturated rail carrying the whole equation has exactly one focus, and
        the arrows between the terms say the thing four boxes could not: this
        is one flow, and it only ever runs one way.
      */}
      <PositionRail book={book} loading={isLoading} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/*
          COVERAGE — the forward view the page never had.

          Every figure on the old page was lifetime-to-date, which is why it
          read as a printout rather than a dashboard: nothing said which way
          anything was going. This asks the one question a treasurer asks
          before anything else, and answers it with a date.
        */}
        <Panel
          className="lg:col-span-8"
          title="Coverage"
          action={
            <Pill tone={book.coverage.covered ? 'teal' : 'red'}>
              {book.coverage.covered ? `Covered ${book.coverage.coverWeek}` : 'Not covered'}
            </Pill>
          }
        >
          {isLoading ? (
            <Skeleton className="h-[260px] w-full rounded-md" />
          ) : (
            <CoverageChart book={book} />
          )}
        </Panel>

        <GapCard book={book} loading={isLoading} className="lg:col-span-4" />
      </div>

      {/*
        THE DESK — one ranked worklist, every obligation in it, control on the
        row. Three lanes of the same shape rather than three cards, so the
        biggest thing owing is always the first thing on screen.
      */}
      <Panel
        title="Open items"
        action={
          <FilterPills
            active={lane}
            onChange={setLane}
            options={[
              { key: 'all' as const, label: 'All', count: book.desk.length },
              { key: 'chase' as const, label: 'Overdue', count: book.laneCount.chase, tone: 'red' },
              { key: 'bill' as const, label: 'Unbilled', count: book.laneCount.bill, tone: 'orange' },
              { key: 'pay' as const, label: 'Payable', count: book.laneCount.pay, tone: 'teal' },
            ]}
          />
        }
      >
        {pay.isError ? (
          <p className="mb-3 rounded-card-nested border border-destructive/25 bg-destructive-subtle px-3 py-2 text-sm font-semibold text-destructive">
            {(pay.error as Error).message}
          </p>
        ) : null}

        {isLoading ? (
          <Skeletons />
        ) : deskRows.length === 0 ? (
          <EmptyState message="No open items." />
        ) : (
          <>
            {/*
              A ledger, not a list of cards. The old row put the chip, the
              party, the figure and the control in one flex line and let the
              slack pool in the middle — a third of the row was empty while the
              reference, the route and the date had nowhere to go. Fixed
              columns spend that width on data instead, and give the eye a
              rail to scan each field down.
            */}
            <div className="-mx-1 overflow-x-auto">
              <div className="min-w-[54rem] px-1">
                <div className={cn(DESK_GRID, 'border-b border-border px-3 pb-2')}>
                  <DeskHead>Status</DeskHead>
                  <DeskHead>Counterparty</DeskHead>
                  <DeskHead>Reference</DeskHead>
                  <DeskHead>Route</DeskHead>
                  <DeskHead>Date</DeskHead>
                  <DeskHead className="text-right">Age</DeskHead>
                  <DeskHead className="text-right">Amount</DeskHead>
                  <DeskHead />
                </div>

                <div className="flex flex-col">
                  {deskPaged.rows.map((row) => {
                    const meta = DESK_META[row.kind];
                    return (
                      <Link
                        key={row.id}
                        to={row.to}
                        state={returnState(ROUTES.finance, 'Billing')}
                        className={cn(
                          DESK_GRID,
                          'rounded-card-nested px-3 py-2.5 transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                        )}
                      >
                        <Pill tone={meta.tone} className="justify-self-start">
                          {meta.label}
                        </Pill>

                        <CompanyName name={row.party} size="sm" className="text-sm font-bold" />

                        <span className="min-w-0">
                          <span className="block truncate font-mono text-xs font-bold tabular-nums text-foreground">
                            {row.reference}
                          </span>
                          {row.shipmentRef ? (
                            <span className="block truncate font-mono text-[11px] tabular-nums text-muted-foreground">
                              {row.shipmentRef}
                            </span>
                          ) : null}
                        </span>

                        <span className="truncate text-xs font-medium text-muted-foreground">
                          {row.route ?? '—'}
                        </span>

                        <span className="min-w-0">
                          <span className="block truncate font-mono text-xs tabular-nums text-foreground">
                            {row.date ? fmtDocDate(row.date) : '—'}
                          </span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {meta.dated}
                          </span>
                        </span>

                        {/* Only lateness is coloured. An unbilled job ageing is
                            a fact; an invoice past its date is a problem. */}
                        <span
                          className={cn(
                            'text-right font-mono text-xs font-bold tabular-nums',
                            meta.late ? 'text-destructive' : 'text-muted-foreground',
                          )}
                        >
                          {row.days}d
                        </span>

                        <span className="text-right font-mono text-sm font-bold tabular-nums text-foreground">
                          {fmtDjf(row.amount)}
                        </span>

                        {/* Settling happens here, so the button has to swallow
                            the row's navigation rather than ride it. */}
                        {row.kind === 'pay' ? (
                          <ActionButton
                            icon={Banknote}
                            disabled={pay.isPending}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              void confirmPay(row);
                            }}
                          >
                            Pay
                          </ActionButton>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-border px-3 py-2 text-xs font-bold text-foreground">
                            {meta.verb}
                            <ArrowRight aria-hidden className="size-3.5" />
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>

            <TablePager paged={deskPaged} noun="open items" className="mt-3" />
          </>
        )}
      </Panel>

      {/*
        CONCENTRATION — something to know, not something to do, so it sits
        below the work rather than between the position and it. One panel with
        two halves, not two panels: the question is where the book is
        concentrated, and both sides answer the same question.
      */}
      <Panel
        title="Concentration"
        subtitle={
          book.topClients.length > 0
            ? `${book.topClients[0]?.name} ${pctOf(book.topClients[0]?.amount ?? 0, book.billed)} of billed`
            : undefined
        }
      >
        {isLoading ? (
          <Skeletons />
        ) : (
          <div className="grid gap-x-6 gap-y-6 md:grid-cols-2">
            <ShareMap heading="Shippers" caption="billed" rows={book.topClients} tone="teal" />
            <ShareMap heading="Transporters" caption="exposure" rows={book.topHauliers} tone="slate" />
          </div>
        )}
      </Panel>

      {confirmDialog}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * The position rail
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * The whole business on one filled band: receivables → commission → payables.
 *
 * The terms are NOT netted — a business that funds the gap between what it is
 * owed and what it owes has to see both sizes, not the difference. But they
 * sit in one band because they are one sentence: the middle term is a slice of
 * the first, and the third is the remainder.
 *
 * Three DIVIDED cells, not three stacked blocks in one slab. The first version
 * ran the terms down a single tall fill with arrows between them, and at any
 * width below a laptop it read as one enormous card — a thousand pixels of
 * teal with no internal edges. Rules between the cells give the eye the three
 * boundaries it was looking for, and the arrows come out: the reading order
 * and the labels already carry the direction, and the glyphs were most of what
 * made the stacked version so tall.
 *
 * Each cell reflows rather than shrinking. Below `sm` the label and the figure
 * share one line and the detail drops under it, so a term is two lines instead
 * of six; from `sm` up the figure sits under its label in a column.
 */
function PositionRail({ book, loading }: { book: Book; loading: boolean }) {
  return (
    <section className="overflow-hidden rounded-card border border-transparent bg-tile-teal px-4 shadow-card sm:px-2 sm:py-5">
      <div className="grid grid-cols-1 divide-y divide-white/20 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <Term
          icon={Hourglass}
          label="Receivables"
          value={book.comingIn}
          loading={loading}
          caption={`${book.notInvoicedCount + book.openInvoiceCount} open`}
          split={[
            { label: 'unbilled', value: book.notInvoiced, className: 'bg-white/85' },
            { label: 'invoiced', value: book.owedByShippers, className: 'bg-white/35' },
          ]}
        />

        <Term
          icon={Wallet}
          label="Commission"
          value={book.commission}
          loading={loading}
          caption={book.takeRate !== null ? `${book.takeRate.toFixed(1)}% take rate` : 'nothing billed'}
          trail={book.commissionSpark}
        />

        <Term
          icon={Coins}
          label="Payables"
          value={book.goingOut}
          loading={loading}
          caption={`${book.laneCount.pay} open`}
        />
      </div>
    </section>
  );
}

/** One term of the equation. */
function Term({
  icon: Icon,
  label,
  value,
  caption,
  loading,
  split,
  trail,
}: {
  icon: (props: { className?: string; 'aria-hidden'?: boolean }) => ReactNode;
  label: string;
  value: number;
  caption: string;
  loading: boolean;
  /** The composition line under the figure — segments sized by share. */
  split?: { label: string; value: number; className: string }[];
  /** Six months of history, for the term where direction is the point. */
  trail?: MonthPoint[];
}) {
  const total = split?.reduce((sum, part) => sum + part.value, 0) ?? 0;

  return (
    <div className="min-w-0 py-4 sm:px-5 sm:py-1">
      {/* Label and figure share a line on a phone and stack from `sm` — the
          same two facts, laid out for the width that is actually there. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 sm:block">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-white/20">
            <Icon aria-hidden className="size-4 text-tile-teal-foreground" />
          </span>
          <span className="text-xs font-bold uppercase tracking-wide text-tile-teal-foreground/80">
            {label}
          </span>
        </div>

        {loading ? (
          <Skeleton className="h-7 w-36 bg-white/20 sm:mt-3" />
        ) : (
          <p className="whitespace-nowrap font-mono text-xl font-extrabold leading-none tracking-tight tabular-nums text-tile-teal-foreground sm:mt-3 sm:text-[26px] xl:text-[30px]">
            {fmtDjf(value)}
          </p>
        )}
      </div>

      {/*
        The composition line, not a chart. Two segments of one thin rail say
        "most of this is one thing" at a glance, and the labels under it carry
        the names — so the rail is never read for a value, only a proportion.
      */}
      {split && total > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="flex h-1.5 w-full min-w-[6rem] flex-1 gap-0.5 overflow-hidden rounded-full">
            {split.map((part) => (
              <span
                key={part.label}
                className={cn('h-full rounded-full', part.className)}
                style={{ width: `${(part.value / total) * 100}%` }}
              />
            ))}
          </span>
          <span className="flex shrink-0 gap-x-3 text-[11px] font-semibold text-tile-teal-foreground/75">
            {split.map((part) => (
              <span key={part.label} className="whitespace-nowrap">
                {pctOf(part.value, total)} {part.label}
              </span>
            ))}
          </span>
        </div>
      ) : null}

      {trail && trail.length > 1 ? (
        <div className="mt-3 flex items-end gap-2">
          <TrailBars points={trail} />
          <span className="text-[11px] font-semibold text-tile-teal-foreground/75">6 months</span>
        </div>
      ) : null}

      <p className="mt-2 text-[11px] font-semibold text-tile-teal-foreground/75">{caption}</p>
    </div>
  );
}

/**
 * Six months of history on the fill.
 *
 * `Sparkline` is a stroked polyline in `--primary`, which vanishes on a teal
 * block — so the trail here is drawn as bars in the fill's own foreground
 * instead. Same information, on a surface it can be seen against.
 *
 * A month with nothing billed still draws a floor rather than nothing, so the
 * row reads as six months of which one is tall, not as one lone bar.
 */
function TrailBars({ points }: { points: MonthPoint[] }) {
  const max = Math.max(...points.map((point) => point.value), 1);
  return (
    <span aria-hidden className="flex h-6 items-end gap-1">
      {points.map((point, index) => (
        <span
          key={point.key}
          className={cn(
            'w-1.5 rounded-sm',
            index === points.length - 1 ? 'bg-white' : 'bg-white/40',
          )}
          style={{ height: `${Math.max(14, (point.value / max) * 100)}%` }}
        />
      ))}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Coverage
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * Cumulative receipts against a flat obligation.
 *
 * Two lines, one rule. The solid line is what the paper we have already issued
 * brings in, week by week, as each invoice reaches its date. The dashed line
 * is the same with the unbilled book projected onto it — invoiced today, due
 * one payment term from today. The rule is what we owe transporters right now.
 *
 * The crossing is the answer, and it is why this is a line chart and not a
 * stacked anything: when 98% of the book sits in one state, a proportional
 * graphic collapses to one block and two slivers. Two rising lines against a
 * flat bar read the same at any proportion.
 */
function CoverageChart({ book }: { book: Book }) {
  const { weeks, owed } = book.coverage;

  return (
    <ApexChart
      type="line"
      height={260}
      series={[
        { name: 'Issued', data: weeks.map((week) => Math.round(week.issued)) },
        { name: 'Issued + unbilled', data: weeks.map((week) => Math.round(week.projected)) },
      ]}
      options={baseChartOptions({
        colors: [chartInk.issued(), chartInk.projected()],
        chart: { type: 'line' },
        stroke: { width: [3, 2.5], curve: 'smooth', dashArray: [0, 5] },
        markers: { size: 0, hover: { size: 5 } },
        legend: { show: true, position: 'top', horizontalAlign: 'left', offsetY: -4 },
        xaxis: { categories: weeks.map((week) => week.label) },
        yaxis: { labels: { formatter: (v: number) => compactDjf(v) } },
        /* The obligation as an annotation rather than a third series: it is
           not a quantity that moves week to week, it is the bar the other two
           have to clear, and drawing it as a series would invite the reader to
           compare its shape with theirs. */
        annotations: {
          yaxis: [
            {
              y: Math.round(owed),
              borderColor: chartInk.owed(),
              strokeDashArray: 4,
              label: {
                text: `Payables ${compactDjf(owed)}`,
                position: 'right',
                textAnchor: 'end',
                offsetX: -8,
                offsetY: -4,
                borderWidth: 0,
                style: {
                  background: chartInk.owed(),
                  color: '#fff',
                  fontSize: '11px',
                  fontWeight: 700,
                  fontFamily: 'inherit',
                  padding: { left: 8, right: 8, top: 3, bottom: 3 },
                },
              },
            },
          ],
        },
        tooltip: {
          shared: true,
          intersect: false,
          custom: ({ dataPointIndex }: { dataPointIndex: number }) => {
            const week = weeks[dataPointIndex];
            if (!week) return '';
            return buildTooltipHtml(week.label, [
              { key: 'i', label: 'Issued', value: fmtDjf(week.issued), color: chartInk.issued() },
              {
                key: 'p',
                label: 'Issued + unbilled',
                value: fmtDjf(week.projected),
                color: chartInk.projected(),
              },
              { key: 'o', label: 'Payables', value: fmtDjf(owed), color: chartInk.owed() },
            ]);
          },
        },
      })}
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * The gap
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * What is left once the obligation is met, and how sound the debt behind it is.
 *
 * The ageing ring that used to sit here answered "what share is late" with a
 * donut and a four-row legend — five elements to read one percentage. A single
 * segmented rail says the same thing in one, and leaves room above it for the
 * figure the page was missing entirely: the net position.
 */
function GapCard({ book, loading, className }: { book: Book; loading: boolean; className?: string }) {
  const short = book.gap < 0;

  return (
    <Panel
      className={className}
      title="Net position"
    >
      {loading ? (
        <Skeletons />
      ) : (
        <>
          <p
            className={cn(
              'whitespace-nowrap font-mono text-[30px] font-extrabold leading-none tracking-tight tabular-nums',
              short ? 'text-destructive' : 'text-foreground',
            )}
          >
            {short ? '−' : ''}
            {fmtDjf(Math.abs(book.gap))}
          </p>

          {/*
            The one caveat that decides whether the figure above is real money
            or a hope, stated where it is read rather than in a footnote.
          */}
          {book.notInvoiced > 0 ? (
            <p className="mt-2 flex items-center gap-2 text-xs font-bold text-accent-subtle-foreground">
              <AlertTriangle aria-hidden className="size-3.5 shrink-0" />
              {pctOf(book.notInvoiced, book.comingIn)} unbilled
            </p>
          ) : null}

          <div className="mt-5 border-t border-border pt-4">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                AR ageing
              </h3>
              <span className="font-mono text-sm font-extrabold tabular-nums text-destructive">
                {book.latePct}
              </span>
            </div>

            {book.owedByShippers === 0 ? (
              <p className="mt-3 text-sm font-medium text-muted-foreground">Nothing outstanding.</p>
            ) : (
              <>
                {/* One rail, four segments — the ring and its legend in a
                    single element the eye reads left to right. */}
                <div className="mt-3 flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-surface-sunken">
                  {AGEING_ORDER.map((key) =>
                    book.ageing[key].amount > 0 ? (
                      <span
                        key={key}
                        className={cn('h-full rounded-full', AGEING_FILL[key])}
                        style={{
                          width: `${(book.ageing[key].amount / book.owedByShippers) * 100}%`,
                        }}
                      />
                    ) : null,
                  )}
                </div>

                <ul className="mt-3 flex flex-col gap-2">
                  {AGEING_ORDER.filter((key) => book.ageing[key].count > 0).map((key) => (
                    <li key={key} className="flex items-baseline gap-2 text-xs">
                      <span
                        aria-hidden
                        className={cn(
                          'size-2 shrink-0 translate-y-[1px] rounded-full',
                          AGEING_FILL[key],
                        )}
                      />
                      <span className="min-w-0 flex-1 truncate font-medium text-muted-foreground">
                        {AGEING_LABEL[key]}
                      </span>
                      <span className="shrink-0 font-mono font-bold tabular-nums text-foreground">
                        {fmtDjf(book.ageing[key].amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </>
      )}
    </Panel>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Concentration
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * Concentration as AREA, with every counterparty wearing its own mark.
 *
 * The rules this replaced asked the reader to compare five bar lengths and
 * then read five nine-digit figures to find out what the bars meant. Here the
 * leader holding 45% of the book is a tile taking up 45% of the box, and that
 * lands before a number is read.
 *
 * Laid out by hand rather than by a chart library on purpose: a charting
 * treemap paints text into SVG and cannot carry an image, and every named
 * shipper and transporter in Fleetin has a real logo. A board that shows some
 * marks and some plain strings reads as two different kinds of company.
 *
 * The shape is the classic one — the leader takes the left block at full
 * height, the rest stack down the right column, each sized by its share.
 */
function ShareMap({
  heading,
  caption,
  rows,
  tone,
}: {
  heading: string;
  caption: string;
  rows: PartyRow[];
  tone: 'teal' | 'slate';
}) {
  /* A transporter's exposure is what has been paid plus what is still owed; a
     shipper's is simply what they were billed. One weight either way, so the
     map never has to know which side it is drawing. */
  const tiles = rows
    .map((row) => ({ id: row.id, name: row.name, value: row.amount + row.secondary }))
    .filter((tile) => tile.value > 0);
  const total = tiles.reduce((sum, tile) => sum + tile.value, 0);

  if (tiles.length === 0 || total === 0) {
    return (
      <div className="min-w-0">
        <ShareMapHead heading={heading} caption={caption} total={0} />
        <p className="py-10 text-sm font-medium text-muted-foreground">No data.</p>
      </div>
    );
  }

  const [leader, ...rest] = tiles;
  const restTotal = rest.reduce((sum, tile) => sum + tile.value, 0);
  /* The leader's own share, but bounded: below 32% the block is too narrow to
     hold a mark and a name, and above 58% the tail collapses to slivers. */
  const leaderWidth = Math.min(58, Math.max(32, ((leader?.value ?? 0) / total) * 100));

  return (
    <div className="min-w-0">
      <ShareMapHead heading={heading} caption={caption} total={total} />

      <div className="flex h-56 gap-1.5">
        {leader ? (
          <ShareTile
            tile={leader}
            share={leader.value / total}
            rank={0}
            tone={tone}
            style={{ width: `${leaderWidth}%` }}
            lead
          />
        ) : null}

        {rest.length > 0 ? (
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            {rest.map((tile, index) => (
              <ShareTile
                key={tile.id}
                tile={tile}
                share={tile.value / total}
                rank={index + 1}
                tone={tone}
                /* Sized against the tail's own total, so the column always
                   fills its height however lopsided the tail is. */
                style={{ flexGrow: tile.value / restTotal, flexBasis: 0 }}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ShareMapHead({
  heading,
  caption,
  total,
}: {
  heading: string;
  caption: string;
  total: number;
}) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-3">
      <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{heading}</h3>
      <span className="font-mono text-xs font-bold tabular-nums text-muted-foreground">
        {compactDjf(total)} {caption}
      </span>
    </div>
  );
}

/*
 * Five steps of one hue per side, darkest first — the ramp reinforces the rank
 * the areas already show. Teal is the brand's own ladder; the transporter side
 * takes the neutral ladder so the two maps cannot be read as one series.
 *
 * The foreground flips on the pale steps. Teal-500 downwards will not carry
 * white at small sizes (3.3:1 and falling), and a tile whose share label
 * cannot be read is a tile that says nothing.
 */
interface ShareSkin {
  bg: string;
  ink: string;
  sub: string;
}

/* Typed as a non-empty tuple so the ramp's first step is statically known to
   exist — that is what lets a rank past the end fall back without an assertion. */
const SHARE_TONE: Record<'teal' | 'slate', [ShareSkin, ...ShareSkin[]]> = {
  teal: [
    { bg: 'bg-[var(--fl-teal-800)]', ink: 'text-white', sub: 'text-white/70' },
    { bg: 'bg-[var(--fl-teal-700)]', ink: 'text-white', sub: 'text-white/70' },
    { bg: 'bg-[var(--fl-teal-600)]', ink: 'text-white', sub: 'text-white/70' },
    { bg: 'bg-[var(--fl-teal-300)]', ink: 'text-foreground', sub: 'text-foreground/60' },
    { bg: 'bg-[var(--fl-teal-200)]', ink: 'text-foreground', sub: 'text-foreground/60' },
  ],
  slate: [
    { bg: 'bg-[var(--fl-neutral-800)]', ink: 'text-white', sub: 'text-white/70' },
    { bg: 'bg-[var(--fl-neutral-700)]', ink: 'text-white', sub: 'text-white/70' },
    { bg: 'bg-[var(--fl-neutral-600)]', ink: 'text-white', sub: 'text-white/70' },
    { bg: 'bg-[var(--fl-neutral-300)]', ink: 'text-foreground', sub: 'text-foreground/60' },
    { bg: 'bg-[var(--fl-neutral-200)]', ink: 'text-foreground', sub: 'text-foreground/60' },
  ],
};

/** One counterparty's block: its mark, its name, its share, its figure. */
function ShareTile({
  tile,
  share,
  rank,
  tone,
  style,
  lead,
}: {
  tile: { id: string; name: string; value: number };
  share: number;
  rank: number;
  tone: 'teal' | 'slate';
  style: React.CSSProperties;
  /** The leader's block, which has the room for a stacked layout. */
  lead?: boolean;
}) {
  const ramp = SHARE_TONE[tone];
  /* Five steps for five rows. A sixth would fall off the end, so the palest
     step repeats rather than the tile rendering unpainted. */
  const skin: ShareSkin = ramp[Math.min(rank, ramp.length - 1)] ?? ramp[0];
  const registered = useCompanyLogo(tile.name);

  return (
    <div
      style={style}
      title={`${tile.name} — ${fmtDjf(tile.value)}`}
      className={cn(
        'flex min-w-0 overflow-hidden rounded-card-nested px-3',
        skin.bg,
        lead ? 'flex-col justify-between py-3.5' : 'items-center gap-2.5 py-2',
      )}
    >
      <CompanyAvatar
        size={lead ? 'md' : 'xs'}
        src={registered ?? undefined}
        name={tile.name}
        className="shrink-0 bg-white ring-0"
      />

      {lead ? (
        <div className="min-w-0">
          <p className={cn('line-clamp-2 text-sm font-bold leading-tight', skin.ink)}>{tile.name}</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className={cn('font-mono text-3xl font-extrabold leading-none tabular-nums', skin.ink)}>
              {Math.round(share * 100)}%
            </span>
            <span className={cn('font-mono text-xs font-semibold tabular-nums', skin.sub)}>
              {compactDjf(tile.value)}
            </span>
          </div>
        </div>
      ) : (
        <>
          <div className="min-w-0 flex-1">
            <p className={cn('truncate text-xs font-bold leading-tight', skin.ink)}>{tile.name}</p>
            <p className={cn('mt-0.5 font-mono text-[11px] font-semibold tabular-nums', skin.sub)}>
              {compactDjf(tile.value)}
            </p>
          </div>
          <span className={cn('shrink-0 font-mono text-sm font-extrabold tabular-nums', skin.ink)}>
            {Math.round(share * 100)}%
          </span>
        </>
      )}
    </div>
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

/* ═══════════════════════════════════════════════════════════════════════════
 * The model
 * ═══════════════════════════════════════════════════════════════════════ */

type Book = ReturnType<typeof buildBook>;

/**
 * One pass over the book, producing every figure on the page.
 *
 * The two directions are counted from different records on purpose, because
 * they mean different things:
 *
 *   - **In** is ISSUED INVOICES plus DELIVERED WORK NOT YET INVOICED. A shipper
 *     cannot owe money nobody has billed them for — but the work is done and
 *     the money is coming, so the position has to carry both and say which is
 *     which. An earlier version compared receivables from issued invoices
 *     against payables from delivered work, two different populations, and the
 *     business looked underwater because of it.
 *   - **Out** is DELIVERED SHIPMENTS, whether or not the client has been billed
 *     or has paid. The haulier did the work; Fleetin owes them regardless of
 *     how slowly the invoice moves. Funding that gap is the business, and it is
 *     why both figures share one rail.
 *
 * Proformas are excluded throughout. A quotation is not a receivable.
 */
function buildBook({
  shipments,
  documents,
  shippers,
  partners,
  housePct,
  termsDays,
  now,
}: {
  shipments: ShipmentRecord[];
  documents: InvoiceRecord[];
  shippers: {
    id: string;
    commissionMode?: 'percent' | 'fixed' | null;
    commissionPct?: number | null;
    commissionFixedMinorUnits?: string | null;
  }[];
  partners: {
    id: string;
    companyLegalName: string;
    commissionMode?: 'percent' | 'fixed' | null;
    commissionPct?: number | null;
    commissionFixedMinorUnits?: string | null;
  }[];
  housePct: number;
  termsDays: number;
  now: number;
}) {
  const shipperById = new Map(shippers.map((row) => [row.id, row]));
  const partnerById = new Map(partners.map((row) => [row.id, row]));

  const invoices = documents.filter((doc) => doc.kind === 'invoice' && doc.status !== 'Cancelled');
  const invoiceByShipment = new Map(
    invoices.filter((doc) => doc.shipmentId).map((doc) => [doc.shipmentId as string, doc]),
  );
  /* An overdue row is about an invoice, but the reader chasing it wants the
     job it covers — so the invoice pass needs to reach back into the book. */
  const shipmentById = new Map(shipments.map((row) => [row.id, row]));

  /** "Doraleh → DFZ" for a job, or null when the shipment is not in the page's set. */
  const routeOf = (shipment: ShipmentRecord | undefined): string | null =>
    shipment ? `${shortPlace(shipment.pickupLocationName)} → ${shortPlace(shipment.deliveryLocationName)}` : null;

  /* Six months of commission for the rail's trail, keyed `YYYY-MM` and seeded
     so a quiet month draws as a floor rather than shortening the row. */
  const commissionByMonth = new Map<string, number>();
  for (let back = 5; back >= 0; back -= 1) {
    const when = new Date(Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth() - back, 1));
    commissionByMonth.set(monthKey(when), 0);
  }

  const byClient = new Map<string, PartyRow>();
  const byHaulier = new Map<string, PartyRow>();
  const desk: DeskRow[] = [];
  const ageing: Record<AgeingKey, { amount: number; count: number }> = {
    current: { amount: 0, count: 0 },
    d30: { amount: 0, count: 0 },
    d60: { amount: 0, count: 0 },
    d60plus: { amount: 0, count: 0 },
  };

  /* Receipts keyed by the Monday of the week they are due. Everything already
     past its date lands on the current week: it is not future income, it is
     money we should already be holding. */
  const thisWeek = weekStart(now);
  const receiptsByWeek = new Map<number, number>();
  const projectedByWeek = new Map<number, number>();
  const addReceipt = (map: Map<number, number>, dueMs: number, amount: number) => {
    const bucket = Math.max(thisWeek, weekStart(dueMs));
    map.set(bucket, (map.get(bucket) ?? 0) + amount);
  };

  let owedByShippers = 0;
  let openInvoiceCount = 0;
  let commission = 0;
  let billed = 0;

  for (const doc of invoices) {
    const cut = fromMinorUnits(doc.commissionMinorUnits, doc.currency);
    const amount = fromMinorUnits(doc.totalMinorUnits, doc.currency);
    commission += cut;
    billed += amount;

    const key = monthKey(new Date(doc.issueDate));
    if (commissionByMonth.has(key)) {
      commissionByMonth.set(key, (commissionByMonth.get(key) ?? 0) + cut);
    }

    const client = byClient.get(doc.shipperId) ?? {
      id: doc.shipperId,
      name: doc.shipperCompany,
      jobs: 0,
      amount: 0,
      secondary: 0,
    };
    client.jobs += 1;
    client.amount += amount;
    client.secondary += cut;
    byClient.set(doc.shipperId, client);

    if (doc.status === 'Paid') continue;

    owedByShippers += amount;
    openInvoiceCount += 1;
    addReceipt(receiptsByWeek, new Date(doc.contractDeadline).getTime(), amount);

    // Ceil, not floor: past the deadline at all is day one late.
    const daysLate = Math.ceil((now - new Date(doc.contractDeadline).getTime()) / DAY_MS);
    /* Everything unpaid lands in exactly one bucket, so the ageing rail sums
       to `owedByShippers` and can be checked against the position. */
    const bucket: AgeingKey =
      daysLate <= 0 ? 'current' : daysLate <= 30 ? 'd30' : daysLate <= 60 ? 'd60' : 'd60plus';
    ageing[bucket].amount += amount;
    ageing[bucket].count += 1;

    if (daysLate > 0) {
      const job = doc.shipmentId ? shipmentById.get(doc.shipmentId) : undefined;
      /* A legacy monthly statement covers many jobs and has no single route,
         so it says how many rather than showing an empty pair of columns. */
      const covers = doc.missionIds?.length ?? 0;
      desk.push({
        id: `chase-${doc.id}`,
        kind: 'chase',
        party: doc.shipperCompany,
        reference: doc.number,
        shipmentRef: job?.reference ?? (covers > 1 ? `${covers} shipments` : null),
        route: routeOf(job),
        date: doc.contractDeadline,
        amount,
        days: daysLate,
        to: buildPath(ROUTES.financeInvoiceDetail, { invoiceId: doc.id }),
      });
    }
  }

  let owedToTransporters = 0;
  let notInvoiced = 0;
  let notInvoicedCount = 0;

  const rankHaulier = (id: string, name: string, paid: number, owed: number) => {
    const row = byHaulier.get(id) ?? { id, name, jobs: 0, amount: 0, secondary: 0 };
    row.jobs += 1;
    row.amount += paid;
    row.secondary += owed;
    byHaulier.set(id, row);
  };

  for (const shipment of shipments) {
    if (['Cancelled', 'Failed'].includes(shipment.status)) continue;
    if (shipment.clientRateMinorUnits == null) continue;

    const total = fromMinorUnits(shipment.clientRateMinorUnits, shipment.clientRateCurrency ?? 'DJF');
    const invoice = invoiceByShipment.get(shipment.id);
    const deliveredMs = new Date(shipment.scheduledPickupTime).getTime();
    const ageDays = Math.max(0, Math.floor((now - deliveredMs) / DAY_MS));

    if (DELIVERED.includes(shipment.status) && !invoice) {
      notInvoiced += total;
      notInvoicedCount += 1;
      /* Projected, and labelled as such wherever it is drawn: if this job were
         invoiced today it would fall due one payment term from today. */
      addReceipt(projectedByWeek, now + termsDays * DAY_MS, total);
      desk.push({
        id: `bill-${shipment.id}`,
        kind: 'bill',
        party: shipment.customerCompany,
        reference: shipment.reference,
        shipmentRef: null,
        route: routeOf(shipment),
        date: shipment.scheduledPickupTime,
        amount: total,
        days: ageDays,
        to: buildPath(ROUTES.shipmentOverview, { id: shipment.id }),
      });
    }

    const haulierName =
      partnerById.get(shipment.partnerId)?.companyLegalName ?? shipment.transporterCompany;

    if (shipment.transporterPaidAt) {
      rankHaulier(shipment.partnerId, haulierName, Number(shipment.transporterPaidMinorUnits ?? 0), 0);
      continue;
    }

    if (!DELIVERED.includes(shipment.status)) continue;

    /* What the haulier is owed: the job less Fleetin's share. On an already
       invoiced job the document's STORED cut is the truth — the same figure
       the client was billed against — rather than a fresh calculation a
       renegotiated deal could quietly change. */
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
    rankHaulier(shipment.partnerId, haulierName, 0, due);
    desk.push({
      id: `pay-${shipment.id}`,
      kind: 'pay',
      party: haulierName,
      reference: invoice?.number ?? shipment.reference,
      shipmentRef: invoice ? shipment.reference : null,
      route: routeOf(shipment),
      date: shipment.scheduledPickupTime,
      amount: due,
      days: ageDays,
      /* The invoice when the job has been papered — that is the document the
         payout settles against — and the shipment when it has not. */
      to: invoice
        ? buildPath(ROUTES.financeInvoiceDetail, { invoiceId: invoice.id })
        : buildPath(ROUTES.shipmentOverview, { id: shipment.id }),
      shipmentId: shipment.id,
    });
  }

  /* The coverage series. Both lines are cumulative, so each week carries
     everything that has matured up to it — the question is when the running
     total clears the obligation, not what lands in any single week. */
  const weeks: CoverageWeek[] = [];
  let issuedRunning = 0;
  let projectedRunning = 0;
  let coverWeek: string | null = null;
  let issuedCoverWeek: string | null = null;

  for (let index = 0; index < COVERAGE_WEEKS; index += 1) {
    const bucket = thisWeek + index * WEEK_MS;
    issuedRunning += receiptsByWeek.get(bucket) ?? 0;
    projectedRunning += (receiptsByWeek.get(bucket) ?? 0) + (projectedByWeek.get(bucket) ?? 0);
    const label = index === 0 ? 'This week' : weekLabel(bucket);
    if (owedToTransporters > 0 && coverWeek === null && projectedRunning >= owedToTransporters) {
      coverWeek = label;
    }
    if (owedToTransporters > 0 && issuedCoverWeek === null && issuedRunning >= owedToTransporters) {
      issuedCoverWeek = label;
    }
    weeks.push({ label, issued: issuedRunning, projected: projectedRunning });
  }

  const comingIn = notInvoiced + owedByShippers;
  const lateAmount = ageing.d30.amount + ageing.d60.amount + ageing.d60plus.amount;

  const laneCount: Record<DeskKind, number> = { bill: 0, chase: 0, pay: 0 };
  for (const row of desk) laneCount[row.kind] += 1;

  return {
    comingIn,
    notInvoiced,
    notInvoicedCount,
    owedByShippers,
    openInvoiceCount,
    goingOut: owedToTransporters,
    /* Not a netting of the rail — the rail keeps both sizes. This is the one
       figure the old page refused to state anywhere, and a business funding
       the float between the two directions has to see it named. */
    gap: comingIn - owedToTransporters,
    commission,
    billed,
    /* What the book actually kept, against everything billed. Null rather than
       0% with nothing billed — a take rate on no billing is unknown, not zero. */
    takeRate: billed > 0 ? (commission / billed) * 100 : null,
    commissionSpark: [...commissionByMonth.entries()].map(([key, value]) => ({ key, value })),
    ageing,
    latePct: pctOf(lateAmount, owedByShippers),
    /* The verdict, as a date rather than a paragraph. `coverWeek` is the week
       the projected line clears the obligation; `issuedCoverWeek` is when the
       paper already on the desk would do it alone, and is usually null — which
       is the finding. */
    coverage: {
      weeks,
      owed: owedToTransporters,
      covered: coverWeek !== null,
      coverWeek,
      issuedCoverWeek,
    },
    /* Chase before bill before pay, biggest first inside each rung. */
    desk: desk.sort(
      (a, b) => DESK_PRIORITY[a.kind] - DESK_PRIORITY[b.kind] || b.amount - a.amount,
    ),
    laneCount,
    topClients: [...byClient.values()].sort((a, b) => b.amount - a.amount).slice(0, 5),
    topHauliers: [...byHaulier.values()]
      .sort((a, b) => b.amount + b.secondary - (a.amount + a.secondary))
      .slice(0, 5),
  };
}
