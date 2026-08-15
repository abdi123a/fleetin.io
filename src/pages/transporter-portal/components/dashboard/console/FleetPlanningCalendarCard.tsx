import { useMemo } from 'react';

import { PlanningCalendar, type PlanningEvent } from '@/components/console';
import { deriveTripFacts } from '@/features/transporter-bi';
import type { TransporterDataset } from '@/features/transporter-bi/contracts';

import { ConsolePanel } from './kit';

/**
 * The fleet's week, as dates rather than as a queue.
 *
 * `JobsInProgressCard` answers "what is moving right now"; this answers the
 * dispatcher's other question — what is committed on Thursday, and is anything
 * stacked on one day that a truck cannot physically cover. Every trip sits on
 * the delivery it is promising: its ETA while it is running, its actual drop
 * once it is done.
 *
 * Read from the whole dataset, not the filtered facts, on purpose: a period
 * picker set to "this week" would otherwise empty the very grid whose job is to
 * show the weeks on either side of it.
 *
 * Same three tones as the sibling consoles — teal reports, amber asks, and the
 * one red is a trip that is late and still out.
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
      if (fact.isCancelled) continue;

      const stamp = Date.parse(fact.deliveredAt ?? fact.etaAt ?? fact.plannedDeliveryAt);
      if (Number.isNaN(stamp)) continue;

      const route = routeById.get(fact.routeId);
      const promised = Date.parse(fact.plannedDeliveryAt);
      /* Still out with the promised date already behind it — the only red. */
      const lateAndOpen = !fact.isCompleted && !Number.isNaN(promised) && promised < now;

      list.push({
        id: fact.tripId,
        at: stamp,
        title: fact.ref,
        subtitle: route
          ? `${route.originName} → ${route.destinationName}`
          : (customerById.get(fact.customerId)?.name ?? fact.cargo),
        meta: vehicleById.get(fact.vehicleId)?.plateNumber ?? fact.vehicleId,
        tone: fact.isCompleted ? 'done' : lateAndOpen ? 'late' : fact.isDelayed ? 'soon' : 'planned',
      });
    }

    return list;
  }, [dataset, now]);

  return (
    <ConsolePanel
      className={className}
      title="Fleet Planning Calendar"
      subtitle="Every committed job on the day it is promised to deliver"
      footer={
        <p className="type-body-xs leading-relaxed text-muted-foreground">
          A job sits on its delivery date — the ETA while it runs, the actual drop once it is done —
          so a day that is stacked higher than the fleet can cover is visible before it is dispatched.
          Cancelled trips are left off entirely.
        </p>
      }
    >
      <PlanningCalendar
        events={events}
        now={now}
        unitLabel={{ one: 'job', many: 'jobs' }}
        legend={[
          { tone: 'planned', label: 'On plan' },
          { tone: 'soon', label: 'Running delayed' },
          { tone: 'done', label: 'Delivered' },
          { tone: 'late', label: 'Past promise, still out' },
        ]}
        onSelectEvent={(event) => onSelectTrip?.(event.id)}
      />
    </ConsolePanel>
  );
}

export default FleetPlanningCalendarCard;
