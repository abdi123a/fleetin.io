import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  approvePayroll,
  archiveEmployee,
  calculatePayroll,
  cancelLeave,
  createEmployee,
  createPayrollPeriod,
  decideLeave,
  deleteEmployeeDocument,
  fetchCompanySettings,
  fetchDocumentTemplates,
  fetchEmployee,
  fetchEmployees,
  fetchExpiring,
  fetchHrDashboard,
  fetchIssuedDocuments,
  fetchLeavePlanning,
  fetchLeaveRecords,
  fetchPayrollPeriod,
  fetchPayrollPeriods,
  issueDocument,
  markPayrollPaid,
  previewDocument,
  requestLeave,
  setOvertime,
  updateEmployee,
  uploadEmployeeDocument,
  type CreateEmployeePayload,
  type EmployeeFilters,
  type LeaveStatus,
} from './hrService';

export const hrQueryKeys = {
  all: ['hr'] as const,
  dashboard: (periodId?: string) => ['hr', 'dashboard', periodId ?? 'latest'] as const,
  employees: ['hr', 'employees'] as const,
  employeeList: (filters: EmployeeFilters) => ['hr', 'employees', 'list', filters] as const,
  employee: (id: string) => ['hr', 'employees', 'detail', id] as const,
  expiring: (withinDays: number) => ['hr', 'expiring', withinDays] as const,
  periods: ['hr', 'payroll', 'periods'] as const,
  period: (id: string) => ['hr', 'payroll', 'period', id] as const,
  leave: ['hr', 'leave'] as const,
  leavePlanning: (anchor?: string, monthsBack?: number) =>
    ['hr', 'leave', 'planning', anchor ?? 'today', monthsBack ?? 12] as const,
  leaveRecords: (filters: Record<string, unknown>) => ['hr', 'leave', 'records', filters] as const,
  templates: ['hr', 'documents', 'templates'] as const,
  preview: (args: Record<string, unknown>) => ['hr', 'documents', 'preview', args] as const,
  issued: (filters: Record<string, unknown>) => ['hr', 'documents', 'issued', filters] as const,
  companySettings: ['hr', 'settings', 'company'] as const,
};

// ── Reads ───────────────────────────────────────────────────────────────────

export function useHrDashboard(periodId?: string) {
  return useQuery({
    queryKey: hrQueryKeys.dashboard(periodId),
    queryFn: () => fetchHrDashboard(periodId),
  });
}

export function useEmployees(filters: EmployeeFilters = {}) {
  return useQuery({
    queryKey: hrQueryKeys.employeeList(filters),
    queryFn: () => fetchEmployees(filters),
  });
}

export function useEmployee(id: string | undefined) {
  return useQuery({
    queryKey: hrQueryKeys.employee(id ?? ''),
    queryFn: () => fetchEmployee(id as string),
    enabled: Boolean(id),
  });
}

export function useExpiringDocuments(withinDays = 30) {
  return useQuery({
    queryKey: hrQueryKeys.expiring(withinDays),
    queryFn: () => fetchExpiring(withinDays),
  });
}

export function usePayrollPeriods() {
  return useQuery({ queryKey: hrQueryKeys.periods, queryFn: fetchPayrollPeriods });
}

export function usePayrollPeriod(periodId: string | undefined) {
  return useQuery({
    queryKey: hrQueryKeys.period(periodId ?? ''),
    queryFn: () => fetchPayrollPeriod(periodId as string),
    enabled: Boolean(periodId),
  });
}

export function useLeavePlanning(anchor?: string, monthsBack = 12) {
  return useQuery({
    queryKey: hrQueryKeys.leavePlanning(anchor, monthsBack),
    queryFn: () => fetchLeavePlanning(anchor, monthsBack),
  });
}

export function useLeaveRecords(
  filters: { employeeId?: string; status?: LeaveStatus; from?: string; to?: string } = {},
) {
  return useQuery({
    queryKey: hrQueryKeys.leaveRecords(filters),
    queryFn: () => fetchLeaveRecords(filters),
  });
}

export function useDocumentTemplates() {
  return useQuery({ queryKey: hrQueryKeys.templates, queryFn: fetchDocumentTemplates });
}

/**
 * The live A4 preview.
 *
 * `enabled` gates on having enough of a selection to render — asking the
 * server for an employee-scope document with no employee just produces a 400
 * the user did not cause. `placeholderData` keeps the previous page on screen
 * while the next one renders, so changing a date does not flash the pane empty.
 */
