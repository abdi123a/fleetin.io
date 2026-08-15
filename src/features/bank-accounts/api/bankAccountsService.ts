import { apiClient, resolveAssetUrl } from '@/services/api.client';
import { useAuthStore } from '@/stores/auth.store';

/** BigInt fields (`openingBalance`, `currentBalance`) arrive JSON-serialised as strings. */
export interface BankAccountRecord {
  id: string;
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  iban?: string | null;
  swiftCode?: string | null;
  currency: string;
  openingBalance: string;
  currentBalance: string;
  isActive: boolean;
  isPrimary: boolean;
  /** Resolved server-side from `logoKey`; never store this, it can expire on S3. */
  logoUrl?: string | null;
  createdAt: string;
}

export interface CreateBankAccountPayload {
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  iban?: string;
  swiftCode?: string;
  currency: string;
  isPrimary?: boolean;
}

export type UpdateBankAccountPayload = Partial<CreateBankAccountPayload>;

export type MovementMethod = 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'MOBILE_MONEY';
export type MovementType = 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER_IN' | 'TRANSFER_OUT';

/** One hand-entered cash movement. A transfer is two of these sharing a `groupId`. */
export interface BankMovementRecord {
  id: string;
  reference: string;
  bankAccountId: string;
  type: MovementType;
  direction: 'IN' | 'OUT';
  amountMinorUnits: string;
  currency: string;
  balanceAfterMinorUnits: string;
  counterpartyAccountId?: string | null;
  groupId?: string | null;
  method?: MovementMethod | null;
  externalReference?: string | null;
  description?: string | null;
  occurredAt: string;
  createdById: string;
  createdByName: string;
  createdAt: string;
}

export interface RecordMovementPayload {
  /** Always positive — the endpoint carries the direction, not the sign. */
  amountMinorUnits: number;
  method?: MovementMethod;
  externalReference?: string;
  description?: string;
  occurredAt?: string;
}

export interface TransferFundsPayload extends RecordMovementPayload {
  toBankAccountId: string;
  /** Required only when the two accounts hold different currencies. */
  receivedAmountMinorUnits?: number;
}

export interface TransferResult {
  groupId: string;
  from: BankMovementRecord;
  to: BankMovementRecord;
}

function token() {
  return useAuthStore.getState().accessToken;
}

/** The API returns `/uploads/…` relative to its own host, not to the app's. */
function withResolvedLogo(account: BankAccountRecord): BankAccountRecord {
  return { ...account, logoUrl: resolveAssetUrl(account.logoUrl) ?? null };
}

export async function fetchBankAccounts(): Promise<BankAccountRecord[]> {
  const res = await apiClient.get<BankAccountRecord[]>('/bank-accounts', token());
  return res.data.map(withResolvedLogo);
}

export async function fetchBankAccount(id: string): Promise<BankAccountRecord> {
  const res = await apiClient.get<BankAccountRecord>(`/bank-accounts/${id}`, token());
  return withResolvedLogo(res.data);
}

export async function createBankAccount(payload: CreateBankAccountPayload): Promise<BankAccountRecord> {
  const res = await apiClient.post<BankAccountRecord>('/bank-accounts', payload, token());
  return withResolvedLogo(res.data);
}

export async function updateBankAccount(
  id: string,
  payload: UpdateBankAccountPayload,
): Promise<BankAccountRecord> {
  const res = await apiClient.patch<BankAccountRecord>(`/bank-accounts/${id}`, payload, token());
  return withResolvedLogo(res.data);
}

/** Soft-close. The server refuses while the account still holds money. */
export async function closeBankAccount(id: string): Promise<BankAccountRecord> {
  const res = await apiClient.delete<BankAccountRecord>(`/bank-accounts/${id}`, token());
  return withResolvedLogo(res.data);
}

export async function uploadBankAccountLogo(id: string, file: File): Promise<BankAccountRecord> {
  const form = new FormData();
  form.append('file', file);
  const res = await apiClient.upload<BankAccountRecord>(`/bank-accounts/${id}/logo`, form, token());
  return withResolvedLogo(res.data);
}

export async function removeBankAccountLogo(id: string): Promise<BankAccountRecord> {
  const res = await apiClient.delete<BankAccountRecord>(`/bank-accounts/${id}/logo`, token());
  return withResolvedLogo(res.data);
}

export async function fetchBankMovements(params?: {
  bankAccountId?: string;
  limit?: number;
}): Promise<BankMovementRecord[]> {
  const query = new URLSearchParams();
  if (params?.bankAccountId) query.set('bankAccountId', params.bankAccountId);
  if (params?.limit) query.set('limit', String(params.limit));
  const suffix = query.toString() ? `?${query.toString()}` : '';
  const res = await apiClient.get<BankMovementRecord[]>(`/bank-accounts/movements${suffix}`, token());
  return res.data;
}

export async function depositToBankAccount(
  id: string,
  payload: RecordMovementPayload,
): Promise<BankMovementRecord> {
  const res = await apiClient.post<BankMovementRecord>(`/bank-accounts/${id}/deposit`, payload, token());
  return res.data;
}

export async function withdrawFromBankAccount(
  id: string,
  payload: RecordMovementPayload,
): Promise<BankMovementRecord> {
  const res = await apiClient.post<BankMovementRecord>(`/bank-accounts/${id}/withdraw`, payload, token());
  return res.data;
}

export async function transferBetweenBankAccounts(
  fromId: string,
  payload: TransferFundsPayload,
): Promise<TransferResult> {
  const res = await apiClient.post<TransferResult>(`/bank-accounts/${fromId}/transfer`, payload, token());
  return res.data;
}
