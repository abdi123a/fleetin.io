import type { ShipperShipmentRow } from '@/features/shipper-bi';
import {
  DETENTION_RATE_CURRENCY,
  DETENTION_RATE_PER_CONTAINER_DAY,
} from '@/lib/bi/config';

/**
 * What a container still sitting on the shipper's yard is costing, and how to
 * print it.
 *
 * It lives on its own because two panels quote the same number — the hero band
 * states the account's exposure in a sentence, the action queue breaks it down
 * per container — and a headline that disagrees with the list under it is worse
 * than either being absent.
 *
 * The currency matters as much as the figure. Detention is billed in USD by the
 * shipping lines while the rest of the ledger is in DJF, so the amount is never
 * passed through `formatMetric`: that helper appends the ledger currency, and
 * an early draft of the hero rendered "600 DJF" over a rate contracted at $50 a
 * day — off by a factor of about 180.
 */

/** A container is still out until it is returned — delivery is not the end. */
export function isContainerOut(row: ShipperShipmentRow): boolean {
  return Boolean(row.containerNo) && !row.returnedAt;
}

/** Out, and past the free time it was allowed. */
export function isOverdue(row: ShipperShipmentRow): boolean {
  return isContainerOut(row) && row.emptyReturnOverdueDays > 0;
}

/** The billable slice of the overrun, at the contracted rate. */
export function detentionCost(row: ShipperShipmentRow): number {
  return row.detentionDays * DETENTION_RATE_PER_CONTAINER_DAY;
}

/** Containers still out past free time, and what they have cost so far. */
export function detentionExposure(rows: ShipperShipmentRow[]) {
  const overdue = rows.filter(isOverdue);
  return {
    count: overdue.length,
    charged: overdue.reduce((total, row) => total + detentionCost(row), 0),
  };
}

/** Always with its currency named, because it is not the ledger's. */
export function formatDetention(amount: number): string {
  return `${Math.round(amount).toLocaleString()} ${DETENTION_RATE_CURRENCY}`;
}
