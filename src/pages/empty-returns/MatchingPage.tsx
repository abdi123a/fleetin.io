import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { buildPath, ROUTES } from '@/config/routes';

import {
  Button,
  Card,
  EmptyState,
} from '@/design-system';
import {
  ArrowLeft,
  CheckCircle2,
  RotateCcw,
} from '@/design-system/icons';
import {
  formatContainerSize,
  riskTextClass,
} from '@/data/emptyReturnData';
import {
  incompatibleLoadsFor,
  suggestLoadsFor,
  useEmptyContainerActions,
  useEmptyContainers,
} from '@/features/empty-returns';
import { formatSpan, formatStamp, rejectedLoadsFor, riskOf, useEmptyReturnStore } from '@/stores/emptyReturn.store';
import type { EmptyReturnRecord, PairingSuggestion } from '@/types/emptyReturn';
import { cn } from '@/utils';

import { TablePager, usePagedRows } from '@/components';
import { ContainerCard } from './components/ContainerCard';
import { PlanReturnDialog } from './components/PlanReturnDialog';
import { SuggestionCard } from './components/SuggestionCard';
import { EmptyTag, FullTag, Mono, RiskBadge } from './components/marks';
import { PairingCelebration } from './components/PairingCelebration';

/**
 * Matching — *which empty containers are available, and where can they be used?*
 *
 * Restored on 2026-08-29 from the v19 design, and since that same day the
 * module's **only** matching surface: the Match Recommendations popup was
 * deleted outright at the user's instruction, so there is one place a pairing
 * is made and no second screen to drift from it.
 *
 * It works one container at a time, deeply. Pick a box on the left, read every
 * opportunity for it on the right — the score, the margin, the compatibility
 * checklist, and under a disclosure the reason each refused load was refused.
 * Planning the return instead is the other branch and asks for a real slot.
 *
 * ## Demand is never entered here
 *
 * Every opportunity on the right is a real open shipment created in the
 * Shipment module. There is no full-load inventory to maintain in this product,
 * and adding one would be a second place the truth could live.
 */


/**
 * How much room is left between the top of an element and the bottom of the
 * window.
 *
 * The workbench has to END at the bottom of the window, so that the page
 * itself never scrolls and the two columns move only within themselves. What
 * sits ABOVE it — the app header, the module's title, whatever that title
 * wraps to at this width — is not a number this file can know.
 *
 * It was guessed first, as `calc(100vh - header - 2rem)`, and came out 155px
 * too tall: the module's own heading, the grid's gap and the page's bottom
 * padding are all above or below the workbench and none of them were in the
 * sum. The page kept scrolling, and because the right-hand panel never
 * travelled far enough to reach its sticky offset it simply moved with it —
 * which is the whole thing this was meant to stop.
 *
 * So it is measured. `+ scrollY` reads the element's position in the DOCUMENT
 * rather than the viewport, which is what keeps this stable: shrinking the
 * column changes the page height, and a viewport-relative reading would feed
 * that change back in as a new answer.
 */
function useRoomBelow(): [(node: HTMLDivElement | null) => void, number | null] {
  /* A CALLBACK ref, held in state, rather than `useRef`.
     
     The bench is not mounted on the first renders — the yard is still loading
     and the page returns its empty state instead — so a ref object is still
     null when the effect runs, and because a ref's identity never changes the
     effect would never run again once the bench appeared. The measurement
     stayed null for the life of the page and nothing was ever capped. Storing
     the node in state re-runs the effect the moment it attaches. */
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [room, setRoom] = useState<number | null>(null);

  useEffect(() => {
    if (!element) return;

    const measure = () => {
      /* Below `lg` there is no bench — the pile IS the screen and the matches
         are a second step — so nothing is capped and the page scrolls as it
         always did. `null` says "leave it alone". */
      if (window.innerWidth < 1024) {
        setRoom(null);
        return;
      }
      const top = element.getBoundingClientRect().top + window.scrollY;

      /* Everything the layout reserves BELOW the bench — the module chrome's
         `pb-12` and the app shell's own bottom padding. The bench is the last
         child of each of those, so their bottom padding is exactly the space
         the document still wants under it, and leaving it out left the page
         64px taller than the window: enough to scroll, which moved both
         columns together and undid the point of the exercise.

         A floor, so a short window collapses the column to something usable
         rather than to nothing. */
      let below = 0;
      for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
        below += Number.parseFloat(window.getComputedStyle(node).paddingBottom) || 0;
      }
      setRoom(Math.max(320, window.innerHeight - top - below));
    };

    measure();
    /* Resize only. Observing the body would watch the very height this sets
       and re-fire on its own output. The element's document position moves
       when the header wraps, and the header wraps on resize. */
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [element]);

  return [setElement, room];
}

