import { detentionRateCurrency, detentionRatePerContainerDay } from '@/lib/bi/config';
import { containerStateOf, type ContainerState } from '@/lib/containerState';
import { displayShipmentStatus } from '@/lib/shipmentStatus';
import type {
  MissionException,
  MissionParty,
  MissionPerformanceStatus,
  MissionReport,
  ReturnStatus,
} from './missionReport';
import { EXCEPTION_LABELS, isOnTimeMission, STAGE_ROWS } from './monthlyReport';

/**
 * The shipment report — one consignment, all of its containers at once.
 *
 * A shipment is not a mission. The thing with a timeline, a deadline and a box
 * to give back is the **booking** inside it, one per container, and until now
 * that was the only level the reporting system spoke at: open a shipment and
 * you had to pick a container before a single figure appeared. A four-container
 * consignment therefore had four reports and no answer to the question the
 * person opening it actually has — *how is this shipment doing*.
 *
 * So this is an aggregation of the very mission reports the same panel can open
 * one by one, exactly as the monthly report is. Same objects, summed: the
 * shipment's average can never disagree with the containers behind it, and a
 * figure the reader distrusts is one click from the mission that produced it.
 *
 * What it adds over "the sum of N reports" is the three questions only the
 * whole consignment can answer:
 *
 *  - **Spread** — which container is dragging the shipment, and by how much.
 *    One mission report cannot say that; a rail of all of them says it instantly.
 *  - **Exposure** — how many boxes are still out, against whose deadline, and
 *    what the next day of detention would cost across all of them.
 *  - **Hands** — who actually moved this consignment. A shipment's own
 *    `transporter` field is a creation-time snapshot; the real set is whatever
 *    its bookings ended up with, and about a fifth of them carry more than one.
 */

/* ═══════════════════════════════════════════════════════════════════════════
 * Shapes
 * ═══════════════════════════════════════════════════════════════════════ */

/** One operational stage, summed over the shipment's containers. */
export interface ShipmentStageTotal {
  key: string;
  label: string;
  /** Every container's time in this stage, added up. */
  totalMs: number;
  /** The mean over the containers that recorded it — an average of one is not an average. */
  avgMs: number;
  samples: number;
  /** Share of the summed cycle, 0–100. */
  share: number;
  /** The stage that consumed the most of this shipment — the bottleneck. */
  isLongest: boolean;
}

/** One party's hold on the whole consignment. */
export interface ShipmentCustodySegment {
  party: MissionParty;
  label: string;
  ms: number;
  /** Share of every recorded hour on the shipment, 0–100. */
  share: number;
  /** How many of the shipment's containers passed through these hands. */
  containers: number;
  isLongest: boolean;
}

/**
 * One container, as a line of the comparison rail.
 *
 * Deliberately the same facts the booking cards above the report already carry
 * — reference, box, state, transporter — plus the two the cards cannot compute:
 * how long this container has been on the clock, and how it compares with its
 * siblings. Clicking a row opens that container's own mission report, which is
 * what makes the rail a picker as well as a picture.
 */
export interface ShipmentContainerRow {
  bookingId: string;
  reference: string;
  containerNumber: string | null;
  /** The raw ladder word — what the container-state colour keys on. */
  status: string;
  statusLabel: string;
  state: ContainerState | null;
  performance: MissionPerformanceStatus;
  isTerminated: boolean;
  isClosed: boolean;
  transporter: string;
  /** Total for a closed mission, elapsed for a running one. */
  clockMs: number | null;
  isRunning: boolean;
  depotageMs: number | null;
  returnStatus: ReturnStatus;
  detentionDays: number;
  detentionFees: number;
  exceptions: number;
  progress: { recorded: number; total: number };
  /** Share of the longest container's clock, 0–100 — the length of its bar. */
  share: number;
}

export interface ShipmentExceptionRow {
  code: MissionException['code'];
  label: string;
  level: MissionException['level'];
  count: number;
}

