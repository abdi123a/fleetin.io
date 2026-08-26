import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ChevronLeft, ChevronRight, Download, Printer, TrendingUp } from '@/design-system/icons';
import { Button, Card, CompanyAvatar, Skeleton } from '@/design-system';
import { detentionRateCurrency } from '@/lib/bi/config';
import { cn, formatDate } from '@/utils';
import { toDateOnly } from '@/utils/format';
import { MonthlyReportView } from './MonthlyReportView';
import { formatDuration } from './reportFormat';
import {
  ReportAlertPill,
  ReportFootnote,
  ReportLetterhead,
  ReportSheet,
  ReportStatusBadge,
  useReportPrint,
} from './reportKit';
import { useShipperMonthlyReport } from './useShipperReporting';

/**
 * The monthly performance report, as a self-contained panel.
 *
 * The same document the reporting page's Monthly tab shows — mounted where a
 * month's summary belongs next to something else: the shipper's own dashboard,
 * and the operations-side shipper profile. It carries its own month navigator,
 * CSV export and PDF button so it is complete wherever it is placed.
 */

export interface MonthlyReportPanelProps {
  shipperId: string;
  shipperName: string;
  shipperLogoUrl?: string;
  now?: Date;
}

/** Every lane in the book today — stated once here rather than per report, since it is a property of the platform, not of any one shipper's data. */
const CORRIDOR_LABEL = 'Djibouti–Ethiopia corridor';

const firstOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
const addMonths = (date: Date, delta: number) =>
  new Date(date.getFullYear(), date.getMonth() + delta, 1);

const statusFor = (onTimePct: number) =>
  onTimePct >= 90 ? 'ontime' : onTimePct >= 75 ? 'attention' : 'delayed';

