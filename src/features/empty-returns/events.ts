import { riskOf } from '@/stores/emptyReturn.store';
import type {
  CalendarFilters,
  EmptyReturnEvent,
  EmptyReturnRecord,
  FullLoadMission,
} from '@/types/emptyReturn';

/**
 * Containers and loads → dated things on a calendar.
 *
 * The calendar is **read-only by design**. It answers "what happens next?" and
 * hands the operator back to the Control Tower or Matching to act — which is
 * why nothing here carries an action, only enough identity for a card and a
 * detail panel. Putting buttons on a timeline turns it into a second, worse
 * action workspace with none of the queue's ordering.
 *
 * Each open container emits up to three events and every container emits its
 * deadline, because those are genuinely different moments on different days:
 * when the box came free, when it is committed to move, and when the line stops
 * being patient. Collapsing them into one "container" row would hide exactly
 * the gap the operator is trying to see.
 */

/** Every dated moment one container puts on the board. */
function eventsForRecord(record: EmptyReturnRecord, now: number): EmptyReturnEvent[] {
  const events: EmptyReturnEvent[] = [];
  const risk = riskOf(record, now);
  const base = { line: record.line, size: record.size, risk } as const;

  if (record.stage === 'empty' && record.emptyReadyAt) {
    events.push({
      key: `empty-${record.id}`,
      type: 'empty_ready',
      at: record.emptyReadyAt,
      title: record.container || record.bookingReference,
      recordId: record.id,
      ...base,
    });
  }

  // The pairing sits on the day the *full load* is collected, not the day it
  // was confirmed — that is the day a truck actually has to be somewhere.
  if (record.nextFull?.pickupAt) {
    events.push({
      key: `paired-${record.id}`,
      type: 'paired',
      at: record.nextFull.pickupAt,
      title: `${record.container} ↔ ${record.nextFull.missionId ?? record.nextFull.container}`,
      recordId: record.id,
      marginMs: record.deadline ? record.deadline - record.nextFull.pickupAt : undefined,
      ...base,
    });
  }

  if (record.stage === 'return_planned' && record.plannedReturnAt) {
    events.push({
      key: `return-${record.id}`,
      type: 'return_planned',
      at: record.plannedReturnAt,
      title: record.container || record.bookingReference,
      recordId: record.id,
      ...base,
    });
  }

  if (record.returnedAt && !record.nextFull) {
    events.push({
      key: `returned-${record.id}`,
      type: 'returned',
      at: record.returnedAt,
      title: record.container || record.bookingReference,
      recordId: record.id,
      late: Boolean(record.deadline && record.returnedAt > record.deadline),
      ...base,
      risk: null,
    });
  }

  // The deadline is drawn for every container that has one, closed included —
  // a week you are reviewing afterwards should still show where the line was.
  if (record.deadline) {
    events.push({
      key: `deadline-${record.id}`,
      type: 'deadline',
      at: record.deadline,
      title: record.container || record.bookingReference,
      recordId: record.id,
      overdue: risk === 'overdue',
      ...base,
    });
  }

  return events;
}

/** The demand side: one card per upcoming full load still looking for a truck. */
function eventForLoad(load: FullLoadMission): EmptyReturnEvent {
  return {
    key: `load-${load.id}`,
    type: 'full_pickup',
    at: load.pickupAt,
    title: load.shipmentReference ?? load.id,
    loadId: load.id,
    line: load.line,
    size: load.size,
    risk: null,
  };
}

export interface BuildEventsInput {
  records: EmptyReturnRecord[];
  loads: FullLoadMission[];
  now: number;
  filters: CalendarFilters;
}

/**
 * The whole board, filtered and in time order.
 *
 * Filtering happens here rather than in the grid so the "next 24 hours" strip
 * above the calendar counts exactly what the calendar is showing — the two used
 * to be derived separately and disagreed the moment a filter was set.
 */
export function buildEmptyReturnEvents({
  records,
  loads,
  now,
  filters,
}: BuildEventsInput): EmptyReturnEvent[] {
  const events = [
    ...records.flatMap((record) => eventsForRecord(record, now)),
    ...loads.map(eventForLoad),
  ];

  return events
    .filter((event) => {
      if (filters.type !== 'all' && event.type !== filters.type) return false;
      if (filters.risk !== 'all' && event.risk !== filters.risk) return false;
      if (filters.line !== 'all' && event.line !== filters.line) return false;
      if (filters.size !== 'all' && event.size !== filters.size) return false;
      return true;
    })
    .sort((a, b) => a.at - b.at);
}

/** Every shipping line present in either pool — the calendar's line filter. */
export function linesIn(records: EmptyReturnRecord[], loads: FullLoadMission[]): string[] {
  return [...new Set([...records.map((r) => r.line), ...loads.map((l) => l.line)])]
    .filter(Boolean)
    .sort();
}

/** Every container size present in either pool. */
export function sizesIn(records: EmptyReturnRecord[], loads: FullLoadMission[]): string[] {
  return [...new Set([...records.map((r) => r.size), ...loads.map((l) => l.size)])]
    .filter(Boolean)
    .sort();
}

/** Every transporter present in the container pool — the dashboard's filter. */
export function transportersIn(records: EmptyReturnRecord[]): string[] {
  return [...new Set(records.map((r) => r.transporter))].filter(Boolean).sort();
}
