import type {
  Customer,
  Driver,
  NetworkPeer,
  OpportunityBand,
  TransporterProfile,
  TransporterRoute,
  Vehicle,
} from '../contracts';

/**
 * The fixed dimensions of the mock world.
 *
 * Same real Djibouti-corridor geography as the shipper suite — Doraleh and
 * PK12 out to Dire Dawa, Adama, Addis — so the live map draws plausible route
 * shapes and distances feed transit times an operator would recognise. The
 * subject is Red Sea Express: the corridor carrier whose seat this portal is
 * built for.
 *
 * ## Where `ratePerKm` comes from
 *
 * These are **tariffs charged**, not costs incurred, and they are anchored to
 * published corridor figures rather than invented:
 *
 * - Market quotes put Djibouti → Addis Ababa container haulage at roughly
 *   **USD 800–1,200 per container** for the ~910 km trunk.
 * - The World Bank's Djibouti logistics review (Report 75145) records
 *   Ethiopian trucking firms charging about **3 US cents per ton-km** on this
 *   corridor — "exceptionally low by international standards" — even though
 *   almost every truck returns empty.
 * - Teravaninthorn & Raballand (World Bank, 2009), as reproduced in the WCTR
 *   2019 corridor cost study, put the Port Djibouti–Addis Ababa *operating*
 *   cost at **1.44 USD/km variable plus ~19 USD/day fixed**, or 0.037–0.042
 *   USD/ton-km at 40-tonne loads.
 *
 * So the trunk sits at ~1.2 USD/km — about USD 1,100 (≈196k DJF) for the Addis
 * run, inside the quoted band. Rate per km then *falls with distance*, because
 * the per-trip overheads a carrier cannot avoid (port turnaround, border
 * formalities, loading, paperwork) amortise over more kilometres. That is why
 * the 95 km Ali Sabieh shuttle prices at nearly double the Addis rate per km
 * and still invoices a fifth as much — and it is what makes the rate-per-km
 * column in the Operations route table say something true rather than flat.
 *
 * The screen reads these in DJF at the fixed 177.721 peg; see `money.ts`.
 */

export const MOCK_TRANSPORTER: TransporterProfile = {
  id: 'TRP-01',
  name: 'Red Sea Express Ltd',
  fleetCode: 'RSE',
  country: 'Djibouti',
  joinedNetworkAt: '2024-03-12',
};

const VEHICLE_MODELS = [
  'Volvo FH16',
  'Scania R450',
  'Mercedes Actros 2645',
  'Renault T480',
  'Sinotruk Howo A7',
  'Isuzu Giga CYZ',
] as const;

/**
 * 22 tractors: enough that utilisation, idle ranking and driver pairing have
 * texture, small enough that a per-vehicle list is still readable in a card.
 */
export const MOCK_VEHICLES: Vehicle[] = Array.from({ length: 22 }, (_, index) => {
  const n = index + 1;
  const truckType = n <= 14 ? 'container' : n <= 18 ? 'flatbed' : 'reefer';
  return {
    id: `VEH-${String(n).padStart(2, '0')}`,
    plateNumber: `DJ ${2140 + n * 97} RSE`,
    truckType,
    model: VEHICLE_MODELS[(n * 3) % VEHICLE_MODELS.length] as string,
    year: 2015 + ((n * 5) % 9),
    capacityTons: truckType === 'flatbed' ? 34 : 30,
    gpsEnabled: n !== 7 && n !== 19,
  };
});

const DRIVER_NAMES = [
  'Ahmed Waberi',
  'Omar Guelleh',
  'Yonas Tesfaye',
  'Daniel Bekele',
  'Hassan Farah',
  'Abdo Ismail',
  'Mohamed Doualeh',
  'Bereket Alemu',
  'Samuel Girma',
  'Idriss Robleh',
  'Khadar Osman',
  'Ali Dini',
  'Tesfaye Lemma',
  'Dawit Haile',
  'Mahad Abdillahi',
  'Elias Mengistu',
  'Said Barkat',
  'Hussein Aden',
  'Girma Wolde',
  'Nasir Egal',
  'Abdi Hersi',
  'Solomon Tadesse',
  'Yusuf Kayad',
  'Robel Asfaw',
  'Farhan Warsame',
  'Mukhtar Guled',
] as const;

/**
 * Base ratings spread 3.7–4.9 with a deliberate low tail: the driver ranking
 * needs a bottom as well as a top, or "who is dragging the fleet" has no
 * answer.
 */
