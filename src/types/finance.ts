/**
 * FLEETIN Finance — type model.
 *
 * Fleetin's product is time: it pays the transporter ~2 days after delivery
 * and waits ~39 more for the shipper, borrowing from CAC Bank to cover the
 * gap. Everything here exists to track that loop — the payout engine that
 * gates money going out, the funding ledgers the gap is drawn against, and
 * the receivables that close it.
 *
 * ── The three tiers (restructured 2026-08-13) ───────────────────────────────
 *
 *   PROJECT  (PRJ-#####)  a body of work for one shipper
 *     └ SHIPMENT (SHI-#####)  one consignment — WHERE MONEY MOVES
 *         └ BOOKING (BKG-#####)  one container / one truck
 *
 * The tier that matters is the middle one. A shipment routinely splits across
 * two or three transporters — one hauls ten containers, another hauls ten more
 * — and Fleetin pays each of them ONCE for everything they carried on that
 * shipment, not once per container. So:
 *
 * - The BOOKING owns delivery and its proof, because each container arrives
 *   separately and is signed for separately, and owns what that container cost
 *   and what it is billed at.
 * - The SHIPMENT owns RELEASE, SETTLEMENT and both documents. There is exactly
 *   one release decision per shipment, one invoice to the shipper covering all
 *   its bookings, and one signed voucher per transporter covering the bookings
 *   that transporter delivered.
 *
 * Before this, the booking WAS the financial unit: releasing and paying happened
 * inside each container, so a twenty-container shipment across two hauliers meant
 * twenty releases and twenty payments for work that is two payments.
 *
 * ── Modelling rules this file enforces by shape ─────────────────────────────
 *
 * - `clientRateDjf` is nullable. A booking can exist before it is priced, and
 *   an unpriced booking must surface as unpriced — never as a zero margin.
 * - Funding source and origination channel are TWO fields. Shipments have been
 *   tagged DPCS and a credit line simultaneously, so whether DPCS is a source
 *   or a channel is an open business decision — both interpretations stay
 *   representable until it is made.
 * - Stages are DERIVED from transition timestamps, never stored, so a record
 *   cannot contradict its own history.
 * - A settlement is DERIVED by grouping cost lines; it is never a stored total
 *   that could drift from the lines it sums.
 * - Balances (drawn, available, DSO, margins) are computed in `@/lib/finance`,
 *   never stored as input.
 *
 * All amounts are whole Djiboutian francs (DJF, zero-decimal currency).
 * All references come from `@/lib/ids` — never hand-written.
 */

// ─── Funding ────────────────────────────────────────────────────────────────

/**
 * Where the money that fronts a payout comes from. The mechanics of the payout
 * engine are identical across all three; who eats a default is not.
 *
 * `dpcs` is carried as a type because today's records treat it as one — but
 * the evidence says it may really be an origination channel. See
 * `OriginationChannel` and the decision flag on the Funding page.
 */
export type FundingSourceType = 'contract_facility' | 'client_credit_line' | 'dpcs';

/** Whose loss a client default is. The system must never blur these. */
export type RiskBearer = 'fleetin' | 'bank' | 'undecided';

/**
 * How the work arrived, independent of which pool of money funds it.
 * Kept separate from `FundingSourceType` on purpose — see the DPCS note.
 */
export type OriginationChannel = 'fleetin_direct' | 'dpcs';

