/**
 * Empty Container Management, typed.
 *
 * The product this models starts the moment a container becomes **empty** —
 * the shipment system has already delivered and unloaded it — and it ends one
 * decision later:
 *
 *     MONITOR → REUSE IF POSSIBLE → OTHERWISE RETURN BEFORE THE DEADLINE → CLOSE
 *
 * That is the whole scope, and the type below is shaped to refuse anything
 * wider. There are no transport-execution states here: no "prepare operation",
 * no "start execution", no "complete execution". A paired container is a
 * *finished* piece of work for this module — the truck that actually moves it
 * is the Shipment module's business, and `nextFull` is the handover.
 *
 * **Pairing is not a container becoming another container.** An empty box and
 * the full box it is paired with are two different physical containers with
 * two different numbers; pairing links the empty's movement to a different
 * upcoming full-load operation so the empty leg is not driven twice. The type
 * keeps them in separate fields (`container` vs `nextFull.container`) for
 * exactly that reason, and every surface that renders them must keep them
 * visibly distinct.
 *
 * Timestamps are epoch milliseconds, not ISO strings. The whole module is a
 * clock — risk, decision windows and every badge recompute against a ticking
 * `now` — and arithmetic on numbers is the only form that survives that
 * honestly.
 */

/* ---------------------------------------------------------------------------
 * Scalars
 * ------------------------------------------------------------------------- */

/**
 * Where a container sits in the decision, and nothing more.
 *
 * `empty` is the only stage that asks anything of an operator. `paired` and
 * `closed` are both terminal for this module; `return_planned` is the short
 * waiting room between deciding to send the box back and confirming it made it.
 */
export type ContainerStage = 'empty' | 'paired' | 'return_planned' | 'closed';

/**
 * How a closed container finished.
 *
 * `paired` is the win — the empty went out under a different full load, so no
 * separate empty trip was ever driven. `returned`/`returned_late` are the
 * fallback, split by whether the line's deadline held.
 */
export type ContainerOutcome = 'paired' | 'returned' | 'returned_late';

/**
 * Deadline risk, derived — never stored.
 *
 * One model, four live bands and one permanent short-circuit:
 *
 * | Band       | Meaning                                    |
 * |------------|--------------------------------------------|
 * | `safe`     | 3 days or more before the return deadline  |
 * | `watch`    | 1–3 days out                               |
 * | `critical` | under 24 hours                             |
 * | `overdue`  | the deadline has passed, box still out     |
 * | `protected`| already resolved on time — cannot change   |
 *
 * `protected` is checked first and is permanent: once the container is paired
 * or back inside its deadline, no later clock can make it read anything else.
 * The bands deliberately measure the *deadline*, not a predicted gate-in — an
 * operator acts on how long they have left to decide, and a forecast that
 * moves under them is not that.
 */
export type ReturnRiskLevel = 'safe' | 'watch' | 'critical' | 'overdue' | 'protected';

/**
 * Whether the return deadline is known at all.
 *
 * A real `Booking` either carries `containerReturnDeadline` or does not, so
 * only two of these are ever produced by the mappers. `unverified` is kept for
 * display components that still switch on all three.
 */
export type DeadlineVerification = 'verified' | 'unverified' | 'missing';

/**
 * The cargo/container description shown beside a container number.
 *
 * Free text on a real booking (`"Container (40ft)"`), so it is widened rather
 * than coerced into an enum it does not fit. `ContainerSize` below is the
 * normalised form matching actually compares on.
 */
export type ContainerFormat = string;

/** `20'` · `40'` · `40HC`, normalised from free-text cargo. Matching compares on this. */
export type ContainerSize = string;

/* ---------------------------------------------------------------------------
 * Records
 * ------------------------------------------------------------------------- */

/**
 * The upcoming full load an empty has been paired with.
 *
 * A different physical container, on a different shipment — every field here
 * belongs to *that* operation, which is why none of them are flattened onto
 * the record. `pickupAt` is the one that matters most: it is what the deadline
 * margin is measured against.
 */
