import type { ComponentType, SVGProps } from 'react';

import {
  Banknote,
  CheckCircle,
  Clock,
  CreditCard,
  Fuel,
  House,
  Landmark,
  Monitor,
  Package,
  Phone,
  Plane,
  Receipt,
  Scale,
  ShieldCheck,
  Truck,
  Users,
  XCircle,
  Zap,
} from '@/design-system/icons';
import type { RecordStatusOption } from '@/components/common';
import type { ExpenseCategory, ExpenseFrequency, ExpenseStatus } from '@/features/finance';

/**
 * How the expense book reads on screen — the mirror of the backend's
 * `expense-catalog.ts`.
 *
 * The keys are shouted constants because a database column should be; every
 * one of them is turned into a word and a glyph exactly once, here, so the
 * list, the dialog and the tiles cannot describe the same cost differently.
 *
 * The glyphs do real work in a category column: fourteen labels of similar
 * length are hard to re-find after scrolling, and a fuel pump is not.
 */

export interface ExpenseCategoryOption {
  value: ExpenseCategory;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

export const EXPENSE_CATEGORY_OPTIONS: readonly ExpenseCategoryOption[] = [
  { value: 'SALARY', label: 'Salaries', icon: Users },
  { value: 'RENT', label: 'Rent', icon: House },
  { value: 'UTILITIES', label: 'Utilities', icon: Zap },
  { value: 'FUEL', label: 'Fuel', icon: Fuel },
  { value: 'VEHICLE', label: 'Vehicle upkeep', icon: Truck },
  { value: 'TELECOM', label: 'Phone & internet', icon: Phone },
  { value: 'TECHNOLOGY', label: 'Software & IT', icon: Monitor },
  { value: 'OFFICE', label: 'Office supplies', icon: Package },
  { value: 'TRAVEL', label: 'Travel', icon: Plane },
  { value: 'INSURANCE', label: 'Insurance', icon: ShieldCheck },
  { value: 'PROFESSIONAL', label: 'Legal & consulting', icon: Scale },
  { value: 'TAX', label: 'Taxes & levies', icon: Landmark },
  { value: 'BANK', label: 'Bank charges', icon: CreditCard },
  { value: 'OTHER', label: 'Other', icon: Receipt },
];

const CATEGORY_BY_KEY = new Map(EXPENSE_CATEGORY_OPTIONS.map((option) => [option.value, option]));

/** Never throws on an unknown key — a category the server grew and the client has not renders as itself. */
export function categoryOption(value: string): ExpenseCategoryOption {
  return (
    CATEGORY_BY_KEY.get(value as ExpenseCategory) ?? {
      value: value as ExpenseCategory,
      label: value,
      icon: Receipt,
    }
  );
}

/*
 * How it was paid has no vocabulary here on purpose. `ExpenseEntry.method`
 * exists and the API accepts it, but the form does not ask and no column
 * shows it — a person photographing a till slip knows they paid cash, and
 * making them say so is a field that buys nothing. The backend's
 * `EXPENSE_METHODS` is the list if a screen ever needs one.
 */

/* ─── Where the claim stands ───────────────────────────────────────────── */

/**
 * The four rungs, in the same five-tone grammar the directories and the
 * invoice list use — so a claim reads the way a bill does.
 *
 *   Submitted — filed, waiting on a desk   → **amber**, somebody's move
 *   Approved  — accepted; Fleetin owes it  → **blue**, out in the world
 *   Paid      — settled or reimbursed      → **green**
 *   Rejected  — refused, reason on the row → **red**
 *
 * Nothing is derived: unlike an invoice, an expense has no due date to fall
 * past, so the stored status is the whole truth.
 */
export const EXPENSE_STATUS_OPTIONS: ReadonlyArray<RecordStatusOption<ExpenseStatus>> = [
  { value: 'Submitted', label: 'Submitted', tone: 'waiting', icon: Clock },
  { value: 'Approved', label: 'Approved', tone: 'busy', icon: CheckCircle },
  { value: 'Paid', label: 'Paid', tone: 'ok', icon: Banknote },
  { value: 'Rejected', label: 'Rejected', tone: 'stopped', icon: XCircle },
];

export function expenseStatusOption(value: ExpenseStatus): RecordStatusOption<ExpenseStatus> {
  return (
    EXPENSE_STATUS_OPTIONS.find((option) => option.value === value) ?? {
      value,
      label: value,
      tone: 'waiting',
    }
  );
}

/* ─── How often it comes round ─────────────────────────────────────────── */

export const EXPENSE_FREQUENCY_OPTIONS: readonly {
  value: ExpenseFrequency;
  label: string;
  /** The noun a due date wears in a sentence — "every month". */
  every: string;
}[] = [
  { value: 'WEEKLY', label: 'Weekly', every: 'week' },
  { value: 'MONTHLY', label: 'Monthly', every: 'month' },
  { value: 'QUARTERLY', label: 'Quarterly', every: 'quarter' },
  { value: 'ANNUAL', label: 'Yearly', every: 'year' },
];

export function frequencyLabel(value: string): string {
  return EXPENSE_FREQUENCY_OPTIONS.find((option) => option.value === value)?.label ?? value;
}
