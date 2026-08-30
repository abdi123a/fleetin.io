/**
 * How a driver and a transporter are rated — the app's one performance rule.
 *
 * ## The system reports; it does not judge (2026-08-30)
 *
 * A star beside a name is a claim about somebody's work, and the only person
 * entitled to make that claim is somebody who was there. So **every star in
 * this app comes from a human**: the operator answers three questions in the
 * delivery debrief, and what they answer is the rating. Nothing here scores
 * anybody.
 *
 * This file used to derive the star from timestamps — deliver on time, get four
 * stars — and that was the wrong instinct. The record can say a mission closed
 * eleven hours over its window; it cannot say whether that was the driver or a
 * shut gate, and turning the first into a verdict about the second is the
 * system inventing an opinion it has no standing to hold.
 *
 * ## What the system still does, and must keep doing
 *
 * All of it, minus the verdict. The measurements below are unchanged and are
 * still computed on every mission:
 *
 * - **Delivered or not** — where the booking ended on the ladder.
 * - **The mission window** — road time from the shipment's own estimate,
 *   doubled for the round trip (see `MISSION_WINDOW_MULTIPLE`), and whether
 *   this mission closed inside it.
 * - **Turnaround** — scheduled pickup to close, in hours.
 * - **The container's return** — home before its deadline, home late, or still
 *   out and already past it.
 *
 * These are facts, and facts are exactly what the screens should carry. "38
 * missions, 27 on time, 4 boxes home late" tells a reader everything they need
 * to form their own view, and it never pretends to have formed one for them.
 * A profile prints the facts beside the human's star; the two answer different
 * questions and neither is derived from the other.
 *
 * ## A transporter has no rating of its own
 *
 * It has drivers, and the drivers are what people actually rate. So a
 * transporter's star is the combination of its drivers' marks and nothing else
 * — see `summariseFleet`. There is no separate carrier score, because there is
 * nobody who was ever asked to give one.
 *
 * Weighted per mission rather than per driver: the star should reflect what a
 * shipper actually met across their loads, so a driver who ran forty of them
 * counts for more of it than one who ran two.
 *
 * ## Where the numbers stop
 *
 * Somebody nobody has rated is `rated: false` and the profile says *Not yet
 * rated*, which is the truthful answer and the one an empty 0.0 would not be.
 * Their facts still show — an unrated driver with thirty missions on the board
 * is not an unknown quantity, just an unrated one.
 */

import { BOOKING_LADDER, type BookingRecord } from '@/features/bookings/api/bookingsService';
import { EMPTY_RETURN_EXCEPTIONS } from '@/data/emptyReturnData';

const HOUR_MS = 60 * 60 * 1000;

/** Stars run 1–5. Nobody is given zero stars; the floor of the scale is one. */
export const RATING_MIN = 1;
export const RATING_MAX = 5;

/**
 * How much of the routing estimate a mission is allowed.
 *
 * `estimatedDurationHours` on the shipment is *road time one way* — what the
 * distance takes to drive. A mission is that drive, the handover at the other
 * end, and the run back. Two of the estimate is the round trip, and it is
 * the budget the mission is held to.
 *
 * Chosen as a description of the journey, not fitted to a target score. It
 * decides one thing and one thing only: whether a mission is counted on time.
 * No star has ever depended on it and none does now.
 */
export const MISSION_WINDOW_MULTIPLE = 2;

/** The rungs a mission never came back from. */
const ABANDONED: ReadonlySet<string> = new Set(['Cancelled', 'Failed']);

/**
 * The rung at which the driver's job is done.
 *
 * `Arrived` — what the "Delivered" step writes. Deliberately *not* `Completed`:
 * that rung means the empty box is back at the depot, which is a separate
 * obligation happening days later and often on somebody else's truck. Counting
 * missions from it showed a driver who had delivered every load this week as
 * having run none, which is the opposite of what the record says.
 *
 * The box getting home still matters — it is the whole of the return figures
 * below. It is just not what "how many missions has this driver run" asks.
 */
const DELIVERED_RUNG = 'Arrived';
const DELIVERED_RANK = BOOKING_LADDER.indexOf(DELIVERED_RUNG);

/** Where a status sits on the ladder. `-1` for Cancelled/Failed, which are off it. */
function ladderRank(status: string): number {
  return BOOKING_LADDER.indexOf(status);
}

