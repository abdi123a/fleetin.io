import { Link } from 'react-router-dom';

import { ROUTES, buildPath } from '@/config/routes';
import type { ShipmentRecord } from '@/features/shipments/api/shipmentsService';
import type { InvoiceRecord } from '@/features/finance';
import { cn } from '@/utils';

import { DataTable, EmptyState, MoneyAmount, Pill, Td, Th } from './kit';

/**
 * The consignment list, sliced by nothing more than what's cheaply real: no
 * per-row booking/hold fetch (that would be N+1 at list scale), so no proven
 * count or per-transporter breakdown here — those live one click away on the
 * shipment detail page. `shipment.rateMinorUnits` (the aggregate transporter
 * cost, computed at booking-assignment time) stands in for a booking-summed
 * total; `invoices` is fetched once by the caller for the relevant shipper
 * and matched here client-side, since there is no `GET /invoices?shipmentId=`.
 */
export function ShipmentsTable({
  shipments,
  invoices = [],
  emptyMessage = 'No shipments booked yet.',
}: {
  shipments: ShipmentRecord[];
  invoices?: InvoiceRecord[];
  emptyMessage?: string;
}) {
  if (shipments.length === 0) return <EmptyState message={emptyMessage} />;

  return (
    <DataTable minWidth={1020}>
      <thead>
        <tr>
          <Th>Shipment</Th>
          <Th>Route</Th>
          <Th>Payout</Th>
          <Th align="right">Cost</Th>
          <Th align="right">Client total</Th>
          <Th>Invoice</Th>
        </tr>
      </thead>
      <tbody>
        {shipments.map((shipment) => {
          const href = buildPath(ROUTES.financeShipmentDetail, { shipmentId: shipment.id });
          const invoice = invoices.find((inv) => Array.isArray(inv.missionIds) && inv.missionIds.includes(shipment.id));
          return (
            <tr key={shipment.id} className="transition-colors hover:bg-surface-sunken/60">
              <Td>
                <Link to={href} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="font-mono text-sm font-bold text-foreground">{shipment.reference}</span>
                  <span className="mt-0.5 block text-xs font-medium text-muted-foreground">{shipment.cargoType}</span>
                </Link>
              </Td>
              <Td>
                <span className="text-sm font-semibold text-foreground">
                  {shipment.pickupLocationCity} → {shipment.deliveryLocationCity}
                </span>
              </Td>
              <Td>
                {shipment.payoutReleasedAt ? (
                  <Pill tone="teal">Released</Pill>
                ) : (
                  <Pill tone="neutral">Not released</Pill>
                )}
              </Td>
              <Td align="right">
                <MoneyAmount value={Number(shipment.rateMinorUnits)} direction="out" unit={false} className="text-sm" />
              </Td>
              <Td align="right">
                {shipment.clientRateMinorUnits != null ? (
                  <MoneyAmount value={Number(shipment.clientRateMinorUnits)} direction="in" unit={false} className="text-sm" />
                ) : (
                  <Pill tone="orange">Unpriced</Pill>
                )}
              </Td>
              <Td>
                {invoice ? (
                  <Link to={`${ROUTES.financeInvoices}/${invoice.id}`} className="font-mono text-xs font-bold text-foreground hover:underline">
                    <span className={cn(invoice.status === 'Paid' ? 'text-primary-subtle-foreground' : 'text-accent-subtle-foreground')}>
                      {invoice.number} · {invoice.status}
                    </span>
                  </Link>
                ) : (
                  <span className="text-xs font-semibold text-muted-foreground">Not yet issued</span>
                )}
              </Td>
            </tr>
          );
        })}
      </tbody>
    </DataTable>
  );
}
