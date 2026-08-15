import { apiClient } from '@/services/api.client';
import { useAuthStore } from '@/stores/auth.store';

/**
 * The HR & Payroll API surface.
 *
 * Every money figure crosses the wire as a `number` in whole-and-fractional
 * DJF — the backend stores `Decimal(14,4)` and serialises at the edge. This
 * module never rounds; rounding is a display decision and lives in the pages.
 */

function token() {
  return useAuthStore.getState().accessToken;
}

export type Gender = 'M' | 'F';
export type ContractType = 'CDI' | 'CDD' | 'APPRENTISSAGE' | 'STAGE';
export type EmployeeStatus = 'ACTIVE' | 'ON_LEAVE' | 'SUSPENDED' | 'TERMINATED';
export type PeriodStatus = 'DRAFT' | 'CALCULATED' | 'APPROVED' | 'PAID';
export type LeaveStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type DocumentScope = 'EMPLOYEE' | 'PERIOD';

export interface PaginatedResponse<T> {
  items: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export interface LeaveBalance {
  serviceDays: number;
  accrued: number;
  taken: number;
  balance: number;
  capped: boolean;
}

export interface Employee {
  id: string;
  matricule: string;
  fullName: string;
  gender: Gender;
  nationality: string;
  cnssNumber: string | null;
  nifNumber?: string | null;
  profession: string;
  department: string | null;
  contractType: ContractType;
  joiningDate: string;
  contractEndDate: string | null;
  trialPeriodEnd: string | null;
  /** Absent when the caller lacks `hr.view-salary`. */
  baseSalary?: number;
  /** Absent when the caller lacks `hr.view-identity`. */
  bankAccount?: string | null;
  email?: string | null;
  phone?: string | null;
  status: EmployeeStatus;
  terminationDate: string | null;
  managerId: string | null;
  /** Field names the server withheld from this caller. */
  redacted: string[];
  _count?: { documents: number };
}

export interface EmployeeDocument {
  id: string;
  category: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  issueDate: string | null;
  expiryDate: string | null;
  uploadedAt: string;
  notes: string | null;
}

export interface EmployeeDetail extends Employee {
  manager: { id: string; fullName: string } | null;
  leave: LeaveBalance;
  documents: EmployeeDocument[];
}

export interface PayrollLine {
  id: string;
  employeeId: string;
  employeeName: string;
  matricule: string;
  profession: string;
  nationality: string;
  cnssNumber: string | null;
  bankAccount: string | null;
  joiningDate: string;
  baseSalary: number;
  absenceDeduction: number;
  overtimeHours: number;
  overtimeAmount: number;
  currentGross: number;
  seniorityRate: number;
  seniorityAmount: number;
  cappedSalary: number;
  retirementEmployee: number;
  amuEmployee: number;
  employerContribution: number;
  totalCnss: number;
  taxableWages: number;
  its: number;
  netSalary: number;
}

export interface PayrollTotals {
  headcount: number;
  currentGross: number;
  overtimeAmount: number;
  absenceDeduction: number;
  seniorityAmount: number;
  cappedSalary: number;
  retirementEmployee: number;
  amuEmployee: number;
  employerContribution: number;
  totalCnss: number;
  taxableWages: number;
  its: number;
  netSalary: number;
}

export interface OvertimeEntry {
  id: string;
  employeeId: string;
  hours125: number;
  hours150: number;
  hourlyRate: number;
  amount125: number;
  amount150: number;
  totalAmount: number;
  absenceDeduction: number;
  note: string | null;
  employee?: { id: string; fullName: string; matricule: string };
}

export interface PayrollPeriodSummary {
  id: string;
  month: number;
  year: number;
  status: PeriodStatus;
  configId: string;
  calculatedAt: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  endDate: string;
  config: { id: string; label: string };
  _count: { lines: number };
}

export interface PayrollPeriodDetail extends Omit<PayrollPeriodSummary, 'config' | '_count'> {
  config: { id: string; label: string; seniorityIncludedInGross: boolean; capRetirementEmployee: boolean };
  lines: PayrollLine[];
  overtime: OvertimeEntry[];
  totals: PayrollTotals;
}

export interface LeaveRecord {
  id: string;
  employeeId: string;
  type: string;
  status: LeaveStatus;
  startDate: string;
  endDate: string;
  days: number;
  reason: string | null;
  decisionNote: string | null;
  employee?: { id: string; fullName: string; matricule: string; profession: string };
}

export interface LeavePlanningGrid {
  months: { key: string; month: number; year: number }[];
  rows: {
    employeeId: string;
    fullName: string;
    matricule: string;
    profession: string;
    balance: LeaveBalance;
    cells: { key: string; days: number; status: LeaveStatus | null }[];
  }[];
}

export interface ExpiringItem {
  kind: 'document' | 'contract' | 'trial';
  id: string;
  employeeId: string;
  employeeName: string;
  matricule: string;
  label: string;
  expiresOn: string;
  daysUntil: number;
}

export interface HrDashboard {
  period: {
    id: string;
    month: number;
    year: number;
    status: PeriodStatus;
    calculated: boolean;
    endDate: string;
  } | null;
  headcount: number;
  byStatus: { status: EmployeeStatus; count: number }[];
  byDepartment: { department: string; count: number }[];
  payroll: {
    lines: number;
    totalGross: number;
    totalCnss: number;
    employerContribution: number;
    totalIts: number;
    totalNet: number;
    totalOvertime: number;
    totalAbsence: number;
  };
  leave: { pendingRequests: number; plannedDays: number };
  expiring: { in30: number; in60: number; in90: number; items: ExpiringItem[] };
}

export interface DocumentTemplateField {
  key: string;
  label: string;
  type: 'date' | 'toggle' | 'leave' | 'period';
  required?: boolean;
  default?: unknown;
  hint?: string;
}

export interface DocumentTemplate {
  key: string;
  label: string;
  scope: DocumentScope;
  refPrefix: string;
  version: number;
  requiresFields: DocumentTemplateField[];
}

export interface DocumentPreview {
  html: string;
  payload: Record<string, unknown>;
  referenceNo: string;
  landscape: boolean;
}

export interface IssuedDocument {
  id: string;
  templateKey: string;
  referenceNo: string;
  issueDate: string;
  employeeId: string | null;
  periodId: string | null;
  createdAt: string;
  employee?: { id: string; fullName: string; matricule: string } | null;
}

export interface CompanySettings {
  id: string;
  name: string;
  legalName: string;
  department: string;
  address: string;
  phone: string;
  email: string;
  cnssId: string;
  nif: string;
  bankName: string;
  bankAccountName: string;
  bankAccountNo: string;
  signatoryPrepared: { name: string; role: string };
  signatoryChecked: { name: string; role: string };
  signatoryApproved: { name: string; role: string };
  referencePattern: string;
}

// ── Dashboard ───────────────────────────────────────────────────────────────

export async function fetchHrDashboard(periodId?: string): Promise<HrDashboard> {
  const query = periodId ? `?periodId=${encodeURIComponent(periodId)}` : '';
  const res = await apiClient.get<HrDashboard>(`/hr/dashboard${query}`, token());
  return res.data;
}

// ── Employees ───────────────────────────────────────────────────────────────

export interface EmployeeFilters {
  search?: string;
  status?: string;
  department?: string;
  contractType?: string;
  page?: number;
  limit?: number;
}

export async function fetchEmployees(
  filters: EmployeeFilters = {},
): Promise<PaginatedResponse<Employee>> {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  if (filters.status && filters.status !== 'all') params.set('status', filters.status);
  if (filters.department) params.set('department', filters.department);
  if (filters.contractType) params.set('contractType', filters.contractType);
  params.set('page', String(filters.page ?? 1));
  params.set('limit', String(filters.limit ?? 100));

  const res = await apiClient.get<PaginatedResponse<Employee>>(
    `/hr/employees?${params.toString()}`,
    token(),
  );
  return res.data;
}

export async function fetchEmployee(id: string): Promise<EmployeeDetail> {
  const res = await apiClient.get<EmployeeDetail>(`/hr/employees/${id}`, token());
  return res.data;
}

export type CreateEmployeePayload = Omit<
  Employee,
  'id' | 'redacted' | 'status' | 'terminationDate' | '_count' | 'matricule'
> & { matricule?: string; baseSalary: number };

export async function createEmployee(payload: CreateEmployeePayload): Promise<Employee> {
  const res = await apiClient.post<Employee>('/hr/employees', payload, token());
  return res.data;
}

export async function updateEmployee(
  id: string,
  payload: Partial<CreateEmployeePayload> & { status?: EmployeeStatus; terminationDate?: string },
): Promise<Employee> {
  const res = await apiClient.patch<Employee>(`/hr/employees/${id}`, payload, token());
  return res.data;
}

export async function archiveEmployee(id: string): Promise<{ id: string; archived: boolean }> {
  const res = await apiClient.delete<{ id: string; archived: boolean }>(
    `/hr/employees/${id}`,
    token(),
  );
  return res.data;
}

export async function fetchExpiring(withinDays = 30): Promise<{
  withinDays: number;
  items: ExpiringItem[];
}> {
  const res = await apiClient.get<{ withinDays: number; items: ExpiringItem[] }>(
    `/hr/employees/expiring?withinDays=${withinDays}`,
    token(),
  );
  return res.data;
}

export async function uploadEmployeeDocument(
  employeeId: string,
  file: File,
  meta: { category: string; issueDate?: string; expiryDate?: string; notes?: string },
): Promise<EmployeeDocument> {
  const form = new FormData();
  form.append('file', file);
  form.append('category', meta.category);
  if (meta.issueDate) form.append('issueDate', meta.issueDate);
  if (meta.expiryDate) form.append('expiryDate', meta.expiryDate);
  if (meta.notes) form.append('notes', meta.notes);

  const res = await apiClient.upload<EmployeeDocument>(
    `/hr/employees/${employeeId}/documents`,
    form,
    token(),
  );
  return res.data;
}

/** Signed and short-lived — never store or share the URL this returns. */
export async function employeeDocumentUrl(
  documentId: string,
): Promise<{ url: string; expiresInSeconds: number; originalName: string }> {
  const res = await apiClient.get<{ url: string; expiresInSeconds: number; originalName: string }>(
    `/hr/employees/documents/${documentId}/download`,
    token(),
  );
  return res.data;
}

export async function employeeDocumentFile(documentId: string) {
  return apiClient.downloadBlob(`/hr/employees/documents/${documentId}/file`, token());
}

export async function issuedDocumentFile(issuedId: string) {
  return apiClient.downloadBlob(`/hr/documents/issued/${issuedId}/file`, token());
}

/**
 * Opens a document the user just asked for.
 *
 * The bytes are fetched rather than linked because the API authenticates on a
 * bearer header, which a plain `window.open` cannot carry — that is why the
 * old links landed on the dev server's 404 instead of the file. An object URL
 * with a real `download` name gives the browser both the viewer and the right
 * filename, and it is revoked on the next tick so nothing leaks.
 */
export async function openDocumentBlob(
  fetcher: () => Promise<{ blob: Blob; filename: string | null }>,
  fallbackName: string,
) {
  const { blob, filename } = await fetcher();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  anchor.download = filename ?? fallbackName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function deleteEmployeeDocument(documentId: string) {
  const res = await apiClient.delete<{ id: string; archived: boolean }>(
    `/hr/employees/documents/${documentId}`,
    token(),
  );
  return res.data;
}

// ── Payroll ─────────────────────────────────────────────────────────────────

export async function fetchPayrollPeriods(): Promise<PayrollPeriodSummary[]> {
  const res = await apiClient.get<PayrollPeriodSummary[]>('/hr/payroll/periods', token());
  return res.data;
}

export async function fetchPayrollPeriod(periodId: string): Promise<PayrollPeriodDetail> {
  const res = await apiClient.get<PayrollPeriodDetail>(
    `/hr/payroll/periods/${periodId}`,
    token(),
  );
  return res.data;
}

export async function createPayrollPeriod(month: number, year: number) {
  const res = await apiClient.post<PayrollPeriodSummary>(
    '/hr/payroll/periods',
    { month, year },
    token(),
  );
  return res.data;
}

export async function setOvertime(
  periodId: string,
  payload: {
    employeeId: string;
    overtimeHours?: number;
    absenceDeduction?: number;
    note?: string;
  },
) {
  const res = await apiClient.post<OvertimeEntry>(
    `/hr/payroll/periods/${periodId}/overtime`,
    payload,
    token(),
  );
  return res.data;
}

export async function calculatePayroll(periodId: string): Promise<PayrollPeriodDetail> {
  const res = await apiClient.post<PayrollPeriodDetail>(
    `/hr/payroll/periods/${periodId}/calculate`,
    {},
    token(),
  );
  return res.data;
}

export async function approvePayroll(periodId: string) {
  const res = await apiClient.post<PayrollPeriodSummary>(
    `/hr/payroll/periods/${periodId}/approve`,
    {},
    token(),
  );
  return res.data;
}

export async function markPayrollPaid(periodId: string) {
  const res = await apiClient.post<PayrollPeriodSummary>(
    `/hr/payroll/periods/${periodId}/paid`,
    {},
    token(),
  );
  return res.data;
}

// ── Leave ───────────────────────────────────────────────────────────────────

export async function fetchLeavePlanning(
  anchor?: string,
  monthsBack = 12,
): Promise<LeavePlanningGrid> {
  const params = new URLSearchParams({ monthsBack: String(monthsBack) });
  if (anchor) params.set('anchor', anchor);
  const res = await apiClient.get<LeavePlanningGrid>(
    `/hr/leave/planning?${params.toString()}`,
    token(),
  );
  return res.data;
}

export async function fetchLeaveRecords(filters: {
  employeeId?: string;
  status?: LeaveStatus;
  from?: string;
  to?: string;
} = {}): Promise<LeaveRecord[]> {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, String(value));
  });
  const res = await apiClient.get<LeaveRecord[]>(`/hr/leave?${params.toString()}`, token());
  return res.data;
}

