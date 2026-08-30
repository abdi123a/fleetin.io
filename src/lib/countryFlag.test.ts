import { describe, expect, it } from 'vitest';
import { countryCode } from '@/lib/countryFlag';
import { ALL_COUNTRIES } from '@/data/geoData';

describe('countryCode', () => {
  it('resolves every country the app can store', () => {
    const unresolved = ALL_COUNTRIES.filter((country) => countryCode(country) === null);
    expect(unresolved).toEqual([]);
  });

  it('gives each country its own code — no two share one', () => {
    const codes = ALL_COUNTRIES.map((country) => countryCode(country));
    expect(new Set(codes).size).toBe(ALL_COUNTRIES.length);
  });

  /* Every one of these is a withdrawn code that `Intl.DisplayNames` still
     answers to the modern country's name. Walking the alpha-2 space without
     refusing them puts East Germany's flag beside a German company. */
  it.each([
    ['Germany', 'DE'],
    ['Zimbabwe', 'ZW'],
    ['Russia', 'RU'],
    ['Serbia', 'RS'],
    ['Vietnam', 'VN'],
    ['Yemen', 'YE'],
    ['Vanuatu', 'VU'],
    ['Benin', 'BJ'],
    ['Burkina Faso', 'BF'],
    ['France', 'FR'],
    ['United Kingdom', 'GB'],
  ])('does not hand %s a withdrawn code', (country, expected) => {
    expect(countryCode(country)).toBe(expected);
  });

  it('resolves the names this app spells its own way', () => {
    expect(countryCode('Czech Republic')).toBe('CZ');
    expect(countryCode('Turkey')).toBe('TR');
    expect(countryCode('Ivory Coast')).toBe('CI');
    expect(countryCode('Congo')).toBe('CG');
  });

  it('ignores surrounding whitespace and case', () => {
    expect(countryCode(' djibouti ')).toBe('DJ');
    expect(countryCode('DJIBOUTI')).toBe('DJ');
  });

  /* `CountryFlag` renders nothing on a null, so a name that is not a country
     shows as plain text — never as a wrong flag, which would be a factual
     claim about where a company is. */
  it('returns null rather than guessing', () => {
    expect(countryCode('Atlantis')).toBeNull();
    expect(countryCode('')).toBeNull();
    expect(countryCode(null)).toBeNull();
    expect(countryCode(undefined)).toBeNull();
  });
});
