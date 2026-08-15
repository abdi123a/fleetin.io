# FLEETIN — Open Domain Decisions

**Every question here is one the existing code cannot answer. Nothing below is guessed.**

Each entry states what the code *does* show, what remains genuinely unknown, and a recommendation. **A recommendation is not a decision** — Phase 3 should not start on any 🔴 item until it is confirmed.

| Priority | Meaning |
|---|---|
| 🔴 **BLOCKING** | Schema cannot be written without an answer |
| 🟠 **HIGH** | Wrong choice means a painful later migration |
| 🟡 **MEDIUM** | Affects one module |
| ⚪ **LOW** | Can be deferred past Phase 3 |

> **Phase 2.1 (this pass) resolved all seven 🔴 blocking items.** DD-03 and
> DD-04 are resolved in place below, since they also required rewriting
> `DATABASE_BLUEPRINT.md` and `ENTITY_RELATIONSHIP_DIAGRAM.md`. DD-01, DD-02,
> DD-05, DD-10 and DD-11 keep their original entries below **as the evidence
> record** — their resolutions, with full DB/API/frontend consequences, are in
> **`DOMAIN_DECISIONS_FINAL.md`**, which is now the authoritative decision
> document. Read that file first; come back here for the underlying evidence.

---

## 🔴 DD-01 — Are Shipper and Partner one entity or two?

**Evidence for two:** different status enums (`Verified|Pending|Canceled` vs `Active|Suspended|Pending|Inactive`), completely disjoint operational payloads, separate pages, separate mock files, and no code path treats them interchangeably.

**Evidence for one:** identical company-identity block (legal name, registration number, country, address, primary contact, documents, logo); onboarding runs **one pipeline for both** (`EntityType = 'Partner' | 'Shipper'`); finance addresses both through one polymorphic pair (`counterpartyType` + `counterpartyId`).

**Unknown:** can one real company be **both** a shipper and a transporter? Nothing in the code decides this, and in this corridor it is commercially plausible.

**Recommendation:** two tables (`Shipper`, `Partner`) sharing `Contact` and `Document`. Revisit only if the same company must appear on both sides.

**Blocks:** all of `DATABASE_BLUEPRINT.md` §1.

---

## 🔴 DD-02 — Is "Transporter" ever anything other than a Partner?

**Evidence it is a role of Partner:** `findPartnerByName()` matches `mission.transporter.company` against `PartnerRecord.companyLegalName`, and the store then stamps that partner's id onto the shipment. **This is confirmed, not assumed.**

**Unknown:** `PartnerRecord.serviceCategories: string[]` implies partners may be more than hauliers (customs brokers? warehouse operators? clearing agents?). If so, `partnerStatus`, compliance rules and the pricing grid may need to vary by category.

**Recommendation:** one `Partner` table with a `serviceCategories` enum array; treat "transporter" as `serviceCategories includes TRANSPORT`.

---

## ✅ DD-03 — Which shipment model is authoritative? — RESOLVED (Phase 2.1)

**Decision: the BI triple (`Shipment` + `ShipmentEvent` + `Charge`), renamed one
level down to `Booking` + `BookingEvent` + `Charge`, is the persistence model.
`Mission`'s 12-status ladder becomes `Booking.status`. A new, coarser
`Shipment` (commercial order) sits above it as a genuine parent, not a rename.**

