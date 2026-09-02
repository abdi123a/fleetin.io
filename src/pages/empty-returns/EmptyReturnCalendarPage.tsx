import { useMemo, useState } from 'react';

import { PlanningCalendar, type PlanningEvent } from '@/components/console';
import {
  Button,
  Card,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from '@/design-system';
import { FilterMenu } from '@/components/common';
import {
  EMPTY_RETURN_EVENT_META,
  EMPTY_RETURN_RISK_FILTER_OPTIONS,
  formatContainerSize,
} from '@/data/emptyReturnData';
import {
  buildEmptyReturnEvents,
  linesIn,
  sizesIn,
  useEmptyContainers,
} from '@/features/empty-returns';
import { formatSpan, formatStamp, riskOf, useEmptyReturnStore } from '@/stores/emptyReturn.store';
import type { EmptyReturnEvent, EmptyReturnRecord } from '@/types/emptyReturn';

import { CompanyName, EmptyTag, FullTag, LocationLine, Mono, RiskBadge } from './components/marks';

/**
 * Calendar — *what happens next?*
 *
 * **Read-only, deliberately.** It monitors; it does not act. Every card opens a
 * panel of facts and one link back to the Control Tower, and there is no
 * pairing button anywhere on this page. A timeline with actions on it becomes a
 * second action workspace with none of the queue's ordering, and then two
 * screens are quietly competing to be where work gets done.
 *
 * **Event type is the identity, urgency is a footnote.** Each card carries its
 * own glyph — a box opening, a box being collected, the pairing mark, the
 * return arrow, the deadline timer — and colour is spent on the *clock*, which
 * is what the shared `PlanningCalendar` already encodes. A board where every
 * card is graded by risk reads as one long alarm and stops meaning anything.
 *
 * The grid itself is the app's one planning calendar, shared with the shipper
 * and transporter consoles. This page maps its records into `PlanningEvent[]`
 * and decides what a click means; it does not own a second grid.
 */
/**
 * Event types this board deliberately does not draw.
 *
 * Removed 2026-08-29 at the user's request. Both are *history* rather than
 * plan: a pairing that has been confirmed needs nothing further from anyone,
 * and a returned box is finished work. On a calendar — which exists to answer
 * "what happens next" — they were the two loudest chips on the strip (11
 * returned against 7 actually-open containers) and buried the events that still
 * need a decision. Their history is still on the container's own dialog and in
 * Cycles; it is only this forward-looking board they are dropped from.
 */
const HIDDEN_EVENT_TYPES: readonly EmptyReturnEvent['type'][] = ['paired', 'returned'];

export function EmptyReturnCalendarPage() {
  const { records, loads, now, byId } = useEmptyContainers();
  const filters = useEmptyReturnStore((state) => state.calendarFilters);
  const setFilters = useEmptyReturnStore((state) => state.setCalendarFilters);
  const openRecord = useEmptyReturnStore((state) => state.openRecord);

  const [selected, setSelected] = useState<EmptyReturnEvent | null>(null);

  const events = useMemo(
    () =>
      buildEmptyReturnEvents({ records, loads, now, filters }).filter(
        (event) => !HIDDEN_EVENT_TYPES.includes(event.type),
      ),
    [records, loads, now, filters],
  );

  /** Keyed so a click on the grid can find the domain event behind the bar. */
  const byKey = useMemo(() => new Map(events.map((event) => [event.key, event])), [events]);

  const planningEvents = useMemo<PlanningEvent[]>(
    () => toPlanningEvents(events, byId, now),
    [events, byId, now],
  );

  const lines = useMemo(() => linesIn(records, loads), [records, loads]);
  const sizes = useMemo(() => sizesIn(records, loads), [records, loads]);

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <Card className="min-w-0 rounded-lg border border-border/80 p-4">
        {/* One toolbar, and it filters. The strip that used to sit above this
            card — a red bar totalling the detention accruing, then four
            counters for the next 24 hours — was three summaries of a board
            that now states the same things itself: an overdue container is a
            red bar already past today, and how much room is left is the length
            of every other one. */}
        <div className="mb-3 flex min-w-0 flex-wrap items-center justify-end gap-1.5">
          <FilterMenu
            groups={[
              {
                key: 'risk',
                label: 'Urgency',
                value: filters.risk,
                onChange: (value) =>
                  setFilters({ risk: value as typeof filters.risk }),
                options: [...EMPTY_RETURN_RISK_FILTER_OPTIONS],
              },
              {
                key: 'line',
                label: 'Shipping line',
                value: filters.line,
                onChange: (value) => setFilters({ line: value }),
                options: [
                  { value: 'all', label: 'All lines' },
                  ...lines.map((line) => ({ value: line, label: line })),
                ],
              },
              {
                key: 'size',
                label: 'Container size',
                value: filters.size,
                onChange: (value) => setFilters({ size: value }),
                options: [
                  { value: 'all', label: 'All sizes' },
                  ...sizes.map((size) => ({ value: size, label: size })),
                ],
              },
            ]}
          />
        </div>

        <PlanningCalendar
          events={planningEvents}
          now={now}
          defaultView="month"
          unitLabel={{ one: 'container', many: 'containers' }}
          /* Four kinds of thing, and the first three are the same box in three
             states of its one clock — which is why they are one bar each and
             not three chips scattered across the grid. */
          legend={[
            {
              tone: 'empty',
              label: 'Out, no return booked',
              icon: EMPTY_RETURN_EVENT_META.empty_ready.icon,
            },
            {
              tone: 'returning',
              label: 'Return booked',
              icon: EMPTY_RETURN_EVENT_META.return_planned.icon,
            },
            { tone: 'late', label: 'Past deadline', icon: EMPTY_RETURN_EVENT_META.deadline.icon },
            {
              tone: 'full',
              label: 'Full load pickup',
              icon: EMPTY_RETURN_EVENT_META.full_pickup.icon,
            },
          ]}
          onSelectEvent={(event) => setSelected(byKey.get(event.id) ?? null)}
        />
      </Card>

      {selected && (
        <EventDialog
          event={selected}
          now={now}
          onClose={() => setSelected(null)}
          onOpenRecord={(recordId) => {
            setSelected(null);
            openRecord(recordId);
          }}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Domain events → the shared calendar's shape
 * ------------------------------------------------------------------------- */

/**
 * A container is one bar, not three chips.
 *
 * Four rules have stood here. It began as the clock (passed/ahead/committed/
 * waiting/done) — five tones grading urgency on a page whose own job is only to
 * monitor. It briefly became the container's state (full/empty/returned), which
 * was truer but collapsed five genuinely different happenings into three. v19
 * made colour say WHAT the event is, with each moment its own chip.
 *
 * What that last one missed is that most of these "moments" are the same box.
 * A container came free on the 4th and its line stops being patient on the
 * 19th; drawn as two chips a fortnight apart, the operator has to find both and
 * subtract them to learn the only thing that matters — how much room is left.
 * Drawn as one bar from the 4th to the 19th, the room left IS the length, and a
 * box whose bar has run past today is overdue without anyone reading a date.
 *
 * So a window per open container, coloured by what the box is doing: sky while
 * it is out with nothing booked, amber once a return is on the calendar (drawn
 * as a tick inside the window, on the day it is booked for), red once the
 * deadline is behind it. Full-load pickups stay chips, because a collection
 * genuinely is a moment. Closed containers draw nothing at all — this board
 * answers "what happens next", and a box that is home has no next.
 */
function toPlanningEvents(
  events: EmptyReturnEvent[],
  byId: (recordId: string | null | undefined) => EmptyReturnRecord | undefined,
  now: number,
): PlanningEvent[] {
  const out: PlanningEvent[] = [];

  for (const event of events) {
    const record = byId(event.recordId);

    if (event.type === 'deadline') {
      if (!record || record.stage === 'closed' || !record.deadline) continue;

      const overdue = event.overdue === true;
      const meta = overdue
        ? `${formatSpan(now - record.deadline)} over`
        : `${formatSpan(record.deadline - now)} left`;
      const subtitle = `${record.line} · ${formatContainerSize(record.size)} · back to ${record.returnDepot}`;

      /* The clock starts when the box was stripped. Without that stamp there is
         no window to draw, only the date it is due — so it stays a moment. */
      const start = record.emptyReadyAt ?? record.fullPickupAt;
      if (start == null || start >= record.deadline) {
        out.push({
          id: event.key,
          at: record.deadline,
          title: event.title,
          subtitle,
          meta,
          tone: overdue ? 'late' : 'due',
          icon: EMPTY_RETURN_EVENT_META.deadline.icon,
          kindLabel: EMPTY_RETURN_EVENT_META.deadline.label,
        });
        continue;
      }

      const booked = record.stage === 'return_planned';
      out.push({
        id: event.key,
        at: start,
        /* An overdue window keeps growing: it ends today, not on the date it
           should have ended, so the overrun is drawn rather than described. */
        until: overdue ? Math.max(record.deadline, now) : record.deadline,
        marker: record.plannedReturnAt ?? undefined,
        markerLabel: record.plannedReturnAt
          ? `Return booked for ${formatStamp(record.plannedReturnAt)}`
          : undefined,
        title: event.title,
        subtitle,
        meta,
        tone: overdue ? 'late' : booked ? 'returning' : 'empty',
        icon: overdue
          ? EMPTY_RETURN_EVENT_META.deadline.icon
          : booked
            ? EMPTY_RETURN_EVENT_META.return_planned.icon
            : EMPTY_RETURN_EVENT_META.empty_ready.icon,
        kindLabel: overdue
          ? 'Past deadline'
          : booked
            ? 'Return booked'
            : 'Out, no return booked',
      });
      continue;
    }

    if (event.type === 'full_pickup') {
      const meta = EMPTY_RETURN_EVENT_META.full_pickup;
      out.push({
        id: event.key,
        at: event.at,
        title: event.title,
        subtitle: `${meta.label} · ${event.line} · ${formatContainerSize(event.size)}`,
        tone: 'full',
        icon: meta.icon,
        kindLabel: meta.label,
      });
      continue;
    }

    /* Both of these are inside a window whenever the record has a deadline —
       one is where it starts, the other is the tick in the middle. They only
       reach the board on their own when there is no deadline to draw against. */
    if (event.type === 'empty_ready' || event.type === 'return_planned') {
      if (record?.deadline) continue;
      const meta = EMPTY_RETURN_EVENT_META[event.type];
      out.push({
        id: event.key,
        at: event.at,
        title: event.title,
        subtitle: `${meta.label} · ${event.line} · ${formatContainerSize(event.size)}`,
        tone: event.type === 'return_planned' ? 'returning' : 'empty',
        icon: meta.icon,
        kindLabel: meta.label,
      });
    }
  }

  return out;
}

/* ---------------------------------------------------------------------------
 * The read-only event panel
 * ------------------------------------------------------------------------- */

/**
 * Built from the clicked event alone — never inferred from a previous
 * selection, and never showing a state the event does not itself carry.
 */
function EventDialog({
  event,
  now,
  onClose,
  onOpenRecord,
}: {
  event: EmptyReturnEvent;
  now: number;
  onClose: () => void;
  onOpenRecord: (recordId: string) => void;
}) {
  const { byId, loadById } = useEmptyContainers();
  const meta = EMPTY_RETURN_EVENT_META[event.type];
  const Icon = meta.icon;
  const record = byId(event.recordId);
  const load = loadById(event.loadId);

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent size="sm" aria-describedby={undefined}>
        <DialogHeader
          title={
            <span className={`inline-flex items-center gap-2 ${meta.textClassName}`}>
              <Icon className="size-4" aria-hidden />
              {event.type === 'deadline' && event.overdue ? 'Return overdue' : meta.label}
            </span>
          }
        >
          <Mono className="text-sm font-bold text-foreground">{event.title}</Mono>
        </DialogHeader>

        <DialogBody>
          <dl className="space-y-0 text-xs">
            <Row label="When">
              <Mono>{formatStamp(event.at)}</Mono>
            </Row>

            {record && (
              <>
                <Row label="Container">
                  <span className="inline-flex items-center gap-1.5">
                    <EmptyTag small />
                    <Mono className="font-bold">{record.container || '—'}</Mono>
                  </span>
                </Row>
                <Row label="Shipping line">{record.line}</Row>
                <Row label="Size">{formatContainerSize(record.size)}</Row>
                <Row label="Currently at">
                  <LocationLine>{record.locationName}</LocationLine>
                </Row>
                <Row label="Shipper">
                  <CompanyName name={record.client} />
                </Row>
                <Row label="Transporter">
                  <CompanyName name={record.transporter} />
                </Row>
                <Row label="Return deadline">
                  <Mono>{formatStamp(record.deadline)}</Mono>
                </Row>
                {record.stage !== 'closed' && record.deadline && (
                  <Row label={now > record.deadline ? 'Overdue by' : 'Time remaining'}>
                    <Mono className="font-bold">{formatSpan(record.deadline - now)}</Mono>
                  </Row>
                )}
                {record.nextFull && (
                  <>
                    <Row label="Paired with">
                      <span className="inline-flex items-center gap-1.5">
                        <FullTag small />
                        <Mono className="font-bold">{record.nextFull.container || '—'}</Mono>
                      </span>
                    </Row>
                    <Row label="On shipment">
                      <Mono className="font-semibold">
                        {record.nextFull.shipmentReference ?? record.nextFull.missionId}
                      </Mono>
                    </Row>
                  </>
                )}
                {event.type !== 'returned' && (
                  <Row label="Urgency">
                    <RiskBadge risk={riskOf(record, now)} />
                  </Row>
                )}
              </>
            )}

            {load && (
              <>
                <Row label="Shipment">
                  <Mono className="font-bold">{load.shipmentReference ?? load.id}</Mono>
                </Row>
                <Row label="Full container">
                  <span className="inline-flex items-center gap-1.5">
                    <FullTag small />
                    <Mono className="font-bold">{load.container || '—'}</Mono>
                  </span>
                </Row>
                <Row label="Shipping line">{load.line}</Row>
                <Row label="Size">{formatContainerSize(load.size)}</Row>
                <Row label="Collected from">
                  <LocationLine>{load.pickupHub}</LocationLine>
                </Row>
                <Row label="Shipper">
                  <CompanyName name={load.client} />
                </Row>
                <Row label="Transporter">
                  {load.transporter ? (
                    <CompanyName name={load.transporter} />
                  ) : (
                    <span className="text-muted-foreground">Not assigned yet</span>
                  )}
                </Row>
                <Row label="Pairing">
                  <span className="font-bold text-warning-subtle-foreground">
                    Still needs an empty
                  </span>
                </Row>
              </>
            )}
          </dl>
        </DialogBody>

        <DialogFooter>
          {record && (
            <Button variant="outline" size="sm" onClick={() => onOpenRecord(record.id)}>
              Open the container
            </Button>
          )}
          <Button variant="primary" size="sm" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border-subtle py-1.5 last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right font-medium text-foreground">{children}</dd>
    </div>
  );
}

export default EmptyReturnCalendarPage;
