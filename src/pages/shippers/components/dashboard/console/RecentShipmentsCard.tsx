import { Card, IconChip } from '@/design-system';
import type { ShipperShipmentRow } from '@/features/shipper-bi';
import { cn, formatDate } from '@/utils';
import { PanelHeader, PanelLink, PANEL_SURFACE } from './PanelHeader';
import { classifyRow } from './statusTone';

/**
 * The latest movements on the account, newest first.
 *
 * The closing act, and deliberately the least urgent thing on the page: the
 * action queue above already carries anything that needs a person, so this is
 * only here to answer "what just happened" — the question a reader has after
 * they have dealt with the ones that cost money.
 *
 * It runs the full width, so it lists in two columns rather than stretching
 * four rows down a column and leaving half the panel empty.
 */

export interface RecentShipmentsCardProps {
  rows: ShipperShipmentRow[];
  onViewAll: () => void;
  onOpenShipment: (row: ShipperShipmentRow) => void;
}

export function RecentShipmentsCard({
  rows,
  onViewAll,
  onOpenShipment,
}: RecentShipmentsCardProps) {
  const recent = [...rows]
    .sort((a, b) =>
      (b.arrivalAt ?? b.plannedDeliveryAt).localeCompare(a.arrivalAt ?? a.plannedDeliveryAt),
    )
    .slice(0, 6);

  return (
    <Card variant="default" padding="lg" className={cn('gap-4', PANEL_SURFACE)}>
      <PanelHeader
        title="Recent Shipments"
        action={<PanelLink onClick={onViewAll}>View all</PanelLink>}
      />

      {recent.length === 0 ? (
        <p className="type-body-sm flex flex-1 items-center justify-center py-8 text-center text-muted-foreground">
          No shipments yet.
        </p>
      ) : (
        <ul className="-mx-2 grid grid-cols-1 gap-x-6 lg:grid-cols-2">
          {recent.map((row) => {
            const tone = classifyRow(row);
            const Icon = tone.icon;

            return (
              <li key={row.shipmentId}>
                <button
                  type="button"
                  onClick={() => onOpenShipment(row)}
                  className="flex w-full items-center gap-3 rounded-card-nested px-2 py-2.5 text-left transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <IconChip icon={Icon} size={36} className={tone.chip} />

                  <span className="min-w-0 flex-1">
                    <span className="type-body-sm block truncate text-foreground">
                      {row.reference}
                    </span>
                    <span className="type-body-xs mt-0.5 block truncate text-muted-foreground">
                      {row.origin} &rarr; {row.destination}
                    </span>
                  </span>

                  <span className="shrink-0 text-right">
                    <span className={cn('type-body-xs block', tone.text)}>
                      {tone.label}
                    </span>
                    <span className="type-body-xs mt-0.5 block tabular-nums text-muted-foreground">
                      {formatRelative(row.arrivalAt ?? row.plannedDeliveryAt)}
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

function formatRelative(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '\u2014';

  const today = new Date();
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();

  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return sameDay ? `Today, ${time}` : `${formatDate(iso, 'date')}, ${time}`;
}
