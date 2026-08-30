import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ContractType,
  DocumentScope,
  EmployeeStatus,
  Gender,
  LeaveStatus,
  LeaveType,
  PeriodStatus,
  Prisma,
  PrismaClient,
} from '@prisma/client';

/**
 * HR & Payroll seed.
 *
 * Three things here are not demo data and must exist in every environment:
 * the 2022 `PayrollConfig`, its 503 ITS bands, and the six document
 * templates. The employees, the December 2025 period and the leave records
 * below them are demo fixtures, skipped when `HR_SEED_DEMO=false`.
 */

export const ITS_CSV_PATH = join(__dirname, 'data/its_brackets_2022.csv');

/** Expected band count of the published table, asserted rather than assumed. */
const EXPECTED_ITS_BANDS = 503;

export const CONFIG_LABEL = 'Djibouti — barème 2022 (en vigueur depuis le 1er janvier 2022)';

export function parseItsCsv(csv: string) {
  const [header, ...rows] = csv
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (header !== 'lower_bound,upper_bound,tax_amount') {
    throw new Error(`ITS CSV: unexpected header "${header}"`);
  }

  return rows.map((row, index) => {
    const [lowerBound, upperBound, taxAmount] = row.split(',').map(Number);
    if ([lowerBound, upperBound, taxAmount].some((value) => !Number.isFinite(value))) {
      throw new Error(`ITS CSV: row ${index + 2} is not numeric ("${row}")`);
    }
    return { lowerBound, upperBound, taxAmount };
  });
}

/**
 * The table must be contiguous or a fractional taxable wage can fall into a
 * hole. Verified at seed time so a bad CSV is caught before payroll runs on
 * it, not after a filing.
 */
export function assertContiguous(bands: { lowerBound: number; upperBound: number }[]) {
  if (bands.length !== EXPECTED_ITS_BANDS) {
    throw new Error(`ITS CSV: expected ${EXPECTED_ITS_BANDS} bands, found ${bands.length}`);
  }
  for (let i = 1; i < bands.length; i += 1) {
    if (bands[i].lowerBound !== bands[i - 1].upperBound + 1) {
      throw new Error(
        `ITS CSV: gap between ${bands[i - 1].upperBound} and ${bands[i].lowerBound}. ` +
          "The workbook's out-of-order (1000, 49999, 0) row is the usual cause.",
      );
    }
  }
}

/* ─────────────────────────────────────────────────────────────────────────
 * Document templates
 *
 * `bodyFr` is the prose. Tabular documents (bulletin, bordereau, ordre de
 * virement) carry only their intro paragraph here; their tables are
 * structural and are laid out by the renderer, which reads the same payload.
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * Exported so `prisma/tools/generate-hr-reference-migration.ts` can emit the
 * data migration that carries these into an already-deployed database. The
 * seed and the migration must say the same thing, and the only way to
 * guarantee that is for both to read this one array.
 */
