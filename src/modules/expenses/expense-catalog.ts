/**
 * The closed vocabularies the expense book speaks.
 *
 * Closed on purpose. A free-text category column is a category column that
 * holds "fuel", "Fuel", "diesel", "gasoil" and "carburant" within a month, and
 * every question anybody asks of this table — what do we spend on X, is X
 * going up — is a question about grouping. The list is short enough to fit in
 * one select and wide enough that nothing real has to go under `OTHER`.
 *
 * Shared with the frontend by hand, not by import (separate deployables). The
 * mirror lives at `src/pages/finance/expenseCatalog.ts`; a value added here
 * and not there renders as its own raw key, which is ugly but never wrong.
 */

/** What the money was spent on. */
export const EXPENSE_CATEGORIES = [
  'SALARY',
  'RENT',
  'UTILITIES',
  'FUEL',
  'VEHICLE',
  'TELECOM',
  'TECHNOLOGY',
  'OFFICE',
  'TRAVEL',
  'INSURANCE',
  'PROFESSIONAL',
  'TAX',
  'BANK',
  'OTHER',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/** How the money left the company. */
export const EXPENSE_METHODS = [
  'CASH',
  'BANK_TRANSFER',
  'MOBILE_MONEY',
  'CARD',
  'PETTY_CASH',
  'CHEQUE',
] as const;
export type ExpenseMethod = (typeof EXPENSE_METHODS)[number];

/**
 * The ladder, and it only runs one way.
 *
 *   Submitted — filed with its receipt, waiting on a desk
 *   Approved  — accepted as a real cost; Fleetin now owes it
 *   Paid      — settled with the supplier, or reimbursed to the colleague
 *   Rejected  — refused, with the reason on the row
 *
 * `Rejected` is terminal rather than a return to `Submitted`: a claim sent
 * back would lose the reason it was sent back for. Re-file it.
 */
export const EXPENSE_STATUSES = ['Submitted', 'Approved', 'Paid', 'Rejected'] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

/** How often a standing obligation comes round. */
export const EXPENSE_FREQUENCIES = ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL'] as const;
export type ExpenseFrequency = (typeof EXPENSE_FREQUENCIES)[number];

/**
 * The next due date, one period on.
 *
 * Calendar arithmetic rather than a fixed number of days: a monthly rent due
 * on the 31st is due on the 30th in September and the 28th in February, and
 * adding 30 days would walk it backwards through the month until it fell off
 * the start. `Date` clamps a month overflow into the FOLLOWING month — 31
 * January plus one becomes 3 March — so the day is pinned back to the last of
 * the target month instead.
 *
 * **UTC throughout, deliberately.** A due date is stored at midnight UTC, and
 * the local-time getters read that as the previous day anywhere west of
 * Greenwich: `getDate()` on a 1 September obligation would answer 31, and the
 * whole schedule would shift by a month on a server that happened to be
 * deployed in New York. Nothing here is a wall-clock time, so nothing here
 * uses a wall clock.
 */
export function advanceDueDate(from: Date, frequency: ExpenseFrequency): Date {
  switch (frequency) {
    case 'WEEKLY': {
      const next = new Date(from);
      next.setUTCDate(next.getUTCDate() + 7);
      return next;
    }
    case 'MONTHLY':
      return addMonths(from, 1);
    case 'QUARTERLY':
      return addMonths(from, 3);
    case 'ANNUAL':
      return addMonths(from, 12);
  }
}

function addMonths(from: Date, months: number): Date {
  const day = from.getUTCDate();
  const target = new Date(from);
  /* To the 1st first: without it, adding a month to the 31st overflows and
     the clamp below would be measuring the wrong month. */
  target.setUTCDate(1);
  target.setUTCMonth(target.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target;
}

/**
 * Which period a posted entry covers — `2026-09` for a monthly, `2026-W36`
 * for a weekly.
 *
 * This is the key that makes posting idempotent: September's rent is one row
 * whether the button is pressed once or five times, because the pair
 * (template, period) is checked before the entry is written.
 */
export function periodLabelFor(due: Date, frequency: ExpenseFrequency): string {
  const year = due.getUTCFullYear();
  if (frequency === 'WEEKLY') {
    /* ISO week, so a period never spans two labels and the first days of
       January belong to the week that owns them rather than to week 0. */
    const probe = new Date(Date.UTC(year, due.getUTCMonth(), due.getUTCDate()));
    const dayNumber = probe.getUTCDay() || 7;
    probe.setUTCDate(probe.getUTCDate() + 4 - dayNumber);
    const yearStart = new Date(Date.UTC(probe.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((probe.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
    return `${probe.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
  }
  if (frequency === 'ANNUAL') return String(year);
  return `${year}-${String(due.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * What one standing obligation costs per month, whatever its own rhythm.
 *
 * The only figure that lets a weekly cleaner, a monthly rent and an annual
 * insurance premium be added together — and "what do we owe every month" is
 * the single question the recurring book exists to answer. 52/12 rather than
 * 4, because four weeks is not a month and the error compounds to a month's
 * cleaning a year.
 */
export function monthlyEquivalent(amount: bigint, frequency: ExpenseFrequency): number {
  const value = Number(amount);
  switch (frequency) {
    case 'WEEKLY':
      return (value * 52) / 12;
    case 'MONTHLY':
      return value;
    case 'QUARTERLY':
      return value / 3;
    case 'ANNUAL':
      return value / 12;
  }
}
