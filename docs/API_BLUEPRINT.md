# FLEETIN — API Blueprint

**Phase 2 analysis. PROPOSED ONLY — no endpoints implemented.**

---

## 0. Conventions

### Envelope — already agreed by both halves
`src/services/api.client.ts` expects exactly what Phase 1 emits:

```jsonc
// success
{ "success": true, "data": { }, "timestamp": "2026-08-11T10:43:26.497Z" }
// error
{ "success": false, "statusCode": 403, "timestamp": "…",
  "path": "/api/v1/partners", "method": "GET",
  "message": "Insufficient permissions. Requires one of: [partners.view]" }
```

Base path `/api/v1`. Bearer auth. Every route is protected by default; `@Public()` opts out.

### Pagination
The frontend's own `shipmentsSectionSchema` already specifies the contract — adopt it verbatim:

```jsonc
{ "rows": [], "total": 128, "page": 1, "pageSize": 25 }
```

Query: `?page=1&pageSize=25` (default 25, max 100).

### Sorting & filtering
`?sort=<field>:<asc|desc>` (repeatable). Filters are typed query params validated against the enums in `DATABASE_BLUEPRINT.md`; unknown params are **rejected** (the global `ValidationPipe` already runs `forbidNonWhitelisted`).

### Deletion
`DELETE` = soft delete (`deletedAt`) for operational entities. Finance is never deleted — reverse by counter-entry.

### Permissions
Every route names a permission from the Phase 1 catalogue (`src/common/constants/permissions.ts`). Portal users (`SHIPPER`/`TRANSPORTER`) are additionally **row-scoped** by `User.shipperId` / `User.partnerId` (BR-10.5) — scoping is applied server-side, never by a client-supplied filter.

### Workflow endpoints
State transitions are `POST /:id/<verb>`, never a `PATCH` on `status`. **Every guard listed in `BUSINESS_RULES.md` must be re-implemented server-side** — they live in React components today.

---

## 1. Shippers

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/shippers` | `shippers.view` | list |
| GET | `/shippers/:id` | `shippers.view` | detail |
| POST | `/shippers` | `shippers.create` | |
| PATCH | `/shippers/:id` | `shippers.update` | |
| DELETE | `/shippers/:id` | `shippers.delete` | soft |
| GET | `/shippers/:id/shipments` | `shipments.view` | paginated |
| GET | `/shippers/:id/documents` | `documents.view` | |
| GET | `/shippers/:id/completion` | `shippers.view` | derived profile-completion |

**Filters:** `q`, `status=Verified|Pending|Canceled`, `industry`, `country`
**Sort:** `name:asc|desc`, `shipments:desc`, `createdAt:desc`

`GET /shippers` list row — note the two counts are **computed, not stored**:
```jsonc
{ "id": "…", "reference": "SHP-101", "companyLegalName": "AMINA FZCO",
  "industry": "Logistics & Freight", "country": "Djibouti",
  "approvalStatus": "VERIFIED", "logoUrl": "…",
  "activeShipments": 4, "pastShipments": 28,
  "primaryContact": { "name": "…", "email": "…", "phone": "…" } }
```

`POST /shippers` body: `companyLegalName, registrationNumber, industry, companySize, country, address, primaryContact{name,title,email,phone}, approvalStatus?`

---

## 2. Partners (Transporters)

| Method | Path | Permission |
|---|---|---|
| GET | `/partners` | `partners.view` |
| GET | `/partners/:id` | `partners.view` |
| POST | `/partners` | `partners.create` |
| PATCH | `/partners/:id` | `partners.update` |
| DELETE | `/partners/:id` | `partners.delete` |
| GET | `/partners/:id/compliance` | `partners.view` |
| GET/POST | `/partners/:id/vehicles` | `vehicles.view` / `vehicles.create` |
| GET/POST | `/partners/:id/drivers` | `drivers.view` / `drivers.create` |
| GET/POST | `/partners/:id/pricing` | `partners.view` / `partners.update` |
| GET | `/partners/:id/documents` | `documents.view` |

**Filters:** `q`, `status=Active|Pending|Suspended|Inactive`, `country`, `serviceCategory`
**Sort:** `name:asc|desc`, `fleet:desc`, `score:desc`

`GET /partners/:id/compliance` — the derived block (BR-6.14). Score must be server-computed so the browser cannot inflate it:
```jsonc
{ "score": 87,
  "breakdown": { "documentsVerified": 0.9, "driversValid": 1.0, "vehiclesValid": 0.75 },
  "alerts": [ { "type": "expiring_soon", "severity": "warning",
                "message": "Driver licence DL-DJ-44821 expires in 12 days",
                "relatedDocId": "…", "date": "2026-08-15" } ] }
