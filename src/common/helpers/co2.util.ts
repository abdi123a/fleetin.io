/**
 * How much carbon a truck puts out per kilometre, and how that number is
 * arrived at.
 *
 * ## Why the operator never types this in
 *
 * A kg CO₂/km figure is not an opinion — it falls out of what the truck is,
 * what it burns and how old it is. Left as a free field it becomes a column of
 * guesses that cannot be compared across a fleet, and a shipper asking for a
 * carbon statement would be reading fifty different people's arithmetic. So
 * the form asks the three questions that actually determine it (type, fuel,
 * year) and this file answers the fourth.
 *
 * ## The model
 *
 *     factor = base(vehicle type) × fuel multiplier × age multiplier
 *
 * `base` is the tank-to-wheel burn of a modern diesel of that class on a
 * mixed-duty cycle. The classes are the truck types this product already
 * knows (`TRUCK_TYPES` in the vehicle DTO) rather than an abstract weight
 * band, because the type is what somebody registering a truck actually knows.
 *
 * `fuel` scales that for what is in the tank. `age` stands in for the emission
 * standard the truck was built to — a 2004 tractor is not a 2024 tractor with
 * the same engine, and the year is the only proxy a transport office reliably
 * has for the Euro class.
 *
 * ## Scope and standard
 *
 * Tank-to-wheel: what comes out of this truck's exhaust on this trip. An
 * electric truck is therefore 0 here, and that is stated rather than fudged —
 * the grid emissions behind its charge are real but they are somebody else's
 * scope, and inventing a Djibouti grid factor per truck would be worse than
 * saying plainly what this measures.
 *
 * ## Stability
 *
 * The table below is versioned by `CO2_MODEL_VERSION`. Changing a number here
 * changes what *future* vehicles and *future* bookings are given; it never
 * reaches back. A booking snapshots the factor it used at the moment it was
 * priced (`Booking.co2FactorUsed`), which is the whole reason that column
 * exists — see `emissions.service.ts`.
 *
 * The frontend keeps a mirror of this table in `src/lib/co2.ts` so the vehicle
 * form can show the factor before the truck is saved. The mirror is a preview
 * only: the number that gets stored is always the one computed here, and both
 * sides carry the same fixture list (`CO2_FIXTURES`) so a change to one that
 * is not made to the other fails a test rather than quietly disagreeing.
 */

export const CO2_MODEL_VERSION = 'ttw-2026.09';

/**
 * kg CO₂ per km for a modern diesel of each class, laden on a normal duty
 * cycle. A 40ft container tractor — the corridor's standard unit — is 1.00,
 * which is also the worked example every screen in this feature quotes.
 */
const BASE_BY_TRUCK_TYPE: Record<string, number> = {
  'Low Loader': 1.1,
  Refrigerated: 1.05, // The reefer unit burns on top of the engine.
  '40ft Container': 1.0,
  Tanker: 1.0,
  Tipper: 0.95,
  Flatbed: 0.9,
  '20ft Container': 0.85,
  'Box Truck': 0.55, // Rigid, medium duty — half a tractor unit's burn.
  Other: 0.9,
};

/** What an unrecognised truck type is treated as. Deliberately the mid class. */
const BASE_FALLBACK = 0.9;

/**
 * The fuels a fleet office in this corridor actually registers. Order is the
 * order the picker offers them in.
 */
export const FUEL_TYPES = [
  'Diesel',
  'Petrol',
  'CNG',
  'LNG',
  'Hybrid',
  'Electric',
] as const;

export type FuelType = (typeof FUEL_TYPES)[number];

export const DEFAULT_FUEL_TYPE: FuelType = 'Diesel';

const FUEL_MULTIPLIER: Record<string, number> = {
  Diesel: 1.0,
  Petrol: 1.1,
  CNG: 0.9,
  LNG: 0.85,
  Hybrid: 0.8,
  /* Tank-to-wheel. Nothing leaves the exhaust because there is no exhaust —
     see the scope note above. */
  Electric: 0,
};

