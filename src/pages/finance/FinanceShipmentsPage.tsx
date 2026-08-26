import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { TablePager, usePagedRows } from '@/components';
import { ROUTES, buildPath } from '@/config/routes';
import { ChevronRight, Coins, Container, Hourglass, Truck } from '@/design-system/icons';
import { compactDjf, pct } from '@/lib/finance';
import { useShippers } from '@/features/shippers/api/queries';
import { useShipmentsRaw } from '@/features/shipments/api/queries';
import type { ShipmentRecord } from '@/features/shipments/api/shipmentsService';
import { useInvoices, usePaymentOrders } from '@/features/finance';
import type { ShipperRecord } from '@/types/shipper';
import { CHANNEL_META, ChannelTabs, type OriginationChannel } from './components/ChannelTabs';
import { Avatar, Bar, DataTable, EmptyState, FilterPills, MoneyAmount, PageHead, Panel, Pill, StatCard, Td, Th, TileBadge } from './components/kit';
import { aggregateMoneyPosition, type MoneyPosition } from './shipmentFinance';

interface ClientBookRow {
  shipper: ShipperRecord;
  shipments: ShipmentRecord[];
  money: MoneyPosition;
  lastShipmentAt: string;
}

const SORTS = {
  recent: { label: 'Recent', caption: 'Most recent shipment first', compare: (a: ClientBookRow, b: ClientBookRow) => b.lastShipmentAt.localeCompare(a.lastShipmentAt) },
  shipments: { label: 'Shipments', caption: 'Most shipments first', compare: (a: ClientBookRow, b: ClientBookRow) => b.shipments.length - a.shipments.length },
  value: { label: 'Billed', caption: 'Highest billed first', compare: (a: ClientBookRow, b: ClientBookRow) => b.money.revenueDjf - a.money.revenueDjf },
  unpaid: { label: 'Receivables', caption: 'Highest receivables first', compare: (a: ClientBookRow, b: ClientBookRow) => b.money.outstandingDjf - a.money.outstandingDjf },
  late: { label: 'Overdue', caption: 'Highest overdue first', compare: (a: ClientBookRow, b: ClientBookRow) => b.money.overdueDjf - a.money.overdueDjf },
} as const;

type SortKey = keyof typeof SORTS;
const SORT_KEYS = Object.keys(SORTS) as SortKey[];

/**
 * The top of the shipment book: which clients have moved cargo, split by
 * origination channel. Unlike the mock, a client is one row, not one row
 * per channel it happens to have work in — `source` is a real per-shipment
 * field now, but a shipper is still one real entity.
 */
