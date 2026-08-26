/**
 * Formatting shared by the mission and monthly reports.
 *
 * Every figure the reports print is computed from event timestamps — nothing
 * is manually entered — so durations are the reports' native unit and deserve
 * one canonical rendering: `2d 4h`, `3h 05m`, `45 min`.
 */

export const MIN = 60 * 1000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

/** `null`-tolerant: a stage that hasn't happened yet renders as an em dash. */
export function formatDuration(
  ms: number | null | undefined,
  { compact = false }: { compact?: boolean } = {},
): string {
  if (ms == null || Number.isNaN(ms)) return '—';
  const sign = ms < 0 ? '-' : '';
  const abs = Math.abs(ms);
  const d = Math.floor(abs / DAY);
  const h = Math.floor((abs % DAY) / HOUR);
  const m = Math.round((abs % HOUR) / MIN);
  if (d > 0) return `${sign}${d}d ${h}h${compact ? '' : ` ${m}m`}`;
  if (h > 0) return `${sign}${h}h ${String(m).padStart(2, '0')}m`;
  return `${sign}${m} min`;
}

/** Hours (the BI fact unit) → the same canonical duration string. */
export function formatHoursDuration(
  hours: number | null | undefined,
  options: { compact?: boolean } = {},
): string {
  if (hours == null || Number.isNaN(hours)) return '—';
  return formatDuration(hours * HOUR, options);
}

export function toMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}
