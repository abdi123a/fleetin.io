# FLEETIN — Business Rules Catalogue

**Phase 2 analysis. No code changes.**

Every rule below was extracted from the existing frontend. Each carries its source file so it can be verified and ported without re-deriving it. Rules are labelled:

- **[BACKEND]** — must be authoritative server-side. The browser must not be able to change the answer.
- **[FRONTEND]** — presentation only. Moving it to the backend would be wrong.
- **[DEFECT]** — the current implementation contradicts itself or its own documentation. Flagged, not silently "fixed".
- **[UNIMPLEMENTED]** — specified in the code's own types/comments but never built.

> **The single most important structural finding:** every lifecycle guard in the Empty Return module lives in a **React component**, not the store. `confirmCycle` does not check the checklist; `markEmptyReady` does not check the current status; `payPaymentOrder` does not check that the order was approved. A backend must re-implement all of them server-side — porting the stores alone would ship an unguarded API.

---

## 1. Identity & Counterparty Rules

### BR-1.1 A Transporter *is* a Partner **[BACKEND]**
`shipmentBridge.findPartnerByName(name)` resolves `mission.transporter.company` by exact match against `PartnerRecord.companyLegalName` in `INITIAL_PARTNERS`, and `shipment.store.assignShipmentToCycle` then stamps that partner's id onto the shipment. "Transporter" is a **role a Partner plays**, not a separate table.
*Source:* `src/lib/operations/shipmentBridge.ts`, `src/stores/shipment.store.ts`

### BR-1.2 Shipper and Partner are structurally parallel but operationally disjoint **[BACKEND]**
Both carry the same company identity block (`companyLegalName`, `registrationNumber`, `country`, `address`, `primaryContact`, `uploadedDocuments`, `logoUrl`). They diverge in operational payload and status vocabulary:

| | Shipper | Partner |
|---|---|---|
| Status enum | `Verified \| Pending \| Canceled` | `Active \| Suspended \| Pending \| Inactive` |
| Operational fields | `industry`, `companySize`, `projectsCount` | `operatingRegions`, `serviceCategories`, `fleetSize`, `vehicles[]`, `drivers[]`, `pricingGrid[]`, `bankAccount` |

*Source:* `src/types/shipper.ts`, `src/types/partner.ts`
→ Whether these become one table or two is **DD-01** in `DOMAIN_DECISIONS.md`.

### BR-1.3 One onboarding pipeline serves both counterparty types **[BACKEND]**
`EntityType = 'Partner' | 'Shipper'`. A single `OnboardingRecord` with four fixed stages governs both. This is the strongest evidence for a shared company supertype.
*Source:* `src/types/onboarding.ts`

### BR-1.4 Finance addresses counterparties polymorphically **[BACKEND]**
`CounterpartyType = SHIPPER | TRANSPORTER | BANK | EMPLOYEE | VENDOR`, paired with a free `counterpartyId` string and a denormalised `counterpartyName`. Finance never joins to an operational table.
*Source:* `prisma/schema.prisma` (`LedgerEntry`, `Payment`), `src/types/finance.ts`

### BR-1.5 Vehicles and Drivers are sub-resources of a Partner **[BACKEND]**
`getAllVehicles()` / `getAllDrivers()` flatten `PartnerRecord.vehicles|drivers`, enriching each row with `partnerId/partnerName/partnerLogo/partnerCountry`. `addVehicleToPartner` / `addDriverToPartner` mutate the parent. There is no standalone vehicle or driver collection anywhere in the app.
*Source:* `src/data/partnerData.ts`

---

## 2. Shipment / Mission Lifecycle

### BR-2.1 The linear status ladder **[BACKEND]**
The only transition table in the app:

```
Pending → Assigned → Driver Assigned → En Route → Arrived
        → Unloading → POD Submitted → Completed
```

`Completed`, `Cancelled`, `Failed` are terminal. **`Payment Pending` and `Loading` exist in `MissionStatus` but are unreachable** from this table.
*Source:* `src/pages/missions/components/MissionRowCard.tsx` (`NEXT_STATUS`)

