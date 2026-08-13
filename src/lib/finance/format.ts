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
