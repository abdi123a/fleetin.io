import { Link } from 'react-router-dom';

import { ROUTES } from '@/config/routes';
import { CalendarDays } from '@/design-system/icons';
import { contractDaysRemaining, isContractEndingThisMonth } from '@/lib/finance';
import { useFinanceStore } from '@/stores/finance.store';

import { useFinanceModel } from '../model';
import { ActionButton, IconChip, ListRow, Panel, Pill } from './kit';

/**
 * Contracts whose end date has reached this month, and nothing has closed
 * them out yet.
 *
 * There is no notification backend behind this app, so "reminder" here means
 * what it can actually mean: the contract stays visible on these screens,
 * with one action, until someone acts on it. Scope to a client or a single
 * project to place the same list on the pages where that context matters;
 * leave both undefined for the module-wide view on the overview page.
 */
export function ContractRemindersPanel({
  clientId,
  projectId,
}: {
  clientId?: string;
  projectId?: string;
}) {
  const model = useFinanceModel();
  const closeProjectContract = useFinanceStore((state) => state.closeProjectContract);

  const due = model.projectRows.filter((row) => {
    if (projectId && row.project.id !== projectId) return false;
    if (clientId && row.project.clientId !== clientId) return false;
    return isContractEndingThisMonth(row.project, model.nowMs);
  });

  if (due.length === 0) return null;

  return (
    <Panel
      title="Contracts ending"
      subtitle="Close each out once its last billable work is invoiced"
      padded={false}
      action={<Pill tone="amber">{due.length}</Pill>}
    >
      <div className="flex flex-col gap-1 px-3 pb-3">
        {due.map((row) => {
          const daysLeft = contractDaysRemaining(row.project, model.nowMs);
          const overdue = daysLeft !== null && daysLeft < 0;
          return (
            <ListRow
              key={row.project.id}
              tone={overdue ? 'critical' : 'attention'}
              leading={<IconChip icon={CalendarDays} tint={overdue ? 'red' : 'amber'} size={36} />}
              name={row.project.name}
              sub={
                <>
                  <Link
                    to={`${ROUTES.financeShipments}/project/${row.project.id}`}
                    className="font-mono hover:underline"
                  >
                    {row.project.reference}
                  </Link>{' '}
                  · {row.client?.name ?? row.project.clientId}
                </>
              }
              right={
                overdue
                  ? `${Math.abs(Math.round(daysLeft ?? 0))}d overdue to close`
                  : `${Math.max(0, Math.round(daysLeft ?? 0))}d left`
              }
              action={
                <ActionButton
                  variant="primary"
                  onClick={() => closeProjectContract(row.project.id)}
                >
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
