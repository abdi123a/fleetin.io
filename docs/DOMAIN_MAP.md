# FLEETIN — Domain Map

**Phase 2 analysis. No code changes. No Prisma models created.**

Source of truth: the existing frontend at `../fleetin design system`. Every classification below is evidenced by a file path.

---

## 1. How to read this

The brief asked whether each named domain is an **entity**, a **role**, a **type**, a **relationship**, a **view**, or a **derived concept**. That distinction is the whole point of this document — the frontend has *far* more nouns than it has tables.

| Classification | Meaning |
|---|---|
| **ENTITY** | Deserves its own table with an identity that outlives any single transaction |
| **ROLE** | A capacity another entity acts in — not its own table |
| **SUB-ENTITY** | Owned by a parent; has a table, but no independent lifecycle |
| **VIEW** | A read-model composed from other tables; no storage |
| **DERIVED** | Computed on demand and deliberately never stored |
| **PLACEHOLDER** | A route exists, but no model or data does |

---

## 2. Domain inventory

| # | Domain | Classification | Verdict |
|---|---|---|---|
| 1 | **Partner** | **ENTITY** | The carrier company. `PartnerRecord`. |
| 2 | **Transporter** | **ROLE of Partner** | Not a separate table — see §3.1. |
| 3 | **Shipper** | **ENTITY** | The cargo-owning customer. `ShipperRecord`. |
| 4 | **Vehicle** | **SUB-ENTITY of Partner** | Embedded in `PartnerRecord.vehicles[]` today. |
| 5 | **Driver** | **SUB-ENTITY of Partner** | Embedded in `PartnerRecord.drivers[]` today. |
| 6 | **Employee** | **PLACEHOLDER** | `/employees` renders a stub. Real employee-shaped data exists only in finance (`emp-01`, `SALARY`, `FinanceUser`). |
| 7 | **Document** | **ENTITY (polymorphic owner)** | Two rival shapes today; one table with an owner discriminator. |
| 8 | **Location** | **ENTITY — currently missing** | The single biggest schema gap. See §3.4. |
| 9 | **Shipment** | **ENTITY** | `Mission` is the shipment. The two words are synonyms in this codebase. |
| 10 | **Mission** | **SAME AS Shipment** | `/shipments`, `/missions` and `/bookings` all render `MissionsPage`. |
| 11 | **Booking** | **UNRESOLVED** | `bookingId` is a string field; no model, but `/bookings/:id` routes exist. See DD-04. |
| 12 | **Empty Return** | **ENTITY + workflow engine** | `EmptyReturnRecord` — a genuine aggregate root with a 16-milestone state machine. |
| 13 | **Cycle / Chain** | **ENTITY (Cycle) + DERIVED (Chain)** | See §3.5. |
| 14 | **Finance** | **ENTITIES — already built** | 13 Prisma models exist. Do not touch. |
| 15 | **Analytics / BI** | **VIEW (derived)** | Aggregations over shipments/events/charges. Zero storage. |
| 16 | **Reports** | **VIEW** | `/reports` is a placeholder; finance reports are live views. |
| 17 | **Onboarding** | **ENTITY** | A real pipeline with its own lifecycle, disconnected from Partner/Shipper. |
| 18 | **Administration / Settings** | **PLACEHOLDER** | Stubs. RBAC has no UI. |

---

## 3. The consequential judgements

### 3.1 Transporter is a ROLE, not an entity — **evidence-backed, not assumed**

`shipmentBridge.findPartnerByName()` resolves `mission.transporter.company` by exact match against `PartnerRecord.companyLegalName`, and `shipment.store.assignShipmentToCycle()` then writes that partner's id onto the shipment. The two are the same company record.

The word "transporter" appears in **six** different shapes across the codebase:

| Shape | Identity used | Source |
|---|---|---|
| `PartnerRecord` | `PTR-001` | `types/partner.ts` |
| `Mission.transporter` (`TransporterInfo`) | `PTR-001` + snapshot | `types/mission.ts` |
| `PaymentOrder.transporter*` | `PTR-001` + snapshot | `types/finance.ts` |
| `EmptyReturnRecord.transporter` | **company name string** | `types/emptyReturn.ts` |
| `TransporterCycleStats` | company name string | `types/emptyReturn.ts` |
| BI `Transporter` / `TransporterProfile` | own id space | `features/*-bi/contracts` |

