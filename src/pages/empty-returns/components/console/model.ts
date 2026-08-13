import {
  CRITICAL_THRESHOLD_MS,
  EMPTY_RETURN_STATUS_META,
  EMPTY_RETURN_STATUS_ORDER,
  HOUR_MS,
  WATCH_THRESHOLD_MS,
} from '@/data/emptyReturnData';
import {
  isCritical,
  riskOf,
  selectChains,
  selectKpis,
  selectTransporterStats,
  selectUrgentRecords,
  slackOf,
} from '@/stores/emptyReturn.store';
import type {
  CycleChain,
  EmptyReturnKpis,
  EmptyReturnRecord,
  EmptyReturnStatus,
  FullLoadMission,
  ReturnRiskLevel,
  TransporterCycleStats,
} from '@/types/emptyReturn';

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
 * Deadline pressure — the risk board's meter
 * ------------------------------------------------------------------------- */

/**
 * Where the 6h safety cutoff sits on a meter whose full track is the 12h
 * watch window. The tick every pressure meter carries.
 */
export const SAFETY_CUTOFF_POSITION = 1 - CRITICAL_THRESHOLD_MS / WATCH_THRESHOLD_MS;

/**
 * Share of the 12h watch window already burned. 0 = comfortable, 1 = the
 * deadline is missed. A record with no deadline has no pressure to read.
 */
export function pressureOf(slack: number | null): number {
  if (slack === null) return 0;
  if (slack <= 0) return 1;
  return 1 - Math.min(1, slack / WATCH_THRESHOLD_MS);
}

/**
 * The colour law of the whole console, applied to one meter: teal reports a
 * margin that is still comfortable, amber asks while the watch window burns,
 * and red is reserved for a margin that is already gone.
 */
export function pressureColorOf(slack: number | null): string {
  if (slack === null) return 'var(--chart-other)';
  if (slack < 0) return 'var(--destructive)';
  if (slack < WATCH_THRESHOLD_MS) return 'var(--accent-bold)';
  return 'var(--primary)';
}

export interface UrgentBoardRow {
  record: EmptyReturnRecord;
  slack: number | null;
  risk: ReturnRiskLevel | null;
  /** 0–1 for the meter fill. */
  pressure: number;
  meterColor: string;
}

/**
 * Slack read as a distance, not a stopwatch: `−2d 18h`, `−10h`, `+4h`.
 *
 * The old `−66h48` figure was technically correct and practically unreadable
 * — nobody scans a risk board doing division. Days appear once slack clears
 * 24h; minutes fold into the nearest hour, since every threshold this board
 * judges against (the 6h cutoff, the 12h window) is itself hour-grained.
 */
export function slackLabelOf(slack: number | null): string {
  if (slack === null) return '—';
  const negative = slack < 0;
  const abs = Math.abs(slack);
  const dayMs = 24 * HOUR_MS;
  const days = Math.floor(abs / dayMs);
  const hours = Math.floor((abs % dayMs) / HOUR_MS);
  const sign = negative ? '−' : '+';
  if (days > 0) return `${sign}${days}d ${hours}h`;
  if (hours > 0) return `${sign}${hours}h`;
  const minutes = Math.max(1, Math.floor((abs % HOUR_MS) / 60_000));
  return `${sign}${minutes}m`;
}

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
 * Lifecycle pipeline
 * ------------------------------------------------------------------------- */

export interface PipelineStage {
  status: EmptyReturnStatus;
  label: string;
  count: number;
  color: string;
  /** Text colour for the in-segment caption; light fills carry dark type. */
  fg: string;
}

/**
 * One fill per lifecycle stage, darkening from ask to done: neutral while the
 * box is still being unloaded, amber while it waits on an Operations decision,
 * then a teal ramp as the cycle firms up and completes. The two-hue gradient
 * is the conclusion — orange is work, teal is progress.
 */
const STAGE_FILL: Record<EmptyReturnStatus, { color: string; fg: string }> = {
  unloading: { color: 'var(--chart-other)', fg: 'var(--fl-neutral-950)' },
  empty_ready: { color: 'var(--accent-bold)', fg: 'var(--fl-neutral-950)' },
  preparing: { color: 'var(--fl-orange-300)', fg: 'var(--fl-neutral-950)' },
  ready: { color: 'var(--fl-teal-400)', fg: 'var(--fl-neutral-950)' },
  in_progress: { color: 'var(--fl-teal-600)', fg: 'var(--fl-neutral-0)' },
  completed: { color: 'var(--fl-teal-800)', fg: 'var(--fl-neutral-0)' },
};

