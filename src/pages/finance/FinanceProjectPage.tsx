import { Link, useParams } from 'react-router-dom';

import { ROUTES } from '@/config/routes';
import { ArrowLeft, Landmark } from '@/design-system/icons';
import { compactDjf, pct } from '@/lib/finance';
import { cn } from '@/utils';

import { ChannelBadge } from './components/ChannelTabs';
import { ContractRemindersPanel } from './components/ContractReminders';
import { MoneyBreakdown } from './components/MoneyBreakdown';
import { ShipmentsTable } from './components/ShipmentsTable';
import {
  ActionButton,
  Avatar,
  EmptyState,
  IconChip,
  HeldChip,
  PageHead,
  Panel,
  Pill,
  RiskTag,
} from './components/kit';
import { useFinanceModel } from './model';

/**
 * Everything about one project's money, then the shipments that produced it.
 *
 * The shipment table is deliberately short-columned: the consignment, how many
 * of its bookings are proven, who carried them, where its payout stands, what
 * it cost and what it earned. Who gets paid what lives one level down, on the
 * shipment itself — that is where money moves.
 */
export function FinanceProjectPage() {
  const model = useFinanceModel();
  const { projectId = '' } = useParams();
  const row = model.projectById.get(projectId);

  if (!row) {
    return (
      <div className="mx-auto w-full max-w-[1600px] px-4 pt-6 sm:px-6">
        <Panel title="Project not found">
          <EmptyState message="No project with that reference." />
        </Panel>
      </div>
    );
  }

  const { project, money, source } = row;
  const position = source ? model.positions.get(source.id) : undefined;

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-4 pb-8 pt-1 sm:px-6">
      <Link
        to={`${ROUTES.financeShipments}/client/${project.clientId}?channel=${project.channel}`}
        className="w-fit"
      >
        <ActionButton variant="quiet" icon={ArrowLeft}>
          {row.client?.name ?? 'Client'}
        </ActionButton>
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHead
          title={project.name}
          subtitle={project.scope}
          badge={<Pill tone={project.status === 'active' ? 'teal' : 'neutral'}>{project.status}</Pill>}
        />
        <div className="flex flex-wrap items-center gap-2">
          <ChannelBadge channel={project.channel} />
          {source ? <RiskTag bearer={source.riskBearer} /> : null}
        </div>
      </div>

      {/* Project identity — the references everyone quotes */}
      <div className="grid gap-3 rounded-card border border-border bg-card p-5 shadow-card sm:grid-cols-2 xl:grid-cols-5">
        <Meta label="Project ref" value={project.reference} mono />
        <Meta label="Contract" value={project.contractRef ?? 'spot — no contract'} mono />
        <Meta
          label="Client"
          value={row.client?.name ?? project.clientId}
          avatar={row.client?.logoUrl}
        />
        <Meta
          label="Started"
          value={new Date(project.startedAt).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })}
        />
        <Meta label="Shipments" value={`${row.shipmentCount} · ${row.settled} settled`} />
        <Meta label="Bookings" value={`${row.bookingCount} containers`} />
      </div>

      <MoneyBreakdown money={money} />

      <ContractRemindersPanel projectId={project.id} />

      {/* Where this project's money is borrowed from */}
      {source && position ? (
        <Panel
          title="Funding"
          subtitle="The facility this project's payouts are drawn against"
          action={<RiskTag bearer={source.riskBearer} />}
        >
          <div className="flex flex-wrap items-center gap-6">
            <IconChip icon={Landmark} tint="neutral" />
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-foreground">{source.name}</p>
              <p className="mt-0.5 font-mono text-xs font-semibold text-muted-foreground">
                {source.id} · {source.bankName}
              </p>
            </div>
            <div className="ml-auto flex flex-wrap gap-6">
              <Meta label="Ceiling" value={compactDjf(source.ceilingDjf)} />
              <Meta label="Drawn" value={compactDjf(position.drawnDjf)} />
              <Meta label="Available" value={compactDjf(position.availableDjf)} />
              <Meta label="Utilisation" value={pct(position.utilisation)} />
              <Meta
                label="Cost of capital"
                value={`${(source.costOfCapitalRate * 100).toFixed(1)}%`}
              />
            </div>
          </div>
          {source.riskBearer === 'fleetin' ? (
            <p className="mt-4 rounded-card-nested border border-destructive/30 bg-destructive-subtle px-3.5 py-3 text-xs font-semibold text-destructive-subtle-foreground">
              Fleetin is the borrower here. If {row.client?.name ?? 'the client'} defaults, Fleetin
              still owes CAC the full amount.
            </p>
          ) : source.riskBearer === 'bank' ? (
            <p className="mt-4 rounded-card-nested border border-info/30 bg-info-subtle px-3.5 py-3 text-xs font-semibold text-info-subtle-foreground">
              The client is the borrower. A default is CAC's loss and CAC's collection — Fleetin
              tracks the balance only.
            </p>
          ) : (
            <p className="mt-4 rounded-card-nested border border-border bg-surface-sunken px-3.5 py-3 text-xs font-semibold text-muted-foreground">
              Risk on this allocation is undecided pending the DPCS question.
            </p>
          )}
        </Panel>
      ) : null}

      {/* The shipments, sliceable by what is on the trucks */}
      <Panel
        title="Shipments"
        subtitle="One consignment — its bookings are released, billed and settled together"
        padded={false}
      >
        <ShipmentsTable rows={row.shipments} marginFloorPct={model.settings.marginFloorPct} />
      </Panel>
    </div>
  );
}

function Meta({
  label,
  value,
  mono,
  avatar,
}: {
  label: string;
  value: string;
  mono?: boolean;
  avatar?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[11px] font-extrabold uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          'mt-1 flex items-center gap-2 truncate text-sm font-bold text-foreground',
          mono && 'font-mono',
        )}
      >
        {avatar !== undefined ? <Avatar name={value} logoUrl={avatar} size={20} /> : null}
        {value}
      </p>
    </div>
  );
}

/** Re-exported so the shipment page can show the same held marker. */
export { HeldChip };

export default FinanceProjectPage;
