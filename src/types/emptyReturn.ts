/**
 * The empty-return domain, typed.
 *
 * The business object here is not a container and not a mission — it is a
 * **cycle**: one empty return welded to one full-load mission, counted together
 * and never separately. Everything on `EmptyReturnRecord` exists to answer one
 * of two questions: has the box gone back before its deadline, and what is it
 * carrying out on the way home.
 *
 * Cycles link into **chains** — the full load delivered by cycle *n* becomes the
 * empty of cycle *n+1* once it is unloaded — which is why `chainId`/`seq` sit on
 * the record rather than in a separate join table. A record with a null
 * `chainId` is simply not in a cycle yet; that is a legitimate resting state,
 * not missing data.
 *
 * Timestamps are epoch milliseconds, not ISO strings. The whole module is a
 * clock: risk, slack and every badge recompute against a ticking `now`, and
 * arithmetic on numbers is the only form that survives that honestly.
 */

/* ---------------------------------------------------------------------------
 * Scalars
 * ------------------------------------------------------------------------- */

/** Where a record sits on the one-way lifecycle. No backward transition exists. */
export type EmptyReturnStatus =
  | 'unloading'
  | 'empty_ready'
  | 'preparing'
  | 'ready'
  | 'in_progress'
  | 'completed';

/**
 * Deadline risk, derived — never stored.
 *
 * `protected` and `overdue` are short-circuits, not slack bands: `protected`
 * means the box is already back on time and can never read anything else again,
 * `overdue` means the deadline passed and it is still out.
 */
export type ReturnRiskLevel =
  | 'safe'
  | 'watch'
  | 'critical'
  | 'at_risk'
  | 'overdue'
  | 'protected';

/**
 * Whether the return deadline has been confirmed against the line/terminal.
 *
 * `unverified` is a mock-only middle state with no real signal behind it —
 * a real `Booking` only ever has `containerReturnDeadline` set or not — so it
 * is never produced by `@/features/empty-returns/mappers` and only kept here
 * for the display components that still switch on all three.
 */
export type DeadlineVerification = 'verified' | 'unverified' | 'missing';

/**
 * The cargo/container description shown beside a container number.
 *
 * A real `Booking.cargoType` is free text (`"Container (40ft)"`), not the
 * two-value mock enum this used to be — widened rather than coerced so a
 * real value is never forced into a shape it doesn't fit.
 */
export type ContainerFormat = string;

/* ---------------------------------------------------------------------------
 * Records
 * ------------------------------------------------------------------------- */

/**
 * The full load this cycle picks up on the way back.
 *
 * `missionId` and `client` are written when the cycle is created and are never
 * rendered — they are the audit link back to the mission that was consumed.
 */
export interface LinkedFullLoad {
  container: string;
  type: ContainerFormat;
  missionId?: string;
  client?: string;
  /**
   * The outbound booking's own live status. The cycle advances by moving this
   * booking along the real ladder, so the UI needs its actual position to
   * offer a legal next step — and to say nothing at all once it is terminal.
   */
  status?: string;
  /** Set when the full load is a real shipment — the cycle reports back to it. */
  shipmentId?: string;
  /** The shipment's human-readable `MSN-#####` — for display and as the `/shipments/:id` route param (the backend accepts either). */
  shipmentReference?: string;
  /** The underlying booking's own id — deep-links straight to its card in the shipment. */
  bookingId?: string;
}

export interface EmptyReturnRecord {
  /** A matched cycle's own reference (`CYC-2026-#####`) once `cycleId` is set, otherwise the underlying booking's own reference. */
  id: string;
  /**
   * The booking this row is about, always — the one reference that does not
   * change when the container gets matched. The row used to be titled by `id`,
   * so the same physical box was called `BKG-01194` while it waited and
   * `CYC-00034` the moment somebody paired it.
   */
  bookingReference: string;
  /** The empty box going back. */
  container: string;
  type: ContainerFormat;
  line: string;
  /** Shipper company name — always rendered with its logo. */
  client: string;
  /** The matching key: a mission is same-location iff the two ids are equal. */
  locationId: string;
  locationName: string;
  /** Carrier company name — the cycle keeps the transporter of the original delivery. */
  transporter: string;
  /** Plate/fleet id, or null while unassigned. */
  truck: string | null;
  /** When the box became available (unloading finished). */
  emptyReadyAt: number | null;
  /** The hard date the empty must be back at the hub. Null switches risk off entirely. */
  deadline: number | null;
  deadlineStatus: DeadlineVerification;
  /** Trip out + collection + trip to hub + hub processing + safety buffer. */
  predictedGateIn: number | null;
  /** Stamped at milestone 11. Once set and within the deadline, risk is `protected` forever. */
  returnedAt: number | null;
  status: EmptyReturnStatus;
  /** `CHN-2026-#####`, or null when the record is not in a cycle. */
  chainId: string | null;
  /** `CYC-2026-#####`, or null when the record is not yet matched. Also the transporter counting unit. */
  cycleId: string | null;
  /** 1-based position of this cycle inside its chain. */
  seq: number | null;
  nextFull: LinkedFullLoad | null;
  /** Free-text exception badge. Only the three `EMPTY_RETURN_EXCEPTIONS` values occur. */
  exception: string | null;
  /**
   * The shipment (Mission id) whose delivery produced this empty, when known.
   * The join key between the Shipments module and this one — used to dedupe
   * registrations and to push cycle progress back onto the shipment.
   */
  shipmentId?: string;
  /** The shipment's human-readable `MSN-#####` — for display and as the `/shipments/:id` route param (the backend accepts either). */
  shipmentReference?: string;
  /** The underlying booking's own id — the empty's own booking (not the cycle) once matched, so a deep link still opens the right card. */
  bookingId?: string;
}