export interface FundingSource {
  id: string; // e.g. CF-2026-AMINA, CL-2026-SALT
  type: FundingSourceType;
  /** Display name, e.g. "AMINA FZCO contract facility". */
  name: string;
  bankName: string; // CAC Bank
  /** Contract facilities and credit lines both hang off a client. */
  clientId?: string;
  /** The signed shipper contract a facility is priced against. */
  contractRef?: string;
  /** Ceiling (facility) or allocation (DPCS). Whole DJF. */
  ceilingDjf: number;
  /**
   * Annual cost-of-capital rate as a fraction (0.06 = 6%). CAC currently
   * charges nothing, so this is 0 — but it flows through every margin
   * calculation. If the bank's compensation turns out to be embedded in how
   * ceilings are priced, this is where it lands. NEVER hardcode zero in the
   * calculation path; always read this field.
   */
  costOfCapitalRate: number;
  /**
   * contract_facility -> 'fleetin' (Fleetin is the borrower; a client default
   * still leaves Fleetin owing the bank). client_credit_line -> 'bank' (the
   * client is the borrower; collections sit with the bank). dpcs ->
   * 'undecided' until the DPCS question is settled.
   */
  riskBearer: RiskBearer;
  openedAt: string; // ISO date
  note?: string;
}

/**
 * One movement on a funding source's ledger. Balances are always computed by
 * replaying these — `resultingBalance` is derived in the view layer.
 *
 * Contract facilities are POOL-based: a repayment reduces the running balance
 * and is deliberately NOT matched to any draw or invoice. Credit lines are
 * REVOLVING: a client repayment restores available balance. Same arithmetic,
 * different debtor — the model keeps no draw↔invoice pairing for either.
 */
export interface LedgerMovement {
  id: string; // DRW-##### / RPY-#####
  fundingSourceId: string;
  kind: 'draw' | 'repayment';
  amountDjf: number;
  date: string; // ISO datetime
  /**
   * A draw funds one SHIPMENT's payout — the whole consignment is released and
   * drawn in one event, so the draw is shipment-scoped, not booking-scoped.
   * Repayments never link one; pool repayments are unmatched by design.
   */
  shipmentId?: string;
  /** Draws start unconfirmed until the bank confirms disbursement. */
  confirmed: boolean;
  note?: string;
}

// ─── Proof of delivery ──────────────────────────────────────────────────────

/**
 * The two proofs a delivery must carry. BOTH are required — they answer
 * different questions and neither substitutes for the other:
 *
 * - `signed_pdf`   — the printed delivery note the receiver signed. The legal
 *                    document; it is what a client dispute is settled against.
 * - `delivery_photo` — a photograph taken at the drop. Evidence the goods
 *                    physically arrived in the state claimed.
 *
 * A signature with no photo cannot show condition; a photo with no signature
 * proves nothing was accepted. Requiring both is the whole point.
 */
export type PodDocumentKind = 'signed_pdf' | 'delivery_photo';

export interface PodDocument {
  kind: PodDocumentKind;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  uploadedBy: string;
  /**
   * Object URL for in-session preview only. Deliberately NOT persistence —
   * when a real document service exists this becomes its stored reference.
   */
  previewUrl?: string;
}

/**
 * One container's delivery record — the booking's half of the payout engine.
 *
 * Proof is per BOOKING and always will be: twenty containers arrive at twenty
 * moments and are signed for twenty times. What the shipment does with twenty
 * proofs is decide, once, whether money may leave.
 */
export interface DeliveryProof {
  /**
   * This container's work finished. Undefined while it is still moving —
   * which is what makes "18 of 20 delivered" a state the model can hold
   * rather than a number a screen has to invent.
   */
  completedAt?: string;
  /** PoD confirmed. Starts the client's payment terms for this booking. */
  podSentAt?: string;
  /**
   * The proofs behind `podSentAt`. PoD cannot be confirmed until both kinds
   * are attached, so a `podSentAt` with an incomplete set is not a state the
   * engine can produce.
   */
  podDocuments: PodDocument[];
}

/** Where one container has got to. Derived from `DeliveryProof` timestamps. */
export type BookingStage = 'in_transit' | 'awaiting_pod' | 'proven';

// ─── Holds ──────────────────────────────────────────────────────────────────

export type HoldCategory = 'weight_mismatch' | 'damage' | 'documentation' | 'other';

