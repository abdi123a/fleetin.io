import { useMemo, useState } from 'react';
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';

import { Button } from '@/design-system';
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Link2,
  Timer,
  X,
} from '@/design-system/icons';
import type { LucideIcon } from '@/design-system/icons';
import { cn } from '@/utils';

/**
 * The one planning calendar of the app, shared by every console that has dated
 * work to lay out: Empty Return (return deadlines and the cycles already
 * matched), the shipper seat (promised deliveries) and the transporter seat
 * (the jobs the fleet is committed to).
 *
 * It is deliberately dumb about the domain. A host maps its own records into
 * `PlanningEvent[]` and decides what a click means; the calendar only knows how
 * to place a dated thing on a week or a month grid. That is what keeps three
 * portals reading as one product instead of three calendars that disagree
 * about what a Tuesday looks like.
 *
 * The layout is a **day-column board, not an hour grid**. An hour grid spends
 * most of its height drawing empty 10:00–11:00 cells and squeezes the work into
 * 10px type; operations here cluster on a handful of slots, so each day is a
 * time-ordered stack instead and every card gets room for its time, its
 * reference and its counterparty. The clock still reads left-to-right across
 * the card, which is the only thing the hour grid was buying.
 *
 * Three affordances carry the rest: the day header states its own load, the
 * tone chips filter the board to one kind of work, and any day opens into a
 * full list underneath — so a cell that holds twenty containers is never
 * silently truncated to three.
 *
 * Colour follows the console law — **teal reports, amber asks** — with red kept
 * for a clock that has already run out. A host that is not allowed red (the
 * shipper dashboard) simply never emits the `late` tone.
 */

/* ---------------------------------------------------------------------------
 * Types
 * ------------------------------------------------------------------------- */

/**
 * What an event says about itself.
 *
 * `done` is history, `planned` is committed work, `soon` wants a decision
 * inside the window, `late` has already missed. The names are about the clock,
 * not the colour, so a host never has to know the palette.
 */
/**
 * What kind of work an event is, in tone terms.
 *
 * `locked` was added for Empty Return, whose board is not a severity ramp but a
 * pairing decision: an empty needs a full, a full needs an empty, and a matched
 * pair is committed work that needs nothing further. Hosts opt in — a console
 * that only emits done/planned/soon/late keeps exactly the four it had.
 */
export type PlanningEventTone = 'done' | 'locked' | 'planned' | 'soon' | 'late';

export interface PlanningEvent {
  id: string;
  /** Epoch ms. The moment the event sits on — a deadline, a pickup, a drop. */
  at: number;
  /** The headline, usually a reference or a container. */
  title: string;
  /** One line under it: the counterparty, the yard, the route. */
  subtitle?: string;
  /** Right-aligned micro-label — a status word, a count, a plate. */
  meta?: string;
  tone: PlanningEventTone;
}

interface ToneStyle {
  card: string;
  mark: string;
  chipActive: string;
  /** The glyph a cell shows instead of spelling the status out. */
  icon: LucideIcon;
  /** Fallback wording when the host supplies no `legend` label for the tone. */
  label: string;
}