### BR-2.2 No FROM-state validation exists **[DEFECT] [BACKEND]**
`updateMissionStatus` only no-ops when the mission is missing or the status is unchanged. Any transition handed to it is accepted — including backwards. The ladder above is enforced solely by which button renders.
*Source:* `src/stores/shipment.store.ts`

### BR-2.3 Two out-of-band status writes bypass the ladder **[BACKEND]**
- `assignShipmentToCycle` forces `→ Assigned` from any state.
- `completeShipmentFromCycle` forces `→ Completed`, **skipping Driver Assigned, En Route, Arrived, Unloading and POD Submitted entirely**.

Both are triggered by the Empty Return module, not by the shipment UI. Any server-side state machine must permit these two edges or the cycle workflow breaks.
*Source:* `src/stores/shipment.store.ts`

### BR-2.4 "Delivered" for return purposes starts at `Arrived` **[BACKEND]**
```ts
DELIVERED_SHIPMENT_STATUSES = ['Arrived', 'Unloading', 'POD Submitted', 'Completed']
```
Stated rationale: *the clock on the return deadline does not wait for the POD paperwork.*
*Source:* `src/lib/operations/shipmentBridge.ts`

### BR-2.5 Containerisation test **[BACKEND]**
If `shipmentCategory` is set → containerized iff it is `containerized | container_20 | container_40`. Otherwise fall back to `Boolean(containerNumber)`. Only containerized shipments enter the empty-return world.
*Source:* `src/lib/operations/shipmentBridge.ts`

### BR-2.6 Freight rate is looked up, never typed **[BACKEND]**
`resolvePartnerRateFDJ(partner, vehicleType)` reads the partner's `pricingGrid`, converting USD tiers at `USD_TO_DJF`. The Create Shipment wizard has no rate input. **Pricing must therefore be a server-side lookup, or the browser sets its own prices.**
*Source:* `src/components/shipments/CreateShipmentModal.tsx`

---

## 3. Shipment ↔ Empty Return Propagation

### BR-3.1 The propagation rule **[BACKEND]**
Runs on every `addShipment` and every `updateMissionStatus`:

```
if (containerized && status === 'Pending')      → register into matching pool
withdrawShipmentFullLoad(mission.id)             // always, on any non-open state
if (containerized && status ∈ DELIVERED)        → create empty-return record
```
*Source:* `src/stores/shipment.store.ts` (`syncMissionIntoEmptyReturns`)

### BR-3.2 Both directions of the seam **[BACKEND]**

```
SHIPMENT                                    EMPTY RETURN
Pending + containerized     ──────────────► joins matching pool
leaves Pending              ──────────────► pool entry withdrawn
reaches Arrived/…/Completed ──────────────► ER record created (status 'unloading', milestone 2)

status forced to 'Assigned' ◄────────────── createCycle()
status forced to 'Completed'◄────────────── advanceMilestone() reaching 16
```

### BR-3.3 Idempotency guards **[BACKEND]**
- Pool entries are unique by `shipmentId`.
- ER records are rejected if **any record shares the `shipmentId`** *or* **a record with the same `container` exists in a non-`completed` status**. The second clause prevents a race between delivery-registration and cycle-completion spawn.
*Source:* `src/stores/emptyReturn.store.ts`

### BR-3.4 Return location matching key **[BACKEND]**
`resolveReturnLocation()` lowercases `"${name} ${address} ${city}"` and fragment-matches five seeded yards: `LOC-01` Boulaos (`boulaos`), `LOC-02` DIFTZ B-12 (`free zone`/`free trade zone`/`diftz`/`b-12`), `LOC-03` PK12 Dry Port (`pk12`), `LOC-04` Ali Sabieh (`ali sabieh`), `LOC-05` Nagad ICD (`nagad`). No match → `LOC-X-${SLUG}`, slug uppercased, non-alphanumerics → `-`, **truncated to 18 chars**, which deliberately can never collide with a seeded yard.
*Source:* `src/lib/operations/shipmentBridge.ts`

