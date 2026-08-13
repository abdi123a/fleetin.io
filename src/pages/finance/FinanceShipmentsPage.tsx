import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { ROUTES } from '@/config/routes';
import { ChevronRight, Coins, Container, Hourglass, Truck } from '@/design-system/icons';
import { compactDjf, pct } from '@/lib/finance';
import type { OriginationChannel } from '@/types/finance';
import { CHANNEL_META, ChannelTabs } from './components/ChannelTabs';
import {
  Avatar,
  Bar,
  DataTable,
  EmptyState,
  FilterPills,
  MoneyAmount,
  PageHead,
  Panel,
  Pill,
  RiskTag,
  StatCard,
  Td,
  Th,
  TileBadge,
} from './components/kit';
import { useFinanceModel, type ClientRow } from './model';

/**
 * The top of the shipment book: which clients have moved cargo, most recent
 * first, split by the channel the work came through.
 *
 * The preview on each client answers the three questions asked before opening
 * anything — how much have we moved for them, what is that worth, and how much
 * of it is still unpaid.
 */
/**
 * The orders a client list is actually read in.
 *
 * Each one answers a different question — who is busiest, who is worth most,
 * who owes us most, who takes longest to pay — so the caption changes with the
 * sort rather than claiming "most recent" whatever the order really is.
 */
const SORTS = {
  recent: {
    label: 'Recent',
    caption: 'Most recent shipment first',
    compare: (a: ClientRow, b: ClientRow) => b.lastShipmentAt.localeCompare(a.lastShipmentAt),
  },
  shipments: {
    label: 'Shipments',
    caption: 'Most shipments moved first',
    compare: (a: ClientRow, b: ClientRow) => b.shipmentCount - a.shipmentCount,
  },
  value: {
    label: 'Value',
    caption: 'Highest billed value first',
    compare: (a: ClientRow, b: ClientRow) => b.money.revenueDjf - a.money.revenueDjf,
  },
  unpaid: {
    label: 'Unpaid',
    caption: 'Most money still owed to us first',
    compare: (a: ClientRow, b: ClientRow) => b.money.outstandingDjf - a.money.outstandingDjf,
  },
  late: {
    label: 'Late',
    caption: 'Most overdue money first',
    compare: (a: ClientRow, b: ClientRow) => b.money.overdueDjf - a.money.overdueDjf,
  },
  slowest: {
    label: 'Slowest payer',
    caption: 'Longest average time to settle first',
    // A client with no settled history has no DSO — it sorts last rather than
    // being treated as if it pays instantly.
    compare: (a: ClientRow, b: ClientRow) => (b.dso ?? -1) - (a.dso ?? -1),
  },
} as const;

type SortKey = keyof typeof SORTS;
const SORT_KEYS = Object.keys(SORTS) as SortKey[];

export function FinanceShipmentsPage() {
  const model = useFinanceModel();
  const [params] = useSearchParams();
  const [sort, setSort] = useState<SortKey>('recent');

  const channel: OriginationChannel = params.get('channel') === 'dpcs' ? 'dpcs' : 'fleetin_direct';
  const meta = CHANNEL_META[channel];

  const rows = model.clientRows.filter((row) => row.channel === channel);
  const counts: Record<OriginationChannel, number> = {
    fleetin_direct: model.clientRows.filter((row) => row.channel === 'fleetin_direct').length,
    dpcs: model.clientRows.filter((row) => row.channel === 'dpcs').length,
  };

  const shipments = rows.reduce((sum, row) => sum + row.shipmentCount, 0);
  const revenue = rows.reduce((sum, row) => sum + row.money.revenueDjf, 0);
  const unpaid = rows.reduce((sum, row) => sum + row.money.outstandingDjf, 0);
  const owedOut = rows.reduce(
    (sum, row) => sum + row.money.payableDjf + row.money.frozenDjf + row.money.pipelineDjf,
    0,
  );

  const sorted = useMemo(() => [...rows].sort(SORTS[sort].compare), [rows, sort]);

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-4 pb-8 pt-1 sm:px-6">
      <PageHead
        title="Shipments"
        subtitle={meta.blurb}
        actions={<ChannelTabs active={channel} counts={counts} />}
      />

      {/* The brand tile row. Solid fills rather than outlined cards, because
          this is the page's headline — the detail below it is where the
          semantic frames (held, overdue) do their work. */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Container}
          fill="teal"
          label="Shipments"
          value={`${shipments}`}
          hint={`Across ${rows.length} client${rows.length === 1 ? '' : 's'}`}
          badge={<TileBadge fill="teal">{rows.length} clients</TileBadge>}
        />
        <StatCard
          icon={Coins}
          fill="sky"
          label="Project value"
          value={compactDjf(revenue)}
          hint="Billed on priced shipments"
          badge={<TileBadge fill="sky">Money in</TileBadge>}
        />
        <StatCard
          icon={Hourglass}
          fill="peach"
          label="Unpaid by clients"
          value={compactDjf(unpaid)}
          hint="Invoiced, not yet settled"
          badge={<TileBadge fill="peach">Owed to us</TileBadge>}
        />
        <StatCard
          icon={Truck}
          fill="pink"
          label="Owed to transporters"
          value={compactDjf(owedOut)}
          hint="Every unpaid leg on the book"
          badge={<TileBadge fill="pink">Money out</TileBadge>}
        />
      </div>

      <Panel
        title="Clients"
        subtitle={SORTS[sort].caption}
        padded={false}
        action={<Pill tone="neutral">{rows.length} on this channel</Pill>}
      >
        {/* Sort, not filter: nothing leaves the list, it only reorders — so an
            operator can ask "who owes most" without losing sight of the rest. */}
        <div className="flex flex-wrap items-center gap-3 px-5 pb-4">
          <span className="text-xs font-extrabold uppercase tracking-[0.06em] text-muted-foreground">
            Sort by
          </span>
          <FilterPills
            options={SORT_KEYS.map((key) => ({ key, label: SORTS[key].label }))}
            active={sort}
            onChange={setSort}
          />
        </div>

        {sorted.length > 0 ? (
          <DataTable minWidth={980}>
            <thead>
              <tr>
                <Th>Client</Th>
                <Th align="right">Shipments</Th>
                <Th align="right">Project value</Th>
                <Th align="right">Unpaid</Th>
                <Th>Collected</Th>
                <Th align="right">Owed out</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <ClientRowView key={`${row.client.id}-${row.channel}`} row={row} />
              ))}
            </tbody>
          </DataTable>
        ) : (
          <EmptyState message={`Nothing has been booked through ${meta.label}.`} />
        )}
      </Panel>
    </div>
  );
}

