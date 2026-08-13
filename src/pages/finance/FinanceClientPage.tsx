import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import { ROUTES } from '@/config/routes';
import { ArrowLeft, ChevronRight, Container, FolderOpen, Plus } from '@/design-system/icons';
import { compactDjf, pct } from '@/lib/finance';
import { useFinanceStore } from '@/stores/finance.store';
import type { OriginationChannel } from '@/types/finance';
import { cn } from '@/utils';

import { ChannelBadge } from './components/ChannelTabs';
import { ContractRemindersPanel } from './components/ContractReminders';
import { AddProjectDialog } from './components/dialogs';
import { MoneyBreakdown } from './components/MoneyBreakdown';
import { ShipmentsTable } from './components/ShipmentsTable';
import {
  ActionButton,
  Avatar,
  Bar,
  EmptyState,
  IconChip,
  PageHead,
  Panel,
  Pill,
  RiskTag,
} from './components/kit';
import { useFinanceModel, type ProjectRow } from './model';

/**
 * One client on one channel: their projects, and the money across all of them.
 *
 * A client can run several projects at once on different contracts, so the
 * money summary at the top is the sum of what is below it — never a separately
 * kept figure that could drift from the projects it claims to total.
 */
export function FinanceClientPage() {
  const model = useFinanceModel();
  const addProject = useFinanceStore((state) => state.addProject);
  const { clientId = '' } = useParams();
  const [params] = useSearchParams();
  const channel: OriginationChannel = params.get('channel') === 'dpcs' ? 'dpcs' : 'fleetin_direct';
  const [addProjectOpen, setAddProjectOpen] = useState(false);

  const row = model.clientRows.find(
    (entry) => entry.client.id === clientId && entry.channel === channel,
  );

  if (!row) {
    return (
      <div className="mx-auto w-full max-w-[1600px] px-4 pt-6 sm:px-6">
        <Panel title="Client not found">
          <EmptyState message="No work for this client on this channel." />
        </Panel>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-4 pb-8 pt-1 sm:px-6">
      <Link to={`${ROUTES.financeShipments}?channel=${channel}`} className="w-fit">
        <ActionButton variant="quiet" icon={ArrowLeft}>
          All clients
        </ActionButton>
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar name={row.client.name} logoUrl={row.client.logoUrl} size={56} />
          <div className="min-w-0">
            <PageHead
              title={row.client.name}
              subtitle={`${row.projects.length} project${row.projects.length === 1 ? '' : 's'}${
                row.directShipments.length > 0 ? ` · ${row.directShipments.length} one-off` : ''
              } · ${row.shipmentCount} shipments · ${row.bookingCount} bookings · ${row.client.paymentTermsDays}-day terms${
                row.dso !== null ? ` · pays in ${row.dso.toFixed(0)}d` : ''
              }`}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ChannelBadge channel={channel} />
          {row.sources.map((source) => (
            <RiskTag key={source.id} bearer={source.riskBearer} />
          ))}
        </div>
      </div>

      <MoneyBreakdown money={row.money} />

      <ContractRemindersPanel clientId={row.client.id} />

      <Panel
        title="Projects"
        subtitle="Each project groups the shipments booked under one agreement"
        padded={false}
        action={
          <div className="flex items-center gap-2">
            {row.projects.length > 0 ? <Pill tone="neutral">{row.projects.length}</Pill> : null}
            <ActionButton variant="ghost" icon={Plus} onClick={() => setAddProjectOpen(true)}>
              Add project
            </ActionButton>
          </div>
        }
      >
        <div className="flex flex-col gap-3 px-5 pb-5">
          {row.projects.length > 0 ? (
            row.projects.map((project) => <ProjectCard key={project.project.id} row={project} />)
          ) : (
            <EmptyState message="No projects yet for this client — add one to start tracking a contract." />
          )}
        </div>
      </Panel>

      {/*
        One-off lifts. Not every shipment is project work — a client rings up
        for a single container and it never becomes a programme — so these sit
        beside the projects rather than being hidden or forced into a fake one.
      */}
      {row.directShipments.length > 0 ? (
        <Panel
          title="Individual shipments"
          subtitle="Booked outside any project — billed, funded and chased the same way"
          padded={false}
          action={<Pill tone="neutral">{row.directShipments.length} one-off</Pill>}
        >
          <ShipmentsTable
            rows={row.directShipments}
            marginFloorPct={model.settings.marginFloorPct}
            emptyMessage="No one-off shipments for this client."
          />
        </Panel>
      ) : null}

      <AddProjectDialog
        open={addProjectOpen}
        onClose={() => setAddProjectOpen(false)}
        clientName={row.client.name}
        sources={model.sources.filter(
          (source) => source.clientId === row.client.id || source.clientId === undefined,
        )}
        onCreate={(input) =>
          addProject({
            clientId: row.client.id,
            channel,
            ...input,
          })
        }
      />
    </div>
  );
}

function ProjectCard({ row }: { row: ProjectRow }) {
  const { money, project } = row;
  const collected = money.revenueDjf > 0 ? money.collectedDjf / money.revenueDjf : 0;

  return (
    <Link
      to={`${ROUTES.financeShipments}/project/${project.id}`}
      className="group rounded-card border border-border bg-card p-5 shadow-card transition-colors hover:border-border-strong hover:bg-surface-sunken/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <IconChip icon={FolderOpen} tint="teal" />
          <div className="min-w-0">
            <p className="truncate text-base font-extrabold text-foreground">{project.name}</p>
            <p className="mt-0.5 truncate text-xs font-semibold text-muted-foreground">
              <span className="font-mono">{project.reference}</span>
              {project.scope ? ` · ${project.scope}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {money.unpricedCount > 0 ? (
            <Pill tone="orange">{money.unpricedCount} unpriced</Pill>
          ) : null}
          {money.frozenDjf > 0 ? <Pill tone="amber">Held</Pill> : null}
          {money.overdueDjf > 0 ? <Pill tone="red">Late</Pill> : null}
          <ChevronRight
            aria-hidden
            className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Figure
          label="Shipments"
          value={`${row.shipmentCount}`}
          icon
          note={`${row.bookingCount} bookings · ${row.settled} settled`}
        />
        <Figure label="Billed" value={compactDjf(money.revenueDjf)} tone="in" />
        <Figure
          label="Unpaid"
          value={compactDjf(money.outstandingDjf)}
          tone={money.overdueDjf > 0 ? 'alarm' : 'plain'}
          note={money.overdueDjf > 0 ? `${compactDjf(money.overdueDjf)} late` : undefined}
        />
        <Figure
          label="Margin"
          value={money.marginPct !== null ? pct(money.marginPct, 1) : '—'}
          tone={
            money.marginPct === null ? 'plain' : money.marginPct < 0 ? 'alarm' : 'plain'
          }
          note={money.grossDjf !== null ? compactDjf(money.grossDjf) : 'unpriced'}
        />
      </div>

      <div className="mt-4">
        <Bar value={collected} tone="teal" />
        <p className="mt-1.5 text-xs font-semibold text-muted-foreground">
          {pct(collected)} collected · {compactDjf(money.payableDjf + money.frozenDjf + money.pipelineDjf)}{' '}
          still owed to transporters
        </p>
      </div>
    </Link>
  );
}

function Figure({
  label,
  value,
  note,
  tone = 'plain',
  icon,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: 'plain' | 'in' | 'alarm';
  icon?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-card-nested bg-surface-sunken px-3.5 py-3">
      <p className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase leading-tight tracking-[0.06em] text-muted-foreground">
        {icon ? <Container aria-hidden className="size-3.5 shrink-0" /> : null}
        {label}
      </p>
      {/* Figures step down a size on narrow screens rather than being cut —
          "1.69M DJF" clipped to "1.69M D" is worse than smaller type. */}
      <p
        className={cn(
          'mt-1.5 whitespace-nowrap font-mono text-base font-extrabold tabular-nums sm:text-lg',
          tone === 'in'
            ? 'text-primary-subtle-foreground'
            : tone === 'alarm'
              ? 'text-destructive-subtle-foreground'
              : 'text-foreground',
        )}
      >
        {value}
      </p>
      {note ? (
        <p
          className={cn(
            'mt-0.5 text-[11px] font-bold leading-snug',
            tone === 'alarm' ? 'text-destructive-subtle-foreground' : 'text-muted-foreground',
          )}
        >
          {note}
        </p>
      ) : null}
    </div>
  );
}

export default FinanceClientPage;