export function MatchingPage() {
  /* `awaiting`, not `onBoard`.
   *
   * `onBoard` also carries `return_planned` boxes, so a container whose return
   * had just been planned stayed in the yard column — under a toast that had
   * literally said "matching has stopped for this container". The workbench
   * offers what still owes a decision; a planned return is a decision, and it
   * is revisited from the container's own dialog, which can cancel or re-plan
   * it. */
  const { awaiting: onBoard, loads, now } = useEmptyContainers();
  const selectedId = useEmptyReturnStore((state) => state.selectedEmptyId);
  const selectEmpty = useEmptyReturnStore((state) => state.selectEmpty);
  const rejected = useEmptyReturnStore((state) => state.rejected);
  const rejectPairing = useEmptyReturnStore((state) => state.rejectPairing);
  const actions = useEmptyContainerActions();

  /** v19's confirmation banner — the pairing that was just committed, drawn. */
  const [lastPairing, setLastPairing] = useState<{ empty: string; full: string; load: string } | null>(
    null,
  );
  const [showIncompatible, setShowIncompatible] = useState(false);
  /** The container a "Plan empty return" click is asking a slot for. */
  const [planTarget, setPlanTarget] = useState<EmptyReturnRecord | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  /* The selection follows the queue: an id that no longer exists (its container
     was just paired) falls back to the top of the list rather than emptying the
     right-hand column and looking broken. */
  /* Eight fits a phone screen without becoming a scroll of its own; the reader
     can widen it from the pager. */
  const [emptiesPageSize, setEmptiesPageSize] = useState(8);
  const pagedAwaiting = usePagedRows(onBoard, { pageSize: emptiesPageSize });

  const selected = useMemo(
    () => onBoard.find((record) => record.id === selectedId) ?? onBoard[0] ?? null,
    [onBoard, selectedId],
  );

  /**
   * Whether the reader has actually *picked* one — not merely what is showing.
   *
   * `selected` falls back to the first empty in the pile so the wide layout is
   * never a blank right-hand panel. That fallback is exactly wrong for the
   * narrow two-step flow: keyed off it, step one would be skipped on arrival
   * and the pile would never be reachable at all. The step is a question about
   * what the reader chose, so it asks the choice.
   */
  const hasPicked = Boolean(selectedId && onBoard.some((record) => record.id === selectedId));

  const rejectedIds = useMemo(
    () => (selected ? rejectedLoadsFor(rejected, selected.id) : []),
    [rejected, selected],
  );
  const suggestions = useMemo(
    () => suggestLoadsFor(selected, loads, now, rejectedIds),
    [selected, loads, now, rejectedIds],
  );
  const incompatible = useMemo(
    () => incompatibleLoadsFor(selected, loads, now),
    [selected, loads, now],
  );

  /* `?plan=<id>` opens the plan-return dialog straight away — what a row's
     "Plan empty return" button and the dossier's own link send. */
  useEffect(() => {
    const id = searchParams.get('plan');
    if (!id) return;
    const record = onBoard.find((r) => r.id === id);
    if (record) setPlanTarget(record);
    const next = new URLSearchParams(searchParams);
    next.delete('plan');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, onBoard]);

  /* The workbench measures itself so it ends at the window's bottom edge.
     Above the empty-yard return below: hooks cannot sit after a branch that
     returns, and putting them next to the markup they serve cost a render. */
  const [benchRef, benchHeight] = useRoomBelow();

  if (onBoard.length === 0) {
    return (
      <Card className="rounded-card border border-border p-12">
        <EmptyState
          icon={<CheckCircle2 />}
          title="No container is waiting on a decision"
          description="A container appears here the moment a delivered booking is marked Empty Ready in Shipments. Everything under management is either paired or already going back."
        />
      </Card>
    );
  }

  const confirm = async (suggestion: PairingSuggestion) => {
    if (!selected) return;
    const ok = await actions.confirmPairing(selected, suggestion.load);
    if (ok) {
      setLastPairing({
        empty: selected.container || selected.bookingReference,
        full: suggestion.load.container || suggestion.load.id,
        load: suggestion.load.shipmentReference ?? suggestion.load.id,
      });
    }
  };

  /*
   * Where the operator came from, if they came from a shipment.
   *
   * Matching became a full page on 2026-08-29, and a page has no "close" — so
   * somebody who opened it from a booking to solve one container's problem
   * confirmed the pairing and was left standing on the Empty Container board
   * with no way back to the job they were doing. This is that way back.
   */
  const cameFrom = searchParams.get('from');

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      {cameFrom && (
        <Link
          to={buildPath(ROUTES.shipmentOverview, { id: cameFrom })}
          className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors duration-fast hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Back to shipment <Mono className="font-semibold">{cameFrom}</Mono>
        </Link>
      )}
      {/* Confirming a pairing is the one moment here that PREVENTS a cost, and
          it used to be acknowledged by a thin strip above the workbench — the
          weight this app gives a saved filter. It interrupts now: a burst, the
          two boxes welded together, and the detention that will not be spent.
          See `PairingCelebration` for why it stops short of congratulating
          anybody. */}
      <PairingCelebration
        open={lastPairing !== null}
        onOpenChange={(next) => !next && setLastPairing(null)}
        empty={lastPairing?.empty ?? ''}
        full={lastPairing?.full ?? ''}
        load={lastPairing?.load ?? ''}
        backTo={cameFrom}
        onBack={
          cameFrom
            ? () => {
                setLastPairing(null);
                navigate(buildPath(ROUTES.shipmentOverview, { id: cameFrom }));
              }
            : undefined
        }
      />

      {/* ── One workbench, two ways to stand at it ────────────────────────────
          Wide, it is the pile beside the opportunities and both are in view.
          Narrow, that same markup stacked the matches *underneath* every empty
          in the yard — seventy-nine cards deep on the live book — so choosing a
          container appeared to do nothing and the panel that answers the whole
          question was unreachable without scrolling to the end of the page.

          So below `lg` it becomes two steps: the pile, then the matches for
          what you picked, with a way back. Not a second layout — the same two
          panels, one of them hidden. The desktop arrangement is untouched, and
          because the switch is pure CSS there is no width state to disagree
          with what is actually on screen. */}
      {/* The bench is exactly as tall as the room under it, so its bottom edge
          is the window's and neither column runs past the screen. The columns
          stretch into that height and each scrolls inside itself — which is
          what stops one side moving when the other is scrolled. */}
      <div
        ref={benchRef}
        style={benchHeight === null ? undefined : { height: benchHeight }}
        className="grid min-w-0 grid-cols-1 items-start gap-5 lg:grid-cols-5 lg:items-stretch"
      >
        {/*
          ── The pile ───────────────────────────────────────────────────────

          The yard scrolls INSIDE its own column rather than growing the page.

          Whichever way the pile is sized — eight cards or sixty-four — it is
          taller than the window, and while it drove the document's height the
          whole screen moved with it: reaching the last container pushed the
          panel that answers the question off the top, so every pick was a
          round trip up and back. Capped to the window, the two halves scroll
          independently and the matches never leave.

          The cap and the overflow are `lg:` only. Below that the pile IS the
          screen — the matches are a second step, hidden — and a short inner
          scroll box inside a phone screen is worse than the page's own.

          The heading and the pager sit OUTSIDE the scroller: they say what the
          column is and how far into it you are, which are the two things that
          must not scroll away.
        */}
        <div
          className={cn('flex min-w-0 flex-col gap-2 lg:col-span-2 lg:min-h-0', hasPicked && 'hidden lg:flex')}
        >
          <div className="flex shrink-0 items-baseline justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Select an empty container
            </h3>
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
              {onBoard.length}
            </span>
          </div>

          {/* `min-h-0` is load-bearing: a flex child defaults to `min-height:
              auto`, which refuses to shrink below its content, and the column
              would grow past its own cap instead of scrolling.

              `px-1 -mx-1` gives the selected card's `ring-offset` somewhere to
              draw — a scroll container clips it — without narrowing the cards. */}
          {/* A plain scroll box. Snapping was tried here to stop a card being
              cut by the bottom edge and had to come out: `proximity` snapping
              re-runs on every scroll event, so the list kept tugging itself
              back to the nearest card while the reader was still moving. A
              partly visible card at the edge is the ordinary way a list says
              there is more below; a list that moves on its own is not.

              `p-1 -m-1` gives the selected card's `ring-offset` room to draw —
              a scroll container clips it — and gives the same breathing space
              at the top of the box as at the bottom, without narrowing the
              cards. */}
          {/* `shrink` and not `flex-1`.
              
              The grid stretches this column to the height of the panel beside
              it, which is what gives the scroller a bound to scroll against.
              But `flex-1` also makes it GROW into that whole height, and with
              three boxes in the yard it grew to 486px around 190px of cards —
              pushing the rule and the pager to the floor of the column and
              opening a lake of white between the last card and the count.
              
              Shrink-only keeps both halves: short content sits at its natural
              height with the pager tucked under it, and a full yard still
              shrinks to the cap and scrolls. */}
          <div className="min-h-0 shrink space-y-2 overflow-y-auto p-1 -m-1 lg:pr-2">
          {pagedAwaiting.rows.map((record) => {
            const risk = riskOf(record, now);
            const active = selected?.id === record.id;
            return (
              <ContainerCard
                key={record.id}
                state="empty"
                container={record.container || record.bookingReference}
                line={record.line}
                size={record.size}
                onClick={() => selectEmpty(record.id)}
                pressed={active}
                scale="list"
                /* The card IS the row.
                   It used to sit inside a bordered, padded wrapper that was
                   also a card — two nested frames, and a sliver of the outer
                   one showing down the right of every row because the inner one
                   caps its width. One frame, and the cap now reads as what it
                   is: a 20ft box is shorter than a 40ft box.

                   Selection is a ring rather than a fourth border, so it does
                   not compete with the dashed edge that means EMPTY. */
                className={cn(
                  active && 'ring-2 ring-stage-available ring-offset-1 ring-offset-background',
                )}
                aside={
                  /* On its own white ground. `RiskBadge` tints itself with
                     `--urgency-*-bg`, which is the hue at 10% over transparent
                     — calibrated for a white page and all but invisible once it
                     is composited over the card's amber ribbing. WATCH vanished
                     outright. The backing restores the surface those alphas
                     were mixed against. */
                  <span className="inline-flex items-center gap-1.5">
                    {active && (
                      <span className="rounded-md bg-stage-available px-1.5 py-0.5 text-[9px] font-extrabold tracking-wider text-stage-available-foreground">
                        Selected
                      </span>
                    )}
                    <span className="inline-flex rounded-md bg-card">
                      <RiskBadge risk={risk} />
                    </span>
                  </span>
                }
              >
                {/* Every line on a container gets a plate — see
                    `.fl-container-skin__plate`. These two sat on the bare
                    corrugation while the shipping line above them did not, so
                    the card had one legible row and two the ribs ran through. */}
                <div className="mt-1 flex min-w-0">
                  <span className="fl-container-skin__plate truncate text-[11px] font-medium">
                    {formatContainerSize(record.size)} · {record.locationName}
                  </span>
                </div>
                <div className="mt-1 flex min-w-0">
                  <span
                    className={cn(
                      'fl-container-skin__plate truncate font-mono text-[11px] font-bold',
                      /* The countdown keeps its urgency colour, so it overrides
                         the plate's ink rather than inheriting it. */
                      riskTextClass(risk),
                    )}
                  >
                    {record.deadline === null
                      ? 'No deadline recorded'
                      : record.deadline < now
                        ? `${formatSpan(now - record.deadline)} past return deadline`
                        : `${formatSpan(record.deadline - now)} remaining`}
                  </span>
                </div>
              </ContainerCard>
            );
          })}

          </div>

          {/* Still paged, as every long list in the app is — the scroll is how
              you cross one page of the yard, not a replacement for having
              pages. Pinned under the scroller so the count is readable from
              anywhere in it. */}
          {onBoard.length > 0 && (
            <div className="shrink-0">
              <TablePager
                paged={pagedAwaiting}
                noun="empties"
                pageSize={emptiesPageSize}
                onPageSizeChange={setEmptiesPageSize}
                pageSizeOptions={[8, 16, 32, 64]}
              />
            </div>
          )}
        </div>

        {/*
          ── The opportunities ──────────────────────────────────────────────

          Pinned to the top of the viewport on a wide screen, so it is beside
          whichever empty the reader is looking at rather than beside the top of
          the pile.

          The pile is a full page of cards — eight of them is already about a
          screen, and the reader can ask for sixty-four. Without this, picking
          the last container on the page meant scrolling back to the top to read
          the answer, and then down again for the next one: the whole job is
          "pick one, read the match, pick the next", and the layout made every
          lap of that a round trip.

          It scrolls inside itself rather than being clipped, because a match
          with several shipment opportunities is taller than the window — the
          cap is the viewport less the app header and this page's own padding.
          `self-start` because the grid stretches its cells by default, and a
          sticky element that has been stretched to the row's height has nothing
          left to stick with.
        */}
        <div
          className={cn(
            'min-w-0 space-y-2 lg:col-span-3 lg:min-h-0 lg:overflow-y-auto lg:pr-1',
            !hasPicked && 'hidden lg:block',
          )}
        >
          {/* Step two's way back. Only where there are steps — on a wide screen
              the pile never left, so a "back" would point at nothing. */}
          {selected && (
            <Button
              variant="outline"
              size="sm"
              shape="pill"
              onClick={() => selectEmpty(null)}
              leadingIcon={<ArrowLeft className="size-3.5" />}
              className="text-xs lg:hidden"
            >
              Choose another container
            </Button>
          )}
          {/* ── What we are matching, as a header rather than a centrepiece ──
              This block used to be centred, which read as a title on the wide
              layout and as a stray centred paragraph on a phone — a left-aligned
              back button above it, left-aligned links below it, and this in the
              middle. Centring also fought the container number: the identity
              moved horizontally as the deadline text beside it changed length.

              It is a header strip now: identity on the left, deadline under it,
              one alignment shared by every element in the column at every
              width. The little vertical rule that used to tie it to the section
              label went with it — it only made sense pointing down the centre. */}
          {selected && (
            <div className="rounded-card border border-border/70 bg-surface-sunken/40 px-3 py-2.5">
              <div className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">
                Matching for
              </div>
              <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <EmptyTag small />
                <Mono className="min-w-0 font-bold text-foreground [overflow-wrap:anywhere]">
                  {selected.container || selected.bookingReference}
                </Mono>
              </div>
              <Mono className={cn('mt-0.5 block text-xs font-bold', riskTextClass(riskOf(selected, now)))}>
                {selected.deadline === null
                  ? 'no deadline'
                  : selected.deadline < now
                    ? `${formatSpan(now - selected.deadline)} past return deadline`
                    : `${formatSpan(selected.deadline - now)} before return deadline`}
              </Mono>
            </div>
          )}

          {/* ── ONE heading, and it counts ──
           *
           * There were three, stacked with nothing between them: "Shipment
           * opportunities", then "System recommendation" directly under it,
           * then "Other shipment opportunities" — the section's own name said
           * twice and a sub-heading whose whole content the first card already
           * wears as a `RECOMMENDED` chip. Three labels for one list.
           *
           * So: the section names itself once and says how many there are,
           * which is the thing none of the three were saying. The first card is
           * the recommendation because it is first and because it is chipped;
           * the rest get a short rule that separates them without renaming the
           * section they are already in. It matches the yard column opposite,
           * heading left and count right. */}
          {selected && suggestions.length > 0 && (
            <div className="flex items-baseline justify-between gap-2 pt-1">
              <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Shipment opportunities
              </h4>
              <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                {suggestions.length}
              </span>
            </div>
          )}

          {selected &&
            suggestions.map((suggestion, index) => (
              <Fragment key={suggestion.load.id}>
                {index === 1 && (
                  <div className="flex items-center gap-2 pt-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      Other options
                    </span>
                    <span aria-hidden className="h-px flex-1 bg-border" />
                  </div>
                )}
                <SuggestionCard
                  suggestion={suggestion}
                  featured={index === 0}
                  disabled={actions.isBusy}
                  onConfirm={() => void confirm(suggestion)}
                  onReject={() => rejectPairing(suggestion.load.id, selected.id)}
                />
              </Fragment>
            ))}

          {selected && suggestions.length === 0 && (
            <Card className="rounded-card border-2 border-border p-6 text-center">
              <p className="text-sm font-bold text-foreground">No shipment opportunity</p>
              <p className="mt-1 text-xs text-muted-foreground">
                No created shipment can use this container before its return deadline.
              </p>
              <div className="mt-3 inline-block rounded-card-nested bg-surface-sunken px-4 py-2 text-left text-xs">
                <Mono className="font-bold text-foreground">
                  {selected.container || selected.bookingReference}
                </Mono>
                <div className="text-[10px] text-muted-foreground">
                  Return deadline{' '}
                  <Mono className="font-semibold">{formatStamp(selected.deadline)}</Mono>
                </div>
              </div>
              <div className="mt-3">
                <div className="mb-1.5 text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">
                  Recommended action
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  leadingIcon={<RotateCcw className="size-3.5" />}
                  disabled={actions.isBusy}
                  onClick={() => setPlanTarget(selected)}
                  className="bg-stage-returning text-stage-returning-foreground hover:brightness-105"
                >
                  Plan empty return
                </Button>
              </div>
            </Card>
          )}

          {/* "No match" with no reason is the difference between a system an
              operator trusts and one they work around. */}
          {selected && incompatible.length > 0 && (
            <div className="pt-1.5">
              <button
                type="button"
                onClick={() => setShowIncompatible((value) => !value)}
                className="text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
              >
                Why? · View incompatible shipments · {incompatible.length}{' '}
                {showIncompatible ? '▾' : '›'}
              </button>
              {showIncompatible &&
                incompatible.map(({ load, issues }) => (
                  <div
                    key={load.id}
                    className="mt-1.5 rounded-card border border-border-subtle bg-card p-3 opacity-80"
                  >
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <FullTag small />
                      <Mono className="text-xs font-bold text-foreground">
                        {load.shipmentReference ?? load.id}
                      </Mono>
                      <span className="text-[11px] text-muted-foreground">
                        {load.line} · {formatContainerSize(load.size)}
                      </span>
                    </div>
                    <div className="mt-1 text-[10px] text-destructive">
                      {issues.map((issue) => (
                        <span key={issue} className="mr-3">
                          · {issue}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      {planTarget && (
        <PlanReturnDialog
          record={planTarget}
          now={now}
          busy={actions.isBusy}
          onClose={() => setPlanTarget(null)}
          onConfirm={async (plannedAt) => {
            const ok = await actions.planReturn(planTarget, plannedAt);
            if (ok) setPlanTarget(null);
          }}
        />
      )}
    </div>
  );
}


/* ---------------------------------------------------------------------------
 * One opportunity
 * ------------------------------------------------------------------------- */


export default MatchingPage;