const TONE: Record<PlanningEventTone, ToneStyle> = {
  done: {
    card: 'border-primary/25 bg-primary-subtle/50 text-primary-subtle-foreground hover:bg-primary-subtle/70',
    mark: 'var(--primary)',
    chipActive: 'border-primary/40 bg-primary-subtle text-primary-subtle-foreground',
    icon: CheckCircle2,
    label: 'Done',
  },
  /* `locked`, `planned` and `soon` carry the console's own KPI-tile palette —
   * teal, sky and peach — so a colour means the same thing in the tiles at the
   * top of the page and in the grid underneath them. Red stays reserved for a
   * clock that has already run out, which is the one tile colour that is a
   * warning rather than a category. */
  locked: {
    card: 'border-tile-sky bg-tile-sky text-tile-foreground hover:brightness-[0.97]',
    mark: 'var(--tile-sky)',
    chipActive: 'border-tile-sky bg-tile-sky text-tile-foreground',
    icon: Link2,
    label: 'Matched',
  },
  planned: {
    card: 'border-tile-peach bg-tile-peach text-tile-foreground hover:brightness-[0.97]',
    mark: 'var(--tile-peach)',
    chipActive: 'border-tile-peach bg-tile-peach text-tile-foreground',
    icon: Clock,
    label: 'Planned',
  },
  soon: {
    card: 'border-tile-teal bg-tile-teal text-tile-teal-foreground hover:brightness-[1.06]',
    mark: 'var(--tile-teal)',
    chipActive: 'border-tile-teal bg-tile-teal text-tile-teal-foreground',
    icon: Timer,
    label: 'Due soon',
  },
  late: {
    card: 'border-destructive bg-destructive text-destructive-foreground hover:brightness-[1.06]',
    mark: 'var(--destructive)',
    chipActive: 'border-destructive bg-destructive text-destructive-foreground',
    icon: AlertCircle,
    label: 'Overdue',
  },
};

/** Host wording per tone, taken from `legend` so a tooltip says the host's own status. */
type ToneLabels = Partial<Record<PlanningEventTone, string>>;

export type PlanningCalendarView = 'week' | 'month';

export interface PlanningCalendarProps {
  events: PlanningEvent[];
  /** Anchors "today" so the whole app can be driven by one clock. */
  now: number;
  /** Which grid opens first. */
  defaultView?: PlanningCalendarView;
  /** Tone chips above the board — the host names its own tones. */
  legend?: { tone: PlanningEventTone; label: string }[];
  /** What one row is called, for the counts and the empty state. */
  unitLabel?: { one: string; many: string };
  onSelectEvent?: (event: PlanningEvent) => void;
  className?: string;
}

/** How many entries a day spells out before the rest collapse to "+n more". */
const WEEK_CELL_LIMIT = 6;
const MONTH_CELL_LIMIT = 3;

const dayKey = (day: Date) => format(day, 'yyyy-MM-dd');

/* ---------------------------------------------------------------------------
 * The calendar
 * ------------------------------------------------------------------------- */

