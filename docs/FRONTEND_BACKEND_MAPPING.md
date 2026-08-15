# FLEETIN — Frontend → Backend Mapping

**Phase 2 analysis. No code changes.**

Per page: what it reads today → the endpoint that replaces it → the entity behind it → the hook to write → the mutations required.

**Baseline:** the app is ~99% mock. One real call exists (`POST /auth/login`). `useMutation` is used **zero** times — every write is a synchronous Zustand `set()`.

---

## 1. Integration seams, ranked

| Seam | File | Readiness |
|---|---|---|
| **BI services** | `features/{shipper,transporter}-bi/api/*.ts` | ★★★★★ already async + request-object; in-code promise that *"the bodies become fetches and nothing above this file changes"* |
| **Auth** | `stores/auth.store.ts` | ★★★★☆ already calls the API; must **delete the demo fallback** |
| **API client** | `services/api.client.ts` | ★★★☆☆ envelope matches Phase 1; needs `patch`/`delete`, numeric `status`, 401 refresh |
| **Query client** | `lib/queryClient.ts` | ★★★★☆ configured, zero queries defined |
| **Entity stores** | `stores/{shipment,emptyReturn,finance}.store.ts` | ★☆☆☆☆ pure local state; the big lift |

---

## 2. Auth

| Page | Mock source | Endpoint | Entity | Hook | Mutations |
|---|---|---|---|---|---|
| `/login` | `DEMO_PRESETS` fallback | `POST /auth/login` ✅ built | User | `useLogin()` | login |
| `/register` | — | `POST /auth/register` ✅ | User | `useRegister()` | register |
| shell | initial state = logged-in ADMIN | `GET /auth/me` ✅ | User | `useCurrentUser()` | — |
| logout | local `set()` | `POST /auth/logout` ✅ | RefreshToken | — | logout |

**Must change:** delete the try/catch demo fallback that grants `permissions: ['*']` (BR-10.1); remove the pre-authenticated initial state (BR-10.2); `partialize` the persist so tokens aren't written to localStorage (BR-10.3); wire the unused `refreshToken`.

---

## 3. Shipments

| Page | Mock source | Endpoint | Entity | Hook | Mutations |
|---|---|---|---|---|---|
| `/shipments` list | `shipment.store.missions` ← `MOCK_MISSIONS` | `GET /shipments` | Shipment | `useShipments(filters)` | — |
| KPI tiles | computed in page | `GET /shipments/kpis` | — | `useShipmentKpis()` | — |
| Create wizard | `openCreateModal` + local build | `POST /shipments` | Shipment | — | `useCreateShipment()` |
| `/shipments/:id` | **hardcoded array in the page** | `GET /shipments/:id` | Shipment | `useShipment(id)` | — |
| timeline | `mission.timeline[]` | `GET /shipments/:id/timeline` | ShipmentEvent | `useShipmentTimeline(id)` | — |
| status buttons | `updateMissionStatus` | `POST /shipments/:id/<verb>` | Shipment | — | `useAdvanceShipment()` |

**Filter → query param** (all already exist in `MissionFilterState`): `searchKeyword→q`, `status`, `paymentStatus`, `customerId→shipperId`, `transporterId→partnerId`, `driverId`, `vehicleId`, `cargoType`, `containerNumber`, `datePreset`+`startDate`/`endDate`, `sortBy→sort`.

**Notes**
- The list is **unpaginated** today; the server contract adds `{rows,total,page,pageSize}`.
- `ShipmentOverviewPage` bookings are entirely hardcoded — needs a real shape (⚠️ **DD-04**).
- The wizard must stop computing the rate; the server returns it (BR-2.6).
- Custom pickup locations / commodities / document types are persisted to `localStorage` (`fleetin.customPickupLocations`) — these want reference-data endpoints.

---

## 4. Empty Returns (5 pages, one store)

| Page | Mock source | Endpoint | Entity | Hook |
|---|---|---|---|---|
| `/empty-returns` | `buildEmptyReturnConsoleModel` | `GET /empty-returns/kpis` + `/urgent` | EmptyReturnRecord | `useEmptyReturnConsole()` |
| `/empty-returns/cycles` | `selectFilteredRecords` | `GET /empty-returns` | EmptyReturnRecord | `useEmptyReturns(filters)` |
| `/empty-returns/matching` | `selectMatchingContext` + `evaluateMission` | `GET /empty-returns/matching` | + pool | `useMatchingContext()` |
| `/empty-returns/chains` | `selectChains` | `GET /empty-returns/chains` | derived | `useCycleChains()` |
| `/empty-returns/transporters` | `selectTransporterStats` | `GET /empty-returns/transporters` | derived | `useTransporterCycleStats()` |

**Mutations — each store action becomes one mutation, with its guard restored server-side:**