export interface ShipmentReport {
  containers: {
    total: number;
    /** Containerized — a bulk load is tipped, not stripped, and owes no return. */
    withBox: number;
    running: number;
    closed: number;
    terminated: number;
    delivered: number;
  };
  onTime: {
    closed: number;
    onTime: number;
    /** Null while nothing has closed — a rate over zero missions is not a rate. */
    pct: number | null;
  };
  time: {
    /** First recorded event anywhere on the shipment → the last one (or now). */
    spanMs: number | null;
    spanFrom: number | null;
    spanTo: number | null;
    avgMissionMs: number | null;
    longestMissionMs: number | null;
    /** The container that took longest — the one to open first. */
    longestBookingId: string | null;
    /** Every gate wait on every container, added up. */
    totalWaitMs: number;
    avgDepotageMs: number | null;
    /** Time on the clock across every container — the denominator of the ring. */
    workedMs: number;
  };
  stages: ShipmentStageTotal[];
  custody: {
    segments: ShipmentCustodySegment[];
    totalMs: number;
    lead: ShipmentCustodySegment | null;
  };
  containerReturn: {
    withBox: number;
    /** Still loaded — the cargo has not been stripped yet. */
    stillFull: number;
    /** Stripped and out: the boxes that owe a return. */
    out: number;
    returned: number;
    late: number;
    dueSoon: number;
    /** The soonest deadline among the boxes still out. */
    nextDeadlineAt: number | null;
    detentionCases: number;
    detentionDays: number;
    detentionFees: number;
    currency: string;
    ratePerDay: number;
    /** One more day past free time, on every box still out. */
    oneMoreDayCost: number;
  };
  exceptions: ShipmentExceptionRow[];
  /** One row per container, in the order the shipment lists them. */
  rows: ShipmentContainerRow[];
  /** Who actually moved this consignment, busiest first. */
  transporters: Array<{ name: string; containers: number }>;
  /** The worst verdict on the shipment — one bad container makes a bad shipment. */
  status: MissionPerformanceStatus;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Arithmetic
 * ═══════════════════════════════════════════════════════════════════════ */

const mean = (values: number[]): number | null =>
  values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;

const collect = (
  reports: MissionReport[],
  pick: (report: MissionReport) => number | null,
): number[] => reports.map(pick).filter((value): value is number => value !== null && value >= 0);

/** Worst wins: `delayed` over `attention` over `ontime`. */
const RANK: Record<MissionPerformanceStatus, number> = { ontime: 0, attention: 1, delayed: 2 };

const EMPTY: ShipmentReport = {
  containers: { total: 0, withBox: 0, running: 0, closed: 0, terminated: 0, delivered: 0 },
  onTime: { closed: 0, onTime: 0, pct: null },
  time: {
    spanMs: null,
    spanFrom: null,
    spanTo: null,
    avgMissionMs: null,
    longestMissionMs: null,
    longestBookingId: null,
    totalWaitMs: 0,
    avgDepotageMs: null,
    workedMs: 0,
  },
  stages: [],
  custody: { segments: [], totalMs: 0, lead: null },
  containerReturn: {
    withBox: 0,
    stillFull: 0,
    out: 0,
    returned: 0,
    late: 0,
    dueSoon: 0,
    nextDeadlineAt: null,
    detentionCases: 0,
    detentionDays: 0,
    detentionFees: 0,
    currency: detentionRateCurrency(),
    ratePerDay: detentionRatePerContainerDay(),
    oneMoreDayCost: 0,
  },
  exceptions: [],
  rows: [],
  transporters: [],
  status: 'ontime',
};

export function computeShipmentReport(reports: MissionReport[], now: number): ShipmentReport {
  if (reports.length === 0) return EMPTY;

  /* ── The book ───────────────────────────────────────────────────────── */
  const live = reports.filter((report) => !report.overview.isTerminated);
  const closed = live.filter((report) => report.isClosed);
  const withBox = reports.filter((report) => report.containerReturn.hasContainer);

  /* ── Where the time went ────────────────────────────────────────────── */
  const stageTotals = STAGE_ROWS.map((row) => {
    const samples = collect(reports, row.of);
    const totalMs = samples.reduce((a, b) => a + b, 0);
    return { key: row.key, label: row.label, totalMs, avgMs: mean(samples) ?? 0, samples: samples.length };
  }).filter((stage) => stage.totalMs > 0);

  const cycleMs = stageTotals.reduce((sum, stage) => sum + stage.totalMs, 0);
  const longestStageMs = Math.max(...stageTotals.map((stage) => stage.totalMs), 0);
  const stages: ShipmentStageTotal[] = stageTotals.map((stage) => ({
    ...stage,
    share: cycleMs > 0 ? (stage.totalMs / cycleMs) * 100 : 0,
    isLongest: longestStageMs > 0 && stage.totalMs === longestStageMs,
  }));

  /* ── Whose hands ────────────────────────────────────────────────────── */
  const custodyByParty = new Map<MissionParty, { label: string; ms: number; containers: number }>();
  for (const report of reports) {
    for (const segment of report.custody.segments) {
      const entry = custodyByParty.get(segment.party) ?? {
        label: segment.label,
        ms: 0,
        containers: 0,
      };
      entry.ms += segment.ms;
      entry.containers += 1;
      custodyByParty.set(segment.party, entry);
    }
  }
  const custodyTotalMs = [...custodyByParty.values()].reduce((sum, entry) => sum + entry.ms, 0);
  const custodyLeadMs = Math.max(...[...custodyByParty.values()].map((entry) => entry.ms), 0);
  const custodySegments: ShipmentCustodySegment[] = [...custodyByParty.entries()]
    .map(([party, entry]) => ({
      party,
      label: entry.label,
      ms: entry.ms,
      containers: entry.containers,
      share: custodyTotalMs > 0 ? (entry.ms / custodyTotalMs) * 100 : 0,
      isLongest: custodyLeadMs > 0 && entry.ms === custodyLeadMs,
    }))
    .sort((a, b) => b.ms - a.ms);

  /* ── The clock, per container and across them ───────────────────────── */
  const clockOf = (report: MissionReport): number | null =>
    report.kpis.totalMs ?? report.kpis.elapsedMs;
  const clocks = collect(live, clockOf);
  const longestClockMs = Math.max(...clocks, 0);
  const longestReport =
    live.find((report) => clockOf(report) === longestClockMs && longestClockMs > 0) ?? null;

  /* The consignment's own span: the first thing that happened on any of its
     containers, to the last — never a sum, which would count parallel trucks
     twice and report a two-day shipment as taking a week. */
  const eventTimes = reports.flatMap((report) =>
    report.journey.map((step) => step.at).filter((at): at is number => at !== null),
  );
  const spanFrom = eventTimes.length > 0 ? Math.min(...eventTimes) : null;
  const lastEvent = eventTimes.length > 0 ? Math.max(...eventTimes) : null;
  const allClosed = live.length > 0 && closed.length === live.length;
  const spanTo = lastEvent === null ? null : allClosed ? lastEvent : now;

  /* ── The boxes ──────────────────────────────────────────────────────── */
  const states = withBox.map((report) =>
    containerStateOf(report.overview.status, true),
  );
  const returned = states.filter((state) => state === 'returned').length;
  const out = states.filter((state) => state === 'empty').length;
  const stillFull = states.filter((state) => state === 'full').length;

  const outstanding = withBox.filter((report) => report.containerReturn.returnedAt === null);
  const deadlines = outstanding
    .map((report) => report.containerReturn.deadlineAt)
    .filter((at): at is number => at !== null);

  const detentionCases = withBox.filter((report) => report.containerReturn.detention);
  const currency = withBox[0]?.containerReturn.detentionCurrency ?? detentionRateCurrency();
  const ratePerDay =
    withBox[0]?.containerReturn.detentionRatePerDay ?? detentionRatePerContainerDay();

  /* ── Exceptions ─────────────────────────────────────────────────────── */
  const exceptionCounts = new Map<MissionException['code'], ShipmentExceptionRow>();
  for (const report of reports) {
    for (const exception of report.exceptions) {
      const row = exceptionCounts.get(exception.code) ?? {
        code: exception.code,
        label: EXCEPTION_LABELS[exception.code],
        level: exception.level,
        count: 0,
      };
      row.count += 1;
      /* A `delayed` sighting outranks an `attention` one of the same kind. */
      if (exception.level === 'delayed') row.level = 'delayed';
      exceptionCounts.set(exception.code, row);
    }
  }

  /* ── Who moved it ───────────────────────────────────────────────────── */
  const transporterCounts = new Map<string, number>();
  for (const report of reports) {
    const name = report.overview.transporter;
    if (!name || name === '—') continue;
    transporterCounts.set(name, (transporterCounts.get(name) ?? 0) + 1);
  }

  /* ── The rail ───────────────────────────────────────────────────────── */
  const rows: ShipmentContainerRow[] = reports.map((report) => {
    const clockMs = clockOf(report);
    return {
      bookingId: report.bookingId,
      reference: report.overview.missionId,
      containerNumber: report.overview.containerNumber,
      status: report.overview.status,
      statusLabel: displayShipmentStatus(report.overview.status),
      state: containerStateOf(
        report.overview.status,
        report.containerReturn.hasContainer,
      ),
      performance: report.status,
      isTerminated: report.overview.isTerminated,
      isClosed: report.isClosed,
      transporter: report.overview.transporter,
      clockMs,
      isRunning: report.kpis.totalMs === null && !report.overview.isTerminated,
      depotageMs: report.kpis.depotageMs,
      returnStatus: report.containerReturn.status,
      detentionDays: report.containerReturn.detentionDays,
      detentionFees: report.containerReturn.detentionFees,
      exceptions: report.exceptions.length,
      progress: report.journeyProgress,
      share:
        longestClockMs > 0 && clockMs !== null ? (clockMs / longestClockMs) * 100 : 0,
    };
  });

  const onTimeCount = closed.filter(isOnTimeMission).length;

  return {
    containers: {
      total: reports.length,
      withBox: withBox.length,
      running: live.length - closed.length,
      closed: closed.length,
      terminated: reports.length - live.length,
      delivered: reports.filter((report) => report.overview.deliveredAt !== null).length,
    },
    onTime: {
      closed: closed.length,
      onTime: onTimeCount,
      pct: closed.length > 0 ? Math.round((onTimeCount / closed.length) * 100) : null,
    },
    time: {
      spanMs: spanFrom !== null && spanTo !== null ? Math.max(spanTo - spanFrom, 0) : null,
      spanFrom,
      spanTo,
      avgMissionMs: mean(collect(closed, (report) => report.kpis.totalMs)),
      longestMissionMs: longestClockMs > 0 ? longestClockMs : null,
      longestBookingId: longestReport?.bookingId ?? null,
      totalWaitMs: collect(reports, (report) => report.kpis.waitTotalMs).reduce((a, b) => a + b, 0),
      avgDepotageMs: mean(collect(reports, (report) => report.kpis.depotageMs)),
      workedMs: cycleMs,
    },
    stages,
    custody: {
      segments: custodySegments,
      totalMs: custodyTotalMs,
      lead: custodySegments.find((segment) => segment.isLongest) ?? null,
    },
    containerReturn: {
      withBox: withBox.length,
      stillFull,
      out,
      returned,
      late: withBox.filter((report) => report.containerReturn.status === 'delayed').length,
      dueSoon: withBox.filter((report) => report.containerReturn.status === 'due_soon').length,
      nextDeadlineAt: deadlines.length > 0 ? Math.min(...deadlines) : null,
      detentionCases: detentionCases.length,
      detentionDays: detentionCases.reduce(
        (sum, report) => sum + report.containerReturn.detentionDays,
        0,
      ),
      detentionFees: detentionCases.reduce(
        (sum, report) => sum + report.containerReturn.detentionFees,
        0,
      ),
      currency,
      ratePerDay,
      oneMoreDayCost: outstanding.length * ratePerDay,
    },
    exceptions: [...exceptionCounts.values()].sort((a, b) => b.count - a.count),
    rows,
    transporters: [...transporterCounts.entries()]
      .map(([name, containers]) => ({ name, containers }))
      .sort((a, b) => b.containers - a.containers),
    status: live.reduce<MissionPerformanceStatus>(
      (worst, report) => (RANK[report.status] > RANK[worst] ? report.status : worst),
      'ontime',
    ),
  };
}
