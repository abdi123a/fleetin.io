import type { Depot, Route, Transporter } from '../contracts';

/**
 * The fixed dimensions of the mock world.
 *
 * Real Djibouti corridor geography — Doraleh and PK12 out to Dire Dawa, Adama
 * and Addis — so the tracking map shows a plausible route shape rather than
 * markers scattered in the sea, and so distances feed transit times that look
 * like the ones an operator would recognise.
 */

export const MOCK_TRANSPORTERS: Transporter[] = [
  { id: 'TRP-01', name: 'Horn Logistics', fleetCode: 'HRN', slaOnTimeTarget: 0.92 },
  { id: 'TRP-02', name: 'Bab El Mandeb Transit', fleetCode: 'BEM', slaOnTimeTarget: 0.9 },
  { id: 'TRP-03', name: 'Awash Freight Lines', fleetCode: 'AWF', slaOnTimeTarget: 0.88 },
  { id: 'TRP-04', name: 'Tadjoura Haulage', fleetCode: 'TDJ' },
  { id: 'TRP-05', name: 'Red Sea Movers', fleetCode: 'RSM', slaOnTimeTarget: 0.85 },
];

export const MOCK_ROUTES: Route[] = [
  {
    id: 'RTE-01',
    name: 'Doraleh → Addis Ababa',
    originName: 'Doraleh Multipurpose Port',
    originLat: 11.6094,
    originLng: 43.0567,
    destinationName: 'Addis Ababa Dry Port',
    destinationLat: 8.9806,
    destinationLng: 38.7578,
    distanceKm: 910,
    nominalTransitHours: 26,
  },
  {
    id: 'RTE-02',
    name: 'Doraleh → Dire Dawa',
    originName: 'Doraleh Multipurpose Port',
    originLat: 11.6094,
    originLng: 43.0567,
    destinationName: 'Dire Dawa Industrial Park',
    destinationLat: 9.5931,
    destinationLng: 41.8661,
    distanceKm: 320,
    nominalTransitHours: 11,
  },
  {
    id: 'RTE-03',
    name: 'PK12 → Adama',
    originName: 'PK12 Free Zone',
    originLat: 11.5406,
    originLng: 43.0722,
    destinationName: 'Adama Logistics Hub',
    destinationLat: 8.5401,
    destinationLng: 39.2705,
    distanceKm: 790,
    nominalTransitHours: 23,
  },
  {
    id: 'RTE-04',
    name: 'Doraleh → Mekelle',
    originName: 'Doraleh Multipurpose Port',
    originLat: 11.6094,
    originLng: 43.0567,
    destinationName: 'Mekelle Terminal',
    destinationLat: 13.4967,
    destinationLng: 39.4753,
    distanceKm: 780,
    nominalTransitHours: 25,
  },
  {
    id: 'RTE-05',
    name: 'Djibouti City → Ali Sabieh',
    originName: 'Djibouti City Depot',
    originLat: 11.5721,
    originLng: 43.1456,
    destinationName: 'Ali Sabieh Yard',
    destinationLat: 11.1558,
    destinationLng: 42.7125,
    distanceKm: 95,
    nominalTransitHours: 4,
  },
  {
    id: 'RTE-06',
    name: 'PK12 → Hawassa',
    originName: 'PK12 Free Zone',
    originLat: 11.5406,
    originLng: 43.0722,
    destinationName: 'Hawassa Industrial Park',
    destinationLat: 7.0621,
    destinationLng: 38.4764,
    distanceKm: 1150,
    nominalTransitHours: 34,
  },
];

export const MOCK_DEPOTS: Depot[] = [
  { id: 'DEP-01', name: 'Doraleh Empty Depot', lat: 11.6021, lng: 43.0489 },
  { id: 'DEP-02', name: 'PK12 Container Yard', lat: 11.5412, lng: 43.0688 },
  { id: 'DEP-03', name: 'Dire Dawa Depot', lat: 9.5872, lng: 41.8542 },
];

export const MOCK_SHIPPING_LINES = [
  'Maersk',
  'CMA CGM',
  'MSC',
  'Hapag-Lloyd',
  'PIL',
] as const;

/**
 * Base freight per kilometre, by transporter.
 *
 * Deliberately uncorrelated with reliability so the cost-vs-reliability
 * quadrant chart has something to say: the cheapest carrier here is also the
 * least punctual, which is exactly the trade-off that view exists to surface.
 */
export const TRANSPORTER_RATE_PER_KM: Record<string, number> = {
  'TRP-01': 168,
  'TRP-02': 152,
  'TRP-03': 141,
  'TRP-04': 176,
  'TRP-05': 128,
};

/** Baseline probability that a shipment run by this transporter runs late. */
export const TRANSPORTER_DELAY_BIAS: Record<string, number> = {
  'TRP-01': 0.12,
  'TRP-02': 0.19,
  'TRP-03': 0.24,
  'TRP-04': 0.15,
  'TRP-05': 0.38,
};

/** Daily accessorial rates in DJF, per container. */
export const ACCESSORIAL_DAY_RATES = {
  detention: 14500,
  demurrage: 21000,
  storage: 9800,
} as const;

export const WAITING_HOUR_RATE = 3200;
