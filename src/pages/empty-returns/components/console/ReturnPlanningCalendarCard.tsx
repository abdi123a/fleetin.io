import { useMemo } from 'react';

import { PlanningCalendar, type PlanningEvent } from '@/components/console';
import { ConsolePanel } from '@/pages/transporter-portal/components/dashboard/console/kit';
import { riskOf } from '@/stores/emptyReturn.store';
import type { EmptyReturnRecord } from '@/types/emptyReturn';

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
  onSelectRecord?: (record: EmptyReturnRecord) => void;
  className?: string;
}

export function ReturnPlanningCalendarCard({
  records,
  now,
  onSelectRecord,
  className,
}: ReturnPlanningCalendarCardProps) {
  const { events, byId } = useMemo(() => {
    const index = new Map<string, EmptyReturnRecord>();
    const list: PlanningEvent[] = [];

    for (const record of records) {
      if (!record.deadline) continue;
      index.set(record.id, record);

      const risk = riskOf(record, now);
      const matched = Boolean(record.cycleId);

      const tone: PlanningEvent['tone'] =
        risk === 'protected' || record.returnedAt
          ? 'done'
          : risk === 'overdue'
            ? 'late'
            : matched
              ? 'planned'
              : 'soon';

      list.push({
        id: record.id,
        at: record.deadline,
        title: record.container,
        subtitle: `${record.locationName} · ${record.transporter}`,
        meta: matched ? (record.cycleId ?? 'matched') : 'unmatched',
        tone,
      });
    }

    return { events: list, byId: index };
  }, [records, now]);

  return (
    <ConsolePanel
      className={className}
      title="Return Planning Calendar"
      subtitle="Every return deadline on the day it falls — matched cycles and the empties still waiting"
      footer={
        <p className="type-body-xs leading-relaxed text-muted-foreground">
          A box is drawn on its return deadline, not on its pickup: that is the date the demurrage
          clock stops. Empties with no confirmed deadline are not on the calendar — they are counted
          as a deadline gap in Returns Outstanding instead.
        </p>
      }
    >
      <PlanningCalendar
        events={events}
        now={now}
        unitLabel={{ one: 'return', many: 'returns' }}
        legend={[
          { tone: 'planned', label: 'Matched to a cycle' },
          { tone: 'soon', label: 'Waiting on a match' },
          { tone: 'done', label: 'Back on time' },
          { tone: 'late', label: 'Deadline passed' },
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