export const DOCUMENT_TEMPLATES = [
  {
    key: 'attestation_travail',
    label: 'Attestation de travail',
    scope: DocumentScope.EMPLOYEE,
    refPrefix: 'att',
    bodyFr:
      'Nous, soussignés {{company.legalName}}, certifions que {{employee.civility}} ' +
      '{{employee.fullName}}, de nationalité {{employee.nationalityLower}}, est ' +
      '{{employee.employedWord}} dans notre société depuis le {{employee.joiningDate}} ' +
      'en qualité de {{employee.profession}} jusqu’à ce jour.\n\n' +
      'Le présent certificat est établi à la demande de {{employee.concernedWord}} ' +
      'pour servir et valoir ce que de droit.',
    requiresFields: [{ key: 'issueDate', label: "Date d'émission", type: 'date', default: 'today' }],
  },
  {
    key: 'attestation_conge',
    label: 'Attestation de congé',
    scope: DocumentScope.EMPLOYEE,
    refPrefix: 'cng',
    bodyFr:
      'Nous, soussignés {{company.legalName}}, certifions que {{employee.civility}} ' +
      '{{employee.fullName}}, {{employee.employedWord}} en qualité de ' +
      '{{employee.profession}}, est en congé annuel du {{leave.startDate}} au ' +
      '{{leave.endDate}}, soit {{leave.days}} jours.\n\n' +
      'Le présent certificat est délivré à la demande de {{employee.concernedWord}} ' +
      'pour servir et valoir ce que de droit.',
    requiresFields: [
      { key: 'leaveRecordId', label: 'Congé approuvé', type: 'leave', required: false },
      { key: 'startDate', label: 'Début du congé', type: 'date', required: true },
      { key: 'endDate', label: 'Fin du congé', type: 'date', required: true },
      { key: 'issueDate', label: "Date d'émission", type: 'date', default: 'today' },
    ],
  },
  {
    key: 'indemnite_fin',
    label: 'Indemnité de fin de service',
    scope: DocumentScope.EMPLOYEE,
    refPrefix: 'ifs',
    bodyFr:
      'Nous, soussignés {{company.legalName}}, certifions que le calcul de ' +
      'l’indemnité de fin de service de {{employee.civility}} {{employee.fullName}}, ' +
      '{{employee.employedWord}} en qualité de {{employee.profession}}, est établi ' +
      'comme suit :',
    requiresFields: [
      { key: 'terminationDate', label: 'Date de fin de contrat', type: 'date', required: true },
      {
        key: 'payUnusedLeave',
        label: 'Inclure l’indemnité compensatrice de congé',
        type: 'toggle',
        default: false,
        hint: 'Exigée à la rupture par le Code du travail et absente du tableur d’origine.',
      },
      { key: 'issueDate', label: "Date d'émission", type: 'date', default: 'today' },
    ],
  },
  {
    key: 'bulletin_paie',
    label: 'Bulletin de paie',
    scope: DocumentScope.EMPLOYEE,
    refPrefix: 'bp',
    bodyFr: '',
    requiresFields: [
      { key: 'periodId', label: 'Période de paie', type: 'period', required: true },
      { key: 'issueDate', label: "Date d'émission", type: 'date', default: 'today' },
    ],
  },
  {
    key: 'bordereau_cnss',
    label: 'Bordereau CNSS — Liste du personnel',
    scope: DocumentScope.PERIOD,
    refPrefix: 'cnss',
    bodyFr: '',
    requiresFields: [{ key: 'issueDate', label: "Date d'émission", type: 'date', default: 'today' }],
  },
  {
    key: 'ordre_virement',
    label: 'Ordre de virement',
    scope: DocumentScope.PERIOD,
    refPrefix: 'vir',
    bodyFr:
      'Nous vous prions de bien vouloir procéder au virement des salaires du mois de ' +
      '{{period.labelFrLower}} au profit des bénéficiaires ci-dessous, par le débit de ' +
      'notre compte.',
    requiresFields: [{ key: 'issueDate', label: "Date d'émission", type: 'date', default: 'today' }],
  },
] as const;

/* ─────────────────────────────────────────────────────────────────────────
 * Demo staff — the ten-person roster from the document prototype.
 * ───────────────────────────────────────────────────────────────────────── */

