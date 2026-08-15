import type { EmployeeStatus, LeaveStatus, PeriodStatus } from '@/features/hr/api/hrService';
import type { PillTone } from '@/pages/finance/components/kit';

/**
 * HR-side formatting and tone mapping.
 *
 * Money reuses `@/lib/finance` — payroll is DJF like the rest of the system
 * and a second currency formatter would drift from it. What lives here is
 * only what payroll needs and finance does not: the French month labels the
 * documents use, and the status→tone maps.
 */

const MONTHS_FR = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
];

export function monthLabelFr(month: number, year: number): string {
  return `${MONTHS_FR[month - 1]} ${year}`;
}

export function shortMonthLabel(key: string): string {
  const [year = '', month = ''] = key.split('-');
  return `${(MONTHS_FR[Number(month) - 1] ?? '').slice(0, 3)} ${year.slice(-2)}`;
}

/** `dd/mm/yyyy`, read off the UTC calendar so a date never shifts a day. */
export function frDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return [
    String(date.getUTCDate()).padStart(2, '0'),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    date.getUTCFullYear(),
  ].join('/');
}

/** Payroll figures are filed to two decimals, not rounded to the franc. */
export function money2(value: number | undefined | null): string {
  if (value === undefined || value === null) return '—';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function days(value: number): string {
  return `${value.toFixed(1)} j`;
}

/*
 * Status tones.
 *
 * PAID and APPROVED both read as "done" but are not the same state, so they
 * differ by word and not only by colour — the pill always carries its label.
 */
export const PERIOD_TONE: Record<PeriodStatus, PillTone> = {
  DRAFT: 'neutral',
  CALCULATED: 'blue',
  APPROVED: 'teal',
  PAID: 'teal',
};

export const PERIOD_LABEL: Record<PeriodStatus, string> = {
  DRAFT: 'Draft',
  CALCULATED: 'Calculated',
  APPROVED: 'Approved',
  PAID: 'Paid',
};

export const EMPLOYEE_TONE: Record<EmployeeStatus, PillTone> = {
  ACTIVE: 'teal',
  ON_LEAVE: 'blue',
  SUSPENDED: 'amber',
  TERMINATED: 'neutral',
};

export const EMPLOYEE_LABEL: Record<EmployeeStatus, string> = {
  ACTIVE: 'Active',
  ON_LEAVE: 'On leave',
  SUSPENDED: 'Suspended',
  TERMINATED: 'Terminated',
};

export const LEAVE_TONE: Record<LeaveStatus, PillTone> = {
  REQUESTED: 'amber',
  APPROVED: 'teal',
  REJECTED: 'red',
  CANCELLED: 'neutral',
};

/** Nearer expiry reads hotter. Past due is the only red. */
export function expiryTone(daysUntil: number): PillTone {
  if (daysUntil < 0) return 'red';
  if (daysUntil <= 30) return 'amber';
  if (daysUntil <= 60) return 'orange';
  return 'neutral';
}

export function expiryLabel(daysUntil: number): string {
  if (daysUntil < 0) return `${Math.abs(daysUntil)} d overdue`;
  if (daysUntil === 0) return 'Today';
  return `${daysUntil} d`;
}

export const DOCUMENT_CATEGORY_LABEL: Record<string, string> = {
  CV: 'CV',
  ID_CARD: 'ID card',
  PASSPORT: 'Passport',
  CONTRACT: 'Contract',
  DIPLOMA: 'Diploma',
  MEDICAL_CERT: 'Medical certificate',
  DRIVING_LICENCE: 'Driving licence',
  CNSS_CARD: 'CNSS card',
  WARNING_LETTER: 'Warning letter',
  GENERATED_DOCUMENT: 'Generated document',
  OTHER: 'Other',
};