export function PlanningCalendar({
  events,
  now,
  defaultView = 'week',
  legend,
  unitLabel = { one: 'entry', many: 'entries' },
  onSelectEvent,
  className,
}: PlanningCalendarProps) {
  const [view, setView] = useState<PlanningCalendarView>(defaultView);
  /** The day the visible range is anchored on — moved by the arrows. */
  const [cursor, setCursor] = useState(() => startOfDay(new Date(now)));
  /** The day opened into the list underneath, if any. */
  const [openDay, setOpenDay] = useState<string | null>(null);
  /** Tones the reader has switched off. Empty means everything shows. */
  const [muted, setMuted] = useState<PlanningEventTone[]>([]);

  const today = useMemo(() => startOfDay(new Date(now)), [now]);

  /** The host's own word for each tone, so every tooltip speaks its language. */
  const toneLabels = useMemo<ToneLabels>(() => {
    const map: ToneLabels = {};
    for (const entry of legend ?? []) map[entry.tone] = entry.label;
    return map;
  }, [legend]);

  const days = useMemo(() => {
    if (view === 'week') {
      const first = startOfWeek(cursor, { weekStartsOn: 1 });
      return Array.from({ length: 7 }, (_, index) => addDays(first, index));
    }
    const first = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
    const last = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
    const list: Date[] = [];
    for (let day = first; day <= last; day = addDays(day, 1)) list.push(day);
    return list;
  }, [view, cursor]);

  /** Events bucketed by calendar day once, so no cell re-scans the list. */
  const byDay = useMemo(() => {
    const map = new Map<string, PlanningEvent[]>();
    for (const event of events) {
      const key = format(new Date(event.at), 'yyyy-MM-dd');
      const bucket = map.get(key);
      if (bucket) bucket.push(event);
      else map.set(key, [event]);
    }
    for (const bucket of map.values()) bucket.sort((a, b) => a.at - b.at);
    return map;
  }, [events]);

  const allOn = (day: Date) => byDay.get(dayKey(day)) ?? [];
  const shownOn = (day: Date) =>
    muted.length === 0 ? allOn(day) : allOn(day).filter((event) => !muted.includes(event.tone));

  /** Per-tone counts across the visible range — the chips print their own weight. */
  const toneCounts = useMemo(() => {
    const counts: Record<PlanningEventTone, number> = {
      done: 0,
      locked: 0,
      planned: 0,
      soon: 0,
      late: 0,
    };
    const inRange = view === 'week' ? days : days.filter((day) => isSameMonth(day, cursor));
    for (const day of inRange) {
      for (const event of allOn(day)) counts[event.tone] += 1;
    }
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, days, cursor, byDay]);

  const visibleTotal = useMemo(() => {
    const inRange = view === 'week' ? days : days.filter((day) => isSameMonth(day, cursor));
    return inRange.reduce((total, day) => total + shownOn(day).length, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, days, cursor, byDay, muted]);

  /** The busiest day in view — every day bar is drawn against it. */
  const peak = useMemo(
    () => days.reduce((max, day) => Math.max(max, shownOn(day).length), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [days, byDay, muted],
  );

  const rangeLabel = useMemo(() => {
    if (view !== 'week') return format(cursor, 'MMMM yyyy');
    // `days` is seven long in week view by construction, but the indexes are
    // still `Date | undefined` to the compiler — fall back to the cursor
    // rather than assert, so a future change to `days` can't crash the header.
    const first = days[0] ?? cursor;
    const lastDay = days[days.length - 1] ?? cursor;
    return `${format(first, 'd MMM')} – ${format(lastDay, 'd MMM yyyy')}`;
  }, [view, days, cursor]);

  const step = (direction: -1 | 1) => {
    setOpenDay(null);
    setCursor((current) =>
      view === 'week' ? addDays(current, direction * 7) : addMonths(current, direction),
    );
  };

  const toggleTone = (tone: PlanningEventTone) =>
    setMuted((current) =>
      current.includes(tone) ? current.filter((value) => value !== tone) : [...current, tone],
    );

  const openedDate = openDay ? days.find((day) => dayKey(day) === openDay) : undefined;

  return (
    <div className={cn('flex min-h-0 flex-col gap-3', className)}>
      {/* Range, view, and the tones in it */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="size-8 shrink-0 px-0"
              aria-label={view === 'week' ? 'Previous week' : 'Previous month'}
              onClick={() => step(-1)}
            >
              <ChevronLeft className="size-4" aria-hidden />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="size-8 shrink-0 px-0"
              aria-label={view === 'week' ? 'Next week' : 'Next month'}
              onClick={() => step(1)}
            >
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold tabular-nums text-foreground">{rangeLabel}</p>
            <p className="type-body-xs text-muted-foreground">
              {visibleTotal} {visibleTotal === 1 ? unitLabel.one : unitLabel.many} in view
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            title="Jump to today"
            onClick={() => {
              setOpenDay(null);
              setCursor(today);
            }}
          >
            Today
          </Button>
          <div
            className="inline-flex items-center gap-0.5 rounded-md border border-border bg-surface-sunken p-0.5"
            role="group"
            aria-label="Calendar view"
          >
            {(['week', 'month'] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={view === option}
                onClick={() => {
                  setOpenDay(null);
                  setView(option);
                }}
                className={cn(
                  'h-7 cursor-pointer rounded-sm px-3 text-xs font-semibold capitalize transition-colors',
                  view === option
                    ? 'bg-primary text-primary-foreground shadow-2xs'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tone chips double as the legend and as the filter */}
      {legend && legend.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {legend.map((entry) => {
            const off = muted.includes(entry.tone);
            const count = toneCounts[entry.tone];
            return (
              <button
                key={entry.tone}
                type="button"
                aria-pressed={!off}
                onClick={() => toggleTone(entry.tone)}
                className={cn(
                  // The tiles' own type: uppercase, extrabold, widely tracked —
                  // and centred at a shared minimum width so four chips read as
                  // one row of equals rather than four ragged pills.
                  'inline-flex min-w-[7.5rem] cursor-pointer flex-col items-center justify-center gap-0.5',
                  'rounded-card border px-3 py-1.5 transition-colors',
                  off
                    ? 'border-border-subtle bg-transparent text-muted-foreground/70'
                    : TONE[entry.tone].chipActive,
                )}
              >
                <span
                  className={cn(
                    'text-[10px] font-extrabold uppercase leading-tight tracking-[0.09em]',
                    off && 'line-through',
                  )}
                >
                  {entry.label}
                </span>
                <span className="text-sm font-extrabold tabular-nums leading-none">{count}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {view === 'week' ? (
        <WeekBoard
          days={days}
          today={today}
          peak={peak}
          openDay={openDay}
          eventsOn={shownOn}
          onOpenDay={setOpenDay}
          unitLabel={unitLabel}
          toneLabels={toneLabels}
          onSelectEvent={onSelectEvent}
        />
      ) : (
        <MonthBoard
          days={days}
          cursor={cursor}
          today={today}
          openDay={openDay}
          eventsOn={shownOn}
          onOpenDay={setOpenDay}
          toneLabels={toneLabels}
          onSelectEvent={onSelectEvent}
        />
      )}

      {openedDate ? (
        <DayList
          day={openedDate}
          events={shownOn(openedDate)}
          unitLabel={unitLabel}
          toneLabels={toneLabels}
          onClose={() => setOpenDay(null)}
          onSelectEvent={onSelectEvent}
        />
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * The day, at a glance
 * ------------------------------------------------------------------------- */

/**
 * A day cell shows the work itself, not a tally of it: each entry reads as a
 * chip in its tone — the clock, then the reference, and in the roomier week
 * column the counterparty under it.
 *
 * This replaced a row of coloured dots. The dots were themselves a correction
 * of an earlier cell that stacked four-line cards and turned the month grid
 * into a wall of small type, so the pressure that brought them in is real and
 * the fix keeps its discipline: a cell spells out a handful and collapses the
 * remainder into "+n more" rather than growing without limit. What changed is
 * only that the handful is legible instead of abstract — the day header still
 * carries the count and the worst tone, so "how much" survives at a glance.
 */

/** Worst first — the tone a day is judged by. */
/** Which tone a day takes when it holds several — the one most worth acting on. */
const TONE_SEVERITY: readonly PlanningEventTone[] = ['late', 'soon', 'planned', 'locked', 'done'];

function worstTone(events: PlanningEvent[]): PlanningEventTone | null {
  for (const tone of TONE_SEVERITY) {
    if (events.some((event) => event.tone === tone)) return tone;
  }
  return null;
}

/** One entry as it reads inside a day cell. */
function EventChip({
  event,
  dense,
  toneLabels,
  onSelect,
}: {
  event: PlanningEvent;
  dense: boolean;
  toneLabels: ToneLabels;
  onSelect: () => void;
}) {
  const tone = TONE[event.tone];
  const time = format(new Date(event.at), 'HH:mm');
  const status = toneLabels[event.tone] ?? tone.label;

  return (
    <button
      type="button"
      onClick={onSelect}
      title={[time, event.title, event.subtitle, status].filter(Boolean).join(' · ')}
      className={cn(
        'flex w-full min-w-0 cursor-pointer items-start gap-1.5 rounded-sm border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        tone.card,
        dense ? 'px-1 py-[3px]' : 'px-1.5 py-1',
      )}
    >
      {/* The tone as a rule down the edge — colour without spending a word. */}
      <span
        className="mt-[3px] h-2 w-[3px] shrink-0 rounded-full"
        style={{ background: tone.mark }}
        aria-hidden
      />
      {/* Dense packs the clock beside the reference; the roomier week column
          gives the reference its own line so a container number reads whole. */}
      {dense ? (
        <span className="flex min-w-0 flex-1 items-baseline gap-1">
          <span className="shrink-0 text-[9px] font-bold tabular-nums opacity-70">{time}</span>
          <span className="truncate font-mono text-[9.5px] font-bold tracking-tight">
            {event.title}
          </span>
        </span>
      ) : (
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-mono text-[11px] font-bold tracking-tight">
            {event.title}
          </span>
          <span className="flex min-w-0 items-baseline gap-1">
            <span className="shrink-0 text-[10px] font-bold tabular-nums opacity-70">{time}</span>
            {event.subtitle ? (
              <span className="truncate text-[10px] font-medium opacity-75">{event.subtitle}</span>
            ) : null}
          </span>
        </span>
      )}
    </button>
  );
}

/**
 * A day's entries, worst tone first.
 *
 * Severity order decides which ones survive the cut, so an overdue box is never
 * the thing hidden behind "+n more"; within a tone the host's own time order is
 * preserved, which is how a planner reads a single day.
 */
function DayEvents({
  events,
  max,
  dense,
  toneLabels,
  onOpenDay,
  onSelectEvent,
}: {
  events: PlanningEvent[];
  max: number;
  dense: boolean;
  toneLabels: ToneLabels;
  onOpenDay: () => void;
  onSelectEvent?: (event: PlanningEvent) => void;
}) {
  const ordered = TONE_SEVERITY.flatMap((tone) => events.filter((event) => event.tone === tone));
  const shown = ordered.slice(0, max);
  const rest = ordered.length - shown.length;

  if (ordered.length === 0) return null;

  return (
    <div className={cn('flex min-w-0 flex-col', dense ? 'gap-[3px]' : 'gap-1')}>
      {shown.map((event) => (
        <EventChip
          key={event.id}
          event={event}
          dense={dense}
          toneLabels={toneLabels}
          onSelect={() => (onSelectEvent ? onSelectEvent(event) : onOpenDay())}
        />
      ))}
      {rest > 0 ? (
        <button
          type="button"
          onClick={onOpenDay}
          className={cn(
            'cursor-pointer rounded-sm px-1 py-px text-left font-bold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
            dense ? 'text-[9px]' : 'text-[10px]',
          )}
        >
          +{rest} more
        </button>
      ) : null}
    </div>
  );
}

/** The day's load, tinted by the worst thing on it. */
function DayCount({
  events,
  toneLabels,
}: {
  events: PlanningEvent[];
  toneLabels: ToneLabels;
}) {
  const worst = worstTone(events);
  if (!worst || events.length === 0) return null;
  const Icon = TONE[worst].icon;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[9.5px] font-bold leading-none tabular-nums',
        TONE[worst].chipActive,
      )}
      title={`${events.length} · worst: ${toneLabels[worst] ?? TONE[worst].label}`}
    >
      <Icon className="size-2.5 shrink-0" aria-hidden />
      {events.length}
    </span>
  );
}

/* ---------------------------------------------------------------------------
 * Week — seven day columns, each a time-ordered stack
 * ------------------------------------------------------------------------- */

function WeekBoard({
  days,
  today,
  peak,
  openDay,
  eventsOn,
  onOpenDay,
  unitLabel,
  toneLabels,
  onSelectEvent,
}: {
  days: Date[];
  today: Date;
  peak: number;
  openDay: string | null;
  eventsOn: (day: Date) => PlanningEvent[];
  onOpenDay: (key: string | null) => void;
  unitLabel: { one: string; many: string };
  toneLabels: ToneLabels;
  onSelectEvent?: (event: PlanningEvent) => void;
}) {
  return (
    <div className="w-0 min-w-full overflow-x-auto">
      <div className="grid min-w-[56rem] grid-cols-7 gap-2">
        {days.map((day) => {
          const dayEvents = eventsOn(day);
          const isToday = isSameDay(day, today);
          const isOpen = openDay === dayKey(day);
          const load = peak > 0 ? Math.round((dayEvents.length / peak) * 100) : 0;

          return (
            <section
              key={day.toISOString()}
              className={cn(
                'flex min-w-0 flex-col overflow-hidden rounded-card-nested border transition-colors',
                isOpen
                  ? 'border-primary ring-1 ring-primary/25'
                  : isToday
                    ? 'border-primary/40'
                    : 'border-border-subtle',
              )}
            >
              {/* Day header — the date, its load, and a bar to compare across the week */}
              <button
                type="button"
                onClick={() => onOpenDay(isOpen ? null : dayKey(day))}
                className={cn(
                  'cursor-pointer px-2.5 pb-2 pt-2 text-left transition-colors',
                  isToday ? 'bg-primary-subtle/60' : 'bg-surface-sunken/60 hover:bg-surface-sunken',
                )}
              >
                <span className="flex items-baseline justify-between gap-1">
                  <span className="text-[10px] font-extrabold uppercase tracking-[0.09em] text-muted-foreground">
                    {format(day, 'EEE')}
                  </span>
                  <span
                    className={cn(
                      'text-sm font-extrabold tabular-nums',
                      isToday ? 'text-primary-subtle-foreground' : 'text-foreground',
                    )}
                  >
                    {format(day, 'd')}
                  </span>
                </span>
                <span className="mt-1.5 block h-1 w-full overflow-hidden rounded-full bg-border-subtle">
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${load}%`,
                      background: dayEvents.length > 0 ? 'var(--primary)' : 'transparent',
                    }}
                  />
                </span>
                <span className="mt-1 flex items-center gap-1.5">
                  {dayEvents.length === 0 ? (
                    <span className="text-[10px] font-semibold text-muted-foreground">clear</span>
                  ) : (
                    <>
                      <DayCount events={dayEvents} toneLabels={toneLabels} />
                      <span className="text-[10px] font-semibold text-muted-foreground">
                        {dayEvents.length === 1 ? unitLabel.one : unitLabel.many}
                      </span>
                    </>
                  )}
                </span>
              </button>

              {/* The work itself. A chip selects its entry; "+n more" opens the day. */}
              <div className="flex min-h-[2.75rem] flex-col p-1.5">
                <DayEvents
                  events={dayEvents}
                  max={WEEK_CELL_LIMIT}
                  dense={false}
                  toneLabels={toneLabels}
                  onOpenDay={() => onOpenDay(isOpen ? null : dayKey(day))}
                  onSelectEvent={onSelectEvent}
                />
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Month — the whole book at a glance
 * ------------------------------------------------------------------------- */

function MonthBoard({
  days,
  cursor,
  today,
  openDay,
  eventsOn,
  onOpenDay,
  toneLabels,
  onSelectEvent,
}: {
  days: Date[];
  cursor: Date;
  today: Date;
  openDay: string | null;
  eventsOn: (day: Date) => PlanningEvent[];
  onOpenDay: (key: string | null) => void;
  toneLabels: ToneLabels;
  onSelectEvent?: (event: PlanningEvent) => void;
}) {
  return (
    <div className="w-0 min-w-full overflow-x-auto">
      <div className="min-w-[52rem]">
        <div className="grid grid-cols-7">
          {days.slice(0, 7).map((day) => (
            <p
              key={`head-${day.toISOString()}`}
              className="px-2 pb-1.5 text-[10px] font-extrabold uppercase tracking-[0.09em] text-muted-foreground"
            >
              {format(day, 'EEE')}
            </p>
          ))}
        </div>

        <div className="grid grid-cols-7 overflow-hidden rounded-card-nested border-l border-t border-border-subtle">
          {days.map((day) => {
            const dayEvents = eventsOn(day);
            const outside = !isSameMonth(day, cursor);
            const isToday = isSameDay(day, today);
            const isOpen = openDay === dayKey(day);

            return (
              <div
                key={day.toISOString()}
                className={cn(
                  // Tall enough to hold two entries and the "+n more" without
                  // collapsing. At 6rem a busy day clipped to one line, which
                  // is the day a planner most needs to read at a glance.
                  'flex min-h-[7.5rem] flex-col gap-1 border-b border-r border-border-subtle p-1.5 transition-colors',
                  outside && 'bg-surface-sunken/40',
                  isToday && 'bg-primary-subtle/25',
                  isOpen && 'bg-primary-subtle/40 ring-1 ring-inset ring-primary/40',
                )}
              >
                <button
                  type="button"
                  onClick={() => onOpenDay(isOpen ? null : dayKey(day))}
                  className="flex cursor-pointer items-center justify-between gap-1 rounded-sm px-0.5 text-left"
                >
                  <span
                    className={cn(
                      'text-[11px] font-bold tabular-nums',
                      outside
                        ? 'text-muted-foreground/60'
                        : isToday
                          ? 'text-primary-subtle-foreground'
                          : 'text-foreground',
                    )}
                  >
                    {format(day, 'd')}
                  </span>
                  <DayCount events={dayEvents} toneLabels={toneLabels} />
                </button>

                <div className="flex flex-1 flex-col px-0.5 pt-0.5">
                  <DayEvents
                    events={dayEvents}
                    max={MONTH_CELL_LIMIT}
                    dense
                    toneLabels={toneLabels}
                    onOpenDay={() => onOpenDay(isOpen ? null : dayKey(day))}
                    onSelectEvent={onSelectEvent}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * One opened day, in full — nothing on this calendar is silently truncated
 * ------------------------------------------------------------------------- */

function DayList({
  day,
  events,
  unitLabel,
  toneLabels,
  onClose,
  onSelectEvent,
}: {
  day: Date;
  events: PlanningEvent[];
  unitLabel: { one: string; many: string };
  toneLabels: ToneLabels;
  onClose: () => void;
  onSelectEvent?: (event: PlanningEvent) => void;
}) {
  return (
    <div className="rounded-card-nested border border-border bg-surface-sunken/40">
      <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-3.5 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-foreground">
            {format(day, 'EEEE d MMMM yyyy')}
          </p>
          <p className="type-body-xs text-muted-foreground">
            {events.length} {events.length === 1 ? unitLabel.one : unitLabel.many} on this day
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close day"
          className="shrink-0 cursor-pointer rounded-md border border-border p-1 text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>

      {events.length === 0 ? (
        <p className="type-body-xs px-3.5 py-4 text-muted-foreground">
          Nothing on the book for this day.
        </p>
      ) : (
        <ul className="divide-y divide-border-subtle">
          {events.map((event) => {
            const tone = TONE[event.tone];
            const ToneIcon = tone.icon;
            return (
              <li key={event.id}>
                <button
                  type="button"
                  disabled={!onSelectEvent}
                  onClick={() => onSelectEvent?.(event)}
                  className={cn(
                    'grid w-full grid-cols-[3.25rem_minmax(0,1fr)_auto] items-center gap-3 px-3.5 py-2.5 text-left transition-colors',
                    onSelectEvent
                      ? 'cursor-pointer hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring'
                      : 'cursor-default',
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    {/* The status as a glyph, in the tone's colour — the same
                        thing the day cell's dot said, now with a name on it. */}
                    <ToneIcon
                      className="size-3.5 shrink-0"
                      style={{ color: tone.mark }}
                      aria-label={toneLabels[event.tone] ?? tone.label}
                    />
                    <span className="text-[11px] font-bold tabular-nums text-muted-foreground">
                      {format(new Date(event.at), 'HH:mm')}
                    </span>
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-mono text-xs font-bold tracking-tight text-foreground">
                      {event.title}
                    </span>
                    {event.subtitle ? (
                      <span className="truncate text-[11px] text-muted-foreground">
                        {event.subtitle}
                      </span>
                    ) : null}
                  </span>
                  {event.meta ? (
                    <span className="shrink-0 truncate text-[11px] font-semibold text-muted-foreground">
                      {event.meta}
                    </span>
                  ) : (
                    <span />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
