import { apiClient } from '@/services/api.client';
import { useAuthStore } from '@/stores/auth.store';
import type { CreateBookingItemPayload } from '@/features/bookings/api/bookingsService';
import type { Mission, MissionFilterState, MissionStatus } from '@/types/mission';
import { co2Number } from '@/lib/co2';

export interface PaginatedResponse<T> {
  items: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

/** Raw shape returned by the backend — `rateMinorUnits`/`rateBaseAmountMinorUnits` arrive as strings (BigInt → JSON). */
export interface ShipmentRecord {
  id: string;
  reference: string;
  bookingId: string;
  referenceNumber: string;
  dpcsReference: string;
  /** Persisted origination channel — 'dpcs' | 'custom'. */
  source: string;
  status: string;
  paymentStatus: string;

  shipperId: string;
  customerName: string;
  customerCompany: string;
  customerPhone: string;
  customerEmail: string;

  partnerId: string;
  transporterName: string;
  transporterCompany: string;
  transporterPhone: string;
  transporterFleetCode: string;

  driverId: string | null;
  driverName: string | null;
  driverPhone: string | null;
  driverLicenseNumber: string | null;
  driverVerified: boolean | null;

  vehicleId: string | null;
  vehicleRegistrationNumber: string | null;
  vehicleTypeSnapshot: string | null;
  vehicleCapacity: string | null;
  vehicleVerified: boolean | null;

  /** The catalogued place, when this shipment was created from one. */
  pickupLocationId: string | null;
  pickupLocationName: string;
  pickupLocationAddress: string;
  pickupLocationCity: string;
  pickupGateOrTerminal: string | null;
  pickupContactPerson: string | null;
  pickupContactPhone: string | null;

  deliveryLocationId: string | null;
  deliveryLocationName: string;
  deliveryLocationAddress: string;
  deliveryLocationCity: string;
  deliveryGateOrTerminal: string | null;
  deliveryContactPerson: string | null;
  deliveryContactPhone: string | null;

  estimatedDistanceKm: number;
  /** `google` — a measured road. `estimate` — the pre-2026-09-02 guess. */
  estimatedDistanceSource: 'google' | 'manual' | 'estimate';
  /**
   * ── Carbon, rolled up from this job's containers ──
   *
   * The sum of its bookings' emissions and truck-kilometres, maintained
   * server-side so a list row can print a job's carbon without loading the
   * bookings under it.
   *
   * **Null, not zero, while nothing has been driven.** Carbon accrues from
   * movements that happened — a booking earns its loaded leg when the box
   * reaches the consignee — so a shipment created this morning has no figure
   * rather than a figure of nothing.
   *
   * `co2DistanceKm` is the sum of the trucks' roads, so it is deliberately not
   * comparable to `estimatedDistanceKm` above: five containers down a 27 km
   * lane is 135 truck-kilometres.
   *
   * Decimal crosses the wire as a string — read through `co2Number`.
   */
  co2EmissionsKg: string | number | null;
  co2DistanceKm: string | number | null;
  estimatedDurationHours: string;
  cargoType: string;
  shipmentCategory: string | null;
  containerNumber: string | null;
  shippingLine: string | null;
  containerReturnDepot: string | null;
  containerReturnDeadline: string | null;
  containerReturnFreeDays: number | null;
  goodsDescription: string;
  totalWeightKg: number;
  dimensions: string | null;
  equipmentType: string | null;
  bulkCommodity: string | null;
  bulkHandlingMethod: string | null;
  machineryType: string | null;
  lashingStandard: string | null;
  requiredDocuments: string[] | null;

  scheduledPickupTime: string;
  /** When the shipper expects delivery. Null on everything created before
      2026-09-01, and on any shipment taken without a date agreed. */
  scheduledDeliveryTime: string | null;
  completedAt: string | null;

  rateMinorUnits: string;
  rateCurrency: string;
  rateFxRate: number;
  rateBaseAmountMinorUnits: string;

  /** What the shipper is billed — the revenue side. Nullable until Finance/the wizard sets it; never estimated as 0. */
  clientRateMinorUnits: string | null;
  clientRateCurrency: string | null;
  clientRateFxRate: number | null;
  clientRateBaseAmountMinorUnits: string | null;

  payoutReleasedAt: string | null;
  payoutReleasedById: string | null;
  payoutReleasedByName: string | null;
  projectId: string | null;

