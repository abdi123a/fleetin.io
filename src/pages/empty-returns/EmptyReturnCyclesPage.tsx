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
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
} from '@/design-system/icons';
import { useEmptyContainers } from '@/features/empty-returns';
import { CRITICAL_THRESHOLD_MS } from '@/data/emptyReturnData';
import { formatKm } from '@/lib/co2';
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
import { ContainerCard } from './components/ContainerCard';

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
              <ContainerCard
                key={record.id}
                state="empty"
                container={record.container || record.bookingReference}
                line={record.line}
                size={record.size}
                onClick={() => openRecord(record.id)}
                /* The one place the card is not a fixed tile: these sit in a
                   responsive grid rather than a strip, so they take the cell. */
                className="w-auto min-w-0 shadow-2xs"
              />
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
        {/* Follows `FullCard`. A key that shows a colour the cards no longer
            wear is worse than no key at all. */}
        <span className="inline-block h-3 w-4 rounded-sm bg-stage-loaded" aria-hidden />
        Full container
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span
          className="inline-block h-3 w-4 rounded-sm border-2 border-dashed border-container-empty-border bg-container-empty-subtle"
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
        {/* Accent orange. The tab is the one mark that has to be found from
            across a page of six stacked chains, and every other colour on the
            card is now spoken for by the flow itself — green loaded, sky empty,
            violet paired, amber returning. Orange is the brand's own second
            colour and the only loud one the strip does not already use, so the
            tab can shout without saying anything about a container. */}
        <CornerBadge label={`Chain ${chain.id}`} intent="orange" position="top" />
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
          {/* The word, not a truck glyph. A lorry beside a company's own
              logo read as a second mark on the name — two icons, neither
              saying which of the chain's three parties this is. */}
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase leading-tight tracking-[0.09em] text-muted-foreground">
              Transporter
            </p>
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

        {/* The chain's own figures, on a dark neutral band.
            It was a grey pill on a white card — the quietest strip on the page
            carrying the only numbers that say the product worked. Filled, it
            becomes the card's spine and the flow below it reads as evidence.
            It has been three fills. Brand teal first — wrong, because a mint
            green "this went well" on teal is one hue family and came out a dull
            shade of its own background. Then `--tile-ink`, neutral so the
            greens and ambers read true, and reverted here on 2026-08-31: a
            near-black slab is the heaviest thing on the page and it was landing
            on a summary, not on the flow the card is actually about.

            `--primary-bold` is the house fill for a coloured surface carrying
            text. The one figure that still needs to stand out of it — the
            avoidance rate — takes `--stage-returning-on-fill`, the amber step
            picked to survive a saturated ground (3.7:1 on this teal). White
            reads at 5.9:1, so the labels no longer need an opacity step to sit
            below the figures: 10px against 14px bold is the hierarchy. */}
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg bg-primary-bold px-3.5 py-2.5 text-primary-bold-foreground shadow-2xs">
          {/* Plain counts. What happened, in white — they carry no verdict, and
              tinting them was what turned the row into one green wall with
              nothing standing out of it.

              "pairings" and "returns avoided" were TWO figures reading
              `chain.pairings` — the same number under two labels, on every
              chain, forever. `CycleChain.pairings` says so on its face: "links
              that ended in a pairing — each one is an empty return avoided".
              The outcome survives and the mechanism goes, which is the rule
              `StageChip` already follows for a closed container. */}
          <Figure label="cycles" value={String(chain.cycles.length)} />
          <Figure label="returns avoided" value={String(chain.pairings)} />
          {/* Not an invented threshold: avoidance below 100% means some empty
              on this chain went back on a trip of its own, which is exactly
              the cost the module exists to remove. */}
          <Figure label="avoidance" value={`${avoidance}%`} tone={avoidance < 100 ? 'warn' : 'neutral'} />
          {/* The road the realized links did not drive — Fleetin Impact, as
              the server judged it from the bookings' rungs. Absent until a
              link is realized and its garage round trip measured, because a
              "0 km" beside three pairings would read as measured and found to
              be nothing rather than not yet measured. */}
          {chain.avoidedKm > 0 && (
            <Figure label="km avoided" value={formatKm(chain.avoidedKm).value} />
          )}
          {/* Dwell is the one figure where longer is worse. The threshold is
              the module's own `CRITICAL_THRESHOLD_MS` (24h) rather than a new
              number: a day is what this module already calls the point where a
              container stops having comfortable margin, and a box that sat
              empty that long has spent it. Move it here if operations wants a
              tighter bar. */}
          <Figure
            label="avg empty"
            value={formatSpan(chain.averageEmptyMs)}
            tone={chain.averageEmptyMs >= CRITICAL_THRESHOLD_MS ? 'warn' : 'neutral'}
          />
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
            {chain.cycles.length} cycles — scroll or use the arrows
          </span>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={atStart}
              onClick={() => scrollByLink(-1)}
              aria-label="Earlier cycles in this chain"
              className="h-7 w-7 rounded-lg p-0"
            >
              <ChevronLeft className="size-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={atEnd}
              onClick={() => scrollByLink(1)}
              aria-label="Later cycles in this chain"
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
        variant="solid"
        intent="primary"
        size="sm"
        /* Teal, and filled. It was emerald-subtle, which is a hair off the
           green the loaded cards now wear — the badge read as a remark about a
           container instead of the state of the chain. Teal is the chain's own
           colour on this card (the band under it), and solid so it holds its
           corner against the orange tab opposite. */
        className="font-bold"
        title="A cycle in this chain is still waiting on a decision."
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
        title="Every cycle closed and the last one paired out — the chain continues once that container is emptied."
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

