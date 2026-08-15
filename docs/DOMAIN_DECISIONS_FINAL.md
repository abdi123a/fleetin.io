# FLEETIN — Final Domain Decisions

**Phase 2.1. This is the authoritative decision document.** Every 🔴-blocking
question raised in `DOMAIN_DECISIONS.md` is resolved below with evidence read
directly from source in this pass (not carried over unverified from Phase 2),
the reasoning that produced the decision, and its concrete consequences for
the database, the API, and the frontend. Nothing here is guessed — where
evidence runs out, that is stated, and the decision is scoped to what the
evidence actually supports.

**Still analysis only.** No Prisma models were created, no migrations were
run, and the existing finance schema was not touched. The one code change in
this phase was the auth security fix (`PART 1`, tracked separately) — see the
end-of-phase summary in the conversation, not this document.

---

## DD-01 — Shipper vs Partner

**Decision:** Two separate tables, `Shipper` and `Partner`, sharing a common
`Contact` sub-entity and a common polymorphic `Document` table. No merged
`Company` supertype.

**Evidence:**
- Disjoint status vocabularies: `Shipper.approvalStatus` (`Verified|Pending|Canceled`) is an onboarding-gate concept; `Partner.partnerStatus` (`Active|Suspended|Pending|Inactive`) is an operational-availability concept. These are not the same axis wearing different labels.
- Disjoint operational payload: `Shipper` carries `industry`, `companySize`, `projectsCount`; `Partner` carries `operatingRegions`, `serviceCategories`, `fleetSize`, embedded `vehicles[]`/`drivers[]`, `pricingGrid`, `bankAccount`. Merging would leave roughly half the columns null on every row, permanently, by construction.
- Identical identity block: `companyLegalName`, `registrationNumber`, `country`, `address`, primary contact, uploaded documents, logo — present on both, verbatim.
- `OnboardingRecord.entityType: 'Partner' | 'Shipper'` — one pipeline, two possible outcomes.
- Finance's `CounterpartyType = SHIPPER | TRANSPORTER | BANK | EMPLOYEE | VENDOR` already treats these as **distinct polymorphic targets**, alongside two others (`BANK`, `EMPLOYEE`) that obviously are not the same table. This pattern is evidence *for* keeping Shipper and Partner separate — it's already built to reference two different tables cleanly.
- Direct check this phase: `grep -rn "shipperId.*transporterId|transporterId.*shipperId" src/` returns **zero matches**. No code path anywhere checks or represents one company as being both a shipper and a partner at once.

**Reasoning:** The shared identity fields argue for a shared *shape*
(`Contact`, `Document`), not a shared *row*. A merged table would either grow
a `role` discriminator that behaves exactly like having two tables (same
complexity, worse ergonomics — every query needs a `WHERE role = ...` a join
gives for free), or force nullable columns that are always null on one side.
The status semantics genuinely differ in meaning, not just in label. Nothing
in the evidence shows a real company needing to be both at once; if that
requirement surfaces later, it is a `Partner.shipperId` (or vice versa)
nullable link — cheap to add, and far cheaper than un-merging a supertype
after the fact.

**Database consequence:** `Shipper` and `Partner` as specified in
`DATABASE_BLUEPRINT.md` §1.1–1.2, both pointing at a shared `Contact
{ownerType, ownerId}` (§1.3) and `Document {ownerType, ownerId}` (§6.1). No
schema change needed from what Phase 2 already proposed — this decision
*confirms* that shape rather than altering it.

**API consequence:** `/shippers` and `/partners` stay separate REST
resources (`API_BLUEPRINT.md` §1–2). No unified `/counterparties` endpoint —
nothing in the evidence shows a UI surface that needs to list both
interchangeably; even Onboarding's shared pipeline branches into one or the
other by `entityType` before creating anything (ties to DD-08, still
deferred).

**Frontend consequence:** None required. `ShippersPage`/`PartnersPage`,
`useShippers()`/`usePartners()` already assume separation
(`FRONTEND_BACKEND_MAPPING.md` §5–6) — this decision validates the existing
frontend structure rather than requiring it to change.

---

## DD-02 — Transporter, Partner, Vehicle, Driver

