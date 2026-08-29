import { useEffect, useMemo, useRef, useState } from 'react';

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
  Truck,
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

import { CompanyName, EmptyTag, Mono } from './components/marks';

/**
 * How far one press of the arrows travels.
 *
 * About one link: a `FULL → EMPTY` measures 442px, and 597px where it also
 * draws the load it hands forward. 460 lands the next link's FULL card near the
 * left edge with the previous EMPTY still half in view, so the reader keeps the
 * thread instead of being teleported.
 */
const SCROLL_STEP_PX = 460;

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
 * ## One strip per chain
 *
 * The chain is drawn end to end and travelled by scrolling — the arrows nudge
 * it along, they do not swap one link for another. A pager was tried and read
 * as broken for a structural reason: every link opens on a FULL card, so
 * replacing link 3 with link 4 changed the left of the view into something that
 * looks the same, and the eye concluded nothing had moved. A scroll shows the
 * movement itself, which is the point — the chain *runs*.
 *
 * The page still pages the **chains**, six at a time; it is only the links
 * inside one chain that are continuous.
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

          <div className="grid min-w-0 grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {pagedUnchained.rows.map((record) => (
              <button
                key={record.id}
                type="button"
                onClick={() => openRecord(record.id)}
                className="min-w-0 rounded-lg border-2 border-dashed border-stage-available-border bg-stage-available-subtle/50 p-3 text-left shadow-2xs transition duration-200 hover:bg-stage-available-subtle hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <EmptyTag small />
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

/**
 * v19's four-item key, drawn with the same swatches the flow uses.
 *
 * Four, not more: this page has exactly two card kinds and two connector kinds,
 * and the whole reason it is a picture rather than a table is that those four
 * marks carry the story. Naming them once at the top is what lets every card
 * below stay wordless.
 */
