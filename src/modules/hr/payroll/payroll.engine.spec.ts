import {
  ItsLookupError,
  ItsTable,
  calculateLeaveBalance,
  calculateOvertime,
  calculatePayrollLine,
  calculateSeverance,
  daysBetween,
  round,
  seniorityRateFor,
  type PayrollRates,
} from './payroll.engine';
import { loadItsBands, loadItsTable } from './its-table.fixture';

/**
 * The 2022 rate set, as seeded. Written out in full rather than imported from
 * the seeder so that a careless edit to the seed data fails these tests
 * instead of quietly moving what everyone is paid.
 */
const RATES_2022: PayrollRates = {
  contributionCeiling: 400_000,
  retirementEmployeeRate: 0.04,
  amuEmployeeRate: 0.02,
  amuCeilingAmount: 8_000,
  employerRate: 0.157,
  employerCappedPortion: 0.117,
  monthlyHours: 208,
  overtimeTier1Rate: 1.25,
  overtimeTier1MaxHours: 6,
  overtimeTier2Rate: 1.5,
  severanceRatePerYear: 0.2,
  severanceCnssRate: 0.06,
  annualLeaveDays: 30,
  seniorityIncludedInGross: false,
  capRetirementEmployee: false,
  leaveCarryOverCapDays: null,
  seniorityBands: [
    { minDays: 360, rate: 0.02 },
    { minDays: 720, rate: 0.04 },
    { minDays: 1080, rate: 0.06 },
    { minDays: 1440, rate: 0.08 },
    { minDays: 1800, rate: 0.1 },
  ],
};

const ITS = loadItsTable();

/** No overtime, no absence — isolates the contribution and tax arithmetic. */
function lineForGross(gross: number, overrides: Partial<PayrollRates> = {}) {
  return calculatePayrollLine(
    { joiningDate: new Date('2024-01-01T00:00:00Z'), baseSalary: gross },
    { asOf: new Date('2025-12-31T00:00:00Z') },
    { ...RATES_2022, ...overrides },
    ITS,
  );
}

/** Everything filed is read to two decimal places. */
const money = (value: number) => round(value, 2);

describe('ITS table', () => {
  it('loads 503 bands from the published CSV', () => {
    expect(ITS.size).toBe(503);
  });

  it('is contiguous: every band starts one franc after the previous one ends', () => {
    const bands = loadItsBands().sort((a, b) => a.lowerBound - b.lowerBound);
    expect(bands[0].lowerBound).toBe(0);
    expect(bands[bands.length - 1].upperBound).toBe(2_514_999);

    for (let i = 1; i < bands.length; i += 1) {
      expect(bands[i].lowerBound).toBe(bands[i - 1].upperBound + 1);
      expect(bands[i].upperBound - bands[i].lowerBound).toBe(4_999);
    }
  });

  it('does not contain the workbook\'s out-of-order (1000, 49999, 0) row', () => {
    const bands = loadItsBands();
    expect(bands.some((band) => band.lowerBound === 1_000 && band.upperBound === 49_999)).toBe(
      false,
    );
  });

  it('charges nothing below 50,000', () => {
    expect(ITS.lookup(0)).toBe(0);
    expect(ITS.lookup(49_999)).toBe(0);
    expect(ITS.lookup(49_999.99)).toBe(0);
    expect(ITS.lookup(50_000)).toBe(3_650);
  });

  it('resolves a fractional wage in the gap between two published bands', () => {
    // 54,999 ends a band and 55,000 starts the next; 54,999.60 is in neither
    // under a strict range test. It belongs to the band below, as in Excel.
    expect(ITS.lookup(54_999.6)).toBe(3_650);
    expect(ITS.lookup(55_000)).toBe(4_400);
  });

  it('throws rather than defaulting to zero outside the table', () => {
    expect(() => ITS.lookup(-1)).toThrow(ItsLookupError);
    expect(() => ITS.lookup(2_515_000)).toThrow(ItsLookupError);
    expect(() => ITS.lookup(Number.NaN)).toThrow(ItsLookupError);
  });

  it('refuses to construct an empty table', () => {
    expect(() => new ItsTable([])).toThrow(/empty/i);
  });
});

