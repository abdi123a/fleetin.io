import { Fragment, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, Card, EmptyState } from '@/design-system';
import { ArrowRight, Link2 } from '@/design-system/icons';
import { ROUTES } from '@/config/routes';
import { selectChains, useEmptyReturnStore } from '@/stores/emptyReturn.store';
import type { CycleChain, EmptyReturnRecord } from '@/types/emptyReturn';

import { CompanyName, CyclePair, Mono, StatusChip } from './atoms';

/**
 * Cycle chains — the Cycles page's "Chains" tab.
 *
 * A chain is read left to right like a sentence: the full load one cycle
 * delivers becomes the empty the next cycle brings back, so the same carrier
 * keeps working the same location instead of driving home empty. That reading
 * order is the whole view, which is why the cycles are laid out as a horizontal
 * run of `CyclePair` marks joined by arrows rather than stacked as rows — a
 * vertical list would say "here are four cycles", and the point is that they are
 * one movement.
 *
 * The stat cluster deliberately keeps the demo's `on time / completed` formula
 * verbatim, including the case where the numerator counts a box already returned
 * on a cycle that has not finished yet. That is the figure Operations has been
 * reading; changing it here would make this page disagree with the console it
 * was lifted from. Raised separately rather than quietly "fixed".
 *
 * Was its own route (`/empty-returns/chains`) until it and Cycles were merged
 * into one page with a tab switch — a chain is a view *of* the cycles list,
 * not a separate dataset, and "open this cycle" no longer needs a page
 * navigation, just a tab switch. `useCyclesTabNavigation` in the parent page
 * owns that; this component only renders.
 */

const MATCHING_PATH = ROUTES.emptyReturnsMatching ?? '/empty-returns/matching';

/* ---------------------------------------------------------------------------
 * ChainStat
 * ------------------------------------------------------------------------- */

interface ChainStatProps {
  label: string;
  value: string | number;
}

/**
 * One figure in the chain header's right-hand cluster. Value first, label under it.
 *
 * On a phone the four of them are cells in a fixed four-up grid, not a wrapping
 * run: `Max sequence` is half again as wide as `Cycles`, so left to wrap they
 * broke 3 + 1 and the fourth figure read as a separate fact rather than the last
 * of a set. The grid keeps all four on one line at any width.
 */
