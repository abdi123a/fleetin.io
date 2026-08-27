import { useMemo, useRef, useState } from 'react';

import { TablePager, usePagedRows } from '@/components/common/TablePager';
import { Badge, Button, Card, CornerBadge, EmptyState } from '@/design-system';
import {
  ArrowLeftRight,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Link2,
  Package,
  PackageOpen,
  RotateCcw,
} from '@/design-system/icons';
import { AVOIDED_TRIP_DETENTION_DAYS, useEmptyContainers } from '@/features/empty-returns';
import { detentionRatePerDay, formatDetention } from '@/data/emptyReturnData';
import {
  chainStateOf,
  emptyDwellOf,
  formatSpan,
  formatStamp,
  riskOf,
  selectChains,
  useEmptyReturnStore,
} from '@/stores/emptyReturn.store';
import type { CycleChain, EmptyReturnRecord } from '@/types/emptyReturn';
import { cn } from '@/utils';

import { CompanyName, Mono } from './components/marks';

/**
 * How many links of a chain are drawn at once before the pager takes over.
 *
 * **One**, and the arithmetic is the reason. A link is `FULL → EMPTY`, and a
 * paired one also draws the full load it hands forward — measured, that is
 * 442px on its own and 597px with the handoff. The card it lives in is about
 * 709px. Two links come to 1072px, so 363px of every window sat off-screen
 * behind a horizontal scroll nobody could see.
 *
 * That made the pager look broken rather than tight: pressing "later" *did*
 * advance, but the only part on screen was the left-hand FULL card, which is
 * structurally identical on every link — so the view appeared not to move.
 *
 * One link is also the honest unit. `FULL → EMPTY ⇄ next FULL` is the entire
 * claim this page makes; showing one of them whole beats showing one and a
 * third of the next.
 */
const LINKS_PER_VIEW = 1;

/**
 * Cycles — *what happened operationally?*
 *
 * One flow per chain, and the flow is the argument:
 *
 * ```
 *  FULL A ─unloaded→ EMPTY A ⇄paired⇄ FULL B ─unloaded→ EMPTY B ─return→ DEPOT ✓
 *  └── link 1 ────────────────┘       └── link 2 ─────────────────────────────┘
 * ```
 *
 * Every `⇄` in that line is one empty return that was never driven. That is the
 * whole product, drawn — which is why this page is a picture and not a table.
 *
 * Two connector marks, and they must never be confused:
 *
 * - **→ unloaded** — thin, neutral. The *same* physical container changing state.
 * - **⇄ paired** — brand-coloured, labelled *different container*. Two different
 *   boxes, linked by one coordinated movement.
 *
 * ## Why it pages twice
 *
 * A fourteen-link chain drawn end to end is a horizontal line four screens
 * wide, and the arrows at the end of it were the only way to travel — so the
 * reader lost their place and never saw links 5 through 14. Two pagers fix
 * that without hiding anything: the page pages the **chains**, and each chain
 * steps through its own **links**, one whole link at a time, saying which one.
 * Every link is still reachable; none of them is a scroll.
 *
 * ## A chain is never "completed"
 *
 * It is running, handed on, or closed at the depot — see `chainStateOf`.
 * Completion is a property of a link, not of a lineage.
 */