describe('§2.6 — the four rows taken from the live workbook', () => {
  /* Every figure below is transcribed from the workbook this module replaces.
   * They are filed with CNSS and the tax authority: they must reconcile to the
   * franc, not to a tolerance. */
  const CASES = [
    {
      gross: 57_074,
      retirement: 2_282.96,
      amu: 1_141.48,
      employer: 8_960.62,
      totalCnss: 12_385.06,
      taxable: 53_649.56,
      its: 3_650,
      net: 49_999.56,
    },
    {
      gross: 128_351,
      retirement: 5_134.04,
      amu: 2_567.02,
      employer: 20_151.11,
      totalCnss: 27_852.17,
      taxable: 120_649.94,
      its: 14_150,
      net: 106_499.94,
    },
    {
      gross: 344_250,
      retirement: 13_770.0,
      amu: 6_885.0,
      employer: 54_047.25,
      totalCnss: 74_702.25,
      taxable: 323_595.0,
      its: 57_150,
      net: 266_445.0,
    },
    {
      gross: 70_106,
      retirement: 2_804.24,
      amu: 1_402.12,
      employer: 11_006.64,
      totalCnss: 15_213.0,
      taxable: 65_899.64,
      its: 5_900,
      net: 59_999.64,
    },
  ] as const;

  it.each(CASES)(
    'gross $gross reproduces the filed line exactly',
    ({ gross, retirement, amu, employer, totalCnss, taxable, its, net }) => {
      const line = lineForGross(gross);

      expect(line.currentGross).toBe(gross);
      expect(money(line.retirementEmployee)).toBe(retirement);
      expect(money(line.amuEmployee)).toBe(amu);
      expect(money(line.employerContribution)).toBe(employer);
      expect(money(line.totalCnss)).toBe(totalCnss);
      expect(money(line.taxableWages)).toBe(taxable);
      expect(line.its).toBe(its);
      expect(money(line.netSalary)).toBe(net);
    },
  );

  it('totals the CNSS line as employer + employee + AMU, the "21.7%"', () => {
    for (const testCase of CASES) {
      const line = lineForGross(testCase.gross);
      expect(money(line.employerContribution + line.retirementEmployee + line.amuEmployee)).toBe(
        testCase.totalCnss,
      );
    }
  });
});

describe('overtime', () => {
  it('reproduces the workbook overtime row: 128,351 gross over 24 hours', () => {
    const overtime = calculateOvertime(128_351, 24, RATES_2022);

    expect(overtime.hourlyRate).toBe(617.0721); // 128 351 / 208
    expect(overtime.hours125).toBe(6);
    expect(overtime.hours150).toBe(18);
    expect(money(overtime.amount125)).toBe(4_628.04);
    expect(money(overtime.amount150)).toBe(16_660.95);
    expect(money(overtime.totalAmount)).toBe(21_288.99);
  });

  it('prices the first six hours at 125% and everything after at 150%', () => {
    const six = calculateOvertime(208_000, 6, RATES_2022);
    expect(six.hours125).toBe(6);
    expect(six.hours150).toBe(0);
    expect(six.totalAmount).toBe(7_500); // 1 000/h × 1.25 × 6

    const seven = calculateOvertime(208_000, 7, RATES_2022);
    expect(seven.hours125).toBe(6);
    expect(seven.hours150).toBe(1);
    expect(seven.totalAmount).toBe(9_000); // 7 500 + 1 000 × 1.5
  });

  it('derives the hourly rate from base salary, not from gross-including-overtime', () => {
    // The circular reference in the workbook, broken deterministically: adding
    // overtime must not feed back into the rate that priced it.
    const line = calculatePayrollLine(
      { joiningDate: new Date('2024-01-01T00:00:00Z'), baseSalary: 128_351 },
      { asOf: new Date('2025-12-31T00:00:00Z'), overtimeHours: 24 },
      RATES_2022,
      ITS,
    );
    expect(line.overtime.hourlyRate).toBe(round(128_351 / 208));
    expect(money(line.currentGross)).toBe(money(128_351 + 21_288.99));
  });

  it('ignores negative hours rather than paying them back', () => {
    expect(calculateOvertime(100_000, -5, RATES_2022).totalAmount).toBe(0);
  });
});

