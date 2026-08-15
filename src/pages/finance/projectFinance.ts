import type { ProjectRecord } from '@/features/finance';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Days until the contract expires; negative once overdue to close. Null for open-ended work. */
export function contractDaysRemaining(project: ProjectRecord, nowMs: number): number | null {
  if (!project.contractEndAt) return null;
  return (new Date(project.contractEndAt).getTime() - nowMs) / DAY_MS;
}

/** Days since the project opened. */
export function projectDaysRunning(project: ProjectRecord, nowMs: number): number {
  return Math.max(0, (nowMs - new Date(project.startedAt).getTime()) / DAY_MS);
}

/** True once a contract's end date falls in the current calendar month, or has already passed, and the project is still open. */
export function isContractEndingThisMonth(project: ProjectRecord, nowMs: number): boolean {
  if (project.status !== 'active' || !project.contractEndAt) return false;
  const now = new Date(nowMs);
  const end = new Date(project.contractEndAt);
  const sameMonth = end.getUTCFullYear() === now.getUTCFullYear() && end.getUTCMonth() === now.getUTCMonth();
  return sameMonth || end.getTime() <= nowMs;
}