/** A figure is a plain fact until something is wrong with it. */
type FigureTone = 'neutral' | 'warn';

/**
 * One chain KPI, set on the band.
 *
 * **Colour carries the alarm, and nothing else carries anything.** The row got
 * worse when one thing did two jobs: tinting every good number green turned a
 * healthy chain into a wall of one colour, which is the same problem as a wall
 * of white with extra steps.
 *
 * So: the value is a step above its noun (figures first, what they are
 * second), and everything is white. Amber appears **only** where a figure is
 * saying something is wrong. A good chain is a clean white row; a bad one
 * carries one or two amber figures that are impossible to miss.
 *
 * There is no headline figure. There was one — an estimated detention saving,
 * set a size larger so it could be found without reading the row — and it was
 * removed on 2026-09-01: it was the only figure on the band that was not a
 * count of something that happened, and a modelled number set larger than the
 * measured ones beside it reads as the most solid thing there when it is the
 * least. The estimate still lives on the Performance page, which states its
 * method on its face ("2 container-days × rate per avoided trip") — that is
 * where an estimate can be read as one.
 *
 * Colour is never the only carrier: the label already names the fact
 * ("avoidance", "avg empty"), so a reader who cannot separate the hues loses
 * the emphasis, not the meaning.
 */
function Figure({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: FigureTone;
}) {
  return (
    <span className="flex shrink-0 items-baseline gap-1 whitespace-nowrap">
      <Mono
        className={cn(
          'font-bold leading-none text-sm',
          tone === 'warn' ? 'text-stage-returning-on-fill' : 'text-primary-bold-foreground',
        )}
      >
        {value}
      </Mono>
      <span className="text-[10px] leading-none">{label}</span>
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
        <LinkHeader index={index} dwellMs={emptyDwellOf(cycle, now)} closed={cycle.stage === 'closed'} risk={risk} />

        <div className="flex items-stretch">
          {/* One physical container, two states — bracketed into a single
              shape so the reader never has to notice on their own that the
              mono number repeats on both cards. Without this the only signal
              was two free-floating cards a thin grey arrow happened to sit
              between, easy to read as two different boxes at a glance —
              exactly the misreading this module exists to prevent. */}
          <div className="flex items-stretch rounded-lg border border-dashed border-border-strong/50 bg-surface-sunken/40 p-1">
            <ContainerCard
              state="full"
              container={cycle.container}
              line={cycle.line}
              size={cycle.size}
              onClick={() => onOpen(cycle.id)}
            />
            <UnloadMark />
            <ContainerCard
              state="empty"
              container={cycle.container}
              line={cycle.line}
              size={cycle.size}
              onClick={() => onOpen(cycle.id)}
            />
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
          {/* An invisible twin of the header on the left, not a guessed pixel
              height — a fixed `h-5` spacer drifted out of sync the moment the
              bracket around Full/Unload/Empty added its own border and padding,
              which is exactly the misalignment this was flagged for. It is now
              literally the same component, so the two can no longer disagree
              however the header changes. */}
          <LinkHeader index={index} dwellMs={emptyDwellOf(cycle, now)} closed={cycle.stage === 'closed'} risk={risk} ghost />
          {/* `flex-1 items-center`, and both halves matter.
              `flex-1` makes this row fill the column, which the outer
              `items-stretch` has already grown to the left column's height —
              so the row is exactly the card band. `items-center` then parks
              both children on that band's centre line.
              Without it the row was only as tall as its own content, so the
              PAIRED mark centred inside *itself*: on a link that also draws
              the onward load the row was 82px and the mark sat low, on one
              that does not it was 37px and the mark sat high — the same
              connector at two different heights down one chain. The onward
              card was 5px high for a related reason: the cards opposite are
              inset by the bracket's border and padding and this one is not,
              so aligning their boxes aligned nothing. Centring both against
              the band ignores the inset and lines up what the eye reads. */}
          <div className="flex flex-1 items-center">
            <PairMark />
            {isLastInWindow && (
              <ContainerCard
                state="full"
                /* A DIFFERENT box. The pairing mark beside it says so; it is not
                   said a second time in a weaker green — see `ContainerCard`. */
                container={cycle.nextFull.container}
                line={cycle.nextFull.line}
                size={cycle.nextFull.size}
                onClick={() => onOpen(cycle.id)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The head of one link — what step this is, how long the box sat, how it ended.
 *
 * It used to be three bare spans under a hairline: a small-caps "LINK 1", a
 * grey duration and a coloured word, none of them anchored to anything. The
 * user could not tell what the row *was*, which is fair — a rule with words
 * loose above it reads as a divider that happened to catch some text, not as a
 * header, and the verdict floated wherever the duration's width left it.
 *
 * Three things fix that, and they are all about giving the row a shape:
 *
 * - **It is a band, not a line.** A bordered strip on the sunken surface, the
 *   same one the flow sits on, so it reads as this link's own header and the
 *   cards below belong to it.
 * - **The step index is a tag.** A chain is a sequence and the first thing to
 *   know is which step you are looking at, so the number gets a filled chip
 *   instead of being the same grey as the duration beside it.
 * - **The verdict is right-aligned and toned.** `ml-auto` parks it on the
 *   band's right edge — the same edge the bracket below ends on — so it lands
 *   in one place on every link rather than drifting with the duration's width.
 *   It carries an icon and its stage colour, so "this one cost nothing" and
 *   "this one was late" are separable without reading.
 *
 * ## Why `ghost`
 *
 * The pairing column beside the cards needs a spacer exactly as tall as this
 * header or the two columns' cards stop lining up. That spacer is this
 * component rendered `invisible`, so it cannot drift from the real one however
 * this changes. A hard-coded height was tried and broke the first time the
 * header's padding moved.
 *
 * `w-0 overflow-hidden` is the other half of that, and it is load-bearing:
 * `invisible` hides a box, it does not remove it, so the ghost still claimed
 * its natural width. Once this header grew from a bare "LINK 1" into a band
 * with a duration and a verdict pill, that width went from ~30px to ~270px and
 * *stretched the pairing column to match* — blowing a 200px hole into the strip
 * between the empty box and the next link's load. Zero-width with the content
 * clipped keeps the height (the spans are `whitespace-nowrap`, so the line box
 * is unchanged) and lets the column size to the connector it actually draws.
 */
function LinkHeader({
  index,
  dwellMs,
  closed,
  risk,
  ghost = false,
}: {
  index: number;
  dwellMs: number;
  closed: boolean;
  risk: ReturnType<typeof riskOf>;
  ghost?: boolean;
}) {
  const protectedDeadline = risk === 'protected';

  /* Three verdicts, in the page's own stage vocabulary: emerald is the
     `closed, on time` role, red the `overdue` one, and a live link keeps the
     brand teal — it has not earned either verdict yet. */
  const verdict = !closed
    ? {
        label: 'Current',
        className: 'border-primary/30 bg-primary-subtle text-primary-subtle-foreground',
        icon: null,
      }
    : protectedDeadline
      ? {
          label: 'Deadline protected',
          className:
            'border-stage-closed-border bg-stage-closed-subtle text-stage-closed-subtle-foreground',
          icon: <ShieldCheck className="size-3" aria-hidden />,
        }
      : {
          label: 'Deadline missed',
          className:
            'border-stage-overdue-border/40 bg-stage-overdue-subtle text-stage-overdue-subtle-foreground',
          icon: <ShieldAlert className="size-3" aria-hidden />,
        };

  return (
    <div
      className={cn(
        'mx-1 mb-2 flex items-center gap-2 whitespace-nowrap rounded-md border border-border/70 bg-surface-sunken px-2 py-1',
        ghost && 'w-0 overflow-hidden invisible',
      )}
      aria-hidden={ghost || undefined}
    >
      <span className="shrink-0 rounded-full bg-foreground/85 px-2 py-px text-[9px] font-extrabold uppercase tracking-widest text-background">
        Cycle {index + 1}
      </span>

      <span className="text-[10px] text-muted-foreground">
        <Mono className="font-bold text-foreground">{formatSpan(dwellMs)}</Mono> empty
      </span>

      <span
        className={cn(
          'ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-px text-[10px] font-semibold',
          verdict.className,
        )}
      >
        {/* A live link gets a dot rather than an icon — nothing has happened to
            report, it is simply the one still running. */}
        {verdict.icon ?? <span className="size-1.5 rounded-full bg-primary" aria-hidden />}
        {verdict.label}
      </span>
    </div>
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
