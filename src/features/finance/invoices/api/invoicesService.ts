import { apiClient } from '@/services/api.client';
import { useAuthStore } from '@/stores/auth.store';

export interface PaginatedResponse<T> {
  items: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

/** Money fields are BigInt-on-wire strings. No shipper/shipment object is nested — only denormalized snapshot fields. */
export interface InvoiceRecord {
  id: string;
  number: string;
  shipperId: string;
  shipperName: string;
  shipperCompany: string;
  missionIds: string[];
  description: string;
  subtotalMinorUnits: string;
  taxMinorUnits: string;
  totalMinorUnits: string;
  currency: string;
  fxRate: number;
  baseAmountMinorUnits: string;
  contractDeadline: string;
  issueDate: string;
  sentAt: string | null;
  status: string;
  allocatedMinorUnits: string;
  remainingMinorUnits: string;
  notes: string | null;
  disputeReason: string | null;
  writeOffReason: string | null;
  writtenOffAt: string | null;
  writtenOffById: string | null;
  issuedById: string;
  issuedByName: string;
  /**
   * Set on a monthly statement — the shipper's single end-of-month bill
   * covering every shipment that ran in the window. Null on a one-off
   * single-shipment invoice.
   */
  periodStart: string | null;
  periodEnd: string | null;
  /** Set when the statement was scoped to one project rather than the whole month. */
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** True when this invoice is a month's statement rather than a one-off shipment bill. */
export function isMonthlyStatement(invoice: InvoiceRecord): boolean {
  return invoice.periodStart !== null;
}

export interface IssueStatementPayload {
  shipperId: string;
  year: number;
  /** 1-based, the way a person says it: 1 = January. */
  month: number;
  /** Omit to bill everything the shipper ran that month. */
  projectId?: string;
}

export interface InvoiceFilters {
  shipperId?: string;
  status?: string;
  page?: number;
  limit?: number;
}

function token() {
  return useAuthStore.getState().accessToken;
}

function toQueryString(filters: InvoiceFilters): string {
  const params = new URLSearchParams();
  if (filters.shipperId) params.set('shipperId', filters.shipperId);
  if (filters.status && filters.status !== 'all') params.set('status', filters.status);
  params.set('page', String(filters.page ?? 1));
  params.set('limit', String(filters.limit ?? 100));
  return params.toString();
}

export async function fetchInvoices(filters: InvoiceFilters = {}): Promise<PaginatedResponse<InvoiceRecord>> {
  const res = await apiClient.get<PaginatedResponse<InvoiceRecord>>(`/invoices?${toQueryString(filters)}`, token());
  return res.data;
}

/**
 * Every page of the list, concatenated — for the admin console, whose totals
 * must cover the whole book rather than one capped page. Hard-stops at 20
 * pages so a runaway `totalPages` can't loop the client.
 */
export async function fetchAllInvoices(filters: InvoiceFilters = {}): Promise<InvoiceRecord[]> {
  const first = await fetchInvoices({ ...filters, page: 1 });
  const items = [...first.items];
  const lastPage = Math.min(first.meta.totalPages, 20);
  for (let page = 2; page <= lastPage; page += 1) {
    const next = await fetchInvoices({ ...filters, page });
    items.push(...next.items);
  }
  return items;
}

export async function fetchInvoice(id: string): Promise<InvoiceRecord> {
  const res = await apiClient.get<InvoiceRecord>(`/invoices/${id}`, token());
  return res.data;
}

/** Idempotent — no-ops server-side if an invoice already exists or the shipment is still unpriced. */
export async function issueInvoiceForShipment(shipmentId: string): Promise<InvoiceRecord | null> {
  const res = await apiClient.post<InvoiceRecord | null>(`/invoices/issue-for-shipment/${shipmentId}`, {}, token());
  return res.data;
}

/**
 * Issues the shipper's end-of-month statement — one invoice listing every
 * shipment that ran in the month, payable at month end. Idempotent per
 * shipper/month/project; resolves to `null` when there is nothing left to
 * bill (already billed, or nothing priced ran).
 */
export async function issueMonthlyStatement(payload: IssueStatementPayload): Promise<InvoiceRecord | null> {
  const res = await apiClient.post<InvoiceRecord | null>('/invoices/issue-monthly-statement', payload, token());
  return res.data;
}

export async function markInvoicePaid(id: string, bankAccountId: string): Promise<InvoiceRecord> {
  const res = await apiClient.patch<InvoiceRecord>(`/invoices/${id}/mark-paid`, { bankAccountId }, token());
  return res.data;
}