describe('the 400,000 ceiling', () => {
  it('is continuous at exactly 400,000', () => {
    const line = lineForGross(400_000);

    expect(line.cappedSalary).toBe(400_000);
    expect(line.retirementEmployee).toBe(16_000); // 4% uncapped == 4% capped here
    expect(line.amuEmployee).toBe(8_000); // the flat ceiling amount == 2% of 400 000
    expect(line.employerContribution).toBe(62_800); // 15.7% of 400 000
    expect(line.totalCnss).toBe(86_800);
    expect(line.taxableWages).toBe(376_000);
    expect(line.its).toBe(70_900);
    expect(line.netSalary).toBe(305_100);
  });

  it('splits the employer contribution above the ceiling and freezes AMU at 8,000', () => {
    const line = lineForGross(450_000);

    expect(line.cappedSalary).toBe(400_000);
    // 4% on the uncapped gross, as in the workbook.
    expect(line.retirementEmployee).toBe(18_000);
    expect(line.amuEmployee).toBe(8_000);
    // 4% of gross + 11.7% of the ceiling.
    expect(line.employerContribution).toBe(64_800);
    expect(line.totalCnss).toBe(90_800);
    expect(line.taxableWages).toBe(424_000);
    expect(line.its).toBe(82_150);
    expect(line.netSalary).toBe(341_850);
  });

  it('caps the employee 4% only when capRetirementEmployee is switched on', () => {
    const asFiled = lineForGross(450_000);
    const capped = lineForGross(450_000, { capRetirementEmployee: true });

    expect(asFiled.retirementEmployee).toBe(18_000);
    expect(capped.retirementEmployee).toBe(16_000);
    // Switching it on hands the employee 2,000 more net — which is exactly why
    // it is a flag and not a silent correction.
    expect(capped.netSalary).toBeGreaterThan(asFiled.netSalary);
  });
});

describe('seniority', () => {
  it.each([
    [0, 0],
    [359, 0],
    [360, 0.02],
    [719, 0.02],
    [720, 0.04],
    [1_080, 0.06],
    [1_440, 0.08],
    [1_799, 0.08],
    [1_800, 0.1],
    [10_000, 0.1],
  ])('%i days of service earns %f', (days, expected) => {
    expect(seniorityRateFor(days, RATES_2022.seniorityBands)).toBe(expected);
  });

  it('is computed and displayed but never added to the gross, as in the workbook', () => {
    const line = calculatePayrollLine(
      { joiningDate: new Date('2020-01-01T00:00:00Z'), baseSalary: 100_000 },
      { asOf: new Date('2025-12-31T00:00:00Z') },
      RATES_2022,
      ITS,
    );

    expect(line.seniorityRate).toBe(0.1);
    expect(line.seniorityAmount).toBe(10_000);
    expect(line.currentGross).toBe(100_000); // untouched
  });

  it('enters the gross only when seniorityIncludedInGross is switched on', () => {
    const line = calculatePayrollLine(
      { joiningDate: new Date('2020-01-01T00:00:00Z'), baseSalary: 100_000 },
      { asOf: new Date('2025-12-31T00:00:00Z') },
      { ...RATES_2022, seniorityIncludedInGross: true },
      ITS,
    );

    expect(line.seniorityAmount).toBe(10_000);
    expect(line.currentGross).toBe(110_000);
    expect(line.retirementEmployee).toBe(4_400);
  });

  it('measures service at the given date, never at the wall clock', () => {
    const employee = { joiningDate: new Date('2024-01-01T00:00:00Z'), baseSalary: 100_000 };
    const early = calculatePayrollLine(
      employee,
      { asOf: new Date('2024-12-25T00:00:00Z') },
      RATES_2022,
      ITS,
    );
    const later = calculatePayrollLine(
      employee,
      { asOf: new Date('2025-01-05T00:00:00Z') },
      RATES_2022,
      ITS,
    );

    expect(early.seniorityRate).toBe(0);
    expect(later.seniorityRate).toBe(0.02);
  });
});