export function useDocumentPreview(args: {
  template?: string;
  employeeId?: string;
  periodId?: string;
  fields?: Record<string, unknown>;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: hrQueryKeys.preview({
      template: args.template,
      employeeId: args.employeeId,
      periodId: args.periodId,
      fields: args.fields,
    }),
    queryFn: () =>
      previewDocument({
        template: args.template as string,
        employeeId: args.employeeId,
        periodId: args.periodId,
        fields: args.fields,
      }),
    enabled: Boolean(args.template) && args.enabled !== false,
    placeholderData: (previous) => previous,
    retry: false,
  });
}

export function useIssuedDocuments(
  filters: { employeeId?: string; periodId?: string; templateKey?: string } = {},
) {
  return useQuery({
    queryKey: hrQueryKeys.issued(filters),
    queryFn: () => fetchIssuedDocuments(filters),
  });
}

export function useCompanySettings() {
  return useQuery({ queryKey: hrQueryKeys.companySettings, queryFn: fetchCompanySettings });
}

// ── Mutations ───────────────────────────────────────────────────────────────

function invalidate(
  queryClient: ReturnType<typeof useQueryClient>,
  ...keys: readonly (readonly unknown[])[]
) {
  for (const key of keys) queryClient.invalidateQueries({ queryKey: key });
}

export function useCreateEmployee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateEmployeePayload) => createEmployee(payload),
    onSuccess: () => invalidate(queryClient, hrQueryKeys.employees, hrQueryKeys.all),
  });
}

export function useUpdateEmployee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: Parameters<typeof updateEmployee>[1];
    }) => updateEmployee(id, payload),
    onSuccess: (_data, variables) =>
      invalidate(queryClient, hrQueryKeys.employees, hrQueryKeys.employee(variables.id)),
  });
}

export function useArchiveEmployee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => archiveEmployee(id),
    onSuccess: () => invalidate(queryClient, hrQueryKeys.all),
  });
}

export function useUploadEmployeeDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      employeeId,
      file,
      meta,
    }: {
      employeeId: string;
      file: File;
      meta: { category: string; issueDate?: string; expiryDate?: string; notes?: string };
    }) => uploadEmployeeDocument(employeeId, file, meta),
    onSuccess: (_data, variables) =>
      invalidate(queryClient, hrQueryKeys.employee(variables.employeeId), ['hr', 'expiring']),
  });
}

export function useDeleteEmployeeDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (documentId: string) => deleteEmployeeDocument(documentId),
    onSuccess: () => invalidate(queryClient, hrQueryKeys.employees, ['hr', 'expiring']),
  });
}

export function useCreatePayrollPeriod() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ month, year }: { month: number; year: number }) =>
      createPayrollPeriod(month, year),
    onSuccess: () => invalidate(queryClient, hrQueryKeys.periods),
  });
}

export function useSetOvertime() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      periodId,
      payload,
    }: {
      periodId: string;
      payload: Parameters<typeof setOvertime>[1];
    }) => setOvertime(periodId, payload),
    onSuccess: (_data, variables) => invalidate(queryClient, hrQueryKeys.period(variables.periodId)),
  });
}

export function useCalculatePayroll() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (periodId: string) => calculatePayroll(periodId),
    onSuccess: (_data, periodId) =>
      invalidate(queryClient, hrQueryKeys.period(periodId), hrQueryKeys.periods, ['hr', 'dashboard']),
  });
}

export function useApprovePayroll() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (periodId: string) => approvePayroll(periodId),
    onSuccess: (_data, periodId) =>
      invalidate(queryClient, hrQueryKeys.period(periodId), hrQueryKeys.periods),
  });
}

export function useMarkPayrollPaid() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (periodId: string) => markPayrollPaid(periodId),
    onSuccess: (_data, periodId) =>
      invalidate(queryClient, hrQueryKeys.period(periodId), hrQueryKeys.periods),
  });
}

export function useRequestLeave() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Parameters<typeof requestLeave>[0]) => requestLeave(payload),
    onSuccess: () => invalidate(queryClient, hrQueryKeys.leave, hrQueryKeys.employees),
  });
}

export function useDecideLeave() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      leaveId,
      decision,
      note,
    }: {
      leaveId: string;
      decision: 'APPROVED' | 'REJECTED';
      note?: string;
    }) => decideLeave(leaveId, decision, note),
    onSuccess: () => invalidate(queryClient, hrQueryKeys.leave, hrQueryKeys.employees),
  });
}

export function useCancelLeave() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (leaveId: string) => cancelLeave(leaveId),
    onSuccess: () => invalidate(queryClient, hrQueryKeys.leave, hrQueryKeys.employees),
  });
}

/**
 * Issuing is not idempotent — it consumes a reference number and writes a
 * permanent record — so it is a mutation and never a query, and the caller is
 * responsible for not firing it twice.
 */
export function useIssueDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: Parameters<typeof issueDocument>[0]) => issueDocument(args),
    onSuccess: () => invalidate(queryClient, ['hr', 'documents'], hrQueryKeys.employees),
  });
}