/**
 * A dispute that stops money on a shipment.
 *
 * Holds sit on the SHIPMENT even when the damage is to one container, because
 * a hold's only job is to stop money and money leaves at shipment level. The
 * container that caused it is named in `bookingId` — nothing is lost, and
 * there is exactly one list to check before releasing.
 *
 * A hold PAUSES the validation counter; it never resets it. A hold cleared two
 * days after being raised at hour 30 resumes the window at hour 30 — resetting
 * would make a dispute cost the transporter their entire wait, which destroys
 * the fast-payment promise the business is built on.
 */
export interface PayoutHold {
  id: string; // HLD-#####
  /** The booking this dispute is about, when it is about one. */
  bookingId?: string;
  category: HoldCategory;
  reason: string;
  raisedBy: string;
  raisedAt: string; // ISO datetime
  clearedAt?: string;
  clearedBy?: string;
  note?: string;
}

// ─── Cost lines ─────────────────────────────────────────────────────────────

export type CostType =
  | 'transport'
  | 'handling'
  | 'customs'
  | 'escort'
  | 'demurrage'
  | 'fuel_surcharge'
  | 'other';

/** How the money physically reached the transporter. */
export type PaymentMethod = 'bank_transfer' | 'mobile_money' | 'cash' | 'cheque';

/**
 * What one container cost, split by who is owed for it.
 *
 * A booking routinely involves several paid parties — one hauls, a handling
 * firm loads and unloads, an escort runs the corridor. Each is a line.
 *
 * Lines are NOT paid one at a time any more. They are the raw material the
 * shipment groups by counterparty into a single settlement: ten transport
 * lines across ten containers become one payable row of ten times the amount,
 * settled with one transfer under one `PAY-#####` reference. `paidAt` is
 * therefore written by a shipment-level settlement, never by a click on a
 * single container.
 *
 * The UI calls every counterparty a TRANSPORTER, by the user's instruction
 * 2026-08-13: finance had been saying "supplier" and "transporter" for the
 * same row. The line's `type` still carries the real role, so nothing is lost.
 */
export interface CostLine {
  id: string; // LEG-#####
  type: CostType;
  /** Partner id where the counterparty is a registered transporter/firm. */
  counterpartyId: string;
  counterpartyName: string;
  amountDjf: number;
  paidAt?: string;
  /** How it was paid. Set with `paidAt` by the settlement that covered it. */
  paidVia?: PaymentMethod;
  /** The `PAY-#####` voucher this line was settled under. */
  paymentId?: string;
  /** Bank reference / mobile-money transaction id — what reconciliation joins on. */
  paymentRef?: string;
}

// ─── Project ────────────────────────────────────────────────────────────────

/** Where a booking's client price came from. */
export type RateSource = 'contract_tariff' | 'spot' | 'manual_override';

/**
 * A body of work for one client — the layer between the client relationship
 * and the individual consignments.
 *
 * A project is where the commercial agreement actually lives: it carries the
 * channel it arrived through, the funding it draws on, and the contract it was
 * priced against. Its shipments inherit those but are released, billed and
 * settled independently, because a project completes one consignment at a time.
 */
export interface FinanceProject {
  id: string; // PRJ-#####
  reference: string;
  /** What the client calls it, e.g. "Q3 electronics corridor". */
  name: string;
  clientId: string;
  /** Fleetin-originated or DPCS-originated. Drives the top-level tabs. */
  channel: OriginationChannel;
  /** Default funding for the project's shipments; a shipment may differ. */
  fundingSourceId: string;
  contractRef?: string;
  startedAt: string;
  /**
   * When the signed contract expires. Undefined/null for spot work or an
   * open-ended agreement. Drives the contract-ending reminder and is the
   * trigger for closing the project out with a final invoice.
   */
  contractEndAt?: string | null;
  status: 'active' | 'completed';
  /** Free-text scope line shown under the project name. */
  scope?: string;
}

// ─── Booking ────────────────────────────────────────────────────────────────

/**
 * What is actually on the truck.
 *
 * Cargo type drives handling, escort and demurrage exposure far more than
 * route does, so it is a first-class field rather than something to be parsed
 * back out of the cargo description.
 */