### BR-3.5 Document readiness is derived, not stored **[BACKEND]**
```
bookingConfirmed = timeline has a 'booking_confirmation' step with status 'completed'
paid             = mission.paymentStatus === 'Paid'
booking  = bookingConfirmed ? 'confirmed' : 'pending'
release  = paid             ? 'confirmed' : 'pending'
doStatus = (bookingConfirmed && paid) ? 'verified' : 'pending'
```
*Source:* `src/lib/operations/shipmentBridge.ts`

### BR-3.6 Container format default **[BACKEND]**
`container_20 → 20GP`, `container_40 → 40HC`; else regex over `cargoType + vehicleType + shipmentCategory` for a 20-ft signal; **default `40HC`** — the corridor's dominant box.

### BR-3.7 Shipping line from ISO-6346 prefix **[BACKEND]**
`shippingLine` if set, else the container number's first 3 letters mapped `{MSK: Maersk, MSC: MSC, CMA: CMA CGM, HLX: Hapag-Lloyd, ONE: ONE, TCL: Triton}`, else `'Unknown Line'`.

---

## 4. Empty Return Cycle Engine

### BR-4.1 The state machine — one-way, no cancel, no undo **[BACKEND]**

```
unloading ──markEmptyReady──► empty_ready ──createCycle──► preparing
  (m2)                          (m3)                        (m4)
                                                              │ confirmCycle
                                                              ▼
        completed ◄──advanceMilestone(≥16)── in_progress ◄──dispatchTruck── ready
          (m16)                                 (m8)                        (m7)
```

| Action | Required FROM | Enforced where **today** | TO | Milestone |
|---|---|---|---|---|
| `markEmptyReady` | `unloading` | **UI only** | `empty_ready` | 3 |
| `createCycle` | `empty_ready` | selector filter | `preparing` | 4 |
| `confirmCycle` | `preparing` + all 16 checklist items | **UI only** | `ready` | 7 |
| `dispatchTruck` | `ready` | **UI only** | `in_progress` | 8 |
| `advanceMilestone` | `in_progress` | **UI only** | — / `completed` at ≥16 | +1 |
| `markStandaloneRequired` | any | — | **status unchanged** | unchanged |

**[DEFECT]** Every "UI only" row is an unguarded mutation. All must become server-side preconditions.

### BR-4.2 The matching gate is exactly two conditions **[BACKEND]**
```ts
eligible = (mission.locationId === selected.locationId) && !selected.exception;
```
**Location-ID equality is the only hard matching rule in the system.** Container-type mismatch, missing Delivery Order, unconfirmed booking, unconfirmed release and an infeasible deadline are all **advisory chips only** — explicitly non-blocking. Stated position: *"the system filters and displays, Operations decides."*
*Source:* `src/stores/emptyReturn.store.ts` (`evaluateMission`)

### BR-4.3 A standalone-required exception blocks matching permanently **[BACKEND]**
`markStandaloneRequired` sets `exception` without changing status. That record can never be matched again, and is excluded from the `emptyReady` KPI.

### BR-4.4 Chain membership **[BACKEND]**
A new cycle joins an existing chain **only if** another record satisfies all of: `chainId != null`, same `transporter`, same `locationId`, `status !== 'completed'`, different id. Otherwise a new `CHN-` id is minted. **A different carrier, a different yard, or a fully-completed chain is how a chain closes.**

### BR-4.5 Sequence number counts completed cycles too **[BACKEND]**
`seq = count(records with chainId != null && same transporter && same locationId) + 1` — it climbs across the chain's whole lifetime rather than resetting.

### BR-4.6 The mission pool is consumable **[BACKEND]**
`createCycle` permanently removes the chosen full load from the pool. **There is no return-to-pool path** — a cancelled cycle cannot release its mission today.

### BR-4.7 Milestone 11 is the point of no return **[BACKEND]**
Reaching milestone 11 stamps `returnedAt = now`, after which `riskOf` short-circuits to `protected` forever (when within deadline). This is the deadline-protection event.

