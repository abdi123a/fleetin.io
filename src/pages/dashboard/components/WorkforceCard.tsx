import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { ROUTES } from '@/config/routes';
import { ApexChart } from '@/features/shipper-bi/charts/ApexChart';
import {
  ConsolePanel,
  InsightNote,
  PanelLink,
  SectionLabel,
  StatBox,
} from '@/pages/transporter-portal/components/dashboard/console/kit';

import { buildTooltipHtml, CHART_INK, rankedBarOptions } from './charts';
import type { WorkforceModel } from '../model';

/**
 * Who is on the books, and what HR is sitting on.
 *
 * Departments are horizontal bars because a department name is a word, and a
 * column chart would turn every one of them sideways. One hue across all bars,
 * not a categorical palette: this is one quantity measured in several places,
 * and giving each department its own colour would imply they are different
 * kinds of thing.
 */
export function WorkforceCard({
  workforce,
  className,
}: {
  workforce: WorkforceModel | null;
  className?: string;
}) {
  const departments = useMemo(() => workforce?.byDepartment.slice(0, 6) ?? [], [workforce]);

  const options = useMemo(
    () =>
      rankedBarOptions({
        categories: departments.map((entry) => entry.department || 'Unassigned'),
        colors: [CHART_INK.teal],
        tooltip: {
          shared: false,
          intersect: true,
          custom: ({ dataPointIndex }) => {
            const entry = departments[dataPointIndex];
            if (!entry) return '';
            return buildTooltipHtml(entry.department || 'Unassigned', [
              { key: 'c', label: 'People', value: String(entry.count), color: CHART_INK.teal },
            ]);
          },
        },
      }),
    [departments],
  );

  const series = useMemo(
    () => [{ name: 'People', data: departments.map((entry) => entry.count) }],
    [departments],
  );

  if (!workforce) {
    return (
      <ConsolePanel className={className} title="Workforce" subtitle="Headcount and what HR is waiting on">
        <p className="py-10 text-center text-sm font-semibold text-muted-foreground">
          The HR module returned no data for this account.
        </p>
      </ConsolePanel>
    );
  }

  const { leave, expiring } = workforce;
  const waiting = leave.pendingRequests + expiring.in30;

  return (
    <ConsolePanel
      className={className}
      title="Workforce"
      subtitle={`${workforce.headcount} on the books · ${workforce.active} active · ${workforce.onLeave} on leave`}
      action={
        <Link to={ROUTES.hrEmployees}>
          <PanelLink>Employees</PanelLink>
        </Link>
      }
      footer={
        <InsightNote tone={waiting > 0 ? 'attention' : 'neutral'}>
          {waiting > 0 ? (
            <>
              <span className="font-bold text-foreground">
                {leave.pendingRequests} leave {leave.pendingRequests === 1 ? 'request' : 'requests'} and{' '}
                {expiring.in30} expiring {expiring.in30 === 1 ? 'document' : 'documents'}
              </span>{' '}
              are waiting on HR. Neither stops a truck today, but both do within the month.
            </>
          ) : (
            <>
              <span className="font-bold text-foreground">HR has nothing outstanding.</span> No leave request is
              undecided and no employee document expires inside 30 days.
            </>
          )}
        </InsightNote>
      }
    >
      {departments.length === 0 ? (
        <p className="py-8 text-center text-sm font-semibold text-muted-foreground">
          No employee carries a department yet.
        </p>
      ) : (
        <div className="min-h-0 flex-1">
          <ApexChart type="bar" series={series} options={options} height={Math.max(150, departments.length * 34)} />
        </div>
      )}

      <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
        <StatBox
          label="Leave undecided"
          value={String(leave.pendingRequests)}
          note={`${leave.plannedDays} days already planned`}
          tone={leave.pendingRequests > 0 ? 'attention' : 'neutral'}
        />
        <StatBox
          label="Documents expiring"
          value={String(expiring.in30)}
          note={`${expiring.in60} within 60 · ${expiring.in90} within 90`}
          tone={expiring.in30 > 0 ? 'attention' : 'neutral'}
        />
      </div>

      {expiring.items.length > 0 ? (
        <div className="mt-3.5 border-t border-border-subtle pt-3">
          <SectionLabel>Soonest to expire</SectionLabel>
          <div className="mt-2 flex flex-col gap-1.5">
            {expiring.items.slice(0, 3).map((item) => (
              <div key={item.id} className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="min-w-0 flex-1 truncate text-xs font-bold text-foreground">
                  {item.employeeName}
                  <span className="ml-1.5 font-medium text-muted-foreground">{item.label}</span>
                </span>
                <span
                  className={
                    item.daysUntil < 0
                      ? 'shrink-0 text-[11px] font-bold tabular-nums text-destructive-subtle-foreground'
                      : 'shrink-0 text-[11px] font-bold tabular-nums text-muted-foreground'
                  }
                >
                  {item.daysUntil < 0 ? `${Math.abs(item.daysUntil)} days late` : `${item.daysUntil} days`}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </ConsolePanel>
  );
}
