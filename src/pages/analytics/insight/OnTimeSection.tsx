import { Activity, CheckCircle2 } from '@/design-system/icons';
import { DonutChart, MiniGauge } from '@/features/shipper-bi/charts';
import type { CategorySlice } from '@/features/shipper-bi/contracts';
import { TONE, Block } from './kit';
import { AreaTrend } from './charts';
import type { ShipperInsight } from './buildInsight';

/**
 * Question one — **is my cargo arriving when it was promised?** — as two cards
 * that sit side by side rather than one full-width band.
 *
 * The band version put a small ring at the left edge of a 1,500px card and a
 * chart with a 10:1 aspect ratio underneath it, which is most of why the page
 * read as empty. Split across a 7/5 grid, each graphic fills the space it is
 * given: the trend gets a plot with real height, the mix gets a ring large
 * enough to carry its own callouts.
 */

/** Teal for the outcomes that are the account working, orange for the one that
 *  is not. Depth separates on time from early — see `TONE`. */
const outcomeColor = (key: string) =>
  key === 'late' ? TONE.attention : key === 'early' ? TONE.goodSoft : TONE.good;

export function OnTimeTrendCard({
  insight,
  className,
}: {
  insight: ShipperInsight;
  className?: string;
}) {
  const { onTime, trend } = insight;
  const meets = onTime.rate >= onTime.target;
  const late = onTime.outcomes.find((slice) => slice.key === 'late');

  return (
    <Block
      className={className}
      title="Is my cargo arriving on time?"
      answer={
        onTime.delivered === 0
          ? 'Nothing has landed in this period yet.'
          : meets
            ? `Yes — ${Math.round(onTime.rate * 100)}% hit their promised date, above the ${Math.round(onTime.target * 100)}% target.`
            : `Not quite — ${Math.round(onTime.rate * 100)}% hit their promised date against a ${Math.round(onTime.target * 100)}% target, so ${late?.value ?? 0} arrived late.`
      }
      icon={<Activity />}
      tint={meets ? 'teal' : 'orange'}
      bodyClassName="gap-4"
    >
      <AreaTrend
        categories={trend.map((point) => point.label)}
        values={trend.map((point) =>
          point.onTimeRate === undefined ? null : Math.round(point.onTimeRate * 100),
        )}
        seriesName="On-time rate"
        formatValue={(value) => `${Math.round(value)}%`}
        target={onTime.target * 100}
        targetLabel={`${Math.round(onTime.target * 100)}% target`}
        color={meets ? 'var(--primary)' : 'var(--accent-bold)'}
        minHeight={268}
      />

      {late && late.value > 0 ? (
        <p className="border-t border-border-subtle pt-4 text-[13px] leading-relaxed text-muted-foreground">
          When a container is late it runs{' '}
          <span className="font-semibold text-accent-subtle-foreground">
            {onTime.medianLateDays.toFixed(1)} days
          </span>{' '}
          behind, typically.
          {onTime.worstMonth
            ? ` Weakest stretch was ${onTime.worstMonth.label}, at ${Math.round(onTime.worstMonth.rate * 100)}%.`
            : ''}
        </p>
      ) : null}
    </Block>
  );
}

export function OutcomeMixCard({
  insight,
  className,
}: {
  insight: ShipperInsight;
  className?: string;
}) {
  const { onTime } = insight;
  const visible = onTime.outcomes.filter((slice) => slice.value > 0);
  const slices: CategorySlice[] = visible.map((slice) => ({
    key: slice.key,
    label: slice.label,
    value: slice.value,
  }));

  return (
    <Block
      className={className}
      title="How did the deliveries land?"
      answer={`${onTime.delivered} container${onTime.delivered === 1 ? '' : 's'} completed in this period.`}
      icon={<CheckCircle2 />}
      bodyClassName="justify-between gap-5"
    >
      <DonutChart
        slices={slices}
        colors={visible.map((slice) => outcomeColor(slice.key))}
        centerValue={`${Math.round(onTime.rate * 100)}%`}
        centerLabel="on time"
        size={330}
        className="mx-auto"
      />

      {/* One row per outcome: the name and the count read as a sentence on the
          left, the ring carries the share on the right. Three gauges laid side
          by side put the name under the ring in 10px type and the column read
          as decoration. */}
      <ul className="flex flex-col gap-2">
        {onTime.outcomes.map((slice) => (
          <li
            key={slice.key}
            className="flex items-center justify-between gap-4 rounded-md bg-surface-sunken px-4 py-2.5"
          >
            <div className="min-w-0">
              <p className="text-[14px] font-semibold leading-tight text-foreground">
                {slice.label}
              </p>
              <p className="type-body-xs text-muted-foreground">
                {slice.value} container{slice.value === 1 ? '' : 's'}
              </p>
            </div>
            <MiniGauge
              value={slice.share}
              label={slice.label}
              color={outcomeColor(slice.key)}
              size={54}
              className="shrink-0"
            />
          </li>
        ))}
      </ul>
    </Block>
  );
}