export const MOCK_DRIVERS: Driver[] = DRIVER_NAMES.map((name, index) => ({
  id: `DRV-${String(index + 1).padStart(2, '0')}`,
  name,
  phone: `+253 77 ${String(210000 + index * 3517).slice(0, 2)} ${String(30 + index)} ${String(11 + ((index * 7) % 80)).padStart(2, '0')}`,
  licenseNumber: `DJ-CDL-${7200 + index * 31}`,
  joinedAt: `20${18 + (index % 7)}-${String(1 + (index % 12)).padStart(2, '0')}-15`,
  baseRating: Math.round((3.7 + ((index * 37) % 12) / 10) * 10) / 10,
}));

export const MOCK_ROUTES: TransporterRoute[] = [
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
    /** ≈ USD 1,101 / 195,700 DJF per trip — mid-band for the corridor trunk. */
    ratePerKm: 1.21,
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
    /** ≈ USD 518 / 92,100 DJF — short of the escarpment, so cheaper per trip. */
    ratePerKm: 1.62,
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
    /** ≈ USD 995 / 176,900 DJF — the Adama drop, one leg short of Addis. */
    ratePerKm: 1.26,
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
    /** ≈ USD 1,045 / 185,800 DJF — a premium on Adama: harder northern roads. */
    ratePerKm: 1.34,
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
    /**
     * ≈ USD 223 / 39,700 DJF. Domestic shuttle: the highest rate per km on the
     * board and still the cheapest trip, because a day is a day whether the
     * truck runs 95 km or 900.
     */
    ratePerKm: 2.35,
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
    /** ≈ USD 1,311 / 233,000 DJF — longest run, thinnest rate per km. */
    ratePerKm: 1.14,
  },
  {
    id: 'RTE-07',
    name: 'Doraleh → Semera',
    originName: 'Doraleh Multipurpose Port',
    originLat: 11.6094,
    originLng: 43.0567,
    destinationName: 'Semera Dry Port',
    destinationLat: 11.7924,
    destinationLng: 41.0086,
    distanceKm: 590,
    nominalTransitHours: 18,
    /** ≈ USD 838 / 148,900 DJF — the Afar leg, short but poorly backhauled. */
    ratePerKm: 1.42,
  },
];

/** Relative demand per route: the corridor trunk dominates, as in life. */
export const ROUTE_DEMAND: ReadonlyArray<readonly [string, number]> = [
  ['RTE-01', 0.28],
  ['RTE-02', 0.17],
  ['RTE-03', 0.15],
  ['RTE-04', 0.12],
  ['RTE-05', 0.09],
  ['RTE-06', 0.11],
  ['RTE-07', 0.08],
];

/**
 * Chance a completed trip finds a return load, by destination. Big hubs have
 * boards; the periphery mostly sends trucks home empty — which is exactly the
 * spread the backhaul views exist to show.
 */
export const BACKHAUL_MATCH_BASE: Record<string, number> = {
  'RTE-01': 0.72,
  'RTE-02': 0.6,
  'RTE-03': 0.66,
  'RTE-04': 0.45,
  'RTE-05': 0.3,
  'RTE-06': 0.5,
  'RTE-07': 0.42,
};

export const MOCK_CUSTOMERS: Customer[] = [
  { id: 'SHP-101', name: 'CMA-CGM', industry: 'Consumer goods' },
  { id: 'SHP-102', name: 'Al-Baraka Logistics Ltd', industry: 'Freight forwarding' },
  { id: 'SHP-103', name: 'Red Sea Cargo Group', industry: 'Commodities' },
  { id: 'SHP-104', name: 'East Africa Beverages', industry: 'Beverages' },
  { id: 'SHP-105', name: 'Horn Agro Exports', industry: 'Agriculture' },
  { id: 'SHP-106', name: 'Sheba Textiles', industry: 'Textiles' },
  { id: 'SHP-107', name: 'Nile Valley Foods', industry: 'FMCG' },
  { id: 'SHP-108', name: 'Djibouti Cement Co.', industry: 'Construction' },
];

export const CARGO_BY_CUSTOMER: Record<string, readonly string[]> = {
  'SHP-101': ['Household electronics', 'Small appliances', 'Packaged goods'],
  'SHP-102': ['Mixed consolidated freight', 'Project cargo'],
  'SHP-103': ['Fertiliser bags', 'Steel coils', 'Grain sacks'],
  'SHP-104': ['Bottling line inputs', 'Beverage pallets'],
  'SHP-105': ['Coffee (export prep)', 'Sesame seed', 'Pulses'],
  'SHP-106': ['Garment bales', 'Cotton yarn'],
  'SHP-107': ['Edible oil', 'Wheat flour', 'Sugar'],
  'SHP-108': ['Cement bags', 'Clinker'],
};

