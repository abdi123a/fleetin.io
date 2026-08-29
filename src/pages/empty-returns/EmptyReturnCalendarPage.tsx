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
  Select,
} from '@/design-system';
import { AlertTriangle } from '@/design-system/icons';
import {
  DAY_MS,
  EMPTY_RETURN_EVENT_META,
  EMPTY_RETURN_EVENT_ORDER,
  EMPTY_RETURN_RISK_FILTER_OPTIONS,
  detentionFor,
  formatDetention,
} from '@/data/emptyReturnData';
import {
  buildEmptyReturnEvents,
  linesIn,
  sizesIn,
  useEmptyContainers,
} from '@/features/empty-returns';
import { formatSpan, formatStamp, riskOf, useEmptyReturnStore } from '@/stores/emptyReturn.store';
import type { EmptyReturnEvent } from '@/types/emptyReturn';
import { cn } from '@/utils';

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
  const { records, loads, now } = useEmptyContainers();
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

  /** Keyed so a click on the grid can find the domain event behind the chip. */
  const byKey = useMemo(() => new Map(events.map((event) => [event.key, event])), [events]);

  const planningEvents = useMemo<PlanningEvent[]>(
    () => events.map(toPlanningEvent),
    [events],
  );

  const overdue = useMemo(
    () =>
      records.filter(
        (record) => record.stage !== 'closed' && riskOf(record, now) === 'overdue',
      ),
    [records, now],
  );

  /** The strip above the grid — counted off the same filtered list the grid shows. */
  const next24 = useMemo(() => {
    const window = events.filter((event) => event.at >= now && event.at <= now + DAY_MS);
    return {
      available: records.filter((record) => record.stage === 'empty').length,
      pickups: window.filter((event) => event.type === 'full_pickup').length,
      deadlines: window.filter((event) => event.type === 'deadline').length,
      returns: records.filter((record) => record.stage === 'return_planned').length,
    };
  }, [events, records, now]);

  const lines = useMemo(() => linesIn(records, loads), [records, loads]);
  const sizes = useMemo(() => sizesIn(records, loads), [records, loads]);

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      {/* One line, and only the worst few spelled out. A chip per overdue
          container turned a warning into a paragraph the moment there were ten
          of them, and the Control Tower is where the full list lives anyway. */}
      {overdue.length > 0 && (
        <Card className="min-w-0 rounded-lg border border-destructive/40 bg-destructive-subtle p-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-destructive-subtle-foreground">
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            <span className="font-bold">
              {overdue.length} return{overdue.length > 1 ? 's' : ''} overdue
            </span>
            <span className="opacity-80">
              {formatDetention(
                overdue.reduce(
                  (total, record) => total + detentionFor(now - (record.deadline ?? now)),
                  0,
                ),
              )}{' '}
              accruing
            </span>
            {overdue.slice(0, 3).map((record) => (
              <button
                key={record.id}
                type="button"
                onClick={() => openRecord(record.id)}
                className="shrink-0 rounded-md border border-destructive/40 px-2 py-0.5 font-medium hover:bg-destructive-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Mono className="font-semibold">{record.container || record.bookingReference}</Mono>{' '}
                <span className="opacity-80">{formatSpan(now - (record.deadline ?? now))}</span>
              </button>
            ))}
            {overdue.length > 3 && (
              <span className="opacity-80">+{overdue.length - 3} more in the Control Tower</span>
            )}
          </div>
        </Card>
      )}

      <Card className="min-w-0 rounded-lg border border-border/80 p-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          <span className="shrink-0 text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">
            Next 24h
          </span>
          <span className="shrink-0">
            <Mono className="font-bold text-container-empty-subtle-foreground">{next24.available}</Mono> empty
          </span>
          <span className="shrink-0">
            <Mono className="font-bold text-primary">{next24.pickups}</Mono> pickup
            {next24.pickups === 1 ? '' : 's'}
          </span>
          <span className="shrink-0">
            <Mono className="font-bold text-destructive">{next24.deadlines}</Mono> deadline
            {next24.deadlines === 1 ? '' : 's'}
          </span>
          <span className="shrink-0">
            <Mono className="font-bold text-warning-subtle-foreground">{next24.returns}</Mono>{' '}
            planned
          </span>

          <div className="ml-auto flex min-w-0 flex-wrap items-center gap-1.5">
            <Select
              selectSize="sm"
              value={filters.type}
              onChange={(event) =>
                setFilters({ type: event.target.value as typeof filters.type })
              }
              options={[
                { value: 'all', label: 'All events' },
                ...EMPTY_RETURN_EVENT_ORDER.filter(
                  (type) => !HIDDEN_EVENT_TYPES.includes(type),
                ).map((type) => ({
                  value: type,
                  label: EMPTY_RETURN_EVENT_META[type].label,
                })),
              ]}
              aria-label="Filter by event type"
              containerClassName="w-full sm:w-40"
            />
            <Select
              selectSize="sm"
              value={filters.risk}
              onChange={(event) => setFilters({ risk: event.target.value as typeof filters.risk })}
              options={[...EMPTY_RETURN_RISK_FILTER_OPTIONS]}
              aria-label="Filter by urgency"
              containerClassName="w-full sm:w-36"
            />
            <Select
              selectSize="sm"
              value={filters.line}
              onChange={(event) => setFilters({ line: event.target.value })}
              options={[
                { value: 'all', label: 'All lines' },
                ...lines.map((line) => ({ value: line, label: line })),
              ]}
              aria-label="Filter by shipping line"
              containerClassName="w-full sm:w-36"
            />
            <Select
              selectSize="sm"
              value={filters.size}
              onChange={(event) => setFilters({ size: event.target.value })}
              options={[
                { value: 'all', label: 'All sizes' },
                ...sizes.map((size) => ({ value: size, label: size })),
              ]}
              aria-label="Filter by container size"
              containerClassName="w-full sm:w-28"
            />
          </div>
        </div>
      </Card>

      <Card className="min-w-0 rounded-lg border border-border/80 p-4">
        <PlanningCalendar
          events={planningEvents}
          now={now}
          defaultView="month"
          unitLabel={{ one: 'event', many: 'events' }}
          /* v19's event map, one chip per kind of thing that happens to a box.
             The board is read by WHAT the event is, not by how urgent it is —
             urgency stays a small badge, and the Control Tower is where it is
             actually acted on. */
          legend={[
            { tone: 'empty', label: 'Empty available' },
            { tone: 'full', label: 'Full load pickup' },
            { tone: 'returning', label: 'Empty return' },
            { tone: 'late', label: 'Deadline passed' },
          ]}
          onSelectEvent={(event) => setSelected(byKey.get(event.id) ?? null)}
        />
      </Card>

      {/* Six chips, not six sentences. The explanation moves to the hover
          title — a legend that takes four lines competes with the board it is
          meant to annotate. */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground">
        {EMPTY_RETURN_EVENT_ORDER.filter((type) => !HIDDEN_EVENT_TYPES.includes(type)).map((type) => {
          const meta = EMPTY_RETURN_EVENT_META[type];
          const Icon = meta.icon;
          return (
            <span key={type} className="inline-flex shrink-0 items-center gap-1" title={meta.hint}>
              <Icon className={cn('size-3', meta.textClassName)} aria-hidden />
              {meta.label}
            </span>
          );
        })}
        <span className="shrink-0 opacity-70">
          · Monitor here; act from the Control Tower or Matching.
        </span>
      </div>

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
 * Domain event → the shared calendar's shape
 * ------------------------------------------------------------------------- */

/**
 * Tone is the *event*, the icon is the *thing*.
 *
 * Three rules have stood here. It began as the clock (passed/ahead/committed/
 * waiting/done) — five tones grading urgency on a page whose own job is only to
 * monitor. It briefly became the container's state (full/empty/returned), which
 * was truer but collapsed five genuinely different happenings into three.
 *
 * v19 settles it: colour says WHAT the event is — a box becoming available, a
 * full load being collected, a pairing, a return going out, a box home, a
 * deadline blown. Urgency stays a small separate badge, because a board where
 * every card is graded by risk reads as one long alarm and stops meaning
 * anything. `deadline` is the one exception that keeps a clock colour, since a
 * deadline that has already passed IS the event.
 */
function toPlanningEvent(event: EmptyReturnEvent): PlanningEvent {
  const meta = EMPTY_RETURN_EVENT_META[event.type];
  const tone: PlanningEvent['tone'] =
    event.type === 'returned'
      ? 'returned'
      : event.type === 'full_pickup'
        ? 'full'
        : event.type === 'paired'
          ? 'paired'
          : event.type === 'return_planned'
            ? 'returning'
            : event.type === 'deadline' && event.overdue
              ? 'late'
              : 'empty';

  return {
    id: event.key,
    at: event.at,
    title: event.title,
    subtitle: `${meta.label} · ${event.line} · ${event.size}`,
    tone,
    icon: meta.icon,
    kindLabel: meta.label,
  };
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
                <Row label="Size">{record.size}</Row>
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
                <Row label="Size">{load.size}</Row>
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