/**
 * Age as a stand-in for the emission standard, relative to a truck built to
 * the current one. The bands are the Euro steps: VI-E from 2021, VI from
 * 2014, V from 2009, IV/III from 2001.
 */
function ageMultiplier(year: number | null | undefined): number {
  if (!year || !Number.isFinite(year)) return 1.1; // Unknown: assume mid-life, not new.
  if (year >= 2021) return 1.0;
  if (year >= 2014) return 1.04;
  if (year >= 2009) return 1.1;
  if (year >= 2001) return 1.18;
  return 1.28;
}

function ageBandLabel(year: number | null | undefined): string {
  if (!year || !Number.isFinite(year)) return 'year not recorded';
  if (year >= 2021) return `${year} (Euro VI-E)`;
  if (year >= 2014) return `${year} (Euro VI)`;
  if (year >= 2009) return `${year} (Euro V)`;
  if (year >= 2001) return `${year} (Euro IV/III)`;
  return `${year} (pre-Euro IV)`;
}

export interface Co2Factor {
  /** kg CO₂ per km, rounded to 3dp — what gets stored on the vehicle. */
  perKm: number;
  /** One line saying how `perKm` was reached, stored beside it and shown in the UI. */
  basis: string;
  /** The three inputs, echoed back so a caller can render them without re-deriving. */
  truckType: string;
  fuelType: string;
  year: number | null;
  modelVersion: string;
}

/**
 * The factor for one vehicle. Pure — no database, no settings lookup — so the
 * same three inputs always give the same answer, which is what makes a stored
 * factor auditable a year later.
 */
export function computeVehicleCo2Factor(input: {
  truckType?: string | null;
  fuelType?: string | null;
  year?: number | null;
}): Co2Factor {
  const truckType = input.truckType?.trim() || 'Other';
  const fuelType = normaliseFuelType(input.fuelType);
  const year = input.year ?? null;

  const base = BASE_BY_TRUCK_TYPE[truckType] ?? BASE_FALLBACK;
  const fuel = FUEL_MULTIPLIER[fuelType] ?? 1.0;
  const age = ageMultiplier(year);

  const perKm = round3(base * fuel * age);

  return {
    perKm,
    basis: `${truckType} · ${fuelType} · ${ageBandLabel(year)}`,
    truckType,
    fuelType,
    year,
    modelVersion: CO2_MODEL_VERSION,
  };
}

/** An unknown or missing fuel is Diesel — what all but a handful of trucks here burn. */
export function normaliseFuelType(value?: string | null): FuelType {
  const match = FUEL_TYPES.find((f) => f.toLowerCase() === value?.trim().toLowerCase());
  return match ?? DEFAULT_FUEL_TYPE;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Cases both sides of the wire must agree on.
 *
 * The frontend mirror imports the same list and asserts the same answers. If
 * somebody edits one table and not the other, one of the two test files goes
 * red — which is the only mechanism keeping a preview honest about the number
 * that will actually be stored.
 */
export const CO2_FIXTURES: {
  truckType: string;
  fuelType: string;
  year: number | null;
  perKm: number;
}[] = [
  // The worked example the whole feature is documented against.
  { truckType: '40ft Container', fuelType: 'Diesel', year: 2022, perKm: 1.0 },
  { truckType: '40ft Container', fuelType: 'Diesel', year: 2015, perKm: 1.04 },
  { truckType: '40ft Container', fuelType: 'Diesel', year: 1998, perKm: 1.28 },
  { truckType: '20ft Container', fuelType: 'Diesel', year: 2022, perKm: 0.85 },
  { truckType: 'Refrigerated', fuelType: 'Diesel', year: 2010, perKm: 1.155 },
  { truckType: 'Box Truck', fuelType: 'Petrol', year: 2019, perKm: 0.629 },
  { truckType: 'Flatbed', fuelType: 'CNG', year: 2022, perKm: 0.81 },
  { truckType: 'Low Loader', fuelType: 'Electric', year: 2024, perKm: 0 },
  { truckType: 'Tanker', fuelType: 'Diesel', year: null, perKm: 1.1 },
  { truckType: 'Something Else', fuelType: 'Diesel', year: 2022, perKm: 0.9 },
];
