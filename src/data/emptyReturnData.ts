/**
 * Seed data and display vocabulary for the empty-return module.
 *
 * Two decisions worth stating, because both look arbitrary from the outside.
 *
 * **Timestamps are relative to load.** Every record is expressed as an offset in
 * hours from `EMPTY_RETURN_EPOCH`, captured once when this module is imported.
 * A demo whose deadlines are absolute dates rots the week after it is written —
 * this one is always exactly six hours from a critical return, whenever you open
 * it. It also means the risk spread is a contract, not an accident: one
 * protected, one in flight, one ready, one overdue, one at risk under a
 * mandatory standalone, one on watch, two unloading (one with no deadline at
 * all, so it has no risk to read).
 *
 * **The colour maps live here, not in the components.** Six statuses and six
 * risk levels each need a background, a text colour and a border, and the pair
 * of them collide in hue (`preparing` and `critical` are both accent). The
 * mitigation is shape, not colour — the risk pill is `rounded-full` with a Timer
 * icon, the status chip is `rounded-md` with a dot — and keeping both class
 * strings side by side in one table is the only way to keep that legible when
 * someone edits one of them.
 */

import { INITIAL_PARTNERS } from '@/data/partnerData';
import { MOCK_SHIPPERS } from '@/data/shippersData';
import type {
  DeadlineVerification,
  DeadlineVerificationMeta,
  EmptyReturnFilterOption,
  EmptyReturnFilters,
  EmptyReturnRiskFilter,
  EmptyReturnStatus,
  EmptyReturnStatusFilter,
  EmptyReturnStatusMeta,
  ReturnRiskLevel,
  ReturnRiskMeta,
} from '@/types/emptyReturn';

/* ---------------------------------------------------------------------------
 * Clock constants
 * ------------------------------------------------------------------------- */

/** One hour in milliseconds. Every offset below is a multiple of it. */
export const HOUR_MS = 3_600_000;

/** The frozen "boot" instant every seeded timestamp is expressed against. */
export const EMPTY_RETURN_EPOCH = Date.now();

/** How often the module re-reads the wall clock to recompute risk and slack. */
export const EMPTY_RETURN_TICK_MS = 30_000;

/** How long a confirmation toast stays on screen. */
export const EMPTY_RETURN_TOAST_MS = 4_200;

/** Slack below this reads `watch`. Configurable in copy, constant in code. */
export const WATCH_THRESHOLD_MS = 12 * HOUR_MS;

/** Slack below this reads `critical`. */
export const CRITICAL_THRESHOLD_MS = 6 * HOUR_MS;

/* ---------------------------------------------------------------------------
 * Fixed vocabulary
 * ------------------------------------------------------------------------- */

/** The single hub every empty goes back to and every full load is collected from. */
export const EMPTY_RETURN_HUB = 'Doraleh Container Terminal — Main Return Hub (configurable)';

/**
 * The three exception strings, as constants.
 *
 * The standalone KPI and the standalone transporter counter both test exact
 * string equality against `standaloneRequired`, so the literal must not drift.
 * Mirrors the one real value the backend ever sets
 * (`EmptyReturnsService.markStandalone`) — the other two are display-only
 * classifications this frontend may still derive from a missing deadline.
 */
export const EMPTY_RETURN_EXCEPTIONS = {
  standaloneRequired: 'Standalone empty return required',
  deadlineExceeded: 'Deadline exceeded',
  deadlineMissing: 'Deadline missing',
} as const;

/* ---------------------------------------------------------------------------
 * Display metadata
 * ------------------------------------------------------------------------- */

/**
 * Status chips. Deliberately de-saturated: neutral outline + coloured 6px dot.
 * Urgency owns saturated colour on a row — lifecycle must not compete.
 *
 * Dot hues: muted for ready states, secondary (accent) for in-progress,
 * success for completed.
 */
export const EMPTY_RETURN_STATUS_META: Record<EmptyReturnStatus, EmptyReturnStatusMeta> = {
  unloading: {
    label: 'Unloading',
    dotClassName: 'bg-muted-foreground',
    chipClassName: 'bg-card text-muted-foreground border-border',
  },
  empty_ready: {
    label: 'Empty Ready',
    dotClassName: 'bg-muted-foreground',
    chipClassName: 'bg-card text-muted-foreground border-border',
  },
  preparing: {
    label: 'Preparing Full Load',
    dotClassName: 'bg-accent',
    chipClassName: 'bg-card text-muted-foreground border-border',
  },
  ready: {
    label: 'Ready to Dispatch',
    dotClassName: 'bg-muted-foreground',
    chipClassName: 'bg-card text-muted-foreground border-border',
  },
  in_progress: {
    label: 'Cycle In Progress',
    dotClassName: 'bg-accent',
    chipClassName: 'bg-card text-muted-foreground border-border',
  },
  completed: {
    label: 'Cycle Completed',
    dotClassName: 'bg-success',
    chipClassName: 'bg-card text-muted-foreground border-border',
  },
};

/** Declaration order — drives the status `<Select>` and any legend. */
export const EMPTY_RETURN_STATUS_ORDER: readonly EmptyReturnStatus[] = [
  'unloading',
  'empty_ready',
  'preparing',
  'ready',
  'in_progress',
  'completed',
];

