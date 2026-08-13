import { format, formatDistanceToNowStrict, isValid, parseISO } from 'date-fns';

/**
 * Presentation-layer formatters.
 *
 * These are intentionally domain-free: no shipment/vehicle/partner concepts
 * belong here. Module-specific formatting lives in that feature's own folder.
 */

/** Canonical date formats, so the same date never renders two ways. */
export const DATE_FORMATS = {
  date: 'dd MMM yyyy',
  dateShort: 'dd/MM/yyyy',
  dateTime: 'dd MMM yyyy, HH:mm',
  time: 'HH:mm',
  monthYear: 'MMM yyyy',
} as const;

export type DateFormat = keyof typeof DATE_FORMATS;

type DateInput = Date | string | number | null | undefined;

function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined) return null;
  const date = typeof value === 'string' ? parseISO(value) : new Date(value);
  return isValid(date) ? date : null;
}

/** Formats a date with one of the canonical formats, or `fallback` if unparseable. */
export function formatDate(
  value: DateInput,
  variant: DateFormat = 'date',
  fallback = '—',
): string {
  const date = toDate(value);
  return date ? format(date, DATE_FORMATS[variant]) : fallback;
}

/**
 * ISO datetime → plain `YYYY-MM-DD`, for fields the rest of the app treats as
 * a bare date (expiry dates, join dates) rather than a moment in time. Stays
 * trivially parseable by `new Date()` for downstream logic, unlike a fully
 * formatted display string — this is a normalisation, not a display formatter.
 */
export function toDateOnly(value: DateInput): string | undefined {
  const date = toDate(value);
  if (!date) return undefined;
  return date.toISOString().slice(0, 10);
}

/** Relative time, e.g. "3 hours ago". */
export function formatRelativeTime(value: DateInput, fallback = '—'): string {
  const date = toDate(value);
  return date ? `${formatDistanceToNowStrict(date)} ago` : fallback;
}

/** Locale-aware number formatting. */
export function formatNumber(
  value: number | null | undefined,
  options: Intl.NumberFormatOptions = {},
  locale = 'en-US',
  fallback = '—',
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return fallback;
  return new Intl.NumberFormat(locale, options).format(value);
}

/** Currency formatting; the currency code is always explicit at the call site. */
export function formatCurrency(
  value: number | null | undefined,
  currency = 'USD',
  locale = 'en-US',
  fallback = '—',
): string {
  return formatNumber(
    value,
    { style: 'currency', currency, maximumFractionDigits: 2 },
    locale,
    fallback,
  );
}

/** Compact byte sizes: 1536 -> "1.5 KB". */
export function formatFileSize(bytes: number | null | undefined, fallback = '—'): string {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return fallback;
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'] as const;
  const exponent = Math.min(
    Math.floor(Math.log(Math.abs(bytes)) / Math.log(1024)),
    units.length - 1,
  );
  const size = bytes / 1024 ** exponent;

  return `${size.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}
