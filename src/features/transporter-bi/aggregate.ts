import { chooseGranularity, previousPeriod, type Period } from '@/lib/bi/time';
import { SETTLEMENT_WEEKDAY } from './config';
import {
  applyFilters,
  buildKpi,
  buildSeries,
  deriveTripFacts,
  fleetSnapshot,
  fleetStateSeries,
  inPeriod,
  type TripFact,
} from './derive';
import type { KpiMetric, TransporterDataset, TransporterFilters } from './contracts';

/**
 * The overview aggregation: the six numbers the scope's Business Overview
 * names, each with its previous-period value and a real calendar sparkline.
 *
 * The scope defines every KPI "vs previous period", so deltas are computed
 * unconditionally here; the compare toggle governs the heavier prior-period
 * overlays inside the section charts.
 */

export interface TransporterOverviewKpis {
  fleetUtilization: KpiMetric;
  idleFleet: KpiMetric;
  totalEarnings: KpiMetric;
  earningsPerTrip: KpiMetric;
  onTimeRate: KpiMetric;
  outstandingPayments: KpiMetric;
}

export interface TransporterOverview {
  kpis: TransporterOverviewKpis;
  /** The nearest upcoming settlement run and what clears in it. */
  nextSettlement?: { date: string; amount: number };
  meta: { generatedAt: string; tripCount: number };
}

