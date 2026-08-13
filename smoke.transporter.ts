import { generateDataset } from './src/features/transporter-bi/mocks/generateDataset';
import { deriveTripFacts, fleetSnapshot } from './src/features/transporter-bi/derive';
import { aggregateOverview } from './src/features/transporter-bi/aggregate';
import { DEFAULT_TRANSPORTER_FILTERS } from './src/features/transporter-bi/contracts';
import { resolvePreset } from './src/lib/bi/time';

const asOf = new Date('2026-08-06T10:00:00.000Z');
const t0 = performance.now();
const dataset = generateDataset({ transporterId: 'TRP-01', asOf });
const facts = deriveTripFacts(dataset);
const t1 = performance.now();

const completed = facts.filter((f) => f.isCompleted);
const live = facts.filter((f) => f.isLive);
const judged = completed.filter((f) => f.onTime !== undefined);
const onTime = judged.filter((f) => f.onTime).length / judged.length;
const matched = completed.filter((f) => f.backhaulStatus === 'matched').length;
const emptyRate = completed.filter((f) => f.backhaulStatus === 'empty').length / completed.length;
const delayed = completed.filter((f) => f.isDelayed).length / completed.length;
type Fact = (typeof facts)[number];
/** A fact narrowed to the ones carrying a payment record, so `.payment` is safe. */
type UnpaidFact = Fact & { payment: NonNullable<Fact['payment']> };

const unpaid = facts.filter((f): f is UnpaidFact => (f.payment?.outstanding ?? 0) > 0);
const overdue = unpaid.filter((f) => f.payment.status === 'overdue');
const riskAlerts = facts.filter((f) => f.emptyReturnRisk >= 40);

const period = resolvePreset('last_30_days', asOf);
const fleet = fleetSnapshot(dataset, period);
const overview = aggregateOverview(dataset, { ...DEFAULT_TRANSPORTER_FILTERS, ...period });

console.log(JSON.stringify({
  genMs: Math.round(t1 - t0),
  trips: facts.length,
  completed: completed.length,
  live: live.length,
  liveByStatus: Object.fromEntries(
    ['scheduled','loading','enroute','at_destination','returning'].map(
      (s) => [s, live.filter((f) => f.status === s).length],
    ),
  ),
  cancelled: facts.filter((f) => f.isCancelled).length,
  onTimeRate: +(onTime).toFixed(3),
  delayedShare: +delayed.toFixed(3),
  backhaulMatchRate: +(matched / completed.length).toFixed(3),
  emptyReturnRate: +emptyRate.toFixed(3),
  offers: dataset.offers.length,
  acceptance: +(dataset.offers.filter((o) => o.outcome === 'accepted').length / dataset.offers.length).toFixed(3),
  opportunities: dataset.opportunities.length,
  matchedOpportunities: dataset.opportunities.filter((o) => o.matchedTripId).length,
  riskAlerts: riskAlerts.length,
  utilization30d: +fleet.utilization.toFixed(3),
  idleDays30d: fleet.idleDays,
  outstandingUsd: Math.round(unpaid.reduce((s, f) => s + f.payment.outstanding, 0)),
  overdueInvoices: overdue.length,
  agingSpread: Object.fromEntries(
    ['current','b1_15','b16_30','b31_45','b46_plus'].map(
      (b) => [b, unpaid.filter((f) => f.payment.agingBucket === b).length],
    ),
  ),
  earnings30d: overview.kpis.totalEarnings.value,
  earningsDelta: overview.kpis.totalEarnings.deltaPct,
  perTrip: Math.round(overview.kpis.earningsPerTrip.value),
  nextSettlement: overview.nextSettlement,
  avgRating: +(completed.filter((f) => f.rating).reduce((s, f) => s + (f.rating ?? 0), 0) / completed.filter((f) => f.rating).length).toFixed(2),
  yourNetworkRank: dataset.network.peers.findIndex((p) => p.isYou) + 1,
  peerCount: dataset.network.peers.length,
}, null, 1));