```

**Vehicles/drivers are nested on purpose** — they have no independent existence (BR-1.5). Flat `/vehicles` and `/drivers` exist only as read views (§3).

---

## 3. Vehicles & Drivers (flat read views)

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/vehicles` | `vehicles.view` | flattened across partners (`getAllVehicles()`) |
| GET | `/vehicles/:id` | `vehicles.view` | |
| PATCH | `/vehicles/:id` | `vehicles.update` | |
| DELETE | `/vehicles/:id` | `vehicles.delete` | |
| POST | `/vehicles/:id/assign-driver` | `vehicles.update` | ⚠️ DD-06 |
| GET | `/drivers` | `drivers.view` | |
| GET/PATCH/DELETE | `/drivers/:id` | `drivers.*` | |
| GET | `/vehicles/expiring` | `vehicles.view` | insurance/registration ≤30 days |
| GET | `/drivers/expiring` | `drivers.view` | licence ≤30 days |

**Vehicle filters:** `q`, `operationalStatus`, `truckType`, `partnerId`
**Driver filters:** `q`, `status`, `partnerId`, `licenseExpiringWithinDays`

Every row carries the enrichment the frontend already expects: `partnerId, partnerName, partnerLogo, partnerCountry`.

---

## 4. Locations

| Method | Path | Permission |
|---|---|---|
| GET | `/locations` | `locations.view` |
| GET | `/locations/:id` | `locations.view` |
| POST | `/locations` | `locations.create` |
| PATCH | `/locations/:id` | `locations.update` |
| DELETE | `/locations/:id` | `locations.delete` |
| GET | `/locations/return-depots` | `locations.view` | `isReturnDepot = true` |

**Filters:** `q`, `type`, `city`, `country`, `isReturnDepot`
Also required: reference endpoints for `geoData.ts` — `GET /reference/countries`, `/reference/states?country=`, `/reference/cities?state=`.

---

## 5. Shipments

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/shipments` | `shipments.view` | row-scoped for portal users |
| GET | `/shipments/:id` | `shipments.view` | |
| POST | `/shipments` | `shipments.create` | the Create Shipment wizard |
| PATCH | `/shipments/:id` | `shipments.update` | non-status fields only |
| DELETE | `/shipments/:id` | `shipments.delete` | soft |
| GET | `/shipments/:id/timeline` | `shipments.view` | events ordered by `seq` |
| GET | `/shipments/:id/charges` | `shipments.view` | |
| GET | `/shipments/kpis` | `shipments.view` | the 4 header tiles |

### Workflow endpoints — status is never PATCHed

| Method | Path | Guard |
|---|---|---|
| POST | `/shipments/:id/assign-vehicle` | → `Assigned` |
| POST | `/shipments/:id/assign-driver` | → `Driver Assigned` |
| POST | `/shipments/:id/depart` | → `En Route` |
| POST | `/shipments/:id/arrive` | → `Arrived` — **also spawns the empty-return record** |
| POST | `/shipments/:id/start-unloading` | → `Unloading` |
| POST | `/shipments/:id/submit-pod` | → `POD Submitted`, requires a POD document |
| POST | `/shipments/:id/complete` | → `Completed` |
| POST | `/shipments/:id/cancel` | → `Cancelled` |

**Each must validate the FROM state** (BR-2.1). The store accepts any transition today (BR-2.2). The two cross-module edges (BR-2.3) are triggered by the empty-return module, not exposed here.

**Filters** (all already in `MissionFilterState`): `q` (searches reference, bookingReference, clientReference, dpcsReference, shipper name/company, plate, containerNumber), `status`, `paymentStatus`, `shipperId`, `partnerId`, `driverId`, `vehicleId`, `cargoType`, `containerNumber`, `route`, `datePreset=all|today|week|month|custom`, `from`, `to`
**Sort:** `plate:asc`, `booking:asc`, `date:desc`, `customer:asc`

`POST /shipments` — the wizard collects a large body; the server must **derive the rate**, never accept it (BR-2.6):
```jsonc
{ "shipmentSource": "dpcs", "dpcsReference": "DPCS-DJ-7731",
  "shipmentCategory": "container_40", "shipperId": "…", "partnerId": "…",
  "pickupLocationId": "…", "deliveryLocationId": "…",
  "scheduledPickupAt": "2026-08-06T08:30:00Z", "plannedDeliveryAt": "…",
  "cargoType": "…", "goodsDescription": "…", "totalWeightKg": 24000,
  "containers": [ { "number": "MSKU8821940", "format": "40HC",
                    "returnDepotId": "…", "returnDeadline": "2026-08-10T17:00:00Z",
                    "freeDays": 7 } ],
  "vehicleType": "40ft Container", "requiredDocuments": ["Bill of Lading"] }
