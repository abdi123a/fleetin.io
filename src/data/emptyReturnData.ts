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
  EmptyReturnRecord,
  EmptyReturnRiskFilter,
  EmptyReturnStatus,
  EmptyReturnStatusFilter,
  EmptyReturnStatusMeta,
  FullLoadMission,
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

/** Auto-assigned when a cycle is dispatched with no truck on the record. */
export const DISPATCH_FALLBACK_TRUCK = 'TRK-509';

/**
 * The three exception strings, as constants.
 *
 * The standalone KPI and the standalone transporter counter both test exact
 * string equality against `standaloneRequired`, so the literal must not drift.
 */
export const EMPTY_RETURN_EXCEPTIONS = {
  standaloneRequired: 'Standalone empty return required',
  deadlineExceeded: 'Deadline exceeded',
  deadlineMissing: 'Deadline missing',
} as const;

export const MILESTONE_COUNT = 16;
export const CHECKLIST_COUNT = 16;

/** Milestone 11 — the moment the empty is physically back and risk locks to `protected`. */
export const RETURN_MILESTONE = 11;

/** The 16 milestones, in order. Index `i` is complete when `i < record.milestone`. */
export const EMPTY_RETURN_MILESTONES: readonly string[] = [
  'Previous full load delivered',
  'Unloading started',
  'Empty ready',
  'Full load mission selected',
  'Booking confirmed',
  'Documents verified',
  'Cycle assigned',
  'Truck dispatched',
  'Empty collected',
  'Arrived at hub',
  'Empty returned',
  'Return proof uploaded',
  'New full load collected',
  'Pickup proof uploaded',
  'New full load delivered',
  'Cycle completed',
];

/** The 16 preparation requirements, index-aligned with `record.checklist`. */
export const EMPTY_RETURN_CHECKLIST: readonly string[] = [
  'Full load mission selected',
  'Same Location ID confirmed',
  'Same transporter confirmed',
  'Truck / chassis compatible',
  'Return deadline captured',
  'Deadline risk acceptable',
  'Return authorisation ready',
  'Return reference ready',
  'New full load booking confirmed',
  'Delivery Order uploaded',
  'Full container number confirmed',
  'Container type confirmed',
  'Full load release confirmed',
  'Pickup window confirmed',
  'Port / terminal docs uploaded',
  'Transporter notified & truck assigned',
];

/** `noUncheckedIndexedAccess` makes every literal lookup a union — this absorbs it. */
export function milestoneLabel(index: number): string {
  return EMPTY_RETURN_MILESTONES[index] ?? '';
}

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

/* ---------------------------------------------------------------------------
 * Seed records
 * ------------------------------------------------------------------------- */

const allChecked = (): boolean[] => Array<boolean>(CHECKLIST_COUNT).fill(true);
const noneChecked = (): boolean[] => Array<boolean>(CHECKLIST_COUNT).fill(false);

/**
 * Seed records covering the whole risk scale, plus extra empty-ready boxes for
 * dual-transaction matching demos.
 *
 * ER-101 is the finished cycle that will never read anything but `Protected`;
 * ER-110 is the box whose deadline went past two shifts ago and is still out;
 * ER-111 has no deadline at all, which is what a spawned record looks like
 * before anyone captures one — it sorts last and shows no risk, permanently.
 */