export interface LinkedFullLoad {
  /** The full container's own number — never the empty's. */
  container: string;
  type: ContainerFormat;
  size: ContainerSize;
  line: string;
  /** The outbound booking's `BKG-####`. */
  missionId?: string;
  client?: string;
  /** The outbound booking's own live status, so the UI can say nothing once it is terminal. */
  status?: string;
  shipmentId?: string;
  /** `MSN-#####` — display, and the `/shipments/:id` route param. */
  shipmentReference?: string;
  bookingId?: string;
  /** When the full load is collected. The pairing is only viable if this lands before the deadline. */
  pickupAt: number | null;
  pickupHub: string;
  destination: string;
  transporter: string | null;
}

/**
 * One empty container under management.
 *
 * Before a match this is a live read of a delivered `Booking`; after one it is
 * an `EmptyReturnCycle` welded to that booking. The two collapse into one
 * shape on purpose — the Control Tower shows both in one queue, and an
 * operator should not have to know which table a row came out of.
 */
export interface EmptyReturnRecord {
  /** `CYC-#####` once matched, otherwise the underlying booking's own reference. */
  id: string;
  /**
   * The booking this row is about, always — the one reference that survives
   * matching. The row used to be titled by `id`, so the same physical box was
   * called `BKG-01194` while it waited and `CYC-00034` once somebody paired it.
   */
  bookingReference: string;
  bookingId?: string;

  /** The empty box itself. */
  container: string;
  type: ContainerFormat;
  size: ContainerSize;
  line: string;
  /** Shipper company name — always rendered with its logo. */
  client: string;
  /** Carrier company name — the container keeps the transporter of the original delivery. */
  transporter: string;
  truck: string | null;

  /** Matching key: two places are the same place iff these are equal. */
  locationId: string;
  /** Where the empty physically is now — the delivery address it was unloaded at. */
  locationName: string;
  /** Where it has to go back to. */
  returnDepot: string;

  /** The full load that produced this empty — `BKG-####`. */
  prevLoad: string;
  /** That load's shipment, `MSN-#####`. */
  shipmentId?: string;
  shipmentReference?: string;

  /**
   * When the full load that produced this empty was collected.
   *
   * The chain draws `FULL collected → unloaded → EMPTY since`, and this is the
   * left-hand stamp. It is the booking's own `scheduledPickupTime` rather than
   * a delivery timestamp because a containerized booking's `completedAt` is
   * set when the *empty comes back*, not when the cargo arrived — quoting that
   * as the delivery moment would put the end of the cycle at its beginning.
   */
  fullPickupAt: number | null;
  /** When it was actually stripped and became available. The detention clock starts here. */
  emptyReadyAt: number | null;
  /** When Operations confirmed the pairing. */
  matchedAt: number | null;
  /** When a standalone return is planned for. */
  plannedReturnAt: number | null;
  /** When the box was confirmed back. Also `closedAt`. */
  returnedAt: number | null;
  /** The hard date the empty must be back. Null switches risk off entirely. */
  deadline: number | null;
  deadlineStatus: DeadlineVerification;

  stage: ContainerStage;
  outcome: ContainerOutcome | null;

  /** `CHN-#####`, or null when the container is not in a chain yet. */
  chainId: string | null;
  /** `CYC-#####`, or null while unmatched. */
  cycleId: string | null;
  /** 1-based position of this cycle inside its chain. */
  seq: number | null;
  nextFull: LinkedFullLoad | null;
  /** Free-text exception badge — only `EMPTY_RETURN_EXCEPTIONS` values occur. */
  exception: string | null;

  /**
   * The underlying cycle's own lifecycle word.
   *
   * Kept because the admin console reads it (`status === 'completed'` /
   * `'empty_ready'`) and because it is the honest reflection of the outbound
   * booking's real ladder. The Empty Container screens themselves switch on
   * `stage`, which is the decision, not the execution.
   */
  status: EmptyReturnStatus;
  /** Reserved for a forecast gate-in. Always null today — risk reads the deadline. */
  predictedGateIn: number | null;

  /**
   * Fleetin Impact, as the server judged it for this link — see `CycleImpact`
   * in the emissions feature. Optional: a row read off an unmatched booking,
   * or off the local store, carries none. `avoidedKm` is set only on the one
   * link per continuation trip that carries the count, so a chain can add
   * its links without adding the same trip twice.
   */
  impactStatus?: 'matched' | 'realized' | 'not_realized' | null;
  impactCounted?: boolean;
  avoidedKm?: number | null;
  avoidedCo2Kg?: number | null;
  /** What this leg actually emitted, from the booking. */
  co2EmissionsKg?: number | null;
}

