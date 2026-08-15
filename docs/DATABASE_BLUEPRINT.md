# FLEETIN — Database Blueprint

**Phase 2 analysis. PROPOSED ONLY — no Prisma models created, no migrations run, existing finance models untouched.**

---

## 0. Conventions

Applied to every proposed operational table unless stated otherwise.

| Concern | Decision | Rationale |
|---|---|---|
| Primary key | `id String @id @default(uuid())` | Matches Phase 1's existing style |
| Human reference | separate `reference String @unique` from a DB sequence | Users know `MSN-2026-8801`; the frontend's generators collide (`BUSINESS_RULES.md` §9) |
| Timestamps | `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt` | Missions/shippers/partners have **none** today |
| Time zone | **UTC everywhere**, ISO-8601 at the boundary | BI is explicitly UTC and takes an `asOf` (BR-6.11) |
| Soft delete | `deletedAt DateTime?` on operational tables | Financial history must survive counterparty removal |
| Money | integer minor units + `scale` + `currency` + `fxRate` + `baseAmountMinorUnits` | Reuse the existing finance convention exactly (BR-5.1) |
| Audit | `createdById`, `updatedById` → `User` | Finance already does this |
| Enums | Prisma `enum` where the set is closed and stable; `String` + app validation where the frontend still disagrees with itself | |
| Denormalised snapshots | Kept **only** on financial documents | BR-5.2 — an issued invoice must not mutate when a partner is renamed |

**Status field policy:** derived statuses (`ReturnRiskLevel`, invoice `Overdue`, compliance score) are **never stored**. Only statuses an action writes get a column.

---

## 1. Identity & Counterparties

### 1.1 `Shipper`
**Purpose:** the cargo-owning customer. Demand side.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | String | PK, uuid | |
| `reference` | String | **unique** | `SHP-101` |
| `companyLegalName` | String(255) | **unique**, indexed | Empty Return joins on this name today |
| `registrationNumber` | String(64) | unique | `DJ-REG-2022-4482` |
| `industry` | String(128) | | free text today |
| `companySize` | enum | | 5 bands, verbatim from `CompanySize` |
| `country` | String(64) | indexed | |
| `address` | Text | | |
| `approvalStatus` | enum | indexed, default `PENDING` | `VERIFIED \| PENDING \| CANCELED` |
| `logoUrl` | Text? | | |
| `registrationDate` | DateTime | | |
| `deletedAt` | DateTime? | indexed | |

**Not stored (derived):** `projectsCount`, `activeShipments`, `pastShipments` — `ShippersPage` already recomputes these live by joining missions. Storing them guarantees drift.
**Indexes:** `(approvalStatus)`, `(country)`, `(companyLegalName)`, `(deletedAt)`
**Relations:** → `Contact[]`, `Document[]`, `Shipment[]`

### 1.2 `Partner`
**Purpose:** the carrier company. Supply side. **"Transporter" is this table** (BR-1.1).

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | String | PK, uuid | |
| `reference` | String | unique | `PTR-001` |
| `companyLegalName` | String(255) | **unique**, indexed | Empty Return joins on this name |
| `registrationNumber` | String(64) | unique | |
| `businessLicenseNumber` | String(64)? | | |
| `fleetCode` | String(32)? | | ⚠️ lives only on snapshots today, and they **disagree** (`RSE-FLT-01` vs `RSE-FLT-09`) |
| `operatingRegions` | Json | | `string[]` |
| `serviceCategories` | Json | | `string[]` |
| `fleetSize` | Int | | **declared, not counted** — 14 vs 3 actual vehicles |
| `vehicleTypes` | Json | | `string[]`, untyped today |
| `country` | String(64) | indexed | |
| `address` | Text | | |
| `partnerStatus` | enum | indexed | `ACTIVE \| SUSPENDED \| PENDING \| INACTIVE` |
| `rating` | Decimal(2,1)? | | exists only on mission snapshots |
| `insuranceProvider` | String(128)? | | |
| `insurancePolicyNumber` | String(64)? | | |
| `insuranceExpiry` | DateTime? | indexed | compliance alerts |
| `logoUrl` | Text? | | |
| `registrationDate` | DateTime | | |
| `deletedAt` | DateTime? | indexed | |