export const INITIAL_EMPTY_RETURNS: EmptyReturnRecord[] = [
  {
    id: 'ERT-00101',
    container: 'TCLU1111111',
    type: '40HC',
    line: 'Maersk',
    client: 'AMINA FZCO',
    locationId: 'LOC-00001',
    locationName: 'Boulaos Industrial Yard',
    transporter: 'Red Sea Express Ltd',
    truck: 'TRK-401',
    emptyReadyAt: EMPTY_RETURN_EPOCH - 96 * HOUR_MS,
    deadline: EMPTY_RETURN_EPOCH - 60 * HOUR_MS,
    deadlineStatus: 'verified',
    predictedGateIn: EMPTY_RETURN_EPOCH - 82 * HOUR_MS,
    returnedAt: EMPTY_RETURN_EPOCH - 81 * HOUR_MS,
    status: 'completed',
    chainId: 'CHN-00001',
    cycleId: 'CYC-00001',
    seq: 1,
    nextFull: { container: 'MSKU2222222', type: '40HC' },
    milestone: 16,
    checklist: allChecked(),
    exception: null,
  },
  {
    id: 'ERT-00105',
    container: 'MSKU2222222',
    type: '40HC',
    line: 'Maersk',
    client: 'AMINA FZCO',
    locationId: 'LOC-00001',
    locationName: 'Boulaos Industrial Yard',
    transporter: 'Red Sea Express Ltd',
    truck: 'TRK-403',
    emptyReadyAt: EMPTY_RETURN_EPOCH - 20 * HOUR_MS,
    deadline: EMPTY_RETURN_EPOCH + 30 * HOUR_MS,
    deadlineStatus: 'verified',
    predictedGateIn: EMPTY_RETURN_EPOCH - 2.5 * HOUR_MS,
    returnedAt: EMPTY_RETURN_EPOCH - 2 * HOUR_MS,
    status: 'in_progress',
    chainId: 'CHN-00001',
    cycleId: 'CYC-00002',
    seq: 2,
    nextFull: { container: 'CMAU3333333', type: '40HC' },
    milestone: 12,
    checklist: allChecked(),
    exception: null,
  },
  {
    id: 'ERT-00106',
    container: 'MSCU4433221',
    type: '20GP',
    line: 'MSC',
    client: 'Al-Baraka Logistics Ltd',
    locationId: 'LOC-00002',
    locationName: 'Djibouti Free Zone — Warehouse Block B-12',
    transporter: 'Horn Transit Solutions',
    truck: null,
    emptyReadyAt: EMPTY_RETURN_EPOCH - 3 * HOUR_MS,
    deadline: EMPTY_RETURN_EPOCH + 14 * HOUR_MS,
    deadlineStatus: 'verified',
    predictedGateIn: EMPTY_RETURN_EPOCH + 4 * HOUR_MS,
    returnedAt: null,
    status: 'empty_ready',
    chainId: null,
    cycleId: null,
    seq: null,
    nextFull: null,
    milestone: 3,
    checklist: noneChecked(),
    exception: null,
  },
  {
    id: 'ERT-00107',
    container: 'CMAU9988776',
    type: '40HC',
    line: 'CMA CGM',
    client: 'Red Sea Cargo Group',
    locationId: 'LOC-00003',
    locationName: 'PK12 Dry Port Yard',
    transporter: 'Red Sea Express Ltd',
    truck: null,
    emptyReadyAt: null,
    deadline: EMPTY_RETURN_EPOCH + 70 * HOUR_MS,
    deadlineStatus: 'unverified',
    predictedGateIn: EMPTY_RETURN_EPOCH + 12 * HOUR_MS,
    returnedAt: null,
    status: 'unloading',
    chainId: null,
    cycleId: null,
    seq: null,
    nextFull: null,
    milestone: 2,
    checklist: noneChecked(),
    exception: null,
  },
  {
    id: 'ERT-00108',
    container: 'HLXU1212121',
    type: '40HC',
    line: 'Hapag-Lloyd',
    client: 'Al-Baraka Logistics Ltd',
    locationId: 'LOC-00002',
    locationName: 'Djibouti Free Zone — Warehouse Block B-12',
    transporter: 'Horn Transit Solutions',
    truck: null,
    emptyReadyAt: EMPTY_RETURN_EPOCH - 10 * HOUR_MS,
    deadline: EMPTY_RETURN_EPOCH + 5 * HOUR_MS,
    deadlineStatus: 'verified',
    predictedGateIn: EMPTY_RETURN_EPOCH + 6.5 * HOUR_MS,
    returnedAt: null,
    status: 'empty_ready',
    chainId: null,
    cycleId: null,
    seq: null,
    nextFull: null,
    milestone: 3,
    checklist: noneChecked(),
    exception: EMPTY_RETURN_EXCEPTIONS.standaloneRequired,
  },
  {
    id: 'ERT-00109',
    container: 'MSKU7070707',
    type: '20GP',
    line: 'Maersk',
    client: 'Horn Freight Express',
    locationId: 'LOC-00004',
    locationName: 'Ali Sabieh Logistics Hub',
    transporter: 'Al-Baraka Transport Co.',
    truck: 'TRK-601',
    emptyReadyAt: EMPTY_RETURN_EPOCH - 8 * HOUR_MS,
    deadline: EMPTY_RETURN_EPOCH + 5.5 * HOUR_MS,
    deadlineStatus: 'verified',
    predictedGateIn: EMPTY_RETURN_EPOCH + 1.5 * HOUR_MS,
    returnedAt: null,
    status: 'ready',
    chainId: 'CHN-00002',
    cycleId: 'CYC-00004',
    seq: 1,
    nextFull: { container: 'ONEU5544332', type: '20GP' },
    milestone: 7,
    checklist: allChecked(),
    exception: null,
  },
  {
    id: 'ERT-00110',
    container: 'ONEU3434343',
    type: '40HC',
    line: 'ONE',
    client: 'AMINA FZCO',
    locationId: 'LOC-00001',
    locationName: 'Boulaos Industrial Yard',
    transporter: 'Al-Baraka Transport Co.',
    truck: null,
    emptyReadyAt: EMPTY_RETURN_EPOCH - 30 * HOUR_MS,
    deadline: EMPTY_RETURN_EPOCH - 7 * HOUR_MS,
    deadlineStatus: 'verified',
    predictedGateIn: EMPTY_RETURN_EPOCH + 3 * HOUR_MS,
    returnedAt: null,
    status: 'empty_ready',
    chainId: null,
    cycleId: null,
    seq: null,
    nextFull: null,
    milestone: 3,
    checklist: noneChecked(),
    exception: EMPTY_RETURN_EXCEPTIONS.deadlineExceeded,
  },
  {
    id: 'ERT-00111',
    container: 'MSCU6161616',
    type: '20GP',
    line: 'MSC',
    client: 'Red Sea Cargo Group',
    locationId: 'LOC-00003',
    locationName: 'PK12 Dry Port Yard',
    transporter: 'Horn Transit Solutions',
    truck: null,
    emptyReadyAt: null,
    deadline: null,
    deadlineStatus: 'missing',
    predictedGateIn: EMPTY_RETURN_EPOCH + 20 * HOUR_MS,
    returnedAt: null,
    status: 'unloading',
    chainId: null,
    cycleId: null,
    seq: null,
    nextFull: null,
    milestone: 2,
    checklist: noneChecked(),
    exception: EMPTY_RETURN_EXCEPTIONS.deadlineMissing,
  },
  {
    id: 'ERT-00112',
    container: 'TCLU5544332',
    type: '40HC',
    line: 'Maersk',
    client: 'AMINA FZCO',
    locationId: 'LOC-00002',
    locationName: 'Djibouti Free Zone — Warehouse Block B-12',
    transporter: 'Horn Transit Solutions',
    truck: null,
    emptyReadyAt: EMPTY_RETURN_EPOCH - 5 * HOUR_MS,
    deadline: EMPTY_RETURN_EPOCH + 22 * HOUR_MS,
    deadlineStatus: 'verified',
    predictedGateIn: EMPTY_RETURN_EPOCH + 8 * HOUR_MS,
    returnedAt: null,
    status: 'empty_ready',
    chainId: null,
    cycleId: null,
    seq: null,
    nextFull: null,
    milestone: 3,
    checklist: noneChecked(),
    exception: null,
  },
  {
    id: 'ERT-00113',
    container: 'CMAU2211334',
    type: '40HC',
    line: 'CMA CGM',
    client: 'Horn Freight Express',
    locationId: 'LOC-00001',
    locationName: 'Boulaos Industrial Yard',
    transporter: 'Red Sea Express Ltd',
    truck: null,
    emptyReadyAt: EMPTY_RETURN_EPOCH - 4 * HOUR_MS,
    deadline: EMPTY_RETURN_EPOCH + 18 * HOUR_MS,
    deadlineStatus: 'verified',
    predictedGateIn: EMPTY_RETURN_EPOCH + 7 * HOUR_MS,
    returnedAt: null,
    status: 'empty_ready',
    chainId: null,
    cycleId: null,
    seq: null,
    nextFull: null,
    milestone: 3,
    checklist: noneChecked(),
    exception: null,
  },
  {
    id: 'ERT-00114',
    container: 'HLXU9090909',
    type: '20GP',
    line: 'Hapag-Lloyd',
    client: 'Al-Baraka Logistics Ltd',
    locationId: 'LOC-00005',
    locationName: 'Nagad Inland Container Depot',
    transporter: 'Al-Baraka Transport Co.',
    truck: null,
    emptyReadyAt: EMPTY_RETURN_EPOCH - 2 * HOUR_MS,
    deadline: EMPTY_RETURN_EPOCH + 28 * HOUR_MS,
    deadlineStatus: 'verified',
    predictedGateIn: EMPTY_RETURN_EPOCH + 9 * HOUR_MS,
    returnedAt: null,
    status: 'empty_ready',
    chainId: null,
    cycleId: null,
    seq: null,
    nextFull: null,
    milestone: 3,
    checklist: noneChecked(),
    exception: null,
  },
];

