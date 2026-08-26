import { Link } from 'react-router-dom';

import { ROUTES, buildPath } from '@/config/routes';
import { CalendarDays } from '@/design-system/icons';
import { useCloseProject, useProject, useProjects } from '@/features/finance';

import { contractDaysRemaining, isContractEndingThisMonth } from '../projectFinance';
import { ActionButton, IconChip, ListRow, Panel, Pill } from './kit';

/**
 * Contracts whose end date has reached this month, and nothing has closed
 * them out yet. Scope to a shipper for the client page, or to a single
 * project for the project page; the two are mutually exclusive.
 */
export function ContractRemindersPanel({ shipperId, projectId }: { shipperId?: string; projectId?: string }) {
  const nowMs = Date.now();
  const closeProject = useCloseProject();

  const projectsQuery = useProjects({ shipperId, status: 'active' }, { enabled: !projectId });
  const singleProjectQuery = useProject(projectId);

  const candidates = projectId
    ? singleProjectQuery.data
      ? [singleProjectQuery.data]
      : []
    : (projectsQuery.data ?? []);

  const due = candidates.filter((project) => isContractEndingThisMonth(project, nowMs));

  if (due.length === 0) return null;

  return (
    <Panel
      title="Contracts ending"
      subtitle="Close once the last billable work is invoiced"
      padded={false}
      dense
      action={<Pill tone="amber">{due.length}</Pill>}
    >
      <div className="flex flex-col gap-1 px-3 pb-3">
        {due.map((project) => {
          const daysLeft = contractDaysRemaining(project, nowMs);
          const overdue = daysLeft !== null && daysLeft < 0;
          return (
            <ListRow
              key={project.id}
              tone={overdue ? 'critical' : 'attention'}
              leading={<IconChip icon={CalendarDays} tint={overdue ? 'red' : 'amber'} size={36} />}
              name={project.name}
              sub={
                <Link to={buildPath(ROUTES.financeShipmentProject, { projectId: project.id })} className="font-mono hover:underline">
                  {project.reference}
                </Link>
              }
              right={overdue ? `${Math.abs(Math.round(daysLeft ?? 0))}d overdue to close` : `${Math.max(0, Math.round(daysLeft ?? 0))}d left`}
              action={
                <ActionButton variant="primary" onClick={() => closeProject.mutate(project.id)} disabled={closeProject.isPending}>
                  Close contract
                </ActionButton>
              }
            />
          );
        })}
      </div>
    </Panel>
  );
}
