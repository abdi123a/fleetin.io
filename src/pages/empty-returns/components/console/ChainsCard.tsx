import {
  ConsolePanel,
  PanelLink,
} from '@/pages/transporter-portal/components/dashboard/console/kit';
import type { CycleChain } from '@/types/emptyReturn';
import { cn } from '@/utils';

import { CompanyName, Mono, StatusChip } from '../atoms';

/**
 * The loop engine: chains where the full load delivered by one cycle becomes
 * the empty of the next.
 *
 * Each chain renders as a short rail of numbered links — dark teal for a
 * finished cycle, amber for the one currently running — because the depth of
 * the rail is the story: every link after the first is a truck that went home
 * loaded instead of empty.
 */

export interface ChainsCardProps {
  chains: CycleChain[];
  onOpenChains?: () => void;
  onOpenMatching?: () => void;
  className?: string;
}

export function ChainsCard({ chains, onOpenChains, onOpenMatching, className }: ChainsCardProps) {
  return (
    <ConsolePanel
      className={className}
      title="Cycle Chains"
      subtitle="One truck, loaded both ways"
      action={<PanelLink onClick={onOpenChains}>Open chains</PanelLink>}
      footer={
        <p className="type-body-xs text-muted-foreground">
          Every link after the first is an empty leg that never got driven — the return truck went
          home carrying the next full load.
        </p>
      }
    >
      {chains.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8 text-center">
          <p className="type-body-sm text-muted-foreground">
            No chains yet — weld the first empty to a full load and the loop starts here.
          </p>
          <PanelLink onClick={onOpenMatching}>Start in Matching</PanelLink>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {chains.map((chain) => (
            <button
              key={chain.id}
              type="button"
              onClick={onOpenChains}
              className="flex w-full cursor-pointer flex-col gap-2.5 rounded-card-nested border border-border px-3.5 py-3 text-left transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex min-w-0 items-center justify-between gap-2">
                <Mono className="text-sm font-bold text-foreground">{chain.id}</Mono>
                {chain.active ? (
                  <StatusChip status={chain.active.status} />
                ) : (
                  <span className="rounded-md bg-surface-sunken px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    Completed
                  </span>
                )}
              </span>

              <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                <CompanyName name={chain.first.transporter} tone="muted" className="min-w-0" />
                <span className="shrink-0">·</span>
                <span className="truncate">{chain.first.locationName}</span>
              </span>

              {/* The rail: one numbered link per cycle, in sequence order. */}
              <span className="flex items-center gap-1.5">
                {chain.cycles.map((cycle) => {
                  const done = cycle.status === 'completed';
                  return (
                    <span
                      key={cycle.id}
                      title={`${cycle.cycleId ?? cycle.id} — ${done ? 'completed' : 'in flight'}`}
                      className={cn(
                        'grid size-6 shrink-0 place-items-center rounded-md text-[10px] font-extrabold',
                      )}
                      style={
                        done
                          ? { background: 'var(--fl-teal-800)', color: 'var(--fl-neutral-0)' }
                          : { background: 'var(--accent-bold)', color: 'var(--fl-neutral-950)' }
                      }
                    >
                      {cycle.seq ?? '·'}
                    </span>
                  );
                })}
                <span className="ml-1 text-[11px] font-semibold text-muted-foreground">
                  {chain.completed}/{chain.cycles.length} complete · on-time {chain.onTime}/
                  {chain.completed}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </ConsolePanel>
  );
}

export default ChainsCard;
