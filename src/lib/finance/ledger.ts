/**
 * Funding-source balance logic.
 *
 * One arithmetic, two meanings:
 *
 * - CONTRACT FACILITY (pool): Fleetin is the borrower. A repayment reduces
 *   the pool's running balance and is deliberately unmatched to any draw or
 *   invoice — there is no reconciliation pairing anywhere in this module,
 *   and none should ever be added.
 * - CLIENT CREDIT LINE (revolving): the client is the borrower; their
 *   repayment restores available balance. Fleetin tracks balance, draws and
 *   availability — nothing more, because collections sit with the bank.
 *
 * Balances are always REPLAYED from movements, never stored, so the ledger
 * and its headline figures cannot drift apart.
 */

import type { FundingSource, LedgerMovement } from '@/types/finance';
import { DAY_MS } from './payoutEngine';

const toMs = (iso: string): number => new Date(iso).getTime();

export interface LedgerRow {
  movement: LedgerMovement;
  /** Balance after this movement (confirmed and pending draws both count). */
  resultingBalanceDjf: number;
}

export interface FundingPosition {
  source: FundingSource;
  /** Confirmed + pending draws minus repayments — the exposure that matters. */
  drawnDjf: number;
  /** Draws the bank has not yet confirmed disbursing. */
  pendingDrawsDjf: number;
  availableDjf: number;
  /** drawn ÷ ceiling, 0..1+ (an over-ceiling pool reads over 1 loudly). */
  utilisation: number;
  /** Chronological, oldest first, with running balances. */
  rows: LedgerRow[];
}

export function buildFundingPosition(
  source: FundingSource,
  movements: LedgerMovement[],
): FundingPosition {
  const own = movements
    .filter((movement) => movement.fundingSourceId === source.id)
    .sort((a, b) => toMs(a.date) - toMs(b.date));

  let balance = 0;
  let pending = 0;
  const rows: LedgerRow[] = own.map((movement) => {
    balance += movement.kind === 'draw' ? movement.amountDjf : -movement.amountDjf;
    if (movement.kind === 'draw' && !movement.confirmed) pending += movement.amountDjf;
    return { movement, resultingBalanceDjf: balance };
  });

  const drawn = Math.max(0, balance);
  return {
    source,
    drawnDjf: drawn,
    pendingDrawsDjf: pending,
    availableDjf: Math.max(0, source.ceilingDjf - drawn),
    utilisation: source.ceilingDjf > 0 ? drawn / source.ceilingDjf : 0,
    rows,
  };
}

/** A draw must be attributable to a source with headroom for it. */
export function canDraw(position: FundingPosition, amountDjf: number): boolean {
  return amountDjf > 0 && amountDjf <= position.availableDjf;
}

// ─── Headroom runway ────────────────────────────────────────────────────────

export interface HeadroomRunway {
  /** Average confirmed+pending draw volume per day over the trailing window. */
  burnPerDayDjf: number;
  /** Null when there is no recent burn to project from. */
  daysToExhaustion: number | null;
  exhaustionAtMs: number | null;
}

/**
 * "When does this facility run out at current burn?" — capacity is per
 * contract, so an exhausted ceiling means transporters stop getting paid,
 * which breaks the promise the whole business is priced on.
 */
export function headroomRunway(
  position: FundingPosition,
  nowMs: number,
  trailingDays = 30,
): HeadroomRunway {
  const windowStart = nowMs - trailingDays * DAY_MS;
  const drawnInWindow = position.rows
    .filter(
      (row) => row.movement.kind === 'draw' && toMs(row.movement.date) >= windowStart,
    )
    .reduce((sum, row) => sum + row.movement.amountDjf, 0);

  const burnPerDay = drawnInWindow / trailingDays;
  if (burnPerDay <= 0) {
    return { burnPerDayDjf: 0, daysToExhaustion: null, exhaustionAtMs: null };
  }
  const days = position.availableDjf / burnPerDay;
  return {
    burnPerDayDjf: burnPerDay,
    daysToExhaustion: days,
    exhaustionAtMs: nowMs + days * DAY_MS,
  };
}
