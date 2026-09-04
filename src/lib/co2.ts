/**
 * Carbon, on the frontend.
 *
 * Two jobs, and it matters which is which:
 *
 *  1. **Formatting.** Every screen that prints a carbon figure prints it
 *     through here, so "85 kg CO₂" reads the same on a booking card, a
 *     shipment header and a dashboard tile, and so the switch to tonnes
 *     happens at one threshold rather than three.
 *
 *  2. **Previewing a factor.** The vehicle form shows what Fleetin will save
 *     as a truck's kg CO₂/km *before* the truck is saved — a number the
 *     operator can see follows from the three answers they just gave, rather
 *     than appearing after a round trip.
 *
 * The preview is a mirror of `co2.util.ts` on the backend, and the backend is
 * authoritative: the stored factor is always the one it computed. The two
 * tables are kept honest by `CO2_FIXTURES`, which both sides assert against —
 * edit one table without the other and a test goes red.
 *
 * Nothing here computes a *booking's* emissions. That figure is snapshotted
 * server-side at assignment and read back as a stored number, because a
 * historical trip must keep reporting what it reported.
 */

export const CO2_MODEL_VERSION = 'ttw-2026.09';

/** kg CO₂/km for a modern diesel of each class. See the backend's table. */
const BASE_BY_TRUCK_TYPE: Record<string, number> = {
  'Low Loader': 1.1,
  Refrigerated: 1.05,
  '40ft Container': 1.0,
  Tanker: 1.0,
  Tipper: 0.95,
  Flatbed: 0.9,
  '20ft Container': 0.85,
  'Box Truck': 0.55,
  Other: 0.9,
};

const BASE_FALLBACK = 0.9;

export const FUEL_TYPES = ['Diesel', 'Petrol', 'CNG', 'LNG', 'Hybrid', 'Electric'] as const;

export type FuelType = (typeof FUEL_TYPES)[number];

export const DEFAULT_FUEL_TYPE: FuelType = 'Diesel';

const FUEL_MULTIPLIER: Record<string, number> = {
  Diesel: 1.0,
  Petrol: 1.1,
  CNG: 0.9,
  LNG: 0.85,
  Hybrid: 0.8,
  /* Tank-to-wheel: nothing leaves the exhaust because there is no exhaust. */
  Electric: 0,
};

function ageMultiplier(year: number | null | undefined): number {
  if (!year || !Number.isFinite(year)) return 1.1;
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
  perKm: number;
  basis: string;
  truckType: string;
  fuelType: string;
  year: number | null;
  modelVersion: string;
}

/** The factor a truck with these three answers will be saved with. */
export function previewVehicleCo2Factor(input: {
  truckType?: string | null;
  fuelType?: string | null;
  year?: number | null;
}): Co2Factor {
  const truckType = input.truckType?.trim() || 'Other';
  const fuelType = normaliseFuelType(input.fuelType);
  const year = input.year ?? null;

  const perKm =
    Math.round(
      (BASE_BY_TRUCK_TYPE[truckType] ?? BASE_FALLBACK) *
        (FUEL_MULTIPLIER[fuelType] ?? 1) *
        ageMultiplier(year) *
        1000,
    ) / 1000;

  return {
    perKm,
    basis: `${truckType} · ${fuelType} · ${ageBandLabel(year)}`,
    truckType,
    fuelType,
    year,
    modelVersion: CO2_MODEL_VERSION,
  };
}

export function normaliseFuelType(value?: string | null): FuelType {
  const match = FUEL_TYPES.find((f) => f.toLowerCase() === value?.trim().toLowerCase());
  return match ?? DEFAULT_FUEL_TYPE;
}

/* ── Printing a figure ──────────────────────────────────────────────────── */

/**
 * A mass of CO₂, in the unit that reads.
 *
 * Under a tonne it is kilogrammes, because a container run is 85 kg and
 * "0.085 t" is not a number anybody feels. At and above a tonne it is tonnes,
 * because a fleet's month is 40,000 kg and that is a wall of digits.
 *
 * Returns the parts rather than a string so a caller can size the value and
 * its unit differently, which every card here does.
 */
