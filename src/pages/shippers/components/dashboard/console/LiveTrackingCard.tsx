import { Card, IconChip } from '@/design-system';
import type { ShipperShipmentRow } from '@/features/shipper-bi';
import { cn } from '@/utils';
import { PanelHeader, PanelLink, PANEL_SURFACE } from './PanelHeader';
import { classifyRow, stageProgress } from './statusTone';

/**
 * The open shipments that most need a look, riskiest first.
 *
 * Sorted by risk rather than recency: a list of the newest shipments is a
 * feed, and a feed is not something you act on.
 */

export interface LiveTrackingCardProps {
  rows: ShipperShipmentRow[];
  onViewAll: () => void;
  onOpenShipment: (row: ShipperShipmentRow) => void;
}

export function LiveTrackingCard({ rows, onViewAll, onOpenShipment }: LiveTrackingCardProps) {
  const live = rows
    .filter((row) => row.status === 'open')
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 4);

  return (
    <Card variant="default" padding="lg" className={cn('h-full gap-4', PANEL_SURFACE)}>
      <PanelHeader
        title="Live Tracking"
        action={<PanelLink onClick={onViewAll}>View all</PanelLink>}
      />

      {live.length === 0 ? (
        <p className="type-body-sm flex flex-1 items-center justify-center py-8 text-center text-muted-foreground">
          No open shipments right now.
        </p>
      ) : (
        <ul className="-mx-2 flex flex-1 flex-col justify-between">
          {live.map((row) => {
            const tone = classifyRow(row);
            const Icon = tone.icon;
            const progress = stageProgress(row.stage);

            return (
              <li key={row.shipmentId}>
                <button
                  type="button"
                  onClick={() => onOpenShipment(row)}
                  className="flex w-full items-center gap-3 rounded-card-nested px-2 py-2.5 text-left transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <IconChip icon={Icon} size={36} className={tone.chip} />

                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="type-body-sm truncate text-foreground">
                        {row.reference}
                      </span>
                      <span className={cn('type-body-xs shrink-0 font-medium', tone.text)}>
                        {tone.label}
                      </span>
                    </span>

                    <span className="type-body-xs mt-0.5 block truncate text-muted-foreground">
                      {row.origin} &rarr; {row.destination}
                    </span>

                    <span className="mt-2 block h-1 overflow-hidden rounded-full bg-muted">
                      <span
                        className={cn('block h-full rounded-full', tone.bar)}
                        style={{ width: `${progress}%` }}
                      />
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