/** The three questions the debrief asks, in the order every profile prints them. */
export type RatingAxis = 'reliability' | 'punctuality' | 'professionalism';
export const AXES: readonly RatingAxis[] = ['reliability', 'punctuality', 'professionalism'];

/** A person's answer on one axis. `0`/null means they left it unanswered. */
function humanMark(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || value < RATING_MIN) return null;
  return Math.min(value, RATING_MAX);
}

/**
 * One mission, as the record has it.
 *
 * The marks are whatever a person gave; the rest is measured. They are kept in
 * the same object because a profile shows them side by side, and kept in
 * separate fields because nothing may ever quietly turn one into the other.
 */
export interface MissionFacts {
  bookingId: string;
  driverId: string | null;
  /** Epoch ms the mission closed — what the trend buckets by. Null while open. */
  closedAt: number | null;
  delivered: boolean;
  /** Off the board, whichever way it went. */
  closed: boolean;
  /** Inside the mission window. Null when the mission could not be timed at all. */
  onTime: boolean | null;
  /** Scheduled pickup to close, in hours. Null when either end is missing. */
  turnaroundHours: number | null;
  /**
   * The container's return, against its deadline.
   *
   * `late` covers both a box home after the deadline and a box still out with
   * the deadline already gone — the second is the one costing detention right
   * now. Null when there is no deadline to judge against.
   */
  returnLate: boolean | null;
  /** The box needed a trip of its own rather than pairing with a load. */
  standaloneReturn: boolean;
  /** What a person answered, 1–5 per axis. `null` on an axis nobody answered. */
  marks: Record<RatingAxis, number | null>;
  /** True when a person answered at least one axis on this mission. */
  rated: boolean;
}

export interface PerformanceSummary {
  /** False until a person has marked a mission — the profile says *Not yet rated*. */
  rated: boolean;

  /* ---- What people said. The star and nothing but the star. ---- */

  /** 1–5, one decimal. The mean of the axes people answered. Null when unrated. */
  overall: number | null;
  reliability: number | null;
  punctuality: number | null;
  professionalism: number | null;
  /** Missions a person actually marked — the weight behind the star. */
  ratedMissions: number;

  /* ---- What the record measured. Facts, printed beside the star. ---- */

  /** Missions off the board, delivered or not. */
  closed: number;
  /** Missions delivered. The headline count. */
  missions: number;
  /** Of the missions that could be timed, those inside the window. */
  onTime: number;
  /** How many missions could be timed at all — the denominator of `onTimePct`. */
  timed: number;
  /** `onTime / timed`, 0–100. Null when no mission could be timed. */
  onTimePct: number | null;
  /** Mean scheduled-pickup-to-close, in hours. Null when nothing could be measured. */
  turnaroundHours: number | null;
  /** Containers home after their deadline, or still out and already past it. */
  lateReturns: number;
  /** Containers whose return could be judged at all — the denominator of the above. */
  returnsTracked: number;
}

/** Nobody's record — a roster member no booking has ever been assigned to. */
export const UNRATED: PerformanceSummary = Object.freeze({
  rated: false,
  overall: null,
  reliability: null,
  punctuality: null,
  professionalism: null,
  ratedMissions: 0,
  closed: 0,
  missions: 0,
  onTime: 0,
  timed: 0,
  onTimePct: null,
  turnaroundHours: null,
  lateReturns: 0,
  returnsTracked: 0,
});

export interface RatingTrendPoint {
  /** `2026-07` — sorts, and formats without a locale round-trip. */
  month: string;
  /** Short month name for the axis. */
  label: string;
  /** The stars people gave that month. Null when nobody rated anything. */
  rating: number | null;
  missions: number;
}

