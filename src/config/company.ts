/**
 * The legal entity Fleetin bills as.
 *
 * This is the letterhead: it prints on every invoice a client receives, so it
 * lives in exactly one file rather than being retyped into each document.
 *
 * ⚠ PLACEHOLDER VALUES. The registration number, bank details, address and
 * contact lines below are plausible, NOT real — nobody has supplied the actual
 * ones yet. An invoice carrying a wrong bank account is worse than one
 * carrying none, so replace every field marked `TODO(confirm)` before any of
 * this is sent to a client. The shape is right; the values are not.
 */
export const COMPANY = {
  legalName: 'FLEETIN SARL', // TODO(confirm) exact registered name and form
  tradingName: 'Fleetin',
  tagline: 'Freight forwarding & inland transport',

  /** TODO(confirm) — registered office as it appears on the trade register. */
  address: {
    line1: 'Rue de Venise, Heron',
    line2: 'Djibouti Port free zone',
    city: 'Djibouti City',
    country: 'Republic of Djibouti',
  },

  /** TODO(confirm) every line below. */
  contact: {
    phone: '+253 21 00 00 00',
    mobile: '+253 77 00 00 00',
    email: 'finance@fleetin.dj',
    website: 'www.fleetin.dj',
  },

  /** TODO(confirm) — NIF / trade register as issued. */
  registration: {
    tradeRegister: 'RC DJ-2024-B-0000',
    taxId: 'NIF 0000000000',
  },

  /**
   * Where clients settle. TODO(confirm) — an invoice with the wrong account
   * number sends money to a stranger; this one genuinely must be verified.
   */
  bank: {
    name: 'CAC International Bank',
    accountName: 'FLEETIN SARL',
    accountNumber: '0000 0000 0000 0000',
    swift: 'CACIDJJD',
  },

  logoSrc: '/logo/fleetin-logo.png',
  markSrc: '/logo/fleetin-icon.png',
} as const;

/** Address as printed lines, in order. */
export const COMPANY_ADDRESS_LINES: readonly string[] = [
  COMPANY.address.line1,
  COMPANY.address.line2,
  COMPANY.address.city,
  COMPANY.address.country,
];