**Relations:** → `Contact[]`, `Document[]`, `Vehicle[]`, `Driver[]`, `PricingTier[]`, `PartnerBankAccount?`, `Shipment[]`
⚠️ **DD-01** may fold Shipper + Partner into one `Company` supertype.

### 1.3 `Contact`
**Purpose:** one table replacing `ContactPerson`, `DispatcherContact` and `AccountManager` — three structurally identical shapes.

| Field | Type | Constraints |
|---|---|---|
| `id` | String | PK |
| `ownerType` | enum | `SHIPPER \| PARTNER \| ONBOARDING` |
| `ownerId` | String | indexed |
| `name`, `title`, `email`, `phone` | String | `email` indexed |
| `isPrimary` | Boolean | default `false` |
| `avatarUrl` | Text? | |

**Unique:** `(ownerType, ownerId, isPrimary)` where `isPrimary = true` — at most one primary per owner.
**Index:** `(ownerType, ownerId)`

### 1.4 `PartnerBankAccount`
**Purpose:** the partner's payout account. **Deliberately separate from finance's `BankAccount`** — that one is FLEETIN's own account with balances. The two collide by name today and only avoid a TypeScript error because `types/index.ts` omits `./partner` (a latent bug).

| Field | Type | Notes |
|---|---|---|
| `id` | String | PK |
| `partnerId` | String | **unique** — one account per partner today |
| `bankName`, `accountHolder`, `accountNumber` | String | |
| `iban`, `swiftCode` | String? | |
| `currency` | enum | `FDJ \| USD \| ETB \| KES` |

### 1.5 `PricingTier`
**Purpose:** the rate card. **Load-bearing** — `resolvePartnerRateFDJ()` reads this to price every shipment; the Create Shipment wizard has no rate input (BR-2.6).

| Field | Type | Notes |
|---|---|---|
| `id` | String | PK |
| `partnerId` | String | indexed, cascade |
| `route` | String(128) | `'Djibouti → Addis Ababa'` — ⚠️ free text; should become `originLocationId`/`destinationLocationId` |
| `vehicleType` | String(64) | |
| `basePriceMinorUnits` | BigInt | |
| `currency` | enum | USD in mocks |
| `pricePerKmMinorUnits` | BigInt? | |
| `validFrom` / `validTo` | DateTime? | **new** — rate cards change; today there is no history |

**Unique:** `(partnerId, route, vehicleType, validFrom)`

---

## 2. Fleet

### 2.1 `Vehicle`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | String | PK | |
| `reference` | String | unique | `VEH-001` |
| `partnerId` | String | indexed, **required** | owned by a partner |
| `plateNumber` | String(32) | **unique**, indexed | `DJ-ABJ-1234` |
| `truckType` | enum | indexed | 9 values from `TruckType` |
| `capacityTons` | Decimal(6,2)? | | ⚠️ **string today** (`'28 Metric Tons'`, `'40ft / 28 tons'`) |
| `containerCapacityLabel` | String(64)? | | preserve the display string |
| `trailerInfo` | String(128)? | | |
| `ownershipType` | enum | | `OWNED \| LEASED \| RENTED` |
| `insuranceExpiry` | DateTime | **indexed** | compliance |
| `registrationExpiry` | DateTime | **indexed** | compliance |
| `hasGPS` | Boolean | default false | |
| `gpsDeviceId` | String(64)? | | |
| `operationalStatus` | enum | indexed | `AVAILABLE \| IN_TRANSIT \| UNDER_MAINTENANCE \| OUT_OF_SERVICE` |
| `make`, `model` | String(64)? | | |
| `year` | Int? | | |
| `deletedAt` | DateTime? | | |

**Not stored:** `assignedDriverName` — denormalised today; join instead.
**Indexes:** `(partnerId, operationalStatus)`, `(insuranceExpiry)`, `(registrationExpiry)`