**Decision:** "Transporter" is not a table — it is `Partner` used in a
haulier capacity. `Partner → Vehicle` and `Partner → Driver` are both
exclusive `1 : N` ownership (a vehicle or driver belongs to exactly one
partner). No fleet-sharing or leasing model exists in evidence, so none is
invented.

**Evidence:**
- `shipmentBridge.findPartnerByName()` resolves `mission.transporter.company` by exact match against `PartnerRecord.companyLegalName`, and the store then writes that partner's real id back onto the shipment. This is a direct, mechanical proof already established and re-confirmed this phase.
- Structural check this phase: `partnerData.ts` nests `drivers: [...]` and `vehicles: [...]` **inside** each `PartnerRecord` object (three separate embedded arrays for the three partners, grep-confirmed at lines 60/65, 98/103, 131/134). A vehicle or driver id appearing under two different partners is not just unobserved — it is structurally impossible in the current model, because there is no top-level `vehicles` or `drivers` collection with a `partnerId` foreign key; each one only exists as a child of one partner's array.
- Content check this phase: every `serviceCategories` value across all three seeded partners is haulage-flavoured — `Container Haulage`, `Bulk Cargo`, `Refrigerated Transport`, `Tanker Transport`, `General Cargo`. No entry resembling `Customs Brokerage`, `Warehousing`, or `Clearing Agent` exists anywhere in the mock data. There is no evidence a Partner is ever anything *other than* a haulier in this corridor.

**Reasoning:** The `serviceCategories` field describes *what kind of cargo* a
partner hauls, not an alternate business role — the hypothesis that a Partner
might be a customs broker or warehouse operator instead of a transporter is
not supported by any seeded data. On vehicle/driver sharing: the embedding
structure is a strong signal about what the application has needed to
express so far (nothing beyond exclusive ownership), but it is not proof that
sharing can *never* be needed — owner-operators leasing to multiple brokers
is common in real freight markets. Absent evidence either way, the correct
move is to model the *narrower, evidenced* case (a real foreign key, still
exclusive) rather than speculatively building a many-to-many the application
has never asked for. A foreign key is also strictly easier to loosen into a
join table later than an embedded array is — this keeps the door open
without walking through it.

**Database consequence:** `Vehicle.partnerId` and `Driver.partnerId`, both
`RESTRICT` (`DATABASE_BLUEPRINT.md` §2.1–2.2). No `PartnerServiceCategory`
sub-table — `serviceCategories` stays a `Json` string array on `Partner`,
since nothing in evidence needs it to be a first-class, independently
queried entity yet.

**API consequence:** Vehicles and drivers are created through the parent —
`POST /partners/:id/vehicles`, `POST /partners/:id/drivers`
(`API_BLUEPRINT.md` §2). No "reassign to a different partner" endpoint in
v1; if fleet transfer between carriers becomes a real requirement, it should
be its own deliberate, audited action (`POST /vehicles/:id/transfer`), not a
silent side effect of a generic `PATCH`.

**Frontend consequence:** None. Existing pages already assume exclusive
partner ownership of fleet.

---

## DD-03 — Which shipment model is authoritative

*(Resolved in `DOMAIN_DECISIONS.md`, restated here in the requested format for completeness — this decision and DD-04 were resolved together, since neither made sense in isolation.)*

**Decision:** The BI contract's `Shipment` + `ShipmentEvent` + `Charge`
triple is the persistence model for **execution** — renamed one level down
to `Booking` + `BookingEvent` + `Charge` once DD-04 introduced a true parent
`Shipment` above it (see DD-04). `Mission`'s 12-value status ladder becomes
`Booking.status`.

**Evidence:** Read directly from `features/shipper-bi/contracts/entities.ts`
this phase: `shipmentSchema` types `transporterId: z.string()` (singular,
not an array), `vehicleId: z.string().optional()` (one, not many),
`containerId: z.string().optional()` (one, not many). That is not the shape
of a commercial order in a corridor where multi-truck shipments are routine
— it is the shape of **one truck's movement**. The contract's own docblock:
*"these schemas are the contract with the backend: `fleetin-backend` will
mirror them as Prisma models."* Its design principle — *"store events and
money, derive everything else"* — and its 11 ordered `STAGE_KEYS` (including
`empty_awaiting`/`empty_returned` as the terminal states) are real strengths
or a shipment model. But the entity it names `Shipment` was never modelling
the *commercial order* — nothing in the codebase was, until DD-04's evidence
(below) surfaced that a real order can need several such units.

