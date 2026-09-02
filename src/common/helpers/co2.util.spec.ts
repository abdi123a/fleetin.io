import {
  CO2_FIXTURES,
  computeVehicleCo2Factor,
  normaliseFuelType,
} from './co2.util';

describe('computeVehicleCo2Factor', () => {
  it.each(CO2_FIXTURES)(
    '$truckType / $fuelType / $year → $perKm kg/km',
    ({ truckType, fuelType, year, perKm }) => {
      expect(computeVehicleCo2Factor({ truckType, fuelType, year }).perKm).toBe(perKm);
    },
  );

  it('is the documented worked example for the corridor standard unit', () => {
    const factor = computeVehicleCo2Factor({
      truckType: '40ft Container',
      fuelType: 'Diesel',
      year: 2022,
    });
    expect(factor.perKm).toBe(1.0);
    expect(factor.basis).toBe('40ft Container · Diesel · 2022 (Euro VI-E)');
  });

  it('is pure — the same inputs give the same answer every time', () => {
    const input = { truckType: 'Tipper', fuelType: 'LNG', year: 2016 };
    expect(computeVehicleCo2Factor(input)).toEqual(computeVehicleCo2Factor(input));
  });

  it('penalises an older truck, and never rewards one', () => {
    const modern = computeVehicleCo2Factor({ truckType: 'Flatbed', fuelType: 'Diesel', year: 2023 });
    const old = computeVehicleCo2Factor({ truckType: 'Flatbed', fuelType: 'Diesel', year: 1999 });
    expect(old.perKm).toBeGreaterThan(modern.perKm);
  });

  it('reports an unrecorded year as such rather than pretending the truck is new', () => {
    const unknown = computeVehicleCo2Factor({ truckType: 'Flatbed', fuelType: 'Diesel', year: null });
    const modern = computeVehicleCo2Factor({ truckType: 'Flatbed', fuelType: 'Diesel', year: 2023 });
    expect(unknown.perKm).toBeGreaterThan(modern.perKm);
    expect(unknown.basis).toContain('year not recorded');
  });

  it('emits nothing from an electric truck — tank-to-wheel, as documented', () => {
    expect(
      computeVehicleCo2Factor({ truckType: '40ft Container', fuelType: 'Electric', year: 2024 }).perKm,
    ).toBe(0);
  });
});

describe('normaliseFuelType', () => {
  it('accepts any casing of a known fuel', () => {
    expect(normaliseFuelType('diesel')).toBe('Diesel');
    expect(normaliseFuelType('  ELECTRIC ')).toBe('Electric');
  });

  it('falls back to Diesel for anything unrecognised or missing', () => {
    expect(normaliseFuelType('kerosene')).toBe('Diesel');
    expect(normaliseFuelType(null)).toBe('Diesel');
    expect(normaliseFuelType(undefined)).toBe('Diesel');
  });
});