**Verdict: one `partner` table.** `fleetCode` and `rating` are attributes of it (today they exist only on embedded snapshots). Critically, `Mission.transporter.name` and `PaymentOrder.transporterName` hold the **dispatcher person**, not the company — that is a `contact`, not the partner.

### 3.2 Shipper and Partner are siblings, not the same table

Both carry an identical company-identity block (legal name, registration number, country, address, primary contact, documents, logo). They diverge entirely in operational payload and status vocabulary:

| | Shipper | Partner |
|---|---|---|
| Status | `Verified \| Pending \| Canceled` | `Active \| Suspended \| Pending \| Inactive` |
| Payload | `industry`, `companySize`, `projectsCount` | `operatingRegions`, `serviceCategories`, `fleetSize`, `vehicles[]`, `drivers[]`, `pricingGrid[]`, `bankAccount` |

Pulling the other way: **onboarding runs one pipeline for both** (`EntityType = 'Partner' | 'Shipper'`), and finance addresses them through one polymorphic pair (`counterpartyType` + `counterpartyId`).

→ **DD-01**: two tables, or one `company` supertype with role flags? Recommended: two tables plus a shared `contact`/`document` model. Requires confirmation.

### 3.3 Vehicles and Drivers belong to a Partner

`getAllVehicles()` / `getAllDrivers()` flatten `PartnerRecord.vehicles|drivers`, decorating each row with `partnerId/partnerName/partnerLogo/partnerCountry`. `addVehicleToPartner()` mutates the parent and recomputes `fleetSize`. **No standalone vehicle or driver collection exists anywhere in the app.**

Driver ⇄ Vehicle is bidirectional and denormalised: `PartnerDriver.assignedVehicleId` + `assignedVehiclePlate`, `PartnerVehicle.assignedDriverId` + `assignedDriverName`. Both sides are optional, so the real cardinality is **0..1 ⇄ 0..1** — which contradicts the operational reality of drivers rotating across trucks. → **DD-06**.

### 3.4 Location is the biggest missing table

Three unrelated vocabularies describe "a place" today:

1. `Mission.pickupLocation` / `deliveryLocation` — embedded `LocationInfo` free text, **no id**.
2. `EmptyReturnRecord.locationId` — `LOC-01`…`LOC-05`, a closed set that exists **only** as string fragments inside `shipmentBridge.resolveReturnLocation()`.
3. `/locations` + `LocationRecord {id, city, cityLabel, address, addressLabel}` in `LocationsPage` — a fourth shape with no type in `src/types`.

`resolveReturnLocation()` lowercases `"${name} ${address} ${city}"` and fragment-matches five hardcoded yards, falling back to `LOC-X-${SLUG}`. **Location-ID equality is the only hard matching rule in the entire empty-return engine** (BR-4.2) — so this string-matching heuristic is currently load-bearing for the core workflow. It must become a real table.

### 3.5 Cycle is an entity; Chain is derived

- **Cycle** (`CYC-0005`) — minted by `createCycle`, carries its own identity, appears on `EmptyReturnRecord.cycleId`. **Entity.**
- **Chain** (`CHN-003`) — `selectChains()` *groups records by `chainId`* at read time. `CycleChain` is a computed shape (`{cycles[], first, completed, active, onTime, statusLabel, maxSequence}`) that is never persisted. The `chainId` **column** is real; the chain **object** is a view.

### 3.6 Analytics is entirely derived — and already specifies its own backend contract

`src/features/shipper-bi/contracts/` is written as a backend specification. Its own docblock states the models will be *mirrored as Prisma models*, and `sections.ts` already enumerates the endpoints:

```
GET /shippers/:id/bi/{overview,operations,cost,delays,empty-returns,performance,shipments}
```

