/**
 * French formatting for generated documents.
 *
 * Every one of these is data-driven. The workbook's documents were written by
 * hand, so they carried the wrong company name on one sheet and a masculine
 * participle for a female employee on another; nothing here is ever typed by
 * an operator.
 */

import { Gender } from '@prisma/client';

/** `dd/mm/yyyy`, read off the UTC calendar so a stored date never shifts. */
export function frDate(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getUTCFullYear()}`;
}

const MONTHS_FR = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
];

export function frMonthYear(month: number, year: number): string {
  return `${MONTHS_FR[month - 1]} ${year}`;
}

/*
 * `fr-FR` grouping with a comma decimal separator. Intl uses a narrow no-break
 * space (U+202F) as the group separator in modern ICU, which Chromium renders
 * correctly in the PDF but which breaks naive string comparison in tests — so
 * it is normalised to a regular no-break space here and nowhere else.
 */
const NUMBER_2DP = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const NUMBER_0DP = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

const normaliseSpaces = (value: string) => value.replace(/ /g, ' ');

/** Two decimals — payslips, settlements, the transfer letter. */
export function money(value: number | null | undefined): string {
  return normaliseSpaces(NUMBER_2DP.format(value ?? 0));
}

/** Whole francs — the CNSS bordereau, which is filed rounded. */
export function money0(value: number | null | undefined): string {
  return normaliseSpaces(NUMBER_0DP.format(Math.round(value ?? 0)));
}

export function decimal(value: number, places = 2): string {
  return normaliseSpaces(
    new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: places,
      maximumFractionDigits: places,
    }).format(value),
  );
}

// ── Gender agreement ────────────────────────────────────────────────────────

export const civility = (gender: Gender): string => (gender === Gender.F ? 'Mme' : 'M.');
export const employedWord = (gender: Gender): string =>
  gender === Gender.F ? 'employée' : 'employé';
export const concernedWord = (gender: Gender): string =>
  gender === Gender.F ? "l'intéressée" : "l'intéressé";

// ── HTML ────────────────────────────────────────────────────────────────────

/**
 * Escapes text before it reaches the template.
 *
 * Every value on a generated document comes from the database, and an
 * employee name is user input like any other. A name containing `<` must
 * print as a name, not open a tag in a document that gets filed with CNSS.
 */
export function esc(value: unknown): string {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character] as string,
  );
}

/**
 * Fills `{{path.to.value}}` placeholders from a payload.
 *
 * Values are escaped on the way in; a missing key renders as an empty string
 * rather than leaving the raw `{{token}}` on a document that goes to a bank.
 */
export function fillTemplate(template: string, payload: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, path: string) => {
    const value = path
      .split('.')
      .reduce<unknown>(
        (node, key) =>
          node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined,
        payload,
      );
    return value === undefined || value === null ? '' : esc(value);
  });
}

/** Turns a filled template's blank lines into paragraphs. */
export function paragraphs(text: string, className = 'body-txt'): string {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<div class="${className}">${block.replace(/\n/g, '<br>')}</div>`)
    .join('');
}