**Reasoning:** The original DD-03 framing ("which of two candidates wins")
undersold what the evidence actually shows: neither `Mission` nor the BI
contract alone is a correct *order* model, because before this phase nothing
in the codebase distinguished order from execution at all. `Mission`
conflates them (one row trying to be both, and losing data when it can't —
see DD-04). The BI contract is a correct **execution** model wearing the
wrong name. Recognising that resolves DD-03 without having to declare either
original candidate the loser.

**Database consequence:** `Booking`, `BookingEvent`, `Charge`,
`DelayAttribution`, `Container` all now exist at the grain the BI contract
specified — see `DATABASE_BLUEPRINT.md` §4.2–4.5, §5.1. `MissionStatus` (12
values) and BI `STAGE_KEYS` (11 values) are confirmed to be **the same
concept at the same grain**, not two independent vocabularies — final
sign-off on which literal set of values to keep is DD-12, unchanged.

**API consequence:** Every "shipment" BI endpoint already specified in
`API_BLUEPRINT.md` §9 (`GET /shippers/:id/bi/*`) is unaffected — it already
operated at booking grain internally, it just needs its response envelope's
`shipmentId` fields relabelled `bookingId` for accuracy. New order-level
aggregation endpoints (`GET /shipments/:id` rolling up its bookings) are
genuinely new surface, not a relabelling.

**Frontend consequence:** `Mission.status` (currently read in ~a dozen
places per `FRONTEND_BACKEND_MAPPING.md` §3) splits into two reads:
`shipment.status` (coarse, for the order-level badge) and per-booking status
(for the execution pipeline / truck cards). This is real frontend work,
not free — every page currently treating a shipment as having one status
needs to decide which of the two it means.

---

## DD-04 — Is Booking a real entity

*(Resolved in `DOMAIN_DECISIONS.md`, restated here in the requested format.)*

**Decision:** Yes. `Shipment` (commercial order) `1 : N` `Booking` (one row
per truck/container). `partnerId`, `driverId`, `vehicleId`, execution status,
per-truck rate, and the POD document all move from `Shipment` to `Booking`.

**Evidence:**
1. `ShipmentOverviewPage.tsx` — ignores its own `:id` route param entirely; the six hardcoded booking cards render identically regardless of which shipment is open. Their `step: 'Step N of 6'` values map exactly onto `dashboardData.pipelineStages`. The mock *data* is disconnected fixture content, but the *shape* (`BookingPreviewItem`: own `partnerName`, `driverName`, `vehicleNumber`, `status`, `step`, `podDocument`, and **no `shipmentId` field at all**) is a real, well-formed proposal for a per-truck execution unit — verified by reading the type definition directly, not inferred from the page.
2. `CreateShipmentModal.tsx` — `transporterAssignments: { id, partnerId, vehicles: number, bookingIds: string[] }[]`. One shipment can name several carriers, each carrying several external DPCS booking references. `vehiclesNeeded = isContainer ? containerQuantity : 1` — one vehicle per container, directly in source.
3. The resulting data loss, read directly from `handleCreateShipment`:
   ```ts
   const newBookingId = transporterAssignments.flatMap(a => a.bookingIds).join(', ');   // N ids → one lossy string
   const primaryTransporter = INITIAL_PARTNERS.find(p => p.id === transporterAssignments[0]?.partnerId); // only the FIRST carrier survives
   rateFDJ: totalCostFDJ  // Σ across assignments, no per-carrier breakdown kept
   ```
   `Mission` can hold exactly one transporter/driver/vehicle. A genuine multi-truck, multi-carrier order is silently flattened the moment it's saved. This is not two names for one concept — it is one type failing to hold data the UI already collects from the user.

**Reasoning:** The wizard already lets an operator describe a shipment that
needs three trucks from two different carriers. Today, saving that shipment
throws away everything except the first carrier's identity and joins the
three booking numbers into an unparseable string. A backend that copies
`Mission` as-is would enshrine that data loss permanently. Booking is not a
design preference — it's the entity the UI's own data-entry flow already
implies and the persistence layer doesn't yet have.