Only `overview` is implemented client-side. **The BI contract triple — `Shipment` + `ShipmentEvent` + `Charge` — is the best-designed model in the repository** (store events and money, derive every metric) and is the strongest available signal about intended schema. See DD-03.

### 3.7 Onboarding is a real entity, orphaned from its outcome

`OnboardingRecord` has a full lifecycle (6 statuses, 4 fixed stages, pending actions, comment history with embedded status transitions). But it has **no `shipperId` or `partnerId`**. Approving a record does not create a Partner or Shipper. The only soft link is a shared `registrationNumber` on one of six mock records. → **DD-08**.

---

## 4. Domains that are NOT entities

| Named domain | What it actually is |
|---|---|
| Transporter | Role of Partner (§3.1) |
| Mission | Synonym for Shipment |
| Analytics / BI | Read-model over Shipment + ShipmentEvent + Charge |
| Reports | Parameterised views over finance and BI |
| Chain | `GROUP BY chainId` at read time |
| Risk level (`safe`…`protected`) | **Derived, never stored** — `riskOf(record, now)` |
| Compliance score / alerts | Derived from document + licence + insurance expiries |
| `Overdue` (invoice, drawdown) | Computed at read time; **no action ever writes it** |
| KPIs | Recomputed on every mutation |
| Dashboard fixtures | Throwaway UI mocks with their own vocabulary (§5.3) |

---

## 5. Data-integrity findings that constrain the schema

### 5.1 ID collisions between mock files — **must be reconciled before any import**

The same identifier denotes **different companies** in different files:

| id | `shippersData.ts` | `financeMockData.ts` |
|---|---|---|
| SHP-101 | AMINA FZCO | AMINA FZCO ✅ |
| SHP-102 | Al-Baraka Logistics Ltd | **Horn Logistics Trading** ❌ |
| SHP-103 | Red Sea Cargo Group | **Djibouti Free Zone Import Co** ❌ |
| SHP-104 | Horn Freight Express | **Ethiopian Cargo Connect** ❌ |
| PTR-002 | Horn Transit Solutions | **Gulf Trans Logistics** ❌ |
| PTR-003 | Al-Baraka Transport Co. | **Babelmandeb Transport** ❌ |

`MSN-2026-8801` likewise describes different cargo, customer, route and a rate differing by ~53× (`rateFDJ: 50 000` vs `createMoney(2 650 000)`). **The finance module was written against a different counterparty list.** → **DD-11**.

Also: five `PO-2026-xxxx` ids referenced inside `Drawdown.fundedPaymentOrders` do not exist in `MOCK_PAYMENT_ORDERS`, and `VEH-104` on `MSN-2026-8803` is absent from PTR-002's fleet.

### 5.2 Four incompatible money representations

| Representation | Units | Where |
|---|---|---|
| `Mission.rateFDJ: number` | whole francs | `types/mission.ts` |
| `Money {amount, scale, currency, fxRate, baseAmount}` | integer minor units | `types/finance.ts` |
| BI `Charge.amount: number` + `currency: 'DJF'` | whole francs — *"minor units are overkill for DJF"* | `shipper-bi` |
| transporter-BI `revenue`, `ratePerKm` | whole **USD** | `transporter-bi` |

Plus `PricingTier.basePrice` in USD, and dashboard fixtures using float millions and strings (`'4.2M DJF'`). The existing Prisma `Money` model (minor units + scale + fxRate + baseAmount) is the correct target — everything else converts into it. → **DD-10**.

### 5.3 Five status vocabularies for "where is the shipment"

`MissionStatus` (12, Title Case) · BI `STAGE_KEYS` (11, snake_case) · transporter-BI `TRIP_STATUSES` (7) · `EmptyReturnStatus` (6) · dashboard fixtures (`'In Transit' | 'At Port' | 'Unloaded' | 'Pending Return' | 'Paid'`). The last is throwaway; the first four are all real and must be reconciled or explicitly kept separate.

### 5.4 Seven date formats