### BR-4.8 Loop closure at milestone 16 **[BACKEND]**
The record completes **and spawns a new ER record** for `nextFull.container`:
- Skipped entirely when `nextFull` is null — *"the loop simply does not close."*
- **Deadline inheritance:** if `nextFull.shipmentId` exists, read that shipment's live `containerReturn.deadline`; otherwise `deadline = null` → `deadlineStatus 'missing'` → `exception 'Deadline missing'`.
- `chainId/cycleId/seq = null` — the spawn is **not** auto-chained; the next link is minted only when Operations picks a full load.
- `predictedGateIn = now + 18h`, `milestone: 2`, `status: 'unloading'`, checklist all-false.
- **[DEFECT]** `line` is carried from the *old* record, not the new box — flagged in-code as a preserved demo quirk.

### BR-4.9 Risk classification **[BACKEND]**
```ts
riskOf(record, now):
  if (returnedAt && deadline && returnedAt <= deadline) return 'protected';  // permanent
  if (!deadline)                                        return null;
  if (now > deadline && !returnedAt)                    return 'overdue';
  slack = deadline - (predictedGateIn ?? now);
  if (slack < 0)                    return 'at_risk';
  if (slack < 6h  CRITICAL)         return 'critical';
  if (slack < 12h WATCH)            return 'watch';
  return 'safe';
```
`isCritical = critical | at_risk`; `isEscalated = isCritical | overdue`.
**A record with no deadline has no risk at all** and sorts last forever.

### BR-4.10 Slack and risk are deliberately asymmetric **[BACKEND]**
```ts
slackOf = deadline - (returnedAt ?? predictedGateIn ?? now)
```
`riskOf` prefers the **prediction**; `slackOf` prefers the **actual** return. Documented as intentional — do not "harmonise" them.

### BR-4.11 `predictedGateIn` is a flat constant **[UNIMPLEMENTED]**
Always `now + 18h`. There is no routing or ETA model behind it. Every risk band in the module ultimately rests on this placeholder.

### BR-4.12 The 16-item checklist and its auto-derivation **[BACKEND]**
`deriveChecklist` pre-ticks indices 0, 2, 10, 11 (always), 1 (`mission.locationId === record.locationId`), 4 (`Boolean(deadline)`), 5 (`risk ∈ {safe, watch}`), 8 (`booking === 'confirmed'`), 9 (`doStatus === 'verified'`), 12 (`release === 'confirmed'`). **Six boxes stay false by design** — chassis, two return references, pickup window, terminal docs, transporter call — because no system knows them.

### BR-4.13 `freeDays` is captured but never used **[DEFECT]**
`ContainerReturnInfo.freeDays` is collected (wizard hardcodes `useState(7)`, never edited) and stored, but **the deadline is entered manually rather than derived** from free days + gate-out.

---

## 5. Finance Rules

### BR-5.1 Money representation **[BACKEND]**
Integer **minor units** + `scale` + `currency` + `fxRate` + `baseAmountMinorUnits`. Scale is 0 for FDJ, 2 for USD/ETB/KES. **`fxRate` is fixed at transaction time and never looked up retroactively.**
*Source:* `src/types/finance.ts`, `prisma/schema.prisma`

### BR-5.2 Financial documents snapshot counterparty names **[BACKEND]**
`Invoice` stores `shipperId` **and** `shipperName`/`shipperCompany`; `PaymentOrder` stores `transporterId` **and** names, plus `driverName`, `assignedTruckPlate`, `route`. Renaming a partner must **not** retroactively alter an issued invoice. Preserve this denormalisation.

### BR-5.3 Four-eyes approval on payment orders **[BACKEND]**
```ts
if (target.createdById === currentUser.id && role !== 'ADMIN') → reject
```
**ADMIN bypasses four-eyes.** Approval additionally requires `FINANCE_MANAGER | ADMIN`.
**[DEFECT]** Expense approval has a role gate but **no four-eyes check**.

### BR-5.4 Invoice status is derived from allocation, never commanded **[BACKEND]**
```
newRemaining = max(0, total - (allocated + amount))
remaining === 0 → 'Paid';  allocated > 0 → 'Partially Paid'
```

