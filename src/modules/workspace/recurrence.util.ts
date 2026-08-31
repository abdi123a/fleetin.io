import { WorkspaceRecurrenceFrequency } from '@prisma/client';

/**
 * When does a rule next come round?
 *
 * Pure, and deliberately date-only. "Every Monday" is a fact about a calendar,
 * not an instant: carrying a time through would make the schedule drift with
 * whatever clock the worker happened to run on, and a rule set up in the
 * evening would quietly slide a day.
 *
 * Everything here works in UTC on a midnight-normalised date, so a server
 * moving between summer and winter time cannot shift a due date.
 */

export interface RecurrenceRule {
  frequency: WorkspaceRecurrenceFrequency;
  /** Every N days / weeks / months. */
  interval: number;
  /** 0–6, Sunday first. Weekly only. */
  weekday?: number | null;
  /** 1–31. Monthly only. */
  dayOfMonth?: number | null;
}

/** Midnight UTC on the same calendar day. */
export function toDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/** Last day of the month `date` falls in. */
function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * The next occurrence strictly after `from`.
 *
 * `from` is normally the occurrence just generated, so "strictly after" is what
 * stops a rule minting the same day twice.
 */
export function nextOccurrence(rule: RecurrenceRule, from: Date): Date {
  const interval = Math.max(1, rule.interval || 1);
  const start = toDay(from);

  if (rule.frequency === WorkspaceRecurrenceFrequency.DAILY) {
    return addDays(start, interval);
  }

  if (rule.frequency === WorkspaceRecurrenceFrequency.WEEKLY) {
    /* No weekday named: keep the day of the week it already falls on. */
    const target = rule.weekday ?? start.getUTCDay();

    /*
     * Find the next named weekday STRICTLY after `start`, then add the
     * remaining whole weeks.
     *
     * The order matters. Stepping a full interval first and only then landing
     * on the weekday makes "every Monday" set up on a Tuesday skip the Monday
     * six days away and start a fortnight out — a rule that silently loses its
     * first occurrence. Landing first and stepping after keeps "every Monday"
     * meaning the next Monday, while "every 2 weeks" from a Monday still means
     * a fortnight rather than the next Monday.
     *
     * `|| 7` is what makes it strict: from a Monday, drift is 0, and returning
     * the same day would let a rule mint itself forever.
     */
    const drift = (target - start.getUTCDay() + 7) % 7 || 7;
    return addDays(start, drift + (interval - 1) * 7);
  }

  /* Monthly. The interesting case is a rule on the 31st: February has no 31st,
     and the choice is between skipping the month and clamping to its last day.
     Clamping is right — "review the books on the 31st" means the end of the
     month, and skipping would silently drop February and April entirely. */
  const wanted = rule.dayOfMonth ?? start.getUTCDate();
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth() + interval;
  const targetYear = year + Math.floor(month / 12);
  const targetMonth = ((month % 12) + 12) % 12;
  const day = Math.min(wanted, lastDayOfMonth(targetYear, targetMonth));
  return new Date(Date.UTC(targetYear, targetMonth, day));
}

/**
 * Catch up a rule whose `nextRunOn` is in the past, without minting one task
 * per missed day.
 *
 * A rule that has been idle for a fortnight should produce **the occurrence
 * that is due now** — one task saying "this is outstanding" — not fourteen.
 * Fourteen would bury the person it is assigned to and none of them would mean
 * anything on their own.
 *
 * Returns the occurrence to generate, plus where the rule should point next.
 */
export function resolveDueOccurrence(
  rule: RecurrenceRule,
  nextRunOn: Date,
  today: Date,
): { occurrenceOn: Date; nextRunOn: Date } | null {
  const due = toDay(nextRunOn);
  const now = toDay(today);
  if (due > now) return null;

  /* Walk forward to the last occurrence that is not in the future. That one is
     the live one; everything behind it is history nobody needs a task for. */
  let occurrence = due;
  let lookahead = nextOccurrence(rule, occurrence);
  /* Bounded: a rule idle for years should not spin. 500 steps covers a decade
     of weeklies, and anything beyond that is a broken rule, not a backlog. */
  for (let guard = 0; guard < 500 && lookahead <= now; guard += 1) {
    occurrence = lookahead;
    lookahead = nextOccurrence(rule, occurrence);
  }

  return { occurrenceOn: occurrence, nextRunOn: lookahead };
}
