import { Fragment, useCallback, useMemo, useState, type ReactNode } from 'react';

import { Button, EmptyState, IconChip, Input, Select, Tooltip } from '@/design-system';
import { Activity, Container, Link2, MapPin, Search, Unlink2 } from '@/design-system/icons';
import { TablePager, usePagedRows } from '@/components';
import { EMPTY_RETURN_STATUS_META } from '@/data/emptyReturnData';
import { isChainBroken } from '@/stores/emptyReturn.store';
import type { CycleChain, EmptyReturnRecord } from '@/types/emptyReturn';
import { cn } from '@/utils';

import { CompanyName, Mono, StatusChip } from './atoms';

/**
 * Cycle chains — the Cycles page's "Chains" tab.
 *
 * A chain is one movement, not a list of cycles: the full load one link
 * delivers becomes the empty the next link brings back, so the same carrier
 * keeps working the same location instead of driving home empty.
 *
 * It is drawn as a **pyramid** — each link one notch right of the one above —
 * because the two things worth knowing about a chain are its ends: where it
 * started, and where it stopped. A horizontal scroll rail said "and then"
 * nicely but pushed both ends of a fifteen-link chain off-screen. Descending
 * the page keeps the whole run visible and makes its length a shape.
 *
 * **A chain is never completed.** It is running, or it is broken — and it
 * breaks exactly one way: an empty comes back on its own, so the last link
 * carries no full load out and there is nothing for a next link to return.
 * `CycleChain.statusLabel` describes the active *cycle* and reads "Completed"
 * when every cycle has finished; that is a cycle state, not a chain state, so
 * this view derives running/broken from the last link's `nextFull` instead.
 *
 * The tab used to render all 101 chains as 101 full-height cards in one column:
 * a scroll with no address, the same problem the Cycles list had. It is now one
 * board — search and sort at the top, a page of chains, numbered pages at the
 * bottom — matching the Cycles board so the two tabs read as one page.
 */

type ChainSort = 'latest' | 'longest' | 'reference' | 'risk';

const CHAINS_PER_PAGE = 8;

/* ---------------------------------------------------------------------------
 * Chain state
 * ------------------------------------------------------------------------- */

/**
 * Running vs broken, in two colours that never appear on the same chain.
 *
 * Brand teal for a chain still handing boxes forward, brand amber for one that
 * has stopped. Amber rather than red: a broken chain is not an error, it is a
 * backhaul that ended and a truck that now drives home empty — something to
 * notice, not something that failed. Every marker for a chain (header badge,
 * terminal dot, terminal label, spine tail) takes its colour from here, so the
 * state is legible from any one of them.
 */
const CHAIN_STATE = {
  running: {
    label: 'Running',
    icon: Activity,
    badge: 'border-primary/40 bg-primary-subtle text-primary-subtle-foreground',
    dot: 'bg-primary',
    line: 'bg-primary/40',
    stat: 'text-primary',
    pill: 'border-primary/40 bg-primary-subtle',
    terminalLabel: 'Out now',
    terminalMeta: 'still carrying — the chain continues',
  },
  broken: {
    label: 'Broken',
    icon: Unlink2,
    badge: 'border-warning/40 bg-warning-subtle text-warning-subtle-foreground',
    dot: 'bg-warning',
    line: 'bg-warning/40',
    stat: 'text-warning-subtle-foreground',
    pill: 'border-warning/40 bg-warning-subtle',
    terminalLabel: 'Broke here',
    terminalMeta: 'came back alone — nothing left to carry out',
  },
} as const;

type ChainStateKey = keyof typeof CHAIN_STATE;

/* ---------------------------------------------------------------------------
 * ChainSpine — nodes and hops
 * ------------------------------------------------------------------------- */