export type CargoType = 'containerized' | 'bulk' | 'machinery';

/**
 * One delivery — a single container or a single vehicle, moved end to end by
 * one transporter.
 *
 * This is the operational handle everyone outside finance uses: one booking is
 * one truck arriving at one destination. It owns its route, its proof, its
 * price and its costs — and owns NO payment decision. Money is decided one
 * tier up, on its shipment.
 */
export interface FinanceBooking {
  id: string; // BKG-#####
  /** The consignment this container belongs to. Never null — every booking has one. */
  shipmentId: string;
  /** The box or plate, e.g. MSCU-889-2314. Operational, not a Fleetin reference. */
  containerNumber?: string;
  cargoType: CargoType;
  cargoSummary: string;
  origin: string;
  transitPoints?: string[];
  destination: string;
  /** Who hauled THIS container. Bookings on one shipment may differ. */
  transporterId: string;
  /**
   * What Fleetin bills the shipper for this container, whole DJF. NULL until
   * priced — a booking can be delivered and proven unpriced. Never render as 0.
   */
  clientRateDjf: number | null;
  /** Unset while unpriced. */
  rateSource?: RateSource;
  proof: DeliveryProof;
  costLines: CostLine[];
}

// ─── Shipment ───────────────────────────────────────────────────────────────

/**
 * Release state for one consignment. The shipment's half of the payout engine.
 *
 * There is one `releasedAt` per shipment because there is one release DECISION
 * per shipment: the desk looks at every booking's proof, at any open dispute,
 * and authorises the whole consignment's money to leave in one act.
 */
export interface ShipmentPayout {
  /** Money authorised to leave. Requires every booking proven and no open hold. */
  releasedAt?: string;
  releasedBy?: string;
  /** Disputes freezing this shipment's money. See `PayoutHold`. */
  holds: PayoutHold[];
}

/**
 * The four stations a shipment moves through.
 *
 * `awaiting_pod` — at least one booking is unproven; the release cannot happen
 *                  and the blocking bookings must be named, loudly. This is an
 *                  operations failure creating a financial liability.
 * `ready`        — every booking proven, no open hold: release is live.
 * `released`     — money authorised; settlements are payable.
 * `settled`      — every transporter on this shipment has been paid.
 */
export type ShipmentStage = 'awaiting_pod' | 'ready' | 'released' | 'settled';

/**
 * One consignment — the unit money moves in.
 *
 * A shipment is the answer to "what did we deliver for this client, and who do
 * we owe for it". It carries its bookings' release, the single invoice that
 * bills the shipper for all of them, and the settlements that pay each
 * transporter once for everything they carried.
 */
export interface FinanceShipment {
  id: string; // SHI-#####
  /** The client's own reference — BL number, order number, whatever they quote. */
  reference?: string;
  /**
   * The project this consignment belongs to, or NULL for a one-off.
   *
   * Not every shipment is project work: clients call for single consignments
   * that never become a programme, and those must still be billed, funded and
   * chased. A null here is a legitimate state, not missing data.
   */
  projectId: string | null;
  clientId: string;
  clientContractRef?: string;
  /** Which pool of money fronts this payout. */
  fundingSourceId: string;
  /** How the work arrived — independent of funding. See DPCS note. */
  originationChannel: OriginationChannel;
  openedAt: string;
  payout: ShipmentPayout;
  /** Set once the client invoice covering this shipment's bookings is issued. */
  invoiceId?: string;
}

// ─── Settlement ─────────────────────────────────────────────────────────────

/** One booking's contribution to a transporter's settlement — a voucher line. */
export interface SettlementLine {
  bookingId: string;
  containerNumber?: string;
  destination: string;
  cargoSummary: string;
  /** Every cost line this counterparty holds on this booking, summed. */
  amountDjf: number;
  paidAt?: string;
  /** The cost lines behind `amountDjf`, so the voucher can itemise if needed. */
  costLineIds: string[];
}

export type SettlementStatus = 'blocked' | 'payable' | 'part_paid' | 'paid';

