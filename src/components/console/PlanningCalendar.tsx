import { useMemo, useState } from 'react';
import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  endOfDay,
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
  Package,
  PackageCheck,
  PackageOpen,
  RotateCcw,
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
 *
 * `full` / `empty` / `returned` extend the same way, for Empty Return again:
 * its calendar used to grade every event by the clock (deadline passed, deadline
 * ahead, paired, waiting, returned) — five tones answering "how urgent", laid
 * on top of a board whose real subject is a physical container. Urgency already
 * has a home on the Control Tower, the module's one action surface; this
 * calendar only monitors. So its tones stopped being about the clock and became
 * the one fact every event on it actually shares: what is inside the box right
 * now — the same three-state axis (`ContainerState` in `@/lib/containerState`)
 * every other Empty Return surface reads a container by. A host that never
 * emits these three sees no change; a host that does gets the same yellow/teal/
 * grey pairing the rest of the app already uses for "empty / full / done".
 */
export type PlanningEventTone =
  | 'done'
  | 'locked'
  | 'planned'
  | 'soon'
  | 'late'
  | 'due'
  | 'full'
  | 'empty'
  | 'paired'
  | 'returning'
  | 'returned';

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
  /**
   * The host's own glyph for *what kind of thing this is*, drawn in place of
   * the tone rule.
   *
   * Tone answers "how is the clock doing"; a host whose board mixes genuinely
   * different kinds of work on the same day — a box becoming available, a load
   * being collected, a deadline falling — needs to say which is which without
   * spending a colour it has already assigned to the clock. Opt-in: a host that
   * omits it keeps the plain tone rule it had.
   */
  icon?: LucideIcon;
  /** Names that kind in the chip's tooltip and in the day list. Pairs with `icon`. */
  kindLabel?: string;
  /**
   * Epoch ms. When set and later than `at`, the event stops being a moment and
   * becomes a **window**: one bar running from `at` to `until` across every day
   * it covers, in the lane rail at the top of a week and across the week rows
   * of a month.
   *
   * This is what a board of deadlines actually is. An empty container is not an
   * event on the day it came free and a second event on the day the line stops
   * being patient — it is one box with a clock running between the two, and a
   * planner reads "how much room is left" off the length of the bar without
   * doing date arithmetic in their head. Hosts that only have moments omit it
   * and see no change.
   */
  until?: number;
  /**
   * Epoch ms inside the window — drawn as a tick on the bar. A commitment made
   * inside the window it belongs to (a return booked for Thursday against a
   * Saturday deadline) rather than a second chip somewhere else on the grid.
   */
  marker?: number;
  /** Names the tick, for the tooltip. */
  markerLabel?: string;
}

/** A window, not a moment — the events that draw as bars. */
export function isSpan(event: PlanningEvent): boolean {
  return typeof event.until === 'number' && event.until > event.at;
}

const coversDay = (event: PlanningEvent, day: Date) =>
  event.at <= endOfDay(day).getTime() && (event.until ?? event.at) >= startOfDay(day).getTime();

interface ToneStyle {
  /**
   * The EXACT fill, border and ink an event wears in a cell — stated once, so
   * the legend swatch above the grid can render the same string and be the
   * colour it is naming rather than an approximation of it. Split out from
   * `hover` for that reason: a swatch is not clickable, an event is.
   */
  surface: string;
  /** Layered on `surface` for the clickable cell only. */
  hover: string;
  /**
   * The same tone as a **window** — a bar that can be four columns long and
   * repeat on every week it crosses.
   *
   * A moment is a chip the size of a word, so a solid fill is exactly the right
   * amount of ink for it. The same fill on a bar spanning a fortnight is a
   * different object: three overdue containers rendered as solid red rails on
   * five week rows is the "one long alarm" this board exists not to be. So a
   * window states its tone with a wash and a solid rule down its leading edge
   * — the reference boards this was designed against do the same — and keeps
   * the saturated colour for the 3px that identifies it.
   */
  bar: string;
  mark: string;
  chipActive: string;
  /** The glyph a cell shows instead of spelling the status out. */
  icon: LucideIcon;
  /** Fallback wording when the host supplies no `legend` label for the tone. */
  label: string;
}

