/**
 * The vocabulary of Empty Container Management — thresholds, labels, colours.
 *
 * Two decisions worth stating, because both look arbitrary from the outside.
 *
 * **One deadline model, four bands.** `3d+ safe · 1–3d watch · <24h critical ·
 * past overdue`, measured against the shipping line's return deadline and
 * nothing else. The module used to grade risk off a predicted gate-in, which
 * meant the band could move because a forecast moved rather than because time
 * passed. An operator acts on how long they have left to decide; that is the
 * only number the bands are allowed to be about.
 *
 * **Colour is the product's law, not this module's taste.** Teal is the good
 * outcome — a full load, a pairing, a deadline protected. Blue is an empty
 * container waiting for a decision. Orange asks (return planned, watch). Red
 * fails (critical, overdue). Green confirms (safe, returned on time). Every
 * class below resolves through a semantic token; nothing here may reach for a
 * raw palette step, which `npm run check:ds` enforces.
 *
 * Status and urgency collide in hue by construction — orange is both "watch"
 * and "return planned" — so they are separated by *shape*, never by colour:
 * the risk pill is `rounded-md` with a Timer, the stage chip is a neutral
 * outline with a 6px dot. One saturated colour per row, and urgency owns it.
 */

import { INITIAL_PARTNERS } from '@/data/partnerData';
import { MOCK_SHIPPERS } from '@/data/shippersData';
import { detentionRate } from '@/features/settings';
import {
  ArrowLeftRight,
  CheckCircle2,
  Package,
  PackageOpen,
  RotateCcw,
  Timer,
  type LucideIcon,
} from '@/design-system/icons';
import type {
  CalendarFilters,
  ContainerStage,
  ContainerStageMeta,
  DeadlineVerification,
  DeadlineVerificationMeta,
  EmptyReturnEventType,
  EmptyReturnFilterOption,
  EmptyReturnFilters,
  EmptyReturnRiskFilter,
  EmptyReturnStageFilter,
  PerformanceFilters,
  ReturnRiskLevel,
  ReturnRiskMeta,
} from '@/types/emptyReturn';

/* ---------------------------------------------------------------------------
 * Clock constants
 * ------------------------------------------------------------------------- */

/** One hour in milliseconds. Every threshold below is a multiple of it. */
export const HOUR_MS = 3_600_000;

/** One day in milliseconds. */
export const DAY_MS = 86_400_000;

/** How often the module re-reads the wall clock so risk stays live. */
export const EMPTY_RETURN_TICK_MS = 30_000;

/** How long a confirmation toast stays on screen. */
export const EMPTY_RETURN_TOAST_MS = 5_600;

/** At or above this margin the container reads `safe`. */
export const WATCH_THRESHOLD_MS = 72 * HOUR_MS;

/** Below this margin the container reads `critical`. */
export const CRITICAL_THRESHOLD_MS = 24 * HOUR_MS;

/**
 * A pairing with less margin than this is viable but is never recommended.
 *
 * Six hours between collecting the full load and the empty's own deadline is
 * one traffic jam away from a detention charge, so the engine still offers it —
 * refusing outright would hide the only option a critical container has — but
 * labels it `LAST OPTION` and ranks it below everything else.
 */
export const TIGHT_PAIRING_WINDOW_MS = 6 * HOUR_MS;

/* ---------------------------------------------------------------------------
 * Money
 * ------------------------------------------------------------------------- */

/**
 * What one container-day past the deadline costs.
 *
 * Read from Settings → Finance, not declared here. The app already prices
 * detention in exactly one place — the shipping lines' contractual rate, which
 * Operations negotiates and edits on the Settings page — and the mission report
 * has been quoting it for months. A second constant in this module would have
 * meant the Control Tower and a shipment's own report putting two different
 * prices on the same overdue box.
 *
 * A *function*, never a `const`: settings load asynchronously and are edited at
 * runtime, so a value captured at module scope would freeze whatever was true
 * when this file was first imported.
 */
export function detentionRatePerDay(): number {
  return detentionRate().amount;
}

