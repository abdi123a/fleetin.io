import {
  ConsolePanel,
  InsightNote,
  PanelLink,
  StatBox,
  StatusChip,
} from '@/pages/transporter-portal/components/dashboard/console/kit';

import { CyclePair } from '../atoms';
import type { MatchingModel } from './model';

/**
 * The module's whole reason to exist, as a to-do list: empties and full loads
 * sitting in the same yard right now, ready to be welded into a cycle.
 *
 * Each row wears the module's signature mark — the empty going back on the
 * grey half, the full load coming out on the teal half — so the pairing reads
 * as one movement before a single word is read. The chip beside it says the
 * only thing that slows a weld down: whether the paperwork is in hand.
 */

export interface MatchingOpportunitiesCardProps {
  data: MatchingModel;
  onOpenMatching?: () => void;
  className?: string;
}

export function MatchingOpportunitiesCard({
  data,
  onOpenMatching,
  className,
}: MatchingOpportunitiesCardProps) {
  return (
    <ConsolePanel
      className={className}
      title="Matching Opportunities"
      subtitle="Same-yard pairings ready to become cycles"
      action={<PanelLink onClick={onOpenMatching}>Open Matching</PanelLink>}
    >
      <div className="grid grid-cols-2 gap-3">
        <StatBox
          label="Matchable empties"
          value={data.matchable}
          note="empty ready, no flags"
          tone={data.matchable > 0 ? 'attention' : 'neutral'}
        />
        <StatBox
          label="Full loads waiting"
          value={data.poolTotal}
          note={`${data.poolReady} fully documented`}
        />
      </div>

      {data.pairs.length > 0 ? (
        <div className="mt-4 flex flex-col gap-2.5">
          {data.pairs.map((pair) => (
            <button
              key={`${pair.emptyId}-${pair.missionId}`}
              type="button"
              onClick={onOpenMatching}
              className="flex w-full cursor-pointer flex-col gap-2 rounded-card-nested border border-border px-3.5 py-3 text-left transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex min-w-0 items-center justify-between gap-2">
                <CyclePair empty={pair.emptyContainer} full={pair.missionContainer} small />
                {pair.docsReady ? (
                  <StatusChip tone="calm">Docs ready</StatusChip>
                ) : (
                  <StatusChip tone="attention">
                    {pair.docsMissing} doc{pair.docsMissing === 1 ? '' : 's'} pending
                  </StatusChip>
                )}
              </span>
              <span className="truncate text-[11px] text-muted-foreground">
                {pair.locationName} · pickup {pair.window}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <InsightNote className="mt-4">
          No same-yard full load for the current empties — open Matching to weigh the cross-yard
          options.
        </InsightNote>
      )}

      {data.flagged > 0 ? (
        <InsightNote tone="attention" className="mt-3">
          {data.flagged} empty-ready box{data.flagged === 1 ? ' is' : 'es are'} flagged and
          excluded — standalone required or deadline already passed.
        </InsightNote>
      ) : null}
    </ConsolePanel>
  );
}

export default MatchingOpportunitiesCard;
