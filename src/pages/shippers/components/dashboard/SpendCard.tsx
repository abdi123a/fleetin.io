import { Wallet } from '@/design-system/icons';
import { Card, IconChip } from '@/design-system';
import { deltaIntent, formatCompact, formatDelta, formatMetric } from '@/features/shipper-bi/format';
import type { CategorySlice, KpiMetric } from '@/features/shipper-bi/contracts';
import { cn } from '@/utils';

/**
 * What the period cost, and which cargo carries that cost.
 *
 * A total on its own is not a decision — it is only actionable next to its shape
 * over time and next to the per-category average that says where it comes from.
 * Both fit here because both are small: a bare column strip with no axes, and
 * three rows with a proportional bar.
 */

/** How many cargo types earn a row before the rest are summarised away. */
const CARGO_ROWS = 3;

export interface SpendCardProps {
  total: KpiMetric;
  perShipment: KpiMetric;
  /** Spend per time bucket, oldest first. */
  spendByBucket: CategorySlice[];
  /** Average cost per cargo type, highest first. */
  costByCargoType: CategorySlice[];
}

export function SpendCard({
  total,
  perShipment,
  spendByBucket,
  costByCargoType,
}: SpendCardProps) {
  const delta = formatDelta(total.deltaPct);
  const tone = deltaIntent(total.deltaPct, total.polarity);

  const buckets = spendByBucket.slice(-16);
  const peak = Math.max(...buckets.map((bucket) => bucket.value), 1);

  const cargo = costByCargoType.slice(0, CARGO_ROWS);
  const cargoPeak = Math.max(...cargo.map((slice) => slice.value), 1);

  return (
    <Card variant="default" padding="lg" className="gap-4">
      <div className="flex items-center gap-3">
        <IconChip icon={Wallet} size={36} />
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold leading-tight text-foreground">
            Logistics Spend
          </h2>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            Freight and accessorial charges
          </p>
        </div>
      </div>

      {/* Side by side once there is room: the total and its shape are one
          reading, the per-category averages another. Stacked they read as a
          single long list where the second half looks like a footnote. */}
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-[1.6rem] font-semibold leading-none tracking-tight text-foreground">
                {formatMetric(total.value, total.unit)}
              </span>
              {delta ? (
                <span
                  className={cn(
                    'text-[13px] font-semibold',
                    tone === 'good' && 'text-success',
                    tone === 'bad' && 'text-destructive',
                    tone === 'neutral' && 'text-muted-foreground',
                  )}
                >
                  {delta}
                </span>
              ) : null}
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {formatMetric(perShipment.value, perShipment.unit)} average per shipment
            </p>
          </div>

          {/* A bare column strip: shape only, no axes — the figures are above it. */}
          {buckets.length > 1 ? (
            <div className="flex h-12 items-end gap-[3px]" aria-hidden>
              {buckets.map((bucket, index) => (
                <span
                  key={bucket.key}
                  title={`${bucket.label}: ${formatCompact(bucket.value)}`}
                  className="flex-1 rounded-t-[3px] bg-primary"
                  style={{
                    height: `${Math.max(4, (bucket.value / peak) * 48)}px`,
                    opacity: 0.35 + (index / buckets.length) * 0.65,
                  }}
                />
              ))}
            </div>
          ) : null}
        </div>

        {cargo.length > 0 ? (
          <div className="space-y-2.5 border-t border-border-subtle pt-4 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Average cost per cargo type
            </p>
            {cargo.map((slice) => (
              <div key={slice.key} className="space-y-1">
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate text-foreground">{slice.label}</span>
                  <span className="shrink-0 font-semibold tabular-nums text-foreground">
                    {formatCompact(slice.value)}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.max(4, (slice.value / cargoPeak) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
