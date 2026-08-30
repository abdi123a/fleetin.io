import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { bookingQueryKeys } from '@/features/bookings/api/queries';
import { fetchBooking, type BookingRecord } from '@/features/bookings/api/bookingsService';
import { useCycles } from '@/features/empty-returns/api/queries';
import type { EmptyReturnCycleRecord } from '@/features/empty-returns/api/emptyReturnsService';
import { useBiDataset } from '@/features/shipper-bi/api/queries';
import { EMPTY_BI_DATASET } from '@/features/shipper-bi/api/biService';
import { STAGE_LABELS } from '@/features/shipper-bi/contracts';
import { deriveFacts } from '@/lib/bi/derive';
import { computeMissionReport, type MissionReport } from './missionReport';
import { computeMonthlyReport, type MonthlyReport } from './monthlyReport';

/**
 * The shipper reporting system's data layer.
 *
 * Two reports, one source of truth. The mission index — which missions the
 * account ran, and when — comes from the shipper-scoped BI dataset, a single
 * request the portal already makes. Every *duration* comes from the booking's
 * own status timeline, fetched per mission, because that ladder records all
 * twelve lifecycle events while the BI dataset collapses several of them into
 * coarser stages (it cannot tell "arrived at pickup" from "loading started",
 * which is precisely the pickup waiting time the report is asked for).
 *
 * The monthly report therefore aggregates the very same `MissionReport` objects
 * the shipper can open individually: the month's average can never disagree
 * with the missions behind it.
 */

export interface MissionIndexRow {
  /** The booking id — what `/bookings/:id` is fetched with. */
  bookingId: string;
  reference: string;
  /** The parent consignment reference, where the mission belongs to one. */
  containerNo?: string;
  transporter: string;
  origin: string;
  destination: string;
  /** Mission start, for month bucketing. */
  createdAt: string;
  /** The promised delivery instant — the only date not derived from an event. */
  plannedDeliveryAt: string;
  deliveredAt?: string;
  returnedAt?: string;
  freeTimeExpiresAt?: string;
  detentionDays: number;
  isDelivered: boolean;
  isOpen: boolean;
  stageLabel: string;
}

