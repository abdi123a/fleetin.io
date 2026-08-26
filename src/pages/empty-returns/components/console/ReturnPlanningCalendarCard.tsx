import { useMemo } from 'react';

import { PlanningCalendar, type PlanningEvent } from '@/components/console';
import { ConsolePanel } from '@/pages/transporter-portal/components/dashboard/console/kit';
import { EMPTY_RETURN_EXCEPTIONS } from '@/data/emptyReturnData';
import { riskOf } from '@/stores/emptyReturn.store';
import type { EmptyReturnRecord, FullLoadMission } from '@/types/emptyReturn';

/**
 * The module's work, laid out on the days it actually falls on.
 *
 * The board and the tiles answer "how bad is it right now"; this answers the
 * question a dispatcher asks straight afterwards — *when* does it land. Every
 * empty with a return deadline sits on that deadline, because that is the date
 * the money turns on, and the tone says whether the box is already matched to a
 * cycle (planned), still waiting on a decision (asks), already back (reports),
 * or past its date (the one red the console allows).
 *
 * Records with no deadline captured are not drawn: a calendar cannot honestly
 * place a date nobody has confirmed. The Returns Outstanding panel already
 * counts them as a deadline gap, which is where that fact belongs.
 */

export interface ReturnPlanningCalendarCardProps {
  records: EmptyReturnRecord[];
  now: number;
  /** Inbound fulls still looking for a truck — what an unmatched empty could be paired with. */
  openFullLoads?: FullLoadMission[];
  onSelectRecord?: (record: EmptyReturnRecord) => void;
  className?: string;
}

export function ReturnPlanningCalendarCard({
  records,
  now,
  openFullLoads = [],
  onSelectRecord,
  className,
}: ReturnPlanningCalendarCardProps) {
  const { events, byId } = useMemo(() => {
    const index = new Map<string, EmptyReturnRecord>();
    const list: PlanningEvent[] = [];

    /* The empties: boxes that owe the line a trip back. A box already home is
     * not drawn at all — this board is the work still to do, and a calendar
     * two thirds full of finished jobs buries the handful that need a decision
     * today. Whether an unmatched empty ends up paired or goes back on its own
     * is the same open question until somebody answers it, so both sit in one
     * bucket rather than pretending to be different states. */
    for (const record of records) {
      if (!record.deadline || record.returnedAt) continue;
      index.set(record.id, record);

      const matched = Boolean(record.cycleId);
      const overdue = riskOf(record, now) === 'overdue';
      const standalone = record.exception === EMPTY_RETURN_EXCEPTIONS.standaloneRequired;

      list.push({
        id: record.id,
        at: record.deadline,
        title: record.container,
        subtitle: `${record.locationName} · ${record.transporter}`,
        meta: matched ? (record.cycleId ?? 'Matched') : standalone ? 'Standalone' : 'Empty',
        tone: overdue ? 'late' : matched ? 'locked' : 'soon',
      });
    }

    /* The fulls: inbound loads with no empty on them yet. They are the other
     * half of the same matching decision, so they belong on the same board —
     * a dispatcher pairing a box looks for a full on or near its deadline, and
     * that is only visible if both sides are drawn. Dated on the pickup, which
     * is the day the truck is free to carry an empty out. */
    for (const mission of openFullLoads) {
      list.push({
        id: `full:${mission.id}`,
        at: mission.pickupAt,
        title: mission.container,
        subtitle: `${mission.locationName} · ${mission.client}`,
        meta: 'Full',
        tone: 'planned',
      });
    }

    return { events: list, byId: index };
  }, [records, now, openFullLoads]);

  return (
    <ConsolePanel
      className={className}
      title="Return Planning Calendar"
      subtitle="Return deadlines by day, matched and outstanding"
      footer={
        <p className="type-body-xs leading-relaxed text-muted-foreground">
          A box is drawn on its return deadline, not on its pickup: that is the date the demurrage
          clock stops. Empties with no confirmed deadline are not drawn — a calendar cannot honestly
          place a date nobody has confirmed.
        </p>
      }
    >
      <PlanningCalendar
        events={events}
        now={now}
        // A return deadline is typically a week or two out, so a seven-day
        // window hides exactly the boxes there is still time to plan for.
        defaultView="month"
        unitLabel={{ one: 'return', many: 'returns' }}
        /* Both sides of the matching decision, plus the clock that overrides
         * it. An empty needs a full, a full needs an empty, a pair is locked,
         * and an overdue box goes back now whether or not anything is found
         * for it. Boxes already home are not on the board: this is the work to
         * do, not the work done. */
        legend={[
          { tone: 'soon', label: 'Empty' },
          { tone: 'planned', label: 'Full' },
          { tone: 'locked', label: 'Matched' },
          { tone: 'late', label: 'Overdue' },
        ]}
        onSelectEvent={(event) => {
          const record = byId.get(event.id);
          if (record) onSelectRecord?.(record);
        }}
      />
    </ConsolePanel>
  );
}

export default ReturnPlanningCalendarCard;
