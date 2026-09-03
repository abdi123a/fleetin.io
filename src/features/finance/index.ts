/**
 * Billing.
 *
 * Four things, and deliberately nothing else: a **project** groups a shipper's
 * shipments, a **proforma** quotes one shipment, an **invoice** bills it, and a
 * **commission percentage** says what Fleetin keeps out of the total.
 *
 * The working-capital module this replaced — ledgers, credit facilities,
 * drawdowns, payout orders, holds, bank movements, expenses, monthly
 * statements — was removed on 2026-09-03. If you are about to add a second
 * money concept here, that is the thing that was taken out.
 */

export type {
  CreateProformaPayload,
  DocumentKind,
  DocumentLine,
  InvoiceRecord,
  InvoiceFilters,
  ProformaLineInput,
} from './invoices/api/invoicesService';
export {
  invoiceQueryKeys,
  useCancelInvoice,
  useCreateProforma,
  useInvoice,
  useInvoices,
  useInvoicesForShipment,
  useIssueInvoice,
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
