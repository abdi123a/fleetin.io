import {
  ConsolePanel,
  PanelLink,
  SegmentBar,
} from '@/pages/transporter-portal/components/dashboard/console/kit';
import type { EmptyReturnStatus } from '@/types/emptyReturn';
import { cn } from '@/utils';

import type { PipelineModel } from './model';

/**
 * The whole book of work as one bar: every container in the module, by
 * lifecycle stage, left to right in the order the lifecycle runs.
 *
 * The two-hue ramp is the conclusion. Neutral is a box still being unloaded,
 * amber is a box waiting on an Operations decision, and the teals darken as a
 * cycle firms up and completes — so a bar that reads orange in the middle is
 * a queue, and a bar that reads teal is a module running itself. Each legend
 * entry is a door into the Cycles list with that stage already filtered.
 */

/** Short captions for inside the segments — the meta labels are sentences. */
const SHORT_LABEL: Record<EmptyReturnStatus, string> = {
  unloading: 'Unloading',
  empty_ready: 'Empty Ready',
  preparing: 'Preparing',
  ready: 'Ready',
  in_progress: 'Running',
  completed: 'Done',
};

export interface CyclePipelineCardProps {
  pipeline: PipelineModel;
  /** Empty-ready boxes with no flag — the figure the conclusion line turns on. */
  matchable: number;
  onStageSelect: (status: EmptyReturnStatus) => void;
  onOpenCycles?: () => void;
  className?: string;
}

export function CyclePipelineCard({
  pipeline,
  matchable,
  onStageSelect,
  onOpenCycles,
  className,
}: CyclePipelineCardProps) {
  const segments = pipeline.stages
    .filter((stage) => stage.count > 0)
    .map((stage) => ({
      key: stage.status,
      label: stage.label,
      value: stage.count,
      color: stage.color,
      foreground: stage.fg,
      caption: SHORT_LABEL[stage.status],
    }));

  return (
    <ConsolePanel
      className={className}
      title="Cycle Pipeline"
      subtitle={`All ${pipeline.total} containers on the book, by lifecycle stage`}
      action={<PanelLink onClick={onOpenCycles}>Open cycles list</PanelLink>}
      footer={
        matchable > 0 ? (
          <p className="type-body-xs leading-relaxed text-accent-subtle-foreground">
            <span className="font-bold">The amber block is the queue:</span> {matchable} empt
            {matchable === 1 ? 'y is' : 'ies are'} cleared for matching and waiting on a decision.
            Every one paired before its cutoff is an empty leg that never gets driven.
          </p>
        ) : (
          <p className="type-body-xs text-muted-foreground">
            Nothing is waiting on an Operations decision — the pipeline is running itself.
          </p>
        )
      }
    >
      <div className="flex flex-1 flex-col justify-center gap-4">
        <SegmentBar segments={segments} height={56} />

        {/* Each stage is a door into the Cycles list, filtered to that stage. */}
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5">
          {pipeline.stages.map((stage) => (
            <button
              key={stage.status}
              type="button"
              onClick={() => onStageSelect(stage.status)}
              className={cn(
                'inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                stage.count > 0 ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              <span
                className="size-2 shrink-0 rounded-[2px]"
                style={{ background: stage.color }}
                aria-hidden
              />
              {stage.label}
              <span className="font-bold tabular-nums text-muted-foreground">{stage.count}</span>
            </button>
          ))}
        </div>
      </div>
    </ConsolePanel>
  );
}

export default CyclePipelineCard;
