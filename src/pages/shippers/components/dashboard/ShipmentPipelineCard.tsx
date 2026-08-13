import { ChevronRight, Route as RouteIcon } from '@/design-system/icons';
import { Card, IconChip } from '@/design-system';
import { stepColor } from '@/features/shipper-bi/charts';
import type { StageKey } from '@/features/shipper-bi/contracts';
import type { ShipperShipmentRow } from '@/features/shipper-bi';
import { cn } from '@/utils';

/**
 * Every shipment on the account, placed on the lifecycle it is actually in.
 *
 * The eleven modelled stages are folded into the eight a shipper contracts
 * against — gate-in belongs to dispatch, and arrival and unloading are still
 * "in transit" from the customer's side. A pipeline nobody recognises is a
 * pipeline nobody reads.
 *
 * The job does not end at delivery. Two of the eight steps sit after it, because
 * the container is still on the account until the empty is back, and that is
 * where demurrage comes from.
 *
 * Colour is the ordinal teal ramp — light at the start, dark at the end — so the
 * sequence is legible before any label is read. Selecting a step filters the
 * activity table below rather than navigating away: the reader asked a question
 * about this page.
 */

export interface PipelineGroup {
  key: string;
  label: string;
  /** The modelled stages this step stands for. */
  stages: StageKey[];
}

export const PIPELINE_GROUPS: PipelineGroup[] = [
  { key: 'created', label: 'Created', stages: ['created'] },
  { key: 'documentation', label: 'Documentation', stages: ['documentation'] },
  { key: 'dispatched', label: 'Dispatched', stages: ['dispatched', 'gate_in'] },
  { key: 'picked_up', label: 'Picked up', stages: ['picked_up'] },
  { key: 'in_transit', label: 'In transit', stages: ['in_transit', 'arrived', 'unloading'] },
  { key: 'delivered', label: 'Delivered', stages: ['delivered'] },
  { key: 'empty_awaiting', label: 'Empty return', stages: ['empty_awaiting'] },
  { key: 'empty_returned', label: 'Returned', stages: ['empty_returned'] },
];

export interface ShipmentPipelineCardProps {
  rows: ShipperShipmentRow[];
  /** Key of the step currently filtering the activity table, if any. */
  activeKey?: string;
  onSelect?: (group: PipelineGroup | null) => void;
}

export function ShipmentPipelineCard({ rows, activeKey, onSelect }: ShipmentPipelineCardProps) {
  const counts = new Map<string, number>();
  for (const group of PIPELINE_GROUPS) {
    counts.set(group.key, rows.filter((row) => group.stages.includes(row.stage)).length);
  }

  const beforeDelivery = PIPELINE_GROUPS.slice(0, 5).reduce(
    (total, group) => total + (counts.get(group.key) ?? 0),
    0,
  );

  return (
    <Card variant="default" padding="lg" className="gap-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <IconChip icon={RouteIcon} size={36} />
        <div className="min-w-0 flex-1 basis-48">
          <h2 className="truncate text-[15px] font-semibold leading-tight text-foreground">
            Shipment Pipeline
          </h2>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {beforeDelivery} shipments still moving · the job closes when the empty is back
          </p>
        </div>
        {activeKey ? (
          <button
            type="button"
            onClick={() => onSelect?.(null)}
            className="shrink-0 rounded-sm text-[13px] font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Clear stage filter
          </button>
        ) : null}
      </div>

      <ol className="flex flex-wrap items-stretch gap-y-3">
        {PIPELINE_GROUPS.map((group, index) => {
          const count = counts.get(group.key) ?? 0;
          const isActive = activeKey === group.key;

          return (
            <li key={group.key} className="flex min-w-0 flex-1 basis-32 items-center">
              <button
                type="button"
                onClick={() => onSelect?.(isActive ? null : group)}
                aria-pressed={isActive}
                className={cn(
                  'min-w-0 flex-1 rounded-card-nested border px-3 py-3 text-left transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  isActive
                    ? 'border-primary bg-primary-subtle'
                    : 'border-border-subtle hover:bg-surface-sunken',
                )}
              >
                <span
                  className="block h-1 w-full rounded-full"
                  style={{
                    backgroundColor: stepColor(index, PIPELINE_GROUPS.length),
                    opacity: count === 0 ? 0.3 : 1,
                  }}
                />
                <span
                  className={cn(
                    'mt-2.5 block text-xl font-semibold leading-none tabular-nums',
                    count === 0 ? 'text-muted-foreground' : 'text-foreground',
                  )}
                >
                  {count}
                </span>
                <span className="mt-1.5 block truncate text-[11px] leading-tight text-muted-foreground">
                  {group.label}
                </span>
              </button>

              {index < PIPELINE_GROUPS.length - 1 ? (
                <ChevronRight className="mx-0.5 hidden size-4 shrink-0 text-border-strong xl:block" />
              ) : null}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