/**
 * The open mission pool.
 *
 * Two sit at LOC-02 with ER-106, which is why the Matching view has something to
 * decide on first paint: FM-210 is clean, FM-211 is the wrong box type with none
 * of its documents in hand — and the module still lets Operations pick it.
 */
export const INITIAL_FULL_LOAD_MISSIONS: FullLoadMission[] = [
  {
    id: 'FLM-00210',
    container: 'MSCU8811223',
    type: '20GP',
    line: 'MSC',
    client: 'Al-Baraka Logistics Ltd',
    locationId: 'LOC-00002',
    locationName: 'Djibouti Free Zone — Warehouse Block B-12',
    pickupHub: EMPTY_RETURN_HUB,
    pickupAt: EMPTY_RETURN_EPOCH + 6 * HOUR_MS,
    window: '08:00 – 12:00',
    doStatus: 'verified',
    booking: 'confirmed',
    release: 'confirmed',
  },
  {
    id: 'FLM-00211',
    container: 'HLXU6600441',
    type: '40HC',
    line: 'Hapag-Lloyd',
    client: 'Al-Baraka Logistics Ltd',
    locationId: 'LOC-00002',
    locationName: 'Djibouti Free Zone — Warehouse Block B-12',
    pickupHub: EMPTY_RETURN_HUB,
    pickupAt: EMPTY_RETURN_EPOCH + 10 * HOUR_MS,
    window: '13:00 – 17:00',
    doStatus: 'pending',
    booking: 'pending',
    release: 'pending',
  },
  {
    id: 'FLM-00212',
    container: 'MSKU5522110',
    type: '20GP',
    line: 'Maersk',
    client: 'Horn Freight Express',
    locationId: 'LOC-00005',
    locationName: 'Nagad Inland Container Depot',
    pickupHub: EMPTY_RETURN_HUB,
    pickupAt: EMPTY_RETURN_EPOCH + 9 * HOUR_MS,
    window: '09:00 – 13:00',
    doStatus: 'verified',
    booking: 'confirmed',
    release: 'pending',
  },
  {
    id: 'FLM-00213',
    container: 'CMAU7788990',
    type: '40HC',
    line: 'CMA CGM',
    client: 'AMINA FZCO',
    locationId: 'LOC-00001',
    locationName: 'Boulaos Industrial Yard',
    pickupHub: EMPTY_RETURN_HUB,
    pickupAt: EMPTY_RETURN_EPOCH + 8 * HOUR_MS,
    window: '10:00 – 14:00',
    doStatus: 'verified',
    booking: 'confirmed',
    release: 'confirmed',
  },
];

/** Id sequences the store post-increments. Kept beside the seed they continue. */
export const EMPTY_RETURN_ID_SEEDS = {
  cycle: 5,
  chain: 3,
  record: 115,
} as const;