`'YYYY-MM-DD HH:mm'` · `'YYYY-MM-DD HH:mm:ss'` (timeline only) · `'YYYY-MM-DD'` · `'DD MMM YYYY'` (registration/upload dates) · **epoch milliseconds** (all of Empty Return) · ISO-8601 with offset (BI) · human strings (`'3 days'`, `'2 min ago'`). `PartnerDocument` mixes two formats **on the same record**. Backend: ISO-8601 UTC everywhere, format at the edge.

### 5.5 Missing audit columns
Only finance carries `createdById`/`approvedById`/`createdAt`/`updatedAt`. Missions, shippers, partners and empty returns have **no `updatedAt`** and no soft-delete anywhere.

---

## 6. Module → domain matrix

| Frontend module | Route | Reads | Domain classification |
|---|---|---|---|
| Shipments / Missions / Bookings | `/shipments`, `/missions`, `/bookings` | `shipment.store` ← `MOCK_MISSIONS` | Shipment **ENTITY** |
| Shipment detail | `/shipments/:id` | hardcoded array | Shipment + Booking **VIEW** |
| Locations | `/locations` | `LocationRecord` | Location **ENTITY (missing)** |
| Empty Return ×5 | `/empty-returns/*` | `emptyReturn.store` | EmptyReturn **ENTITY** + Cycle **ENTITY** + Chain **VIEW** |
| Shippers | `/shippers` | `MOCK_SHIPPERS` + live join | Shipper **ENTITY** |
| Partners | `/partners` | `INITIAL_PARTNERS` | Partner **ENTITY** |
| Vehicles | `/vehicles` | `getAllVehicles()` | Vehicle **SUB-ENTITY** |
| Drivers | `/drivers` | `getAllDrivers()` | Driver **SUB-ENTITY** |
| Employees | `/employees` | — | **PLACEHOLDER** |
| Documents | `/documents` | — | **PLACEHOLDER** (data exists per-entity) |
| Finance ×7 | `/finance/*` | `finance.store` | **13 models already built** |
| Analytics | `/analytics` | `shipper-bi` | **VIEW** |
| Transporter portal | `/transporter-*` | `transporter-bi` | **VIEW** |
| Onboarding | `/onboarding` | `onboardingData` | Onboarding **ENTITY** |
| Administration / Settings / Reports | — | — | **PLACEHOLDER** |

---

## 7. Proposed entity set

**New operational tables (Phase 3):**

1. `Company` *(pending DD-01)* — or separate `Shipper` + `Partner`
2. `Shipper`
3. `Partner`
4. `Contact` — collapses `ContactPerson`, `DispatcherContact`, `AccountManager`
5. `Vehicle`
6. `Driver`
7. `Location`
8. `Shipment`
9. `ShipmentEvent` — the BI contract's event log
10. `ShipmentCharge` — accessorials, feeds both BI and finance
11. `Container`
12. `EmptyReturnRecord`
13. `EmptyReturnCycle`
14. `FullLoadPoolEntry` *(possibly a view over Shipment)*
15. `Document` — polymorphic owner
16. `OnboardingRecord` + `OnboardingAction` + `OnboardingComment`
17. `DelayAttribution` — stored, never inferred (BR-6.9)
18. `PricingTier`

**Untouched:** the 13 existing finance models.

**Deferred:** `Employee`, `Booking` (DD-04), `Report`.

---

## 8. Integration reality

- The app is **~99% mock**. Exactly one real network call exists: `POST /auth/login`, wrapped in a try/catch that falls back to demo mode granting `permissions: ['*']` on any failure.
- `src/services/api.client.ts` already targets `http://localhost:3000/api/v1` with a `{success, data, message, timestamp}` envelope — **the exact contract Phase 1 built**. It has only `get` and `post`; no `patch`/`delete`, no 401 refresh.
- `useMutation` is used **zero** times. Every write is a synchronous Zustand `set()`.
- The two BI service files (`shipper-bi/api/biService.ts`, `transporter-bi/api/service.ts`) are already async and request-object shaped, with in-code promises that *"when `fleetin-backend` lands, the bodies become fetches and nothing above this file changes."* **These are the cleanest integration seams in the app.**