export async function requestLeave(payload: {
  employeeId: string;
  type?: string;
  startDate: string;
  endDate: string;
  reason?: string;
}) {
  const res = await apiClient.post<LeaveRecord>('/hr/leave', payload, token());
  return res.data;
}

export async function decideLeave(
  leaveId: string,
  decision: 'APPROVED' | 'REJECTED',
  note?: string,
) {
  const res = await apiClient.post<LeaveRecord>(
    `/hr/leave/${leaveId}/decision`,
    { decision, note },
    token(),
  );
  return res.data;
}

export async function cancelLeave(leaveId: string) {
  const res = await apiClient.post<LeaveRecord>(`/hr/leave/${leaveId}/cancel`, {}, token());
  return res.data;
}

// ── Document generation ─────────────────────────────────────────────────────

export async function fetchDocumentTemplates(): Promise<DocumentTemplate[]> {
  const res = await apiClient.get<DocumentTemplate[]>('/hr/documents/templates', token());
  return res.data;
}

export async function previewDocument(args: {
  template: string;
  employeeId?: string;
  periodId?: string;
  fields?: Record<string, unknown>;
}): Promise<DocumentPreview> {
  const params = new URLSearchParams({ template: args.template });
  if (args.employeeId) params.set('employeeId', args.employeeId);
  if (args.periodId) params.set('periodId', args.periodId);
  if (args.fields && Object.keys(args.fields).length > 0) {
    params.set('fields', JSON.stringify(args.fields));
  }
  const res = await apiClient.get<DocumentPreview>(
    `/hr/documents/preview?${params.toString()}`,
    token(),
  );
  return res.data;
}

