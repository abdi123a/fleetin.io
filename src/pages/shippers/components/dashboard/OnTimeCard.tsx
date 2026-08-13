import { Gauge } from '@/design-system/icons';
import { Card, IconChip } from '@/design-system';
import { RateGauge } from '@/features/shipper-bi/charts';
import { deltaIntent, formatDelta } from '@/features/shipper-bi/format';
import type { CategorySlice, KpiMetric } from '@/features/shipper-bi/contracts';
import { cn } from '@/utils';

/**
 * On-time delivery as an arc, with the contractual floor marked on it.
 *
 * The percentage alone cannot separate "ten minutes late" from "two days", so
 * the three outcome counts sit under the arc. Early is reported rather than
 * folded into on-time on purpose: a truck a day early is a truck waiting at a
 * gate that has not opened, and that waiting is what shows up on the invoice.
 */

export interface OnTimeCardProps {
  metric: KpiMetric;
  outcomes: CategorySlice[];
  /** 0–1. The service level the arc is drawn against. */
  target?: number;
}

export function OnTimeCard({ metric, outcomes, target = 0.9 }: OnTimeCardProps) {
  const delta = formatDelta(metric.deltaPct);
  const tone = deltaIntent(metric.deltaPct, metric.polarity);
  const delivered = outcomes.reduce((total, slice) => total + slice.value, 0);

  return (
    <Card variant="default" padding="lg" className="gap-4">
      <div className="flex items-center gap-3">
        <IconChip icon={Gauge} size={36} />
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold leading-tight text-foreground">
            On-Time Delivery
          </h2>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            Against your promised dates
          </p>
        </div>
      </div>

      <div className="flex flex-col items-center gap-2">
        <RateGauge
          value={metric.value}
          target={target}
          label="On-time delivery rate"
          size={186}
        />

        {delta ? (
          <p className="text-xs">
            <span
              className={cn(
                'font-semibold',
                tone === 'good' && 'text-success',
                tone === 'bad' && 'text-destructive',
                tone === 'neutral' && 'text-muted-foreground',
              )}
            >
              {delta}
            </span>{' '}
            <span className="text-muted-foreground">vs previous period</span>
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-3 gap-2 border-t border-border-subtle pt-3">
        {outcomes.map((slice) => (
          <div key={slice.key} className="text-center">
            <p
              className={cn(
                'text-lg font-semibold leading-none tabular-nums',
                slice.intent === 'good' && 'text-success',
                slice.intent === 'warning' && 'text-warning-subtle-foreground',
                slice.intent === 'critical' && 'text-destructive',
                !slice.intent && 'text-foreground',
              )}
            >
              {slice.value}
            </p>
            <p className="mt-1 text-[11px] leading-tight text-muted-foreground">{slice.label}</p>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground">
        {delivered} deliveries completed in this period.
      </p>
    </Card>
  );
}