/**
 * An open full-load mission waiting for a truck.
 *
 * Missions are a consumable pool: creating a cycle removes one permanently.
 */
export interface FullLoadMission {
  id: string;
  container: string;
  type: ContainerFormat;
  line: string;
  client: string;
  locationId: string;
  locationName: string;
  pickupHub: string;
  pickupAt: number;
  /** Human slot, e.g. `08:00 – 12:00` (en dash), or a formatted point-in-time when there's no real window to show. */
  window: string;
  /**
   * Set when this pool entry is a real shipment awaiting dispatch. Creating a
   * cycle from it marks that shipment Assigned; completing the cycle completes it.
   */
  shipmentId?: string;
}

/* ---------------------------------------------------------------------------
 * Filtering
 * ------------------------------------------------------------------------- */

/** `assigned` is a pseudo-value meaning `ready ∪ in_progress`, mirroring `crit` on risk. */
export type EmptyReturnStatusFilter = 'all' | 'assigned' | EmptyReturnStatus;

/** `crit` bundles `critical` + `at_risk`; neither is individually selectable. */
export type EmptyReturnRiskFilter = 'all' | 'crit' | ReturnRiskLevel;

export interface EmptyReturnFilters {
  q: string;
  status: EmptyReturnStatusFilter;
  risk: EmptyReturnRiskFilter;
}

/**
 * One entry in a filter `<Select>`.
 *
 * Named for the module rather than `FilterOption`, which is already taken by
 * the DataTable primitive — the two are unrelated shapes and the types barrel
 * exports both.
 */
export interface EmptyReturnFilterOption<TValue extends string> {
  value: TValue;
  label: string;
}

/* ---------------------------------------------------------------------------
 * Derived shapes
 * ------------------------------------------------------------------------- */

export interface EmptyReturnKpis {
  /** `empty_ready` with no exception attached. Also drives the Matching tab badge. */
  emptyReady: number;
  /** `ready` + `in_progress`. */
  assigned: number;
  /** Records flagged for a standalone return. */
  standalone: number;
  /** `critical` + `at_risk`, excluding completed cycles. */
  critical: number;
  /** `overdue`, with no status exclusion. */
  overdue: number;
}

/**
 * One chain, with the four header figures already resolved.
 *
 * `onTime` counts every record already returned within its deadline while
 * `completed` counts only finished cycles — so the ratio the header prints can
 * read `2/1`. That asymmetry is the demo's, reproduced deliberately.
 */
export interface CycleChain {
  id: string;
  /** Ascending by `seq`. */
  cycles: EmptyReturnRecord[];
  /** Supplies the header line: transporter · client · location. */
  first: EmptyReturnRecord;
  completed: number;
  /** The first non-completed cycle, or null when the chain is closed. */
  active: EmptyReturnRecord | null;
  onTime: number;
  /** The active cycle's status label, or `Completed`. */
  statusLabel: string;
  maxSequence: number;
}

/**
 * One transporter row.
 *
 * `containers` counts every box touched; `total`/`completed`/`active`/
 * `longestChain` count only records that carry a cycle id. The footer copy on
 * the view explains that counting rule to the reader.
 */
export interface TransporterCycleStats {
  name: string;
  total: number;
  completed: number;
  active: number;
  longestChain: number;
  containers: number;
  withDeadline: number;
  onTime: number;
  /** `100%` or `—` — precomputed so two views cannot round it differently. */
  onTimeLabel: string;
  standalone: number;
}

/* ---------------------------------------------------------------------------
 * Display metadata
 * ------------------------------------------------------------------------- */

export interface EmptyReturnStatusMeta {
  label: string;
  /** Classes for the 6px dot. */
  dotClassName: string;
  /** Classes for the chip shell (background, text, border). */
  chipClassName: string;
}

export interface ReturnRiskMeta {
  label: string;
  className: string;
}

export interface DeadlineVerificationMeta {
  label: string;
  /** Text colour. Used in the row detail; the dark Matching panel drops it. */
  className: string;
}