/** The currency that rate is quoted in — labelled at every point of display. */
export function detentionCurrency(): string {
  return detentionRate().currency;
}

/** `1,100 USD` — the amount with the currency it is actually in, never assumed. */
export function formatDetention(amount: number): string {
  const { currency } = detentionRate();
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(amount))} ${currency}`;
}

/**
 * Detention accrued on a container that is already past its deadline.
 *
 * Whole days, rounded up: a line charges for the day the box is late, not for
 * the hour. Returns 0 for anything not yet overdue, so callers can multiply
 * blindly.
 */
export function detentionFor(overdueMs: number): number {
  if (overdueMs <= 0) return 0;
  return Math.ceil(overdueMs / DAY_MS) * detentionRatePerDay();
}

/* ---------------------------------------------------------------------------
 * Fixed vocabulary
 * ------------------------------------------------------------------------- */

/** The depot an empty goes back to when the booking names none. */
export const EMPTY_RETURN_HUB = 'Doraleh Container Terminal';

/**
 * The exception strings, as constants.
 *
 * `standaloneRequired` is tested for exact equality in several places — it is
 * what "the operator planned this container's own return" is recorded as — so
 * the literal must not drift. It mirrors the one value the backend ever writes
 * (`EmptyReturnsService.markStandalone`); the other two are display-only
 * classifications this frontend may derive from a missing deadline.
 */
export const EMPTY_RETURN_EXCEPTIONS = {
  standaloneRequired: 'Standalone empty return required',
  deadlineExceeded: 'Deadline exceeded',
  deadlineMissing: 'Deadline missing',
} as const;

/* ---------------------------------------------------------------------------
 * Stage
 * ------------------------------------------------------------------------- */

/**
 * The four stages, as chips.
 *
 * Deliberately de-saturated: neutral outline plus a coloured 6px dot. The dot
 * carries the identity — the container pair's yellow for a box still asking,
 * teal for a decided pairing, orange for a planned return, neutral once
 * closed — and the pill behind the words stays quiet so the urgency badge
 * beside it still lands.
 */
/**
 * The four decisions a container can be at, and how each one looks.
 *
 * Repainted 2026-08-29 onto the `--stage-*` scale the v19 design introduced.
 * Every chip used to be `bg-card` with only a coloured dot to tell them apart,
 * which meant a queue of forty rows was forty identical white pills — the
 * stage was technically present and practically invisible. Each stage now
 * carries its own tinted chip, and the dot keeps the solid fill so the two
 * read as one mark rather than a pill with an unrelated bullet in it.
 *
 * Note `paired` is violet, not teal. Teal is FULL in this module
 * (`--container-full`), and a pairing drawn in it looked like a statement
 * about the cargo instead of a statement about the decision.
 */
export const CONTAINER_STAGE_META: Record<ContainerStage, ContainerStageMeta> = {
  empty: {
    label: 'Empty Ready',
    dotClassName: 'bg-stage-available',
    chipClassName: 'bg-stage-available-subtle text-stage-available-subtle-foreground border-stage-available-border/40',
  },
  paired: {
    /* The reference's own words, tick included — a paired box is a decision
       that has LANDED, and the tick is what separates it at a glance from the
       stages that still owe somebody something. */
    label: 'Paired ✓',
    dotClassName: 'bg-stage-paired',
    chipClassName: 'bg-stage-paired-subtle text-stage-paired-subtle-foreground border-stage-paired-border/50',
  },
  return_planned: {
    label: 'Return Planned',
    dotClassName: 'bg-stage-returning',
    chipClassName: 'bg-stage-returning-subtle text-stage-returning-subtle-foreground border-stage-returning-border/40',
  },
  closed: {
    /* "Closed" was ours; the reference says what actually happened to the box.
       On-time vs late is an outcome, not a stage, so callers that know the
       outcome say `Returned Late` — this is the label for the stage alone. */
    label: 'Returned ✓',
    dotClassName: 'bg-stage-closed',
    chipClassName: 'bg-stage-closed-subtle text-stage-closed-subtle-foreground border-stage-closed-border/50',
  },
};

/** Declaration order — drives the stage `<Select>` and any legend. */
export const CONTAINER_STAGE_ORDER: readonly ContainerStage[] = [
  'empty',
  'paired',
  'return_planned',
  'closed',
];

/**
 * What a closed container is called, by outcome.
 *
 * Split out from the stage chip because "Closed" is the mechanism and these
 * are the result — and the result is the only part anybody reads.
 */
export const CONTAINER_OUTCOME_LABEL = {
  paired: 'Paired',
  returned: 'Returned',
  returned_late: 'Returned Late',
} as const;

/* ---------------------------------------------------------------------------
 * Risk
 * ------------------------------------------------------------------------- */

/**
 * The five urgency pills, on the `--urgency-*` semantic tokens.
 *
 * `critical` rides the `at-risk` token pair rather than the `critical` one on
 * purpose: `--urgency-critical-*` is an orange wash and `--urgency-watch-*` is
 * the same orange, which left the two most consequential bands in a four-band
 * model looking identical. Pointing critical at the red-tinted pair restores
 * the escalation — green, orange, red-tinted, solid red — with no new colour.
 *
 * Only `overdue` is a solid fill, and it is the only animated thing in the
 * module.
 */
export const RETURN_RISK_META: Record<ReturnRiskLevel, ReturnRiskMeta> = {
  safe: {
    label: 'Safe',
    className: 'bg-urgency-safe-bg text-urgency-safe-fg border-transparent',
    textClassName: 'text-urgency-safe-fg',
  },
  watch: {
    label: 'Watch',
    className: 'bg-urgency-watch-bg text-urgency-watch-fg border-transparent',
    textClassName: 'text-urgency-watch-fg',
  },
  critical: {
    label: 'Critical',
    className: 'bg-urgency-at-risk-bg text-urgency-at-risk-fg border-urgency-at-risk-border',
    textClassName: 'text-urgency-at-risk-fg',
  },
  overdue: {
    label: 'Return Overdue',
    className:
      'bg-urgency-overdue-bg text-urgency-overdue-fg border-urgency-overdue-border animate-pulse motion-reduce:animate-none',
    textClassName: 'text-destructive',
  },
  protected: {
    /* The decision is made and the deadline held, so no detention can ever be
     * charged on this box and that cannot change. "Protected" described the
     * effect — nobody reading the board knew what it was protected from. */
    label: 'Deadline Protected',
    className: 'bg-urgency-protected-bg text-urgency-protected-fg border-transparent',
    textClassName: 'text-primary-subtle-foreground',
  },
};

/**
 * The text colour for a risk level, safe for a level that may be null.
 *
 * A container with no deadline has no risk to read, and every caller that wants
 * to colour a figure by urgency has to cope with that. Centralised so none of
 * them reaches for a non-null assertion to get past the type.
 */
export function riskTextClass(risk: ReturnRiskLevel | null): string {
  return risk ? RETURN_RISK_META[risk].textClassName : 'text-foreground';
}

/** Worst first. The Control Tower groups in this order and the legend follows it. */
export const RETURN_RISK_ORDER: readonly ReturnRiskLevel[] = [
  'overdue',
  'critical',
  'watch',
  'safe',
  'protected',
];

export const DEADLINE_VERIFICATION_META: Record<DeadlineVerification, DeadlineVerificationMeta> = {
  verified: { label: 'Deadline confirmed', className: 'text-success' },
  // `--warning` is orange-500: a 1.8:1 fill colour, not a type colour. The
  // label is 11px on a white card, so it takes the `-subtle-foreground` pair
  // like every other orange string in the app.
  unverified: { label: 'Deadline not confirmed', className: 'text-warning-subtle-foreground' },
  missing: { label: 'No return deadline', className: 'text-destructive' },
};

/* ---------------------------------------------------------------------------
 * Calendar events
 * ------------------------------------------------------------------------- */

export interface EmptyReturnEventMeta {
  label: string;
  icon: LucideIcon;
  /** Left rail on the event card — the event's own identity. */
  railClassName: string;
  /** The label's colour. */
  textClassName: string;
  /** One line explaining what the card is, for the legend. */
  hint: string;
}

/**
 * Event type is the calendar's primary identity — icon, label and left rail.
 *
 * Risk rides along as a small badge and never becomes the card's own colour.
 * A week of work has to read as *what happens* first and *how urgent* second,
 * and a board where every card is graded by risk reads as one long alarm.
 */
export const EMPTY_RETURN_EVENT_META: Record<EmptyReturnEventType, EmptyReturnEventMeta> = {
  empty_ready: {
    label: 'Empty Available',
    icon: PackageOpen,
    railClassName: 'border-l-container-empty',
    textClassName: 'text-container-empty-subtle-foreground',
    hint: 'A container finished unloading and now needs a decision.',
  },
  full_pickup: {
    label: 'Full Load Pickup',
    icon: Package,
    railClassName: 'border-l-primary',
    textClassName: 'text-primary-subtle-foreground',
    hint: 'An upcoming full load — the demand an empty can be paired with.',
  },
  paired: {
    label: 'Pairing',
    icon: ArrowLeftRight,
    railClassName: 'border-l-primary-bold',
    textClassName: 'text-primary-bold',
    hint: 'An empty travelling out under a different full load.',
  },
  return_planned: {
    label: 'Empty Return',
    icon: RotateCcw,
    railClassName: 'border-l-warning',
    textClassName: 'text-warning-subtle-foreground',
    hint: 'A container going back to the depot on its own.',
  },
  deadline: {
    label: 'Return Deadline',
    icon: Timer,
    railClassName: 'border-l-destructive',
    textClassName: 'text-destructive',
    hint: 'The last moment the empty can be back before detention starts.',
  },
  returned: {
    label: 'Returned',
    icon: CheckCircle2,
    railClassName: 'border-l-success',
    textClassName: 'text-success-subtle-foreground',
    hint: 'The container is back at the depot and the cycle is closed.',
  },
};

/** Declaration order — the legend and the event filter follow it. */
export const EMPTY_RETURN_EVENT_ORDER: readonly EmptyReturnEventType[] = [
  'empty_ready',
  'full_pickup',
  'paired',
  'return_planned',
  'deadline',
  'returned',
];

/* ---------------------------------------------------------------------------
 * Filter vocabulary
 * ------------------------------------------------------------------------- */

export const DEFAULT_EMPTY_RETURN_FILTERS: EmptyReturnFilters = {
  q: '',
  stage: 'all',
  risk: 'all',
};

export const DEFAULT_CALENDAR_FILTERS: CalendarFilters = {
  type: 'all',
  risk: 'all',
  line: 'all',
  size: 'all',
};

export const DEFAULT_PERFORMANCE_FILTERS: PerformanceFilters = {
  period: 'all',
  line: 'all',
  transporter: 'all',
  size: 'all',
};

export const EMPTY_RETURN_STAGE_FILTER_OPTIONS: readonly EmptyReturnFilterOption<EmptyReturnStageFilter>[] =
  [
    { value: 'all', label: 'All stages' },
    ...CONTAINER_STAGE_ORDER.map((stage) => ({
      value: stage as EmptyReturnStageFilter,
      label: CONTAINER_STAGE_META[stage].label,
    })),
  ];

export const EMPTY_RETURN_RISK_FILTER_OPTIONS: readonly EmptyReturnFilterOption<EmptyReturnRiskFilter>[] =
  [
    { value: 'all', label: 'All urgencies' },
    ...RETURN_RISK_ORDER.map((risk) => ({
      value: risk as EmptyReturnRiskFilter,
      label: RETURN_RISK_META[risk].label,
    })),
  ];

export const PERFORMANCE_PERIOD_OPTIONS: readonly EmptyReturnFilterOption<
  PerformanceFilters['period']
>[] = [
  { value: '1', label: 'Today' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: 'all', label: 'All time' },
];

/* ---------------------------------------------------------------------------
 * Container sizes
 * ------------------------------------------------------------------------- */

/**
 * Free-text cargo (`"Container (40ft)"`, `"40 HC"`) → the token matching
 * compares on.
 *
 * Compatibility is `same line && same size`, so a normaliser that gives up
 * quietly would make every pairing look impossible. It falls back to the
 * trimmed input rather than to a constant for exactly that reason: two
 * containers described the same odd way still match each other.
 */
/** The sizes the pickers offer, in the order a yard lists them. */
export const CONTAINER_SIZE_ORDER: readonly string[] = ["20'", "40'", '40HC'];

export function normalizeContainerSize(cargo: string | null | undefined): string {
  const raw = (cargo ?? '').trim();
  if (!raw) return 'Unspecified';
  const flat = raw.toLowerCase().replace(/[\s_-]/g, '');
  if (/40hc|highcube|hicube|45/.test(flat)) return '40HC';
  if (/40/.test(flat)) return "40'";
  if (/20/.test(flat)) return "20'";
  return raw;
}

/**
 * A booking's container size, from the two fields that might carry it.
 *
 * `shipmentCategory` is sometimes the size (`container_40`) and sometimes just
 * the shape of the job (`containerized`), which carries no size at all. The
 * size that is always right is on `cargoType` — the wizard writes
 * `"Container (40ft)"` per booking precisely because one shipment can mix
 * sizes and each container is only ever one of them.
 *
 * So: take the category when it actually names a size, otherwise read the
 * cargo. Preferring the category blindly is what put "containerized" in the
 * size column and made every pairing incompatible with every other, since
 * matching compares on this string.
 */
export function resolveContainerSize(
  shipmentCategory: string | null | undefined,
  cargoType: string | null | undefined,
): string {
  const fromCategory = normalizeContainerSize(shipmentCategory);
  if (CONTAINER_SIZE_ORDER.includes(fromCategory)) return fromCategory;
  const fromCargo = normalizeContainerSize(cargoType);
  if (CONTAINER_SIZE_ORDER.includes(fromCargo)) return fromCargo;
  // Neither named a size — show the cargo description rather than a category
  // slug, which is at least something an operator recognises.
  return fromCargo !== 'Unspecified' ? fromCargo : fromCategory;
}

/**
 * `"40'"` -> `"40 ft"`. The size as somebody says it out loud.
 *
 * The prime mark is the yard's own shorthand and it does not survive being set
 * at 12px next to a carrier name: the reader sees `40`, reads the apostrophe as
 * punctuation, and asks "forty what?". Spelled out it cannot be misread, and it
 * is still short enough for the pill it lives in.
 *
 * Unknown sizes pass straight through. `size` is a free string — see
 * `resolveContainerSize`, which falls back to a cargo description when neither
 * field named a size — and appending "ft" to `Unspecified` would invent a
 * measurement nobody recorded.
 */
export function formatContainerSize(size: string | null | undefined): string {
  const raw = (size ?? '').trim();
  if (!raw) return '—';
  if (raw === "20'") return '20 ft';
  if (raw === "40'") return '40 ft';
  if (raw === '40HC') return '40 ft HC';
  return raw;
}

/* ---------------------------------------------------------------------------
 * Company identity
 * ------------------------------------------------------------------------- */

/**
 * The logo behind every company name this module renders.
 *
 * Derived from the shipper and partner records rather than copied out of them.
 * Every company here is a real Fleetin account, so the mark it shows has to be
 * the mark `/shippers` and `/partners` show — a hand-kept second table would go
 * stale the first time somebody changed a logo, and it would go stale silently.
 * A company with no `logoUrl` returns `undefined` rather than a placeholder, so
 * the avatar falls back to its initials exactly as it does on the partners page.
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

/** Two-letter mark for a company with no logo. `Al-Baraka Transport Co.` → `AT`. */
export function companyInitials(name: string | null | undefined): string {
  if (!name) return 'C';
  const letters = name
    .split(/[\s/-]+/)
    .map((part) => part.replace(/[^A-Za-z]/g, '').charAt(0))
    .filter(Boolean);
  const initials = letters.slice(0, 2).join('').toUpperCase();
  return initials || name.charAt(0).toUpperCase() || 'C';
}
