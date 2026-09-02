import { describe, expect, it } from 'vitest';
import {
  CO2_FIXTURES,
  co2Label,
  co2Number,
  formatCo2,
  formatFactor,
  normaliseFuelType,
  previewVehicleCo2Factor,
} from './co2';

describe('previewVehicleCo2Factor', () => {
  /*
   * The same fixtures the backend's `co2.util.spec.ts` asserts against. This
   * is the only thing stopping the form's preview drifting away from the
   * number that actually gets stored — edit one table without the other and
   * one of these two suites goes red.
   */
  it.each(CO2_FIXTURES)(
    'agrees with the backend for $truckType / $fuelType / $year',
    ({ truckType, fuelType, year, perKm }) => {
      expect(previewVehicleCo2Factor({ truckType, fuelType, year }).perKm).toBe(perKm);
    },
  );

  it('explains itself in one line', () => {
    expect(
      previewVehicleCo2Factor({ truckType: '40ft Container', fuelType: 'Diesel', year: 2022 }).basis,
    ).toBe('40ft Container · Diesel · 2022 (Euro VI-E)');
  });
});

describe('normaliseFuelType', () => {
  it('falls back to Diesel', () => {
    expect(normaliseFuelType(undefined)).toBe('Diesel');
    expect(normaliseFuelType('hybrid')).toBe('Hybrid');
  });
});

describe('formatCo2', () => {
  it('prints a container run in kilogrammes', () => {
    expect(formatCo2(85)).toEqual({ value: '85', unit: 'kg CO₂' });
  });

  it('switches to tonnes at a tonne, where kilogrammes stop reading', () => {
    expect(formatCo2(999)).toEqual({ value: '999', unit: 'kg CO₂' });
    expect(formatCo2(1000)).toEqual({ value: '1.0', unit: 't CO₂' });
    expect(formatCo2(42_500)).toEqual({ value: '42.5', unit: 't CO₂' });
  });

  it('keeps a decimal on a small figure, and drops it on a large one', () => {
    expect(formatCo2(4.4)).toEqual({ value: '4.4', unit: 'kg CO₂' });
    expect(formatCo2(120_000).value).toBe('120');
  });

  it('says nothing rather than zero when there is no figure', () => {
    expect(formatCo2(null)).toEqual({ value: '—', unit: '' });
    expect(co2Label(undefined)).toBe('—');
  });
});

describe('formatFactor', () => {
  it('prints the factor at the precision it is stored to', () => {
    expect(formatFactor(1)).toBe('1.00 kg/km');
    expect(formatFactor(0.936)).toBe('0.936 kg/km');
    expect(formatFactor(null)).toBe('—');
  });
});

describe('co2Number', () => {
  it('reads a Decimal that crossed the wire as a string', () => {
    expect(co2Number('85.00')).toBe(85);
    expect(co2Number(85)).toBe(85);
  });

  it('treats absent and unparseable as no figure, never as zero', () => {
    expect(co2Number(null)).toBeNull();
    expect(co2Number('')).toBeNull();
    expect(co2Number('not a number')).toBeNull();
  });
});