**Database consequence:** Full field-by-field split specified in
`DATABASE_BLUEPRINT.md` §4.1 (`Shipment`) and §4.2 (`Booking`, new).
Cardinality and cascade-delete consequences across `EmptyReturnRecord`,
`Container`, `PaymentOrder`, `InvoiceLineItem` are in
`ENTITY_RELATIONSHIP_DIAGRAM.md` §1–3, §5.

**API consequence:** `POST /shipments` now creates one order plus N bookings
in one transaction (`API_BLUEPRINT.md` §5). `POST /shipments/:id/<verb>`
workflow endpoints (assign-vehicle, depart, arrive, …) move to
`POST /bookings/:id/<verb>`, since those transitions are per-truck. Payment
orders move from one-per-shipment to one-per-booking, which is what makes
"pay two different carriers for their share of one order" expressible at
all — it could not be expressed before.

**Frontend consequence:** The single biggest ripple in this whole analysis.
`CreateShipmentModal` stops discarding `transporterAssignments[1..N]` — every
assignment becomes a real booking, and the wizard's existing multi-assignment
UI (already built) finally has somewhere to send that data.
`ShipmentOverviewPage` gets a real data source instead of six hardcoded
cards, scoped to the actual shipment. `MissionRowCard`'s `NEXT_STATUS` ladder
moves to operate per-booking. This is substantial, necessary frontend work —
not a relabelling.

---

## DD-05 — Location

**Decision:** One canonical `Location` table with a `type` discriminator
(`PORT|TERMINAL|DEPOT|YARD|WAREHOUSE|FREE_ZONE|DRY_PORT|CUSTOMER_SITE`), an
`isReturnDepot` flag, and — new in this pass — a nullable
`parentLocationId` for sub-sites. The two existing `LOC-0N` id spaces are
**not merged by id** — they collide (see evidence) and must both be
re-issued fresh identifiers during seeding.

**Evidence, verified directly this phase (not carried over from Phase 2's
inference):**

```
LocationsPage.tsx (INITIAL_LOCATIONS)        emptyReturnData.ts (yards)
  LOC-01  TCDORALE — Terminal Conteneur         LOC-01  Boulaos Industrial Yard
          Doraleh
  LOC-02  DFZ — Djibouti Free Zone               LOC-02  Djibouti Free Zone —
                                                          Warehouse Block B-12
  LOC-03  DMP — Djibouti Multipurpose Port       LOC-03  PK12 Dry Port Yard
  LOC-04  DIFTZ — Djibouti International         LOC-04  Ali Sabieh Logistics Hub
          Free Zone
                                                  LOC-05  Nagad Inland Container Depot
```

Same reference format, **same `LOC-01`–`LOC-04` identifiers, different real
places** in three of four rows. This is a hard collision, not a naming
coincidence — confirmed by reading both files directly. And
location-ID equality is **the only hard matching rule** in the entire
empty-return engine (`evaluateMission`, BR-4.2) — this table is higher-stakes
than a typical reference table.

**Reasoning:** Looking past id equality, the *content* of the two lists is
not actually contradictory — it's plausibly hierarchical. `LOC-02`
("DFZ — Djibouti Free Zone") and the yard list's `LOC-02` ("Djibouti Free
Zone — Warehouse Block B-12") name the same free-trade zone at two different
levels of specificity: one is the zone, the other is a numbered block inside
it. The same pattern likely holds for `LOC-04`/DIFTZ. This is what a
`parentLocationId` is for: the broad infrastructure entities from
`LocationsPage` (port, terminal, free zone) become parent rows, and the
operational return yards from `emptyReturnData` become children pointing at
them where the naming supports it. **This inference is not certain** — it is
the most evidence-consistent reading available, and should be confirmed with
Operations before seeding, not assumed. Where a yard genuinely has no
matching parent (Boulaos, PK12, Ali Sabieh, Nagad), it stays a top-level
`YARD`-type row.