const TONE: Record<PlanningEventTone, ToneStyle> = {
  done: {
    surface: 'border-primary/25 bg-primary-subtle/50 text-primary-subtle-foreground',
    hover: 'hover:bg-primary-subtle/70',
    bar: 'border-primary/25 bg-primary-subtle/50 text-primary-subtle-foreground',
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
    surface: 'border-tile-sky bg-tile-sky text-tile-foreground',
    hover: 'hover:brightness-[0.97]',
    bar: 'border-tile-sky bg-tile-sky text-tile-foreground',
    mark: 'var(--tile-sky)',
    chipActive: 'border-tile-sky bg-tile-sky text-tile-foreground',
    icon: Link2,
    label: 'Matched',
  },
  planned: {
    surface: 'border-tile-peach bg-tile-peach text-tile-foreground',
    hover: 'hover:brightness-[0.97]',
    bar: 'border-tile-peach bg-tile-peach text-tile-foreground',
    mark: 'var(--tile-peach)',
    chipActive: 'border-tile-peach bg-tile-peach text-tile-foreground',
    icon: Clock,
    label: 'Planned',
  },
  soon: {
    surface: 'border-tile-teal bg-tile-teal text-tile-teal-foreground',
    hover: 'hover:brightness-[1.06]',
    bar: 'border-primary/30 bg-primary-subtle/60 text-primary-subtle-foreground',
    mark: 'var(--tile-teal)',
    chipActive: 'border-tile-teal bg-tile-teal text-tile-teal-foreground',
    icon: Timer,
    label: 'Due soon',
  },
  late: {
    surface: 'border-destructive bg-destructive text-destructive-foreground',
    hover: 'hover:brightness-[1.06]',
    bar: 'border-destructive/40 bg-destructive-subtle text-destructive-subtle-foreground',
    mark: 'var(--destructive)',
    chipActive: 'border-destructive bg-destructive text-destructive-foreground',
    icon: AlertCircle,
    label: 'Overdue',
  },
  /* The same deadline, before it bites. Hollow rather than a fifth hue: a
     deadline ahead and a deadline passed are one kind of event, and the app's
     own convention — solid is real, outlined is not yet — already says which
     is which without spending a colour. It was previously falling through to
     `empty`, so a future deadline was drawn in the sky of "a box is available"
     and counted under that word in the key. */
  due: {
    surface: 'border-destructive/45 bg-destructive-subtle text-destructive-subtle-foreground',
    hover: 'hover:bg-destructive-subtle hover:brightness-[0.98]',
    bar: 'border-destructive/40 bg-destructive-subtle text-destructive-subtle-foreground',
    mark: 'var(--destructive)',
    chipActive: 'border-destructive/45 bg-destructive-subtle text-destructive-subtle-foreground',
    icon: Timer,
    label: 'Deadline',
  },
  /* The container-state trio — same tokens, same icons, same pairing every
   * other Empty Return surface uses (`@/lib/containerState`,
   * `ContainerStateTag`). `full` stays solid like `locked`/`planned`/`soon`;
   * `empty` is the one dashed card on this board, because a dashed yellow
   * outline is what "empty" means everywhere else in the app and a solid chip
   * here would be the one surface that disagreed. `returned` stays as quiet as
   * `done` — a finished container should be the thing the eye skips. */
  full: {
    surface: 'border-container-full bg-container-full text-container-full-foreground',
    hover: 'hover:brightness-[1.06]',
    bar: 'border-container-full/40 bg-primary-subtle/70 text-primary-subtle-foreground',
    mark: 'var(--container-full)',
    chipActive: 'border-container-full bg-container-full text-container-full-foreground',
    icon: Package,
    label: 'Full',
  },
  /* An empty box awaiting a decision. Repainted 2026-08-29 from the brand
     yellow onto `--stage-available` (sky), which is what the v19 design gives
     "EMPTY AVAILABLE". Yellow still means *the box is empty* on a container
     tag; this scale answers the other question — what is happening to it — and
     on a calendar cell that is the one worth colouring. Dashed either way, so
     the empty/full distinction survives without leaning on hue. */
  empty: {
    surface:
      'border-2 border-dashed border-stage-available-border bg-stage-available-subtle text-stage-available-subtle-foreground',
    hover: 'hover:brightness-[0.98]',
    bar: 'border border-dashed border-stage-available-border bg-stage-available-subtle text-stage-available-subtle-foreground',
    mark: 'var(--stage-available)',
    chipActive: 'border-2 border-dashed border-stage-available-border bg-stage-available text-stage-available-foreground',
    icon: PackageOpen,
    label: 'Empty available',
  },
  /* Two different containers welded into one movement — v19's violet. */
  paired: {
    surface: 'border-stage-paired-border bg-stage-paired-subtle text-stage-paired-subtle-foreground',
    hover: 'hover:brightness-[0.98]',
    bar: 'border-stage-paired-border bg-stage-paired-subtle text-stage-paired-subtle-foreground',
    mark: 'var(--stage-paired)',
    chipActive: 'border-stage-paired-border bg-stage-paired text-stage-paired-foreground',
    icon: Link2,
    label: 'Pairing',
  },
  /* Going back alone, slot chosen. */
  returning: {
    surface:
      'border-stage-returning-border bg-stage-returning-subtle text-stage-returning-subtle-foreground',
    hover: 'hover:brightness-[0.98]',
    bar: 'border-stage-returning-border/70 bg-stage-returning-subtle text-stage-returning-subtle-foreground',
    mark: 'var(--stage-returning)',
    chipActive: 'border-stage-returning-border bg-stage-returning text-stage-returning-foreground',
    icon: RotateCcw,
    label: 'Empty return',
  },
  returned: {
    surface: 'border-stage-closed-border bg-stage-closed-subtle text-stage-closed-subtle-foreground',
    hover: 'hover:brightness-[0.98]',
    bar: 'border-stage-closed-border bg-stage-closed-subtle text-stage-closed-subtle-foreground',
    mark: 'var(--stage-closed)',
    chipActive: 'border-stage-closed-border bg-stage-closed text-stage-closed-foreground',
    icon: PackageCheck,
    label: 'Returned',
  },
};

