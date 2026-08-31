import { useMemo } from 'react';

import { Card, StatisticCard } from '@/design-system';
import { FilterMenu } from '@/components/common';
import { AlertTriangle, ArrowLeftRight, Package, PackageOpen, Timer } from '@/design-system/icons';
import {
  AVOIDED_TRIP_DETENTION_DAYS,
  buildEmptyReturnPerformance,
  transportersIn,
  useEmptyContainers,
} from '@/features/empty-returns';
import {
  detentionRatePerDay,
  PERFORMANCE_PERIOD_OPTIONS,
  formatDetention,
  normalizeContainerSize,
} from '@/data/emptyReturnData';
import { formatSpan, useEmptyReturnStore } from '@/stores/emptyReturn.store';
import { cn } from '@/utils';

import { CompanyName, EmptyTag, Mono, SectionLabel } from './components/marks';

/**
 * Dashboard — *how are we performing?*
 *
 * One question: **are we actually avoiding unnecessary empty movements?**
 * Nothing here is a queue and nothing here is clickable-to-act; daily work
 * lives in the Control Tower. Every figure is chosen to be *arguable* rather
 * than merely available — a pairing rate somebody can push on, an average empty
 * time somebody can shorten, and a failure breakdown that names what to fix.
 *
 * The reading order is the argument. The four hero figures say whether pairing
 * is working. The trend says whether it is getting better. The failure
 * breakdown — computed from the live pool, not assumed — says what is stopping
 * it. The secondary strip carries the honest counterweights, including the
 * containers with no deadline recorded at all, because a blind spot that is
 * never printed is a blind spot nobody fixes.
 *
 * One figure is an estimate and says so on its own face: detention avoided
 * cannot be measured, because nobody knows what a container *would* have cost
 * had it gone back separately. Its assumption is printed under it.
 */