### BR-5.5 Overdue is computed, never stored **[BACKEND]**
`contractDeadline < today`, evaluated at read time as a lexical `YYYY-MM-DD` compare. **No action ever writes `'Overdue'`.** Same for `Drawdown` `'Overdue'`/`'Breached'` and `PaymentOrder` `'Cancelled'` — all present in the enums, never written.

### BR-5.6 Missing payment guards **[DEFECT] [BACKEND]**
- `payPaymentOrder` does **not** require status `Approved` — a Pending order can be paid.
- `payExpense` does **not** require `Approved`.
- `sendInvoice` has **no FROM guard** — it will re-send a Paid invoice.
- `disputeInvoice` and `rejectExpense` have no guards at all.

### BR-5.7 Credit facility headroom **[BACKEND]**
`availableHeadroom = max(0, limit − currentDrawdownsTotal)` on drawdown; **unclamped** on repayment.
**[DEFECT]** `createDrawdown` **never checks headroom before disbursing** — you can draw past the limit and headroom simply floors at 0.

### BR-5.8 Credit notes reduce the invoice **[BACKEND]**
Both `total` and `remainingAmount` are reduced by the credit amount, each floored at 0.

### BR-5.9 The ledger is append-only, but not every action posts **[BACKEND]**
Posts: invoice issued (at **draft**, accrual), write-off, credit note, PO issued, payment made/received, drawdown, loan repayment, expense **paid**.
Silent: `createExpense`, `sendInvoice`, `disputeInvoice`, `approveExpense`, `approvePaymentOrder`, all reconciliation actions.

### BR-5.10 KPIs cannot drift **[BACKEND]**
Every AR/AP/facility mutation routes through `withLiveKpis`, which recomputes the whole KPI block inside the same state write.

### BR-5.11 Revenue is accrual, cash is separate **[BACKEND]**
```
revenueMtdAccrual  = Σ invoice totals issued this month, excl. 'Written Off'
cashCollectedMtd   = Σ payments with direction 'IN' this month
transporterCogsMtd = Σ POs created this month, excl. 'Cancelled'
grossMarginMtd     = revenue − cogs
netProfitAccrual   = revenue − cogs − expenses
grossMarginPercentage = round((margin / revenue) * 1000) / 10     // 1 d.p., 0 when revenue ≤ 0
arOutstanding = Σ remainingAmount where remaining > 0 && status ∉ {Written Off, Draft}
apOutstanding = Σ POs where status ∈ {Pending, Approved}
```

### BR-5.12 `DrawdownExposureStatus` is specified but never implemented **[UNIMPLEMENTED]**
Documented semantics: `COVERED` = backing invoices paid or due comfortably before the drawdown deadline; `AT_RISK` = backing invoice due **within 7 days** of it; `UNCOVERED` = backing invoice past its contract deadline while the drawdown is active; `BREACHED` = the drawdown itself is past due.
**Reality:** `createDrawdown` hardcodes `'COVERED'`; only `repayDrawdown` ever changes it. **This is a prime backend job — and it requires an invoice↔drawdown backing link that does not exist yet (see DD).**

### BR-5.13 Two different AR aging schemes ship simultaneously **[DEFECT]**
- Finance reports: `0-30 | 31-60 | 61-90 | 90+` days
- Transporter BI: `current | 1-15 | 16-30 | 31-45 | 46+` days

Both are live. One must be chosen per viewpoint and named.

---

## 6. BI & Analytics Rules

