import type {
  BackhaulStatus,
  ContainerType,
  DelayCause,
  FleetState,
  OfferOutcome,
  TripStatus,
  TruckType,
  WaitingLocation,
} from './enums';

/**
 * The entities of one transporter's book of work.
 *
 * Everything the portal renders derives from this dataset — trips are the
 * fact spine, and offers / opportunities / the fleet log carry what a trip
 * alone cannot: the loads we said no to, the return loads on the board right
 * now, and what every vehicle-day was spent on.
 *
 * ISO strings for all instants (`YYYY-MM-DDTHH:mm:ss.sssZ`) and `YYYY-MM-DD`
 * for calendar days, matching `@/lib/bi/time`'s UTC discipline.
 */

export interface TransporterProfile {
  id: string;
  name: string;
  fleetCode: string;
  country: string;
  joinedNetworkAt: string;
}

export interface Vehicle {
  id: string;
  plateNumber: string;
  truckType: TruckType;
  model: string;
  year: number;
  capacityTons: number;
  gpsEnabled: boolean;
}

export interface Driver {
  id: string;
  name: string;
  phone: string;
  licenseNumber: string;
  joinedAt: string;
  /** Long-run quality of this driver; per-trip ratings vary around it. */
}

export interface TransporterRoute {
  id: string;
  name: string;
  originName: string;
  originLat: number;
  originLng: number;
  destinationName: string;
  destinationLat: number;
  destinationLng: number;
  distanceKm: number;
  nominalTransitHours: number;
  /** Contracted linehaul rate for the loaded leg, USD per km. */
  ratePerKm: number;
}

export interface Customer {
  id: string;
  name: string;
  industry: string;
}

export interface DelaySegment {
  cause: DelayCause;
  minutes: number;
}

export interface WaitingSegment {
  location: WaitingLocation;
  hours: number;
}

export interface TripPayment {
  invoiceNo: string;
  invoicedAt: string;
  /** Invoiced amount: outbound revenue plus any matched backhaul revenue. */
  amount: number;
  dueAt: string;
  paidAt?: string;
  /** The weekly settlement run this invoice is expected to clear in. */
  expectedSettlementAt: string;
}

export interface TripBackhaul {
  status: BackhaulStatus;
  /** Revenue earned on the matched return load. */
  revenue?: number;
  /** Loaded km driven on the return leg when a backhaul was matched. */
  loadedKm?: number;
  /** Km driven with no cargo — the deadhead to a pickup, or the whole way home. */
  emptyKm: number;
  /** Reference of the matched return load, when there is one. */
  matchedLoadRef?: string;
}

export interface Trip {
  id: string;
  /** Fleetin booking reference, e.g. FL-2026-4231. */
  ref: string;
  routeId: string;
  vehicleId: string;
  driverId: string;
  customerId: string;
  containerType: ContainerType;
  cargo: string;
  status: TripStatus;

  offeredAt: string;
  acceptedAt: string;
  /** Loading began. */
  startedAt?: string;
  /** Gate-out, wheels rolling. */
  departedAt?: string;
  plannedDeliveryAt: string;
  deliveredAt?: string;
  /** Live trips only: fraction of the outbound leg completed, 0–1. */
  progressPct?: number;
  /** Live trips only: current arrival estimate. */
  etaAt?: string;

  /** Outbound loaded distance (the route's distance). */
  distanceKm: number;
  /** Outbound revenue, USD. */
  revenue: number;

  delays: DelaySegment[];
  waiting: WaitingSegment[];

  /** Customer rating for the trip, completed trips only. */
  /** Operational incident recorded against the trip, when one occurred. */
  incident?: string;

  backhaul: TripBackhaul;
  payment?: TripPayment;
}

export interface LoadOffer {
  id: string;
  offeredAt: string;
  routeId: string;
  customerId: string;
  containerType: ContainerType;
  revenueEst: number;
  outcome: OfferOutcome;
  declineReason?: string;
  /** The trip this offer became, when accepted. */
  tripId?: string;
}

/**
 * A return load on the board right now.
 *
 * The matching engine's output: a load whose pickup sits near where one of our
 * vehicles is about to go empty. `co2SavedKg` and `emptyKmAvoided` are what
 * accepting it buys versus driving home empty — the number the whole backhaul
 * agenda exists to move.
 */
export interface BackhaulOpportunity {
  id: string;
  postedAt: string;
  originName: string;
  originLat: number;
  originLng: number;
  destinationName: string;
  destinationLat: number;
  destinationLng: number;
  customerName: string;
  cargo: string;
  containerType: ContainerType;
  pickupWindowStart: string;
  pickupWindowEnd: string;
  /** Offered rate for the return load, USD. */
  revenue: number;
  /** Loaded distance of the return load. */
  distanceKm: number;
  /** Km from the matched vehicle's drop-off point to this pickup. */
  deadheadKm: number;
  /** Our trip whose vehicle this load lines up with, when one is finishing nearby. */
  matchedTripId?: string;
  /** 0–1: window fit, deadhead, and rate quality combined. */
  matchScore: number;
  emptyKmAvoided: number;
  co2SavedKg: number;
  status: 'available' | 'reserved';
}

/** One vehicle-day of the fleet log: what that day was spent on. */
export interface FleetDay {
  /** YYYY-MM-DD. */
  date: string;
  vehicleId: string;
  state: FleetState;
}

export interface NetworkPeer {
  id: string;
  /** Anonymised for everyone but us — the network shows positions, not names. */
  label: string;
  isYou: boolean;
  onTimeRate: number;
  acceptanceRate: number;
  delayRate: number;
  /** Cost vs network average: 1.0 is the market, above is premium. */
  costIndex: number;
  /** Composite 0–100 used by the reliability leaderboard. */
  reliabilityScore: number;
  trips: number;
}

/** How many offers/week carriers in each performance band receive. */
export interface OpportunityBand {
  key: string;
  label: string;
  offersPerWeek: number;
  carriers: number;
}

export interface NetworkBenchmark {
  onTimeRate: number;
  acceptanceRate: number;
  avgDelayMinutes: number;
  /** Share of completed trips the network drives home empty. */
  emptyReturnRate: number;
  /** Gate-in to gate-out at the delivery end, hours. */
  avgTurnaroundHours: number;
  /**
   * Hours a network truck waits at each point of the cycle.
   *
   * The benchmark the waiting panel draws its tick against: "3.6 h at a
   * consignee site" is not a finding until the reader can see the network
   * spends 2.4 h there.
   */
  avgWaitingHoursByLocation: Record<WaitingLocation, number>;
  peers: NetworkPeer[];
  opportunityBands: OpportunityBand[];
}

export interface TransporterDataset {
  transporter: TransporterProfile;
  vehicles: Vehicle[];
  drivers: Driver[];
  routes: TransporterRoute[];
  customers: Customer[];
  trips: Trip[];
  offers: LoadOffer[];
  opportunities: BackhaulOpportunity[];
  fleetLog: FleetDay[];
  network: NetworkBenchmark;
  generatedAt: string;
}