**Database consequence:** `Location` as specified in `DATABASE_BLUEPRINT.md`
§3.1, amended with `parentLocationId String?` (self-referential, `SET NULL`
on parent delete — a child yard outliving its zone record is a data problem
worth surfacing, not cascading away silently). `matchAliases` (the fragment
lists `resolveReturnLocation()` uses today) is preserved as data on each row
so the existing matching behaviour has a faithful migration path.

**API consequence:** `GET /locations?parentId=` filter, in addition to what
`API_BLUEPRINT.md` §4 already specifies. `resolveReturnLocation()`'s
string-fragment matching becomes a **seed-time / fallback** concern only —
once shipments carry a real `deliveryLocationId`, the empty-return matching
gate can compare ids directly instead of re-deriving a location from free
text on every read.

**Frontend consequence:** `LocationsPage`'s 4-field `LocationRecord` and
every `LOC-0N` reference inside the empty-return module both migrate to real
`Location` ids from one shared list — today they are two independent,
colliding lists rendered by two different pages, and after this change they
become one. `AddLocationForm`'s lat/lng map-click flow is unaffected.

---

## DD-10 — Money representation

**Decision:** The existing finance `Money` shape — integer minor units +
`scale` + `currency` + `fxRate` + `baseAmountMinorUnits`, exactly as Phase 1's
Prisma schema already has it — is canonical for the **entire** application,
operational domain included. No second money type is introduced for
shipments, bookings, or BI.

**Evidence — four incompatible representations exist today:**

