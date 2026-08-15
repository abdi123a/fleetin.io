/**
 * Finance display shapes. All figures are whole DJF (zero-decimal currency).
 *
 * Direction discipline, module-wide: money OUT always renders with an
 * explicit − and the accent (orange) family; money IN with + and the brand
 * teal. The sign is part of the format so a colour-blind reader — or a
 * grayscale printout — still can't confuse the two.
 */

import { formatNumber } from '@/utils';

export const DJF = 'DJF';

/** "1,284,500 DJF" — table money, full digits. */
export function fmtDjf(value: number): string {
  const sign = value < 0 ? '−' : '';
  return `${sign}${formatNumber(Math.abs(value), { maximumFractionDigits: 0 })} ${DJF}`;
}

/** "1,284,500" — for columns that head their own currency. */
export function fmtDjfPlain(value: number): string {
  const sign = value < 0 ? '−' : '';
  return `${sign}${formatNumber(Math.abs(value), { maximumFractionDigits: 0 })}`;
}

/** "+420,000 DJF" / "−1,284,500 DJF" — when the sign carries the message. */
export function fmtDjfSigned(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${formatNumber(Math.abs(value), { maximumFractionDigits: 0 })} ${DJF}`;
}

/** 1_284_000 -> "1.28M". Card-scale abbreviation, no currency mark. */
export function compact(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '−' : '';
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${sign}${(abs / 1_000).toFixed(0)}K`;
  return `${sign}${formatNumber(abs, { maximumFractionDigits: 0 })}`;
}

/** "7.52M DJF" — card money with its unit. */
export function compactDjf(value: number): string {
  return `${compact(value)} ${DJF}`;
}

export function pct(fraction: number, digits = 0): string {
  return `${(fraction * 100).toFixed(digits)}%`;
}

export function signedPct(fraction: number, digits = 1): string {
  const value = fraction * 100;
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${Math.abs(value).toFixed(digits)}%`;
}

/** "41.2 d" — days with their unit so they never read as a count. */
export function daysLabel(value: number, digits = 0): string {
  return `${value.toFixed(digits)} d`;
}

/** 93_600_000 ms -> "26h 00m" — the validation clock's face. */
export function clockLabel(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  const hoursPart = Math.floor(totalMinutes / 60);
  const minutesPart = totalMinutes % 60;
  return `${hoursPart}h ${String(minutesPart).padStart(2, '0')}m`;
}

/** "14 Aug 2026" — the date format both printed documents use. */
export function fmtDocDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * DJF has no subunit in practice; every other currency here uses two decimal
 * places. Mirrors `scaleForCurrency()` in the backend's `pricing.util.ts` so a
 * minor-units figure decodes the same way on both sides.
 */
export function scaleForCurrency(currency: string): number {
  return currency === 'FDJ' || currency === 'DJF' ? 0 : 2;
}

/**
 * A figure typed into a form ("1 250.50") to the integer the API wants.
 * Rounds rather than truncates — a half-centime typed by hand is a rounding
 * question, and `Math.trunc` would quietly lose money on every entry.
 */
export function toMinorUnits(amount: number, currency: string): number {
  return Math.round(amount * 10 ** scaleForCurrency(currency));
}

/** The inverse, for pre-filling a form from a stored minor-units figure. */
export function fromMinorUnits(amountMinor: string | number | bigint, currency: string): number {
  return Number(amountMinor) / 10 ** scaleForCurrency(currency);
}

/**
 * Real bank-account/ledger money — a `BigInt`-shaped minor-units amount with
 * its own currency, unlike the rest of this module's DJF-only, whole-unit
 * figures. "4,859,014 DJF" / "1,250.50 USD".
 */
export function formatMoneyMinorUnits(amountMinor: string | number | bigint, currency: string): string {
  const minor = typeof amountMinor === 'bigint' ? amountMinor : BigInt(Math.trunc(Number(amountMinor)));
  const negative = minor < 0n;
  const scale = scaleForCurrency(currency);
  const whole = Number(negative ? -minor : minor) / 10 ** scale;
  const body = formatNumber(whole, { minimumFractionDigits: scale, maximumFractionDigits: scale });
  return `${negative ? '−' : ''}${body} ${currency}`;
}

// ─── Amount in words ────────────────────────────────────────────────────────

/*
 * Lives here, not on the invoice page, because BOTH printed documents carry it
 * — the shipper's invoice and the transporter's payment voucher — and the
 * voucher is the one someone signs while holding cash.
 */

const ONES = [
  '', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen',
  'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function underThousand(value: number): string {
  if (value < 20) return ONES[value] ?? '';
  if (value < 100) {
    const rest = value % 10;
    return `${TENS[Math.floor(value / 10)]}${rest ? `-${ONES[rest]}` : ''}`;
  }
  const rest = value % 100;
  return `${ONES[Math.floor(value / 100)]} hundred${rest ? ` and ${underThousand(rest)}` : ''}`;
}

/**
 * The written total — the line that makes a document hard to alter after the
 * fact, which is exactly why paper invoices and receipts have always carried it.
 */
export function amountInWords(amount: number): string {
  if (amount === 0) return 'Zero Djiboutian francs only';
  const parts: string[] = [];
  let rest = Math.abs(Math.trunc(amount));

  const scales: [number, string][] = [
    [1_000_000_000, 'billion'],
    [1_000_000, 'million'],
    [1_000, 'thousand'],
  ];
  for (const [size, name] of scales) {
    if (rest >= size) {
      parts.push(`${underThousand(Math.floor(rest / size))} ${name}`);
      rest %= size;
    }
  }
  if (rest > 0) parts.push(underThousand(rest));

  const words = parts.join(' ').replace(/\s+/g, ' ').trim();
  return `${words.charAt(0).toUpperCase()}${words.slice(1)} Djiboutian francs only`;
}
