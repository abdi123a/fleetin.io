import type { DatePreset } from '@/features/shipper-bi/contracts';

/**
 * Period maths for the dashboard.
 *
 * **Everything here is UTC, deliberately.** A period is a calendar range
 * ("March"), a charge is an instant, and comparing the two through the
 * browser's local timezone means the same dashboard reports different totals in
 * Djibouti than in London — a charge straddling midnight lands in a different
 * month depending on who is looking. Day strings are therefore anchored to UTC
 * midnight on both sides, so the numbers are a property of the data rather than
 * of the viewer.
 *
 * Every function takes its clock explicitly; nothing reads `Date.now()`.
 */

export interface Period {
  /** YYYY-MM-DD, inclusive. */
  from: string;
  /** YYYY-MM-DD, inclusive. */
  to: string;
}

const MS_PER_DAY = 86_400_000;

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** Parse a YYYY-MM-DD day, or any ISO instant, to a `Date`. */
export function parseDay(value: string): Date {
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value);
}

/** The UTC calendar day an instant falls on. */
export function toDayString(value: Date | string): string {
  const date = typeof value === 'string' ? parseDay(value) : value;
  return date.toISOString().slice(0, 10);
}

const shiftDays = (date: Date, days: number) => new Date(date.getTime() + days * MS_PER_DAY);

const utcStartOfMonth = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));

const utcEndOfMonth = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));

const utcStartOfQuarter = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), Math.floor(date.getUTCMonth() / 3) * 3, 1));

const utcStartOfYear = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), 0, 1));

/** Resolve a preset to a concrete inclusive range. */
export function resolvePreset(preset: DatePreset, now: Date, custom?: Period): Period {
  const today = toDayString(now);
  switch (preset) {
    case 'last_7_days':
      return { from: toDayString(shiftDays(parseDay(today), -6)), to: today };
    case 'last_30_days':
      return { from: toDayString(shiftDays(parseDay(today), -29)), to: today };
    case 'last_90_days':
      return { from: toDayString(shiftDays(parseDay(today), -89)), to: today };
    case 'this_month':
      return { from: toDayString(utcStartOfMonth(now)), to: today };
    case 'last_month': {
      const previous = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
      return { from: toDayString(previous), to: toDayString(utcEndOfMonth(previous)) };
    }
    case 'this_quarter':
      return { from: toDayString(utcStartOfQuarter(now)), to: today };
    case 'year_to_date':
      return { from: toDayString(utcStartOfYear(now)), to: today };
    case 'custom':
      return custom ?? { from: toDayString(shiftDays(parseDay(today), -29)), to: today };
  }
}

export function periodLengthDays(period: Period): number {
  return Math.round(
    (parseDay(period.to).getTime() - parseDay(period.from).getTime()) / MS_PER_DAY,
  ) + 1;
}

/**
 * The window immediately preceding `period`, of identical length.
 *
 * Derived rather than stored: a comparison the user set weeks ago against a
 * range they have since changed is worse than no comparison, because it still
 * renders a confident-looking delta.
 */
export function previousPeriod(period: Period): Period {
  const length = periodLengthDays(period);
  return {
    from: toDayString(shiftDays(parseDay(period.from), -length)),
    to: toDayString(shiftDays(parseDay(period.to), -length)),
  };
}

/** Is this instant inside the inclusive day range? */
export function isWithin(period: Period, iso: string): boolean {
  const day = toDayString(iso);
  return day >= period.from && day <= period.to;
}

/**
 * How many days a charge window overlaps a period.
 *
 * Accessorials accrue per day, so a detention charge that starts in one month
 * and ends in the next belongs partly to each. Attributing the whole amount to
 * either end is how a cost trend grows a spike that never happened.
 */
export function overlapDays(period: Period, fromIso: string, toIso: string): number {
  const periodFrom = parseDay(period.from).getTime();
  // Exclusive upper bound: the period includes all of its final day.
  const periodTo = parseDay(period.to).getTime() + MS_PER_DAY;
  const start = Math.max(new Date(fromIso).getTime(), periodFrom);
  const end = Math.min(new Date(toIso).getTime(), periodTo);
  return end <= start ? 0 : (end - start) / MS_PER_DAY;
}

/** Every day in the period, oldest first. Buckets with no data still exist. */
export function eachDay(period: Period): string[] {
  const days: string[] = [];
  const end = parseDay(period.to).getTime();
  for (let cursor = parseDay(period.from); cursor.getTime() <= end; cursor = shiftDays(cursor, 1)) {
    days.push(toDayString(cursor));
  }
  return days;
}

export type Granularity = 'day' | 'week' | 'month';

/**
 * Pick a bucket size from the range length.
 *
 * Ninety daily points on a 400px-wide card is noise, and a quarter shown as
 * three monthly points hides the shape. The thresholds are where the reading
 * flips.
 */
export function chooseGranularity(period: Period): Granularity {
  const days = periodLengthDays(period);
  if (days <= 31) return 'day';
  if (days <= 120) return 'week';
  return 'month';
}

/** The bucket key an instant falls into, at the given granularity. */
export function bucketKey(iso: string, granularity: Granularity): string {
  const date = parseDay(iso);
  if (granularity === 'day') return toDayString(date);
  if (granularity === 'month') {
    return toDayString(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)));
  }
  // Weeks are keyed by their Monday, so the label is a real date not "W37".
  const weekday = (date.getUTCDay() + 6) % 7;
  return toDayString(shiftDays(date, -weekday));
}

/** Every bucket in the period, oldest first, including empty ones. */
export function eachBucket(period: Period, granularity: Granularity): string[] {
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const day of eachDay(period)) {
    const key = bucketKey(day, granularity);
    if (!seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  }
  return keys;
}

/** Short human label for a bucket key. */
export function bucketLabel(key: string, granularity: Granularity): string {
  const date = parseDay(key);
  const month = MONTH_NAMES[date.getUTCMonth()] ?? '';
  if (granularity === 'month') return `${month} ${date.getUTCFullYear()}`;
  if (granularity === 'week') return `w/c ${date.getUTCDate()} ${month}`;
  return `${date.getUTCDate()} ${month}`;
}

export function minutesBetween(fromIso: string, toIso: string): number {
  return (new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60_000;
}

export function hoursBetween(fromIso: string, toIso: string): number {
  return minutesBetween(fromIso, toIso) / 60;
}

export function daysBetween(fromIso: string, toIso: string): number {
  return minutesBetween(fromIso, toIso) / (60 * 24);
}