const DEMO_EMPLOYEES = [
  { matricule: 'EMP-00001', fullName: 'Kadidja Houmad', gender: Gender.F, cnss: null, profession: 'General Manager', department: 'Direction', joined: '2024-12-13', base: 128351, otHours: 24, bank: '10 09 60 86', leaveTaken: 40 },
  { matricule: 'EMP-00002', fullName: 'Abdo Ali Ahmed', gender: Gender.M, cnss: '170 276 715', profession: 'HR Officer', department: 'Ressources Humaines', joined: '2025-10-20', base: 344250, otHours: 4, bank: '10 39 48 57', leaveTaken: 0 },
  { matricule: 'EMP-00003', fullName: 'Ali Ahmed Loita', gender: Gender.M, cnss: '224452', profession: 'Finance / Admin', department: 'Finance', joined: '2024-09-01', base: 157340, otHours: 0, bank: '10 57 40 96', leaveTaken: 30 },
  { matricule: 'EMP-00004', fullName: 'Nadira Ahmed Ali', gender: Gender.F, cnss: '268597', profession: 'Cook', department: 'Services généraux', joined: '2025-04-01', base: 94574, otHours: 0, bank: '10 30 83 44', leaveTaken: 0 },
  { matricule: 'EMP-00005', fullName: 'Hamza Youssouf Ahmed', gender: Gender.M, cnss: '268596', profession: 'Customer Relation', department: 'Exploitation', joined: '2024-09-01', base: 57074, otHours: 0, bank: '10 56 16 33', leaveTaken: 30 },
  { matricule: 'EMP-00006', fullName: 'Zahra Kadar Amir', gender: Gender.F, cnss: '200000285', profession: 'Bun Maker', department: 'Production', joined: '2024-09-01', base: 57074, otHours: 0, bank: '10 48 15 27', leaveTaken: 0 },
  { matricule: 'EMP-00007', fullName: 'Saada Ayoub Bogoreh', gender: Gender.F, cnss: '190470701', profession: 'Cashier', department: 'Exploitation', joined: '2024-09-01', base: 70106, otHours: 0, bank: '10 46 96 80', leaveTaken: 0 },
  { matricule: 'EMP-00008', fullName: 'Abdourahman Adoche Hoch', gender: Gender.M, cnss: '190454463', profession: 'Superviseur', department: 'Exploitation', joined: '2024-09-01', base: 70106, otHours: 0, bank: '10 51 42 23', leaveTaken: 30 },
  { matricule: 'EMP-00009', fullName: 'Farah Ahmed Farah', gender: Gender.M, cnss: '190474640', profession: 'Guard', department: 'Services généraux', joined: '2024-09-01', base: 57074, otHours: 0, bank: '10 51 42 24', leaveTaken: 30 },
  { matricule: 'EMP-00010', fullName: 'Arafo Omar Farah', gender: Gender.M, cnss: '248315', profession: 'Cleaner', department: 'Services généraux', joined: '2024-09-01', base: 47872, otHours: 0, bank: '10 43 89 12', leaveTaken: 0 },
] as const;

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** The date the 2022 barème came into force. */
export const CONFIG_EFFECTIVE_FROM = '2022-01-01';

/**
 * The 2022 rate set, as plain numbers.
 *
 * Hoisted out of `seedHr` so the data migration that carries this into an
 * already-deployed database reads the same literals rather than a copy of
 * them — these are what people are paid by, and two versions of them is one
 * version too many.
 *
 * The three booleans/nulls at the end reproduce the workbook. Changing any of
 * them changes what people are paid, so they are decisions for the business,
 * not defaults for a seed script.
 */
export const CONFIG_RATES = {
  contributionCeiling: 400000,
  retirementEmployeeRate: 0.04,
  amuEmployeeRate: 0.02,
  amuCeilingAmount: 8000,
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
} as const;

/** Seniority uplift by completed service, in days. */
export const SENIORITY_BANDS = [
  { minDays: 360, rate: 0.02 },
  { minDays: 720, rate: 0.04 },
  { minDays: 1080, rate: 0.06 },
  { minDays: 1440, rate: 0.08 },
  { minDays: 1800, rate: 0.1 },
] as const;

