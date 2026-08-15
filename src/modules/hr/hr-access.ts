import { ForbiddenException } from '@nestjs/common';
import { EmployeeDocumentCategory } from '@prisma/client';
import { PERMISSIONS, hasPermission } from '../../common/constants/permissions';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

/**
 * The §6 access rules, in one place.
 *
 * Every rule here is enforced in the service layer. The UI hides what a role
 * cannot use, but hiding is not enforcing — a MANAGER who calls the API
 * directly gets the same redacted record they would see on screen.
 */

/** Document categories that count as personal identity material. */
export const IDENTITY_DOCUMENT_CATEGORIES: EmployeeDocumentCategory[] = [
  EmployeeDocumentCategory.CV,
  EmployeeDocumentCategory.ID_CARD,
  EmployeeDocumentCategory.PASSPORT,
  EmployeeDocumentCategory.DIPLOMA,
  EmployeeDocumentCategory.MEDICAL_CERT,
  EmployeeDocumentCategory.DRIVING_LICENCE,
];

export interface HrViewer {
  /** May read `baseSalary`, payroll figures and bank details. */
  canSeeSalary: boolean;
  /** May read ID/passport/CV scans and the encrypted identity fields. */
  canSeeIdentity: boolean;
  /** Full directory access; otherwise the viewer is scoped. */
  isHrAdmin: boolean;
  /** The employee record this user *is*, when they have one. */
  selfEmployeeId: string | null;
}

export function resolveViewer(
  user: AuthenticatedUser,
  selfEmployeeId: string | null,
): HrViewer {
  const granted = user.permissions ?? [];
  return {
    canSeeSalary: hasPermission(granted, PERMISSIONS.hr.viewSalary),
    canSeeIdentity: hasPermission(granted, PERMISSIONS.hr.viewIdentity),
    isHrAdmin: hasPermission(granted, PERMISSIONS.hr.create),
    selfEmployeeId,
  };
}

/**
 * Which employees a viewer may see at all.
 *
 * `null` means unrestricted. Anything else is a Prisma `where` fragment, so
 * the restriction is applied by the database rather than by filtering a full
 * result set in memory — a scoped user's query never loads rows they are not
 * allowed to have.
 */
export function employeeScopeFor(
  user: AuthenticatedUser,
  viewer: HrViewer,
): { id?: string; OR?: { managerId?: string; id?: string }[] } | null {
  if (viewer.isHrAdmin || viewer.canSeeSalary) return null;

  const granted = user.permissions ?? [];
  // A line manager sees their own reports, plus themselves.
  if (hasPermission(granted, PERMISSIONS.leave.approve)) {
    if (!viewer.selfEmployeeId) return { id: '__no_employee_record__' };
    return { OR: [{ managerId: viewer.selfEmployeeId }, { id: viewer.selfEmployeeId }] };
  }

  // Everyone else sees only themselves.
  return { id: viewer.selfEmployeeId ?? '__no_employee_record__' };
}

/**
 * Strips fields the viewer may not read.
 *
 * Salary and bank details are removed rather than zeroed: a zero reads as a
 * fact, an absent key reads as "not yours to see", and the frontend renders
 * the two very differently.
 */
export function redactEmployee<
  T extends {
    id: string;
    baseSalary?: unknown;
    bankAccount?: unknown;
    nifNumber?: unknown;
    cnssNumber?: unknown;
  },
>(employee: T, viewer: HrViewer): Partial<T> & { id: string; redacted: string[] } {
  const redacted: string[] = [];
  const result: Record<string, unknown> = { ...employee };

  const isSelf = viewer.selfEmployeeId === employee.id;

  if (!viewer.canSeeSalary && !isSelf) {
    delete result.baseSalary;
    delete result.bankAccount;
    redacted.push('baseSalary', 'bankAccount');
  } else if (!viewer.canSeeIdentity && !isSelf) {
    // FINANCE sees the salary and the account it is paid into, but the
    // account number is still identity material for anyone else.
    delete result.bankAccount;
    redacted.push('bankAccount');
  }

  if (!viewer.canSeeIdentity && !isSelf) {
    delete result.nifNumber;
    redacted.push('nifNumber');
  }

  return { ...(result as Partial<T>), id: employee.id, redacted };
}

/** Throws unless the viewer may open this document category. */
export function assertCanReadDocument(
  category: EmployeeDocumentCategory,
  employeeId: string,
  viewer: HrViewer,
): void {
  if (viewer.selfEmployeeId === employeeId) return;
  if (viewer.canSeeIdentity) return;
  if (IDENTITY_DOCUMENT_CATEGORIES.includes(category)) {
    throw new ForbiddenException(
      `Reading a ${category} document requires ${PERMISSIONS.hr.viewIdentity}`,
    );
  }
}

/** Throws unless the viewer may read salary-bearing figures for this employee. */
export function assertCanReadSalary(employeeId: string, viewer: HrViewer): void {
  if (viewer.selfEmployeeId === employeeId) return;
  if (viewer.canSeeSalary) return;
  throw new ForbiddenException(`Reading payroll figures requires ${PERMISSIONS.hr.viewSalary}`);
}
