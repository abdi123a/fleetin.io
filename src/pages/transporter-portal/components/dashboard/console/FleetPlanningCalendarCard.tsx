import { useMemo } from 'react';

import { PlanningCalendar, type PlanningEvent } from '@/components/console';
import { deriveTripFacts } from '@/features/transporter-bi';
import type { TransporterDataset } from '@/features/transporter-bi/contracts';

import { ConsolePanel } from './kit';

/**
 * What this fleet still owes, by the day it is due.
 *
 * The portal's first panel, and deliberately the narrowest: it carries only
 * this carrier's own trips, and only the ones **still open**. A delivered trip
 * is not a decision — it is a record, and every other card on the page already
 * reports it. What a dispatcher opens the portal for is the work ahead and
 * whether any of it is stacked on a day the fleet cannot physically cover.
 *
 * Read from the whole dataset, not the filtered facts, on purpose: a period
 * picker set to "this week" would otherwise empty the very grid whose job is to
 * show the weeks on either side of it.
 *
 * Colour follows the KPI tiles, same as the Empty Return board — teal for the
 * work on plan, peach for a trip already running behind, red only for one that
 * is past its promise and still out.
 */

export interface FleetPlanningCalendarCardProps {
  dataset: TransporterDataset;
  now: number;
  onSelectTrip?: (tripId: string) => void;
  className?: string;
}

export function FleetPlanningCalendarCard({
  dataset,
  now,
  onSelectTrip,
  className,
}: FleetPlanningCalendarCardProps) {
  const events = useMemo(() => {
    const routeById = new Map(dataset.routes.map((route) => [route.id, route]));
    const customerById = new Map(dataset.customers.map((customer) => [customer.id, customer]));
    const vehicleById = new Map(dataset.vehicles.map((vehicle) => [vehicle.id, vehicle]));

    const list: PlanningEvent[] = [];

    for (const fact of deriveTripFacts(dataset)) {
      /* Only what this fleet still owes. A cancelled trip is off the books and
       * a delivered one is a record, not a decision — both belong in the cards
       * below, which report, rather than on the board that says what to do. */
      if (fact.isCancelled || fact.isCompleted) continue;

      const stamp = Date.parse(fact.etaAt ?? fact.plannedDeliveryAt);
      if (Number.isNaN(stamp)) continue;

      const route = routeById.get(fact.routeId);
      const promised = Date.parse(fact.plannedDeliveryAt);
      /* Still out with the promised date already behind it — the only red. */
      const lateAndOpen = !Number.isNaN(promised) && promised < now;

      list.push({
        id: fact.tripId,
        at: stamp,
        title: fact.ref,
        subtitle: route
          ? `${route.originName} → ${route.destinationName}`
          : (customerById.get(fact.customerId)?.name ?? fact.cargo),
        meta: vehicleById.get(fact.vehicleId)?.plateNumber ?? fact.vehicleId,
        tone: lateAndOpen ? 'late' : fact.isDelayed ? 'planned' : 'soon',
      });
    }

    return list;
  }, [dataset, now]);

  return (
    <ConsolePanel
      className={className}
      title="Fleet Planning Calendar"
      subtitle="Your open trips, on the day each is due"
    >
      <PlanningCalendar
        events={events}
        now={now}
        defaultView="month"
        unitLabel={{ one: 'trip', many: 'trips' }}
        legend={[
          { tone: 'soon', label: 'On Plan' },
          { tone: 'planned', label: 'Delayed' },
          { tone: 'late', label: 'Overdue' },
        ]}
        onSelectEvent={(event) => onSelectTrip?.(event.id)}
      />
    </ConsolePanel>
  );
}

export default FleetPlanningCalendarCard;