| Store action | Endpoint | Hook |
|---|---|---|
| `markEmptyReady` | `POST /empty-returns/:id/mark-empty-ready` | `useMarkEmptyReady()` |
| `markStandaloneRequired` | `POST /empty-returns/:id/mark-standalone` | `useMarkStandalone()` |
| `createCycle` | `POST /empty-returns/:id/create-cycle` | `useCreateCycle()` |
| `toggleChecklistItem` | `PATCH /empty-returns/:id/checklist` | `useToggleChecklistItem()` |
| `confirmCycle` | `POST /empty-returns/:id/confirm-cycle` | `useConfirmCycle()` |
| `dispatchTruck` | `POST /empty-returns/:id/dispatch` | `useDispatchTruck()` |
| `advanceMilestone` | `POST /empty-returns/:id/advance-milestone` | `useAdvanceMilestone()` |

**The hard part.** `registerShipmentFullLoad`, `withdrawShipmentFullLoad`, `registerShipmentEmptyReturn`, `assignShipmentToCycle` and `completeShipmentFromCycle` are **cross-store side effects** driven by `shipmentBridge.ts`. Server-side these become transactional side effects of the shipment/cycle endpoints and **disappear from the client entirely**. Responses must report them (see `API_BLUEPRINT.md` §6) so the client knows to invalidate the shipment cache.

**Keep on the client:** the 30s `setNow` tick and `formatDuration`/`formatDateTime`. **Move to the server:** `riskOf`, `slackOf`, `selectKpis`, `evaluateMission`, `deriveChecklist` — all already pure `(records, …, now)` functions.

---

## 5. Shippers

| Page | Mock source | Endpoint | Entity | Hook | Mutations |
|---|---|---|---|---|---|
| `/shippers` | `MOCK_SHIPPERS` + **live join on missions** | `GET /shippers` | Shipper | `useShippers(filters)` | delete |
| `/shippers/new` | `AddShipperForm` | `POST /shippers` | Shipper | — | `useCreateShipper()` |
| `/shippers/:id?tab=profile` | `getShipperById` | `GET /shippers/:id` | Shipper | `useShipper(id)` | `useUpdateShipper()` |
| `?tab=shipments` | `ShipmentsPanel` | `GET /shippers/:id/shipments` | Shipment | `useShipperShipments(id)` | — |
| `?tab=analytics` | `useShipperAccount` (sync `useMemo`) | `GET /shippers/:id/account-summary` | derived | `useShipperAccount(id)` → real `useQuery` | — |

`activeShipments`/`pastShipments` are recomputed live today — keep them **derived server-side**, never stored.

---

## 6. Partners / Vehicles / Drivers

| Page | Mock source | Endpoint | Entity | Hook | Mutations |
|---|---|---|---|---|---|
| `/partners` | `INITIAL_PARTNERS` | `GET /partners` | Partner | `usePartners(filters)` | create/update/delete |
| `/partners/:id` | lookup | `GET /partners/:id` | Partner | `usePartner(id)` | `useUpdatePartner()` |
| compliance panel | `computeComplianceScore` | `GET /partners/:id/compliance` | derived | `usePartnerCompliance(id)` | — |
| `/vehicles` | `getAllVehicles()` | `GET /vehicles` | Vehicle | `useVehicles(filters)` | create/update/delete |
| vehicle drawer `docs` tab | `vehicle.documents[]` | `GET /documents?ownerType=VEHICLE&ownerId=` | Document | `useDocuments(owner)` | upload/verify/delete |
| `/drivers` | `getAllDrivers()` | `GET /drivers` | Driver | `useDrivers(filters)` | create/update/delete |
| licence alerts KPI | `isExpiredOrSoon` | `GET /drivers/expiring?withinDays=30` | derived | `useExpiringDrivers()` | — |

Create still posts to the **parent**: `POST /partners/:id/vehicles`, `POST /partners/:id/drivers` (BR-1.5).
`computeComplianceScore` must move server-side — a browser-computed compliance score is not evidence.

---

## 7. Locations

| Page | Mock source | Endpoint | Entity | Hook | Mutations |
|---|---|---|---|---|---|
| `/locations` | `LocationRecord[]` local | `GET /locations` | Location | `useLocations()` | create/delete |
| `/locations/new` | `AddLocationForm` (map click) | `POST /locations` | Location | — | `useCreateLocation()` |
| country/state/city selects | `geoData.ts` (195 countries) | `GET /reference/{countries,states,cities}` | reference | `useGeoOptions()` | — |

⚠️ This page's `LocationRecord` is a **fourth** location vocabulary — see **DD-05**.

---

## 8. Finance (7 pages)

All read `finance.store` ← `financeMockData`. Models exist in Prisma; controllers do not.

