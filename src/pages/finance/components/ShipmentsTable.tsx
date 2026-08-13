import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { ROUTES } from '@/config/routes';
import { Container, Layers, Wrench } from '@/design-system/icons';
import { fmtDjf, pct } from '@/lib/finance';
import type { CargoType } from '@/types/finance';
import { cn } from '@/utils';

import type { ShipmentRow } from '../model';
import {
  DataTable,
  EmptyState,
  FilterPills,
  MoneyAmount,
  PartyCell,
  Pill,
  StageChip,
  Td,
  Th,
  UnpricedChip,
  type PillTone,
} from './kit';

/**
 * The consignment list, sliced by what is on the trucks.
 *
 * One row is one SHIPMENT, not one container — that is the whole navigation
 * change. A row answers three questions at a glance: how many bookings, how
 * many are proven, and who is owed for them. Clicking through goes to the
 * money, because the shipment is where money happens.
 *
 * Cargo type is the first thing an operator wants to slice a project by:
 * containers, bulk and machinery carry different handling, escort and
 * demurrage exposure. A shipment matches a slice if ANY of its bookings does,
 * because a mixed consignment is genuinely both.
 *
 * Shared by the project view and the client's one-off list, so both read the
 * same way and neither invents its own columns.
 */

export const CARGO_META: Record<
  CargoType,
  { label: string; tone: PillTone; icon: (props: { className?: string }) => React.ReactNode }
> = {
  containerized: { label: 'Containerized', tone: 'blue', icon: Container },
  bulk: { label: 'Bulk', tone: 'amber', icon: Layers },
  machinery: { label: 'Machinery', tone: 'teal', icon: Wrench },
};

export function CargoChip({ type, className }: { type: CargoType; className?: string }) {
  const meta = CARGO_META[type];
  return (
    <Pill tone={meta.tone} icon={meta.icon} className={className}>
      {meta.label}
    </Pill>
  );
}

type Lens = CargoType | 'all';

/** The cargo types actually present on a consignment, in a stable order. */
function cargoTypesOf(row: ShipmentRow): CargoType[] {
  const present = new Set(row.bookings.map((entry) => entry.booking.cargoType));
  return (['containerized', 'bulk', 'machinery'] as CargoType[]).filter((type) =>
    present.has(type),
  );
}