### BR-6.1 Policy constants **[BACKEND]**
```ts
// Shipper viewpoint — src/lib/bi/config.ts
ON_TIME_GRACE_MINUTES = 12 * 60;      EARLY_THRESHOLD_MINUTES = 24 * 60;
RETURN_HEADROOM_BANDS = { overdue: 0, dueSoon: 48 };          // hours
RISK_WEIGHTS = { etaDrift: 0.45, stageDwell: 0.35, freeTime: 0.2 };
RISK_ETA_DRIFT_CEILING_MINUTES = 24 * 60;  RISK_DWELL_CEILING_RATIO = 2;
RISK_SEVERITY_THRESHOLDS = { critical: 70, warning: 40 };
CYCLE_TIME_BINS = [0,2,4,6,8,10,14,21];  DEFAULT_FREE_TIME_DAYS = 7;
BI_CURRENCY = 'DJF';  DETENTION_RATE_PER_CONTAINER_DAY = 50;  DETENTION_RATE_CURRENCY = 'USD';

// Transporter viewpoint — src/features/transporter-bi/config.ts
ON_TIME_GRACE_MINUTES = 120;          // ← 2h, NOT the shipper's 12h
ON_TIME_TARGET = 0.92;  BACKHAUL_MATCH_TARGET = 0.75;  UTILIZATION_TARGET = 0.8;
CO2_KG_PER_KM_LOADED = 0.92;  CO2_KG_PER_KM_EMPTY = 0.68;
EMPTY_COST_PER_KM = 0.95;             // USD, WCTR 2019 Djibouti–Addis study
PAYMENT_TERMS_DAYS = 30;  SETTLEMENT_WEEKDAY = 4;  // Thursday UTC
USD_TO_DJF = 177.721;                 // BCD peg
```

### BR-6.2 Three conflicting on-time definitions ship today **[DEFECT]**
| Definition | Grace | Source |
|---|---|---|
| Shipper BI | 12 hours | `lib/bi/config.ts` |
| Transporter BI | 2 hours | `features/transporter-bi/config.ts` |
| Performance analytics section | **zero** (`deliveredAt <= plannedDeliveryAt`) | `pages/analytics/sections/PerformanceSection.tsx` |

Additionally, `accountSummary.onTimeRate` counts **`early` as on-time**, while `aggregate/overview.onTimeRate` counts **only `on_time`**. Four behaviours, one metric name.

### BR-6.3 Delivery classification is three buckets, not two **[BACKEND]**
```ts
variance > GRACE          → 'late'
variance < -EARLY_THRESHOLD → 'early'
else                       → 'on_time'
```

### BR-6.4 Demurrage and detention are split, never merged **[BACKEND]**
- **Demurrage** — box still inside the terminal past free time; owed to the shipping line.
- **Detention** — box outside the terminal past free time; the consignee/transporter's doing. **Only accrues once `gateOutAt` exists.**
```ts
demurrageDays = max(0, round(daysBetween(expiry, gateOut ?? asOf)))
detentionStart = gateOut && gateOut > expiry ? gateOut : expiry
detentionDays  = gateOut ? max(0, round(daysBetween(detentionStart, returned ?? asOf))) : 0
```

### BR-6.5 Risk score is a weighted 0–100 requiring two passes **[BACKEND]**
```ts
drift    = clamp(etaDriftMinutes / 1440, 0, 1)
dwell    = clamp(stageDwellHours / (stageP90Hours * 2), 0, 1)
freeTime = headroom <= 0 ? 1 : clamp(1 - headroom/24, 0, 1)   // only counts inside 24h
score    = round((drift*0.45 + dwell*0.35 + freeTime*0.2) * 100)   // 0 for closed shipments
```
**P90 is a population property**, so this cannot be computed row-by-row in a single pass.

### BR-6.6 A shipment is open until the empty is back **[BACKEND]**
`isOpen = STAGE_ORDER[currentStage] < STAGE_ORDER['empty_returned']` — **not** when delivered. This definition drives every "active shipments" count.

### BR-6.7 A rate is not additive **[BACKEND]**
`onTimeRate` supplies its own bucket reducer so the sparkline cannot contradict the headline. Never sum or average a rate across buckets.

### BR-6.8 Period anchoring **[BACKEND]**
`inPeriod` filters on **`fact.createdAt`** — *"a shipment belongs to the period it was created in"*, so last month's totals don't change when an old shipment finally lands. The comparison period is **derived** (`previousPeriod`), never stored.