| Page | Endpoint | Hook | Mutations |
|---|---|---|---|
| `/finance` | `GET /finance/kpis`, `/ledger`, `/forecast` | `useFinanceKpis()` | — |
| `/finance/invoices` | `GET /finance/invoices`, `/payment-orders` | `useInvoices(filters)` | create, send, dispute, write-off, credit-note |
| `/finance/payments` | `GET /finance/payments` | `usePayments(filters)` | `useRecordPayment()` |
| `/finance/loans` | `GET /finance/drawdowns`, `/facility` | `useDrawdowns()` | create, repay |
| `/finance/expenses` | `GET /finance/expenses`, `/recurring-templates` | `useExpenses(filters)` | create, approve, reject, pay |
| `/finance/reconciliation` | `GET /finance/reconciliation/statement-lines` | `useStatementLines()` | import, match, ignore |
| `/finance/reports` | `GET /finance/reports/:type?asOf=` | `useFinanceReport(type)` | CSV export |

**Client-side role gates must be removed.** `writeOffInvoice`, `approvePaymentOrder` and `approveExpense` enforce roles with `alert()` + early return — trivially bypassed. The server enforces; the client only hides buttons. Four-eyes (BR-5.3) must move server-side.

---

## 9. Analytics & Portals

| Page | Mock source | Endpoint | Hook |
|---|---|---|---|
| `/analytics` (7 tabs) | `peekDataset` + `aggregateOverview` | `GET /shippers/:id/bi/{section}` | `useOverviewSection()` ← **already exists** |
| `/shipper-dashboard` | `useShipperAccount` + `useOverviewSection` | `GET /shippers/:id/{account-summary,bi/overview}` | already shaped |
| `/transporter-dashboard` | `peekTransporterDataset` → `buildConsoleModel` | `GET /partners/:id/bi/overview` | `useTransporterOverview()` ← exists |
| `/transporter-analytics` (6 tabs) | `deriveTripFacts` + `applyFilters` | `GET /partners/:id/bi/{section}` | per-section |

**Smallest change in the codebase.** `fetchOverview()` and `fetchTransporterOverview()` already take a request object and return a section contract. Replacing `generateDataset()` with a `fetch` changes nothing above those two files. `useShipperAccount` is a synchronous `useMemo` today and becomes a real `useQuery`.

Filters are already URL-serialised with short param names (`p`, `from`, `to`, `cmp`, `route`, `trp`, `stage`, `cnt`, `cargo`, `owner`) — pass them straight through.

---

## 10. Dashboard, Onboarding, placeholders

| Page | Source | Endpoints | Status |
|---|---|---|---|
| `/dashboard` | `dashboardData.ts` — **12 static fixtures** | 11 `GET /dashboard/*` | fixture shapes are throwaway; the panels are the requirement |
| `/onboarding` | `onboardingData.ts` (fully built UI) | `GET/POST /onboarding*` | `useOnboardingRecords()`, add-comment/add-action/toggle-action/approve/reject |
| `/employees` | — | — | **placeholder** — DD-07 |
| `/documents` | — | `GET /documents` | **placeholder**; per-entity data exists |
| `/reports` | — | — | **placeholder** |
| `/administration`, `/settings` | — | `/users`, `/roles` ✅ built | **placeholder**; RBAC has no UI |

---

## 11. Client work required regardless of endpoints

| # | Task | Why |
|---|---|---|
| 1 | Extend `api.client.ts` with `patch`/`delete` | only `get`/`post` exist |
| 2 | Attach numeric `status` to thrown errors | `queryClient`'s `isClientError` retry policy reads `error.status`; it **never matches today**, so every 4xx retries twice |
| 3 | 401 → refresh → retry interceptor | `refreshToken` is stored but unused |
| 4 | Delete the demo-auth fallback | grants `['*']` on any backend outage |
| 5 | Introduce `useMutation` | currently zero uses |
| 6 | Query-key factory + invalidation map | cross-module side effects (shipment ↔ empty return) need coordinated invalidation |
| 7 | Zod-validate responses at the boundary | `services/README.md` specifies this; not built |
| 8 | Server-supplied `risk`/`slack`/KPIs | remove duplicate business math from the browser |
| 9 | Optimistic updates for the empty-return console | the 30s tick makes latency visible |

---

## 12. Recommended integration order

1. **Auth hardening** — remove the fallback, wire refresh, add portal scoping. *Nothing else is safe first.*
2. **BI read-only** — swap two mock service bodies for fetches. Highest value, lowest risk, zero UI change.
3. **Reference data** — locations, countries/states/cities, document categories.
4. **Counterparties** — shippers, partners, vehicles, drivers, documents. Straightforward CRUD.
5. **Shipments** — list, detail, create, status workflow.
6. **Empty Returns** — the state machine plus the cross-module side effects. **Do this last**: it depends on shipments, locations, partners and containers all being real.
7. **Finance controllers** — models exist; add the missing guards while building.
8. **Dashboard** — trivial once 1–7 land.