/** Host wording per tone, taken from `legend` so a tooltip says the host's own status. */
type ToneLabels = Partial<Record<PlanningEventTone, string>>;

/**
 * One entry in the key above the grid.
 *
 * `icon` is optional and exists so the swatch can carry the SAME glyph the
 * host draws in its cells (`PlanningEvent.icon`) rather than the tone's
 * generic one — a key that shows a different mark than the board is a key a
 * reader has to translate. Omitted, the tone's own glyph is used.
 */
export interface PlanningLegendEntry {
  tone: PlanningEventTone;
  label: string;
  icon?: LucideIcon;
}

export type PlanningCalendarView = 'week' | 'month';

export interface PlanningCalendarProps {
  events: PlanningEvent[];
  /** Anchors "today" so the whole app can be driven by one clock. */
  now: number;
  /** Which grid opens first. */
  defaultView?: PlanningCalendarView;
  /** The key above the board — the host names its own tones. Doubles as the filter. */
  legend?: PlanningLegendEntry[];
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

  /** What survives the tone filter — everything downstream reads this. */
  const visible = useMemo(
    () => (muted.length === 0 ? events : events.filter((event) => !muted.includes(event.tone))),
    [events, muted],
  );

  /**
   * The two populations, kept apart on purpose.
   *
   * A moment lives in one cell; a window belongs to a row of days and is drawn
   * over the top of them. Bucketing a window by its start day — which is what
   * one shared map would do — would file a fortnight-long deadline under the
   * Tuesday it began and leave the other thirteen days looking empty.
   */
  const points = useMemo(() => visible.filter((event) => !isSpan(event)), [visible]);
  const spans = useMemo(() => visible.filter(isSpan), [visible]);

