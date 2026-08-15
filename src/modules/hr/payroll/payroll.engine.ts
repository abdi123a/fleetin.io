/**
 * The payroll calculation engine.
 *
 * Every formula here is transcribed from the Excel workbook this module
 * replaces. The outputs are filed with CNSS and the tax authority, so the
 * arithmetic is reproduced exactly — including the parts of it that are
 * arguably wrong (see `capRetirementEmployee` and `seniorityIncludedInGross`,
 * both of which default to the workbook's behaviour and are only changed by a
 * deliberate configuration edit).
 *
 * ## Purity
 *
 * Nothing in this file touches the database, the clock, or configuration
 * globals. Rates arrive as `PayrollRates`, the ITS table arrives as an
 * `ItsTable`, and "today" arrives as an explicit `asOf`. That is what makes
 * §2.6 of the spec testable to the franc.
 *
 * ## Why `number` and not `Decimal`
 *
 * The source of truth being reproduced is an Excel workbook, and Excel's own
 * arithmetic is IEEE-754 double precision. Computing in doubles and rounding
 * to four decimal places at the storage boundary reproduces the filed figures;
 * decimal arithmetic would diverge from them in the last place. Values are
 * bounded by ~10^7 francs, so a double carries them with roughly nine orders
 * of magnitude of headroom over the 4-dp storage grain.
 */

/** Storage grain: `Decimal(14,4)` in Prisma. */
export const ROUNDING_DP = 4;

/**
 * Shifts a number by `exp` decimal places without going through
 * `value * 10 ** exp`, which introduces its own representation error.
 */
function shift(value: number, exp: number): number {
  if (value === 0) return 0;
  const [mantissa, e] = value.toExponential().split('e');
  return Number(`${mantissa}e${Number(e) + exp}`);
}

/**
 * Half-away-from-zero rounding, which is what Excel does — `Math.round` alone
 * rounds .5 toward +Infinity and would disagree on negative amounts (an
 * absence deduction large enough to invert a line).
 */
export function round(value: number, dp: number = ROUNDING_DP): number {
  if (!Number.isFinite(value)) {
    throw new Error(`payroll: refusing to round a non-finite value (${value})`);
  }
  const shifted = shift(value, dp);
  const rounded = shifted < 0 ? -Math.round(-shifted) : Math.round(shifted);
  return shift(rounded, -dp);
}

// ─────────────────────────────────────────────────────────────────────────────
// Rate configuration
// ─────────────────────────────────────────────────────────────────────────────

export interface SeniorityBandSpec {
  /** Inclusive lower bound, in days of service. */
  minDays: number;
  /** 0.02, 0.04, … */
  rate: number;
}

/**
 * The resolved contents of one `PayrollConfig` row. No rate is ever a literal
 * anywhere else in the codebase; this interface is the only way rates enter
 * the engine.
 */
export interface PayrollRates {
  contributionCeiling: number;
  retirementEmployeeRate: number;
  amuEmployeeRate: number;
  amuCeilingAmount: number;
  employerRate: number;
  employerCappedPortion: number;
  monthlyHours: number;
  overtimeTier1Rate: number;
  overtimeTier1MaxHours: number;
  overtimeTier2Rate: number;
  severanceRatePerYear: number;
  severanceCnssRate: number;
  annualLeaveDays: number;
  /** Workbook behaviour is `false`: seniority is computed but never paid. */
  seniorityIncludedInGross: boolean;
  /** Workbook behaviour is `false`: the employee's 4% ignores the ceiling. */
  capRetirementEmployee: boolean;
  /** Workbook behaviour is `null`: leave accrues forever, uncapped. */
  leaveCarryOverCapDays: number | null;
  /** Sorted ascending by `minDays`; the engine sorts defensively anyway. */
  seniorityBands: SeniorityBandSpec[];
}

// ─────────────────────────────────────────────────────────────────────────────
// ITS — the step table
// ─────────────────────────────────────────────────────────────────────────────

export interface ItsBand {
  lowerBound: number;
  upperBound: number;
  taxAmount: number;
}

export class ItsLookupError extends Error {
  constructor(
    readonly taxableWages: number,
    message: string,
  ) {
    super(message);
    this.name = 'ItsLookupError';
  }
}