### 2.2 `Driver`

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | String | PK | |
| `reference` | String | unique | `DRV-001` |
| `partnerId` | String | indexed, required | |
| `fullName` | String(128) | indexed | |
| `phone` | String(32) | | |
| `nationalId` | String(64) | unique | |
| `nationalIdExpiry` | DateTime? | indexed | |
| `drivingLicenseNumber` | String(64) | **unique** | |
| `licenseExpiry` | DateTime | **indexed** | drives the `licenseAlerts` KPI |
| `accessCards` | Json | | `string[]` — `['Port Gate A', 'Free Zone']` |
| `status` | enum | indexed | same `OperationalStatus` as Vehicle |
| `joinDate` | DateTime | | |
| `profilePictureUrl` | Text? | | |
| `rating` | Decimal(2,1)? | | exists only on mission snapshots |
| `deletedAt` | DateTime? | | |

### 2.3 `VehicleDriverAssignment` — ⚠️ **DD-06**
Today the link is a bidirectional pair of nullable columns (`assignedVehicleId` ⇄ `assignedDriverId`), i.e. **0..1 : 0..1**. That cannot express a driver rotating across trucks or two drivers sharing one truck. If confirmed, model as a history table:

| Field | Type |
|---|---|
| `id`, `vehicleId`, `driverId` | String |
| `assignedAt`, `unassignedAt` | DateTime / DateTime? |

**Partial unique:** one open assignment per vehicle, and one per driver, where `unassignedAt IS NULL`.

---

## 3. Location — the biggest missing table

### 3.1 `Location`
**Purpose:** unify **three** unrelated vocabularies (`DOMAIN_MAP.md` §3.4). Location-ID equality is the only hard matching rule in the empty-return engine (BR-4.2), and it currently rests on lowercase string fragments in `resolveReturnLocation()`.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | String | PK | |
| `reference` | String | **unique**, indexed | `LOC-01` — **the matching key** |
| `name` | String(255) | indexed | `'Boulaos Industrial Yard'` |
| `type` | enum | indexed | `PORT \| TERMINAL \| DEPOT \| YARD \| WAREHOUSE \| FREE_ZONE \| DRY_PORT \| CUSTOMER_SITE` |
| `address` | Text | | |
| `city` | String(64) | indexed | |
| `country` | String(64) | indexed | |
| `postalCode` | String(16)? | | |
| `latitude` | Decimal(10,7)? | | `AddLocationForm` collects via map click |
| `longitude` | Decimal(10,7)? | | |
| `gateOrTerminal` | String(128)? | | from `LocationInfo` |
| `isReturnDepot` | Boolean | default false | can empties be returned here |
| `matchAliases` | Json | | **the five fragment lists**, e.g. `['free zone','diftz','b-12']` — preserves current matching behaviour as data instead of code |
| `deletedAt` | DateTime? | | |

**Migration note:** the five seeded yards (`LOC-01`…`LOC-05`) plus `LOC-X-*` fallbacks must be reconciled with `LocationRecord` from `LocationsPage`. → **DD-05**

---

## 4. Shipment & Booking core

**Resolved in Phase 2.1 — DD-04 and DD-03.** This section replaces the single
`Shipment` table proposed in Phase 2 with a two-tier model. Summary of the
finding (full reasoning in `DOMAIN_DECISIONS_FINAL.md`): the BI contract's
`Shipment` schema (`transporterId`, one optional `vehicleId`, one optional
`containerId`) is structurally **one truck's movement**, not a commercial
order — and the wizard's `transporterAssignments[]` (multiple carriers,
multiple vehicles, multiple DPCS `bookingIds[]` per shipment) proves a real
commercial order can require several such movements. Today's `Mission` type
can hold only one of each, so multi-truck shipments lose data (`bookingId`
becomes several ids joined into one string; only the first transporter is
kept). **`Shipment` is the commercial order; `Booking` is the per-truck/
per-container execution unit**, at the same grain the BI contract already
modelled — `ShipmentEvent`, `Charge`, `Container` and `DelayAttribution` all
FK to `Booking`, renamed accordingly below.