describe('absence', () => {
  it('is deducted from the gross for every employee, not just one row', () => {
    const line = calculatePayrollLine(
      { joiningDate: new Date('2024-01-01T00:00:00Z'), baseSalary: 128_351 },
      { asOf: new Date('2025-12-31T00:00:00Z'), absenceDeduction: 7_701 },
      RATES_2022,
      ITS,
    );

    expect(line.absenceDeduction).toBe(7_701);
    expect(line.currentGross).toBe(120_650);
    expect(money(line.retirementEmployee)).toBe(4_826);
    expect(money(line.amuEmployee)).toBe(2_413);
    expect(money(line.taxableWages)).toBe(113_411);
    expect(line.its).toBe(12_650); // band 110 000–114 999
  });

  it('surfaces an absence that would drive taxable wages negative', () => {
    expect(() =>
      calculatePayrollLine(
        { joiningDate: new Date('2024-01-01T00:00:00Z'), baseSalary: 50_000 },
        { asOf: new Date('2025-12-31T00:00:00Z'), absenceDeduction: 60_000 },
        RATES_2022,
        ITS,
      ),
    ).toThrow(ItsLookupError);
  });
});

describe('leave accrual', () => {
  it('accrues 30 days a year continuously from the joining date', () => {
    const balance = calculateLeaveBalance(
      new Date('2024-01-01T00:00:00Z'),
      new Date('2025-01-01T00:00:00Z'),
      0,
      RATES_2022,
    );

    expect(balance.serviceDays).toBe(366); // 2024 is a leap year
    expect(balance.accrued).toBe(round((366 / 365) * 30));
    expect(balance.balance).toBe(balance.accrued);
    expect(balance.capped).toBe(false);
  });

  it('never resets, so long-serving staff accumulate the balances seen in the source data', () => {
    const balance = calculateLeaveBalance(
      new Date('2023-01-01T00:00:00Z'),
      new Date('2025-12-31T00:00:00Z'),
      30,
      RATES_2022,
    );

    expect(balance.accrued).toBeGreaterThan(58);
    expect(balance.balance).toBe(round(balance.accrued - 30));
  });

  it('clips the balance only when a carry-over cap is configured', () => {
    const capped = calculateLeaveBalance(
      new Date('2020-01-01T00:00:00Z'),
      new Date('2025-12-31T00:00:00Z'),
      0,
      { ...RATES_2022, leaveCarryOverCapDays: 60 },
    );

    expect(capped.accrued).toBeGreaterThan(60);
    expect(capped.balance).toBe(60);
    expect(capped.capped).toBe(true);
  });
});