/**
 * Risk / urgency pills — consume the `--urgency-*` semantic tokens.
 *
 * Only `overdue` is solid-saturated. Everything else is a tinted surface so
 * one saturated colour per row remains true when lifecycle sits beside it.
 */
export const RETURN_RISK_META: Record<ReturnRiskLevel, ReturnRiskMeta> = {
  safe: {
    label: 'Safe',
    className: 'bg-urgency-safe-bg text-urgency-safe-fg border-transparent',
  },
  watch: {
    label: 'Watch',
    className: 'bg-urgency-watch-bg text-urgency-watch-fg border-transparent',
  },
  critical: {
    label: 'Critical',
    className: 'bg-urgency-critical-bg text-urgency-critical-fg border-urgency-critical-border',
  },
  at_risk: {
    label: 'At risk',
    className: 'bg-urgency-at-risk-bg text-urgency-at-risk-fg border-urgency-at-risk-border',
  },
  overdue: {
    label: 'Overdue',
    className:
      'bg-urgency-overdue-bg text-urgency-overdue-fg border-urgency-overdue-border animate-pulse motion-reduce:animate-none',
  },
  protected: {
    label: 'Protected',
    className: 'bg-urgency-protected-bg text-urgency-protected-fg border-transparent',
  },
};

/** Declaration order — the dashboard legend renders all six in this sequence. */
export const RETURN_RISK_ORDER: readonly ReturnRiskLevel[] = [
  'safe',
  'watch',
  'critical',
  'at_risk',
  'overdue',
  'protected',
];

export const DEADLINE_VERIFICATION_META: Record<DeadlineVerification, DeadlineVerificationMeta> = {
  verified: { label: 'Deadline verified', className: 'text-success' },
  // `--warning` is amber-500: a 1.8:1 fill colour, not a type colour. The label
  // is 11px on a white card, so it takes the `-subtle-foreground` pair like
  // every other amber string in the app.
  unverified: { label: 'Deadline not verified', className: 'text-warning-subtle-foreground' },
  missing: { label: 'Deadline missing', className: 'text-destructive' },
};

/* ---------------------------------------------------------------------------
 * Filter vocabulary
 * ------------------------------------------------------------------------- */

export const DEFAULT_EMPTY_RETURN_FILTERS: EmptyReturnFilters = {
  q: '',
  status: 'all',
  risk: 'all',
};

/** `Assigned` sits directly under `All statuses`, mirroring `Critical + At risk` on risk. */
export const EMPTY_RETURN_STATUS_FILTER_OPTIONS: readonly EmptyReturnFilterOption<EmptyReturnStatusFilter>[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'assigned', label: 'Assigned (Ready + In Progress)' },
  ...EMPTY_RETURN_STATUS_ORDER.map((status) => ({
    value: status as EmptyReturnStatusFilter,
    label: EMPTY_RETURN_STATUS_META[status].label,
  })),
];

/** Deliberately offers no standalone `Critical` or `At risk` — `crit` bundles both. */
export const EMPTY_RETURN_RISK_FILTER_OPTIONS: readonly EmptyReturnFilterOption<EmptyReturnRiskFilter>[] = [
  { value: 'all', label: 'All risks' },
  { value: 'crit', label: 'Critical + At risk' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'watch', label: 'Watch' },
  { value: 'safe', label: 'Safe' },
  { value: 'protected', label: 'Protected' },
];

/* ---------------------------------------------------------------------------
 * Company identity
 * ------------------------------------------------------------------------- */

/**
 * The logo behind every company name this module renders.
 *
 * Derived from the shipper and partner records rather than copied out of them.
 * Every company in this module is a real FLEETIN account, so the mark it shows
 * here has to be the mark `/shippers` and `/partners` show — a hand-kept second
 * table would go stale the first time somebody changes a logo on the account
 * page, and it would go stale silently. Al-Baraka Transport Co. carries no
 * `logoUrl` in the system at all, which is why the lookup returns `undefined`
 * rather than a placeholder: the avatar falls back to its initials, exactly as
 * it does on the partners page.
 */
export const EMPTY_RETURN_COMPANY_LOGOS: Record<string, string> = Object.fromEntries(
  [...MOCK_SHIPPERS, ...INITIAL_PARTNERS]
    .map((company) => [company.companyLegalName, company.logoUrl] as const)
    .filter((entry): entry is readonly [string, string] => Boolean(entry[1])),
);

export function getEmptyReturnCompanyLogo(name: string | null | undefined): string | undefined {
  if (!name) return undefined;
  return EMPTY_RETURN_COMPANY_LOGOS[name];
}

/** Two-letter mark for a company with no logo. `Al-Baraka Transport Co.` -> `AT`. */
export function companyInitials(name: string | null | undefined): string {
  if (!name) return 'C';
  const letters = name
    .split(/[\s/-]+/)
    .map((part) => part.replace(/[^A-Za-z]/g, '').charAt(0))
    .filter(Boolean);
  const initials = letters.slice(0, 2).join('').toUpperCase();
  return initials || name.charAt(0).toUpperCase() || 'C';
}