export async function seedHr(prisma: PrismaClient, adminUserId: string) {
  // ── 1. Rate configuration ────────────────────────────────────────────────
  const bands = parseItsCsv(readFileSync(ITS_CSV_PATH, 'utf8'));
  assertContiguous(bands);

  const existingConfig = await prisma.payrollConfig.findFirst({
    where: { label: CONFIG_LABEL },
  });

  const config =
    existingConfig ??
    (await prisma.payrollConfig.create({
      data: {
        label: CONFIG_LABEL,
        effectiveFrom: utc(CONFIG_EFFECTIVE_FROM),
        contributionCeiling: new Prisma.Decimal(CONFIG_RATES.contributionCeiling),
        retirementEmployeeRate: new Prisma.Decimal(CONFIG_RATES.retirementEmployeeRate),
        amuEmployeeRate: new Prisma.Decimal(CONFIG_RATES.amuEmployeeRate),
        amuCeilingAmount: new Prisma.Decimal(CONFIG_RATES.amuCeilingAmount),
        employerRate: new Prisma.Decimal(CONFIG_RATES.employerRate),
        employerCappedPortion: new Prisma.Decimal(CONFIG_RATES.employerCappedPortion),
        monthlyHours: new Prisma.Decimal(CONFIG_RATES.monthlyHours),
        overtimeTier1Rate: new Prisma.Decimal(CONFIG_RATES.overtimeTier1Rate),
        overtimeTier1MaxHours: new Prisma.Decimal(CONFIG_RATES.overtimeTier1MaxHours),
        overtimeTier2Rate: new Prisma.Decimal(CONFIG_RATES.overtimeTier2Rate),
        severanceRatePerYear: new Prisma.Decimal(CONFIG_RATES.severanceRatePerYear),
        severanceCnssRate: new Prisma.Decimal(CONFIG_RATES.severanceCnssRate),
        annualLeaveDays: new Prisma.Decimal(CONFIG_RATES.annualLeaveDays),
        seniorityIncludedInGross: CONFIG_RATES.seniorityIncludedInGross,
        capRetirementEmployee: CONFIG_RATES.capRetirementEmployee,
        leaveCarryOverCapDays: CONFIG_RATES.leaveCarryOverCapDays,
      },
    }));

  const bandCount = await prisma.itsBracket.count({ where: { configId: config.id } });
  if (bandCount === 0) {
    await prisma.itsBracket.createMany({
      data: bands.map((band) => ({
        configId: config.id,
        lowerBound: new Prisma.Decimal(band.lowerBound),
        upperBound: new Prisma.Decimal(band.upperBound),
        taxAmount: new Prisma.Decimal(band.taxAmount),
      })),
    });
  }

  for (const band of SENIORITY_BANDS) {
    await prisma.seniorityBand.upsert({
      where: { configId_minDays: { configId: config.id, minDays: band.minDays } },
      update: { rate: new Prisma.Decimal(band.rate) },
      create: {
        configId: config.id,
        minDays: band.minDays,
        rate: new Prisma.Decimal(band.rate),
      },
    });
  }

  console.log(
    `💰 Payroll config "${config.label}" — ${await prisma.itsBracket.count({
      where: { configId: config.id },
    })} ITS bands, ${SENIORITY_BANDS.length} seniority bands`,
  );

  // ── 2. Company settings ──────────────────────────────────────────────────
  const settingsCount = await prisma.companySettings.count();
  if (settingsCount === 0) {
    await prisma.companySettings.create({
      data: {
        name: 'Fleetin',
        legalName: 'Fleetin SARL',
        address: 'Gabode Haramous Lot 123, Djibouti',
        phone: '+253 77 00 00 00',
        email: 'rh@fleetin.dj',
        cnssId: '042*0156',
        nif: '2072435',
        bankName: 'CAC Bank',
        bankAccountName: 'Fleetin SARL',
        bankAccountNo: '10173515',
        signatoryPrepared: { name: 'Kadidja Houmad', role: 'Admin' },
        signatoryChecked: { name: 'Hamza Omar', role: '' },
        signatoryApproved: { name: 'Ismael Ahmed', role: 'GM' },
      },
    });
    console.log('🏢 Seeded company settings');
  }

  // ── 3. Document templates ────────────────────────────────────────────────
  for (const template of DOCUMENT_TEMPLATES) {
    await prisma.documentTemplate.upsert({
      where: { key: template.key },
      update: {
        label: template.label,
        scope: template.scope,
        refPrefix: template.refPrefix,
        bodyFr: template.bodyFr,
        requiresFields: template.requiresFields as unknown as Prisma.InputJsonValue,
      },
      create: {
        key: template.key,
        label: template.label,
        scope: template.scope,
        refPrefix: template.refPrefix,
        bodyFr: template.bodyFr,
        requiresFields: template.requiresFields as unknown as Prisma.InputJsonValue,
      },
    });
  }
  console.log(`📄 Seeded ${DOCUMENT_TEMPLATES.length} document templates`);

  // ── 4. Demo staff ────────────────────────────────────────────────────────
  if (process.env.HR_SEED_DEMO === 'false') {
    console.log('👥 HR demo fixtures skipped (HR_SEED_DEMO=false)');
    return;
  }

  if ((await prisma.employee.count()) > 0) {
    console.log('👥 HR demo fixtures already present — skipped');
    return;
  }

  const employeeIdByMatricule = new Map<string, string>();
  for (const person of DEMO_EMPLOYEES) {
    const created = await prisma.employee.create({
      data: {
        matricule: person.matricule,
        fullName: person.fullName,
        gender: person.gender,
        nationality: 'Djiboutienne',
        cnssNumber: person.cnss,
        profession: person.profession,
        department: person.department,
        contractType: ContractType.CDI,
        joiningDate: utc(person.joined),
        baseSalary: new Prisma.Decimal(person.base),
        bankAccount: person.bank,
        status: EmployeeStatus.ACTIVE,
      },
    });
    employeeIdByMatricule.set(person.matricule, created.id);
  }
  console.log(`👥 Seeded ${DEMO_EMPLOYEES.length} employees`);

  // Leave already taken, as one approved record per person who has taken any.
  for (const person of DEMO_EMPLOYEES) {
    if (person.leaveTaken === 0) continue;
    const employeeId = employeeIdByMatricule.get(person.matricule)!;
    const start = utc('2025-07-01');
    const end = new Date(start.getTime() + (person.leaveTaken - 1) * 86_400_000);
    await prisma.leaveRecord.create({
      data: {
        employeeId,
        type: LeaveType.ANNUAL,
        status: LeaveStatus.APPROVED,
        startDate: start,
        endDate: end,
        days: new Prisma.Decimal(person.leaveTaken),
        decidedById: adminUserId,
        decidedAt: start,
      },
    });
  }

  // A December 2025 period in DRAFT, with the overtime the prototype shows.
  // Deliberately not calculated: the first run is the user's to make, and a
  // seeded CALCULATED period would be a payroll no one authorised.
  const period = await prisma.payrollPeriod.create({
    data: { month: 12, year: 2025, status: PeriodStatus.DRAFT, configId: config.id },
  });

  for (const person of DEMO_EMPLOYEES) {
    if (person.otHours === 0) continue;
    const employeeId = employeeIdByMatricule.get(person.matricule)!;
    const hourlyRate = person.base / 208;
    const hours125 = Math.min(person.otHours, 6);
    const hours150 = Math.max(person.otHours - 6, 0);
    await prisma.overtimeEntry.create({
      data: {
        periodId: period.id,
        employeeId,
        hours125: new Prisma.Decimal(hours125),
        hours150: new Prisma.Decimal(hours150),
        hourlyRate: new Prisma.Decimal(hourlyRate.toFixed(4)),
        amount125: new Prisma.Decimal((hourlyRate * 1.25 * hours125).toFixed(4)),
        amount150: new Prisma.Decimal((hourlyRate * 1.5 * hours150).toFixed(4)),
        totalAmount: new Prisma.Decimal(
          (hourlyRate * 1.25 * hours125 + hourlyRate * 1.5 * hours150).toFixed(4),
        ),
      },
    });
  }

  console.log('🗓️  Seeded payroll period 12/2025 (DRAFT) with overtime entries');
}