export function FinanceShipmentsPage() {
  const [params] = useSearchParams();
  const [sort, setSort] = useState<SortKey>('recent');

  const channel: OriginationChannel = params.get('channel') === 'dpcs' ? 'dpcs' : 'custom';
  const meta = CHANNEL_META[channel];

  const { data: shippersData } = useShippers({ limit: 200 });
  const { data: shipmentsData } = useShipmentsRaw({ limit: 500 });
  const { data: invoicesData } = useInvoices({ limit: 500 });
  const { data: paidOrdersData } = usePaymentOrders({ status: 'Paid', limit: 500 });

  const shippers = useMemo(() => shippersData?.items ?? [], [shippersData]);
  const shipments = useMemo(() => shipmentsData?.items ?? [], [shipmentsData]);
  const invoices = useMemo(() => invoicesData?.items ?? [], [invoicesData]);
  const paidOrders = useMemo(() => paidOrdersData?.items ?? [], [paidOrdersData]);

  const counts: Record<OriginationChannel, number> = useMemo(() => {
    const bySource = { custom: new Set<string>(), dpcs: new Set<string>() };
    for (const shipment of shipments) {
      const key = shipment.source === 'dpcs' ? 'dpcs' : 'custom';
      bySource[key].add(shipment.shipperId);
    }
    return { custom: bySource.custom.size, dpcs: bySource.dpcs.size };
  }, [shipments]);

  const rows: ClientBookRow[] = useMemo(() => {
    const shipmentsByShipper = new Map<string, ShipmentRecord[]>();
    for (const shipment of shipments) {
      const shipmentChannel: OriginationChannel = shipment.source === 'dpcs' ? 'dpcs' : 'custom';
      if (shipmentChannel !== channel) continue;
      const list = shipmentsByShipper.get(shipment.shipperId) ?? [];
      list.push(shipment);
      shipmentsByShipper.set(shipment.shipperId, list);
    }

    const result: ClientBookRow[] = [];
    for (const shipper of shippers) {
      const list = shipmentsByShipper.get(shipper.id);
      if (!list || list.length === 0) continue;
      const shipperInvoices = invoices.filter((inv) => inv.shipperId === shipper.id);
      result.push({
        shipper,
        shipments: list,
        money: aggregateMoneyPosition(list, shipperInvoices, paidOrders),
        lastShipmentAt: list.reduce((latest, s) => (s.createdAt > latest ? s.createdAt : latest), ''),
      });
    }
    return result;
  }, [shippers, shipments, invoices, paidOrders, channel]);

  const totalShipments = rows.reduce((sum, row) => sum + row.shipments.length, 0);
  const revenue = rows.reduce((sum, row) => sum + row.money.revenueDjf, 0);
  const unpaid = rows.reduce((sum, row) => sum + row.money.outstandingDjf, 0);
  const owedOut = rows.reduce((sum, row) => sum + row.money.payableDjf + row.money.frozenDjf + row.money.pipelineDjf, 0);

  const sorted = useMemo(() => [...rows].sort(SORTS[sort].compare), [rows, sort]);

  /** One page of clients at a time — the book grows with every new shipper. */
  const [pageSize, setPageSize] = useState(25);
  const paged = usePagedRows(sorted, { pageSize, resetKey: `${channel}|${sort}` });

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-4 pb-8 pt-1 sm:px-6">
      <PageHead title="Shipments" subtitle={meta.blurb} actions={<ChannelTabs active={channel} counts={counts} />} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Container}
          fill="teal"
          label="Shipments"
          value={`${totalShipments}`}
          hint={`Across ${rows.length} shipper${rows.length === 1 ? '' : 's'}`}
          badge={<TileBadge fill="teal">{rows.length} shippers</TileBadge>}
        />
        <StatCard icon={Coins} fill="sky" label="Billed" value={compactDjf(revenue)} hint="Priced shipments only" badge={<TileBadge fill="sky">Credit</TileBadge>} />
        <StatCard icon={Hourglass} fill="peach" label="Receivables" value={compactDjf(unpaid)} hint="Invoiced, not yet settled" badge={<TileBadge fill="peach">Open</TileBadge>} />
        <StatCard icon={Truck} fill="pink" label="Payables" value={compactDjf(owedOut)} hint="Unsettled transport cost" badge={<TileBadge fill="pink">Debit</TileBadge>} />
      </div>

      <Panel title="Shippers" subtitle={SORTS[sort].caption} padded={false} action={<Pill tone="neutral">{rows.length} on this channel</Pill>}>
        <div className="flex flex-wrap items-center gap-3 px-5 pb-4">
          <span className="text-xs font-extrabold uppercase tracking-[0.06em] text-muted-foreground">Sort by</span>
          <FilterPills options={SORT_KEYS.map((key) => ({ key, label: SORTS[key].label }))} active={sort} onChange={setSort} />
        </div>

        {sorted.length > 0 ? (
          <DataTable minWidth={900}>
            <thead>
              <tr>
                <Th>Shipper</Th>
                <Th align="right">Shipments</Th>
                <Th align="right">Project value</Th>
                <Th align="right">Unpaid</Th>
                <Th>Collected</Th>
                <Th align="right">Owed out</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {paged.rows.map((row) => (
                <ClientRowView key={row.shipper.id} row={row} />
              ))}
            </tbody>
          </DataTable>
        ) : (
          <EmptyState message={`Nothing has been booked through ${meta.label}.`} />
        )}
        {sorted.length > 0 ? (
          <TablePager
            paged={paged}
            noun="clients"
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
            className="px-5 pb-4"
          />
        ) : null}
      </Panel>
    </div>
  );
}

function ClientRowView({ row }: { row: ClientBookRow }) {
  const navigate = useNavigate();
  const { money } = row;
  const collected = money.revenueDjf > 0 ? money.collectedDjf / money.revenueDjf : 0;
  const href = buildPath(ROUTES.financeShipmentClient, { clientId: row.shipper.id });
  const owedOut = money.payableDjf + money.frozenDjf + money.pipelineDjf;

  return (
    <tr onClick={() => navigate(href)} className="group cursor-pointer transition-colors hover:bg-surface-sunken/60">
      <Td>
        <Link to={href} onClick={(event) => event.stopPropagation()} className="flex min-w-0 items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Avatar name={row.shipper.companyLegalName} logoUrl={row.shipper.logoUrl} size={40} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-extrabold text-foreground">{row.shipper.companyLegalName}</span>
            <span className="mt-0.5 block truncate text-xs font-semibold text-muted-foreground">
              last {new Date(row.lastShipmentAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
            </span>
          </span>
        </Link>
      </Td>

      <Td align="right">
        <span className="font-mono text-sm font-bold tabular-nums text-foreground">{row.shipments.length}</span>
        {money.unpricedCount > 0 ? <span className="mt-0.5 block text-xs font-bold text-accent-subtle-foreground">{money.unpricedCount} unpriced</span> : null}
      </Td>

      <Td align="right">
        <MoneyAmount value={money.revenueDjf} direction="in" unit={false} className="text-sm" />
      </Td>

      <Td align="right">
        <span className="font-mono text-sm font-bold tabular-nums text-foreground">{compactDjf(money.outstandingDjf)}</span>
        {money.overdueDjf > 0 ? (
          <span className="mt-0.5 block text-xs font-bold text-destructive-subtle-foreground">{compactDjf(money.overdueDjf)} late</span>
        ) : (
          <span className="mt-0.5 block text-xs font-semibold text-muted-foreground">on time</span>
        )}
      </Td>

      <Td className="w-44">
        <Bar value={collected} tone="teal" />
        <span className="mt-1.5 block whitespace-nowrap text-xs font-semibold text-muted-foreground">{pct(collected)} collected</span>
      </Td>

      <Td align="right">
        <MoneyAmount value={owedOut} direction="out" unit={false} className="text-sm" />
      </Td>

      <Td align="right">
        <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </Td>
    </tr>
  );
}

export default FinanceShipmentsPage;