### BR-6.9 Delay attribution is read, never inferred **[BACKEND]**
`deriveDelay` sums stored `DelayAttribution` rows. Rationale: *a delay report that recomputes blame on every query cannot be disputed.* Attribution must be a persisted, auditable record.

### BR-6.10 Stage durations order by `seq`, not timestamp **[BACKEND]**
Prevents negative dwell when a driver backdates a report.

### BR-6.11 Everything in BI is UTC and takes an explicit `asOf` **[BACKEND]**
No function in `lib/bi` reads `Date.now()`. This is what makes the SQL port reproducible — **preserve it.**

### BR-6.12 Fleet utilisation excludes maintenance **[BACKEND]**
```ts
utilization = activeDays / (activeDays + idleDays)   // "downtime is not demand"
```

### BR-6.13 Outstanding payments is a stock, not a flow **[BACKEND]**
It deliberately **ignores the selected date window**.

### BR-6.14 Compliance score **[BACKEND]**
```ts
score = round(( verifiedDocs/totalDocs * 0.5
              + validDrivers/totalDrivers * 0.25
              + validVehicles/totalVehicles * 0.25 ) * 100)   // clamped 0..100, denominators max(n,1)
```

### BR-6.15 Transporter console cost model **[BACKEND]**
```ts
WAITING_COST_PER_HOUR = 11 USD;  DETENTION_FREE_HOURS = 2;  DETENTION_COST_PER_HOUR = 5;
detentionCost    = mean(max(0, waitingHoursAt('unloading_site') - 2) * 5)
emptyCostPerMove = mean(emptyKm * 0.95)
waitingCost      = mean((wait@port + wait@border + wait@loading_site) * 11)
net              = gross + surcharges - detentionCost - emptyCostPerMove - waitingCost
```

### BR-6.16 Currency mixing hazard **[DEFECT]**
Detention is quoted in **USD** ($50/container/day) while the ledger is **DJF**. The code carries an explicit warning that an early draft rendered "600 DJF" for a $50/day contract — **off by ~180×**. The backend must own the peg and never let the two mix implicitly.

---

## 7. Documents & Compliance

### BR-7.1 Documents attach to four entity types **[BACKEND]**
Partner, PartnerDriver, PartnerVehicle, Shipper — plus shipment `requiredDocuments[]`, booking `podDocument`, and expense `receiptUrl`.

### BR-7.2 Verification vocabulary differs by entity **[DEFECT]**
- Partner-side: `Verified | Pending Review | Rejected | Expired`
- Shipper-side: `Verified | Pending Review | Rejected` (**no `Expired`**)
- Mission/empty-return: `verified | pending`
- Deadline verification: `verified | unverified | missing`

### BR-7.3 Three separate expiry implementations, all 30 days **[DEFECT]**
`deriveComplianceAlerts` (`soonDays = 30`), `DriversPage.isExpiredOrSoon` (30 days), and the dashboard's string-based `expiresIn` + `urgency` scheme. **Unify server-side.**

### BR-7.4 Expiry is monitored on five fields **[BACKEND]**
Document `expiryDate`, driver `licenseExpiry`, driver `nationalIdExpiry`, vehicle `insuranceExpiry`, vehicle `registrationExpiry` → `ComplianceAlert { type: missing|expired|expiring_soon|rejected, severity: critical|warning|info }`.

### BR-7.5 Download counts are tracked **[BACKEND]**
`PartnerDocument.downloadCount` and `version` imply audited download and versioning endpoints.

---

## 8. Onboarding

### BR-8.1 Four fixed pipeline stages **[BACKEND]**
`STG-01` Compliance & Tax Document Verification → `STG-02` Bank Account & IBAN Audit → `STG-03` Digital SLA & Contract Sign-off → `STG-04` Fleet Physical Inspection & Permit Check.

### BR-8.2 Progress is derived from completed actions **[BACKEND]**
`progress (0–100)` is recomputed from `pendingActions[].isCompleted`, never set directly.

### BR-8.3 A comment can carry a status transition **[BACKEND]**
`CommentItem.statusChange` — the audit trail and the state machine are the same stream.

