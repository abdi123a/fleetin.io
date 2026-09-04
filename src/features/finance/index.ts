/**
 * Billing.
 *
 * Four things, and deliberately nothing else: a **project** groups a shipper's
 * shipments, a **proforma** quotes one shipment, an **invoice** bills it, and a
 * **commission percentage** says what Fleetin keeps out of the total.
 *
 * Beside them sits the one thing here that is NOT about a shipment: the
 * **expense book** — what it costs to run Fleetin. Rent, salaries, the diesel
 * somebody bought with their own card. Nothing in it is ever allocated to a
 * job or reaches an invoice.
 *
 * The working-capital module this replaced — ledgers, credit facilities,
 * drawdowns, payout orders, holds, bank movements, monthly statements — was
 * removed on 2026-09-03. If you are about to add a second money concept here,
 * that is the thing that was taken out.
 */

export type {
  CreateProformaPayload,
  DocumentKind,
  DocumentLine,
  InvoiceRecord,
  InvoiceFilters,
  ProformaLineInput,
  ProjectInvoiceResult,
} from './invoices/api/invoicesService';
export {
  invoiceQueryKeys,
  useCancelInvoice,
  useCreateProforma,
  useInvoice,
  useInvoices,
  useInvoicesForShipment,
  useIssueInvoice,
  useIssueProjectInvoice,
  useMarkInvoicePaid,
  useMarkInvoiceSent,
} from './invoices/api/queries';

export type {
  ProjectRecord,
  ProjectDetailRecord,
  ProjectTotals,
  ProjectFilters,
  CreateProjectPayload,
  UpdateProjectPayload,
} from './projects/api/projectsService';
export {
  projectQueryKeys,
  useCloseProject,
  useCreateProject,
  useProject,
  useProjects,
  useUpdateProject,
} from './projects/api/queries';

export {
  COMMISSION_SOURCE_LABEL,
  cargoLabel,
  commissionOf,
  describeCommission,
  documentStateOf,
  resolveCommission,
  type BillingState,
  type CommissionDeal,
  type CommissionMode,
  type CommissionSource,
  type ResolvedCommission,
} from './model/commission';

export { CommissionFields, type CommissionValue } from './components/CommissionFields';

export type {
  CreateExpensePayload,
  CreateRecurringExpensePayload,
  ExpenseCategory,
  ExpenseFilters,
  ExpenseFrequency,
  ExpenseMethod,
  ExpenseRecord,
  ExpenseStatus,
  RecurringExpenseRecord,
  UpdateExpensePayload,
  UpdateRecurringExpensePayload,
} from './expenses/api/expensesService';
export { fetchExpenseReceipt, openExpenseReceipt } from './expenses/api/expensesService';
export {
  expenseQueryKeys,
  useApproveExpense,
  useCreateExpense,
  useCreateRecurringExpense,
  useDeleteRecurringExpense,
  useExpense,
  useExpenses,
  usePayExpense,
  usePostRecurringExpense,
  useRecurringExpenses,
  useRejectExpense,
  useUpdateExpense,
  useUpdateRecurringExpense,
  useWithdrawExpense,
} from './expenses/api/queries';