export async function issueDocument(args: {
  template: string;
  employeeId?: string;
  periodId?: string;
  fields?: Record<string, unknown>;
}): Promise<{
  id: string;
  referenceNo: string;
  fileKey: string;
  downloadUrl: string;
  issueDate: string;
  employeeDocumentId: string | null;
}> {
  const res = await apiClient.post<{
    id: string;
    referenceNo: string;
    fileKey: string;
    downloadUrl: string;
    issueDate: string;
    employeeDocumentId: string | null;
  }>('/hr/documents/issue', args, token());
  return res.data;
}

export async function fetchIssuedDocuments(filters: {
  employeeId?: string;
  periodId?: string;
  templateKey?: string;
} = {}): Promise<IssuedDocument[]> {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, String(value));
  });
  const res = await apiClient.get<IssuedDocument[]>(
    `/hr/documents/issued?${params.toString()}`,
    token(),
  );
  return res.data;
}

/**
 * The bordereau as a spreadsheet.
 *
 * The only HR endpoint that answers with bytes rather than the JSON envelope,
 * so it goes through `downloadBlob` — and the browser gets handed an object
 * URL rather than a signed link, because the file is built on demand and
 * never stored.
 */
export async function downloadBordereauXlsx(periodId?: string) {
  const query = periodId ? `?periodId=${encodeURIComponent(periodId)}` : '';
  return apiClient.downloadBlob(`/hr/documents/bordereau.xlsx${query}`, token());
}

export async function issuedDocumentUrl(issuedId: string) {
  const res = await apiClient.get<{
    url: string;
    referenceNo: string;
    expiresInSeconds: number;
  }>(`/hr/documents/issued/${issuedId}/download`, token());
  return res.data;
}

// ── Settings ────────────────────────────────────────────────────────────────

export async function fetchCompanySettings(): Promise<CompanySettings> {
  const res = await apiClient.get<CompanySettings>('/hr/settings/company', token());
  return res.data;
}