/**
 * The visualisation, restated.
 *
 * A chain is not a list of cycles side by side — it is **one run of containers**
 * handed forward. Cycle *n* delivers a full load, that box is unloaded, and it
 * becomes the empty cycle *n+1* brings back: `cycles[n].nextFull.container` and
 * `cycles[n+1].container` are literally the same number.
 *
 * So the drawing is a spine: every **container is a node**, every **cycle is the
 * hop between two nodes**. Each container appears exactly once — the staircase
 * this replaced printed all fifteen of them twice and asked the reader to notice
 * the repeats, which is work the picture should be doing.
 *
 * Reading down the spine gives the two facts worth having: the top node is the
 * box the chain started from, the bottom node is the box it ended on, and the
 * run between them is its length.
 */

/** How many hops render before the middle collapses, and how many ends survive. */
const COLLAPSE_ABOVE = 7;
const ENDS_KEPT = 3;

/** `12 Mar` — the resolution a chain is read at. */
function shortDate(ts: number | null | undefined): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

/** The two-column rail: dot or connector on the left, content on the right. */
function SpineRow({
  dot,
  cap,
  lineClassName,
  children,
  className,
}: {
  /** The node marker, drawn over the rail. Omitted on hop rows. */
  dot?: ReactNode;
  /** `start` draws the rail downward only, `end` upward only. */
  cap?: 'start' | 'end';
  lineClassName?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('grid grid-cols-[18px_1fr] gap-x-3', className)}>
      {/* The rail is absolute so it spans the row's full height regardless of
          how tall the content beside it is — a `h-full` child of an
          auto-height flex parent resolves to nothing, which is why the first
          pass drew dots with no line between them. */}
      <span className="relative flex justify-center" aria-hidden>
        <span
          className={cn(
            // `--border` is a hairline meant for panel edges; at 1px over a
            // card it disappears. The spine is the drawing, so it takes the
            // stronger rule.
            // A 2px rule, not a hairline: the spine is the drawing, and
            // `--border` at 1px vanishes over a card. Explicit top/bottom
            // rather than `inset-y-0` plus an override — the two conflict on
            // `top` and tailwind-merge drops one of them.
            'absolute w-0.5 rounded-full bg-border-strong',
            cap === 'start' && 'bottom-0 top-3',
            cap === 'end' && 'top-0 h-3',
            !cap && 'inset-y-0',
            lineClassName,
          )}
        />
        {dot}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** One container on the spine. */
function ChainNode({
  container,
  tone,
  state,
  label,
  meta,
}: {
  container: string;
  tone: 'start' | 'mid' | 'end';
  /** Only the closing node is painted by chain state; start is always brand. */
  state?: ChainStateKey;
  label?: string;
  meta?: string;
}) {
  const terminal = tone !== 'mid';
  const paint = tone === 'end' && state ? CHAIN_STATE[state] : null;

  return (
    <SpineRow
      cap={tone === 'start' ? 'start' : tone === 'end' ? 'end' : undefined}
      lineClassName={tone === 'end' ? paint?.line : undefined}
      dot={
        <span
          className={cn(
            'relative mt-1.5 size-3 shrink-0 rounded-full ring-4 ring-card',
            tone === 'mid' && 'size-2.5 bg-border-strong',
            tone === 'start' && 'bg-primary',
            paint?.dot,
          )}
        />
      }
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 py-1">
        {/* The container as a pill — a chain is a run of links, so each box on
            the spine is drawn as one. Terminal boxes carry the chain's colour;
            the ones in between stay quiet so the ends read first. */}
        <span
          className={cn(
            'inline-flex min-w-0 shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5',
            terminal
              ? paint?.pill ?? 'border-primary/40 bg-primary-subtle'
              : 'border-border bg-background',
          )}
        >
          <Container
            className={cn(
              'size-3.5 shrink-0',
              terminal ? paint?.stat ?? 'text-primary' : 'text-muted-foreground/70',
            )}
            aria-hidden
          />
          <Mono
            className={cn(
              'text-xs tracking-tight',
              terminal ? 'font-bold text-foreground' : 'font-medium text-muted-foreground',
            )}
          >
            {container}
          </Mono>
        </span>
        {label ? (
          <span
            className={cn(
              'shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
              paint?.badge ?? 'border-primary/40 bg-primary-subtle text-primary-subtle-foreground',
            )}
          >
            {label}
          </span>
        ) : null}
        {meta ? <span className="text-[11px] text-muted-foreground">{meta}</span> : null}
      </div>
    </SpineRow>
  );
}

/**
 * One cycle, riding the connector between the two containers it joins.
 *
 * A finished cycle says so with a dot, not a chip. Fifteen "Cycle Completed"
 * chips down a chain is fifteen repetitions of the expected case, and it buries
 * the one link that is still moving or stuck — which is the only status on the
 * chain anybody needs to find. So: completed gets a dot and a tooltip, anything
 * else keeps its full chip and stands out by contrast.
 *
 * `held` is the gap since the previous link — the pace of the run, which the
 * dates alone made the reader subtract for themselves.
 */
function ChainHop({
  cycle,
  seq,
  held,
  onOpen,
  lineClassName,
}: {
  cycle: EmptyReturnRecord;
  seq: number;
  held: number | null;
  onOpen: (cycle: EmptyReturnRecord) => void;
  lineClassName?: string;
}) {
  const reference = cycle.cycleId ?? cycle.id;
  const done = cycle.status === 'completed';
  const meta = EMPTY_RETURN_STATUS_META[cycle.status];

  return (
    <SpineRow lineClassName={lineClassName}>
      <button
        type="button"
        onClick={() => onOpen(cycle)}
        aria-label={`Open cycle ${reference} in the Cycles tab`}
        className="-ml-1.5 my-0.5 flex min-w-0 max-w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-[9px] font-bold tabular-nums text-muted-foreground">
          {seq}
        </span>
        <Mono className="shrink-0 text-[11px] text-muted-foreground">{reference}</Mono>

        {done ? (
          <Tooltip content={meta.label}>
            <span className="flex shrink-0 items-center" aria-label={meta.label}>
              <span className={cn('size-1.5 rounded-full', meta.dotClassName)} aria-hidden />
            </span>
          </Tooltip>
        ) : (
          <StatusChip status={cycle.status} className="shrink-0" />
        )}

        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
          {shortDate(cycle.returnedAt ?? cycle.emptyReadyAt)}
        </span>
        {held !== null && held > 0 ? (
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/70">
            +{held}d
          </span>
        ) : null}
      </button>
    </SpineRow>
  );
}

/** The middle of a long chain, folded away. */
function ChainGap({ hidden, onExpand }: { hidden: number; onExpand: () => void }) {
  return (
    <SpineRow lineClassName="border-l border-dashed border-border-strong bg-transparent">
      <button
        type="button"
        onClick={onExpand}
        className="-ml-1.5 my-1 rounded-md px-1.5 py-1 text-[11px] font-semibold text-primary transition-colors hover:bg-primary-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Show {hidden} more {hidden === 1 ? 'link' : 'links'}
      </button>
    </SpineRow>
  );
}

/**
 * The whole spine for one chain.
 *
 * Long chains fold in the middle rather than running the full height of the
 * card: the ends are what the view is for, and a fifteen-link chain that has to
 * be scrolled past has hidden the very thing it was drawn to show.
 */
function ChainSpine({
  cycles,
  state,
  onOpen,
}: {
  cycles: EmptyReturnRecord[];
  state: ChainStateKey;
  onOpen: (cycle: EmptyReturnRecord) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const last = cycles[cycles.length - 1];
  /** The box the chain ended on — the final full load, if one went out. */
  const finalContainer = last?.nextFull?.container ?? null;

  const folded = !expanded && cycles.length > COLLAPSE_ABOVE;
  const head = folded ? cycles.slice(0, ENDS_KEPT) : cycles;
  const tail = folded ? cycles.slice(cycles.length - ENDS_KEPT) : [];
  const hidden = folded ? cycles.length - ENDS_KEPT * 2 : 0;

  const renderRun = (run: EmptyReturnRecord[], offset: number) =>
    run.map((cycle, i) => {
      const position = offset + i;
      return (
        <Fragment key={cycle.id}>
          <ChainNode
            container={cycle.container}
            tone={position === 0 ? 'start' : 'mid'}
            label={position === 0 ? 'Start' : undefined}
            meta={position === 0 ? shortDate(cycle.emptyReadyAt) : undefined}
          />
          <ChainHop
            cycle={cycle}
            seq={cycle.seq ?? position + 1}
            held={
              position === 0
                ? null
                : daysBetween(
                    cycles[position - 1]?.returnedAt ?? cycles[position - 1]?.emptyReadyAt,
                    cycle.returnedAt ?? cycle.emptyReadyAt,
                  )
            }
            onOpen={onOpen}
            /* The last connector is painted by chain state, so the eye lands
               on where the run ended in the state's own colour. */
            lineClassName={position === cycles.length - 1 ? CHAIN_STATE[state].line : undefined}
          />
        </Fragment>
      );
    });

  return (
    <div className="mt-3 w-0 min-w-full overflow-x-auto pb-1 sm:pl-11">
      <div className="min-w-max">
        {renderRun(head, 0)}
        {folded ? (
          <ChainGap hidden={hidden} onExpand={() => setExpanded(true)} />
        ) : null}
        {folded ? renderRun(tail, cycles.length - ENDS_KEPT) : null}

        {finalContainer ? (
          <ChainNode
            container={finalContainer}
            tone="end"
            state={state}
            label={CHAIN_STATE[state].terminalLabel}
            meta={CHAIN_STATE[state].terminalMeta}
          />
        ) : (
          /* No final full load at all: the last empty was a standalone return,
             so the run simply stops on the box it brought back. */
          <SpineRow
            cap="end"
            lineClassName={CHAIN_STATE.broken.line}
            dot={
              <span
                className={cn(
                  'relative mt-1.5 size-3 rounded-full ring-4 ring-card',
                  CHAIN_STATE.broken.dot,
                )}
              />
            }
          >
            <span className="py-0.5 text-[11px] text-muted-foreground">
              Standalone return — the chain ends here.
            </span>
          </SpineRow>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * ChainSection
 * ------------------------------------------------------------------------- */

interface ChainSectionProps {
  chain: CycleChain;
  /** 1-based position in the full, sorted list — the chain's address on the page. */
  index: number;
  onOpenCycle: (cycle: EmptyReturnRecord) => void;
}

/** When a chain last moved — the stamp "Sort: Latest" orders on. */
function lastMovedAt(chain: CycleChain): number {
  const last = chain.cycles[chain.cycles.length - 1];
  return last?.returnedAt ?? last?.emptyReadyAt ?? last?.deadline ?? 0;
}

/** Whole days between two stamps, or null when either end is missing. */
function daysBetween(from: number | null | undefined, to: number | null | undefined): number | null {
  if (!from || !to) return null;
  return Math.max(0, Math.round((to - from) / 86_400_000));
}

/**
 * How much of the run came back inside its deadline, as a bar and a sentence.
 *
 * `10/15` on its own is a figure the reader has to divide before it means
 * anything. The bar does the dividing, and the threshold does the judging —
 * a chain is either mostly on time or it is not, and the colour says which.
 */
function OnTimeMeter({ onTime, total }: { onTime: number; total: number }) {
  const ratio = total > 0 ? Math.min(1, onTime / total) : 0;
  const healthy = ratio >= 0.8;

  return (
    <div className="flex items-center gap-2">
      <span
        className="h-1.5 w-20 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`${onTime} of ${total} links back on time`}
      >
        <span
          className={cn('block h-full rounded-full', healthy ? 'bg-primary' : 'bg-warning')}
          style={{ width: `${ratio * 100}%` }}
        />
      </span>
      <span className="whitespace-nowrap text-[11px] text-muted-foreground">
        <span className="font-bold tabular-nums text-foreground">{onTime}</span>
        <span className="tabular-nums">/{total}</span> on time
      </span>
    </div>
  );
}

/**
 * One chain: identity and route on the left, the run's span and health on the
 * right, the spine underneath.
 *
 * The header this replaced was four loose figures under tiny uppercase labels
 * with the location orphaned onto its own line — no grouping, no hierarchy, and
 * `02 Mar` and `11 Aug` sitting apart as two unrelated numbers when they are
 * really one span. Here the dates are drawn as a span with the elapsed days on
 * it, the on-time ratio is a bar that states its own conclusion, and the two
 * parties plus the yard read as one route line.
 */
function ChainSection({ chain, index, onOpenCycle }: ChainSectionProps) {
  const { first, cycles } = chain;
  const headingId = `chain-${chain.id}`;
  const last = cycles[cycles.length - 1];

  // Running or broken, never "completed" — see `isChainBroken`'s note on the
  // two shapes, and why `statusLabel` (which describes the active *cycle*)
  // cannot be trusted for this.
  const broken = isChainBroken(chain);
  const state: ChainStateKey = broken ? 'broken' : 'running';
  const paint = CHAIN_STATE[state];
  const StateIcon = paint.icon;

  const startedAt = first.emptyReadyAt ?? first.deadline;
  const endedAt = last?.returnedAt ?? last?.emptyReadyAt ?? last?.deadline;
  const span = daysBetween(startedAt, endedAt);

  return (
    <div role="group" aria-labelledby={headingId} className="px-3 py-4 sm:px-4">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        {/* ── Identity and route ── */}
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {/* The number is an address: "chain 47 of 101" is somewhere a reader
              can come back to, which a wall of cards never had. A chip rather
              than a bare digit, so it reads as a label and not as data. */}
          <span
            aria-hidden
            className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-muted font-mono text-[11px] font-bold tabular-nums text-muted-foreground"
          >
            {index}
          </span>

          <div className="min-w-0">
            <div id={headingId} className="flex flex-wrap items-center gap-2">
              <Link2 className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <Mono className="text-sm font-bold text-foreground">{chain.id}</Mono>
              {/* Icon as well as colour: the state has to survive a colour-blind
                  reader and a greyscale print, not just a glance. */}
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                  paint.badge,
                )}
              >
                <StateIcon className="size-3 shrink-0" aria-hidden />
                {paint.label}
              </span>
              <span className="text-[11px] text-muted-foreground">
                <span className="tabular-nums">{cycles.length}</span>{' '}
                {cycles.length === 1 ? 'link' : 'links'}
              </span>
            </div>

            {/* Carrier, shipper, yard. The yard is a chip so that when the line
                wraps it lands as a unit instead of orphaning two words. */}
            <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <CompanyName name={first.transporter} tone="muted" />
              <span aria-hidden className="text-border-strong">
                ·
              </span>
              <CompanyName name={first.client} tone="muted" />
              <span className="inline-flex min-w-0 items-center gap-1 rounded-md bg-muted px-1.5 py-0.5">
                <MapPin className="size-3 shrink-0" aria-hidden />
                <span className="truncate">{first.locationName}</span>
              </span>
            </div>
          </div>
        </div>

        {/* ── The run: how long it lasted, and how well ── */}
        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
          {/* One span, not two loose dates. A chain that started and ended the
              same day is drawn as a single date — "18 Jul ─ 0d ─ 18 Jul" is a
              rule and a zero saying nothing twice. */}
          <div className="flex items-center gap-2 whitespace-nowrap text-xs">
            {span === 0 ? null : (
              <>
                <span className="tabular-nums text-muted-foreground">{shortDate(startedAt)}</span>
                <span className="flex items-center gap-1" aria-hidden>
                  <span className="h-px w-4 bg-border-strong" />
                  {span !== null ? (
                    <span className="text-[10px] tabular-nums text-muted-foreground">{span}d</span>
                  ) : null}
                  <span className="h-px w-4 bg-border-strong" />
                </span>
              </>
            )}
            <span className={cn('font-bold tabular-nums', paint.stat)}>{shortDate(endedAt)}</span>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {span === 0 ? 'same day' : broken ? 'broke' : 'last move'}
            </span>
          </div>

          <OnTimeMeter onTime={chain.onTime} total={cycles.length} />
        </div>
      </div>

      <ChainSpine cycles={cycles} state={state} onOpen={onOpenCycle} />
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * ChainsTabPanel
 * ------------------------------------------------------------------------- */

export interface ChainsTabPanelProps {
  /** Real chains, from `GET /empty-returns/chains` via `chainToCycleChain` — see the parent page. */
  chains: CycleChain[];
  /** Narrow the Cycles tab to this cycle and switch to it. */
  onOpenCycle: (cycle: EmptyReturnRecord) => void;
  /** Opens the one matching workbench — DualTransactionsRecommendationsModal. */
  onOpenMatching: () => void;
}

export function ChainsTabPanel({ chains, onOpenCycle, onOpenMatching }: ChainsTabPanelProps) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<ChainSort>('latest');

  const handleOpenCycle = useCallback(
    (cycle: EmptyReturnRecord) => onOpenCycle(cycle),
    [onOpenCycle],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? chains.filter((chain) =>
          [
            chain.id,
            chain.first.transporter,
            chain.first.client,
            chain.first.locationName,
            ...chain.cycles.map((cycle) => cycle.cycleId ?? cycle.id),
            ...chain.cycles.map((cycle) => cycle.container),
          ]
            .filter((value): value is string => Boolean(value))
            .join(' ')
            .toLowerCase()
            .includes(q),
        )
      : chains;

    const sorted = [...filtered];
    if (sort === 'reference') {
      sorted.sort((a, b) => a.id.localeCompare(b.id));
    } else if (sort === 'risk') {
      // Worst on-time record first — those are the chains costing money.
      sorted.sort(
        (a, b) => a.onTime / (a.cycles.length || 1) - b.onTime / (b.cycles.length || 1),
      );
    } else if (sort === 'longest') {
      sorted.sort((a, b) => b.cycles.length - a.cycles.length);
    } else {
      // Latest: most recently moved first, which is what "what happened today"
      // wants and why it is the default the tab opens on.
      sorted.sort((a, b) => lastMovedAt(b) - lastMovedAt(a));
    }
    return sorted;
  }, [chains, query, sort]);

  const paged = usePagedRows(visible, {
    pageSize: CHAINS_PER_PAGE,
    resetKey: `${query}|${sort}|${chains.length}`,
  });

  if (chains.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 shadow-2xs">
        <EmptyState
          icon={<Link2 className="size-6" aria-hidden />}
          title="No active chains"
          description="Create a cycle from Matching."
          primaryAction={
            <Button size="sm" onClick={onOpenMatching}>
              Go to Matching
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-card shadow-2xs">
      {/* Same toolbar shape as the Cycles board — the two tabs are one page. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5">
        <div className="min-w-0 flex-1 basis-full sm:basis-64">
          <Input
            inputSize="sm"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onClear={() => setQuery('')}
            isClearable
            leadingIcon={<Search className="size-4 text-muted-foreground" aria-hidden />}
            placeholder="Search chain, cycle, container or party"
            aria-label="Search chains"
            className="bg-background"
          />
        </div>
        <Select
          selectSize="sm"
          containerClassName="shrink-0 grow basis-[calc(50%-0.25rem)] sm:grow-0 sm:basis-auto sm:w-[11rem]"
          options={[
            { value: 'latest', label: 'Sort: Latest' },
            { value: 'longest', label: 'Sort: Longest' },
            { value: 'risk', label: 'Sort: Worst on-time' },
            { value: 'reference', label: 'Sort: Reference' },
          ]}
          value={sort}
          onChange={(event) => setSort(event.target.value as ChainSort)}
          aria-label="Sort chains"
        />
      </div>

      {paged.rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
          <IconChip icon={Search} tint="neutral" />
          <h3 className="text-base font-bold text-foreground">No chains match “{query}”</h3>
          <Button type="button" variant="outline" size="sm" onClick={() => setQuery('')}>
            Clear search
          </Button>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {paged.rows.map((chain, offset) => (
            <ChainSection
              key={chain.id}
              chain={chain}
              index={paged.rangeStart + offset}
              onOpenCycle={handleOpenCycle}
            />
          ))}
        </div>
      )}

      <TablePager
        paged={paged}
        noun="chains"
        summary="A chain breaks when an empty comes back on its own."
        className={cn('border-t-0 px-3 py-2.5', paged.rows.length === 0 && 'hidden')}
      />
    </div>
  );
}