export function EmptyReturnCyclesPage() {
  const { records, now } = useEmptyContainers();
  const openRecord = useEmptyReturnStore((state) => state.openRecord);

  const chains = useMemo(() => selectChains(records, now), [records, now]);
  const pagedChains = usePagedRows(chains, { pageSize: 6 });

  /**
   * Containers that never made it into a chain.
   *
   * A box only joins a chain when somebody pairs it or confirms its return, so
   * this is every container still awaiting a decision. Listing them keeps the
   * page honest: it is a record of what happened, and "nothing yet" is part of
   * what happened.
   */
  const unchained = useMemo(() => records.filter((record) => !record.chainId), [records]);
  const pagedUnchained = usePagedRows(unchained, { pageSize: 12 });

  if (chains.length === 0 && unchained.length === 0) {
    return (
      <Card className="rounded-lg border border-border/80 p-12">
        <EmptyState
          icon={<Link2 />}
          title="No cycles yet"
          description="A chain starts the first time an empty container is paired with an upcoming full load, or confirmed back at the depot."
        />
      </Card>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <Legend />

      {chains.length > 0 && (
        <section className="min-w-0 space-y-3">
          <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
            Chains
            <Badge variant="subtle" intent="primary" size="sm" className="font-bold">
              {chains.length}
            </Badge>
          </h2>

          <div className="space-y-3">
            {pagedChains.rows.map((chain) => (
              <ChainCard key={chain.id} chain={chain} now={now} onOpen={openRecord} />
            ))}
          </div>

          <TablePager paged={pagedChains} noun="chains" />
        </section>
      )}

      {unchained.length > 0 && (
        <section className="min-w-0 space-y-3">
          <h2 className="flex items-center gap-2 text-base font-bold text-muted-foreground">
            Not in a chain yet
            <Badge variant="subtle" intent="default" size="sm" className="font-bold">
              {unchained.length}
            </Badge>
          </h2>
          <p className="text-xs text-muted-foreground">
            A container joins a chain the moment it is paired, or its return is confirmed.
          </p>

          <div className="grid min-w-0 grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {pagedUnchained.rows.map((record) => (
              <button
                key={record.id}
                type="button"
                onClick={() => openRecord(record.id)}
                className="min-w-0 rounded-lg border border-dashed border-info/60 bg-card p-3 text-left shadow-2xs transition duration-200 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-info-subtle-foreground">
                  <PackageOpen className="size-3" aria-hidden /> Empty
                </div>
                <Mono className="mt-0.5 block truncate text-sm font-bold text-foreground">
                  {record.container || record.bookingReference}
                </Mono>
                <div className="truncate text-[11px] text-muted-foreground">
                  {record.size} · {record.line}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Empty for {formatSpan(now - (record.emptyReadyAt ?? now))}
                </div>
              </button>
            ))}
          </div>

          <TablePager paged={pagedUnchained} noun="containers" />
        </section>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Legend
 * ------------------------------------------------------------------------- */

function Legend() {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-3 w-4 rounded-sm bg-primary-bold" aria-hidden /> Full
        container
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span
          className="inline-block h-3 w-4 rounded-sm border border-dashed border-info bg-surface"
          aria-hidden
        />
        Empty container
      </span>
      <span className="inline-flex items-center gap-1.5">
        <ArrowRight className="size-3" aria-hidden /> same container, unloaded
      </span>
      <span className="inline-flex items-center gap-1.5 font-semibold text-primary">
        <ArrowLeftRight className="size-3" aria-hidden /> pairing — two different containers
      </span>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * One chain
 * ------------------------------------------------------------------------- */

function ChainCard({
  chain,
  now,
  onOpen,
}: {
  chain: CycleChain;
  now: number;
  onOpen: (recordId: string) => void;
}) {
  const [linkIndex, setLinkIndex] = useState(0);
  /* Reset the sideways scroll when the link changes. A window fits at normal
     widths, but a narrow pane can still overflow, and landing on link 4 already
     scrolled to where link 3 had been left is how a working pager reads broken. */
  const flowRef = useRef<HTMLDivElement>(null);
  const goTo = (next: number) => {
    setLinkIndex(next);
    flowRef.current?.scrollTo({ left: 0, behavior: 'smooth' });
  };
  const state = chainStateOf(chain);

  const pageCount = Math.max(1, Math.ceil(chain.cycles.length / LINKS_PER_VIEW));
  const page = Math.min(linkIndex, pageCount - 1);
  const from = page * LINKS_PER_VIEW;
  const visible = chain.cycles.slice(from, from + LINKS_PER_VIEW);

  const avoidance = chain.cycles.length
    ? Math.round((chain.pairings / chain.cycles.length) * 100)
    : 0;

  return (
    <Card className="relative min-w-0 overflow-hidden rounded-lg border border-border/80 bg-card shadow-2xs">
      <div className="absolute left-0 top-0 z-10 select-none">
        <CornerBadge label={chain.id} intent="teal" position="top" />
      </div>

      {/* Header — who, what state, and the four figures that matter */}
      <div className="min-w-0 space-y-2 px-4 pb-3 pt-9">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <CompanyName
              name={chain.first.client}
              size="sm"
              className="min-w-0 text-sm font-extrabold leading-tight text-foreground"
            />
            <span className="shrink-0 whitespace-nowrap text-[11px] text-muted-foreground">
              {chain.first.line}
            </span>
          </div>
          <ChainStateBadge state={state} />
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border/50 bg-secondary/40 px-3 py-1.5 text-[11px] text-muted-foreground">
          <Figure label="links" value={String(chain.cycles.length)} />
          <Figure label="pairings" value={String(chain.pairings)} accent />
          <Figure label="returns avoided" value={String(chain.pairings)} accent />
          <Figure label="avoidance" value={`${avoidance}%`} />
          <Figure
            label="est. detention avoided"
            value={formatDetention(
              chain.pairings * AVOIDED_TRIP_DETENTION_DAYS * detentionRatePerDay(),
            )}
          />
          <Figure label="avg empty" value={formatSpan(chain.averageEmptyMs)} />
        </div>
      </div>

      {/* The flow — one window of links at a time */}
      <div
        ref={flowRef}
        className="w-0 min-w-full overflow-x-auto border-t border-border/60 bg-surface-sunken/40"
      >
        <div className="flex min-w-max items-stretch gap-0 px-4 py-4">
          {visible.map((cycle, index) => (
            <ChainLink
              key={cycle.id}
              cycle={cycle}
              index={from + index}
              now={now}
              onOpen={onOpen}
              /* The connector belongs between two drawn links; the last one in
                 the window shows its onward full load instead, so the window
                 never ends on a dangling arrow. */
              isLastInWindow={index === visible.length - 1}
            />
          ))}
        </div>
      </div>

      {/* The link pager — the whole reason this is no longer an endless line */}
      {pageCount > 1 && (
        <div className="flex min-w-0 items-center justify-between gap-2 border-t border-border/60 px-4 py-2">
          <span className="text-[11px] tabular-nums text-muted-foreground">
            Link <b className="font-bold text-foreground">{from + 1}</b> of {chain.cycles.length}
          </span>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => goTo(page - 1)}
              aria-label="Earlier links in this chain"
              className="h-7 w-7 rounded-lg p-0"
            >
              <ChevronLeft className="size-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pageCount - 1}
              onClick={() => goTo(page + 1)}
              aria-label="Later links in this chain"
              className="h-7 w-7 rounded-lg p-0"
            >
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function ChainStateBadge({ state }: { state: ReturnType<typeof chainStateOf> }) {
  if (state === 'running') {
    return (
      <Badge
        variant="subtle"
        intent="success"
        size="sm"
        title="A link in this chain is still waiting on a decision."
      >
        Running
      </Badge>
    );
  }
  if (state === 'handed_on') {
    return (
      <Badge
        variant="subtle"
        intent="primary"
        size="sm"
        title="Every link closed and the last one paired out — the chain continues once that container is emptied."
      >
        Handed on
      </Badge>
    );
  }
  return (
    <Badge
      variant="subtle"
      intent="default"
      size="sm"
      title="The last empty went back to the depot alone — there is nothing left to hand forward."
    >
      Closed at the depot
    </Badge>
  );
}

function Figure({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <span className="shrink-0 whitespace-nowrap">
      <Mono className={cn('font-bold', accent ? 'text-primary' : 'text-foreground')}>{value}</Mono>{' '}
      {label}
    </span>
  );
}

/* ---------------------------------------------------------------------------
 * One link of the flow
 * ------------------------------------------------------------------------- */

function ChainLink({
  cycle,
  index,
  now,
  onOpen,
  isLastInWindow,
}: {
  cycle: EmptyReturnRecord;
  index: number;
  now: number;
  onOpen: (recordId: string) => void;
  isLastInWindow: boolean;
}) {
  const paired = Boolean(cycle.nextFull);
  const returned = cycle.stage === 'closed' && !cycle.nextFull;
  const planning = cycle.stage === 'return_planned';
  const risk = riskOf(cycle, now);

  return (
    <div className="flex items-stretch">
      <div className="flex flex-col">
        <div className="mx-1 mb-2 flex items-baseline gap-2 whitespace-nowrap border-t-2 border-border pt-1">
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">
            Link {index + 1}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {formatSpan(emptyDwellOf(cycle, now))} empty
          </span>
          {cycle.stage === 'closed' ? (
            <span
              className={cn(
                'text-[10px] font-semibold',
                risk === 'protected' ? 'text-primary' : 'text-destructive',
              )}
            >
              {risk === 'protected' ? 'Deadline protected' : 'Deadline missed'}
            </span>
          ) : (
            <span className="text-[10px] font-semibold text-primary">Current</span>
          )}
        </div>

        <div className="flex items-stretch">
          <FullCard
            container={cycle.container}
            reference={cycle.shipmentReference ?? cycle.prevLoad}
            line={cycle.line}
            size={cycle.size}
            stamp={cycle.fullPickupAt}
            stampLabel="Collected"
            onClick={() => onOpen(cycle.id)}
          />
          <UnloadMark />
          <EmptyCard cycle={cycle} now={now} onClick={() => onOpen(cycle.id)} />

          {cycle.stage === 'empty' && (
            <>
              <div className="flex items-center px-1.5">
                <ArrowRight className="size-3.5 text-border" aria-hidden />
              </div>
              <div className="min-w-32 shrink-0 self-center rounded-lg border-2 border-dashed border-border-strong bg-surface-sunken px-3 py-2">
                <div className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">
                  Next decision
                </div>
                <div className="text-[11px] font-bold text-foreground">Empty Ready</div>
              </div>
            </>
          )}

          {(returned || planning) && (
            <>
              <ReturnMark />
              <div
                className={cn(
                  'min-w-36 shrink-0 self-center rounded-lg border-2 px-3 py-2',
                  returned
                    ? 'border-success bg-success-subtle text-success-subtle-foreground'
                    : 'border-warning bg-warning-subtle text-warning-subtle-foreground',
                )}
              >
                <div className="flex items-center gap-1.5 text-[9px] font-extrabold uppercase tracking-widest">
                  {returned ? (
                    <CheckCircle2 className="size-3" aria-hidden />
                  ) : (
                    <RotateCcw className="size-3" aria-hidden />
                  )}
                  {returned ? 'Depot' : 'Return planned'}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {returned ? (
                    <>
                      <Mono>{formatStamp(cycle.returnedAt)}</Mono> ·{' '}
                      {cycle.outcome === 'returned_late' ? 'late' : 'on time'}
                    </>
                  ) : (
                    <>
                      Deadline <Mono className="font-semibold">{formatStamp(cycle.deadline)}</Mono>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* The pairing connector. The last link in the window draws the full load
          it handed forward, so the reader sees where the chain goes next. */}
      {paired && cycle.nextFull && (
        <div className="flex flex-col">
          <div className="mb-2 h-5 pt-1" aria-hidden />
          <div className="flex items-stretch">
            <PairMark />
            {isLastInWindow && (
              <FullCard
                dashed
                container={cycle.nextFull.container}
                reference={cycle.nextFull.shipmentReference ?? cycle.nextFull.missionId ?? '—'}
                line={cycle.nextFull.line}
                size={cycle.nextFull.size}
                stamp={cycle.nextFull.pickupAt}
                stampLabel="Pickup"
                onClick={() => onOpen(cycle.id)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Flow pieces
 * ------------------------------------------------------------------------- */

function FullCard({
  container,
  reference,
  line,
  size,
  stamp,
  stampLabel,
  dashed = false,
  onClick,
}: {
  container: string;
  reference: string;
  line: string;
  size: string;
  stamp: number | null;
  stampLabel: string;
  dashed?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'min-w-36 shrink-0 rounded-lg px-3 py-2 text-left transition-shadow duration-200 hover:shadow-md',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        dashed
          ? 'border-2 border-dashed border-primary bg-primary-subtle text-primary-subtle-foreground'
          : 'bg-primary-bold text-primary-bold-foreground',
      )}
    >
      <div className="flex items-center gap-1.5 text-[9px] font-extrabold uppercase tracking-widest opacity-80">
        <Package className="size-3" aria-hidden /> Full
      </div>
      <Mono className="mt-0.5 block truncate text-sm font-bold">{container || '—'}</Mono>
      <div className="truncate text-[9px] opacity-80">
        <Mono>{reference}</Mono> · {line} · {size}
      </div>
      <div className="truncate text-[9px] opacity-70">
        {stampLabel} <Mono>{formatStamp(stamp)}</Mono>
      </div>
    </button>
  );
}

function EmptyCard({
  cycle,
  now,
  onClick,
}: {
  cycle: EmptyReturnRecord;
  now: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-w-36 shrink-0 rounded-lg border-2 border-dashed border-info bg-surface px-3 py-2 text-left transition-colors duration-200 hover:bg-info-subtle/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-center gap-1.5 text-[9px] font-extrabold uppercase tracking-widest text-info-subtle-foreground">
        <PackageOpen className="size-3" aria-hidden /> Empty
      </div>
      <Mono className="mt-0.5 block truncate text-sm font-bold text-foreground">
        {cycle.container || '—'}
      </Mono>
      <div className="truncate text-[9px] text-muted-foreground">
        Since <Mono>{formatStamp(cycle.emptyReadyAt)}</Mono>
      </div>
      <div className="truncate text-[9px] text-muted-foreground">
        Empty <Mono className="font-semibold">{formatSpan(emptyDwellOf(cycle, now))}</Mono>
      </div>
    </button>
  );
}

/** Same container, new state. */
function UnloadMark() {
  return (
    <div className="flex shrink-0 flex-col items-center justify-center self-center px-1.5">
      <ArrowRight className="size-3.5 text-border-strong" aria-hidden />
      <span className="text-[7px] font-bold uppercase tracking-wider text-muted-foreground">
        Unloaded
      </span>
    </div>
  );
}

/** Two different containers, linked. The caption is the whole point. */
function PairMark() {
  return (
    <div className="flex shrink-0 flex-col items-center justify-center self-center px-2">
      <ArrowLeftRight className="size-3.5 text-primary" aria-hidden />
      <span className="text-[8px] font-extrabold uppercase tracking-wider text-primary">Paired</span>
      <span className="whitespace-nowrap text-[7px] text-muted-foreground">different container</span>
    </div>
  );
}

function ReturnMark() {
  return (
    <div className="flex shrink-0 flex-col items-center justify-center self-center px-1.5">
      <ArrowRight className="size-3.5 text-warning" aria-hidden />
      <span className="text-[7px] font-bold uppercase tracking-wider text-warning-subtle-foreground">
        Return
      </span>
    </div>
  );
}

export default EmptyReturnCyclesPage;