// response includes the SERVER-RESOLVED rate
{ "rateMinorUnits": 50000, "currency": "FDJ", "rateSource": "pricingTier:PG-01" }
```

---

## 6. Empty Returns

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/empty-returns` | `empty-returns.view` | filtered + risk-sorted |
| GET | `/empty-returns/:id` | `empty-returns.view` | |
| GET | `/empty-returns/kpis` | `empty-returns.view` | the 5 console KPIs |
| GET | `/empty-returns/urgent` | `empty-returns.view` | `?limit=5` |
| GET | `/empty-returns/chains` | `empty-returns.view` | derived grouping |
| GET | `/empty-returns/transporters` | `empty-returns.view` | per-carrier stats |
| GET | `/empty-returns/matching` | `empty-returns.view` | eligible + candidates |
| GET | `/empty-returns/pool` | `empty-returns.view` | open full loads |

### Workflow — each maps to one store action, **with the guards restored**

| Method | Path | Required FROM | Guard to enforce |
|---|---|---|---|
| POST | `/empty-returns/:id/mark-empty-ready` | `unloading` | UI-only today |
| POST | `/empty-returns/:id/mark-standalone` | any | sets exception, status unchanged |
| POST | `/empty-returns/:id/create-cycle` | `empty_ready` | **same `locationId`** + no exception (BR-4.2) |
| PATCH | `/empty-returns/:id/checklist` | `preparing` | `{ index, value }` |
| POST | `/empty-returns/:id/confirm-cycle` | `preparing` | **all 16 items** — UI-only today |
| POST | `/empty-returns/:id/dispatch` | `ready` | UI-only today |
| POST | `/empty-returns/:id/advance-milestone` | `in_progress` | m11 stamps `returnedAt`; m16 completes **and spawns** |

`GET /empty-returns` row — **`risk` and `slackMs` are computed server-side** so both halves cannot disagree:
```jsonc
{ "id": "…", "reference": "ER-105", "container": "MSKU2222222", "format": "40HC",
  "shipper": { "id": "…", "name": "AMINA FZCO" },
  "partner": { "id": "…", "name": "Red Sea Express Ltd" },
  "location": { "id": "…", "reference": "LOC-01", "name": "Boulaos Industrial Yard" },
  "status": "in_progress", "milestone": 12, "checklistDone": 14,
  "deadline": "2026-08-12T17:00:00Z", "deadlineStatus": "verified",
  "predictedGateIn": "…", "returnedAt": null,
  "risk": "critical", "slackMs": 18000000,
  "cycle": { "id": "…", "reference": "CYC-0002", "chainId": "CHN-001", "seq": 2 },
  "exception": null, "shipmentId": "…" }
```

`POST /empty-returns/:id/create-cycle` returns `{ cycleId, chainId, sequence }` **and** the side effect on the shipment — the response must state it, because the client currently learns it only by re-reading another store:
```jsonc
{ "cycle": { "reference": "CYC-0006", "chainId": "CHN-003", "seq": 1 },
  "sideEffects": [ { "entity": "shipment", "id": "…", "statusChangedTo": "Assigned" } ] }
```