  createdAt: string;
  updatedAt: string;

  /**
   * How many live bookings — containers — this shipment covers. Counted
   * server-side on both the list and detail responses; absent only on the
   * create/update responses, which return the shipment before its bookings
   * exist.
   */
  bookingCount?: number;

  /**
   * Every carrier working this shipment, deduped, in booking order.
   *
   * The `partnerId` / `transporterCompany` fields above are a snapshot taken
   * when the shipment was created; the carrier is really assigned per booking,
   * so a job split between two hauliers has two of these and the snapshot names
   * only one — sometimes not even one that is still on the job. Counted
   * server-side on the list and detail responses alike.
   */
  transporters?: { id: string; name: string }[];

  /**
   * The Fleetin staff working this shipment — the crew.
   *
   * Ordered lead-first by the server, which is the order the avatar stack
   * draws in: whoever is on point is the face in front. An empty array is a
   * real answer and means nobody has picked the job up.
   */
  crew?: ShipmentCrewMemberRecord[];

  /** Only populated on the detail response (`GET /shipments/:id`) — list rows omit it for efficiency. */
  timeline?: ShipmentTimelineStepRecord[];
}

/** One teammate on a shipment. Enough to draw an avatar and name it on hover — no contact details, since a crew stack is not a phone book. */
export interface ShipmentCrewMemberRecord {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  avatarUrl: string | null;
  roleName: string | null;
  /** On point — at most one per shipment. */
  isLead: boolean;
  assignedAt: string;
}

export interface ShipmentTimelineStepRecord {
  id: string;
  key: string;
  title: string;
  description: string;
  timestamp: string | null;
  status: string;
  actor: string | null;
  location: string | null;
  podFileUrl: string | null;
  notes: string | null;
}

/** `Date` → the `YYYY-MM-DD HH:mm` format every Mission timestamp uses. */
function formatMissionTimestamp(value: string): string {
  return new Date(value).toISOString().replace('T', ' ').substring(0, 16);
}

/** Converts a backend ShipmentRecord into the `Mission` shape every existing Shipments page renders. */
export function mapShipmentToMission(s: ShipmentRecord): Mission {
  return {
    id: s.reference,
    bookingId: s.bookingId,
    referenceNumber: s.referenceNumber,
    dpcsReference: s.dpcsReference,
    source: s.source === 'dpcs' ? 'dpcs' : 'custom',
    status: s.status as MissionStatus,
    paymentStatus: s.paymentStatus as Mission['paymentStatus'],
    customer: {
      id: s.shipperId,
      name: s.customerName,
      company: s.customerCompany,
      phone: s.customerPhone,
      email: s.customerEmail,
    },
    transporter: {
      id: s.partnerId,
      name: s.transporterName,
      company: s.transporterCompany,
      phone: s.transporterPhone,
      fleetCode: s.transporterFleetCode,
    },
    /* Falls back to the snapshot for a payload that predates the field — a
       cached response, or the create/update reply, which returns the shipment
       before it has any bookings to read carriers from. */
    transporters:
      s.transporters ??
      (s.partnerId ? [{ id: s.partnerId, name: s.transporterCompany }] : []),
    /* Server order preserved — lead first. `?? []` rather than `undefined`,
       because "no crew" is a state the UI draws (the dashed +) and not a
       missing field to be defensive about. */
    crew: s.crew ?? [],
    driver: s.driverId
      ? {
          id: s.driverId,
          name: s.driverName ?? '',
          phone: s.driverPhone ?? '',
          licenseNumber: s.driverLicenseNumber ?? '',
          isVerified: Boolean(s.driverVerified),
        }
      : undefined,
    assignedTruck: s.vehicleId
      ? {
          id: s.vehicleId,
          registrationNumber: s.vehicleRegistrationNumber ?? '',
          vehicleType: s.vehicleTypeSnapshot ?? '',
          capacity: s.vehicleCapacity ?? '',
          isVerified: Boolean(s.vehicleVerified),
        }
      : undefined,
    pickupLocation: {
      name: s.pickupLocationName,
      address: s.pickupLocationAddress,
      city: s.pickupLocationCity,
      gateOrTerminal: s.pickupGateOrTerminal ?? undefined,
      contactPerson: s.pickupContactPerson ?? undefined,
      contactPhone: s.pickupContactPhone ?? undefined,
    },
    deliveryLocation: {
      name: s.deliveryLocationName,
      address: s.deliveryLocationAddress,
      city: s.deliveryLocationCity,
      gateOrTerminal: s.deliveryGateOrTerminal ?? undefined,
      contactPerson: s.deliveryContactPerson ?? undefined,
      contactPhone: s.deliveryContactPhone ?? undefined,
    },
    estimatedDistanceKm: s.estimatedDistanceKm,
    estimatedDurationHours: s.estimatedDurationHours,
    co2EmissionsKg: co2Number(s.co2EmissionsKg),
    co2DistanceKm: co2Number(s.co2DistanceKm),
    cargoType: s.cargoType,
    shipmentCategory: (s.shipmentCategory ?? undefined) as Mission['shipmentCategory'],
    containerNumber: s.containerNumber ?? undefined,
    shippingLine: s.shippingLine ?? undefined,
    containerReturn: s.containerReturnDeadline
      ? {
          depot: s.containerReturnDepot ?? '',
          deadline: formatMissionTimestamp(s.containerReturnDeadline),
          freeDays: s.containerReturnFreeDays ?? 7,
        }
      : undefined,
    goodsDescription: s.goodsDescription,
    totalWeightKg: s.totalWeightKg,
    dimensions: s.dimensions ?? undefined,
    equipmentType: s.equipmentType ?? undefined,
    bulkCommodity: s.bulkCommodity ?? undefined,
    bulkHandlingMethod: s.bulkHandlingMethod ?? undefined,
    machineryType: s.machineryType ?? undefined,
    lashingStandard: s.lashingStandard ?? undefined,
    requiredDocuments: s.requiredDocuments ?? undefined,
    createdAt: formatMissionTimestamp(s.createdAt),
    scheduledPickupTime: formatMissionTimestamp(s.scheduledPickupTime),
    completedAt: s.completedAt ? formatMissionTimestamp(s.completedAt) : undefined,
    rateFDJ: Number(s.rateMinorUnits),
    timeline: (s.timeline ?? []).map((t) => ({
      id: t.id,
      key: t.key as Mission['timeline'][number]['key'],
      title: t.title,
      description: t.description,
      timestamp: t.timestamp ? formatMissionTimestamp(t.timestamp) : undefined,
      status: t.status as Mission['timeline'][number]['status'],
      actor: t.actor ?? undefined,
      location: t.location ?? undefined,
      podFileUrl: t.podFileUrl ?? undefined,
      notes: t.notes ?? undefined,
    })),
  };
}

function token() {
  return useAuthStore.getState().accessToken;
}

export interface ShipmentFilters extends Partial<MissionFilterState> {
  page?: number;
  limit?: number;
}

function toQueryString(filters: ShipmentFilters): string {
  const params = new URLSearchParams();
  if (filters.searchKeyword) params.set('searchKeyword', filters.searchKeyword);
  if (filters.status && filters.status !== 'all') params.set('status', filters.status);
  if (filters.paymentStatus && filters.paymentStatus !== 'all') params.set('paymentStatus', filters.paymentStatus);
  if (filters.customerId) params.set('customerId', filters.customerId);
  if (filters.transporterId) params.set('transporterId', filters.transporterId);
  if (filters.driverId) params.set('driverId', filters.driverId);
  if (filters.vehicleId) params.set('vehicleId', filters.vehicleId);
  if (filters.cargoType) params.set('cargoType', filters.cargoType);
  if (filters.containerNumber) params.set('containerNumber', filters.containerNumber);
  if (filters.route) params.set('route', filters.route);
  /* `'unassigned'` is a real value here, not an empty filter — it asks the
     server for the shipments nobody is on. */
  if (filters.assigneeId) params.set('assigneeId', filters.assigneeId);
  if (filters.datePreset && filters.datePreset !== 'all') params.set('datePreset', filters.datePreset);
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  if (filters.sortBy) params.set('sortBy', filters.sortBy);
  params.set('page', String(filters.page ?? 1));
  params.set('limit', String(filters.limit ?? 200));
  return params.toString();
}

export async function fetchShipments(filters: ShipmentFilters = {}): Promise<PaginatedResponse<Mission>> {
  const res = await apiClient.get<PaginatedResponse<ShipmentRecord>>(`/shipments?${toQueryString(filters)}`, token());
  return { ...res.data, items: res.data.items.map(mapShipmentToMission) };
}

/**
 * Every page, `Mission`-mapped. The list endpoint caps at `limit`, so a single
 * call silently returned the first 200 of 337 shipments and the Shipments page
 * reported "200 Total" as if that were the book. Same 20-page hard stop as
 * `fetchAllShipmentsRaw`, so a runaway `totalPages` can't loop the client.
 */
export async function fetchAllShipments(filters: ShipmentFilters = {}): Promise<Mission[]> {
  const first = await fetchShipments({ ...filters, page: 1 });
  const items = [...first.items];
  const lastPage = Math.min(first.meta.totalPages, 20);
  for (let page = 2; page <= lastPage; page += 1) {
    const next = await fetchShipments({ ...filters, page });
    items.push(...next.items);
  }
  return items;
}

/** Raw `ShipmentRecord[]`, not `Mission`-mapped — for Finance, which needs the money fields the mapping drops. */
export async function fetchShipmentsRaw(filters: ShipmentFilters = {}): Promise<PaginatedResponse<ShipmentRecord>> {
  const res = await apiClient.get<PaginatedResponse<ShipmentRecord>>(`/shipments?${toQueryString(filters)}`, token());
  return res.data;
}

/**
 * Every page of the raw list, concatenated — for the admin console, whose
 * totals must cover the whole book rather than one capped page. Hard-stops at
 * 20 pages so a runaway `totalPages` can't loop the client.
 */
export async function fetchAllShipmentsRaw(filters: ShipmentFilters = {}): Promise<ShipmentRecord[]> {
  const first = await fetchShipmentsRaw({ ...filters, page: 1 });
  const items = [...first.items];
  const lastPage = Math.min(first.meta.totalPages, 20);
  for (let page = 2; page <= lastPage; page += 1) {
    const next = await fetchShipmentsRaw({ ...filters, page });
    items.push(...next.items);
  }
  return items;
}

export async function fetchShipment(id: string): Promise<Mission> {
  const res = await apiClient.get<ShipmentRecord>(`/shipments/${id}`, token());
  return mapShipmentToMission(res.data);
}

/**
 * The raw record, not the `Mission`-mapped shape — Finance needs the money
 * fields (`clientRateMinorUnits`, `payoutReleasedAt`, `projectId`, ...) as-is,
 * which `mapShipmentToMission` doesn't carry over since Operations never
 * needed them.
 */
export async function fetchShipmentRaw(id: string): Promise<ShipmentRecord> {
  const res = await apiClient.get<ShipmentRecord>(`/shipments/${id}`, token());
  return res.data;
}

export interface CreateShipmentPayload {
  shipmentSource: 'dpcs' | 'custom';
  /**
   * The shipment's own reference, chosen by the operator in the wizard. The
   * server mints an `MSN-#####` only when this is absent (seeds, imports) and
   * refuses one that is already taken.
   */
  reference?: string;
  dpcsReference?: string;
  bookingId?: string;
  shipperId: string;
  transporterAssignments: { partnerId: string; vehicles: number; bookingIds?: string[] }[];
  preferredVehicleType: string;
  /** The catalogued place, when one was picked. Buys the measured distance. */
  pickupLocationId?: string;
  pickupLocationName: string;
  pickupLocationAddress: string;
  pickupLocationCity: string;
  pickupGateOrTerminal?: string;
  deliveryLocationId?: string;
  deliveryLocationName: string;
  deliveryLocationAddress: string;
  deliveryLocationCity: string;
  deliveryGateOrTerminal?: string;
  /* The server re-measures this from the two location ids and overwrites it,
     unless `estimatedDistanceSource` is 'manual'. See the backend's
     `ShipmentsService.resolveDistance`. */
  estimatedDistanceKm: number;
  estimatedDistanceSource?: 'google' | 'manual' | 'estimate';
  estimatedDurationHours?: string;
  cargoType: string;
  shipmentCategory?: string;
  machineryType?: string;
  bulkCommodity?: string;
  containerNumber?: string;
  shippingLine?: string;
  containerReturnDepot?: string;
  containerReturnDeadline?: string;
  containerReturnFreeDays?: number;
  goodsDescription: string;
  totalWeightKg: number;
  requiredDocuments?: string[];
  paymentStatus?: string;
  scheduledPickupTime: string;
  /** When the shipper expects delivery. Optional — not every booking is taken
      with a date agreed, and a guessed one reads as a commitment. */
  scheduledDeliveryTime?: string;
  /** What the shipper is billed — optional, the wizard doesn't always collect it. */
  clientRateMinorUnits?: number;
  projectId?: string;
  /**
   * The shipment's containers, created in the same request. Sent here rather
   * than through a follow-up `POST /shipments/:id/bookings` so a failure can't
   * leave a shipment standing with no bookings at all.
   */
  bookings?: CreateBookingItemPayload[];
  /** The Fleetin staff who will work it. First id leads unless `leadAssigneeUserId` says otherwise. */
  assigneeUserIds?: string[];
  leadAssigneeUserId?: string;
}

/**
 * Set the whole crew on a shipment.
 *
 * A PUT of the complete set, matching the picker: the client always knows the
 * full answer, so there is no add/remove pair to get out of order.
 */
export async function setShipmentCrew(
  id: string,
  payload: { userIds: string[]; leadUserId?: string },
): Promise<Mission> {
  const res = await apiClient.put<ShipmentRecord>(`/shipments/${id}/assignees`, payload, token());
  return mapShipmentToMission(res.data);
}

export async function createShipment(payload: CreateShipmentPayload): Promise<Mission> {
  const res = await apiClient.post<ShipmentRecord>('/shipments', payload, token());
  return mapShipmentToMission(res.data);
}

export interface UpdateShipmentPayload {
  driverId?: string;
  vehicleId?: string;
  paymentStatus?: string;
  pickupLocationName?: string;
  pickupLocationAddress?: string;
  pickupLocationCity?: string;
  pickupGateOrTerminal?: string;
  deliveryLocationName?: string;
  deliveryLocationAddress?: string;
  deliveryLocationCity?: string;
  deliveryGateOrTerminal?: string;
  goodsDescription?: string;
  totalWeightKg?: number;
  requiredDocuments?: string[];
  containerNumber?: string;
  shippingLine?: string;
  containerReturnDepot?: string;
  containerReturnFreeDays?: number;
  /**
   * What the shipper is billed. Normally resolved server-side from the chosen
   * transporters' price lists at creation time; set here only to override that
   * with a negotiated one-off figure.
   */
  clientRateMinorUnits?: number;
  projectId?: string;
}

export async function updateShipment(id: string, payload: UpdateShipmentPayload): Promise<Mission> {
  const res = await apiClient.patch<ShipmentRecord>(`/shipments/${id}`, payload, token());
  return mapShipmentToMission(res.data);
}

/** Same PATCH, but returns the raw record — for Finance call sites that need the money fields back. */
export async function updateShipmentRaw(id: string, payload: UpdateShipmentPayload): Promise<ShipmentRecord> {
  const res = await apiClient.patch<ShipmentRecord>(`/shipments/${id}`, payload, token());
  return res.data;
}

/**
 * `PATCH /shipments/:id/reprice` — prices a shipment off its transporters'
 * price lists (containers × per-mission price). For the backlog of shipments
 * created before pricing was automatic. Leaves an already-set rate alone.
 */
export async function repriceShipment(id: string): Promise<ShipmentRecord> {
  const res = await apiClient.patch<ShipmentRecord>(`/shipments/${id}/reprice`, {}, token());
  return res.data;
}

export interface RepriceSummary {
  considered: number;
  priced: number;
}

/** The same, across every unpriced shipment — optionally just one shipper's. */
export async function repriceUnpricedShipments(shipperId?: string): Promise<RepriceSummary> {
  const query = shipperId ? `?shipperId=${encodeURIComponent(shipperId)}` : '';
  const res = await apiClient.patch<RepriceSummary>(`/shipments/reprice-unpriced${query}`, {}, token());
  return res.data;
}

/** `PATCH /shipments/:id/release` — guarded server-side: every booking delivered, no open hold, not already released. */
export async function releaseShipment(id: string): Promise<ShipmentRecord> {
  const res = await apiClient.patch<ShipmentRecord>(`/shipments/${id}/release`, {}, token());
  return res.data;
}

export async function updateShipmentStatus(id: string, status: string): Promise<Mission> {
  const res = await apiClient.patch<ShipmentRecord>(`/shipments/${id}/status`, { status }, token());
  return mapShipmentToMission(res.data);
}

export async function deleteShipment(id: string): Promise<void> {
  await apiClient.delete(`/shipments/${id}`, token());
}