describe('indemnité de fin de service', () => {
  /* The worked example in the brief. The three lines that follow the indemnity
   * reconcile exactly; the indemnity line itself is 2.99 DJF above what the
   * stated formula produces from 713 days — see the note below the test. */
  const WORKED_EXAMPLE = {
    serviceDays: 713,
    gross: 77_436.23,
    statedIndemnite: 30_256.16,
    statedTotalBrut: 185_128.62,
    statedCnss6: 11_107.72,
    statedTotalGeneral: 174_020.9,
  };

  const result = calculateSeverance(
    {
      joiningDate: new Date('2024-01-14T00:00:00Z'),
      terminationDate: new Date('2025-12-27T00:00:00Z'), // 713 days
      currentGross: WORKED_EXAMPLE.gross,
    },
    RATES_2022,
  );

  it('measures 713 days of service between the two dates', () => {
    expect(result.serviceDays).toBe(WORKED_EXAMPLE.serviceDays);
  });

  it('prices the indemnity at 20% of gross per year of service', () => {
    // 77 436.23 × (713 / 365) × 20% = 30 253.17
    expect(money(result.indemniteFinDeService)).toBe(30_253.17);

    /* The brief's worked example states 30,256.16 for this line — 2.99 DJF
     * higher, i.e. an implied 713.07 days. Every other figure in that example
     * reconciles exactly with 30,256.16, so the discrepancy is confined to
     * this one cell of the source workbook. The formula in §4.3 is
     * unambiguous and is what is implemented; the 2.99 is raised in the
     * delivery notes rather than being reverse-engineered into the code. */
    expect(WORKED_EXAMPLE.statedIndemnite - money(result.indemniteFinDeService)).toBeCloseTo(
      2.99,
      2,
    );
  });

  it('pays one month of salary as notice', () => {
    expect(result.indemnitePreavis).toBe(WORKED_EXAMPLE.gross);
  });

  it('charges CNSS at 6% of the total brut and nets it off', () => {
    expect(money(result.totalBrut)).toBe(
      money(result.salaireBrut + result.indemniteFinDeService + result.indemnitePreavis),
    );
    expect(money(result.cnss6)).toBe(money(result.totalBrut * 0.06));
    expect(money(result.totalGeneral)).toBe(money(result.totalBrut - result.cnss6));
  });

  it('reconciles the brief\'s stated total when its indemnity figure is used', () => {
    // Proves the rest of the chain is right: substitute the workbook's own
    // indemnity and every downstream figure lands on the filed number.
    const totalBrut = round(
      WORKED_EXAMPLE.gross + WORKED_EXAMPLE.statedIndemnite + WORKED_EXAMPLE.gross,
    );
    expect(money(totalBrut)).toBe(WORKED_EXAMPLE.statedTotalBrut);
    expect(money(totalBrut * RATES_2022.severanceCnssRate)).toBe(WORKED_EXAMPLE.statedCnss6);
    expect(money(totalBrut - totalBrut * RATES_2022.severanceCnssRate)).toBe(
      WORKED_EXAMPLE.statedTotalGeneral,
    );
  });

  it('leaves the unused-leave payout out of the total unless it is asked for', () => {
    const without = calculateSeverance(
      {
        joiningDate: new Date('2024-01-14T00:00:00Z'),
        terminationDate: new Date('2025-12-27T00:00:00Z'),
        currentGross: WORKED_EXAMPLE.gross,
        unusedLeaveDays: 12,
      },
      RATES_2022,
    );
    expect(without.indemniteConge).toBe(0);
    expect(without.totalBrut).toBe(result.totalBrut);

    const withLeave = calculateSeverance(
      {
        joiningDate: new Date('2024-01-14T00:00:00Z'),
        terminationDate: new Date('2025-12-27T00:00:00Z'),
        currentGross: WORKED_EXAMPLE.gross,
        unusedLeaveDays: 12,
        payUnusedLeave: true,
      },
      RATES_2022,
    );
    expect(withLeave.dailyRate).toBe(round(WORKED_EXAMPLE.gross / 30));
    expect(withLeave.indemniteConge).toBe(round(withLeave.dailyRate * 12));
    expect(withLeave.totalBrut).toBeGreaterThan(result.totalBrut);
  });
});

describe('helpers', () => {
  it('rounds half away from zero, as Excel does', () => {
    expect(round(2.5, 0)).toBe(3);
    expect(round(-2.5, 0)).toBe(-3);
    expect(round(1.005, 2)).toBe(1.01);
    expect(round(8_960.61800000001, 2)).toBe(8_960.62);
  });

  it('counts days on the calendar, immune to timezone offsets', () => {
    expect(
      daysBetween(new Date('2024-01-01T23:00:00Z'), new Date('2024-01-02T01:00:00Z')),
    ).toBe(1);
    expect(daysBetween(new Date('2024-01-01T00:00:00Z'), new Date('2025-01-01T00:00:00Z'))).toBe(
      366,
    );
  });
});
