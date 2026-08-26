import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { ROUTES, buildPath } from '@/config/routes';
import { ArrowLeft, CalendarDays, ChevronRight, FolderOpen, Plus, Receipt } from '@/design-system/icons';
import { compactDjf, fmtDjf, pct } from '@/lib/finance';
import { useShipper } from '@/features/shippers/api/queries';
import { useShipmentsRaw } from '@/features/shipments/api/queries';
import type { ShipmentRecord } from '@/features/shipments/api/shipmentsService';
import {
  useCreateProject,
  useInvoices,
  useIssueMonthlyStatement,
  usePaymentOrders,
  useProjects,
  type InvoiceRecord,
  type PaymentOrderRecord,
  type ProjectRecord,
} from '@/features/finance';
import { cn } from '@/utils';

import { ContractRemindersPanel } from './components/ContractReminders';
import { AddProjectDialog } from './components/dialogs';
import { FinancedExposureCard, MoneyBreakdown } from './components/MoneyBreakdown';
import { ShipmentsTable } from './components/ShipmentsTable';
import { ActionButton, EmptyState, FilterPills, IconChip, PageHead, Panel, Pill } from './components/kit';
import { aggregateMoneyPosition, type MoneyPosition } from './shipmentFinance';
import { contractDaysRemaining, projectDaysRunning } from './projectFinance';

type Tab = 'projects' | 'direct';

/**
 * One client: their projects and one-off shipments, and the money across
 * all of them. A shipper is one real entity regardless of origination
 * channel, so — unlike the mock, which duplicated a client into two rows
 * per channel — this page shows everything for the shipper together;
 * channel shows up per-shipment instead of splitting the client in two.
 */
export function FinanceClientPage() {
  const { clientId = '' } = useParams();
  const { data: shipper, isLoading: shipperLoading } = useShipper(clientId);
  const { data: shipmentsData, isLoading: shipmentsLoading } = useShipmentsRaw({ customerId: clientId, limit: 200 });
  const { data: projects = [] } = useProjects({ shipperId: clientId });
  const { data: invoicesData } = useInvoices({ shipperId: clientId, limit: 200 }, { enabled: Boolean(clientId) });
  const { data: paidOrdersData } = usePaymentOrders({ status: 'Paid', limit: 500 });
  const createProject = useCreateProject();

  const [addProjectOpen, setAddProjectOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('projects');

  const shipments = useMemo(() => shipmentsData?.items ?? [], [shipmentsData]);
  const invoices = useMemo(() => invoicesData?.items ?? [], [invoicesData]);
  const paidOrders = useMemo(() => paidOrdersData?.items ?? [], [paidOrdersData]);

  const directShipments = useMemo(() => shipments.filter((s) => !s.projectId), [shipments]);
  const shipmentsByProject = useMemo(() => {
    const map = new Map<string, ShipmentRecord[]>();
    for (const shipment of shipments) {
      if (!shipment.projectId) continue;
      const list = map.get(shipment.projectId) ?? [];
      list.push(shipment);
      map.set(shipment.projectId, list);
    }
    return map;
  }, [shipments]);

  const money = useMemo(() => aggregateMoneyPosition(shipments, invoices, paidOrders), [shipments, invoices, paidOrders]);

  if (shipperLoading || shipmentsLoading) {
    return (
      <div className="mx-auto w-full max-w-[1600px] px-4 pt-6 sm:px-6">
        <Panel title="Loading…">
          <EmptyState message="Loading shipper…" />
        </Panel>
      </div>
    );
  }

  if (!shipper) {
    return (
      <div className="mx-auto w-full max-w-[1600px] px-4 pt-6 sm:px-6">
        <Panel title="Shipper not found">
          <EmptyState message="No shipper with that reference." />
        </Panel>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-4 pb-6 pt-1 sm:px-6">
      <Link to={ROUTES.financeShipments} className="w-fit">
        <ActionButton variant="quiet" icon={ArrowLeft}>
          All clients
        </ActionButton>
      </Link>

      <PageHead
        title={shipper.companyLegalName}
        subtitle={`${projects.length} project${projects.length === 1 ? '' : 's'}${
          directShipments.length > 0 ? ` · ${directShipments.length} one-off` : ''
        } · ${shipments.length} shipments`}
      />

      <MonthlyStatementCard shipperId={clientId} shipments={shipments} invoices={invoices} />

      <MoneyBreakdown money={money} />

      <FinancedExposureCard money={money} />

      <ContractRemindersPanel shipperId={clientId} />

      <Panel
        title="Projects & Shipments"
        subtitle="Grouped by contract, or booked individually"
        padded={false}
        dense
        action={
          <div className="flex flex-wrap items-center gap-2">
            <FilterPills
              options={[
                { key: 'projects' as Tab, label: 'Projects', count: projects.length },
                { key: 'direct' as Tab, label: 'Individual shipments', count: directShipments.length },
              ]}
              active={tab}
              onChange={setTab}
            />
            {tab === 'projects' ? (
              <ActionButton variant="ghost" icon={Plus} onClick={() => setAddProjectOpen(true)}>
                Add project
              </ActionButton>
            ) : null}
          </div>
        }
      >
        {tab === 'projects' ? (
          <div className="flex flex-col gap-2 px-4 pb-4">
            {projects.length > 0 ? (
              projects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  shipments={shipmentsByProject.get(project.id) ?? []}
                  invoices={invoices}
                  paidOrders={paidOrders}
                />
              ))
            ) : (
              <EmptyState message="No projects yet." />
            )}
          </div>
        ) : (
          <ShipmentsTable shipments={directShipments} invoices={invoices} emptyMessage="No one-off shipments for this client." />
        )}
      </Panel>

      <AddProjectDialog
        open={addProjectOpen}
        onClose={() => setAddProjectOpen(false)}
        clientName={shipper.companyLegalName}
        onCreate={(input) => createProject.mutate({ shipperId: clientId, ...input })}
      />
    </div>
  );
}