/** Every mission the shipper has run, newest first. */
export function useShipperMissionIndex(
  shipperId: string,
  asOf: Date,
): { rows: MissionIndexRow[]; isLoading: boolean } {
  const { data, isLoading } = useBiDataset(shipperId, asOf);

  const rows = useMemo(() => {
    const dataset = data ?? EMPTY_BI_DATASET;
    const transporters = new Map(dataset.transporters.map((t) => [t.id, t.name]));
    const routes = new Map(dataset.routes.map((r) => [r.id, r]));
    const containers = new Map(dataset.containers.map((c) => [c.shipmentId, c]));

    return deriveFacts(dataset)
      .map((fact): MissionIndexRow => {
        const route = routes.get(fact.routeId);
        const container = containers.get(fact.shipmentId);
        return {
          bookingId: fact.shipmentId,
          reference: fact.reference,
          containerNo: container?.containerNo,
          transporter: transporters.get(fact.transporterId) ?? 'Unassigned',
          origin: route?.originName ?? '—',
          destination: route?.destinationName ?? '—',
          createdAt: fact.createdAt,
          plannedDeliveryAt: fact.plannedDeliveryAt,
          deliveredAt: fact.deliveredAt,
          returnedAt: fact.returnedAt,
          freeTimeExpiresAt: fact.freeTimeExpiresAt,
          detentionDays: fact.detentionDays,
          isDelivered: fact.isDelivered,
          isOpen: fact.isOpen,
          stageLabel: STAGE_LABELS[fact.currentStage],
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [data]);

  return { rows, isLoading };
}

/** Cycle per booking — the container half of every mission. */
export function useCyclesByBookingId(): Map<string, EmptyReturnCycleRecord> {
  const { data } = useCycles();
  return useMemo(() => {
    const map = new Map<string, EmptyReturnCycleRecord>();
    for (const cycle of data ?? []) map.set(cycle.bookingId, cycle);
    return map;
  }, [data]);
}

/**
 * `useQueries` over the month's bookings.
 *
 * One request per mission, which is what full fidelity costs: only the detail
 * endpoint returns the status timeline. They are cached under the same keys the
 * rest of the app uses, so a mission opened from the list is already loaded
 * when the month is opened, and vice versa.
 */
function useBookingDetails(bookingIds: string[]): {
  byId: Map<string, BookingRecord>;
  loaded: number;
  total: number;
} {
  const results = useQueries({
    queries: bookingIds.map((id) => ({
      queryKey: bookingQueryKeys.detail(id),
      queryFn: () => fetchBooking(id),
      staleTime: 5 * 60 * 1000,
    })),
  });

  return useMemo(() => {
    const byId = new Map<string, BookingRecord>();
    let loaded = 0;
    results.forEach((result, index) => {
      const id = bookingIds[index];
      if (result.data && id) {
        byId.set(id, result.data);
        loaded += 1;
      } else if (result.isError) {
        loaded += 1;
      }
    });
    return { byId, loaded, total: bookingIds.length };
  }, [results, bookingIds]);
}

export interface MissionReportsResult {
  reports: MissionReport[];
  /** Missions resolved so far, and how many the month holds. */
  loaded: number;
  total: number;
  isLoading: boolean;
}

/** Mission reports for an explicit set of missions, in the order given. */
export function useMissionReports(
  rows: MissionIndexRow[],
  now: number,
  /** The account the reports are addressed to — see `MissionReportInput.shipperName`. */
  shipperName?: string,
): MissionReportsResult {
  const ids = useMemo(() => rows.map((row) => row.bookingId), [rows]);
  const { byId, loaded, total } = useBookingDetails(ids);
  const cycles = useCyclesByBookingId();

  const reports = useMemo(
    () =>
      rows
        .map((row) => {
          const booking = byId.get(row.bookingId);
          if (!booking) return null;
          return computeMissionReport({
            booking,
            cycle: cycles.get(booking.id),
            now,
            plannedDeliveryAt: row.plannedDeliveryAt,
            shipperName,
          });
        })
        .filter((report): report is MissionReport => report !== null),
    [rows, byId, cycles, now, shipperName],
  );

  return { reports, loaded, total, isLoading: total > 0 && loaded < total };
}

/**
 * Mission reports for every container of ONE shipment.
 *
 * The operations side of the same data layer. The caller already holds the
 * shipment's booking rows and its empty-return cycles; what it does not hold is
 * the status timelines, and those come from the very per-booking detail cache a
 * single mission report reads — so switching from the shipment's analytics to
 * one container's report costs no request, in either direction.
 *
 * No `plannedDeliveryAt` here: the promise lives on the BI dataset, which is
 * shipper-scoped and not fetched on the operations side. The reports therefore
 * carry every measured figure and no delivery-outcome verdict, which is honest
 * — inventing a promise to score against would be worse than omitting it.
 */
export function useShipmentMissionReports(
  bookings: BookingRecord[],
  cyclesByBookingId: Map<string, EmptyReturnCycleRecord>,
  now: number,
): MissionReportsResult {
  /* Keyed on the ids themselves: the query list must not be rebuilt because a
     parent re-rendered with an equal-but-new array. */
  const key = bookings.map((booking) => booking.id).join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ids = useMemo(() => (key ? key.split('|') : []), [key]);
  const { byId, loaded, total } = useBookingDetails(ids);

  const reports = useMemo(
    () =>
      ids
        .map((id) => {
          const booking = byId.get(id);
          if (!booking) return null;
          return computeMissionReport({
            booking,
            cycle: cyclesByBookingId.get(booking.id),
            now,
          });
        })
        .filter((report): report is MissionReport => report !== null),
    [ids, byId, cyclesByBookingId, now],
  );

  return { reports, loaded, total, isLoading: total > 0 && loaded < total };
}

/** One mission's report — the panel a shipper opens from the list. */
export function useMissionReport(
  row: MissionIndexRow | undefined,
  now: number,
  shipperName?: string,
): { report: MissionReport | null; isLoading: boolean } {
  const rows = useMemo(() => (row ? [row] : []), [row]);
  const { reports, isLoading } = useMissionReports(rows, now, shipperName);
  return { report: reports[0] ?? null, isLoading };
}

export interface ShipperMonthlyReportResult {
  report: MonthlyReport;
  loaded: number;
  total: number;
  isLoading: boolean;
  /** Missions started in the month, before their timelines are resolved. */
  monthRows: MissionIndexRow[];
}

/**
 * The monthly performance report.
 *
 * A mission belongs to the month it *started* in, so a report is stable once
 * the month is over: bucketing by closure would move a mission between months
 * as its empty came back, and last month's report would change every day.
 */
export function useShipperMonthlyReport({
  shipperId,
  month,
  asOf,
  shipperName,
}: {
  shipperId: string;
  /** First instant of the month to report on. */
  month: Date;
  asOf: Date;
  shipperName?: string;
}): ShipperMonthlyReportResult {
  const { rows } = useShipperMissionIndex(shipperId, asOf);

  const monthStart = useMemo(() => new Date(month.getFullYear(), month.getMonth(), 1), [month]);
  const monthEnd = useMemo(
    () => new Date(month.getFullYear(), month.getMonth() + 1, 1),
    [month],
  );

  const monthRows = useMemo(() => {
    const from = monthStart.getTime();
    const to = monthEnd.getTime();
    return rows.filter((row) => {
      const at = new Date(row.createdAt).getTime();
      return !Number.isNaN(at) && at >= from && at < to;
    });
  }, [rows, monthStart, monthEnd]);

  const now = useMemo(() => asOf.getTime(), [asOf]);
  const { reports, loaded, total, isLoading } = useMissionReports(monthRows, now, shipperName);

  const report = useMemo(
    () => computeMonthlyReport(reports, monthStart, monthEnd, now),
    [reports, monthStart, monthEnd, now],
  );

  return { report, loaded, total, isLoading, monthRows };
}