export function aggregateOverview(
  dataset: TransporterDataset,
  filters: TransporterFilters,
): TransporterOverview {
  const period: Period = { from: filters.from, to: filters.to };
  const prior = previousPeriod(period);
  const granularity = chooseGranularity(period);

  const allFacts = applyFilters(deriveTripFacts(dataset), filters);
  const current = inPeriod(allFacts, period);
  const previous = inPeriod(allFacts, prior);

  const completed = current.filter((fact) => fact.isCompleted);
  const previousCompleted = previous.filter((fact) => fact.isCompleted);

  /* ── Fleet utilisation + idle, from the fleet log ─────────────────── */
  const fleet = fleetSnapshot(dataset, period, filters.vehicleIds);
  const previousFleet = fleetSnapshot(dataset, prior, filters.vehicleIds);

  const states = fleetStateSeries(dataset, period, granularity, filters.vehicleIds);
  const emptySeries = { points: [] as Array<{ t: string; v: number }> };
  const activeSeries = states.find((series) => series.key === 'active') ?? emptySeries;
  const idleSeries = states.find((series) => series.key === 'idle') ?? emptySeries;
  const utilizationTrend = activeSeries.points.map((point, index) => {
    const idle = idleSeries.points[index]?.v ?? 0;
    const available = point.v + idle;
    return { t: point.t, v: available > 0 ? Math.round((point.v / available) * 1000) / 1000 : 0 };
  });

  /* ── Earnings ─────────────────────────────────────────────────────── */
  const sumRevenue = (facts: TripFact[]) =>
    facts.reduce((sum, fact) => sum + fact.totalRevenue, 0);
  const earnings = sumRevenue(completed);
  const previousEarnings = sumRevenue(previousCompleted);

  const earningsTrend = buildSeries({
    facts: completed,
    period,
    granularity,
    valueOf: (fact) => fact.totalRevenue,
    aggregate: 'sum',
  });

  const perTripTrend = buildSeries({
    facts: completed,
    period,
    granularity,
    valueOf: (fact) => fact.totalRevenue,
    aggregate: 'mean',
  });

  /* ── On-time ──────────────────────────────────────────────────────── */
  const onTimeShare = (facts: TripFact[]) => {
    const judged = facts.filter((fact) => fact.onTime !== undefined);
    if (judged.length === 0) return undefined;
    return judged.filter((fact) => fact.onTime).length / judged.length;
  };
  const onTime = onTimeShare(completed);
  const previousOnTime = onTimeShare(previousCompleted);
  const lateTrips = completed.filter((fact) => fact.onTime === false);

  const onTimeTrend = buildSeries({
    facts: completed.filter((fact) => fact.onTime !== undefined),
    period,
    granularity,
    valueOf: (fact) => (fact.onTime ? 1 : 0),
    aggregate: 'mean',
  });

  /* ── Outstanding payments: a stock, not a flow ────────────────────── */
  const unpaid = allFacts.filter((fact) => (fact.payment?.outstanding ?? 0) > 0);
  const outstanding = unpaid.reduce((sum, fact) => sum + (fact.payment?.outstanding ?? 0), 0);

  // Overdue invoices whose scheduled run already passed roll into the next
  // one — money does not vanish off the settlement calendar by being late.
  const today = dataset.generatedAt.slice(0, 10);
  const nextRun = (() => {
    const date = new Date(`${today}T00:00:00.000Z`);
    while (date.getUTCDay() !== SETTLEMENT_WEEKDAY) date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10);
  })();

  const settlements = new Map<string, number>();
  for (const fact of unpaid) {
    const payment = fact.payment;
    if (!payment) continue;
    const scheduled = payment.expectedSettlementAt;
    const date = scheduled >= today ? scheduled : nextRun;
    settlements.set(date, (settlements.get(date) ?? 0) + payment.outstanding);
  }
  const upcoming = Array.from(settlements.entries()).sort(([a], [b]) => a.localeCompare(b));
  const nextSettlement = upcoming[0]
    ? { date: upcoming[0][0], amount: upcoming[0][1] }
    : undefined;

  const outstandingTrend = upcoming
    .slice(0, 8)
    .map(([date, amount]) => ({ t: date, v: amount }));

  /* ── Assemble ─────────────────────────────────────────────────────── */
  const kpis: TransporterOverviewKpis = {
    fleetUtilization: buildKpi({
      key: 'fleet_utilization',
      label: 'Fleet Utilization',
      value: fleet.utilization,
      unit: 'percent',
      polarity: 'higher_is_better',
      previousValue: previousFleet.utilization || undefined,
      trend: utilizationTrend,
      caption: `${fleet.activeDays} active vehicle-days`,
    }),
    idleFleet: buildKpi({
      key: 'idle_fleet',
      label: 'Idle Fleet',
      value: fleet.idleDays,
      unit: 'days',
      polarity: 'lower_is_better',
      previousValue: previousFleet.idleDays || undefined,
      trend: idleSeries.points,
      caption: 'Vehicle-days without a job',
    }),
    totalEarnings: buildKpi({
      key: 'total_earnings',
      label: 'Total Earnings',
      value: earnings,
      unit: 'currency',
      polarity: 'higher_is_better',
      previousValue: previousEarnings || undefined,
      trend: earningsTrend.points,
      caption: `${completed.length} completed trips`,
      detail: {
        kind: 'trips',
        title: 'Completed trips in period',
        description: 'The trips behind the earnings figure.',
        narrow: { statuses: ['completed'] },
      },
    }),
    earningsPerTrip: buildKpi({
      key: 'earnings_per_trip',
      label: 'Earnings / Trip',
      value: completed.length > 0 ? earnings / completed.length : 0,
      unit: 'currency',
      polarity: 'higher_is_better',
      previousValue:
        previousCompleted.length > 0
          ? previousEarnings / previousCompleted.length
          : undefined,
      trend: perTripTrend.points,
      caption: 'Incl. matched backhauls',
      detail: {
        kind: 'trips',
        title: 'Completed trips in period',
        narrow: { statuses: ['completed'] },
      },
    }),
    onTimeRate: buildKpi({
      key: 'on_time_rate',
      label: 'On-Time Rate',
      value: onTime ?? 0,
      unit: 'percent',
      polarity: 'higher_is_better',
      previousValue: previousOnTime,
      trend: onTimeTrend.points,
      caption: `${lateTrips.length} late deliver${lateTrips.length === 1 ? 'y' : 'ies'}`,
      detail:
        lateTrips.length > 0
          ? {
              kind: 'trips',
              title: 'Late deliveries',
              description: 'Completed trips that missed the committed window.',
              tripIds: lateTrips.map((fact) => fact.tripId),
            }
          : undefined,
    }),
    outstandingPayments: buildKpi({
      key: 'outstanding_payments',
      label: 'Outstanding Payments',
      value: outstanding,
      unit: 'currency',
      polarity: 'lower_is_better',
      trend: outstandingTrend,
      caption: nextSettlement
        ? `Next settlement ${nextSettlement.date}`
        : 'No settlement scheduled',
      detail:
        unpaid.length > 0
          ? {
              kind: 'trips',
              title: 'Unsettled invoices',
              description: 'Completed trips whose invoices have not been paid.',
              tripIds: unpaid.map((fact) => fact.tripId),
              ignorePeriod: true,
            }
          : undefined,
    }),
  };

  return {
    kpis,
    nextSettlement,
    meta: { generatedAt: dataset.generatedAt, tripCount: current.length },
  };
}