/**
 * This month's bill, and the point of the whole arrangement.
 *
 * Fleetin funds the month: transporters are paid as shipments are released,
 * out of Fleetin's own money, all month long. The client pays once, at the
 * end of the month, against one statement listing every shipment and its
 * total. So this card answers two questions — how much has run up so far,
 * and has the statement been issued — and nothing else.
 *
 * The running total is deliberately not framed as a debt going bad or a limit
 * being approached. Nothing about a large number here stops the client
 * shipping tomorrow.
 */
function MonthlyStatementCard({
  shipperId,
  shipments,
  invoices,
}: {
  shipperId: string;
  shipments: ShipmentRecord[];
  invoices: InvoiceRecord[];
}) {
  const issueStatement = useIssueMonthlyStatement();

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1; // 1-based, the way the API takes it
  const periodStart = new Date(Date.UTC(year, month - 1, 1));
  const periodEnd = new Date(Date.UTC(year, month, 1));
  const monthLabel = periodStart.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  const thisMonth = shipments.filter((s) => {
    const at = new Date(s.scheduledPickupTime).getTime();
    return at >= periodStart.getTime() && at < periodEnd.getTime() && !['Cancelled', 'Failed'].includes(s.status);
  });
  const runningTotal = thisMonth.reduce((sum, s) => sum + (s.clientRateMinorUnits ? Number(s.clientRateMinorUnits) : 0), 0);
  const unpriced = thisMonth.filter((s) => s.clientRateMinorUnits == null).length;

  const existing = invoices.find(
    (inv) => inv.periodStart != null && new Date(inv.periodStart).getTime() === periodStart.getTime() && inv.projectId == null,
  );

  return (
    <div className="rounded-card border border-border bg-card p-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-muted-foreground">
            {monthLabel} — running total
          </p>
          <p className="mt-1 font-mono text-2xl font-black tabular-nums text-foreground">{fmtDjf(runningTotal)}</p>
          <p className="mt-1 text-xs font-semibold text-muted-foreground">
            {thisMonth.length} shipment{thisMonth.length === 1 ? '' : 's'} so far · Fleetin is funding these until month end
            {unpriced > 0 ? ` · ${unpriced} not yet priced, so not on the bill` : ''}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          {existing ? (
            <>
              <Pill tone={existing.status === 'Paid' ? 'teal' : 'neutral'}>
                {existing.number} · {existing.status}
              </Pill>
              <Link to={buildPath(ROUTES.financeInvoiceDetail, { invoiceId: existing.id })}>
                <ActionButton variant="ghost">Open statement</ActionButton>
              </Link>
            </>
          ) : (
            <ActionButton
              variant="primary"
              icon={Receipt}
              disabled={issueStatement.isPending}
              onClick={() => issueStatement.mutate({ shipperId, year, month })}
            >
              {issueStatement.isPending ? 'Issuing…' : `Issue ${monthLabel} statement`}
            </ActionButton>
          )}
        </div>
      </div>
    </div>
  );
}

