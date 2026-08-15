import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { ROUTES } from '@/config/routes';
import { ApexChart } from '@/features/shipper-bi/charts/ApexChart';
import { compactDjf, fmtDjf, pct } from '@/lib/finance';
import {
  ConsolePanel,
  InsightNote,
  Legend,
  PanelLink,
  StatusChip,
  type ChipTone,
} from '@/pages/transporter-portal/components/dashboard/console/kit';

import { buildTooltipHtml, CHART_INK, donutOptions } from './charts';
import type { WorkforceModel } from '../model';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const PERIOD_TONE: Record<string, ChipTone> = {
  DRAFT: 'quiet',
  CALCULATED: 'attention',
  APPROVED: 'info',
  PAID: 'calm',
};

/**
 * What the open payroll run costs, and where the money goes.
 *
 * The centre of the donut carries employer cost — gross plus the employer's
 * CNSS share — rather than net, because net is what the employee receives and
 * this figure is what actually leaves Fleetin's account. The slices then say
 * where that total splits, so the difference between the two is arithmetic on
 * screen rather than a claim in a footnote.
 */
export function PayrollCard({
  workforce,
  className,
}: {
  workforce: WorkforceModel | null;
  className?: string;
}) {
  const payroll = workforce?.payroll;
  const period = workforce?.period ?? null;
  const calculated = Boolean(period) && (payroll?.lines ?? 0) > 0;

  const slices = useMemo(() => {
    if (!payroll || !calculated) return [];
    return [
      { label: 'Net to staff', value: payroll.totalNet, color: CHART_INK.teal },
      { label: 'CNSS withheld', value: payroll.totalCnss, color: CHART_INK.tealLight },
      { label: 'ITS withheld', value: payroll.totalIts, color: CHART_INK.grey },
      { label: 'Employer CNSS', value: payroll.employerContribution, color: CHART_INK.orange },
    ].filter((slice) => slice.value > 0);
  }, [payroll, calculated]);

  const total = workforce?.employerCostDjf ?? 0;

  const options = useMemo(
    () =>
      donutOptions({
        labels: slices.map((slice) => slice.label),
        colors: slices.map((slice) => slice.color),
        centreLabel: 'employer cost',
        centreValue: compactDjf(total),
        tooltip: {
          custom: ({ seriesIndex }) => {
            const slice = slices[seriesIndex];
            if (!slice) return '';
            return buildTooltipHtml(
              slice.label,
              [{ key: 'v', label: 'Amount', value: fmtDjf(slice.value), color: slice.color }],
              total > 0 ? `${pct(slice.value / total, 1)} of employer cost` : undefined,
            );
          },
        },
      }),
    [slices, total],
  );

  const series = useMemo(() => slices.map((slice) => Math.round(slice.value)), [slices]);

  return (
    <ConsolePanel
      className={className}
      title="Payroll"
      subtitle={
        period
          ? `${MONTHS[period.month - 1]} ${period.year} · ${payroll?.lines ?? 0} lines`
          : 'No payroll period is open'
      }
      action={
        <div className="flex items-center gap-2">
          {period ? (
            <StatusChip tone={PERIOD_TONE[period.status] ?? 'quiet'}>{period.status.toLowerCase()}</StatusChip>
          ) : null}
          <Link to={ROUTES.hrPayroll}>
            <PanelLink>Payroll</PanelLink>
          </Link>
        </div>
      }
      footer={
        <InsightNote tone={period && period.status !== 'PAID' && calculated ? 'attention' : 'neutral'}>
          {!calculated ? (
            period ? (
              'The period is open but has not been calculated yet, so no figure here has a line behind it.'
            ) : (
              'No payroll period has been opened. Open one from the payroll screen to see this month’s cost.'
            )
          ) : period && period.status !== 'PAID' ? (
            <>
              <span className="font-bold text-foreground">
                {compactDjf(total)} is calculated but not yet paid
              </span>{' '}
              — the run is still {period.status.toLowerCase()}, so nothing has left the account.
            </>
          ) : (
            <>
              <span className="font-bold text-foreground">{compactDjf(total)} paid out for this period</span> —{' '}
              {fmtDjf(payroll?.totalNet ?? 0)} reached staff, the rest went to CNSS and ITS.
            </>
          )}
        </InsightNote>
      }
    >
      {!calculated || slices.length === 0 ? (
        <p className="py-10 text-center text-sm font-semibold text-muted-foreground">
          Nothing calculated for this period yet.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="h-[188px] w-[188px] shrink-0">
            <ApexChart type="donut" series={series} options={options} height={188} />
          </div>
          <div className="min-w-[10rem] flex-1">
            <Legend
              items={slices.map((slice) => ({ label: slice.label, color: slice.color }))}
              className="flex-col !items-start gap-y-2"
            />
            <div className="mt-4 flex flex-col gap-1.5 border-t border-border-subtle pt-3">
              <Line label="Gross" value={fmtDjf(payroll?.totalGross ?? 0)} />
              <Line label="Overtime paid" value={fmtDjf(payroll?.totalOvertime ?? 0)} />
              <Line label="Absence deducted" value={fmtDjf(payroll?.totalAbsence ?? 0)} />
            </div>
          </div>
        </div>
      )}
    </ConsolePanel>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
      <span className="type-body-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-bold tabular-nums text-foreground">{value}</span>
    </div>
  );
}
