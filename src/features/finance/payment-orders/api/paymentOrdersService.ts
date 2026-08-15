import { apiClient } from '@/services/api.client';
import { useAuthStore } from '@/stores/auth.store';

export interface PaginatedResponse<T> {
  items: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

/** No `acknowledgedAt`/signing field exists — a paid voucher is just `status === 'Paid'`. */
export interface PaymentOrderRecord {
  id: string;
  number: string;
  transporterId: string;
  transporterName: string;
  transporterCompany: string;
  /** The shipment id — named `missionId` on the wire, not `shipmentId`. */
  missionId: string;
  driverName: string | null;
  assignedTruckPlate: string | null;
  route: string;
  amountMinorUnits: string;
  currency: string;
  fxRate: number;
  baseAmountMinorUnits: string;
  status: string;
  createdById: string;
  createdByName: string;
  approvedById: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  drawdownId: string | null;
  paymentMethod: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentOrderFilters {
  transporterId?: string;
  shipmentId?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface PayTransporterPayload {
  shipmentId: string;
  transporterId: string;
  bankAccountId: string;
  paymentMethod?: string;
  notes?: string;
}

function token() {
  return useAuthStore.getState().accessToken;
}

function toQueryString(filters: PaymentOrderFilters): string {
  const params = new URLSearchParams();
  if (filters.transporterId) params.set('transporterId', filters.transporterId);
  if (filters.shipmentId) params.set('shipmentId', filters.shipmentId);
  if (filters.status && filters.status !== 'all') params.set('status', filters.status);
  params.set('page', String(filters.page ?? 1));
  params.set('limit', String(filters.limit ?? 100));
  return params.toString();
}

export async function fetchPaymentOrders(filters: PaymentOrderFilters = {}): Promise<PaginatedResponse<PaymentOrderRecord>> {
  const res = await apiClient.get<PaginatedResponse<PaymentOrderRecord>>(`/payment-orders?${toQueryString(filters)}`, token());
  return res.data;
}

/**
 * Every page of the list, concatenated — for the admin console, whose totals
 * must cover the whole book rather than one capped page. Hard-stops at 20
 * pages so a runaway `totalPages` can't loop the client.
 */
export async function fetchAllPaymentOrders(filters: PaymentOrderFilters = {}): Promise<PaymentOrderRecord[]> {
  const first = await fetchPaymentOrders({ ...filters, page: 1 });
  const items = [...first.items];
  const lastPage = Math.min(first.meta.totalPages, 20);
  for (let page = 2; page <= lastPage; page += 1) {
    const next = await fetchPaymentOrders({ ...filters, page });
    items.push(...next.items);
  }
  return items;
}

export async function fetchPaymentOrder(id: string): Promise<PaymentOrderRecord> {
  const res = await apiClient.get<PaymentOrderRecord>(`/payment-orders/${id}`, token());
  return res.data;
}

/** Guarded server-side: shipment released, not held, this transporter+shipment pair not already paid. */
export async function payTransporter(payload: PayTransporterPayload): Promise<PaymentOrderRecord> {
  const res = await apiClient.post<PaymentOrderRecord>('/payment-orders/pay-transporter', payload, token());
  return res.data;
}