/**
 * The ITS table as a step function, with O(log n) lookup.
 *
 * ITS is not a percentage. It is 503 contiguous 5,000-franc bands, each
 * mapping to a fixed franc amount, in force since 1 January 2022. Zero below
 * 50,000; the table ends at 2,514,999.
 *
 * Two details that matter:
 *
 *   - The published bands are stated in whole francs (`50000`–`54999`), but
 *     taxable wages are fractional — 57,074 gross yields 53,649.56 taxable. A
 *     strict `lower <= x <= upper` test therefore has a one-franc blind spot
 *     between every pair of bands. The table is a step function, so a value in
 *     that gap belongs to the band below it, which is also what Excel's
 *     `LOOKUP` does. Resolution is by greatest `lowerBound <= x`.
 *
 *   - Falling off either end is a hard error, never a silent zero. A negative
 *     taxable wage or one above 2,514,999 means the inputs are wrong, and
 *     quietly filing zero tax is the worst possible response.
 */
export class ItsTable {
  private readonly lowerBounds: number[];
  private readonly amounts: number[];
  private readonly maxUpperBound: number;

  constructor(bands: readonly ItsBand[]) {
    if (bands.length === 0) {
      throw new Error('payroll: the ITS table is empty — seed it before running payroll');
    }
    const sorted = [...bands].sort((a, b) => a.lowerBound - b.lowerBound);
    this.lowerBounds = sorted.map((band) => band.lowerBound);
    this.amounts = sorted.map((band) => band.taxAmount);
    this.maxUpperBound = sorted[sorted.length - 1].upperBound;
  }

  /** Number of bands loaded. Used by the seeder's self-check. */
  get size(): number {
    return this.lowerBounds.length;
  }

  lookup(taxableWages: number): number {
    if (!Number.isFinite(taxableWages)) {
      throw new ItsLookupError(taxableWages, 'ITS lookup received a non-finite taxable wage');
    }
    if (taxableWages < this.lowerBounds[0]) {
      throw new ItsLookupError(
        taxableWages,
        `Taxable wages ${taxableWages} fall below the first ITS band (${this.lowerBounds[0]}). ` +
          'Check the absence deduction — a negative taxable wage is never a zero-tax filing.',
      );
    }
    if (taxableWages > this.maxUpperBound) {
      throw new ItsLookupError(
        taxableWages,
        `Taxable wages ${taxableWages} exceed the last ITS band (${this.maxUpperBound}). ` +
          'The published 2022 table stops there; extend it in PayrollConfig rather than extrapolating.',
      );
    }

    // Greatest lowerBound <= taxableWages.
    let low = 0;
    let high = this.lowerBounds.length - 1;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (this.lowerBounds[mid] <= taxableWages) low = mid;
      else high = mid - 1;
    }
    return this.amounts[low];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Dates and service
// ─────────────────────────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;

/**
 * Whole days between two dates, measured on the UTC calendar so a timezone
 * offset can never shift a seniority band by a day.
 */
export function daysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.floor((b - a) / MS_PER_DAY);
}

