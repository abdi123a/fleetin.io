import { useMemo, useState } from 'react';

import { ArrowLeft, ArrowRight, UserPlus } from '@/design-system/icons';
import type { ContractType, EmployeeDetail, Gender } from '@/features/hr/api/hrService';
import { fmtDjfPlain } from '@/lib/finance';
import { useCreateEmployee, useUpdateEmployee } from '@/features/hr/api/queries';
import { ActionButton } from '@/pages/finance/components/kit';

import { frDate } from '../hrFormat';
import {
  Field,
  FieldGrid,
  FormError,
  ModalShell,
  StepRail,
  inputClass,
  type WizardStep,
} from './form';

const CONTRACT_TYPES: ContractType[] = ['CDI', 'CDD', 'APPRENTISSAGE', 'STAGE'];

/**
 * Three steps, in the order the paperwork actually arrives: who the person
 * is, what they were hired to do, and what they are paid. Splitting the
 * sixteen fields this way is not decoration — the old single grid asked for a
 * bank account and a CNSS number in the same breath as a name, which is why
 * half of it came back blank.
 */
const STEPS: readonly WizardStep[] = [
  {
    key: 'identity',
    title: 'Who is being hired',
    description: 'The identity every generated document is written in.',
    short: 'Identity',
  },
  {
    key: 'contract',
    title: 'The engagement',
    description: 'Role, contract and the dates that drive seniority and leave.',
    short: 'Contract',
  },
  {
    key: 'pay',
    title: 'Pay and filing',
    description: 'What is paid, and the numbers the CNSS and the bank need.',
    short: 'Pay',
  },
];

interface Draft {
  matricule: string;
  fullName: string;
  gender: Gender;
  nationality: string;
  cnssNumber: string;
  nifNumber: string;
  profession: string;
  department: string;
  contractType: ContractType;
  joiningDate: string;
  contractEndDate: string;
  trialPeriodEnd: string;
  baseSalary: string;
  bankAccount: string;
  email: string;
  phone: string;
}

function draftFrom(employee?: EmployeeDetail): Draft {
  return {
    matricule: employee?.matricule ?? '',
    fullName: employee?.fullName ?? '',
    gender: employee?.gender ?? 'M',
    nationality: employee?.nationality ?? 'Djiboutienne',
    cnssNumber: employee?.cnssNumber ?? '',
    nifNumber: employee?.nifNumber ?? '',
    profession: employee?.profession ?? '',
    department: employee?.department ?? '',
    contractType: employee?.contractType ?? 'CDI',
    joiningDate: employee?.joiningDate?.slice(0, 10) ?? '',
    contractEndDate: employee?.contractEndDate?.slice(0, 10) ?? '',
    trialPeriodEnd: employee?.trialPeriodEnd?.slice(0, 10) ?? '',
    baseSalary: employee?.baseSalary !== undefined ? String(employee.baseSalary) : '',
    bankAccount: employee?.bankAccount ?? '',
    email: employee?.email ?? '',
    phone: employee?.phone ?? '',
  };
}

/**
 * What is wrong with each step, keyed by field.
 *
 * Computed for the whole draft at once rather than per step, so the rail can
 * refuse to jump forward over a step that is not finished and the last step
 * can still summarise the first two.
 */
function validate(draft: Draft): Record<string, string> {
  const problems: Record<string, string> = {};

  if (draft.fullName.trim() === '') problems.fullName = 'A record needs a name.';
  if (draft.nationality.trim() === '') problems.nationality = 'Required on the CNSS bordereau.';
  // Matches the server's @IsEmail — a rejected address should be said here
  // rather than come back as a 400 three steps later.
  if (draft.email.trim() !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) {
    problems.email = 'That is not an email address.';
  }

  if (draft.profession.trim() === '') problems.profession = 'Printed on every attestation.';
  if (draft.joiningDate === '') problems.joiningDate = 'Seniority and leave accrue from this date.';
  if (draft.contractType !== 'CDI') {
    if (draft.contractEndDate === '') {
      problems.contractEndDate = `A ${draft.contractType} has to say when it ends.`;
    } else if (draft.joiningDate && draft.contractEndDate <= draft.joiningDate) {
      problems.contractEndDate = 'The end of the contract is after its start.';
    }
  }
  if (draft.trialPeriodEnd && draft.joiningDate && draft.trialPeriodEnd < draft.joiningDate) {
    problems.trialPeriodEnd = 'A trial period cannot end before the job starts.';
  }

  if (draft.baseSalary === '') problems.baseSalary = 'Payroll cannot be calculated without it.';
  else if (!Number.isFinite(Number(draft.baseSalary)) || Number(draft.baseSalary) < 0) {
    problems.baseSalary = 'A monthly gross in whole DJF.';
  }

  return problems;
}