/**
 * One client, one row.
 *
 * A list rather than a card grid: these are read by comparison — who owes the
 * most, who is slowest, who has money frozen — and a column of figures compares
 * in a way a grid of cards never does.
 */
function ClientRowView({ row }: { row: ClientRow }) {
  const navigate = useNavigate();
  const { money } = row;
  const collected = money.revenueDjf > 0 ? money.collectedDjf / money.revenueDjf : 0;
  const href = `${ROUTES.financeShipments}/client/${row.client.id}?channel=${row.channel}`;
  const owedOut = money.payableDjf + money.frozenDjf + money.pipelineDjf;

  return (
    <tr
      onClick={() => navigate(href)}
      className="group cursor-pointer transition-colors hover:bg-surface-sunken/60"
    >
      <Td>
        {/* A real link inside the row, so keyboard and middle-click both work
            even though the whole row is clickable. */}
        <Link
          to={href}
          onClick={(event) => event.stopPropagation()}
          className="flex min-w-0 items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Avatar name={row.client.name} logoUrl={row.client.logoUrl} size={40} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-extrabold text-foreground">
              {row.client.name}
            </span>
            <span className="mt-0.5 block truncate text-xs font-semibold text-muted-foreground">
              {row.projects.length} project{row.projects.length === 1 ? '' : 's'} · last{' '}
              {new Date(row.lastShipmentAt).toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'short',
              })}
            </span>
          </span>
        </Link>
      </Td>

      <Td align="right">
        <span className="font-mono text-sm font-bold tabular-nums text-foreground">
          {row.shipmentCount}
        </span>
        <span className="mt-0.5 block text-xs font-semibold text-muted-foreground">
          {row.bookingCount} bookings
        </span>
        {money.unpricedCount > 0 ? (
          <span className="mt-0.5 block text-xs font-bold text-accent-subtle-foreground">
            {money.unpricedCount} unpriced
          </span>
        ) : null}
      </Td>

      <Td align="right">
        <MoneyAmount value={money.revenueDjf} direction="in" unit={false} className="text-sm" />
      </Td>

      <Td align="right">
        <span className="font-mono text-sm font-bold tabular-nums text-foreground">
          {compactDjf(money.outstandingDjf)}
        </span>
        {money.overdueDjf > 0 ? (
          <span className="mt-0.5 block text-xs font-bold text-destructive-subtle-foreground">
            {compactDjf(money.overdueDjf)} late
          </span>
        ) : (
          <span className="mt-0.5 block text-xs font-semibold text-muted-foreground">on time</span>
        )}
      </Td>

      <Td className="w-44">
        <Bar value={collected} tone="teal" />
        <span className="mt-1.5 block whitespace-nowrap text-xs font-semibold text-muted-foreground">
          {pct(collected)} collected
          {row.dso !== null ? ` · pays in ${row.dso.toFixed(0)}d` : ''}
        </span>
      </Td>

      <Td align="right">
        <MoneyAmount value={owedOut} direction="out" unit={false} className="text-sm" />
        {money.frozenDjf > 0 ? (
          <span className="mt-0.5 block text-xs font-bold text-warning-subtle-foreground">
            {compactDjf(money.frozenDjf)} frozen
          </span>
        ) : null}
      </Td>

      <Td align="right">
        <span className="flex items-center justify-end gap-2">
          {row.sources.map((source) => (
            <RiskTag key={source.id} bearer={source.riskBearer} />
          ))}
          <ChevronRight
            aria-hidden
            className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
          />
        </span>
      </Td>
    </tr>
  );
}

export default FinanceShipmentsPage;