### 4.1 `Shipment` — the commercial order
**Purpose:** what the shipper ordered. One row per `MSN-2026-####`.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | String | PK | |
| `reference` | String | **unique**, indexed | `MSN-2026-8801` — sequence, not `Math.random()` |
| `clientReference` | String(32)? | | `REF-99201` |
| `dpcsReference` | String(32)? | indexed | Djibouti customs — order-level, covers every booking on it |
| `shipperId` | String | indexed, **RESTRICT** | |
| `pickupLocationId` | String | indexed | |
| `deliveryLocationId` | String | indexed | |
| `status` | enum | **indexed** | Coarse **order** lifecycle: `DRAFT \| CONFIRMED \| IN_PROGRESS \| COMPLETED \| CANCELLED`. Deliberately not the old 12-value `MissionStatus` ladder — that described a single truck's physical progress, which is `Booking.status` now (see 4.2). Can also be read as a rollup of its bookings' stages. |
| `paymentStatus` | enum | indexed | `PAID \| PENDING \| OVERDUE \| PARTIALLY_PAID` — order-level billing |
| `shipmentCategory` | enum? | indexed | 7 values; drives containerisation (BR-2.5) |
| `cargoType` | String(128) | | free text today |
| `goodsDescription` | Text | | |
| `totalWeightKg` | Decimal(10,2) | | |
| `dimensions` | String(64)? | | |
| `estimatedDistanceKm` | Decimal(8,2) | | |
| `totalRateMinorUnits` | BigInt | | **sum of its bookings' rates** — cache, recomputed on booking change, never hand-edited |
| `currency` | enum | default `FDJ` | |
| `fxRate` | Float | default 1.0 | fixed at creation |
| `baseAmountMinorUnits` | BigInt | | |
| `scheduledPickupAt` | DateTime | indexed | |
| `plannedDeliveryAt` | DateTime? | **indexed** | required by on-time classification (BR-6.3) — absent today |
| `completedAt` | DateTime? | indexed | |
| `equipmentType`, `bulkCommodity`, `bulkHandlingMethod`, `machineryType`, `lashingStandard` | String? | | category-specific |
| `requiredDocuments` | Json | | `string[]` |
| `deletedAt` | DateTime? | | |

**Indexes:** `(shipperId, status)`, `(status, scheduledPickupAt)`, `(createdAt)` ← BI period anchoring (BR-6.8), `(dpcsReference)`
**Full-text:** `(reference, clientReference, dpcsReference)` plus, via `Booking`, plate and container number.

### 4.2 `Booking` — one truck's movement (NEW — resolves DD-04)
**Purpose:** the execution unit. One row per vehicle/container required by a
shipment — `vehiclesNeeded = containerQuantity` for containerized cargo, so a
3-container shipment is 1 `Shipment` + 3 `Booking` rows. A `transporterAssignment`
in the wizard (`{partnerId, vehicles, bookingIds[]}`) is **not its own table**:
at creation it expands into `vehicles` `Booking` rows, each getting one entry
from that assignment's `bookingIds[]` as its `externalReference` — this is
what stops today's data loss (currently `.flatMap(bookingIds).join(', ')`
into one string, and only `transporterAssignments[0]`'s partner survives).

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | String | PK | |
| `externalReference` | String(32)? | indexed | `BKG-1178` — the DPCS booking number, one per truck |
| `shipmentId` | String | indexed, **RESTRICT** | the parent order |
| `partnerId` | String | indexed, RESTRICT | the carrier hauling *this* truck |
| `driverId` | String? | indexed | assigned later |
| `vehicleId` | String? | indexed | assigned later |
| `containerId` | String? | **unique** | one container per booking (containerized cargo); null for bulk/machinery |
| `status` | enum | **indexed** | 11 BI `STAGE_KEYS` (`created…empty_returned`) — see rationale below |
| `rateMinorUnits` | BigInt | | this truck's share: `resolvePartnerRateFDJ(partner, vehicleType)`, currently computed but discarded per-assignment |
| `currency`, `fxRate`, `baseAmountMinorUnits` | | | unify per DD-10 |
| `plannedPickupAt`, `plannedDeliveryAt` | DateTime | | may differ per truck even within one order |
| `actualPickupAt`, `actualDeliveryAt` | DateTime? | | |
| `podDocumentId` | String? | → Document | one signed POD per truck, matching `BookingPreviewItem.podDocument` |
| `deletedAt` | DateTime? | | |