### BR-8.4 Onboarding is disconnected from Partners/Shippers **[UNIMPLEMENTED]**
Approving an `OnboardingRecord` does **not** create a `PartnerRecord` or `ShipperRecord`. That join is an open decision (see `DOMAIN_DECISIONS.md`).

---

## 9. Identifier Generation — all must become server sequences

| Entity | Current format | Problem |
|---|---|---|
| Ledger entry | `LED-${Date.now()}` | **[DEFECT]** collides within the same millisecond |
| Credit note | `CN-2026-${String(len \|\| 0 + 1)…}` | **[DEFECT]** operator precedence — first two credit notes on an invoice both get `CN-2026-0001` |
| Mission | `MSN-2026-${1000 + random*9000}` | **[DEFECT]** random, collision-prone |
| Booking / Reference / DPCS | `BKG-`/`REF-`/`DPCS-DJ-` + random | same |
| Invoice / PO / Payment / Drawdown / Expense | `${len + offset}` padded | index-based — deleting a row reissues an id |
| Empty return | `ER-${recordCounter}` from 115; boot-seeded `ER-201+` | in-memory counter, resets on reload |
| Cycle / Chain | `CYC-0005+` / `CHN-003+` | in-memory counters |
| Full-load mission | `FM-${mission.id.slice(-4)}` | **[DEFECT]** not unique if two ids share their last 4 chars |

**Every one of these needs a real database sequence.**

---

## 10. Authentication & Authorisation

### BR-10.1 Login failure silently grants full access **[DEFECT] — highest severity**
`auth.store.login` wraps its single real API call in a try/catch. On **any** error it enters demo mode, sniffs a role from the email string (`email.includes('shipper') ? 'SHIPPER' : 'MANAGER'`), mints `token-${Date.now()}`, and grants **`permissions: ['*']`**. A backend outage therefore hands every visitor superuser rights.

### BR-10.2 The app boots pre-authenticated **[DEFECT]**
Initial store state is a logged-in ADMIN (`demo-admin-01`) with `isAuthenticated: true`.

### BR-10.3 Tokens are persisted unpartitioned to localStorage **[DEFECT]**
`persist` has no `partialize`, so both access and refresh tokens are written to localStorage. `refreshToken` is stored but **never used** — the client has no refresh flow.

### BR-10.4 Seven roles exist frontend-side **[BACKEND]**
`ADMIN | MANAGER | DISPATCHER | DRIVER | SHIPPER | CLIENT | TRANSPORTER`. Phase 1 seeded only five (`ADMIN, MANAGER, DISPATCHER, DRIVER, CLIENT`) — **`SHIPPER` and `TRANSPORTER` are missing server-side.**

### BR-10.5 Portal users are scoped to one company **[BACKEND]**
`UserProfile` carries optional `shipperId` / `transporterId`, and navigation deep-links to `/shippers/{shipperId}`. Row-level scoping is required: a shipper user must see only their own shipments.

---

## Summary of defects to resolve before implementation

| # | Severity | Defect |
|---|---|---|
| 1 | **Critical** | Login failure grants `['*']` permissions (BR-10.1) |
| 2 | **Critical** | Every empty-return lifecycle guard is UI-only (BR-4.1) |
| 3 | **High** | No FROM-state validation on shipment status (BR-2.2) |
| 4 | **High** | Payment/expense can be paid without approval (BR-5.6) |
| 5 | **High** | Drawdown ignores facility headroom (BR-5.7) |
| 6 | High | `LED-${Date.now()}` and `CN-2026` id collisions (§9) |
| 7 | Medium | Three conflicting on-time definitions (BR-6.2) |
| 8 | Medium | Two AR aging schemes (BR-5.13) |
| 9 | Medium | USD/DJF mixing in detention costs (BR-6.16) |
| 10 | Medium | Three expiry implementations (BR-7.3) |
| 11 | Low | `freeDays` captured but unused (BR-4.13) |
| 12 | Low | Chain `line` inherited from the wrong record (BR-4.8) |