  /** Which tones this board draws as bars — the key copies whichever mark applies. */
  const spanTones = useMemo(
    () => new Set(events.filter(isSpan).map((event) => event.tone)),
    [events],
  );

  /** Moments bucketed by calendar day once, so no cell re-scans the list. */
  const byDay = useMemo(() => {
    const map = new Map<string, PlanningEvent[]>();
    for (const event of points) {
      const key = format(new Date(event.at), 'yyyy-MM-dd');
      const bucket = map.get(key);
      if (bucket) bucket.push(event);
      else map.set(key, [event]);
    }
    for (const bucket of map.values()) bucket.sort((a, b) => a.at - b.at);
    return map;
  }, [points]);

  const shownOn = (day: Date) => byDay.get(dayKey(day)) ?? [];
  const spansOn = (day: Date) => spans.filter((event) => coversDay(event, day));

  /** The days the counts and the totals are measured over. */
  const rangeBounds = useMemo(() => {
    const inRange = view === 'week' ? days : days.filter((day) => isSameMonth(day, cursor));
    const first = inRange[0] ?? cursor;
    const last = inRange[inRange.length - 1] ?? cursor;
    return { from: startOfDay(first).getTime(), to: endOfDay(last).getTime() };
  }, [view, days, cursor]);

  /** Per-tone counts across the visible range — the chips print their own weight. */
  const toneCounts = useMemo(() => {
    const counts: Record<PlanningEventTone, number> = {
      done: 0,
      locked: 0,
      planned: 0,
      soon: 0,
      late: 0,
      due: 0,
      full: 0,
      empty: 0,
      paired: 0,
      returning: 0,
      returned: 0,
    };
    /* Overlap, not start day: a window that runs through the month counts as
       one thing in it even if it began last month. */
    for (const event of events) {
      if (event.at <= rangeBounds.to && (event.until ?? event.at) >= rangeBounds.from) {
        counts[event.tone] += 1;
      }
    }
    return counts;
  }, [events, rangeBounds]);

  const visibleTotal = useMemo(
    () =>
      visible.filter(
        (event) =>
          event.at <= rangeBounds.to && (event.until ?? event.at) >= rangeBounds.from,
      ).length,
    [visible, rangeBounds],
  );

