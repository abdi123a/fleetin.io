import { apiClient } from '@/services/api.client';
import { useAuthStore } from '@/stores/auth.store';
import type { Mission, MissionFilterState, MissionStatus } from '@/types/mission';

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
  status: string;
  paymentStatus: string;

  shipperId: string;
  customerName: string;
  customerCompany: string;
  customerPhone: string;
  customerEmail: string;
  customerRating: number;

  partnerId: string;
  transporterName: string;
  transporterCompany: string;
  transporterPhone: string;
  transporterFleetCode: string;
  transporterRating: number;

  driverId: string | null;
  driverName: string | null;
  driverPhone: string | null;
  driverLicenseNumber: string | null;
  driverRating: number | null;
  driverVerified: boolean | null;

  vehicleId: string | null;
  vehicleRegistrationNumber: string | null;
  vehicleTypeSnapshot: string | null;
  vehicleCapacity: string | null;
  vehicleVerified: boolean | null;

  pickupLocationName: string;
  pickupLocationAddress: string;
  pickupLocationCity: string;
  pickupGateOrTerminal: string | null;
  pickupContactPerson: string | null;
  pickupContactPhone: string | null;

  deliveryLocationName: string;
  deliveryLocationAddress: string;
  deliveryLocationCity: string;
  deliveryGateOrTerminal: string | null;
  deliveryContactPerson: string | null;
  deliveryContactPhone: string | null;

  estimatedDistanceKm: number;
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
  completedAt: string | null;

  rateMinorUnits: string;
  rateCurrency: string;
  rateFxRate: number;
  rateBaseAmountMinorUnits: string;

  createdAt: string;
  updatedAt: string;

  /** Only populated on the detail response (`GET /shipments/:id`) — list rows omit it for efficiency. */
  timeline?: ShipmentTimelineStepRecord[];
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
    status: s.status as MissionStatus,
    paymentStatus: s.paymentStatus as Mission['paymentStatus'],
    customer: {
      id: s.shipperId,
      name: s.customerName,
      company: s.customerCompany,
      phone: s.customerPhone,
      email: s.customerEmail,
      rating: s.customerRating,
    },
    transporter: {
      id: s.partnerId,
      name: s.transporterName,
      company: s.transporterCompany,
      phone: s.transporterPhone,
      fleetCode: s.transporterFleetCode,
      rating: s.transporterRating,
    },
    driver: s.driverId
      ? {
          id: s.driverId,
          name: s.driverName ?? '',
          phone: s.driverPhone ?? '',
          licenseNumber: s.driverLicenseNumber ?? '',
          rating: s.driverRating ?? 0,
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

export async function fetchShipment(id: string): Promise<Mission> {
  const res = await apiClient.get<ShipmentRecord>(`/shipments/${id}`, token());
  return mapShipmentToMission(res.data);
}

export interface CreateShipmentPayload {
  shipmentSource: 'dpcs' | 'custom';
  dpcsReference?: string;
  bookingId?: string;
  shipperId: string;
  transporterAssignments: { partnerId: string; vehicles: number; bookingIds?: string[] }[];
  preferredVehicleType: string;
  pickupLocationName: string;
  pickupLocationAddress: string;
  pickupLocationCity: string;
  pickupGateOrTerminal?: string;
  deliveryLocationName: string;
  deliveryLocationAddress: string;
  deliveryLocationCity: string;
  deliveryGateOrTerminal?: string;
  estimatedDistanceKm: number;
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
}

export async function updateShipment(id: string, payload: UpdateShipmentPayload): Promise<Mission> {
  const res = await apiClient.patch<ShipmentRecord>(`/shipments/${id}`, payload, token());
  return mapShipmentToMission(res.data);
}

export async function updateShipmentStatus(id: string, status: string): Promise<Mission> {
  const res = await apiClient.patch<ShipmentRecord>(`/shipments/${id}/status`, { status }, token());
  return mapShipmentToMission(res.data);
}

export async function deleteShipment(id: string): Promise<void> {
  await apiClient.delete(`/shipments/${id}`, token());
}