export function MonthlyReportPanel({
  shipperId,
  shipperName,
  shipperLogoUrl,
  now,
}: MonthlyReportPanelProps) {
  const asOf = useMemo(() => now ?? new Date(), [now]);
  const [month, setMonth] = useState(() => firstOfMonth(asOf));
  const print = useReportPrint();
  const currency = detentionRateCurrency();

  const { report, isLoading, loaded, total } = useShipperMonthlyReport({
    shipperId,
    month,
    asOf,
    shipperName,
  });
  const isCurrentMonth = month.getTime() >= firstOfMonth(asOf).getTime();
  const { missions } = report;

  /* The one headline worth a pill in the page header: dépotage is both this
   * month's bottleneck stage and trending up week over week. Scoped to
   * dépotage specifically because that is the one stage the weekly rollup
   * tracks on its own — a different bottleneck stage has no weekly series to
   * confirm a rising trend against, so the pill simply does not appear. */
  const depotageRisingLabel = useMemo(() => {
    const bottleneck = report.stages.find((stage) => stage.isLongest);
    if (!bottleneck || bottleneck.key !== 'depotage') return null;
    const dataWeeks = report.weeklyRollup.filter((week) => week.avgDepotageMs !== null);
    const first = dataWeeks[0];
    const last = dataWeeks[dataWeeks.length - 1];
    if (!first || !last || first === last || first.avgDepotageMs === null || last.avgDepotageMs === null) {
      return null;
    }
    if (last.avgDepotageMs <= first.avgDepotageMs) return null;
    return `Dépotage rising · ${formatDuration(last.avgDepotageMs, { compact: true })} average`;
  }, [report.stages, report.weeklyRollup]);

  const handleExportCsv = () => {
    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const completed = report.reports.filter((r) => r.isClosed && !r.overview.isTerminated);
    const csvContent = [
      'Mission,Customer,Transporter,Driver,Origin,Destination,Date,Container,Cargo,Mission duration,Dépotage,Status',
      ...completed.map((r) =>
        [
          r.overview.missionId,
          r.overview.customerCompany,
          r.overview.transporter,
          r.overview.driver,
          r.overview.pickup,
          r.overview.dropoff,
          toDateOnly(r.overview.missionStartAt) ?? '',
          r.overview.containerType,
          r.overview.cargo,
          formatDuration(r.kpis.totalMs, { compact: true }),
          formatDuration(r.kpis.depotageMs, { compact: true }),
          r.status,
        ]
          .map((value) => escape(String(value)))
          .join(','),
      ),
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `monthly-report-${shipperId}-${format(month, 'yyyy-MM')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-3">
      {/* ── Panel header: title, identity, month, exports ── */}
      <Card className="report-screen-only rounded-lg border border-border/80 bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                Monthly Report
              </h1>
              {missions.completed > 0 && (
                <ReportStatusBadge status={statusFor(missions.onTimePct)} size="md" />
              )}
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted-foreground">
              <CompanyAvatar src={shipperLogoUrl} name={shipperName} size="xs" />
              <span className="font-semibold text-foreground">{shipperName}</span>
              <span>
                · {format(month, 'MMMM yyyy')} · {CORRIDOR_LABEL} · every figure computed from recorded
                timestamps.
              </span>
            </p>
            {depotageRisingLabel && (
              <ReportAlertPill icon={TrendingUp} className="mt-2.5">
                {depotageRisingLabel}
              </ReportAlertPill>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-border bg-secondary/40 p-1">
              <button
                type="button"
                onClick={() => setMonth((current) => addMonths(current, -1))}
                className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                aria-label="Previous month"
              >
                <ChevronLeft className="size-3.5" />
              </button>
              <span className="min-w-24 text-center font-mono text-xs font-semibold tabular-nums text-foreground">
                {format(month, 'MMM yyyy')}
              </span>
              <button
                type="button"
                disabled={isCurrentMonth}
                onClick={() => setMonth((current) => addMonths(current, 1))}
                className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
                aria-label="Next month"
              >
                <ChevronRight className="size-3.5" />
              </button>
            </div>
            <Button
              variant="outline"
              size="sm"
              shape="pill"
              leadingIcon={<Download />}
              onClick={handleExportCsv}
              disabled={total === 0}
            >
              Export CSV
            </Button>
            <Button variant="primary" size="sm" shape="pill" leadingIcon={<Printer />} onClick={print}>
              Download PDF
            </Button>
          </div>
        </div>

        {isLoading && total > 0 && (
          <p className="mt-3 font-mono text-[11px] tabular-nums text-muted-foreground">
            Reading mission timelines… {loaded} / {total}
          </p>
        )}
      </Card>

      {isLoading && loaded === 0 ? (
        <div className="space-y-3">
          <Skeleton className="h-40 w-full rounded-lg" />
          <Skeleton className="h-56 w-full rounded-lg" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
      ) : (
        <>
          <ReportSheet
            letterhead={
              <ReportLetterhead
                shipperName={shipperName}
                title="Monthly Performance Report"
                period={format(month, 'MMMM yyyy')}
                generatedAt={formatDate(asOf, 'dateTime')}
              />
            }
            footnote={<ReportFootnote />}
          >
            {total === 0 ? (
              <Card
                className={cn(
                  'report-block rounded-lg border border-border/80 bg-card p-8 text-center',
                )}
              >
                <p className="text-sm font-semibold text-foreground">
                  No mission started in {format(month, 'MMMM yyyy')}
                </p>
                <p className="mt-1 text-[12.5px] text-muted-foreground">
                  A month with no work reports nothing — use the arrows above to read another month.
                </p>
              </Card>
            ) : (
              <MonthlyReportView report={report} currency={currency} />
            )}
          </ReportSheet>

          {total > 0 && (
            <p className="report-screen-only text-center text-[11px] text-muted-foreground">
              Prepared by Fleetin Operations · {shipperName} · issued {formatDate(asOf, 'dateShort')}
            </p>
          )}
        </>
      )}
    </div>
  );
}