  /** The busiest day in view — every day bar is drawn against it. */
  const peak = useMemo(
    () => days.reduce((max, day) => Math.max(max, shownOn(day).length), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [days, byDay],
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

      {/* The key, which is also the filter.
       *
       * It used to be four saturated blocks — a full-bleed tile per tone, in
       * `chipActive`, sized to a shared 7.5rem so they read as a KPI strip.
       * Two things were wrong with that. It was a strip of solid colour (a
       * solid red one among them) sitting above the board it annotates and
       * outshouting it; and the colour it showed was NOT the colour the board
       * draws — the tones whose cells are a dashed wash appeared here as a
       * filled saturated chip, so the one job a key has, mapping a colour to a
       * word, it did wrong.
       *
       * Now the swatch IS the cell: `TONE[tone].surface`, the same string the
       * event chip renders, with the host's own glyph inside it. Everything
       * else is quiet, so the four exact colours are the only colour in the
       * row. */}
      {legend && legend.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {legend.map((entry) => {
            const off = muted.includes(entry.tone);
            const count = toneCounts[entry.tone];
            const SwatchIcon = entry.icon ?? TONE[entry.tone].icon;
            /* A window and a moment do not look alike, so the swatch is
               whichever one this tone actually is on this board: a mini bar
               with its leading rule, or the chip. */
            const asBar = spanTones.has(entry.tone);
            return (
              <button
                key={entry.tone}
                type="button"
                aria-pressed={!off}
                title={off ? `Show ${entry.label.toLowerCase()}` : `Hide ${entry.label.toLowerCase()}`}
                onClick={() => toggleTone(entry.tone)}
                className={cn(
                  'inline-flex cursor-pointer items-center gap-2 rounded-full border py-1 pl-1 pr-3 transition-colors',
                  off
                    ? 'border-border-subtle bg-transparent'
                    : 'border-border bg-surface-sunken hover:bg-secondary',
                )}
              >
                {asBar ? (
                  <span
                    aria-hidden
                    className={cn(
                      'relative inline-flex h-[18px] w-9 shrink-0 items-center overflow-hidden rounded-full border pl-1.5',
                      off
                        ? 'border-dashed border-border bg-transparent text-muted-foreground/60'
                        : TONE[entry.tone].bar,
                    )}
                  >
                    {!off ? (
                      <span
                        className="absolute inset-y-0 left-0 w-[3px] rounded-l-full"
                        style={{ background: TONE[entry.tone].mark }}
                      />
                    ) : null}
                    <SwatchIcon className="ml-0.5 size-[11px] opacity-80" />
                  </span>
                ) : (
                  <span
                    aria-hidden
                    className={cn(
                      'inline-flex size-[22px] shrink-0 items-center justify-center rounded-full border',
                      off
                        ? 'border-dashed border-border bg-transparent text-muted-foreground/60'
                        : TONE[entry.tone].surface,
                    )}
                  >
                    <SwatchIcon className="size-3" />
                  </span>
                )}
                <span
                  className={cn(
                    'text-[10px] font-extrabold uppercase leading-none tracking-[0.09em]',
                    off ? 'text-muted-foreground/70 line-through' : 'text-foreground',
                  )}
                >
                  {entry.label}
                </span>
                <span
                  className={cn(
                    'font-mono text-[11.5px] font-bold leading-none tabular-nums',
                    off ? 'text-muted-foreground/60' : 'text-muted-foreground',
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}

          {/* Muting is silent otherwise: a struck-through chip explains the
              board is short, but nothing offers to put it back in one move. */}
          {muted.length > 0 ? (
            <button
              type="button"
              onClick={() => setMuted([])}
              className="cursor-pointer rounded-full px-2 py-1 text-[11px] font-semibold text-primary underline-offset-2 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Show all
            </button>
          ) : null}
        </div>
      ) : null}

      {view === 'week' ? (
        <WeekBoard
          days={days}
          today={today}
          peak={peak}
          openDay={openDay}
          spans={spans}
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
          spans={spans}
          eventsOn={shownOn}
          onOpenDay={setOpenDay}
          toneLabels={toneLabels}
          onSelectEvent={onSelectEvent}
        />
      )}

      {openedDate ? (
        <DayList
          day={openedDate}
          events={[...spansOn(openedDate), ...shownOn(openedDate)]}
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
const TONE_SEVERITY: readonly PlanningEventTone[] = [
  'late',
  'due',
  'soon',
  'empty',
  'returning',
  'planned',
  'paired',
  'locked',
  'full',
  'done',
  'returned',
];

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
  const KindIcon = event.icon;

  return (
    <button
      type="button"
      onClick={onSelect}
      title={[time, event.kindLabel, event.title, event.subtitle, status]
        .filter(Boolean)
        .join(' · ')}
      className={cn(
        'flex w-full min-w-0 cursor-pointer items-start gap-1.5 rounded-sm border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        tone.surface,
        tone.hover,
        dense ? 'px-1 py-[3px]' : 'px-1.5 py-1',
      )}
    >
      {/* The kind as a glyph when the host names one, otherwise the tone as a
          rule down the edge — colour without spending a word. */}
      {KindIcon ? (
        <KindIcon className="mt-[2px] size-3 shrink-0 opacity-80" aria-hidden />
      ) : (
        <span
          className="mt-[3px] h-2 w-[3px] shrink-0 rounded-full"
          style={{ background: tone.mark }}
          aria-hidden
        />
      )}
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

/* ---------------------------------------------------------------------------
 * Windows — the bars that run across days
 * ------------------------------------------------------------------------- */

/**
 * Geometry, in the units the grid is built from.
 *
 * The bars are absolutely positioned over the day cells rather than laid out
 * inside them, because a window belongs to a row of days and a cell only knows
 * about one. Everything the overlay needs to line up — where a cell's own
 * content starts, how tall a lane is — is a number here rather than a class,
 * so the two halves cannot drift apart.
 */
const CELL_PAD = 6;
const DAY_ROW_H = 20;
const LANE_H = 21;
const LANE_GAP = 3;
const LANE_STRIDE = LANE_H + LANE_GAP;
/** Where a cell's own content begins: padding, the date row, then a hair of air. */
const RAIL_TOP = CELL_PAD + DAY_ROW_H + 4;

interface SpanPiece {
  event: PlanningEvent;
  lane: number;
  /** Column indexes within this week, 0–6 inclusive. */
  startCol: number;
  endCol: number;
  /** The window began before this week / ends after it — draw a flat edge. */
  continuesLeft: boolean;
  continuesRight: boolean;
}

/**
 * One week's worth of bars, packed into as few lanes as they fit in.
 *
 * Longest-first inside each start day: a two-week window that takes lane 0
 * keeps its line straight across the row instead of being bumped down a lane
 * by a one-day window that happens to start on the same morning.
 */
function layoutWeek(weekDays: Date[], spans: PlanningEvent[]): { pieces: SpanPiece[]; lanes: number } {
  const first = weekDays[0];
  const last = weekDays[weekDays.length - 1];
  if (!first || !last) return { pieces: [], lanes: 0 };

  const from = startOfDay(first).getTime();
  const to = endOfDay(last).getTime();

  const overlapping = spans
    .filter((event) => event.at <= to && (event.until ?? event.at) >= from)
    .sort((a, b) => a.at - b.at || (b.until ?? b.at) - b.at - ((a.until ?? a.at) - a.at));

  /** Columns already taken, per lane. */
  const taken: [number, number][][] = [];
  const pieces: SpanPiece[] = [];

  for (const event of overlapping) {
    /* Raw first, clamped second: whether a window runs off the edge of this
       week is the thing that decides its end caps, and a clamped index has
       already thrown that away. */
    const rawStart = differenceInCalendarDays(new Date(event.at), first);
    const rawEnd = differenceInCalendarDays(new Date(event.until ?? event.at), first);
    if (rawEnd < 0 || rawStart > 6) continue;

    const startCol = Math.max(0, rawStart);
    const endCol = Math.min(6, rawEnd);

    let lane = taken.findIndex(
      (row) => !row.some(([from_, to_]) => startCol <= to_ && endCol >= from_),
    );
    if (lane === -1) {
      lane = taken.length;
      taken.push([]);
    }
    taken[lane]?.push([startCol, endCol]);

    pieces.push({
      event,
      lane,
      startCol,
      endCol,
      continuesLeft: rawStart < 0,
      continuesRight: rawEnd > 6,
    });
  }

  return { pieces, lanes: taken.length };
}

/**
 * A window, drawn.
 *
 * The fill is the tone's exact surface — the same string the key above the
 * board and the moment-chips use — with a solid rule of the tone's own colour
 * down the leading edge, which is what makes a row of pale bars scannable at
 * arm's length. An edge is rounded only where the window genuinely begins or
 * ends: a bar that runs off the end of the week leaves square, so the eye
 * carries it to the next row instead of reading two separate jobs.
 */
function SpanBar({
  piece,
  toneLabels,
  /** Column gap of the grid underneath, in px — the month has none, the week has 8. */
  gapPx = 0,
  onSelect,
}: {
  piece: SpanPiece;
  toneLabels: ToneLabels;
  gapPx?: number;
  onSelect?: () => void;
}) {
  const { event, startCol, endCol, continuesLeft, continuesRight } = piece;
  const tone = TONE[event.tone];
  const KindIcon = event.icon ?? tone.icon;
  const cols = endCol - startCol + 1;
  const status = toneLabels[event.tone] ?? tone.label;

  /* Where a commitment sits inside the window. Drawn only on a piece that
     shows the whole window — on a clipped piece the share would be measured
     against a length the reader cannot see. */
  const markerAt = (() => {
    if (typeof event.marker !== 'number' || continuesLeft || continuesRight) return null;
    const span = (event.until ?? event.at) - event.at;
    if (span <= 0) return null;
    const share = (event.marker - event.at) / span;
    return share > 0.02 && share < 0.98 ? share * 100 : null;
  })();

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!onSelect}
      title={[
        event.kindLabel,
        event.title,
        `${format(new Date(event.at), 'd MMM')} → ${format(new Date(event.until ?? event.at), 'd MMM')}`,
        event.meta,
        status,
      ]
        .filter(Boolean)
        .join(' · ')}
      style={{
        /* Column arithmetic that survives a gapped grid: seven equal tracks
           out of the width the gaps leave behind, plus the gaps already
           crossed. With `gapPx` at 0 it collapses to plain sevenths. */
        left: `calc((100% - ${6 * gapPx}px) / 7 * ${startCol} + ${startCol * gapPx}px)`,
        width: `calc((100% - ${6 * gapPx}px) / 7 * ${cols} + ${(cols - 1) * gapPx}px)`,
        top: piece.lane * LANE_STRIDE,
        height: LANE_H,
      }}
      className={cn(
        'pointer-events-auto absolute flex items-center gap-1.5 overflow-hidden border px-1.5 text-left transition-[filter] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        tone.bar,
        onSelect && 'cursor-pointer',
        onSelect && tone.hover,
        continuesLeft ? 'rounded-l-none border-l-0' : 'rounded-l-full',
        continuesRight ? 'rounded-r-none border-r-0' : 'rounded-r-full',
      )}
    >
      {/* The leading rule — only where the window actually starts. */}
      {!continuesLeft ? (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-[3px] rounded-l-full"
          style={{ background: tone.mark }}
        />
      ) : null}

      {markerAt !== null ? (
        <span
          aria-hidden
          title={event.markerLabel}
          className="absolute inset-y-[3px] w-px opacity-60"
          style={{ left: `${markerAt}%`, background: tone.mark }}
        />
      ) : null}

      <KindIcon className={cn('size-3 shrink-0 opacity-80', !continuesLeft && 'ml-1')} aria-hidden />
      <span className="truncate font-mono text-[10.5px] font-bold tracking-tight">
        {event.title}
      </span>
      {event.meta && cols > 2 ? (
        <span className="ml-auto shrink-0 truncate pl-1 text-[10px] font-semibold opacity-75">
          {event.meta}
        </span>
      ) : null}
    </button>
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
  spans,
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
  spans: PlanningEvent[];
  eventsOn: (day: Date) => PlanningEvent[];
  onOpenDay: (key: string | null) => void;
  unitLabel: { one: string; many: string };
  toneLabels: ToneLabels;
  onSelectEvent?: (event: PlanningEvent) => void;
}) {
  const { pieces, lanes } = layoutWeek(days, spans);

  return (
    <div className="w-0 min-w-full overflow-x-auto">
      <div className="min-w-[56rem] space-y-2">
        {/* The windows, above the columns rather than inside them: a container
            with four days left is one bar four columns wide, and the length is
            the whole message. */}
        {lanes > 0 ? (
          <div
            className="relative"
            style={{ height: lanes * LANE_STRIDE - LANE_GAP }}
            aria-label="Windows running across this week"
          >
            {pieces.map((piece) => (
              <SpanBar
                key={piece.event.id}
                piece={piece}
                gapPx={8}
                toneLabels={toneLabels}
                onSelect={onSelectEvent ? () => onSelectEvent(piece.event) : undefined}
              />
            ))}
          </div>
        ) : null}

      <div className="grid grid-cols-7 gap-2">
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
                {/* The count is what LANDS on this day. Windows running across
                    the week are already drawn above the columns, and folding
                    them in here put an identical red badge on all seven days —
                    a tally of the same five bars, seven times. */}
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
  spans,
  eventsOn,
  onOpenDay,
  toneLabels,
  onSelectEvent,
}: {
  days: Date[];
  cursor: Date;
  today: Date;
  openDay: string | null;
  spans: PlanningEvent[];
  eventsOn: (day: Date) => PlanningEvent[];
  onOpenDay: (key: string | null) => void;
  toneLabels: ToneLabels;
  onSelectEvent?: (event: PlanningEvent) => void;
}) {
  /* A month is drawn a week at a time, not as one 42-cell grid, because a
     window has to run across its row: the bars are laid over the cells of the
     week they belong to, and each week reserves exactly the height its own
     lanes need. */
  const weeks: Date[][] = [];
  for (let index = 0; index < days.length; index += 7) weeks.push(days.slice(index, index + 7));

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

        <div className="overflow-hidden rounded-card-nested border-l border-t border-border-subtle">
          {weeks.map((week) => {
            const { pieces, lanes } = layoutWeek(week, spans);
            const railHeight = lanes > 0 ? lanes * LANE_STRIDE : 0;

            return (
              <div key={`week-${week[0]?.toISOString()}`} className="relative">
                <div className="grid grid-cols-7">
                  {week.map((day) => {
                    const dayEvents = eventsOn(day);
                    const outside = !isSameMonth(day, cursor);
                    const isToday = isSameDay(day, today);
                    const isOpen = openDay === dayKey(day);

                    return (
                      <div
                        key={day.toISOString()}
                        style={{ padding: CELL_PAD }}
                        className={cn(
                          // Tall enough to hold two entries and the "+n more"
                          // without collapsing. At 6rem a busy day clipped to
                          // one line, which is the day a planner most needs to
                          // read at a glance.
                          'flex min-h-[7.5rem] flex-col border-b border-r border-border-subtle transition-colors',
                          outside && 'bg-surface-sunken/40',
                          isToday && 'bg-primary-subtle/25',
                          isOpen && 'bg-primary-subtle/40 ring-1 ring-inset ring-primary/40',
                        )}
                      >
                        <button
                          type="button"
                          style={{ height: DAY_ROW_H }}
                          onClick={() => onOpenDay(isOpen ? null : dayKey(day))}
                          className="flex shrink-0 cursor-pointer items-center justify-between gap-1 rounded-sm px-0.5 text-left"
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
                          {/* Only when the cell is hiding something. A day
                              drawing all three of its entries does not need a
                              badge counting the three entries directly under
                              it — that was the same fact twice, in the loudest
                              colour on the grid. */}
                          {dayEvents.length > MONTH_CELL_LIMIT ? (
                            <DayCount events={dayEvents} toneLabels={toneLabels} />
                          ) : null}
                        </button>

                        {/* The room the week's bars are drawn into. It lives in
                            the cell so the moments below it start under the
                            windows rather than behind them. */}
                        <div style={{ height: railHeight }} aria-hidden />

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

                {pieces.length > 0 ? (
                  <div
                    className="pointer-events-none absolute inset-x-0 px-[3px]"
                    style={{ top: RAIL_TOP }}
                  >
                    {pieces.map((piece) => (
                      <SpanBar
                        key={piece.event.id}
                        piece={piece}
                        toneLabels={toneLabels}
                        onSelect={onSelectEvent ? () => onSelectEvent(piece.event) : undefined}
                      />
                    ))}
                  </div>
                ) : null}
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
                    'grid w-full grid-cols-[5.25rem_minmax(0,1fr)_auto] items-center gap-3 px-3.5 py-2.5 text-left transition-colors',
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
                    {/* A window has no clock on a day in the middle of it —
                        its start time would be a time on some other date. What
                        it has is the day it runs out. */}
                    <span className="whitespace-nowrap text-[11px] font-bold tabular-nums text-muted-foreground">
                      {isSpan(event)
                        ? `→ ${format(new Date(event.until ?? event.at), 'd MMM')}`
                        : format(new Date(event.at), 'HH:mm')}
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
