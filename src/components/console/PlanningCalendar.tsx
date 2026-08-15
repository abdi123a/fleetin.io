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
export type PlanningEventTone = 'done' | 'planned' | 'soon' | 'late';

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
  planned: {
    card: 'border-border bg-surface-sunken text-foreground hover:bg-secondary',
    mark: 'var(--fl-teal-400)',
    chipActive: 'border-border-strong bg-surface-sunken text-foreground',
    icon: Clock,
    label: 'Planned',
  },
  soon: {
    card: 'border-accent/35 bg-accent-subtle text-accent-subtle-foreground hover:brightness-[0.98]',
    mark: 'var(--accent-bold)',
    chipActive: 'border-accent/45 bg-accent-subtle text-accent-subtle-foreground',
    icon: Timer,
    label: 'Due soon',
  },
  late: {
    card: 'border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/15',
    mark: 'var(--destructive)',
    chipActive: 'border-destructive/40 bg-destructive/10 text-destructive',
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

/** How many dots a day draws before the rest collapse to "+n". */
const WEEK_CELL_LIMIT = 18;
const MONTH_CELL_LIMIT = 10;

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
    const counts: Record<PlanningEventTone, number> = { done: 0, planned: 0, soon: 0, late: 0 };
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

  /**
   * Whether today is already on screen.
   *
   * Drives the Today button's disabled state. Without it the button is always
   * live and does nothing on the range it opens on, which reads as broken —
   * the user reported exactly that. Greyed out, it says "you are already here".
   */
  const showingToday = useMemo(
    () => (view === 'week' ? days.some((day) => isSameDay(day, today)) : isSameMonth(cursor, today)),
    [view, days, cursor, today],
  );

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
            disabled={showingToday}
            title={showingToday ? 'Already showing today' : 'Jump to today'}
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
                  'inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors',
                  off
                    ? 'border-border-subtle bg-transparent text-muted-foreground/70 line-through'
                    : TONE[entry.tone].chipActive,
                )}
              >
                <span
                  className="size-[7px] shrink-0 rounded-full"
                  style={{ background: off ? 'var(--chart-other)' : TONE[entry.tone].mark }}
                  aria-hidden
                />
                {entry.label}
                <span className="tabular-nums opacity-70">{count}</span>
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
 * A day cell says two things and no more: **how much** is on it, and **what
 * kind**. One dot per entry, coloured by tone; the count badge takes the colour
 * of the worst tone on the day.
 *
 * The cells used to render a stack of cards — time, container, yard,
 * counterparty and a status word, four lines each, up to four of them. Twenty
 * days of that is a wall of small type nobody reads, and the one thing a
 * planner actually wants from a month grid — where the pressure is — was the
 * hardest thing to see. Detail did not disappear: clicking a day opens the full
 * list underneath, which is where a reference belongs.
 */

/** Worst first — the tone a day is judged by. */
const TONE_SEVERITY: readonly PlanningEventTone[] = ['late', 'soon', 'planned', 'done'];

function worstTone(events: PlanningEvent[]): PlanningEventTone | null {
  for (const tone of TONE_SEVERITY) {
    if (events.some((event) => event.tone === tone)) return tone;
  }
  return null;
}

/** Dots in severity order, so the worst of a busy day reads first. */
function DayDots({ events, max }: { events: PlanningEvent[]; max: number }) {
  const ordered = TONE_SEVERITY.flatMap((tone) => events.filter((event) => event.tone === tone));
  const shown = ordered.slice(0, max);
  const rest = ordered.length - shown.length;

  if (ordered.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map((event) => (
        <span
          key={event.id}
          className="size-1.5 shrink-0 rounded-full"
          style={{ background: TONE[event.tone].mark }}
          aria-hidden
        />
      ))}
      {rest > 0 ? (
        <span className="text-[9px] font-bold leading-none tabular-nums text-muted-foreground">
          +{rest}
        </span>
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
}: {
  days: Date[];
  today: Date;
  peak: number;
  openDay: string | null;
  eventsOn: (day: Date) => PlanningEvent[];
  onOpenDay: (key: string | null) => void;
  unitLabel: { one: string; many: string };
  toneLabels: ToneLabels;
}) {
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[32rem] grid-cols-7 gap-2">
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

              {/* The work, as dots. The whole panel opens the day. */}
              <button
                type="button"
                onClick={() => onOpenDay(isOpen ? null : dayKey(day))}
                aria-label={`Open ${format(day, 'd MMM')}`}
                className="flex min-h-[2.75rem] cursor-pointer flex-col items-start gap-1.5 p-2 text-left transition-colors hover:bg-surface-sunken/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <DayDots events={dayEvents} max={WEEK_CELL_LIMIT} />
              </button>
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
}: {
  days: Date[];
  cursor: Date;
  today: Date;
  openDay: string | null;
  eventsOn: (day: Date) => PlanningEvent[];
  onOpenDay: (key: string | null) => void;
  toneLabels: ToneLabels;
}) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[30rem]">
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
                  'flex min-h-[4.5rem] flex-col gap-1 border-b border-r border-border-subtle p-1.5 transition-colors',
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

                <button
                  type="button"
                  onClick={() => onOpenDay(isOpen ? null : dayKey(day))}
                  aria-label={`Open ${format(day, 'd MMM yyyy')}`}
                  className="flex flex-1 cursor-pointer items-start px-0.5 pt-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <DayDots events={dayEvents} max={MONTH_CELL_LIMIT} />
                </button>
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