function ChainStat({ label, value }: ChainStatProps) {
  return (
    <div className="min-w-0 text-center sm:min-w-14">
      <div className="text-lg font-bold text-foreground">
        <Mono>{value}</Mono>
      </div>
      <div className="text-[10px] uppercase leading-tight tracking-wide text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * ChainCycleCard
 * ------------------------------------------------------------------------- */

interface ChainCycleCardProps {
  cycle: EmptyReturnRecord;
  onOpen: (cycle: EmptyReturnRecord) => void;
}

/**
 * One link in the chain: its sequence, its pair, its state.
 *
 * Clicking it is the only way out of this view — it narrows the Cycles list to
 * this cycle id and switches to the Cycles tab, so a chain read here can be
 * acted on without hunting for the row.
 */
function ChainCycleCard({ cycle, onOpen }: ChainCycleCardProps) {
  const reference = cycle.cycleId ?? cycle.id;

  return (
    <button
      type="button"
      onClick={() => onOpen(cycle)}
      aria-label={`Open cycle ${reference} in the Cycles tab`}
      className="shrink-0 snap-start rounded-card-nested text-left transition-opacity duration-fast hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="mb-1 text-[10px] font-semibold text-muted-foreground">
        Cycle {cycle.seq ?? '—'} · <Mono>{reference}</Mono>
      </div>
      <CyclePair empty={cycle.container} full={cycle.nextFull?.container} />
      <div className="mt-1">
        <StatusChip status={cycle.status} />
      </div>
    </button>
  );
}

/* ---------------------------------------------------------------------------
 * ChainSection
 * ------------------------------------------------------------------------- */

interface ChainSectionProps {
  chain: CycleChain;
  onOpenCycle: (cycle: EmptyReturnRecord) => void;
}

/** One chain: header line and stats above, the cycle run below, the rule underneath. */
function ChainSection({ chain, onOpenCycle }: ChainSectionProps) {
  const { first } = chain;
  const headingId = `chain-${chain.id}`;

  return (
    <Card role="group" aria-labelledby={headingId} padding="none" className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-border-subtle px-5 py-4">
        <div className="min-w-0">
          <div id={headingId} className="flex flex-wrap items-center gap-2">
            <Link2 className="h-[15px] w-[15px] shrink-0 text-primary" aria-hidden />
            <Mono className="font-bold text-foreground">{chain.id}</Mono>
            <span className="rounded-md border border-border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
              {chain.statusLabel}
            </span>
          </div>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
            <CompanyName name={first.transporter} tone="muted" />
            <span aria-hidden>·</span>
            <CompanyName name={first.client} tone="muted" />
            <span aria-hidden>·</span>
            <span className="truncate">{first.locationName}</span>
          </div>
        </div>

        <div className="grid w-full grid-cols-4 gap-x-3 gap-y-3 sm:ml-auto sm:flex sm:w-auto sm:gap-x-5">
          <ChainStat label="Cycles" value={chain.cycles.length} />
          <ChainStat label="Completed" value={chain.completed} />
          {/* Demo formula kept verbatim: the numerator counts every box already
              back on time, the denominator only the finished cycles. */}
          <ChainStat label="On time" value={`${chain.onTime}/${chain.completed || 0}`} />
          <ChainStat label="Max sequence" value={chain.maxSequence} />
        </div>
      </div>

      {/* The chain scrolls sideways; it never wraps.
          Wrapping is what a list does, and this is deliberately not a list — the
          whole claim of the view is that these cycles are one movement read left
          to right. Allowed to wrap, a four-cycle chain on a phone broke after
          the second card and left its joining arrow dangling at the end of the
          line, which says "two groups" exactly where the page means "and then".
          A scroll rail keeps the sentence intact at every width and costs only a
          swipe. `-mx` + `px` so the run bleeds to the card's edge, which is the
          affordance that says there is more to the right. */}
      <div className="px-5 py-4">
        <div className="-mx-5 flex snap-x snap-proximity items-center gap-3 overflow-x-auto px-5 pb-2">
          {chain.cycles.map((cycle, index) => (
            <Fragment key={cycle.id}>
              {index > 0 && (
                <ArrowRight className="h-4 w-4 shrink-0 text-border-strong" aria-hidden />
              )}
              <ChainCycleCard cycle={cycle} onOpen={onOpenCycle} />
            </Fragment>
          ))}
        </div>

        <p className="pt-3 text-[11px] text-muted-foreground">
          The full load delivered by one cycle becomes the empty of the next cycle after unloading.
          The chain closes on a standalone return, a change of transporter, or a change of location.
        </p>
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------------------
 * useChains — shared so the parent page can badge the tab with a live count
 * ------------------------------------------------------------------------- */

export function useChains() {
  const records = useEmptyReturnStore((state) => state.records);
  return useMemo(() => selectChains(records), [records]);
}

/* ---------------------------------------------------------------------------
 * ChainsTabPanel
 * ------------------------------------------------------------------------- */

export interface ChainsTabPanelProps {
  /** Narrow the Cycles tab to this cycle and switch to it. */
  onOpenCycle: (cycle: EmptyReturnRecord) => void;
}

export function ChainsTabPanel({ onOpenCycle }: ChainsTabPanelProps) {
  const navigate = useNavigate();
  const chains = useChains();

  const handleOpenCycle = useCallback(
    (cycle: EmptyReturnRecord) => onOpenCycle(cycle),
    [onOpenCycle],
  );

  if (chains.length === 0) {
    return (
      <Card padding="lg">
        <EmptyState
          icon={<Link2 className="h-6 w-6" aria-hidden />}
          title="No active chain."
          description="Create a cycle from Matching."
          primaryAction={
            <Button size="sm" onClick={() => navigate(MATCHING_PATH)}>
              Go to Matching
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {chains.map((chain) => (
        <ChainSection key={chain.id} chain={chain} onOpenCycle={handleOpenCycle} />
      ))}
    </div>
  );
}
