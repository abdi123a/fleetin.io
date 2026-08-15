import { useMemo } from 'react';

import { Card } from '@/design-system';
import { PlanningCalendar, type PlanningEvent } from '@/components/console';
import type { ShipperShipmentRow } from '@/features/shipper-bi';
import { cn } from '@/utils';

import { PanelHeader, PANEL_SURFACE } from './PanelHeader';

/**
 * The shipper's own book, by date: what is promised to land on which day.
 *
 * Same calendar the Empty Return console and the carrier seat use — one grid
 * grammar across all three portals — but read from this seat's records, so a
 * shipper plans against their promised deliveries rather than someone else's
 * fleet. Delivered shipments stay on the board because a week's plan is only
 * legible next to what already landed.
 *
 * The page's two-colour rule holds here: teal reports what happened, amber asks
 * about what is still open and drifting. No red — a shipment running late is a
 * forecast, not an expired clock, and this dashboard never shouts.
 */

export interface DeliveryPlanningCalendarCardProps {
  rows: ShipperShipmentRow[];
  now: number;
  onSelectShipment?: (row: ShipperShipmentRow) => void;
  className?: string;
}

/** Anything drifting past this much of the promise is worth asking about. */
const DRIFT_ASK_MINUTES = 60;

export function DeliveryPlanningCalendarCard({
  rows,
  now,
  onSelectShipment,
  className,
}: DeliveryPlanningCalendarCardProps) {
  const { events, byId } = useMemo(() => {
    const index = new Map<string, ShipperShipmentRow>();
    const list: PlanningEvent[] = [];

    for (const row of rows) {
      /* Predicted arrival while open, actual once landed — the date a planner
         would write in a diary, which is not always the promised one. */
      const stamp = Date.parse(row.arrivalAt ?? row.plannedDeliveryAt);
      if (Number.isNaN(stamp)) continue;
      index.set(row.shipmentId, row);

      const landed = row.status === 'delivered' || row.status === 'closed';
      const drifting = (row.varianceMinutes ?? 0) > DRIFT_ASK_MINUTES;

      list.push({
        id: row.shipmentId,
        at: stamp,
        title: row.reference,
        subtitle: `${row.routeName} · ${row.transporter}`,
        meta: landed ? (row.outcomeLabel ?? 'Delivered') : row.stageLabel,
        tone: landed ? 'done' : drifting ? 'soon' : 'planned',
      });
    }

    return { events: list, byId: index };
  }, [rows]);

  return (
    <Card
      variant="default"
      padding="lg"
      className={cn('flex h-full min-h-0 flex-col', PANEL_SURFACE, className)}
    >
      <PanelHeader
        title="Delivery Planning Calendar"
        hint="Every shipment on the day it is expected to land"
      />
      <div className="mt-4 flex min-h-0 flex-1 flex-col">
        <PlanningCalendar
          events={events}
          now={now}
          unitLabel={{ one: 'shipment', many: 'shipments' }}
          legend={[
            { tone: 'planned', label: 'On plan' },
            { tone: 'soon', label: 'Drifting past the promise' },
            { tone: 'done', label: 'Delivered' },
          ]}
          onSelectEvent={(event) => {
            const row = byId.get(event.id);
            if (row) onSelectShipment?.(row);
          }}
        />
      </div>
    </Card>
  );
}

export default DeliveryPlanningCalendarCard;