export function EmptyReturnPerformancePage() {
  const { records, loads, now } = useEmptyContainers();
  const filters = useEmptyReturnStore((state) => state.performanceFilters);
  const setFilters = useEmptyReturnStore((state) => state.setPerformanceFilters);

  const model = useMemo(
    () => buildEmptyReturnPerformance({ records, loads, filters, now }),
    [records, loads, filters, now],
  );

  const lines = useMemo(
    () => [...new Set(records.map((record) => record.line))].filter(Boolean).sort(),
    [records],
  );
  const sizes = useMemo(
    () =>
      [...new Set(records.map((record) => normalizeContainerSize(record.size)))]
        .filter(Boolean)
        .sort(),
    [records],
  );
  const transporters = useMemo(() => transportersIn(records), [records]);

  const hero = [
    {
      label: 'Pairing rate',
      value: model.pairingRate === null ? '—' : `${model.pairingRate}%`,
      hint: 'Closed cycles that ended in a pairing',
      variant: 'teal' as const,
      icon: <ArrowLeftRight className="h-5 w-5" />,
    },
    {
      label: 'Average empty time',
      value: formatSpan(model.averageEmptyMs),
      hint: 'From empty available to a decision',
      variant: 'blue' as const,
      icon: <Timer className="h-5 w-5" />,
    },
    {
      label: 'Empty returns avoided',
      value: String(model.returnsAvoided),
      hint: 'One trip not driven per pairing',
      variant: 'peach' as const,
      icon: <PackageOpen className="h-5 w-5" />,
    },
    {
      label: 'Est. detention avoided',
      value: formatDetention(model.detentionAvoided),
      hint: `${AVOIDED_TRIP_DETENTION_DAYS} container-days × ${formatDetention(detentionRatePerDay())} per avoided trip`,
      variant: 'pink' as const,
      icon: <Package className="h-5 w-5" />,
    },
  ];

  const secondary = [
    { label: 'Containers managed', value: String(model.containersManaged), tone: '' },
    { label: 'Returned on their own', value: String(model.returnedDirectly), tone: '' },
    {
      label: 'On-time return rate',
      value: model.onTimeReturnRate === null ? '—' : `${model.onTimeReturnRate}%`,
      tone: '',
    },
    {
      label: 'Overdue right now',
      value: String(model.overdueNow),
      tone: model.overdueNow > 0 ? 'text-destructive' : '',
    },
    {
      label: 'Detention accruing',
      value: formatDetention(model.detentionExposure),
      tone: model.detentionExposure > 0 ? 'text-destructive' : '',
    },
    {
      label: 'No deadline recorded',
      value: String(model.noDeadline),
      tone: model.noDeadline > 0 ? 'text-warning-subtle-foreground' : '',
    },
  ];

  const peakTrend = Math.max(10, ...model.trend.map((point) => point.rate ?? 0));

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      {/* Filters */}
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <FilterMenu
          groups={[
            {
              key: 'period',
              label: 'Reporting period',
              value: filters.period,
              onChange: (value) =>
                setFilters({ period: value as typeof filters.period }),
              options: [...PERFORMANCE_PERIOD_OPTIONS],
            },
            {
              key: 'line',
              label: 'Shipping line',
              value: filters.line,
              onChange: (value) => setFilters({ line: value }),
              options: [
                { value: 'all', label: 'All shipping lines' },
                ...lines.map((line) => ({ value: line, label: line })),
              ],
            },
            {
              key: 'transporter',
              label: 'Transporter',
              value: filters.transporter,
              onChange: (value) => setFilters({ transporter: value }),
              options: [
                { value: 'all', label: 'All transporters' },
                ...transporters.map((name) => ({ value: name, label: name })),
              ],
            },
            {
              key: 'size',
              label: 'Container size',
              value: filters.size,
              onChange: (value) => setFilters({ size: value }),
              options: [
                { value: 'all', label: 'All sizes' },
                ...sizes.map((size) => ({ value: size, label: size })),
              ],
            },
          ]}
        />
        <span className="ml-auto text-xs text-muted-foreground">
          <Mono className="font-bold text-foreground">{model.scope.length}</Mono> container
          {model.scope.length === 1 ? '' : 's'} in scope
        </span>
      </div>

      {/* HERO — is pairing working? The app's own KPI tiles, so this page opens
          like every other measurement screen in Fleetin. */}
      <div className="grid min-w-0 grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {hero.map((figure) => (
          <StatisticCard
            key={figure.label}
            title={figure.label}
            value={figure.value}
            subtitle={figure.hint}
            variant={figure.variant}
            icon={figure.icon}
          />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* TREND */}
        <Card className="min-w-0 rounded-lg border border-border/80 p-4">
          <SectionLabel>Return avoidance — last {model.trend.length} weeks</SectionLabel>
          <p className="mt-1 text-2xs text-muted-foreground">
            Share of each week&rsquo;s decisions that ended in a pairing, dated by when the decision
            was made.
          </p>
          <div className="mt-4 flex h-32 items-end gap-3">
            {model.trend.map((point) => (
              <div key={point.label} className="flex flex-1 flex-col items-center gap-1">
                <span className="font-mono text-2xs font-bold text-primary">
                  {point.rate === null ? '—' : `${point.rate}%`}
                </span>
                <div className="flex w-full flex-1 items-end">
                  <div
                    className={cn(
                      'w-full rounded-t-sm bg-primary',
                      point.rate === null && 'bg-muted',
                    )}
                    style={{
                      height: `${point.rate === null ? 2 : Math.max(2, (point.rate / peakTrend) * 100)}%`,
                    }}
                    aria-hidden
                  />
                </div>
                <span className="text-[9px] text-muted-foreground">{point.label}</span>
                <span className="font-mono text-[9px] text-muted-foreground">
                  {point.pairings}/{point.decisions}
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* WHY PAIRINGS ARE NOT HAPPENING */}
        <Card className="min-w-0 rounded-lg border border-border/80 p-4">
          <SectionLabel>Why containers cannot be paired</SectionLabel>
          <p className="mt-1 text-2xs text-muted-foreground">
            Counted across every open shipment, for the{' '}
            <Mono className="font-bold text-foreground">{model.unmatchable.length}</Mono> container
            {model.unmatchable.length === 1 ? '' : 's'} nothing can currently serve.
          </p>

          {model.failureReasons.length === 0 ? (
            <p className="mt-4 text-xs text-muted-foreground">
              Every container awaiting a decision has at least one viable full load. Nothing is
              blocked.
            </p>
          ) : (
            <div className="mt-4 space-y-2.5">
              {model.failureReasons.map((reason) => (
                <div key={reason.label}>
                  <div className="flex justify-between gap-3 text-xs text-muted-foreground">
                    <span>{reason.label}</span>
                    <Mono className="font-bold text-foreground">{reason.pct}%</Mono>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${reason.pct}%` }}
                      aria-hidden
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="mt-3 text-2xs text-muted-foreground">
            The lever: whichever constraint tops this list is the one to attack — earlier full-load
            visibility, a wider spread of lines, or deadlines captured sooner.
          </p>
        </Card>
      </div>

      {/* SECONDARY */}
      <Card className="min-w-0 rounded-lg border border-border/80 p-4">
        <div className="flex flex-wrap gap-x-10 gap-y-3">
          {secondary.map((figure) => (
            <div key={figure.label}>
              <div className={cn('font-mono text-xl font-bold text-foreground', figure.tone)}>
                {figure.value}
              </div>
              <div className="text-2xs text-muted-foreground">{figure.label}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* WHAT IS BLOCKED — the page's one call to action */}
      {model.unmatchable.length > 0 && (
        <Card className="min-w-0 rounded-lg border border-border/80 p-4">
          <SectionLabel className="flex items-center gap-1.5">
            <AlertTriangle className="size-3.5 text-warning" aria-hidden />
            Containers with no viable full load · {model.unmatchable.length}
          </SectionLabel>
          <div className="mt-3 flex flex-wrap gap-2">
            {model.unmatchable.map((record) => (
              <div
                key={record.id}
                className="rounded-card-nested border border-border bg-surface-sunken px-3 py-2"
              >
                <div className="flex items-center gap-1.5">
                  <EmptyTag small />
                  <Mono className="text-xs font-bold text-foreground">
                    {record.container || record.bookingReference}
                  </Mono>
                </div>
                <div className="text-2xs text-muted-foreground">
                  {record.line} · {record.size}
                </div>
                <CompanyName name={record.transporter} className="text-2xs text-muted-foreground" />
              </div>
            ))}
          </div>
          <p className="mt-2 text-2xs text-muted-foreground">
            Each of these will need an empty return unless a compatible shipment appears before its
            deadline.
          </p>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-2xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Package className="size-3 text-primary" aria-hidden /> A pairing avoids one empty trip.
        </span>
        <span className="inline-flex items-center gap-1">
          <PackageOpen className="size-3 text-info" aria-hidden /> Empty time is the cost of a slow
          decision.
        </span>
        <span className="inline-flex items-center gap-1">
          <Timer className="size-3 text-destructive" aria-hidden /> Detention starts the moment the
          deadline passes.
        </span>
      </div>

      <p className="text-2xs text-muted-foreground">
        Daily operations live in the Control Tower. This page answers one question: are we avoiding
        unnecessary empty movements?
      </p>
    </div>
  );
}

export default EmptyReturnPerformancePage;