**The evidence that settled it, read directly from source (not from the two
candidates' own self-description):** the BI `shipmentSchema`
(`features/shipper-bi/contracts/entities.ts`) types `transporterId: string`
(singular), `vehicleId: string().optional()` (one, not many) and
`containerId: string().optional()` (one, not many). That is not the shape of
a commercial order — Djibouti–Addis orders routinely need several trucks — it
is the shape of **one truck's movement**. So the "which of the two candidates
wins" framing in the original question was slightly wrong: neither wins
outright. The BI contract wins the argument about *how to model execution*
(event-sourced, per-charge money, 11 ordered `STAGE_KEYS` including
`empty_returned` as terminal — closing the loop with Empty Return natively
instead of via the ad-hoc cross-store calls `shipmentBridge.ts` uses today).
But it was never modelling the *order* at all, because nothing in this
codebase was, until DD-04 (below) surfaced that gap.

**Confirms:** `MissionStatus` and BI `STAGE_KEYS` are **not** the same ladder
in two vocabularies — they are different concepts at different grains.
`MissionStatus`/`STAGE_KEYS` describes one truck's physical progress
(`Booking.status`); the new `Shipment.status` is a coarse commercial rollup
(`DRAFT|CONFIRMED|IN_PROGRESS|COMPLETED|CANCELLED`).

**Full spec:** `DATABASE_BLUEPRINT.md` §4. **Reasoning restated in full, with DB/API/frontend consequences:** `DOMAIN_DECISIONS_FINAL.md` DD-03.

---

## ✅ DD-04 — Is Booking an entity? — RESOLVED (Phase 2.1)

**Decision: yes. `Shipment` (order) `1 : N` `Booking` (one row per truck/container).**

**Evidence, verified directly against source (not the Phase 2 summary):**

1. **`ShipmentOverviewPage.tsx`** ignores its own `:id` route param entirely — the six hardcoded "booking" cards (`1173`–`1178`) render identically no matter which shipment is open, and their `step: 'Step N of 6'` values map exactly onto `dashboardData.pipelineStages` (Dispatched → Port Entry → Free Zone Delivered → Pending Empty Return → Empty Returned → Payment Released). The mock *data* is disconnected fixture content — but the *shape* it renders (`BookingPreviewItem`: own `partnerName`, `driverName`, `vehicleNumber`, `status`, `step`, `podDocument`, **no `shipmentId` field at all**) is a genuine, well-formed proposal for a per-truck execution unit.
2. **`CreateShipmentModal.tsx`** — `transporterAssignments: { id, partnerId, vehicles: number, bookingIds: string[] }[]` lets one shipment name **several carriers**, each carrying **several external DPCS booking references**. `vehiclesNeeded = isContainer ? containerQuantity : 1` — one vehicle per container.
3. **The resulting data loss, confirmed by reading `handleCreateShipment` directly:**
   ```ts
   const newBookingId = transporterAssignments.flatMap(a => a.bookingIds).join(', ');   // several ids → one lossy string
   const primaryTransporter = INITIAL_PARTNERS.find(p => p.id === transporterAssignments[0]?.partnerId); // only the FIRST carrier survives
   rateFDJ: totalCostFDJ  // = Σ (assignment.vehicles × resolvePartnerRateFDJ(partner, vehicleType)) — a sum with no per-carrier breakdown kept
   ```
   `Mission` can hold only one transporter/driver/vehicle, so a real multi-truck, multi-carrier order is silently flattened on save. This is not two words for one concept — it is one type failing to represent data the UI already collects.

**Resolves the field-migration question directly:** `partnerId`, `driverId`,
`vehicleId`, the 12-value execution status, the per-truck rate, and the POD
document all move from `Shipment` to the new `Booking`. `Shipment` keeps
shipper identity, overall cargo definition, route, order-level dates, the
summed rate, and order-level payment/lifecycle status. Full field-by-field
spec: `DATABASE_BLUEPRINT.md` §4.1–4.2. Cardinalities and the ripple into
`EmptyReturnRecord`, `Container`, `PaymentOrder` and `InvoiceLineItem`:
`ENTITY_RELATIONSHIP_DIAGRAM.md` §1–3.

**What's still open:** the exact `Booking.status` vocabulary is proposed (11-value BI `STAGE_KEYS`) but not finally signed off — that's **DD-12**, unchanged. And whether a `transporterAssignment`'s vehicle *count* should be individually named vehicles at creation time, or filled in progressively per booking (current evidence: the latter — `BookingPreviewItem` shows driver/vehicle assigned per card, not all at once).

---

## 🔴 DD-05 — What is a Location, and what are the five yards?

Four vocabularies exist: embedded `LocationInfo` free text on shipments; `LOC-01`…`LOC-05` matched by lowercase string fragments in `resolveReturnLocation()`; `LocationRecord {id, city, cityLabel, address, addressLabel}` on `/locations`; and `LOC-X-${SLUG}` fallbacks.

**This is not cosmetic:** location-ID equality is the **only hard matching rule** in the empty-return engine (BR-4.2).

**Unknowns:**
1. Are the five yards operational reference data (admin-managed) or a fixed corridor constant?
2. Should pickup/delivery locations be the *same* table as return depots? A customer warehouse is a delivery point but not a return yard.
3. What happens to the `LOC-X-*` fallbacks — auto-created records pending review, or rejected?

**Recommendation:** one `Location` table with a `type` enum and `isReturnDepot` flag; migrate the fragment lists into a `matchAliases` column so today's behaviour is preserved as data rather than code.

---

## 🔴 DD-10 — Which money representation wins?

Four incompatible ones ship today:

| Representation | Units | Where |
|---|---|---|
| `Mission.rateFDJ: number` | whole francs | operational |
| `Money {amount, scale, currency, fxRate, baseAmount}` | integer minor units | finance (**and the existing Prisma schema**) |
| BI `Charge.amount: number` | whole francs — *"minor units are overkill for DJF"* | shipper BI |
| transporter-BI `revenue` | whole **USD** | carrier BI |

Plus `PricingTier.basePrice` in USD and dashboard fixtures using float millions and strings.

**Unknowns:** is DJF genuinely zero-decimal in this business (the schema's `scale` says yes)? Who owns the `USD_TO_DJF = 177.721` peg — is it fixed, or does it float per transaction? Detention is contractually **USD $50/container/day** while the ledger is DJF, and the code carries an explicit warning about a ~180× rendering error (BR-6.16).

**Recommendation:** the existing Prisma `Money` convention everywhere; convert at ingestion, never at display. Confirm the peg's authority.

**Blocks:** every monetary column.

---

## 🔴 DD-11 — Which counterparty list is real?

The same identifiers denote **different companies** in different mock files:

| id | `shippersData.ts` | `financeMockData.ts` |
|---|---|---|
| SHP-102 | Al-Baraka Logistics Ltd | **Horn Logistics Trading** |
| SHP-103 | Red Sea Cargo Group | **Djibouti Free Zone Import Co** |
| SHP-104 | Horn Freight Express | **Ethiopian Cargo Connect** |
| PTR-002 | Horn Transit Solutions | **Gulf Trans Logistics** |
| PTR-003 | Al-Baraka Transport Co. | **Babelmandeb Transport** |

`MSN-2026-8801` likewise has different cargo, customer and a rate differing ~53× between the two files. Also: five `PO-2026-*` ids referenced by drawdowns don't exist, and `VEH-104` isn't in PTR-002's fleet.

**Unknown:** which list reflects the real business? Are these two eras of the same demo, or two different customer sets?

**Recommendation:** treat **neither** as production seed data. Build a clean seed from a confirmed real list. Do not attempt to reconcile the mocks.

---

## 🟠 DD-06 — Can a driver operate multiple vehicles?

Today: `PartnerDriver.assignedVehicleId` ⇄ `PartnerVehicle.assignedDriverId`, both nullable → **0..1 : 0..1**, plus denormalised plate/name on each side.

**Unknowns:** do drivers rotate across trucks between trips? Can two drivers share one truck (long-haul relay — plausible on Djibouti–Addis)? Is the assignment a standing roster or per-shipment?

**Why it matters:** `Shipment` already carries both `driverId` and `vehicleId` independently, which suggests the pairing is per-trip, not standing.

**Recommendation:** keep a *current* assignment for display, and add `VehicleDriverAssignment` history. Confirm before choosing.

---

## 🟠 DD-07 — Is Employee a table or a User profile?

`/employees` is a placeholder, yet `ExpenseEntry.paidById` (`emp-01`…`emp-05`), `CounterpartyType.EMPLOYEE` and `ExpenseCategory.SALARY` all reference employees with no table. Meanwhile `FinanceUser {id,name,email,role}` and `AccountManager` are internal-user models in all but name, and `usr-fin-01` / `emp-01` are **different id spaces**.

**Unknowns:** is every employee a system user? Are salary payees employees or a vendor-like payee list? Does HR data (contracts, payroll) belong here at all?

**Recommendation:** `Employee` as a profile table on `User` (`userId` unique, nullable for non-login staff). Confirm scope — payroll is a much larger domain.

---

## 🟠 DD-08 — Does approving an Onboarding create the Shipper/Partner?

`OnboardingRecord` has **no** `shipperId`/`partnerId`. Approving changes a status and nothing else. The only soft link is a shared `registrationNumber` on one of six mock records — and one record shares a *name* with `SHP-104` but a *different* registration number.

**Unknowns:** does approval auto-create the counterparty, or does someone re-key it? If auto-created, do the onboarding documents transfer? Can an existing partner be re-onboarded (renewal/recertification)?

**Recommendation:** approval creates the record and moves its documents; store `resultingShipperId`/`resultingPartnerId`. Confirm — it changes whether onboarding is a funnel or an audit log.

---

## 🟠 DD-09 — What backs a Drawdown?

`Drawdown.backingInvoiceIds[]` and `backingInvoices[]` exist in **TypeScript** but **not** in the Prisma schema. `DrawdownExposureStatus` (`COVERED|AT_RISK|UNCOVERED|BREACHED`) has fully documented semantics — `AT_RISK` = a backing invoice due within **7 days** of the drawdown deadline — but `createDrawdown` **hardcodes `COVERED`** and only repayment ever changes it (BR-5.12).

**Unknowns:** is invoice-backing a real bank covenant or a modelling convenience? Can one invoice back several drawdowns? Who recomputes exposure, and how often?

**Recommendation:** add a `DrawdownBackingInvoice` join table and implement exposure as a scheduled recomputation (the first real BullMQ job). Confirm the covenant first — this is a bank relationship, not an internal rule.

---

## 🟠 DD-12 — Which container-type and stage vocabularies survive?

**Container format — three:**
`'20GP'|'40HC'` (empty return, 2) · `'20GP'|'40GP'|'40HC'|'20RF'|'40RF'|'FLATBED'` (shipper BI, 6) · `'dry_20'|'dry_40'|'hc_40'|'reefer_40'|'flatbed'` (carrier BI, 5). Plus `Mission.shipmentCategory` (7, a different concept) and `TruckType` (9, Title Case).

Container **numbers** are formatted two ways: `'MSKU-882194-0'` vs `'TCLU1111111'`.

**Stage/status — four real vocabularies:** `MissionStatus` (12), BI `STAGE_KEYS` (11), `TRIP_STATUSES` (7), `EmptyReturnStatus` (6).

**Unknown:** does this corridor actually move reefers and flatbeds? The empty-return module's 2-value enum suggests only dry boxes matter operationally.

**Recommendation:** adopt the 6-value BI set; store container numbers unformatted (ISO 6346) and format at the edge.

---

## 🟠 DD-13 — Which delay taxonomy is authoritative?

Two disjoint sets, both exporting a type literally named `DelayParty`:

- **Shipper view:** 8 `DELAY_OWNERS` (`shipper_documentation`, `shipper_depotage`, `shipper_communication`, `transporter`, `customs`, `port_terminal`, `shipping_line`, `force_majeure`) → parties `shipper|transporter|fleetin`
- **Carrier view:** 8 `DELAY_CAUSES` (`port_congestion`, `customs_clearance`, `loading_slot`, `unloading_slot`, `documentation`, `mechanical`, `traffic`, `weather`) → parties `transporter|port|customs|customer|other`

BR-6.9 says attribution is **read, never inferred** — so whichever set is stored becomes contractual.

**Unknown:** are these two lenses on one recorded fact, or two independent records? Is delay attribution ever disputed or amended, and by whom?

**Recommendation:** store the cause (carrier's operational vocabulary) plus an explicit `party`, and **map** to owners for the shipper view. Confirm — this feeds commercial disputes.

---

## 🟡 DD-14 — Do detention and demurrage post to the ledger?

BI computes detention/demurrage days and costs (BR-6.4) and the empty-return module tracks deadlines and overruns — but **nothing connects either to a `LedgerEntry` or an invoice line**. `CHARGE_TYPES` includes `detention`, `demurrage`, `waiting` and `storage`, yet no code creates one.

**Unknowns:** are these billed to the shipper, absorbed by FLEETIN, or paid to the line and recharged? Automatic or reviewed first? Detention is quoted in USD while the ledger is DJF.

**Recommendation:** `ShipmentCharge` rows created on cycle completion, in `PENDING_REVIEW` until an operator confirms. Confirm the commercial policy.

---

## 🟡 DD-15 — What is the real gate-in prediction?

`predictedGateIn` is **always `now + 18h`** (BR-4.11) — a flat constant with no routing model. Every risk band in the empty-return engine rests on it.

**Unknowns:** should this come from GPS/ETA, a per-route average, or operator entry? Does it differ by location or carrier?

**Recommendation:** persist it as a nullable column that a future ETA service writes; keep the constant as the seed default. Not blocking, but the risk engine is only as good as this number.

---

## 🟡 DD-16 — Which on-time definition, and where?

Three ship simultaneously: shipper BI **12h grace**, transporter BI **2h grace**, and `PerformanceSection` with **zero grace**. Additionally `accountSummary.onTimeRate` counts `early` as on-time while `aggregate/overview.onTimeRate` does not. Four behaviours, one metric name.

**Unknown:** are the shipper and carrier SLAs genuinely different contractual terms (plausible — the corridor contracts a *date*, not an instant), or is this drift?

**Recommendation:** if genuinely different, keep both and **name them in the response** (`policy: "shipper.grace12h"`). Fix `PerformanceSection` regardless — zero grace is inconsistent with both.

Related: **two AR aging schemes** (`0-30|31-60|61-90|90+` vs `current|1-15|16-30|31-45|46+`) — same question.

---

## 🟡 DD-17 — Can a cycle be cancelled?

`createCycle` **permanently removes** the full load from the pool with no return path (BR-4.6). The state machine is one-way with no cancel and no undo. `markStandaloneRequired` blocks a container from matching **forever**.

**Unknowns:** what happens when a cycle is created in error, a truck breaks down, or a standalone flag was wrong? Who can reverse it?

**Recommendation:** add `CANCELLED` to the cycle lifecycle with a mandatory reason, returning the full load to the pool. Confirm whether operations needs this — it is a real gap, not a modelling preference.

---

## 🟡 DD-18 — Should `freeDays` derive the deadline?

`ContainerReturnInfo.freeDays` is captured (wizard hardcodes 7, never editable) and stored, but the deadline is **entered manually** (BR-4.13). `DEFAULT_FREE_TIME_DAYS = 7` also exists separately in BI config.

**Unknown:** do free days vary by shipping line or contract? If so, `freeDays` belongs on a line/contract record, and `deadline = gateOut + freeDays`.

**Recommendation:** derive the deadline, allow an explicit override with a reason.

---

## ⚪ DD-19 — Multi-tenancy?

Nothing in the codebase suggests more than one operating company. `UserProfile.shipperId`/`transporterId` scope portal users to a counterparty, not to a tenant.

**Unknown:** will FLEETIN ever run for a second freight operator?

**Recommendation:** single-tenant. Retrofitting is expensive — worth one explicit "no".

---

## ⚪ DD-20 — Audit log scope?

Finance carries `createdById`/`approvedById`. Operations carries nothing. `dashboardData.recentActivity` implies a cross-entity activity feed that no table supports.

**Unknown:** is a full audit trail required for compliance, or is per-entity `updatedById` enough?

**Recommendation:** a generic `AuditLog` (actor, action, entityType, entityId, before/after, at). Confirm retention.

---

## Decision summary

| # | Question | Priority | Blocks |
|---|---|---|---|
| DD-01 | Shipper + Partner: one table or two? | ✅ resolved | Identity schema — see `DOMAIN_DECISIONS_FINAL.md` |
| DD-02 | Is Transporter ever not a Partner? | ✅ resolved | Partner schema — see `DOMAIN_DECISIONS_FINAL.md` |
| DD-03 | Which shipment model is authoritative? | ✅ resolved | Core schema — see above |
| DD-04 | Is Booking an entity? | ✅ resolved | Core schema — see above |
| DD-05 | Location model + the five yards | ✅ resolved | Matching rule — see `DOMAIN_DECISIONS_FINAL.md` |
| DD-10 | One money representation | ✅ resolved | Every amount — see `DOMAIN_DECISIONS_FINAL.md` |
| DD-11 | Which counterparty list is real? | ✅ resolved | All seeding — see `DOMAIN_DECISIONS_FINAL.md` |
| DD-06 | Driver ⇄ vehicle cardinality | 🟠 | Fleet schema |
| DD-07 | Employee: table or user profile? | 🟠 | HR + expenses |
| DD-08 | Onboarding → counterparty creation | 🟠 | Onboarding |
| DD-09 | Drawdown backing invoices | 🟠 | Finance exposure |
| DD-12 | Container/stage vocabularies | 🟠 | Container + events |
| DD-13 | Delay taxonomy | 🟠 | Delay attribution |
| DD-14 | Detention/demurrage → ledger? | 🟡 | Charges |
| DD-15 | Real gate-in prediction | 🟡 | Risk engine |
| DD-16 | On-time definition(s) | 🟡 | BI |
| DD-17 | Cycle cancellation | 🟡 | Empty return |
| DD-18 | Free days → deadline | 🟡 | Container return |
| DD-19 | Multi-tenancy | ⚪ | Everything (if yes) |
| DD-20 | Audit log scope | ⚪ | Cross-cutting |

**Phase 2.1 update:** all seven 🔴 blocking items are now resolved. DD-03 and
DD-04 (the two that would have been most expensive to get wrong, both at the
centre of the schema) are resolved inline above, with the database
consequences already folded into `DATABASE_BLUEPRINT.md` and
`ENTITY_RELATIONSHIP_DIAGRAM.md`. DD-01, DD-02, DD-05, DD-10 and DD-11 are
resolved with full Decision / Evidence / Reasoning / DB / API / Frontend
consequence write-ups in **`DOMAIN_DECISIONS_FINAL.md`** — that document is
now the authoritative source for all seven; this file remains as the Phase 2
evidence record they were resolved from.