export function ShipmentsTable({
  rows,
  marginFloorPct,
  emptyMessage = 'No shipments booked yet.',
}: {
  rows: ShipmentRow[];
  marginFloorPct: number;
  emptyMessage?: string;
}) {
  const [lens, setLens] = useState<Lens>('all');

  const counts = useMemo(() => {
    const tally: Record<CargoType, number> = { containerized: 0, bulk: 0, machinery: 0 };
    for (const row of rows) {
      for (const type of cargoTypesOf(row)) tally[type] += 1;
    }
    return tally;
  }, [rows]);

  const visible = useMemo(
    () => (lens === 'all' ? rows : rows.filter((row) => cargoTypesOf(row).includes(lens))),
    [rows, lens],
  );

  if (rows.length === 0) return <EmptyState message={emptyMessage} />;

  return (
    <>
      {/* Only offer a slice that exists — an empty "Machinery 0" is noise. */}
      <div className="flex flex-wrap items-center gap-3 px-5 pb-4">
        <FilterPills
          options={[
            { key: 'all' as Lens, label: 'All cargo', count: rows.length },
            ...(['containerized', 'bulk', 'machinery'] as CargoType[])
              .filter((type) => counts[type] > 0)
              .map((type) => ({
                key: type as Lens,
                label: CARGO_META[type].label,
                count: counts[type],
                tone: CARGO_META[type].tone,
              })),
          ]}
          active={lens}
          onChange={setLens}
        />
        <span className="text-xs font-semibold text-muted-foreground">
          {visible.length} of {rows.length} shown
        </span>
      </div>

      <DataTable minWidth={1140}>
        <thead>
          <tr>
            <Th>Shipment</Th>
            <Th>Bookings</Th>
            <Th>Transporters</Th>
            <Th>Payout</Th>
            <Th align="right">Cost</Th>
            <Th align="right">Client total</Th>
            <Th align="right">Margin</Th>
          </tr>
        </thead>
        <tbody>
          {visible.map((row) => {
            const href = `${ROUTES.financeShipments}/shipment/${row.shipment.id}`;
            const payable = row.settlements.filter((entry) => entry.payableDjf > 0);
            const first = row.bookings[0]?.booking;
            return (
              <tr key={row.shipment.id} className="transition-colors hover:bg-surface-sunken/60">
                <Td>
                  <Link
                    to={href}
                    className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="font-mono text-sm font-bold text-foreground">
                      {row.shipment.id}
                    </span>
                    <span className="mt-0.5 block font-mono text-xs font-medium text-muted-foreground">
                      {row.shipment.reference ?? '—'}
                    </span>
                  </Link>
                </Td>
                <Td>
                  <Link to={href}>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {cargoTypesOf(row).map((type) => (
                        <CargoChip key={type} type={type} />
                      ))}
                    </div>
                    <span className="mt-1.5 block text-sm font-bold leading-snug text-foreground">
                      {row.bookingCount} booking{row.bookingCount === 1 ? '' : 's'}
                      {/* Proof progress belongs beside the count: it is the
                          single fact that decides whether money can move. */}
                      <span
                        className={cn(
                          'ml-2 font-semibold',
                          row.provenCount === row.bookingCount
                            ? 'text-muted-foreground'
                            : 'text-accent-subtle-foreground',
                        )}
                      >
                        {row.provenCount}/{row.bookingCount} proven
                      </span>
                    </span>
                    {first ? (
                      <span className="mt-0.5 block text-xs font-medium text-muted-foreground">
                        {first.origin} → {first.destination}
                      </span>
                    ) : null}
                  </Link>
                </Td>
                <Td>
                  {/*
                   * Only the hauliers, not the port firms: this column answers
                   * "who moved it", and listing the handling company beside a
                   * transport contractor blurs the two.
                   */}
                  <div className="flex flex-col gap-1.5">
                    {row.settlements
                      .filter((entry) => entry.transporterId.startsWith('PTR'))
                      .map((entry) => (
                        <PartyCell
                          key={entry.transporterId}
                          name={entry.transporterName}
                          sub={`${entry.bookingsCount} booking${
                            entry.bookingsCount === 1 ? '' : 's'
                          }`}
                          size={28}
                        />
                      ))}
                    {row.settlements.length === 0 ? (
                      <span className="text-sm font-semibold text-muted-foreground">—</span>
                    ) : null}
                  </div>
                </Td>
                <Td>
                  <div className="flex flex-col items-start gap-1.5">
                    <StageChip stage={row.stage} held={row.held} />
                    {payable.length > 0 ? (
                      <span className="text-xs font-bold text-accent-subtle-foreground">
                        {payable.length} settlement{payable.length === 1 ? '' : 's'} to pay
                      </span>
                    ) : null}
                    {row.stage === 'awaiting_pod' && row.unproven.length > 0 ? (
                      <span className="text-xs font-bold text-accent-subtle-foreground">
                        {row.unproven.length} booking{row.unproven.length === 1 ? '' : 's'} blocking
                      </span>
                    ) : null}
                  </div>
                </Td>
                <Td align="right">
                  <MoneyAmount
                    value={row.money.costDjf}
                    direction="out"
                    unit={false}
                    className="text-sm"
                  />
                </Td>
                <Td align="right">
                  {row.money.revenueDjf > 0 ? (
                    <>
                      <MoneyAmount
                        value={row.money.revenueDjf}
                        direction="in"
                        unit={false}
                        className="text-sm"
                      />
                      {row.money.unpricedCount > 0 ? (
                        <span className="mt-0.5 block text-xs font-bold text-accent-subtle-foreground">
                          {row.money.unpricedCount} unpriced
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <UnpricedChip moneyOut={row.stage === 'released' || row.stage === 'settled'} />
                  )}
                </Td>
                <Td align="right">
                  {row.money.marginPct !== null ? (
                    <>
                      <span
                        className={cn(
                          'font-mono text-sm font-bold tabular-nums',
                          row.money.marginPct < 0
                            ? 'text-destructive-subtle-foreground'
                            : row.money.marginPct * 100 < marginFloorPct
                              ? 'text-accent-subtle-foreground'
                              : 'text-foreground',
                        )}
                      >
                        {pct(row.money.marginPct, 1)}
                      </span>
                      <span className="mt-0.5 block font-mono text-xs font-medium text-muted-foreground">
                        {fmtDjf(row.money.grossDjf ?? 0)}
                      </span>
                    </>
                  ) : (
                    <span className="text-sm font-bold text-muted-foreground">—</span>
                  )}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </DataTable>
      {visible.length === 0 ? (
        <EmptyState message="No shipments of that cargo type in this view." />
      ) : null}
    </>
  );
}