| Representation | Units | Where |
|---|---|---|
| `Mission.rateFDJ: number` | whole francs | operational (`types/mission.ts`) |
| `Money {amount, scale, currency, fxRate, baseAmount}` | integer minor units | finance (**and Phase 1's live Prisma schema**) |
| BI `Charge.amount: number`, `currency: 'DJF'` | whole francs — *"minor units are overkill for DJF, which has no subunit in practice"* | shipper BI |
| transporter-BI `revenue`, `ratePerKm` | whole **USD** | carrier BI |

Plus `PricingTier.basePrice` in whole USD, and dashboard fixtures using float
millions and formatted strings (`'4.2M DJF'`). The shipper-BI module's own
`detention.ts` carries an explicit, named warning: an earlier draft rendered
a $50/day USD contract as "600 DJF" — an error of roughly 180×, from mixing
currencies without a clear, enforced peg.

**Reasoning:** Consistency with **already-built, live** Phase 1 infrastructure
is the deciding factor, not a greenfield preference. Introducing a second
money representation for the operational domain would recreate exactly the
bug class BI's own code warns about — a detention charge quoted in USD
silently mis-rendered as DJF because two parts of the system disagreed about
units. The `scale = 0` case inside the *same* `Money` shape already
accommodates "DJF has no real subunit" — BI's objection to minor units is
answered by the shape it already has, not by a second shape. `fxRate` fixed
at transaction time, never looked up retroactively, is already the finance
convention (BR-5.1) — extending it to `Booking`/`Charge` is applying a
pattern proven correct, not inventing one.

**Database consequence:** `Booking.rateMinorUnits/currency/fxRate/
baseAmountMinorUnits` and `Charge.*` (same four fields) as specified in
`DATABASE_BLUEPRINT.md` §4.2/4.4. No new Prisma type — reuse finance's `Money`
convention verbatim across every new operational monetary column.

**API consequence:** Every money field in every operational API response
serialises as the structured four-field shape, not a bare number. The
`USD_TO_DJF` peg (177.721, currently a frontend constant in
`transporter-bi/config.ts`) becomes a backend-owned, versioned value — the
backend is the only party allowed to fix an `fxRate` at transaction time.

**Frontend consequence:** Real migration work, not free. `rateFDJ: number` on
every shipment-shaped object retires; every currency-consuming component —
and Phase 2's inventory found many, across missions, empty-return detention
costs, and both BI modules — must switch to reading the structured shape
(via a shared `formatMoney()` helper) instead of a raw number. This should be
scoped as its own frontend task when Phase 3 implementation begins, not
treated as a side effect of "the backend now returns different JSON."

---

## DD-11 — Which counterparty mock data is canonical

**Decision:** `shippersData.ts`, `partnerData.ts`, and `missionsData.ts` are
canonical. `financeMockData.ts`'s conflicting shipper/partner names and ids
are **not** canonical and must not be seeded as-is.

**Evidence:**

| id | `shippersData.ts` / `partnerData.ts` | `financeMockData.ts` |
|---|---|---|
| SHP-102 | Al-Baraka Logistics Ltd | Horn Logistics Trading |
| SHP-103 | Red Sea Cargo Group | Djibouti Free Zone Import Co |
| SHP-104 | Horn Freight Express | Ethiopian Cargo Connect |
| PTR-002 | Horn Transit Solutions | Gulf Trans Logistics |
| PTR-003 | Al-Baraka Transport Co. | Babelmandeb Transport |

Breadth of integration, confirmed by direct grep this phase:
`shippersData`/`partnerData`/`missionsData` are read by `ShippersPage`,
`PartnersPage`, `ShipperDetailPage`, `MissionsPage`, `VehiclesPage`,
`DriversPage`, `shipmentBridge.findPartnerByName()`, the dashboard, **and**
`auth.store.ts`'s `DEMO_PRESETS` — which hardcodes `SHP-101` → AMINA FZCO and
`transporterId: 'TRP-01'` → Red Sea Express Ltd, matching the operational
mock files exactly. `financeMockData.ts` is read **only** by
`finance.store.ts` and the finance pages — no other module joins against its
shipper/partner names. File modification times show `financeMockData.ts` as
the most recently touched (Aug 8, 19:55 — later the same day as
`missionsData.ts` at 16:35), but recency is not the deciding signal here.

**Reasoning:** "Which mock file is real" is best answered by "which one the
running application already treats as real" — i.e. which one participates in
cross-module joins and demo identity, versus which one is an island nothing
else references. `financeMockData.ts` being an island — freshly authored,
never reconciled against the shipper/partner list every other module reads
— is the textbook signature of illustrative fixture data written for one
module in isolation. This is consistent with what Phase 1's own discovery
already established: the finance schema and its mock data were built as a
separately-evolving effort (its own README, its own docker-compose,
authored before this backend was wired to the rest of the app), not derived
from or checked against the operational mock data.

**Database consequence:** Phase 3 seeding must **not** import
`financeMockData.ts`'s counterparty references directly. Its illustrative
dollar amounts, dates, and invoice/payment-order shapes are fine to reuse as
realistic numbers — but every `shipperId`/`transporterId`/name they're
attached to must be corrected to reference the canonical `SHP-101..104` /
`PTR-001..003` identities from `shippersData.ts`/`partnerData.ts` before
seeding.

**API consequence:** None — this is purely a seed-data hygiene decision, not
a schema or endpoint decision.

**Frontend consequence:** None. The frontend's finance pages render whatever
the backend serves; this decision only constrains whoever writes the Phase 3
seed script.

---

## Canonical Entity Model

```
Shipper
├── Contact[]                    (ownerType='SHIPPER')
├── Document[]                   (ownerType='SHIPPER')
└── Shipment[]                   (1 : N, RESTRICT)

Partner
├── Contact[]                    (ownerType='PARTNER', dispatchers)
├── Document[]                   (ownerType='PARTNER')
├── PartnerBankAccount           (1 : 0..1)
├── PricingTier[]                (1 : N)
├── Vehicle[]                    (1 : N, RESTRICT — exclusive ownership, DD-02)
├── Driver[]                     (1 : N, RESTRICT — exclusive ownership, DD-02)
└── Booking[]                    (1 : N, RESTRICT — "transporter" IS Partner, DD-02)

Location                         (unified table, DD-05)
├── parentLocationId?            (self-referential — zone → block, inferred)
├── Shipment[]                   (pickup, delivery — order-level)
└── EmptyReturnRecord[]          (return yard, via Container → Booking)

Shipment                         (the commercial order — DD-03/DD-04)
├── shipperId                    → Shipper
├── pickupLocationId / deliveryLocationId  → Location
├── status                       (coarse rollup: DRAFT|CONFIRMED|IN_PROGRESS|COMPLETED|CANCELLED)
├── Document[]                   (required docs, order-level)
├── Invoice (M:N via missionIds) — unchanged, order-level billing
└── Booking[]                    (1 : N — one row per truck/container, NEW)
      ├── partnerId              → Partner
      ├── driverId? / vehicleId? → Driver / Vehicle
      ├── status                 (11-value STAGE_KEYS — was Mission's 12-value ladder)
      ├── rateMinorUnits         (Money shape — DD-10)
      ├── Container?             (1 : 0..1 — containerized only, no join table)
      │     └── EmptyReturnRecord[]        (the return workflow)
      │           └── EmptyReturnCycle?    (cycleId; chain is derived, GROUP BY)
      ├── BookingEvent[]         (stage timeline, was ShipmentEvent)
      ├── Charge[]               (money — DD-10; feeds Invoice line items)
      ├── DelayAttribution[]     (stored, never inferred)
      ├── Document? (POD)
      └── PaymentOrder           (1 : 1 — was 1:1 per Shipment, now per Booking)

Onboarding                       (its own pipeline; NOT yet linked to Shipper/Partner — DD-08, still open)
├── OnboardingAction[]
└── OnboardingComment[]

Finance                          (13 existing Prisma models — UNTOUCHED)
├── Invoice ⇄ Shipment           (M:N, soft, order-level — unchanged)
├── PaymentOrder → Booking       (1:1, soft — was → Shipment, DD-04 ripple)
├── LedgerEntry → Shipment|Booking (soft, AMBIGUOUS post-DD-04 — flagged, not resolved; finance schema not touched this phase)
└── CreditFacility → Drawdown → PaymentOrder  (unchanged)
```

---

## Backend authority rules

**The rule, stated once, that governs everything below:** every workflow
transition catalogued in `BUSINESS_RULES.md` currently has its guard
enforced in a **React component**, not in a store, not on a server. A
`PATCH`/`POST` reaching the backend is a *request*; whether the transition is
*legal* is decided entirely server-side, by re-reading current state, never
by trusting what the client sends. The frontend's job after Phase 3 is to
disable buttons for a *good user experience* — it is never the source of
truth for whether an action is allowed, and the backend must behave
correctly even if every frontend guard were deleted.

### Shipment (order) transitions

| Action | Legal FROM | TO | Backend must check |
|---|---|---|---|
| Confirm | `DRAFT` | `CONFIRMED` | shipper is `VERIFIED`; ≥1 booking exists |
| Start | `CONFIRMED` | `IN_PROGRESS` | at least one booking has left `created` |
| Complete | `IN_PROGRESS` | `COMPLETED` | **every** booking is in a terminal stage (`empty_returned` or `delivered` for non-containerized) |
| Cancel | `DRAFT \| CONFIRMED` | `CANCELLED` | no booking has progressed past `dispatched` — cancelling a shipment with trucks already moving is a different, unmodelled operation (flagged, not built) |

### Booking (execution) transitions — the old `MissionStatus` ladder, per truck

| Action | Legal FROM | TO | Backend must check |
|---|---|---|---|
| Assign vehicle | `created \| documentation` | next stage | vehicle belongs to the booking's `partnerId`; vehicle not already committed to an overlapping booking |
| Assign driver | after vehicle assigned | next stage | driver belongs to the same partner; driver's licence not expired (BR-7.4) |
| Depart | `gate_in` | `picked_up`/`in_transit` | vehicle + driver both assigned |
| Arrive | `in_transit` | `arrived` | **triggers `EmptyReturnRecord` creation** for containerized bookings — this is the cross-entity side effect `shipmentBridge.ts` performs client-side today; it must become a single backend transaction, not two API calls a client could interleave incorrectly |
| Submit POD | `unloading` | `delivered` | a POD document is attached |
| Complete | `delivered` | `empty_returned` | for containerized bookings, requires the linked `EmptyReturnRecord.status = 'completed'` — a booking cannot self-report done while its container is still out |

**No transition skips stages except the two the current frontend already
relies on** (BR-2.3): creating an empty-return cycle forces the *source*
booking toward `arrived`/`empty_awaiting` if it wasn't already there, and
cycle completion forces the spawned booking's container status. These two
must remain legal, explicit exceptions — not evidence that the ladder can be
skipped arbitrarily.

### EmptyReturnRecord transitions

Directly from `BUSINESS_RULES.md` BR-4.1, now with the backend as sole
enforcer (today: UI-only for every row marked so):

| Action | Legal FROM | TO | Backend must check (not just UI) |
|---|---|---|---|
| Mark empty ready | `unloading` | `empty_ready` | *(UI-only today — becomes real)* |
| Create cycle | `empty_ready` | `preparing` | `locationId` matches the chosen full-load booking's `locationId`; `exception IS NULL` (BR-4.2) |
| Confirm cycle | `preparing`, all 16 checklist items true | `ready` | *(UI-only today — becomes real)* checklist completeness re-verified server-side, not trusted from the client's last known state |
| Dispatch | `ready` | `in_progress` | *(UI-only today — becomes real)* |
| Advance milestone | `in_progress` | stays, or `completed` at ≥16 | at milestone 11, stamp `returnedAt` server-side from the server clock, never a client-supplied timestamp |
| Mark standalone | any | unchanged, sets `exception` | permanently excludes from matching — irreversible without a separate, audited override action |

### Cycle transitions

One-way, no cancel, no undo today (BR-4.6) — flagged as a real operational
gap in `DOMAIN_DECISIONS.md` DD-17, not resolved in this phase. Until DD-17
is confirmed, the backend must **not** invent a cancel path; it should
faithfully reproduce the one-way behaviour and let Operations decide whether
that gap needs closing.

### Payment approval (existing finance models — logic gaps only, schema untouched)

| Action | Backend must check |
|---|---|
| Approve payment order | Four-eyes: `approverId != createdById` unless approver role is `ADMIN` (BR-5.3) |
| Pay payment order | **Must require `status = 'Approved'` first** — today `payPaymentOrder` has no such guard (BR-5.6); this is a real defect, not a design choice, and must be fixed when the finance controllers are built |
| Approve expense | Role gate (`FINANCE_MANAGER\|ADMIN`) — **add four-eyes**, which expenses currently lack unlike payment orders (BR-5.3 vs BR-5.6 asymmetry) |
| Pay expense | **Must require `status = 'Approved'` first** — same missing guard as payment orders |
| Send invoice | **Must require `status = 'Draft'`** — today unguarded, will re-send a Paid invoice (BR-5.6) |
| Create drawdown | **Must check facility headroom before disbursing** — today `createDrawdown` never checks, headroom just floors at 0 after the fact (BR-5.7) |

### Document verification

| Action | Backend must check |
|---|---|
| Verify | actor holds `documents.verify` permission; document not already `Rejected` |
| Reject | requires a `rejectionReason`; sets status, does not delete |
| Upload | virus/type scanning at the storage boundary (Phase 1's `StorageService`, not a new concern) |
| Expiry | **computed at read time** (`expiryDate < now`), never written by a job — this avoids the "three separate 30-day implementations" defect already catalogued (BR-7.3) by making there be exactly one rule, evaluated on demand |

---

## What remains genuinely open

Everything in `DOMAIN_DECISIONS.md` marked 🟠/🟡/⚪ (DD-06 through DD-20) is
**unchanged by this pass** — those were not blocking and were not
re-examined here. Two are worth flagging as newly *sharpened* by this pass's
findings, not newly resolved:

- **DD-08** (does onboarding approval create the Shipper/Partner row?) is now
  more concrete: `OnboardingRecord.entityType` already selects which of the
  two DD-01-confirmed tables the record would create. The mechanism is
  clear; whether it fires automatically is still unconfirmed.
- **LedgerEntry's ambiguity** (Shipment vs Booking) is a new finding from
  DD-04's ripple, not a pre-existing DD — flagged in
  `ENTITY_RELATIONSHIP_DIAGRAM.md` §2 and left for whoever writes finance's
  own migration, since this phase does not touch the finance schema.

## Recommended next step

Phase 3 (business module implementation) can now proceed against a schema
with **zero open blocking questions** at the core-entity level. The
recommended build order from `FRONTEND_BACKEND_MAPPING.md` §12 still holds:
auth hardening (done, this phase) → BI read-only → reference data →
counterparties → shipments/bookings → empty returns (last, depends on
everything) → finance controllers → dashboard.