**Filters:** `q`, `status=all|assigned|<EmptyReturnStatus>`, `risk=all|crit|<ReturnRiskLevel>`, `locationId`, `partnerId`

---

## 7. Documents

| Method | Path | Permission |
|---|---|---|
| GET | `/documents` | `documents.view` |
| GET | `/documents/:id` | `documents.view` |
| POST | `/documents` | `documents.upload` (multipart) |
| GET | `/documents/:id/download` | `documents.view` — increments `downloadCount` |
| POST | `/documents/:id/verify` | `documents.verify` |
| POST | `/documents/:id/reject` | `documents.verify` — `{ reason }` required |
| DELETE | `/documents/:id` | `documents.delete` — soft |
| GET | `/documents/expiring` | `documents.view` — `?withinDays=30` |

`POST /documents` (multipart): `file`, `ownerType`, `ownerId`, `category`, `expiryDate?`
Response returns `storageKey` and a **short-lived** `url`. Clients must persist the id, never the URL (S3 presigned URLs expire).

**Filters:** `ownerType`, `ownerId`, `category`, `status`, `expiringWithinDays`

---

## 8. Onboarding

| Method | Path | Permission |
|---|---|---|
| GET / POST | `/onboarding` | `onboarding.view` / `.create` |
| GET / PATCH | `/onboarding/:id` | `onboarding.view` / `.update` |
| POST | `/onboarding/:id/comments` | `onboarding.update` — may carry `statusChange` |
| POST | `/onboarding/:id/actions` | `onboarding.update` |
| PATCH | `/onboarding/:id/actions/:actionId` | `onboarding.update` — toggles, recomputes `progress` |
| POST | `/onboarding/:id/approve` | `onboarding.approve` | ⚠️ **DD-08** — does this create the Shipper/Partner? |
| POST | `/onboarding/:id/reject` | `onboarding.approve` |
| GET | `/onboarding/metrics` | `onboarding.view` — bottleneck analytics |

**Filters:** `q`, `status`, `entityType`, `accountManagerId`

---

## 9. Business Intelligence

The frontend has **already written this endpoint list** in `src/features/shipper-bi/contracts/sections.ts`. Adopt it verbatim — six of the seven schemas are fully specified and unimplemented.

| Method | Path | Permission |
|---|---|---|
| GET | `/shippers/:id/bi/overview` | `analytics.view` |
| GET | `/shippers/:id/bi/operations` | `analytics.view` |
| GET | `/shippers/:id/bi/cost` | `analytics.view` |
| GET | `/shippers/:id/bi/delays` | `analytics.view` |
| GET | `/shippers/:id/bi/empty-returns` | `analytics.view` |
| GET | `/shippers/:id/bi/performance` | `analytics.view` |
| GET | `/shippers/:id/bi/shipments` | `analytics.view` — paginated |
| GET | `/shippers/:id/account-summary` | `analytics.view` — unfiltered account view |
| GET | `/partners/:id/bi/overview` | `analytics.view` |
| GET | `/partners/:id/bi/{operations,delays,drivers,payments,network,trips}` | `analytics.view` |

**Shared filter params** (already URL-serialised by `useBiFilters`, keep the short names):
`p` (preset), `from`, `to`, `cmp`, `route`, `trp`, `stage`, `cnt`, `cargo`, `owner`
Transporter side swaps the dimensions for `vehicleIds, driverIds, customerIds, statuses, delayCauses`.

**Two rules that must hold:**
1. **Responses are chart-ready, never raw rows.** The frontend's own rule: *"the moment the panel does grouping/percentages/sorting, the browser and the backend own two copies of the same business definition and they drift."*
2. Every aggregation takes an explicit `asOf`; nothing reads the clock internally (BR-6.11).

⚠️ Three conflicting on-time definitions ship today (BR-6.2). The response should **name the policy it applied**:
```jsonc
{ "kpis": { "onTimeRate": { "value": 0.87, "policy": "shipper.grace12h" } } }
```

---

## 10. Dashboard

`/dashboard` is entirely static fixtures today (`dashboardData.ts`). Each block becomes an endpoint:

| Method | Path | Replaces |
|---|---|---|
| GET | `/dashboard/kpis` | `kpis[6]` |
| GET | `/dashboard/live-ops` | `liveOps` — ⚠️ hardcoded `154` today |
| GET | `/dashboard/pipeline` | `pipelineStages` |
| GET | `/dashboard/revenue-trend` | `revenueTrend` |
| GET | `/dashboard/expense-breakdown` | `expenseBreakdown` |
| GET | `/dashboard/recent-bookings` | `recentBookings` |
| GET | `/dashboard/top-shippers` | `topShippers` |
| GET | `/dashboard/receivables-aging` | `receivablesAging` |
| GET | `/dashboard/fleet-utilization` | `fleetUtilization` |
| GET | `/dashboard/expiring-documents` | `expiringDocuments` |
| GET | `/dashboard/recent-activity` | `recentActivity` — needs an audit-log table |

Treat the fixture *shapes* as throwaway (they use a fifth status vocabulary and incompatible id formats); treat the *panels* as the requirement.

---

## 11. Finance — existing models, endpoints not yet built

Models exist; no controllers do. The store's mutation list is already a clean endpoint inventory.

| Method | Path | Permission | Guard to add |
|---|---|---|---|
| GET | `/finance/kpis` | `finance.view` | |
| GET/POST | `/finance/invoices` | `finance.view` / `.create` | |
| POST | `/finance/invoices/:id/send` | `finance.update` | **must be `Draft`** (none today) |
| POST | `/finance/invoices/:id/dispute` | `finance.update` | |
| POST | `/finance/invoices/:id/write-off` | `finance.approve` | `FINANCE_MANAGER\|ADMIN` |
| POST | `/finance/invoices/:id/credit-note` | `finance.approve` | |
| GET/POST | `/finance/payment-orders` | `finance.view` / `.create` | |
| POST | `/finance/payment-orders/:id/approve` | `finance.approve` | **four-eyes** (BR-5.3) |
| POST | `/finance/payment-orders/:id/pay` | `finance.approve` | **must be `Approved`** (missing today) |
| POST | `/finance/payments` | `finance.create` | with allocations |
| GET/POST | `/finance/drawdowns` | `finance.view` / `.approve` | **check headroom** (missing today) |
| POST | `/finance/drawdowns/:id/repay` | `finance.approve` | |
| GET/POST | `/finance/expenses` | `finance.view` / `.create` | |
| POST | `/finance/expenses/:id/approve` | `finance.approve` | add four-eyes |
| POST | `/finance/expenses/:id/pay` | `finance.approve` | **must be `Approved`** |
| GET | `/finance/ledger` | `finance.view` | `?direction=ALL\|IN\|OUT` |
| GET/POST | `/finance/reconciliation/statement-lines` | `finance.view` / `.create` | |
| POST | `/finance/reconciliation/:lineId/match` | `finance.update` | **validate amount/date** (none today) |
| GET | `/finance/reports/:reportType` | `finance.view` | `?asOf=` — CSV export |

---

## 12. Auth — Phase 1 gaps to close

Built: `POST /auth/{register,login,refresh,logout,logout-all}`, `GET /auth/me`.

| Gap | Action |
|---|---|
| `SHIPPER` and `TRANSPORTER` roles missing | seed them (BR-10.4) |
| Portal scoping | add `User.shipperId` / `partnerId` and enforce row-level filters |
| Client has no `patch`/`delete` | extend `api.client.ts` |
| Client throws bare `Error` | add numeric `status` — the retry policy silently never matches 4xx |
| No 401 refresh flow | `refreshToken` is stored but never used |
| **Login failure grants `['*']`** | **remove the demo fallback** (BR-10.1) |

---

## 13. Cross-cutting

**Idempotency** — `POST /shipments` and all finance mutations should accept `Idempotency-Key`; the frontend's random id generators make double-submits likely.

**Bulk endpoints** — deferred; no bulk UI exists.

**Rate limiting** — `/auth/login` needs throttling; Argon2 stops offline cracking, not online brute force.

**Server-Sent Events (future)** — the empty-return console ticks every 30s and recomputes risk client-side. `GET /empty-returns/stream` would let the server own risk entirely. Not required for Phase 3.