/** `"34h 00m"` → 34. The shipment stores its estimate as prose. */
function parseEstimateHours(text: string | null | undefined): number | null {
  if (!text) return null;
  const match = /(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?/i.exec(text.trim());
  if (!match) return null;
  const hours = Number(match[1] ?? 0) + Number(match[2] ?? 0) / 60;
  return hours > 0 ? hours : null;
}

function parseTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

/**
 * Read one mission: what was measured, and what a person said about it.
 *
 * `now` is a parameter rather than a `Date.now()` inside, because the overdue
 * rule below reads the clock and a rule that reads the clock is not testable
 * unless the clock is passed in.
 */
export function readMission(booking: BookingRecord, now: number = Date.now()): MissionFacts {
  const completedAt = parseTime(booking.completedAt);
  const emptyReadyAt = parseTime(booking.emptyReadyAt);
  const abandoned = ABANDONED.has(booking.status);

  const rank = ladderRank(booking.status);
  /* `completedAt` alone is not the test — see DELIVERED_RUNG. A booking sitting
     on any rung from "Delivered" upward has had its load put down. */
  const delivered = !abandoned && (completedAt !== null || (rank >= 0 && rank >= DELIVERED_RANK));

  /**
   * When the mission closed, as well as the record can say.
   *
   * The ladder stamps `completedAt` at the depot and `emptyReadyAt` when the
   * box was stripped; the delivery rung itself carries no column on the list
   * payload. So a mission delivered but not yet stripped counts, and simply
   * goes untimed until one of those lands — measured late is better than
   * measured off a timestamp that was never taken.
   */
  const closedAt = completedAt ?? emptyReadyAt;

  const scheduledAt = parseTime(booking.scheduledPickupTime ?? booking.shipment?.scheduledPickupTime);
  const estimateHours = parseEstimateHours(booking.shipment?.estimatedDurationHours);

  /* Loading to delivery. The span itself, before any question of whether it
     was a good one — that judgement is not this file's to make.

     Kept in milliseconds for the window test and rounded only for display: a
     mission one millisecond over its window is over it, and rounding first
     made the boundary an hour wide. */
  const spanMs =
    delivered && closedAt !== null && scheduledAt !== null ? closedAt - scheduledAt : null;
  const turnaroundHours = spanMs === null ? null : Math.round((spanMs / HOUR_MS) * 10) / 10;

  let onTime: boolean | null = null;
  if (spanMs !== null && estimateHours !== null) {
    onTime = spanMs <= estimateHours * MISSION_WINDOW_MULTIPLE * HOUR_MS;
  }

  const deadline = parseTime(booking.containerReturnDeadline);
  let returnLate: boolean | null = null;
  if (deadline !== null) {
    if (completedAt !== null) returnLate = completedAt > deadline;
    /* Still out, already late. The box costing detention right now. */
    else if (!abandoned && now > deadline) returnLate = true;
  }

  const marks: Record<RatingAxis, number | null> = {
    reliability: humanMark(booking.driverRatingReliability),
    punctuality: humanMark(booking.driverRatingPunctuality),
    professionalism: humanMark(booking.driverRatingProfessionalism),
  };
  /* The stored overall stands in when a debrief was saved without the axes
     being broken out — an older row, or an operator who answered the question
     as a whole. It is still a person's answer, so it still counts. */
  const overallOnly = humanMark(booking.driverRating);
  const rated = AXES.some((axis) => marks[axis] !== null) || overallOnly !== null;

  return {
    bookingId: booking.id,
    driverId: booking.driverId,
    closedAt,
    delivered,
    closed: delivered || abandoned,
    onTime,
    turnaroundHours,
    returnLate,
    standaloneReturn: booking.emptyReturnException === EMPTY_RETURN_EXCEPTIONS.standaloneRequired,
    marks,
    rated,
  };
}

/** Mean of the answers that exist, to one decimal. Null when nobody answered. */
function meanOf(values: readonly (number | null)[]): number | null {
  const given = values.filter((value): value is number => value !== null);
  if (given.length === 0) return null;
  return Math.round((given.reduce((sum, value) => sum + value, 0) / given.length) * 10) / 10;
}

/**
 * One person's record: the facts of their missions, and the stars they were given.
 *
 * `ratedFrom` narrows which missions may contribute a star without narrowing
 * which ones contribute facts — `summariseFleet` uses it to build a carrier's
 * star out of its drivers' marks while still counting every mission the carrier
 * actually ran. Defaults to "all of them", which is what a driver's own profile
 * wants.
 */
export function summarisePerformance(
  bookings: readonly BookingRecord[],
  now: number = Date.now(),
  ratedFrom: (facts: MissionFacts) => boolean = () => true,
): PerformanceSummary {
  const facts = bookings.map((booking) => readMission(booking, now));

  /* ---- Measured. Every mission counts. ---- */
  const missions = facts.filter((fact) => fact.delivered).length;
  const closed = facts.filter((fact) => fact.closed).length;
  const timedFacts = facts.filter((fact) => fact.onTime !== null);
  const onTime = timedFacts.filter((fact) => fact.onTime).length;
  const turnarounds = facts
    .map((fact) => fact.turnaroundHours)
    .filter((hours): hours is number => hours !== null);
  const tracked = facts.filter((fact) => fact.returnLate !== null);

  /* ---- Given. Only missions a person marked, and only those `ratedFrom` allows. ---- */
  const marked = facts.filter((fact) => fact.rated && ratedFrom(fact));
  const axes = Object.fromEntries(
    AXES.map((axis) => [axis, meanOf(marked.map((fact) => fact.marks[axis]))]),
  ) as Record<RatingAxis, number | null>;

  /* The overall is the plain mean of the axes people answered. No weighting:
     the moment one axis counts double the number stops being explainable, and
     an unexplainable star beside somebody's name is worse than no star. */
  const overall = meanOf(AXES.map((axis) => axes[axis]));

  return {
    rated: overall !== null,
    overall,
    reliability: axes.reliability,
    punctuality: axes.punctuality,
    professionalism: axes.professionalism,
    ratedMissions: marked.length,

    closed,
    missions,
    onTime,
    timed: timedFacts.length,
    onTimePct: timedFacts.length > 0 ? Math.round((onTime / timedFacts.length) * 100) : null,
    turnaroundHours:
      turnarounds.length > 0
        ? Math.round((turnarounds.reduce((sum, hours) => sum + hours, 0) / turnarounds.length) * 10) /
          10
        : null,
    lateReturns: tracked.filter((fact) => fact.returnLate).length,
    returnsTracked: tracked.length,
  };
}

/**
 * A transporter's record — the facts of everything they ran, and their drivers' stars.
 *
 * A carrier is never rated directly; nobody is ever asked to rate one. What
 * people rate is the driver who turned up, so the carrier's star is those marks
 * and only those marks. A mission with no driver on it therefore contributes
 * its facts and no star, because there is no driver for it to have been a mark
 * about.
 */
export function summariseFleet(
  bookings: readonly BookingRecord[],
  now: number = Date.now(),
): PerformanceSummary {
  return summarisePerformance(bookings, now, (fact) => fact.driverId !== null);
}

/**
 * The stars people gave, month by month, oldest first.
 *
 * Bucketed by the month a mission *closed* in, not the month it was booked —
 * the rating is about how the work went, and the work went in the month it
 * finished. Months nobody rated carry `null` so the line breaks rather than
 * drawing a straight segment across a quiet period as though it had been
 * measured.
 *
 * A mission delivered but not yet stamped (see `MissionFacts.closedAt`) has no
 * month to sit in, so it counts on the profile and not yet on the line. The
 * alternative — filing it under today — would move history every time the page
 * is opened.
 */
export function ratingTrend(
  bookings: readonly BookingRecord[],
  months = 6,
  now: number = Date.now(),
  ratedFrom: (facts: MissionFacts) => boolean = () => true,
): RatingTrendPoint[] {
  const end = new Date(now);
  const buckets: RatingTrendPoint[] = [];
  const index = new Map<string, BookingRecord[]>();

  for (let back = months - 1; back >= 0; back -= 1) {
    const date = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - back, 1));
    const month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    index.set(month, []);
    buckets.push({
      month,
      label: date.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }),
      rating: null,
      missions: 0,
    });
  }

  for (const booking of bookings) {
    const { closedAt } = readMission(booking, now);
    if (closedAt === null) continue;
    const date = new Date(closedAt);
    const month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    index.get(month)?.push(booking);
  }

  return buckets.map((bucket) => {
    const closed = index.get(bucket.month) ?? [];
    if (closed.length === 0) return bucket;
    const summary = summarisePerformance(closed, now, ratedFrom);
    return { ...bucket, rating: summary.overall, missions: summary.missions };
  });
}

/** A carrier's trend — its drivers' marks, month by month. See `summariseFleet`. */
export function fleetRatingTrend(
  bookings: readonly BookingRecord[],
  months = 6,
  now: number = Date.now(),
): RatingTrendPoint[] {
  return ratingTrend(bookings, months, now, (fact) => fact.driverId !== null);
}

/** `4.8` → `"4.8"`; unrated → `"—"`. One place, so every star reads the same. */
export function formatStars(rating: number | null): string {
  return rating === null ? '—' : rating.toFixed(1);
}