/**
 * What one transporter is owed for one shipment — the whole point of the
 * restructure.
 *
 * DERIVED by grouping the shipment's cost lines by counterparty, never stored:
 * a stored total could drift from the lines it claims to sum, and this total
 * is what a transporter signs for.
 *
 * A transporter who delivered ten of a shipment's twenty bookings appears here
 * ONCE, with `bookingsCount: 10` and the ten amounts summed. That is one row,
 * one Pay action, one bank transfer, one signed voucher.
 */
export interface TransporterSettlement {
  transporterId: string;
  transporterName: string;
  /** The bookings this transporter delivered on this shipment. */
  lines: SettlementLine[];
  bookingsCount: number;
  /** Everything owed for those bookings, paid or not. */
  totalDjf: number;
  paidDjf: number;
  /** Owed and not yet paid. Zero while the shipment is unreleased or held. */
  payableDjf: number;
  status: SettlementStatus;
  /** The voucher this settlement was paid under, once it has been. */
  paymentId?: string;
}

/**
 * A transporter's payment for one shipment — and the receipt he signs for it.
 *
 * Stored, unlike the settlement that produced it, because it IS a document:
 * `PAY-#####` is printed, handed over on collection, and signed. One payment
 * covers every booking that transporter delivered on that shipment.
 */
export interface ShipmentPayment {
  id: string; // PAY-#####
  shipmentId: string;
  transporterId: string;
  transporterName: string;
  /** Exactly the bookings covered — what the voucher lists. */
  bookingIds: string[];
  amountDjf: number;
  paidAt: string;
  paidVia: PaymentMethod;
  /** Bank reference / mobile-money transaction id. */
  paymentRef?: string;
  paidBy: string;
  /**
   * Set when the transporter signs the voucher on collection. Unset means the
   * money moved but the signed receipt is not back yet — a real, common gap,
   * and one the desk has to be able to see.
   */
  acknowledgedAt?: string;
  acknowledgedBy?: string;
}

// ─── Receivables ────────────────────────────────────────────────────────────

export interface InvoiceReminder {
  sentAt: string;
  by: string;
  note?: string;
}

/**
 * The shipper's document: one invoice for one shipment, covering every booking
 * on it.
 *
 * Issued when the shipment's proof is complete (that event starts the payment-
 * terms clock), due at issue + the client's terms, and — in practice — settled
 * around day 41 against 30-day terms.
 */
export interface ClientInvoice {
  id: string; // INV-#####
  /** The consignment billed. One invoice per shipment. */
  shipmentId: string;
  clientId: string;
  /** Every booking on the invoice — the lines the client sees. */
  bookingIds: string[];
  amountDjf: number;
  issuedAt: string;
  dueAt: string;
  paidAt?: string;
  /**
   * In-house chasing applies to contract facilities only (Fleetin's risk).
   * Credit-line invoices are the bank's to collect — no reminders here.
   */
  reminders: InvoiceReminder[];
}

export interface FinanceClient {
  id: string; // joins ShipperRecord.id — SHP-###, a party key, not minted here
  name: string;
  logoUrl?: string;
  contractRef?: string;
  paymentTermsDays: number;
}

export interface FinanceTransporter {
  id: string; // joins PartnerRecord.id — PTR-###, a party key
  name: string;
  logoUrl?: string;
}

// ─── Settings ───────────────────────────────────────────────────────────────

/**
 * Margin thresholds drive warning states. The VALUES are a business decision
 * that has not been made — these defaults are placeholders to make the states
 * demonstrable, surfaced as editable settings and flagged for confirmation.
 * The floor is an advisory flag, never an automatic block (also flagged).
 */
export interface FinanceSettings {
  targetMarginPct: number;
  marginFloorPct: number;
  /** 48 by deliberate trade-off: fast enough to feel like fast payment, long enough to catch fraud. */
  validationWindowHours: number;
  /** The payment promise transporters accept a discount for, in days after release. */
  payoutPromiseDays: number;
}
