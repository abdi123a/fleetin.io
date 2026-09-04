import { apiClient, type ApiResponse } from '@/services/api.client';
import { useAuthStore } from '@/stores/auth.store';
import { openBlobInNewTab } from '@/utils';

/**
 * What it costs to run Fleetin — the one money model here that is not about a
 * shipment.
 *
 * Two records, and the difference between them is the whole design:
 *
 *   - An **expense** is a thing that happened. Somebody spent money, has the
 *     receipt, and files it. Anyone who logs in may file one.
 *   - A **recurring expense** is a thing that keeps happening — the rent, a
 *     salary, the insurance premium. It is a standing obligation and never
 *     money: posting it writes a real expense for that period.
 *
 * Every figure is whole DJF; minor-unit strings, because the server counts in
 * BigInt and JSON has no such thing.
 */

/** Mirrors the backend's `EXPENSE_CATEGORIES`. */
export type ExpenseCategory =
  | 'SALARY'
  | 'RENT'
  | 'UTILITIES'
  | 'FUEL'
  | 'VEHICLE'
  | 'TELECOM'
  | 'TECHNOLOGY'
  | 'OFFICE'
  | 'TRAVEL'
  | 'INSURANCE'
  | 'PROFESSIONAL'
  | 'TAX'
  | 'BANK'
  | 'OTHER';

export type ExpenseMethod =
  | 'CASH'
  | 'BANK_TRANSFER'
  | 'MOBILE_MONEY'
  | 'CARD'
  | 'PETTY_CASH'
  | 'CHEQUE';

export type ExpenseStatus = 'Submitted' | 'Approved' | 'Paid' | 'Rejected';

export type ExpenseFrequency = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';

export interface ExpenseRecord {
  id: string;
  /** `EXP-#####`. */
  number: string;
  category: ExpenseCategory;
  description: string;
  vendorOrPayee: string | null;
  amountMinorUnits: string;
  currency: string;
  baseAmountMinorUnits: string;
  /** When the money was spent — never when the claim was filed. */
  incurredAt: string;
  method: ExpenseMethod;
  paidById: string;
  paidByName: string;
  /** The claimant spent their own money; Fleetin owes it back. */
  reimbursable: boolean;
  receiptKey: string | null;
  receiptName: string | null;
  receiptMime: string | null;
  receiptSizeBytes: number | null;
  status: ExpenseStatus;
  isRecurring: boolean;
  recurringTemplateId: string | null;
  /** `2026-09` on a posted recurring entry, null on a one-off. */
  periodLabel: string | null;
  createdById: string;
  createdByName: string;
  approvedById: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  rejectionReason: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  template?: { reference: string; frequency: ExpenseFrequency } | null;
}

export interface RecurringExpenseRecord {
  id: string;
  /** `REX-#####`. */
  reference: string;
  category: ExpenseCategory;
  description: string;
  vendorOrPayee: string;
  amountMinorUnits: string;
  currency: string;
  method: ExpenseMethod;
  frequency: ExpenseFrequency;
  nextDueAt: string;
  lastPostedAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  notes: string | null;
  createdById: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  /**
   * What this obligation costs per month whatever its own rhythm — computed
   * server-side so a weekly, a monthly and an annual can be added together
   * without two implementations disagreeing about the length of a month.
   */
  monthlyMinorUnits: string;
}

export interface ExpenseFilters {
  status?: ExpenseStatus | 'all';
  category?: ExpenseCategory | 'all';
  /** `YYYY-MM-DD`. */
  from?: string;
  to?: string;
  /** Your own claims only, whatever the account may otherwise see. */
  mine?: boolean;
}

/**
 * What the form asks for, and it is short on purpose: a receipt, a kind, an
 * amount, what it was for, and when. The optional fields below are reachable
 * through the API — a correction, an import — but nothing in the app asks a
 * person at a fuel pump for them.
 */
export interface CreateExpensePayload {
  category: ExpenseCategory;
  description: string;
  /** Whole DJF. */
  amount: number;
  /** `YYYY-MM-DD`. */
  incurredAt: string;
  /** Required by the server — a claim without evidence cannot be approved. */
  receipt: File;
  vendorOrPayee?: string;
  /** Defaults to cash server-side, which is what an unrecorded receipt is. */
  method?: ExpenseMethod;
  reimbursable?: boolean;
  notes?: string;
}

export interface UpdateExpensePayload {
  category?: ExpenseCategory;
  description?: string;
  vendorOrPayee?: string;
  amount?: number;
  incurredAt?: string;
  method?: ExpenseMethod;
  reimbursable?: boolean;
  notes?: string;
}

/** Six fields, and the form asks for all six — a commitment is worth naming fully. */
export interface CreateRecurringExpensePayload {
  category: ExpenseCategory;
  description: string;
  vendorOrPayee: string;
  /** Whole DJF, per occurrence — not per month. */
  amount: number;
  frequency: ExpenseFrequency;
  /** `YYYY-MM-DD` — when the next one falls due. */
  nextDueAt: string;
  /** API-only; the form does not ask. Defaults to a bank transfer. */
  method?: ExpenseMethod;
  endsAt?: string;
  notes?: string;
}