/** One project, thin — identity + status on one line, the figures the desk actually asks about beneath it. */
function ProjectCard({
  project,
  shipments,
  invoices,
  paidOrders,
}: {
  project: ProjectRecord;
  shipments: ShipmentRecord[];
  invoices: InvoiceRecord[];
  paidOrders: PaymentOrderRecord[];
}) {
  const nowMs = Date.now();
  const money: MoneyPosition = aggregateMoneyPosition(shipments, invoices, paidOrders);
  const collected = money.revenueDjf > 0 ? money.collectedDjf / money.revenueDjf : 0;
  const owedOut = money.payableDjf + money.frozenDjf + money.pipelineDjf;
  const daysRunning = Math.round(projectDaysRunning(project, nowMs));
  const daysLeft = contractDaysRemaining(project, nowMs);
  const contractOverdue = daysLeft !== null && daysLeft < 0;

  return (
    <Link
      to={buildPath(ROUTES.financeShipmentProject, { projectId: project.id })}
      className="group flex flex-col gap-2 rounded-card border border-border bg-card px-4 py-3 shadow-card transition-colors hover:border-border-strong hover:bg-surface-sunken/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-center gap-3">
        <IconChip icon={FolderOpen} tint="teal" size={36} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-extrabold text-foreground">{project.name}</p>
          <p className="mt-0.5 truncate text-xs font-semibold text-muted-foreground">
            <span className="font-mono">{project.reference}</span>
            {` · running ${daysRunning}d · ${shipments.length} shipment${shipments.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {money.unpricedCount > 0 ? <Pill tone="orange">{money.unpricedCount} unpriced</Pill> : null}
          {money.overdueDjf > 0 ? <Pill tone="red">Late</Pill> : null}
          {daysLeft !== null ? (
            <Pill tone={contractOverdue ? 'red' : daysLeft <= 30 ? 'amber' : 'neutral'} icon={CalendarDays}>
              {contractOverdue ? `Contract ended ${Math.abs(Math.round(daysLeft))}d ago` : `Contract ends in ${Math.round(daysLeft)}d`}
            </Pill>
          ) : null}
          <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </div>
      </div>

      <div className="flex items-stretch gap-4 pl-[calc(2.25rem+0.75rem)]">
        <Stat label="Recovered" value={`${pct(collected)} of ${compactDjf(money.revenueDjf)}`} alarm={money.overdueDjf > 0} />
        <Divider />
        <Stat label="Payables" value={owedOut > 0 ? compactDjf(owedOut) : 'Fully settled'} />
      </div>
    </Link>
  );
}

function Divider() {
  return <span aria-hidden className="w-px shrink-0 self-stretch bg-border-subtle" />;
}

function Stat({ label, value, alarm }: { label: string; value: string; alarm?: boolean }) {
  return (
    <span className="flex flex-col justify-center gap-0.5">
      <span className="text-[10px] font-extrabold uppercase tracking-[0.06em] text-muted-foreground">{label}</span>
      <span className={cn('whitespace-nowrap font-mono text-xs font-bold tabular-nums text-foreground', alarm && 'text-destructive-subtle-foreground')}>
        {value}
      </span>
    </span>
  );
}

export default FinanceClientPage;