/** Return cargo posted from up-country hubs back toward the port. */
export const BACKHAUL_CARGO = [
  'Coffee for export',
  'Sesame seed lots',
  'Textile bales',
  'Oilseed cake',
  'Hides & skins',
  'Empty container repositioning',
  'Khat co-load (chilled)',
  'Teff & grain sacks',
] as const;

export const BACKHAUL_CUSTOMERS = [
  'Ethio Coffee Exporters',
  'Awash Agro Industries',
  'Hawassa Textile Mills',
  'Mekelle Trading House',
  'Adama Oilseed Union',
  'Dire Dawa Freight Co.',
  'Addis Commodity Exchange',
] as const;

/**
 * Eleven anonymised peers around us. Their stats are fixed narrative, not
 * simulation: the cheapest carriers sit low on reliability and the premium
 * ones high, so the cost-vs-reliability quadrant has its story to tell.
 * `reliabilityScore`, and our own row, are computed by the generator.
 */
export const NETWORK_PEER_SEEDS: ReadonlyArray<
  Omit<NetworkPeer, 'isYou' | 'reliabilityScore'>
> = [
  { id: 'NET-A', label: 'Carrier A', onTimeRate: 0.96, acceptanceRate: 0.93, delayRate: 0.09, avgRating: 4.8, costIndex: 1.18, trips: 410 },
  { id: 'NET-B', label: 'Carrier B', onTimeRate: 0.94, acceptanceRate: 0.88, delayRate: 0.12, avgRating: 4.6, costIndex: 1.09, trips: 350 },
  { id: 'NET-C', label: 'Carrier C', onTimeRate: 0.91, acceptanceRate: 0.95, delayRate: 0.16, avgRating: 4.5, costIndex: 1.02, trips: 505 },
  { id: 'NET-D', label: 'Carrier D', onTimeRate: 0.9, acceptanceRate: 0.8, delayRate: 0.18, avgRating: 4.4, costIndex: 0.97, trips: 260 },
  { id: 'NET-E', label: 'Carrier E', onTimeRate: 0.88, acceptanceRate: 0.9, delayRate: 0.21, avgRating: 4.2, costIndex: 0.94, trips: 385 },
  { id: 'NET-F', label: 'Carrier F', onTimeRate: 0.86, acceptanceRate: 0.76, delayRate: 0.24, avgRating: 4.1, costIndex: 0.9, trips: 220 },
  { id: 'NET-G', label: 'Carrier G', onTimeRate: 0.84, acceptanceRate: 0.85, delayRate: 0.27, avgRating: 3.9, costIndex: 0.88, trips: 300 },
  { id: 'NET-H', label: 'Carrier H', onTimeRate: 0.82, acceptanceRate: 0.7, delayRate: 0.3, avgRating: 3.8, costIndex: 0.85, trips: 175 },
  { id: 'NET-I', label: 'Carrier I', onTimeRate: 0.79, acceptanceRate: 0.82, delayRate: 0.34, avgRating: 3.6, costIndex: 0.82, trips: 240 },
  { id: 'NET-J', label: 'Carrier J', onTimeRate: 0.93, acceptanceRate: 0.68, delayRate: 0.13, avgRating: 4.7, costIndex: 1.22, trips: 150 },
  { id: 'NET-K', label: 'Carrier K', onTimeRate: 0.76, acceptanceRate: 0.9, delayRate: 0.38, avgRating: 3.4, costIndex: 0.78, trips: 290 },
];

/**
 * The performance→opportunities story in one table: the network routes work
 * to carriers it can trust, so climbing a band is worth real volume.
 */
export const OPPORTUNITY_BANDS: OpportunityBand[] = [
  { key: 'below_85', label: 'On-time < 85%', offersPerWeek: 3.1, carriers: 4 },
  { key: 'b85_90', label: '85–90%', offersPerWeek: 5.2, carriers: 3 },
  { key: 'b90_95', label: '90–95%', offersPerWeek: 7.4, carriers: 3 },
  { key: 'above_95', label: '> 95%', offersPerWeek: 9.8, carriers: 2 },
];

export const DECLINE_REASONS = [
  'No vehicle available',
  'Rate below floor',
  'Pickup window clash',
  'Driver hours exhausted',
] as const;

export const INCIDENT_TYPES = [
  'Harsh braking event',
  'Route deviation',
  'Customer complaint',
  'Minor accident',
  'Speeding alert',
] as const;
