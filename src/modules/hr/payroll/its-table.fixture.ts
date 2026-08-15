import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ItsTable, type ItsBand } from './payroll.engine';

/**
 * The published ITS table, read from the same CSV the seeder loads.
 *
 * Tests and the seeder share one source so a band can never be corrected in
 * the database while the assertions keep passing against a stale copy.
 */
export const ITS_CSV_PATH = join(__dirname, '../../../../prisma/data/its_brackets_2022.csv');

export function parseItsCsv(csv: string): ItsBand[] {
  const [header, ...rows] = csv
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (header !== 'lower_bound,upper_bound,tax_amount') {
    throw new Error(`ITS CSV: unexpected header "${header}"`);
  }

  return rows.map((row, index) => {
    const cells = row.split(',');
    if (cells.length !== 3) {
      throw new Error(`ITS CSV: row ${index + 2} has ${cells.length} cells, expected 3`);
    }
    const [lowerBound, upperBound, taxAmount] = cells.map(Number);
    if ([lowerBound, upperBound, taxAmount].some((value) => !Number.isFinite(value))) {
      throw new Error(`ITS CSV: row ${index + 2} is not numeric ("${row}")`);
    }
    return { lowerBound, upperBound, taxAmount };
  });
}

export function loadItsBands(): ItsBand[] {
  return parseItsCsv(readFileSync(ITS_CSV_PATH, 'utf8'));
}

export function loadItsTable(): ItsTable {
  return new ItsTable(loadItsBands());
}
