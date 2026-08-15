import { isCritical, riskOf, selectKpis } from '@/stores/emptyReturn.store';
import type { EmptyReturnKpis, EmptyReturnRecord } from '@/types/emptyReturn';

/**
 * All arithmetic for the Empty Returns console, in one pass.
 *
 * Same contract as the shipper and transporter consoles: the page builds this
 * model once per clock tick and every panel is presentational. Two panels
 * quoting the same figure read it from the same field, so they cannot disagree
 * — and each figure keeps the store's own selectors as its source, so the
 * number on a tile and the list the tile opens cannot disagree either.
 */

/* ---------------------------------------------------------------------------
 * Outstanding boxes — the donut
 * ------------------------------------------------------------------------- */

export interface OutstandingBucket {
  key: 'overdue' | 'crit' | 'watch' | 'safe' | 'none';
  label: string;
  count: number;
  color: string;
}

export interface OutstandingModel {
  /** Boxes physically still out: not completed and not yet gated in. */
  stillOut: number;
  /** Still-out boxes bucketed by deadline risk. Zero-count buckets included. */
  buckets: OutstandingBucket[];
  /** Boxes already back inside their deadline — the protected set. */
  returnedOnTime: number;
  /** Open records whose deadline is not confirmed with the line. */
  unverified: number;
  /** Open records with no deadline captured at all. */
  missing: number;
}

/* ---------------------------------------------------------------------------
 * The model
 * ------------------------------------------------------------------------- */

export interface EmptyReturnConsoleModel {
  kpis: EmptyReturnKpis;
  outstanding: OutstandingModel;
  /** The assigned KPI's receipt: how the figure splits. */
  assignedSplit: { ready: number; inProgress: number };
}

export interface BuildModelArgs {
  records: EmptyReturnRecord[];
  now: number;
}

export function buildEmptyReturnConsoleModel({
  records,
  now,
}: BuildModelArgs): EmptyReturnConsoleModel {
  const kpis = selectKpis(records, now);

  /* Boxes still out, bucketed by how loud their clock is. */
  const openRecords = records.filter((r) => r.status !== 'completed');
  const stillOutRecords = openRecords.filter((r) => !r.returnedAt);

  const bucketCounts = { overdue: 0, crit: 0, watch: 0, safe: 0, none: 0 };
  for (const record of stillOutRecords) {
    const risk = riskOf(record, now);
    if (risk === 'overdue') bucketCounts.overdue += 1;
    else if (isCritical(risk)) bucketCounts.crit += 1;
    else if (risk === 'watch') bucketCounts.watch += 1;
    else if (risk === 'safe') bucketCounts.safe += 1;
    else bucketCounts.none += 1;
  }

  const outstanding: OutstandingModel = {
    stillOut: stillOutRecords.length,
    buckets: [
      { key: 'overdue', label: 'Overdue', count: bucketCounts.overdue, color: 'var(--destructive)' },
      {
        key: 'crit',
        label: 'Critical + at risk',
        count: bucketCounts.crit,
        color: 'var(--accent-bold)',
      },
      { key: 'watch', label: 'Watch', count: bucketCounts.watch, color: 'var(--fl-orange-300)' },
      { key: 'safe', label: 'Safe', count: bucketCounts.safe, color: 'var(--primary)' },
      { key: 'none', label: 'No deadline', count: bucketCounts.none, color: 'var(--chart-other)' },
    ],
    returnedOnTime: records.filter(
      (r) => r.returnedAt && r.deadline && r.returnedAt <= r.deadline,
    ).length,
    unverified: openRecords.filter((r) => r.deadlineStatus === 'unverified').length,
    missing: openRecords.filter((r) => r.deadlineStatus === 'missing').length,
  };

  return {
    kpis,
    outstanding,
    assignedSplit: {
      ready: records.filter((r) => r.status === 'ready').length,
      inProgress: records.filter((r) => r.status === 'in_progress').length,
    },
  };
}