export function formatCo2(kg: number | null | undefined): { value: string; unit: string } {
  if (kg === null || kg === undefined || !Number.isFinite(kg)) return { value: '—', unit: '' };
  if (Math.abs(kg) >= 1000) {
    const tonnes = kg / 1000;
    return {
      value: tonnes.toLocaleString(undefined, {
        minimumFractionDigits: tonnes >= 100 ? 0 : 1,
        maximumFractionDigits: tonnes >= 100 ? 0 : 1,
      }),
      unit: 't CO₂',
    };
  }
  /* One decimal all the way to a hundred kilogrammes, so the headline agrees
     with the sum printed under it: "19.1 km × 1.04 kg/km = 19.8 kg" must not
     sit under a "20 kg". Whole kilogrammes from there up. */
  return {
    value: kg.toLocaleString(undefined, { maximumFractionDigits: kg < 100 ? 1 : 0 }),
    unit: 'kg CO₂',
  };
}

/**
 * What a mature tree takes out of the air in a year, in kg CO₂.
 *
 * The figure most planting programmes and the EPA's equivalencies quote is
 * about 22 kg (48 lb) a year for a mature urban tree; published values run
 * from 10 to 40 depending on species and climate. It is a picture, not a
 * measurement: it turns "382 kg saved" into "17 trees for a year", which is
 * the sentence a shipper can repeat. Never used in any total.
 */
export const KG_CO2_PER_TREE_YEAR = 22;

/**
 * A mass of CO₂ as the trees it would take a year to absorb — "17 trees for a
 * year". One decimal under ten trees, whole above, and "under a tree" below
 * one rather than a fraction of a tree nobody can picture.
 */
export function treeYearEquivalent(kg: number | null | undefined): string | null {
  if (kg === null || kg === undefined || !Number.isFinite(kg) || kg <= 0) return null;
  const trees = kg / KG_CO2_PER_TREE_YEAR;
  if (trees < 1) return 'under a tree for a year';
  const printed = trees >= 10 ? Math.round(trees).toLocaleString() : trees.toFixed(1);
  return `${printed} trees for a year`;
}

/**
 * The same equivalence in the four words the user asked for — "17 trees
 * planted" (2026-09-04: "only say trees planted, make it easy"). Whole trees,
 * because a planted tree is a whole thing; "a tree planted" below one and a
 * half rather than a decimal nobody would plant.
 */
export function treesPlantedLabel(kg: number | null | undefined): string | null {
  if (kg === null || kg === undefined || !Number.isFinite(kg) || kg <= 0) return null;
  const trees = Math.max(1, Math.round(kg / KG_CO2_PER_TREE_YEAR));
  return `${trees.toLocaleString()} tree${trees === 1 ? '' : 's'} planted`;
}

/** The same figure as one string, for a tooltip or a sentence. */
export function co2Label(kg: number | null | undefined): string {
  const { value, unit } = formatCo2(kg);
  return unit ? `${value} ${unit}` : value;
}

/** Distance, printed the way every carbon surface prints it. */
export function formatKm(km: number | null | undefined): { value: string; unit: string } {
  if (km === null || km === undefined || !Number.isFinite(km)) return { value: '—', unit: '' };
  return {
    value: km.toLocaleString(undefined, { maximumFractionDigits: km < 100 ? 1 : 0 }),
    unit: 'km',
  };
}

/** kg CO₂/km, at the precision the factor is actually stored to. */
export function formatFactor(perKm: number | null | undefined): string {
  if (perKm === null || perKm === undefined || !Number.isFinite(perKm)) return '—';
  return `${perKm.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })} kg/km`;
}

/**
 * Prisma sends a Decimal across the wire as a string. Every carbon column is
 * one, so this is the single reader for them — the same rule
 * `coordsOf` follows for a location's latitude.
 */
export function co2Number(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * What a booking's distance figure actually stands on.
 *
 * `legs` is a measured route. `shipment_estimate` is the single pickup →
 * delivery hop the shipment was planned against — a real number, but not the
 * road the truck covered, and a carbon page that does not distinguish the two
 * is claiming precision it does not have.
 */
export const DISTANCE_SOURCE_LABEL: Record<string, string> = {
  legs: 'Measured route',
  shipment_estimate: 'Shipment estimate',
  manual: 'Recorded by hand',
};

/**
 * Cases both this table and the backend's must agree on. Asserted by
 * `co2.test.ts` here and `co2.util.spec.ts` there.
 */
export const CO2_FIXTURES: {
  truckType: string;
  fuelType: string;
  year: number | null;
  perKm: number;
}[] = [
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