function Legend() {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-3 w-4 rounded-sm bg-container-full" aria-hidden />
        Full container
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span
          className="inline-block h-3 w-4 rounded-sm border-2 border-dashed border-stage-available-border bg-card"
          aria-hidden
        />
        Empty container
      </span>
      <span className="inline-flex items-center gap-1.5">
        <ArrowRight className="size-3" aria-hidden /> same container, unloaded
      </span>
      <span className="inline-flex items-center gap-1.5 font-semibold text-stage-paired-subtle-foreground">
        <ArrowLeftRight className="size-3" aria-hidden /> pairing — two different containers
      </span>
      <span className="inline-flex items-center gap-1.5 text-stage-returning-subtle-foreground">
        <ArrowRight className="size-3" aria-hidden /> empty return
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
  /* One continuous strip, travelled by scrolling — not a pager that swaps one
     link for the next. Paging looked broken for a structural reason: every link
     opens on a FULL card, so replacing link 3 with link 4 changed the left-hand
     third of the view into something that looks identical, and the eye read it
     as "nothing happened". A smooth scroll carries the previous link off the
     left edge while the next arrives on the right, so the movement itself shows
     the chain running. */
  const flowRef = useRef<HTMLDivElement>(null);
  const tweenRef = useRef<number | null>(null);

  /**
   * Travel one link, eased.
   *
   * Hand-tweened rather than `scrollBy({ behavior: 'smooth' })`, because that
   * API is a **no-op in the embedded browser** the app is previewed in — the
   * arrows appeared dead, and where the native animation did run it was the
   * host's easing, not ours. A 380ms ease-in-out is short enough to feel like a
   * response and long enough to show the strip travelling, which is the whole
   * point: the movement is what says the chain runs.
   */
  const scrollByLink = (direction: 1 | -1) => {
    const el = flowRef.current;
    if (!el) return;
    if (tweenRef.current !== null) cancelAnimationFrame(tweenRef.current);

    const from = el.scrollLeft;
    const limit = el.scrollWidth - el.clientWidth;
    const to = Math.max(0, Math.min(limit, from + direction * SCROLL_STEP_PX));
    const distance = to - from;
    if (Math.abs(distance) < 1) return;

    /* A hidden tab never paints, so `requestAnimationFrame` never fires and the
       tween would silently never start — the arrow would simply do nothing.
       Land it instead: correct, just not animated. */
    if (document.hidden) {
      el.scrollLeft = to;
      syncEdges();
      return;
    }

    let startedAt: number | null = null;
    const step = (stamp: number) => {
      if (startedAt === null) startedAt = stamp;
      const progress = Math.min((stamp - startedAt) / 380, 1);
      /* ease-in-out cubic — accelerates away, settles rather than stops dead. */
      const eased =
        progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      el.scrollLeft = from + distance * eased;
      tweenRef.current = progress < 1 ? requestAnimationFrame(step) : null;
    };
    tweenRef.current = requestAnimationFrame(step);
  };

  useEffect(
    () => () => {
      if (tweenRef.current !== null) cancelAnimationFrame(tweenRef.current);
    },
    [],
  );

  const state = chainStateOf(chain);

  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);
  const syncEdges = () => {
    const el = flowRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 1);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1);
  };
  useEffect(syncEdges, [chain.cycles.length]);

  const avoidance = chain.cycles.length
    ? Math.round((chain.pairings / chain.cycles.length) * 100)
    : 0;

  return (
    <Card className="relative min-w-0 overflow-hidden rounded-lg border border-border/80 bg-card shadow-2xs">
      <div className="absolute left-0 top-0 z-10 select-none">
        <CornerBadge label={`Chain ${chain.id}`} intent="teal" position="top" />
      </div>

      {/* Header — who, what state, and the four figures that matter.
          Named by TRANSPORTER, not shipper or line: a chain is a run of
          pairings, and "same transporter" is the one hard gate every pairing
          shares — the one truck relays the whole chain. The shipper and the
          shipping line carry no such guarantee (neither is a gate the engine
          checks), so a link two cars down can belong to a different shipper
          under a different line; naming the chain after link 1's happened to
          be wrong more often than it was right. */}
      <div className="min-w-0 space-y-2 px-4 pb-3 pt-9">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <Truck className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            {chain.first.transporter ? (
              <CompanyName
                name={chain.first.transporter}
                size="sm"
                className="min-w-0 text-sm font-extrabold leading-tight text-foreground"
              />
            ) : (
              <span className="text-sm font-extrabold text-warning-subtle-foreground">
                No transporter assigned
              </span>
            )}
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

      {/* The whole chain, end to end, in one strip. */}
      <div
        ref={flowRef}
        onScroll={syncEdges}
        className="w-0 min-w-full overflow-x-auto border-t border-border/60 bg-surface-sunken/40"
      >
        <div className="flex min-w-max items-stretch gap-0 px-4 py-4">
          {chain.cycles.map((cycle, index) => (
            <ChainLink
              key={cycle.id}
              cycle={cycle}
              index={index}
              now={now}
              onOpen={onOpen}
              /* Only the final link draws its onward full load, so the strip
                 never ends on a dangling arrow. */
              isLastInWindow={index === chain.cycles.length - 1}
            />
          ))}
        </div>
      </div>

      {chain.cycles.length > 1 && (
        <div className="flex min-w-0 items-center justify-between gap-2 border-t border-border/60 px-4 py-2">
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {chain.cycles.length} links — scroll or use the arrows
          </span>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={atStart}
              onClick={() => scrollByLink(-1)}
              aria-label="Earlier links in this chain"
              className="h-7 w-7 rounded-lg p-0"
            >
              <ChevronLeft className="size-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={atEnd}
              onClick={() => scrollByLink(1)}
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
        className="border-stage-closed-border bg-stage-closed-subtle text-stage-closed-subtle-foreground"
        title="A link in this chain is still waiting on a decision."
      >
        Active
      </Badge>
    );
  }
  if (state === 'handed_on') {
    return (
      <Badge
        variant="subtle"
        intent="primary"
        size="sm"
        className="border-stage-paired-border bg-stage-paired-subtle text-stage-paired-subtle-foreground"
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

/**
 * One chain KPI. v19 typesets these as a value over a small-caps label and
 * tints only the pairing figures violet — the two numbers that say the product
 * worked. Everything else stays neutral so the eye lands on those.
 */
function Figure({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <span className="shrink-0 whitespace-nowrap">
      <Mono
        className={cn('font-bold', accent ? 'text-stage-paired-subtle-foreground' : 'text-foreground')}
      >
        {value}
      </Mono>{' '}
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
          {/* One physical container, two states — bracketed into a single
              shape so the reader never has to notice on their own that the
              mono number repeats on both cards. Without this the only signal
              was two free-floating cards a thin grey arrow happened to sit
              between, easy to read as two different boxes at a glance —
              exactly the misreading this module exists to prevent. */}
          <div className="flex items-stretch rounded-lg border border-dashed border-border-strong/50 bg-surface-sunken/40 p-1">
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
          </div>

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
                  /* Back at the depot is the RETURNED grey — done, and quiet
                     about it. A planned return is still an ask, so it keeps
                     the warning amber until the box is actually home. */
                  returned
                    ? 'border-container-returned-border bg-container-returned-subtle text-container-returned-subtle-foreground'
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
          {/* An invisible twin of the "Link N" header row on the left, not a
              guessed pixel height — a fixed `h-5` spacer drifted out of sync
              the moment the bracket around Full/Unload/Empty added its own
              border and padding, which is exactly the misalignment this was
              flagged for. Same markup, `invisible` instead of real content,
              so this column's top row is always exactly as tall as the real
              one, however that header changes in the future. */}
          <div
            className="invisible mx-1 mb-2 flex items-baseline gap-2 whitespace-nowrap border-t-2 border-border pt-1"
            aria-hidden
          >
            <span className="text-[10px] font-extrabold uppercase tracking-widest">Link</span>
          </div>
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
          ? 'border-2 border-dashed border-container-full-border bg-container-full-subtle text-container-full-subtle-foreground'
          : 'bg-container-full text-container-full-foreground',
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
      /* v19 draws the waiting box as a dashed SKY outline, not the brand
         yellow. On this page the card is a statement about the *stage* — this
         container is sitting empty, undecided — which is the axis
         `--stage-available` owns, and it is already what the calendar paints
         "empty available" with. The yellow `--container-empty` mark still means
         "this box is empty" wherever the question is what is inside it. */
      className="min-w-36 shrink-0 rounded-lg border-2 border-dashed border-stage-available-border bg-stage-available-subtle/60 px-3 py-2 text-left transition-colors duration-200 hover:bg-stage-available-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-center gap-1.5 text-[9px] font-extrabold uppercase tracking-widest text-stage-available-subtle-foreground">
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

/**
 * Same container, new state — the quiet connector, and deliberately not the
 * loud one: nothing changed hands here, so it must not compete with `PairMark`
 * for attention. But quiet is not the same as illegible. It used to be a 7px
 * grey word with no noun in it ("Unloaded" of *what*?); the caption now says
 * the fact the arrow is illustrating, in the same two-line shape `PairMark`
 * uses, so the two connectors read as the same *kind* of mark even though one
 * outranks the other.
 */
function UnloadMark() {
  return (
    <div className="flex shrink-0 flex-col items-center justify-center self-center px-2">
      <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
      <span className="whitespace-nowrap text-[8px] font-extrabold uppercase tracking-wider text-foreground">
        Same box
      </span>
      <span className="whitespace-nowrap text-[7px] text-muted-foreground">unloaded</span>
    </div>
  );
}

/**
 * Two different containers, linked. The caption is the whole point.
 *
 * Violet, per v19 — and load-bearing rather than decorative: teal on this page
 * means FULL, so drawing the pairing in teal made the product's own win state
 * look like a remark about the cargo. The flanking bars are v19's too; they
 * make the mark read as a *join* between two cards rather than an arrow
 * pointing at one of them.
 */
function PairMark() {
  return (
    <div className="flex shrink-0 flex-col items-center justify-center self-center px-2">
      <span className="flex items-center gap-0.5 text-stage-paired">
        <span className="h-0.5 w-3 rounded bg-stage-paired-border" aria-hidden />
        <ArrowLeftRight className="size-3.5" aria-hidden />
        <span className="h-0.5 w-3 rounded bg-stage-paired-border" aria-hidden />
      </span>
      <span className="text-[8px] font-extrabold uppercase tracking-wider text-stage-paired-subtle-foreground">
        Paired
      </span>
      <span className="whitespace-nowrap text-[7px] text-muted-foreground">different container</span>
    </div>
  );
}

/** The final movement home. Amber, per v19 — it is the branch that costs a trip. */
function ReturnMark() {
  return (
    <div className="flex shrink-0 flex-col items-center justify-center self-center px-1.5">
      <ArrowRight className="size-3.5 text-stage-returning" aria-hidden />
      <span className="text-[7px] font-bold uppercase tracking-wider text-stage-returning-subtle-foreground">
        Return
      </span>
    </div>
  );
}

export default EmptyReturnCyclesPage;
