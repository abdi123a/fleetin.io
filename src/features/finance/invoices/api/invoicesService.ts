import { apiClient } from '@/services/api.client';
import { useAuthStore } from '@/stores/auth.store';

/** `proforma` is a quote and owes nothing; `invoice` is the bill. */
export type DocumentKind = 'proforma' | 'invoice';

/** One container on the document. Snapshotted at issue — see the backend's note on why. */
export interface DocumentLine {
  reference: string;
  containerNo: string | null;
  category: string | null;
  description: string;
  qty: number;
  unitMinorUnits: string;
  totalMinorUnits: string;
}

/**
 * A proforma or an invoice. One shipment, one document, its containers as
 * lines — there is no monthly statement and no multi-shipment roll-up.
 */
export interface InvoiceRecord {
  id: string;
  number: string;
  kind: DocumentKind;
  shipmentId: string | null;
  proformaId: string | null;
  shipperId: string;
  shipperName: string;
  shipperCompany: string;
  projectId: string | null;
  description: string;
  lines: DocumentLine[] | null;
  subtotalMinorUnits: string;
  taxMinorUnits: string;
  totalMinorUnits: string;
  /* How the cut was worked out on THIS document, and what it came to. All
     snapshots — never recomputed, so renegotiating a deal cannot restate a
     document already sent. */
  commissionMode: 'percent' | 'fixed';
  commissionSource: 'shipper' | 'transporter' | 'house';
  commissionPct: number;
  commissionFixedMinorUnits: string;
  commissionMinorUnits: string;
  currency: string;
  contractDeadline: string;
  issueDate: string;
  sentAt: string | null;
  paidAt: string | null;
  status: string;
  notes: string | null;
  issuedByName: string;
  createdAt: string;
  updatedAt: string;
  /** Legacy monthly statements only — never written by the current model. */
  periodStart: string | null;
  periodEnd: string | null;
  missionIds: string[];
}

export interface InvoiceFilters {
  shipperId?: string;
  projectId?: string;
  kind?: DocumentKind | 'all';
  status?: string;
  page?: number;
  limit?: number;
}

function token() {
  return useAuthStore.getState().accessToken;
}

/**
 * A row written before the proforma/invoice split has no `kind` and no lines.
 * Rather than let those render as blanks, they read as what they were: an
 * invoice, with no itemisation to show.
 */
function normalise(row: InvoiceRecord): InvoiceRecord {
  return {
    ...row,
    kind: row.kind ?? 'invoice',
    lines: Array.isArray(row.lines) ? row.lines : null,
    missionIds: Array.isArray(row.missionIds) ? row.missionIds : [],
  };
}

export async function fetchInvoices(filters: InvoiceFilters = {}): Promise<InvoiceRecord[]> {
  const params = new URLSearchParams();
  if (filters.shipperId) params.set('shipperId', filters.shipperId);
  if (filters.projectId) params.set('projectId', filters.projectId);
  if (filters.kind && filters.kind !== 'all') params.set('kind', filters.kind);
  if (filters.status && filters.status !== 'all') params.set('status', filters.status);
  params.set('limit', String(filters.limit ?? 200));
  if (filters.page) params.set('page', String(filters.page));

  const res = await apiClient.get<{ items: InvoiceRecord[] }>(`/invoices?${params.toString()}`, token());
  return (res.data.items ?? []).map(normalise);
}

export async function fetchInvoice(id: string): Promise<InvoiceRecord> {
  const res = await apiClient.get<InvoiceRecord>(`/invoices/${id}`, token());
  return normalise(res.data);
}

/** Both documents a shipment carries. */
export async function fetchInvoicesForShipment(shipmentId: string): Promise<InvoiceRecord[]> {
  const res = await apiClient.get<InvoiceRecord[]>(`/invoices/for-shipment/${shipmentId}`, token());
  return (res.data ?? []).map(normalise);
}

/**
 * Bills one shipment. Idempotent — asking twice returns the invoice already
 * raised rather than minting a second number for the same job.
 */
export async function issueInvoice(shipmentId: string): Promise<InvoiceRecord> {
  const res = await apiClient.post<InvoiceRecord>(`/invoices/issue-for-shipment/${shipmentId}`, {}, token());
  return normalise(res.data);
}

/** One hand-typed line on a quotation. `unitAmount` is whole DJF for ONE unit. */
export interface ProformaLineInput {
  description: string;
  qty: number;
  unitAmount: number;
}

export interface CreateProformaPayload {
  shipperId: string;
  description?: string;
  validUntil?: string;
  notes?: string;
  lines: ProformaLineInput[];
}

/**
 * Writes a quotation.
 *
 * Composed rather than derived, and that is the point: a quote is for work
 * that has not happened, so there is no shipment to build it from. Not
 * idempotent — two quotes to one client for different work are two real
 * documents.
 */
export async function createProforma(payload: CreateProformaPayload): Promise<InvoiceRecord> {
  const res = await apiClient.post<InvoiceRecord>('/invoices/proforma', payload, token());
  return normalise(res.data);
}

export async function markInvoiceSent(id: string): Promise<InvoiceRecord> {
  const res = await apiClient.patch<InvoiceRecord>(`/invoices/${id}/mark-sent`, {}, token());
  return normalise(res.data);
}

export async function markInvoicePaid(id: string): Promise<InvoiceRecord> {
  const res = await apiClient.patch<InvoiceRecord>(`/invoices/${id}/mark-paid`, {}, token());
  return normalise(res.data);
}

export async function cancelInvoice(id: string, reason: string): Promise<InvoiceRecord> {
  const res = await apiClient.patch<InvoiceRecord>(`/invoices/${id}/cancel`, { reason }, token());
  return normalise(res.data);
}