export interface PipelineModel {
  stages: PipelineStage[];
  total: number;
}

/* ---------------------------------------------------------------------------
 * Matching opportunities
 * ------------------------------------------------------------------------- */

export interface MatchPair {
  emptyId: string;
  emptyContainer: string;
  missionId: string;
  missionContainer: string;
  locationName: string;
  window: string;
  /** Delivery Order verified, booking and release confirmed. */
  docsReady: boolean;
  docsMissing: number;
}

export interface MatchingModel {
  /** `empty_ready` with no exception — the boxes a cycle can be built on. */
  matchable: number;
  /** `empty_ready` but flagged (standalone / deadline exceeded) — excluded. */
  flagged: number;
  /** Same-yard empty ↔ full-load pairings, best-documented first. */
  pairs: MatchPair[];
  poolTotal: number;
  poolReady: number;
}

function docsMissingOf(mission: FullLoadMission): number {
  let missing = 0;
  if (mission.doStatus !== 'verified') missing += 1;
  if (mission.booking !== 'confirmed') missing += 1;
  if (mission.release !== 'confirmed') missing += 1;
  return missing;
}

/* ---------------------------------------------------------------------------
 * The model
 * ------------------------------------------------------------------------- */

export interface EmptyReturnConsoleModel {
  kpis: EmptyReturnKpis;
  urgent: UrgentBoardRow[];
  outstanding: OutstandingModel;
  pipeline: PipelineModel;
  matching: MatchingModel;
  /** Most active carrier first. */
  carriers: TransporterCycleStats[];
  chains: CycleChain[];
  /** The assigned KPI's receipt: how the figure splits. */
  assignedSplit: { ready: number; inProgress: number };
}

export interface BuildModelArgs {
  records: EmptyReturnRecord[];
  missions: FullLoadMission[];
  now: number;
}

export function buildEmptyReturnConsoleModel({
  records,
  missions,
  now,
}: BuildModelArgs): EmptyReturnConsoleModel {
  const kpis = selectKpis(records, now);

  /* Urgent rail, with the meter fields resolved once. */
  const urgent: UrgentBoardRow[] = selectUrgentRecords(records, now).map((record) => {
    const slack = slackOf(record, now);
    return {
      record,
      slack,
      risk: riskOf(record, now),
      pressure: pressureOf(slack),
      meterColor: pressureColorOf(slack),
    };
  });

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

  /* Lifecycle pipeline. */
  const pipeline: PipelineModel = {
    stages: EMPTY_RETURN_STATUS_ORDER.map((status) => ({
      status,
      label: EMPTY_RETURN_STATUS_META[status].label,
      count: records.filter((r) => r.status === status).length,
      ...STAGE_FILL[status],
    })),
    total: records.length,
  };

  /* Matching: every same-yard pairing an operator could weld right now. */
  const matchableRecords = records.filter((r) => r.status === 'empty_ready' && !r.exception);
  const pairs: MatchPair[] = matchableRecords
    .flatMap((empty) =>
      missions
        .filter((mission) => mission.locationId === empty.locationId)
        .sort(
          (a, b) => docsMissingOf(a) - docsMissingOf(b) || a.pickupAt - b.pickupAt,
        )
        .slice(0, 2)
        .map((mission) => {
          const docsMissing = docsMissingOf(mission);
          return {
            emptyId: empty.id,
            emptyContainer: empty.container,
            missionId: mission.id,
            missionContainer: mission.container,
            locationName: empty.locationName,
            window: mission.window,
            docsReady: docsMissing === 0,
            docsMissing,
          };
        }),
    )
    .slice(0, 4);

  const matching: MatchingModel = {
    matchable: matchableRecords.length,
    flagged: records.filter((r) => r.status === 'empty_ready' && Boolean(r.exception)).length,
    pairs,
    poolTotal: missions.length,
    poolReady: missions.filter((mission) => docsMissingOf(mission) === 0).length,
  };

  const carriers = [...selectTransporterStats(records)].sort(
    (a, b) => b.active - a.active || b.containers - a.containers,
  );

  return {
    kpis,
    urgent,
    outstanding,
    pipeline,
    matching,
    carriers,
    chains: selectChains(records),
    assignedSplit: {
      ready: records.filter((r) => r.status === 'ready').length,
      inProgress: records.filter((r) => r.status === 'in_progress').length,
    },
  };
}