export type UpdateRecurringExpensePayload = Partial<CreateRecurringExpensePayload> & {
  isActive?: boolean;
};

function token() {
  return useAuthStore.getState().accessToken;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Claims
 * ═══════════════════════════════════════════════════════════════════════ */

export async function fetchExpenses(filters: ExpenseFilters = {}): Promise<ExpenseRecord[]> {
  const params = new URLSearchParams();
  if (filters.status && filters.status !== 'all') params.set('status', filters.status);
  if (filters.category && filters.category !== 'all') params.set('category', filters.category);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.mine) params.set('mine', 'true');
  const query = params.toString();
  const res = await apiClient.get<ExpenseRecord[]>(`/expenses${query ? `?${query}` : ''}`, token());
  return res.data ?? [];
}

export async function fetchExpense(id: string): Promise<ExpenseRecord> {
  const res = await apiClient.get<ExpenseRecord>(`/expenses/${id}`, token());
  return res.data;
}

/**
 * File a claim. Multipart, because the receipt travels with it — the server
 * refuses the whole thing without one.
 */
export async function createExpense(payload: CreateExpensePayload): Promise<ExpenseRecord> {
  const form = new FormData();
  form.append('category', payload.category);
  form.append('description', payload.description);
  if (payload.vendorOrPayee) form.append('vendorOrPayee', payload.vendorOrPayee);
  form.append('amount', String(Math.round(payload.amount)));
  form.append('incurredAt', payload.incurredAt);
  if (payload.method) form.append('method', payload.method);
  if (payload.reimbursable) form.append('reimbursable', 'true');
  if (payload.notes) form.append('notes', payload.notes);
  form.append('receipt', payload.receipt);
  const res: ApiResponse<ExpenseRecord> = await apiClient.upload('/expenses', form, token());
  return res.data;
}

export async function updateExpense(id: string, payload: UpdateExpensePayload): Promise<ExpenseRecord> {
  const res = await apiClient.patch<ExpenseRecord>(`/expenses/${id}`, payload, token());
  return res.data;
}

export async function approveExpense(id: string): Promise<ExpenseRecord> {
  const res = await apiClient.patch<ExpenseRecord>(`/expenses/${id}/approve`, {}, token());
  return res.data;
}

export async function rejectExpense(id: string, reason: string): Promise<ExpenseRecord> {
  const res = await apiClient.patch<ExpenseRecord>(`/expenses/${id}/reject`, { reason }, token());
  return res.data;
}

export async function payExpense(id: string, paidAt?: string): Promise<ExpenseRecord> {
  const res = await apiClient.patch<ExpenseRecord>(`/expenses/${id}/pay`, paidAt ? { paidAt } : {}, token());
  return res.data;
}

export async function withdrawExpense(id: string): Promise<void> {
  await apiClient.delete(`/expenses/${id}`, token());
}

/** The receipt's real bytes, for preview or download. */
export async function fetchExpenseReceipt(id: string): Promise<{ blob: Blob; filename: string | null }> {
  return apiClient.downloadBlob(`/expenses/${id}/receipt`, token());
}

/**
 * Show the receipt.
 *
 * Through the bytes rather than a link: the endpoint authenticates on a bearer
 * header that a plain `window.open` cannot carry.
 */
export async function openExpenseReceipt(expense: {
  id: string;
  number: string;
  receiptName: string | null;
}): Promise<void> {
  await openBlobInNewTab(() => fetchExpenseReceipt(expense.id), expense.receiptName ?? expense.number);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Recurring
 * ═══════════════════════════════════════════════════════════════════════ */

export async function fetchRecurringExpenses(): Promise<RecurringExpenseRecord[]> {
  const res = await apiClient.get<RecurringExpenseRecord[]>('/expenses/recurring', token());
  return res.data ?? [];
}

export async function createRecurringExpense(
  payload: CreateRecurringExpensePayload,
): Promise<RecurringExpenseRecord> {
  const res = await apiClient.post<RecurringExpenseRecord>('/expenses/recurring', payload, token());
  return res.data;
}

export async function updateRecurringExpense(
  id: string,
  payload: UpdateRecurringExpensePayload,
): Promise<RecurringExpenseRecord> {
  const res = await apiClient.patch<RecurringExpenseRecord>(`/expenses/recurring/${id}`, payload, token());
  return res.data;
}

/** Book the due period and move the due date on. Refused if already booked. */
export async function postRecurringExpense(id: string): Promise<ExpenseRecord> {
  const res = await apiClient.post<ExpenseRecord>(`/expenses/recurring/${id}/post`, {}, token());
  return res.data;
}

export async function deleteRecurringExpense(id: string): Promise<void> {
  await apiClient.delete(`/expenses/recurring/${id}`, token());
}
