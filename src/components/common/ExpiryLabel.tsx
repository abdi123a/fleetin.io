import { AlertTriangle, Clock } from '@/design-system/icons';
import { toDateOnly } from '@/utils/format';
import { cn } from '@/utils';

/**
 * A paper's expiry date, graded by how much cover is left.
 *
 * Insurance, a licence, a registration — every one of them is a date whose only
 * interesting property is its distance from today, and a bare `2027-03-23` in a
 * column of forty makes the reader do that subtraction forty times. The colour
 * does it for them.
 *
 * ## The bands, and why these ones
 *
 * Set by the user on 2026-09-01: red once it has expired, yellow as it comes up,
 * green with more than two months to run, and a tighter yellow inside fifteen
 * days. Fifteen days is the point where renewing stops being paperwork and
 * starts being a truck that cannot legally load; two months is comfortable.
 *
 * | Cover left        | Band       | Reads as              |
 * |-------------------|------------|-----------------------|
 * | already gone      | `expired`  | solid red plate       |
 * | under 15 days     | `critical` | amber plate           |
 * | 15 days – 2 months| `soon`     | amber text            |
 * | over 2 months     | `valid`    | green text            |
 *
 * The two urgent bands share the amber-to-red run of the app's `--urgency-*`
 * scale, and they are told apart by **weight as well as hue**: `critical` and
 * `soon` are the same yellow, and only one of them wears a plate. That is
 * deliberate — this theme's `--urgency-watch-*` and `--urgency-critical-*`
 * resolve to nearly the same orange, so a four-band model built on hue alone
 * has two bands nobody can separate. It is also what makes the escalation
 * survive a monochrome print and a colour-blind reader: plain text, plain text
 * in a warmer ink, a plate, a filled plate.
 *
 * Replaces three near-identical private copies — one on the Vehicles page, one
 * on Drivers, one in `DriverProfile` — which all graded on a single 30-day
 * threshold and painted "plenty of time left" the same colour as an ordinary
 * cell. A fleet where nothing is green cannot show you what is amber.
 */

/** Inside this many days, a renewal is urgent rather than upcoming. */
export const EXPIRY_CRITICAL_DAYS = 15;

/** Beyond this, the cover is comfortable. Two months, per the user's rule. */
export const EXPIRY_SAFE_DAYS = 60;

export type ExpiryBand = 'expired' | 'critical' | 'soon' | 'valid' | 'unknown';

const DAY_MS = 86_400_000;

/**
 * Whole days of cover left. Negative once it has run out.
 *
 * Both sides are floored to LOCAL midnight before subtracting, so a
 * certificate expiring today reads as 0 days rather than as −1 because the
 * clock happens to say 16:30. "It expires today" and "it expired" are
 * different facts to the person deciding whether the truck can load.
 *
 * The date is built field by field rather than handed to `new Date(string)`,
 * which reads a bare `YYYY-MM-DD` as UTC midnight while the other side of the
 * subtraction is local. In Africa/Djibouti that is a three-hour skew, and it
 * only shows up at the boundaries — which is exactly where a grading like this
 * is worth anything.
 */
export function daysOfCover(date: string, now: Date = new Date()): number {
  const parts = /^(\d{4})-(\d{2})-(\d{2})/.exec((toDateOnly(date) ?? date).trim());
  if (!parts) return Number.NaN;
  const expiry = new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((expiry.getTime() - midnight.getTime()) / DAY_MS);
}

export function expiryBandOf(date: string | undefined, now: Date = new Date()): ExpiryBand {
  if (!date) return 'unknown';
  const days = daysOfCover(date, now);
  if (Number.isNaN(days)) return 'unknown';
  if (days < 0) return 'expired';
  if (days < EXPIRY_CRITICAL_DAYS) return 'critical';
  if (days <= EXPIRY_SAFE_DAYS) return 'soon';
  return 'valid';
}

const BAND_CLASS: Record<Exclude<ExpiryBand, 'unknown'>, string> = {
  /* The only filled plate on the scale. An expired certificate is not a
     warning, it is a truck that must not be dispatched. */
  expired:
    'rounded-md border border-urgency-overdue-border bg-urgency-overdue-bg px-1.5 py-0.5 font-bold text-urgency-overdue-fg',
  critical:
    'rounded-md border border-urgency-critical-border bg-urgency-critical-bg px-1.5 py-0.5 font-semibold text-urgency-critical-fg',
  soon: 'font-semibold text-urgency-watch-fg',
  valid: 'text-urgency-safe-fg',
};

/** What the hover says — the subtraction the colour is standing in for. */
function hint(band: ExpiryBand, days: number): string | undefined {
  if (band === 'unknown') return undefined;
  if (band === 'expired') {
    const late = Math.abs(days);
    return late === 0 ? 'Expires today' : `Expired ${late} day${late === 1 ? '' : 's'} ago`;
  }
  if (days === 0) return 'Expires today';
  return `${days} day${days === 1 ? '' : 's'} of cover left`;
}

export interface ExpiryLabelProps {
  date?: string;
  /** A caption above the date. Omitted in a table, where the column is named. */
  label?: string;
  className?: string;
}

export function ExpiryLabel({ date, label, className }: ExpiryLabelProps) {
  if (!date) return null;

  const band = expiryBandOf(date);
  const days = daysOfCover(date);
  /* The drivers endpoint trims its dates; the partners endpoint hands the same
     field over as a full ISO datetime. Trim here so the label reads the same
     whichever list the record was picked out of. */
  const shown = toDateOnly(date) ?? date;

  return (
    <div className={cn('text-2xs', className)}>
      {label ? <span className="block text-[10px] text-muted-foreground">{label}</span> : null}
      <span
        title={hint(band, days)}
        className={cn(
          'inline-flex items-center gap-1 tabular-nums',
          band === 'unknown' ? 'text-foreground' : BAND_CLASS[band],
        )}
      >
        {band === 'expired' && <AlertTriangle className="size-3 shrink-0" aria-hidden />}
        {band === 'critical' && <Clock className="size-3 shrink-0" aria-hidden />}
        {shown}
      </span>
    </div>
  );
}
