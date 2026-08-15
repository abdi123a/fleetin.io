import { Link, useParams } from 'react-router-dom';

import { ROUTES, buildPath } from '@/config/routes';
import { ArrowLeft } from '@/design-system/icons';
import { useShipper } from '@/features/shippers/api/queries';
import { useInvoices, usePaymentOrders, useProject, type ProjectRecord } from '@/features/finance';
import { fmtDjf } from '@/lib/finance';
import { cn } from '@/utils';

import { ChannelBadge, type OriginationChannel } from './components/ChannelTabs';
import { ContractRemindersPanel } from './components/ContractReminders';
import { FinancedExposureCard, MoneyBreakdown } from './components/MoneyBreakdown';
import { ShipmentsTable } from './components/ShipmentsTable';
import { ActionButton, Avatar, EmptyState, PageHead, Panel, Pill } from './components/kit';
import { aggregateMoneyPosition } from './shipmentFinance';
import { contractDaysRemaining, projectDaysRunning } from './projectFinance';

/**
 * Everything about one project's money, then the shipments that produced it.
 *
 * No per-shipment funding-source assignment exists in the real model (the
 * mock's `riskBearer`/ceiling/cost-of-capital framing was flagged as an
 * undecided business question and never built) — this page reads the real
 * `Project.shipments` directly and rolls their money up via
 * `aggregateMoneyPosition`, without a "how this project is funded" panel.
 */
export function FinanceProjectPage() {
  const { projectId = '' } = useParams();
  const { data: project, isLoading } = useProject(projectId);
  const { data: shipper } = useShipper(project?.shipperId);
  const { data: invoicesData } = useInvoices({ shipperId: project?.shipperId, limit: 200 }, { enabled: Boolean(project?.shipperId) });
  const { data: paidOrdersData } = usePaymentOrders({ status: 'Paid', limit: 500 });

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-[1600px] px-4 pt-6 sm:px-6">
        <Panel title="Loading…">
          <EmptyState message="Fetching this project." />
        </Panel>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="mx-auto w-full max-w-[1600px] px-4 pt-6 sm:px-6">
        <Panel title="Project not found">
          <EmptyState message="No project with that reference." />
        </Panel>
      </div>
    );
  }

  const invoices = invoicesData?.items ?? [];
  const paidOrders = paidOrdersData?.items ?? [];
  const money = aggregateMoneyPosition(project.shipments, invoices, paidOrders);
  const settled = project.shipments.filter((s) => invoices.find((inv) => inv.missionIds.includes(s.id))?.status === 'Paid').length;
  const daysRunning = Math.round(projectDaysRunning(project, Date.now()));
  const daysLeft = contractDaysRemaining(project, Date.now());
  const contractOverdue = daysLeft !== null && daysLeft < 0;
  const clientName = shipper?.companyLegalName ?? 'the client';
  const bookingCount = project.shipments.length; // shipment-level rollup — booking counts require a per-shipment fetch

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-4 pb-6 pt-1 sm:px-6">
      <Link to={buildPath(ROUTES.financeShipmentClient, { clientId: project.shipperId })} className="w-fit">
        <ActionButton variant="quiet" icon={ArrowLeft}>
          {clientName}
        </ActionButton>
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHead title={project.name} badge={<Pill tone={project.status === 'active' ? 'teal' : 'neutral'}>{project.status}</Pill>} />
        {project.shipments[0] ? <ChannelBadge channel={project.shipments[0].source as OriginationChannel} /> : null}
      </div>

      {/* Identity + timing */}
      <div className="grid gap-3 rounded-card border border-border bg-card p-4 shadow-card sm:grid-cols-2 lg:grid-cols-4">
        <Meta label="Project ref" value={project.reference} mono />
        <Meta label="Client" value={clientName} avatar={shipper?.logoUrl} />
        <Meta label="Started" value={`${fmtShortDate(project.startedAt)} · running ${daysRunning}d`} />
        <Meta
          label="Contract ends"
          value={
            project.contractEndAt == null
              ? 'No end date — open-ended'
              : contractOverdue
                ? `Ended ${Math.abs(Math.round(daysLeft ?? 0))}d ago`
                : `${fmtShortDate(project.contractEndAt)} · ${Math.round(daysLeft ?? 0)}d left`
          }
          alarm={contractOverdue}
        />
        <Meta label="Shipments" value={`${project.shipments.length} · ${settled} settled`} />
        <Meta label="Cost committed" value={`${bookingCount} shipment${bookingCount === 1 ? '' : 's'}`} />
      </div>

      <MonthEstimateCard project={project} actualDjf={money.revenueDjf} />

      <MoneyBreakdown money={money} />

      <FinancedExposureCard money={money} />

      <ContractRemindersPanel projectId={project.id} />

      <Panel title="Shipments" subtitle="One consignment — its bookings are released, billed and settled together" padded={false} dense>
        <ShipmentsTable shipments={project.shipments} invoices={invoices} />
      </Panel>
    </div>
  );
}

/**
 * Estimate against what actually shipped.
 *
 * The one thing this card must never do is read like a budget bar running out
 * of room. The estimate is what the client guessed at the start of the month;
 * the actual is what they ran. Going past it is ordinary and carries no
 * consequence — no shipment is refused, delayed or flagged for it — so the
 * over case is stated in plain words and the same neutral hue as the under
 * case, with no warning colour and no progress track to "fill up".
 */
function MonthEstimateCard({ project, actualDjf }: { project: ProjectRecord; actualDjf: number }) {
  if (project.monthlyEstimateMinorUnits == null) return null;

  const estimateDjf = Number(project.monthlyEstimateMinorUnits);
  const overBy = actualDjf - estimateDjf;
  const pctOfEstimate = estimateDjf > 0 ? Math.round((actualDjf / estimateDjf) * 100) : null;

  return (
    <div className="rounded-card border border-border bg-card p-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-muted-foreground">
            Estimated for the month
          </p>
          <p className="mt-1 font-mono text-2xl font-black tabular-nums text-foreground">{fmtDjf(estimateDjf)}</p>
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-muted-foreground">
            Actually shipped
          </p>
          <p className="mt-1 font-mono text-2xl font-black tabular-nums text-foreground">{fmtDjf(actualDjf)}</p>
        </div>
        {pctOfEstimate !== null ? (
          <div className="min-w-0">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-muted-foreground">
              Of estimate
            </p>
            <p className="mt-1 font-mono text-2xl font-black tabular-nums text-foreground">{pctOfEstimate}%</p>
          </div>
        ) : null}
      </div>
      <p className="mt-3 max-w-[80ch] text-xs font-semibold leading-relaxed text-muted-foreground">
        {overBy > 0
          ? `Running ${fmtDjf(overBy)} above the estimate — expected, and not a problem. The estimate is a planning figure only: it never caps the project, and no shipment is held back for exceeding it.`
          : 'The estimate is a planning figure only. It never caps the project, and no shipment is held back for exceeding it.'}
      </p>
    </div>
  );
}

function fmtShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function Meta({ label, value, mono, avatar, alarm }: { label: string; value: string; mono?: boolean; avatar?: string; alarm?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[11px] font-extrabold uppercase tracking-[0.06em] text-muted-foreground">{label}</p>
      <p className={cn('mt-1 flex items-center gap-2 truncate text-sm font-bold text-foreground', mono && 'font-mono', alarm && 'text-destructive-subtle-foreground')}>
        {avatar !== undefined ? <Avatar name={value} logoUrl={avatar} size={20} /> : null}
        {value}
      </p>
    </div>
  );
}

export default FinanceProjectPage;