**Why `Booking.status` is the 11-value BI `STAGE_KEYS`, not the old 12-value `MissionStatus` or the ad-hoc 6-step display pipeline seen on `ShipmentOverviewPage`:** `STAGE_KEYS` is the only one of the three that already includes `empty_awaiting`/`empty_returned` as terminal states — meaning a booking's own lifecycle naturally closes exactly when its container comes back. That is precisely the workflow `shipmentBridge.ts` bolts on today with ad-hoc cross-store calls; folding it into one enum removes the special case. (Final vocabulary sign-off is still **DD-12**.)

**Indexes:** `(shipmentId)`, `(partnerId, status)`, `(driverId)`, `(vehicleId)`, `(status, plannedDeliveryAt)`

### 4.3 `BookingEvent` *(renamed from `ShipmentEvent` — now correctly scoped)*
**Purpose:** the stage timeline. One truck's movement generates its own events; a multi-truck shipment does not force them into a single, meaningless merged stream.

| Field | Type | Notes |
|---|---|---|
| `id` | String | PK |
| `bookingId` | String | indexed, cascade |
| `stage` | enum | the same 11 `STAGE_KEYS` as `Booking.status` — this table is the log, `Booking.status` is its denormalised head (BI's own design note: *"redundant with the event stream, and worth it — replaying a log per shipment to answer 'where is it now' does not scale"*) |
| `seq` | Int | **ordering authority** — BR-6.10: order by `seq`, never timestamp |
| `occurredAt` | DateTime | when it happened |
| `recordedAt` | DateTime | when the system heard about it — the gap is a data-quality signal |
| `actorType` | enum | `DRIVER \| TRANSPORTER \| SHIPPER \| SYSTEM \| OPS` |
| `actorId` | String? | → User |
| `locationName` | String? | |
| `lat`, `lng` | Decimal? | |
| `note` | Text? | |

**Unique:** `(bookingId, seq)` · **Index:** `(bookingId, occurredAt)`

### 4.4 `Charge` *(renamed from `ShipmentCharge`)*
**Purpose:** money attached to one truck's movement. Feeds BI cost analysis **and** invoice line items — one source, so the two cannot drift.

| Field | Type | Notes |
|---|---|---|
| `id` | String | PK |
| `bookingId` | String | indexed |
| `type` | enum | 7 `CHARGE_TYPES`; the 4 `PENALTY_CHARGE_TYPES` are `waiting, detention, demurrage, storage` |
| `amountMinorUnits` | BigInt | |
| `currency`, `fxRate`, `baseAmountMinorUnits` | | ⚠️ detention is quoted in **USD** while the ledger is DJF (BR-6.16) |
| `incurredFrom` / `incurredTo` | DateTime? | per-day accessorials need a window — `overlapDays()` pro-rates across period boundaries |
| `quantity` | Decimal(8,2)? | container-days |
| `ratePerDayMinorUnits` | BigInt? | |
| `description` | Text? | |
| `invoiceId` | String? | indexed — null until billed |

**Index:** `(bookingId, type)`, `(invoiceId)`

### 4.5 `DelayAttribution` *(FK rescoped to `Booking`)*
**Purpose:** BR-6.9 — *attribution is read, never inferred.* A delay report that recomputes blame per query cannot be disputed. Delay is a per-truck fact — a late booking on a 3-truck shipment must not read as the whole order being late.

| Field | Type | Notes |
|---|---|---|
| `id` | String | PK |
| `bookingId` | String | indexed |
| `owner` | enum | 8 `DELAY_OWNERS` (shipper view) |
| `party` | enum | `SHIPPER \| TRANSPORTER \| FLEETIN` |
| `cause` | enum? | 8 `DELAY_CAUSES` (carrier view) — ⚠️ **two disjoint taxonomies, DD-13** |
| `delayMinutes` | Int | |
| `stage` | enum? | where it happened |
| `notes` | Text? | |
| `recordedById` | String | → User — attribution is a human act |
| `recordedAt` | DateTime | |

---

## 5. Containers & Empty Returns

**Rescoped by the DD-04 resolution above:** since `Booking` is now 1:1 with
one container (`vehiclesNeeded = containerQuantity` — one truck, one box), the
Phase 2 `ShipmentContainer` join table is no longer needed. `Container`
carries a direct `bookingId`, and the container-return fields it held move
onto `Container` itself.

### 5.1 `Container`
**Purpose:** the physical box, tracked across the one booking that moves it and every return cycle after.

| Field | Type | Notes |
|---|---|---|
| `id` | String | PK |
| `number` | String(16) | **unique**, indexed — ISO 6346 **unformatted** (`TCLU1111111`); ⚠️ two formats today |
| `format` | enum | ⚠️ **three vocabularies**, DD-12 — recommend the 6-value BI set |
| `shippingLine` | String(64)? | derived from the owner prefix when absent (BR-3.7) |
| `currentStatus` | enum | 5 `CONTAINER_STATUSES` |
| `bookingId` | String | **unique**, indexed | the one truck that delivered it — replaces the Phase 2 `ShipmentContainer` join table |
| `returnDepotId` | String? | → Location |
| `returnDeadline` | DateTime? | from `ContainerReturnInfo` |
| `freeDays` | Int | default 7 — ⚠️ captured but unused (BR-4.13) |
| `freeTimeExpiresAt` | DateTime? | BI needs it; **should be derived** from gate-out + freeDays |
| `gateOutAt`, `deliveredAt`, `returnedAt` | DateTime? | detention/demurrage split (BR-6.4) |

### 5.2 `EmptyReturnRecord`
**Purpose:** the aggregate root of the return workflow.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | String | PK | |
| `reference` | String | unique | `ER-101` |
| `containerId` | String | indexed | replaces the bare `container` string |
| `bookingId` | String? | **indexed, unique** | ⚠️ **renamed from `shipmentId`** — the only hard FK in the module; unique enforces BR-3.3. A booking is the right anchor now: each booking owns exactly one container, so a shipment with several trucks gets one empty-return record per truck, not one that has to somehow represent all of them. |
| `shipperId` | String | indexed | ⚠️ **company-name string today** |
| `partnerId` | String | indexed | ⚠️ **company-name string today** |
| `locationId` | String | **indexed** | the matching key |
| `vehicleId` | String? | | ⚠️ `TRK-401` today — a **third** id namespace |
| `status` | enum | indexed | 6 snake_case values |
| `milestone` | Int | | 0–16 |
| `checklist` | Json | | `boolean[16]` |
| `emptyReadyAt` | DateTime? | | |
| `deadline` | DateTime? | **indexed** | null ⇒ no risk at all (BR-4.9) |
| `deadlineStatus` | enum | | `VERIFIED \| UNVERIFIED \| MISSING` |
| `predictedGateIn` | DateTime? | | ⚠️ always `now + 18h` today (BR-4.11) |
| `returnedAt` | DateTime? | | milestone 11 — the protection event |
| `cycleId` | String? | indexed | |
| `chainId` | String? | **indexed** | chains are grouped by this at read time |
| `seq` | Int? | | counts completed cycles too |
| `exception` | enum? | | only 3 literals occur |
| `nextFullBookingId` | String? | | ⚠️ **renamed from `nextFullShipmentId`** — the consumed pool entry is a booking (one truck), not the whole order |
| `nextFullContainerId` | String? | | |

**NOT stored:** `riskOf()` — derived from `deadline`, `predictedGateIn`, `returnedAt` and `now`. Storing it would be wrong.
**Indexes:** `(status, deadline)`, `(locationId, status)`, `(chainId, seq)`, `(partnerId)`

### 5.3 `EmptyReturnCycle`

| Field | Type | Notes |
|---|---|---|
| `id` | String | PK |
| `reference` | String | unique — `CYC-0005` |
| `chainId` | String | indexed |
| `seq` | Int | |
| `emptyReturnRecordId` | String | unique |
| `fullLoadBookingId` | String? | ⚠️ **renamed from `fullLoadShipmentId`** — consumed from the matching pool, which holds open bookings, not open orders |
| `partnerId`, `locationId` | String | the two chain-membership keys (BR-4.4) |
| `createdAt`, `confirmedAt`, `dispatchedAt`, `completedAt` | DateTime? | |

**Chain is NOT a table** — `chainId` is a column; `CycleChain` is computed by `GROUP BY`.

---

## 6. Documents

### 6.1 `Document`
**Purpose:** one polymorphic table replacing `ShipperDocument` (8 categories, 3 statuses) and `PartnerDocument` (11 categories, 4 statuses).

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | String | PK | |
| `ownerType` | enum | **indexed** | `SHIPPER \| PARTNER \| VEHICLE \| DRIVER \| SHIPMENT \| EXPENSE \| ONBOARDING` |
| `ownerId` | String | indexed | |
| `category` | enum | indexed | **union of both lists — 16 distinct values** |
| `name` | String(255) | | |
| `storageKey` | String(512) | | ← Phase 1 `StorageService` key. **Persist this, never the URL** (S3 URLs expire) |
| `mimeType` | String(128) | | |
| `fileSizeBytes` | BigInt | | ⚠️ `'2.4 MB'` string today |
| `status` | enum | indexed | `VERIFIED \| PENDING_REVIEW \| REJECTED \| EXPIRED` — the union |
| `uploadedAt` | DateTime | | |
| `uploadedById` | String | | → User |
| `expiryDate` | DateTime? | **indexed** | drives compliance alerts |
| `verifiedById` | String? | | |
| `verifiedAt` | DateTime? | | |
| `rejectionReason` | Text? | | |
| `version` | Int | default 1 | |
| `supersedesId` | String? | | version chain |
| `downloadCount` | Int | default 0 | tracked today |
| `deletedAt` | DateTime? | | **soft delete — compliance evidence** |

**Indexes:** `(ownerType, ownerId)`, `(expiryDate)` ← the expiry sweep, `(status)`, `(category)`

`EXPIRED` should be **derived** (`expiryDate < now`) rather than written by a job, so it can never go stale. Three separate 30-day expiry implementations exist today (BR-7.3) — unify on one server rule.

---

## 7. Onboarding

### 7.1 `OnboardingRecord`

| Field | Type | Notes |
|---|---|---|
| `id` | String | PK |
| `reference` | String | unique — `ONB-2026-001` |
| `entityType` | enum | `PARTNER \| SHIPPER` |
| `companyLegalName` | String(255) | |
| `registrationNumber` | String(64) | indexed — the only soft link to Shipper/Partner |
| `country`, `industry` | String | |
| `logoUrl` | Text? | |
| `onboardingStatus` | enum | indexed — 6 values |
| `assignedAccountManagerId` | String | → User (⚠️ embedded whole object today) |
| `progress` | Int | **derived** from completed actions (BR-8.2) — store as cache or compute |
| `currentStageId` | String? | → OnboardingStage |
| `creationDate`, `approvalDate`, `targetCompletionDate` | DateTime? | ⚠️ a Rejected record still has an `approvalDate` — rename to `decisionDate` |
| `primaryContactName`, `primaryContactEmail` | String | |
| **`resultingShipperId`** | String? | ⚠️ **does not exist today — DD-08** |
| **`resultingPartnerId`** | String? | ⚠️ same |

### 7.2 `OnboardingStage` · `OnboardingAction` · `OnboardingComment`

- **Stage** — reference data, 4 rows (`STG-01`…`STG-04`), with `targetTimeDays` for bottleneck analytics.
- **Action** — `{ title, category(5), assignedTo(4), dueDate?, isCompleted, priority(3) }`, cascade.
- **Comment** — `{ authorId, message, timestamp, statusChange? }`. The `statusChange` column means the audit trail and the state machine are **one stream** (BR-8.3).

---

## 8. Identity & Access additions

Phase 1 built `User`, `Role`, `RefreshToken`. Required additions:

| Change | Reason |
|---|---|
| Seed `SHIPPER` and `TRANSPORTER` roles | The frontend uses 7 roles; Phase 1 seeded 5 (BR-10.4) |
| `User.shipperId` / `User.partnerId` (nullable) | Portal users are scoped to one company (BR-10.5) |
| Row-level scoping in every operational query | A shipper user must see only their own shipments |

### 8.1 `Employee` — ⚠️ **DD-07**
`/employees` is a placeholder, but `ExpenseEntry.paidById` (`emp-01`), `CounterpartyType.EMPLOYEE` and `ExpenseCategory.SALARY` all reference employees that have no table. Decide whether `Employee` is a distinct table or a profile on `User`.

---

## 9. What is NOT stored

| Concept | Why |
|---|---|
| `ReturnRiskLevel` | Pure function of deadline/prediction/return + `now` (BR-4.9) |
| Invoice `Overdue`, Drawdown `Overdue`/`Breached` | Computed at read time; no action writes them (BR-5.5) |
| Compliance score & alerts | Derived from expiries (BR-6.14) |
| `CycleChain` | `GROUP BY chainId` |
| All KPIs and BI aggregates | Recomputed from facts |
| `Shipper.activeShipments` / `pastShipments` | Already recomputed live by the page |
| `Partner.fleetSize` | ⚠️ **kept** — it is a *declared* figure that deliberately differs from `COUNT(vehicles)` |
| Risk score, on-time rate, utilisation | Aggregations |

---

## 10. Index summary (highest value first)

| Table | Index | Serves |
|---|---|---|
| Shipment | `(shipperId, status)` | portal scoping + list filters |
| Shipment | `(createdAt)` | BI period anchoring (BR-6.8) |
| Booking | `(shipmentId)`, `(partnerId, status)` | order → its trucks; carrier scoping |
| Booking | `(status, plannedDeliveryAt)` | operational queues |
| EmptyReturnRecord | `(status, deadline)` | the urgent rail + risk sort |
| EmptyReturnRecord | `(locationId, status)` | **the matching query** (BR-4.2) |
| EmptyReturnRecord | `(chainId, seq)` | chain assembly |
| Document | `(expiryDate)` | compliance sweep |
| Document | `(ownerType, ownerId)` | per-entity document tab |
| Vehicle | `(insuranceExpiry)`, `(registrationExpiry)` | compliance alerts |
| Driver | `(licenseExpiry)` | licence-alert KPI |
| BookingEvent | `(bookingId, seq)` unique | stage ordering |
| Charge | `(bookingId, type)` | cost breakdown |

---

## 11. Migration sequencing (Phase 3)

1. **Reference data** — `Location`, `OnboardingStage`, enums
2. **Counterparties** — `Shipper`, `Partner`, `Contact`, `PartnerBankAccount`, `PricingTier`
3. **Fleet** — `Vehicle`, `Driver`, assignment history
4. **Documents** — `Document` (unblocks compliance across all of the above)
5. **Shipments & Bookings** — `Shipment`, `Booking`, `BookingEvent`, `Charge`, `DelayAttribution`
6. **Containers** — `Container` (carries `bookingId` directly — no join table, see §5)
7. **Empty Returns** — `EmptyReturnRecord`, `EmptyReturnCycle`
8. **Onboarding**
9. **Finance bridge** — add nullable FK columns *alongside* the existing soft ids; backfill; **never drop the denormalised snapshots**. `PaymentOrder.missionId` and `InvoiceLineItem.missionId`/`.bookingId` should gain real `bookingId` FKs at this step — see `ENTITY_RELATIONSHIP_DIAGRAM.md` §2.

Each step is an independent migration. The finance schema is not modified at any point — step 9 only **adds** columns.

---

## 12. Blocking decisions

No table above is final until every item in `DOMAIN_DECISIONS_FINAL.md` is confirmed. **DD-04 and DD-03 are resolved** as of Phase 2.1 (this document reflects that resolution); still open:

| # | Question | Blocks |
|---|---|---|
| DD-01 | One `Company` or separate Shipper/Partner? | §1 entirely |
| DD-05 | Location model + the five seeded yards | §3, and the matching rule |
| DD-10 | One money representation | every monetary column |
| DD-11 | Which mock counterparty list is real? | all seeding |
| DD-12 | Container-type and stage vocabularies | `Container.format`, `Booking.status` |