/** Which fields each step owns, so a step is blocked only by its own errors. */
const STEP_FIELDS: readonly (readonly string[])[] = [
  ['fullName', 'nationality', 'email'],
  ['profession', 'joiningDate', 'contractEndDate', 'trialPeriodEnd'],
  ['baseSalary'],
];

/**
 * Create or edit one staff record.
 *
 * Gender is a required field and not an afterthought: every generated document
 * agrees in French off this one value — `M.`/`Mme`, `employé`/`employée`,
 * `l'intéressé`/`l'intéressée` — and there is no sensible default that is
 * right half the time.
 */
export function EmployeeFormModal({
  open,
  onClose,
  employee,
}: {
  open: boolean;
  onClose: () => void;
  /** Absent for a new record; present to edit an existing one. */
  employee?: EmployeeDetail;
}) {
  const editing = Boolean(employee);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(employee));

  /* An existing record has already cleared every step, so editing opens with
     the whole rail unlocked and a new hire earns it one step at a time. */
  const [step, setStep] = useState(0);
  const [furthest, setFurthest] = useState(editing ? STEPS.length - 1 : 0);
  /* Nothing is marked wrong until it has been left, or Next has been pressed
     on the step that owns it — an empty form is not a form full of errors. */
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const create = useCreateEmployee();
  const update = useUpdateEmployee();
  const pending = create.isPending || update.isPending;
  const error = (create.error as Error | null) ?? (update.error as Error | null);

  const problems = useMemo(() => validate(draft), [draft]);
  const stepProblems = (index: number) =>
    (STEP_FIELDS[index] ?? []).filter((key) => problems[key] !== undefined);
  const allClean = Object.keys(problems).length === 0;
  const last = step === STEPS.length - 1;

  const set =
    <K extends keyof Draft>(key: K) =>
    (value: Draft[K]) =>
      setDraft((previous) => ({ ...previous, [key]: value }));

  const blur = (key: keyof Draft) => () =>
    setTouched((previous) => ({ ...previous, [key]: true }));

  /** Shown only once the user has had a fair chance to fill the field in. */
  const errorFor = (key: keyof Draft) => (touched[key] ? problems[key] : undefined);

  function goNext() {
    const failing = stepProblems(step);
    if (failing.length > 0) {
      setTouched((previous) => ({
        ...previous,
        ...Object.fromEntries(failing.map((key) => [key, true])),
      }));
      return;
    }
    const next = Math.min(step + 1, STEPS.length - 1);
    setStep(next);
    setFurthest((previous) => Math.max(previous, next));
  }

  function submit() {
    if (!allClean) {
      /* Only reachable by the last step's button when an earlier step went
         stale — send the user back to the first one that is wrong. */
      setTouched(Object.fromEntries(Object.keys(problems).map((key) => [key, true])));
      const broken = STEP_FIELDS.findIndex((keys) => keys.some((key) => problems[key]));
      if (broken >= 0) setStep(broken);
      return;
    }

    const payload = {
      fullName: draft.fullName.trim(),
      gender: draft.gender,
      nationality: draft.nationality.trim(),
      cnssNumber: draft.cnssNumber.trim() || null,
      nifNumber: draft.nifNumber.trim() || null,
      profession: draft.profession.trim(),
      department: draft.department.trim() || null,
      contractType: draft.contractType,
      joiningDate: draft.joiningDate,
      // A CDD end date on a CDI is not a harmless extra field — it would show
      // up on the expiry dashboard as a contract about to lapse.
      contractEndDate: draft.contractType === 'CDI' ? null : draft.contractEndDate || null,
      trialPeriodEnd: draft.trialPeriodEnd || null,
      baseSalary: Number(draft.baseSalary),
      bankAccount: draft.bankAccount.trim() || null,
      email: draft.email.trim() || null,
      phone: draft.phone.trim() || null,
      managerId: employee?.managerId ?? null,
      ...(draft.matricule.trim() ? { matricule: draft.matricule.trim() } : {}),
    };

    const done = { onSuccess: () => onClose() };
    if (employee) update.mutate({ id: employee.id, payload }, done);
    else create.mutate(payload, done);
  }

  const current = STEPS[step] as WizardStep;

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      icon={UserPlus}
      title={editing ? 'Edit employee' : 'New employee'}
      subtitle={
        editing
          ? 'Filed payroll keeps its calculated figures.'
          : 'The matricule is generated when left blank.'
      }
      size="lg"
      toolbar={
        <StepRail
          steps={STEPS}
          current={step}
          furthest={furthest}
          onStepChange={setStep}
        />
      }
      footer={
        <>
          <ActionButton onClick={onClose}>Cancel</ActionButton>
          {step > 0 ? (
            <ActionButton icon={ArrowLeft} onClick={() => setStep(step - 1)}>
              Back
            </ActionButton>
          ) : null}
          {/*
            Neither button is disabled on validity, only on the request being
            in flight. A greyed-out Next is a dead end: it refuses to move and
            says nothing about why, and the reason is exactly what the user
            needs. Pressing it marks the step's fields touched and the errors
            appear under the ones at fault — which is also what makes
            `goNext`'s and `submit`'s failure branches reachable at all.
          */}
          {last ? (
            <ActionButton variant="primary" disabled={pending} onClick={submit}>
              {pending ? 'Saving…' : editing ? 'Save changes' : 'Create employee'}
            </ActionButton>
          ) : (
            <ActionButton icon={ArrowRight} variant="primary" onClick={goNext}>
              Next
            </ActionButton>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-extrabold tracking-tight text-foreground">{current.title}</h3>
          <p className="mt-0.5 text-xs font-semibold text-muted-foreground">
            {current.description}
          </p>
        </div>

        <FormError error={error} />

        {step === 0 ? (
          <FieldGrid>
            <Field label="Full name" required error={errorFor('fullName')}>
              <input
                className={inputClass}
                value={draft.fullName}
                onChange={(event) => set('fullName')(event.target.value)}
                onBlur={blur('fullName')}
                placeholder="Kadidja Houmad"
              />
            </Field>
            <Field
              label="Gender"
              required
              hint="Drives French agreement on every generated document."
            >
              <select
                className={inputClass}
                value={draft.gender}
                onChange={(event) => set('gender')(event.target.value as Gender)}
              >
                <option value="M">M. — masculine</option>
                <option value="F">Mme — feminine</option>
              </select>
            </Field>
            <Field label="Nationality" required error={errorFor('nationality')}>
              <input
                className={inputClass}
                value={draft.nationality}
                onChange={(event) => set('nationality')(event.target.value)}
                onBlur={blur('nationality')}
              />
            </Field>
            <Field
              label="Matricule"
              hint={editing ? undefined : 'Left blank, the next EMP- number.'}
            >
              <input
                className={inputClass}
                value={draft.matricule}
                onChange={(event) => set('matricule')(event.target.value)}
                placeholder="EMP-00011"
              />
            </Field>
            <Field label="Email" error={errorFor('email')}>
              <input
                type="email"
                className={inputClass}
                value={draft.email}
                onChange={(event) => set('email')(event.target.value)}
                onBlur={blur('email')}
                placeholder="k.houmad@fleetin.com"
              />
            </Field>
            <Field label="Phone">
              <input
                className={inputClass}
                value={draft.phone}
                onChange={(event) => set('phone')(event.target.value)}
                placeholder="77 12 34 56"
              />
            </Field>
          </FieldGrid>
        ) : null}

        {step === 1 ? (
          <FieldGrid>
            <Field
              label="Profession"
              required
              hint="Appears on every attestation and the bordereau."
              error={errorFor('profession')}
            >
              <input
                className={inputClass}
                value={draft.profession}
                onChange={(event) => set('profession')(event.target.value)}
                onBlur={blur('profession')}
                placeholder="Superviseur"
              />
            </Field>
            <Field label="Department">
              <input
                className={inputClass}
                value={draft.department}
                onChange={(event) => set('department')(event.target.value)}
                placeholder="Exploitation"
              />
            </Field>
            <Field label="Contract type" required>
              <select
                className={inputClass}
                value={draft.contractType}
                onChange={(event) => set('contractType')(event.target.value as ContractType)}
              >
                {CONTRACT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Joining date"
              required
              hint="Drives seniority, leave accrual and severance."
              error={errorFor('joiningDate')}
            >
              <input
                type="date"
                className={inputClass}
                value={draft.joiningDate}
                onChange={(event) => set('joiningDate')(event.target.value)}
                onBlur={blur('joiningDate')}
              />
            </Field>
            {draft.contractType !== 'CDI' ? (
              <Field
                label="Contract end"
                required
                hint="Surfaces on the expiry dashboard."
                error={errorFor('contractEndDate')}
              >
                <input
                  type="date"
                  className={inputClass}
                  value={draft.contractEndDate}
                  onChange={(event) => set('contractEndDate')(event.target.value)}
                  onBlur={blur('contractEndDate')}
                />
              </Field>
            ) : null}
            <Field label="Trial period ends" error={errorFor('trialPeriodEnd')}>
              <input
                type="date"
                className={inputClass}
                value={draft.trialPeriodEnd}
                onChange={(event) => set('trialPeriodEnd')(event.target.value)}
                onBlur={blur('trialPeriodEnd')}
              />
            </Field>
          </FieldGrid>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            <FieldGrid>
              <Field
                label="Base salary (DJF)"
                required
                hint="Monthly gross, before overtime and absence."
                error={errorFor('baseSalary')}
              >
                <input
                  type="number"
                  min={0}
                  step="1"
                  className={`${inputClass} tabular-nums`}
                  value={draft.baseSalary}
                  onChange={(event) => set('baseSalary')(event.target.value)}
                  onBlur={blur('baseSalary')}
                  placeholder="70106"
                />
              </Field>
              <Field label="CNSS number" hint="Blank if not yet registered.">
                <input
                  className={inputClass}
                  value={draft.cnssNumber}
                  onChange={(event) => set('cnssNumber')(event.target.value)}
                  placeholder="190 470 701"
                />
              </Field>
              <Field label="NIF">
                <input
                  className={inputClass}
                  value={draft.nifNumber}
                  onChange={(event) => set('nifNumber')(event.target.value)}
                  placeholder="2072435"
                />
              </Field>
              <Field label="Bank account" hint="Used by the ordre de virement.">
                <input
                  className={inputClass}
                  value={draft.bankAccount}
                  onChange={(event) => set('bankAccount')(event.target.value)}
                  placeholder="10 46 96 80"
                />
              </Field>
            </FieldGrid>

            <Review draft={draft} />
          </div>
        ) : null}
      </div>
    </ModalShell>
  );
}

/**
 * What the first two steps came to, restated on the last one.
 *
 * The point of a wizard is that earlier answers leave the screen; the point of
 * this block is that they are still checkable before the record is written.
 */
function Review({ draft }: { draft: Draft }) {
  const salary = Number(draft.baseSalary);
  const rows: Array<[string, string]> = [
    ['Name', draft.fullName.trim() || '—'],
    ['Gender', draft.gender === 'F' ? 'Mme — feminine' : 'M. — masculine'],
    ['Nationality', draft.nationality.trim() || '—'],
    ['Matricule', draft.matricule.trim() || 'Next EMP- number'],
    ['Profession', draft.profession.trim() || '—'],
    ['Department', draft.department.trim() || '—'],
    [
      'Contract',
      draft.contractType === 'CDI'
        ? 'CDI — open-ended'
        : `${draft.contractType} → ${frDate(draft.contractEndDate)}`,
    ],
    ['Joined', frDate(draft.joiningDate)],
    ['Monthly gross', Number.isFinite(salary) && draft.baseSalary ? `${fmtDjfPlain(salary)} DJF` : '—'],
  ];

  return (
    <div className="rounded-card-nested border border-border bg-surface-sunken px-4 py-3.5">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.07em] text-muted-foreground">
        The record as it will be filed
      </p>
      <dl className="mt-3 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3">
            <dt className="shrink-0 text-xs font-semibold text-muted-foreground">{label}</dt>
            <dd className="min-w-0 truncate text-right text-xs font-bold text-foreground">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default EmployeeFormModal;