/** The cycle lifecycle word, mirrored from the outbound booking's status. */
export type EmptyReturnStatus =
  | 'empty_ready'
  | 'preparing'
  | 'ready'
  | 'in_progress'
  | 'completed';

/**
 * One upcoming full load — the demand side of matching.
 *
 * Demand is never entered here. Every entry is a real open `Booking` created by
 * the Shipment module, which is why there is no "add a full load" action
 * anywhere in Empty Container Management: an opportunity that does not exist as
 * a shipment is not an opportunity.
 */
export interface FullLoadMission {
  /** The booking's `BKG-####`. */
  id: string;
  bookingId?: string;
  /** The full container's number. */
  container: string;
  type: ContainerFormat;
  size: ContainerSize;
  line: string;
  client: string;
  /** Matching key — compared against a record's own `locationId`. */
  locationId: string;
  locationName: string;
  pickupHub: string;
  destination: string;
  pickupAt: number;
  /** Human slot, e.g. `24/08 16:30`. */
  window: string;
  transporter: string | null;
  truck: string | null;
  status: string;
  shipmentId?: string;
  shipmentReference?: string;
}

/* ---------------------------------------------------------------------------
 * Matching
 * ------------------------------------------------------------------------- */

/** How strongly the engine recommends a pairing. Order is the sort order. */
export type SuggestionLabel = 'RECOMMENDED' | 'ALTERNATIVE' | 'LAST OPTION';

/**
 * One viable pairing, with the reasoning attached.
 *
 * `reasons` and `checks` exist because a score on its own is not an argument —
 * an operator confirming a pairing is committing a vehicle, and the screen has
 * to be able to say *why* before they do.
 */
export interface PairingSuggestion {
  record: EmptyReturnRecord;
  load: FullLoadMission;
  /**
   * Margin between the full load's pickup and the empty's return deadline.
   * **Negative** when the pickup currently falls after the deadline — that is a
   * pairing the operator can still take by moving the appointment, and the
   * figure is how much earlier it has to move. Zero when no deadline is known.
   */
  marginMs: number;
  /** Under six hours of positive margin — viable, but the last option, not the first. */
  tight: boolean;
  /** 45–98. Displayed as "Match {n}%". */
  score: number;
  label: SuggestionLabel;
  reasons: string[];
  /** Same location, so no repositioning leg at all. */
  sameLocation: boolean;
  /** What the operator must arrange to make this pairing real. Empty means nothing. */
  frictions: PairingFriction[];
}

/**
 * Something that stands between a pairing and the yard — but that a dispatcher
 * can arrange, unlike a different transporter or a 20′ box under a 40′ booking.
 *
 * These used to be hard vetoes, and on real data they refused *every* pairing in
 * the book: the four Djibouti ports are genuinely different places, so requiring
 * the return depot and the pickup hub to be one zone rejected all 92 pairs that
 * already agreed on transporter and size. Driving between two ports is a cost,
 * not an impossibility, and so is moving a pickup appointment — so they became
 * priced frictions the screen names, instead of silent refusals.
 */
export interface PairingFriction {
  kind: 'reposition' | 'reschedule' | 'no-deadline';
  /** Chip text. Short enough to sit on a card. */
  label: string;
  /** The sentence that says what has to be arranged. */
  detail: string;
}

/** A load that cannot take this container, with the reasons spelled out. */
export interface IncompatibleLoad {
  load: FullLoadMission;
  issues: string[];
}

/* ---------------------------------------------------------------------------
 * Calendar
 * ------------------------------------------------------------------------- */

/**
 * What kind of thing happened, which is the calendar's *primary* identity.
 *
 * Risk is a small badge on the card, never the card's own colour — an operator
 * scanning a week needs to see what the day is made of first and how urgent it
 * is second.
 */
export type EmptyReturnEventType =
  | 'empty_ready'
  | 'full_pickup'
  | 'paired'
  | 'return_planned'
  | 'deadline'
  | 'returned';

export interface EmptyReturnEvent {
  key: string;
  type: EmptyReturnEventType;
  /** Epoch ms. */
  at: number;
  title: string;
  /** The record this event belongs to, when it is about a container. */
  recordId?: string;
  /** The full load this event belongs to, when it is about demand. */
  loadId?: string;
  line: string;
  size: ContainerSize;
  risk: ReturnRiskLevel | null;
  /** Deadline events only — the deadline has already passed. */
  overdue?: boolean;
  /** Returned events only — it came back after the deadline. */
  late?: boolean;
  /** Pairing events only — margin between pickup and deadline. */
  marginMs?: number;
}