/** Highest band whose `minDays` the employee has reached; 0 below the first. */
export function seniorityRateFor(serviceDays: number, bands: SeniorityBandSpec[]): number {
  const descending = [...bands].sort((a, b) => b.minDays - a.minDays);
  for (const band of descending) {
    if (serviceDays >= band.minDays) return band.rate;
  }
  return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// The line calculation
// ─────────────────────────────────────────────────────────────────────────────

export interface PayrollEmployeeInput {
  joiningDate: Date;
  /** Monthly gross before overtime and absence. */
  baseSalary: number;
}

export interface PayrollPeriodInput {
  /** Total overtime hours for the period; split across the two tiers here. */
  overtimeHours?: number;
  /** Manual input. The workbook had no formula for it. */
  absenceDeduction?: number;
  /**
   * The date seniority is measured at — the last day of the pay period, not
   * `new Date()`. The workbook used `TODAY()`, so reprinting an old payslip
   * silently re-aged the employee; freezing it here is defect #6's fix.
   */
  asOf: Date;
}

export interface OvertimeBreakdown {
  hourlyRate: number;
  hours125: number;
  hours150: number;
  amount125: number;
  amount150: number;
  totalAmount: number;
}

export interface CalculatedPayrollLine {
  overtime: OvertimeBreakdown;
  baseSalary: number;
  absenceDeduction: number;
  overtimeAmount: number;
  serviceDays: number;
  seniorityRate: number;
  seniorityAmount: number;
  currentGross: number;
  cappedSalary: number;
  retirementEmployee: number;
  amuEmployee: number;
  employerContribution: number;
  totalCnss: number;
  taxableWages: number;
  its: number;
  netSalary: number;
}

/**
 * Splits overtime hours across the two tiers and prices them.
 *
 * The hourly rate is derived from **base salary**, not from gross. The
 * workbook derives it from gross, and gross includes overtime — a circular
 * reference that Excel resolves by iterating to an arbitrary tolerance. Base
 * salary breaks the cycle deterministically and matches the workbook's own
 * figures wherever an employee has no absence deduction, which is every row in
 * the source data. This is one of the four behaviours flagged for
 * confirmation in the delivery notes.
 */
export function calculateOvertime(
  baseSalary: number,
  overtimeHours: number,
  rates: PayrollRates,
): OvertimeBreakdown {
  const hourlyRate = baseSalary / rates.monthlyHours;
  const hours = Math.max(overtimeHours, 0);
  const hours125 = Math.min(hours, rates.overtimeTier1MaxHours);
  const hours150 = Math.max(hours - rates.overtimeTier1MaxHours, 0);
  const amount125 = hourlyRate * rates.overtimeTier1Rate * hours125;
  const amount150 = hourlyRate * rates.overtimeTier2Rate * hours150;

  return {
    hourlyRate: round(hourlyRate),
    hours125,
    hours150,
    amount125: round(amount125),
    amount150: round(amount150),
    totalAmount: round(amount125 + amount150),
  };
}

/**
 * One employee's pay for one period.
 *
 * Pure: same inputs, same outputs, forever. The caller snapshots the result
 * into `PayrollLine` and never recomputes it.
 */
export function calculatePayrollLine(
  employee: PayrollEmployeeInput,
  inputs: PayrollPeriodInput,
  rates: PayrollRates,
  itsTable: ItsTable,
): CalculatedPayrollLine {
  const overtime = calculateOvertime(employee.baseSalary, inputs.overtimeHours ?? 0, rates);
  const absenceDeduction = round(inputs.absenceDeduction ?? 0);

  // Gross before seniority. Under the workbook's own settings this *is* the
  // current gross, because seniority is display-only.
  const baseGross = round(employee.baseSalary + overtime.totalAmount - absenceDeduction);

  const serviceDays = daysBetween(employee.joiningDate, inputs.asOf);
  const seniorityRate = seniorityRateFor(serviceDays, rates.seniorityBands);
  const seniorityAmount = round(baseGross * seniorityRate);

  const currentGross = rates.seniorityIncludedInGross
    ? round(baseGross + seniorityAmount)
    : baseGross;

  const cappedSalary = round(Math.min(currentGross, rates.contributionCeiling));

  // The ceiling is respected by the employer's 11.7% portion but not by the
  // employee's 4% — `cappedSalary` sits in the workbook right beside a 4% that
  // ignores it. Reproduced as found; `capRetirementEmployee` flips it.
  const retirementBase = rates.capRetirementEmployee ? cappedSalary : currentGross;
  const retirementEmployee = round(retirementBase * rates.retirementEmployeeRate);

  const amuEmployee = round(
    currentGross < rates.contributionCeiling
      ? currentGross * rates.amuEmployeeRate
      : rates.amuCeilingAmount,
  );

  const employerContribution = round(
    currentGross > rates.contributionCeiling
      ? currentGross * rates.retirementEmployeeRate +
          rates.contributionCeiling * rates.employerCappedPortion
      : currentGross * rates.employerRate,
  );

  // The "21.7%" line: employer 15.7 + employee 4 + AMU 2.
  const totalCnss = round(employerContribution + retirementEmployee + amuEmployee);

  const taxableWages = round(currentGross - retirementEmployee - amuEmployee);
  const its = round(itsTable.lookup(taxableWages));
  const netSalary = round(taxableWages - its);

  return {
    overtime,
    baseSalary: round(employee.baseSalary),
    absenceDeduction,
    overtimeAmount: overtime.totalAmount,
    serviceDays,
    seniorityRate,
    seniorityAmount,
    currentGross,
    cappedSalary,
    retirementEmployee,
    amuEmployee,
    employerContribution,
    totalCnss,
    taxableWages,
    its,
    netSalary,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Leave accrual
// ─────────────────────────────────────────────────────────────────────────────

export interface LeaveBalance {
  serviceDays: number;
  accrued: number;
  taken: number;
  balance: number;
  /** True when `leaveCarryOverCapDays` clipped the balance. */
  capped: boolean;
}

/**
 * Continuous accrual from the joining date: no annual reset, no cap. That is
 * what the workbook does, and it is why the source data already shows staff
 * sitting on 58 days. `leaveCarryOverCapDays` exists to change it and is null
 * by default — see the delivery notes.
 */
export function calculateLeaveBalance(
  joiningDate: Date,
  asOf: Date,
  daysTaken: number,
  rates: PayrollRates,
): LeaveBalance {
  const serviceDays = Math.max(daysBetween(joiningDate, asOf), 0);
  const accrued = round((serviceDays / 365) * rates.annualLeaveDays);
  const raw = round(accrued - daysTaken);
  const cap = rates.leaveCarryOverCapDays;
  const capped = cap !== null && raw > cap;

  return {
    serviceDays,
    accrued,
    taken: round(daysTaken),
    balance: capped ? round(cap as number) : raw,
    capped,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// End-of-service settlement
// ─────────────────────────────────────────────────────────────────────────────

export interface SeveranceInput {
  joiningDate: Date;
  terminationDate: Date;
  /** The gross the settlement is priced off — the final period's gross. */
  currentGross: number;
  /** Unused leave days at termination; priced only when `payUnusedLeave`. */
  unusedLeaveDays?: number;
  payUnusedLeave?: boolean;
}

export interface SeveranceResult {
  serviceDays: number;
  serviceYears: number;
  salaireBrut: number;
  indemniteFinDeService: number;
  indemnitePreavis: number;
  /** Zero unless `payUnusedLeave`; never folded in silently. */
  indemniteConge: number;
  dailyRate: number;
  unusedLeaveDays: number;
  totalBrut: number;
  cnss6: number;
  totalGeneral: number;
}

/**
 * Indemnité de fin de service.
 *
 * The unused-leave payout is legally required on termination under the Code du
 * travail and is missing from the workbook entirely. It is computed here but
 * only enters `totalBrut` when the caller opts in, so switching it on is a
 * visible decision rather than a silent change to what a leaver is paid.
 *
 * CNSS at 6% (retirement 4 + AMU 2) is charged on the whole `totalBrut`,
 * matching the workbook.
 */
export function calculateSeverance(input: SeveranceInput, rates: PayrollRates): SeveranceResult {
  const serviceDays = daysBetween(input.joiningDate, input.terminationDate);
  const serviceYears = serviceDays / 365;
  const salaireBrut = round(input.currentGross);

  const indemniteFinDeService = round(salaireBrut * serviceYears * rates.severanceRatePerYear);
  // One month's salary.
  const indemnitePreavis = salaireBrut;

  const unusedLeaveDays = Math.max(input.unusedLeaveDays ?? 0, 0);
  const dailyRate = round(salaireBrut / 30);
  const indemniteConge = input.payUnusedLeave ? round(dailyRate * unusedLeaveDays) : 0;

  const totalBrut = round(
    salaireBrut + indemniteFinDeService + indemnitePreavis + indemniteConge,
  );
  const cnss6 = round(totalBrut * rates.severanceCnssRate);
  const totalGeneral = round(totalBrut - cnss6);

  return {
    serviceDays,
    serviceYears,
    salaireBrut,
    indemniteFinDeService,
    indemnitePreavis,
    indemniteConge,
    dailyRate,
    unusedLeaveDays,
    totalBrut,
    cnss6,
    totalGeneral,
  };
}
