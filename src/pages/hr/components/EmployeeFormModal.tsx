import { useState } from 'react';

import { UserPlus } from '@/design-system/icons';
import type {
  ContractType,
  EmployeeDetail,
  Gender,
} from '@/features/hr/api/hrService';
import { useCreateEmployee, useUpdateEmployee } from '@/features/hr/api/queries';
import { ActionButton } from '@/pages/finance/components/kit';

import { Field, FieldGrid, FormError, ModalShell, inputClass } from './form';

const CONTRACT_TYPES: ContractType[] = ['CDI', 'CDD', 'APPRENTISSAGE', 'STAGE'];

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

  const create = useCreateEmployee();
  const update = useUpdateEmployee();
  const pending = create.isPending || update.isPending;
  const error = (create.error as Error | null) ?? (update.error as Error | null);

  const set = <K extends keyof Draft>(key: K) => (value: Draft[K]) =>
    setDraft((previous) => ({ ...previous, [key]: value }));

  const complete =
    draft.fullName.trim() !== '' &&
    draft.profession.trim() !== '' &&
    draft.nationality.trim() !== '' &&
    draft.joiningDate !== '' &&
    draft.baseSalary !== '';

  function submit() {
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

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      icon={UserPlus}
      title={editing ? 'Edit employee' : 'New employee'}
      subtitle={
        editing
          ? 'Changes apply from now on. Filed payroll keeps the figures it was calculated with.'
          : 'The matricule is generated when left blank.'
      }
      size="lg"
      footer={
        <>
          <ActionButton onClick={onClose}>Cancel</ActionButton>
          <ActionButton variant="primary" disabled={!complete || pending} onClick={submit}>
            {pending ? 'Saving…' : editing ? 'Save changes' : 'Create employee'}
          </ActionButton>
        </>
      }
    >
      <div className="space-y-4">
        <FormError error={error} />

        <FieldGrid>
          <Field label="Full name" required>
            <input
              className={inputClass}
              value={draft.fullName}
              onChange={(event) => set('fullName')(event.target.value)}
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
          <Field label="Profession" required hint="Appears on every attestation and the bordereau.">
            <input
              className={inputClass}
              value={draft.profession}
              onChange={(event) => set('profession')(event.target.value)}
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
          <Field label="Nationality" required>
            <input
              className={inputClass}
              value={draft.nationality}
              onChange={(event) => set('nationality')(event.target.value)}
            />
          </Field>
          <Field label="Matricule" hint={editing ? undefined : 'Left blank, the next EMP- number.'}>
            <input
              className={inputClass}
              value={draft.matricule}
              onChange={(event) => set('matricule')(event.target.value)}
              placeholder="EMP-00011"
            />
          </Field>
          <Field label="CNSS number" hint="Blank for staff not yet registered.">
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
          >
            <input
              type="date"
              className={inputClass}
              value={draft.joiningDate}
              onChange={(event) => set('joiningDate')(event.target.value)}
            />
          </Field>
          {draft.contractType !== 'CDI' ? (
            <Field label="Contract end" hint="Surfaces on the expiry dashboard.">
              <input
                type="date"
                className={inputClass}
                value={draft.contractEndDate}
                onChange={(event) => set('contractEndDate')(event.target.value)}
              />
            </Field>
          ) : null}
          <Field label="Trial period ends">
            <input
              type="date"
              className={inputClass}
              value={draft.trialPeriodEnd}
              onChange={(event) => set('trialPeriodEnd')(event.target.value)}
            />
          </Field>
          <Field
            label="Base salary (DJF)"
            required
            hint="Monthly gross, before overtime and absence."
          >
            <input
              type="number"
              min={0}
              step="1"
              className={`${inputClass} tabular-nums`}
              value={draft.baseSalary}
              onChange={(event) => set('baseSalary')(event.target.value)}
              placeholder="70106"
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
          <Field label="Email">
            <input
              type="email"
              className={inputClass}
              value={draft.email}
              onChange={(event) => set('email')(event.target.value)}
            />
          </Field>
          <Field label="Phone">
            <input
              className={inputClass}
              value={draft.phone}
              onChange={(event) => set('phone')(event.target.value)}
            />
          </Field>
        </FieldGrid>
      </div>
    </ModalShell>
  );
}

export default EmployeeFormModal;