/* ---------------------------------------------------------------------------
 * Filtering
 * ------------------------------------------------------------------------- */

export type EmptyReturnStageFilter = 'all' | ContainerStage;
/**
 * `'action'` and `'on_track'` are the roll-ups the Control Tower's bands are
 * made of — overdue *or* critical for the first, and safe / protected / no
 * deadline for the last. Neither is a single `ReturnRiskLevel`, which is the
 * point: a band and the filter that opens it have to select the same records,
 * and `risk: 'safe'` selected one of the six the "On track" band was showing.
 *
 * It exists because the page renders three bands (action / monitor / on track)
 * and the filter strip above them could only address single risk levels, so the
 * strip advertised six states for a page that has three, and three of the six
 * ("Action required", "Return overdue", "Critical") were the same fact counted
 * two different ways.
 */
export type EmptyReturnRiskFilter = 'all' | 'action' | 'on_track' | ReturnRiskLevel;

export interface EmptyReturnFilters {
  q: string;
  stage: EmptyReturnStageFilter;
  risk: EmptyReturnRiskFilter;
}

/** Calendar-only filters. Kept apart from the queue's, because they answer a different question. */
export interface CalendarFilters {
  type: 'all' | EmptyReturnEventType;
  risk: EmptyReturnRiskFilter;
  line: string;
  size: string;
}

/** Dashboard-only filters — a reporting window, not a triage state. */
export interface PerformanceFilters {
  period: '1' | '7' | '30' | 'all';
  line: string;
  transporter: string;
  size: string;
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
  /** Stage `empty` with no exception — containers that still need a decision. */
  emptyReady: number;
  /** Stage `paired` — decided, handed to the Shipment module. */
  assigned: number;
  /** Stage `return_planned` — going back on their own, not yet confirmed. */
  standalone: number;
  /** Risk `critical`, open only. */
  critical: number;
  /** Risk `overdue`, open only. */
  overdue: number;
}

/**
 * One chain of connected cycles.
 *
 * A chain is a lineage, not a group: cycle *n+1* exists because its container
 * is the full load cycle *n* went out to collect. Every link past the first is
 * one empty return that was never driven.
 */
export interface CycleChain {
  id: string;
  /** Ascending by `seq`. */
  cycles: EmptyReturnRecord[];
  /** Supplies the header line: line · shipper · transporter. */
  first: EmptyReturnRecord;
  last: EmptyReturnRecord;
  /** Links that ended in a pairing — each one is an empty return avoided. */
  pairings: number;
  completed: number;
  /** The first non-closed cycle, or null when nothing is outstanding. */
  active: EmptyReturnRecord | null;
  onTime: number;
  /** The chain ended with a box going back to the depot on its own. */
  closedChain: boolean;
  maxSequence: number;
  /** Mean time each container spent empty before its decision. */
  averageEmptyMs: number;
  /**
   * Fleetin Impact across the chain: the `Free Zone → Garage → Port`
   * repositioning its realized links did not drive, summed over the links
   * that carry the count. Zero until a link is realized and measured.
   */
  avoidedKm: number;
  avoidedCo2Kg: number;
  /** What this chain's trucks actually put out. */
  actualCo2Kg: number;
  /** Links whose continuation physically happened. */
  realizedLinks: number;
  /** Realized links with no single truck to take a factor from — their saving
      is real but unpriced, so the kg figure understates it. */
  unpricedLinks: number;
}

/**
 * One transporter row.
 *
 * `containers` counts every box touched; the cycle figures count only records
 * that carry a cycle id. A carrier can be holding three boxes and running no
 * cycles at all, and the table should say so.
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

export interface ContainerStageMeta {
  label: string;
  /** Classes for the 6px dot. */
  dotClassName: string;
  /** Classes for the chip shell (background, text, border). */
  chipClassName: string;
}

export interface ReturnRiskMeta {
  label: string;
  className: string;
  /** Text-only colour, for a figure that carries the level without a pill. */
  textClassName: string;
}

export interface DeadlineVerificationMeta {
  label: string;
  /** Text colour. */
  className: string;
}
