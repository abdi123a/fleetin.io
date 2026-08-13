import { Truck } from '@/design-system/icons';
import { Card, CompanyAvatar, IconChip } from '@/design-system';
import { formatMetric } from '@/features/shipper-bi/format';
import type { SpotlightTransporter } from '@/features/shipper-bi/contracts';
import { getTransporterLogoUrl } from '@/features/shipper-bi/mocks/transporterProfiles';
import { cn, formatNumber } from '@/utils';

/**
 * The carriers moving this shipper's freight, ranked by whether they deliver
 * when they said they would.
 *
 * Ranked on reliability rather than volume: volume says who you use, reliability
 * says who you should. Deliveries stay on the row because a 100% rate over two
 * loads is not a track record, and the reader needs both numbers to see that.
 *
 * A shortlist, not a league table — the full scorecard with cost-per-shipment
 * and delay attribution lives in Analytics.
 */

export interface TransporterPerformanceCardProps {
  transporters: SpotlightTransporter[];
  /** Contractual floor, 0–1. Rows under it are marked. */
  target?: number;
}

export function TransporterPerformanceCard({
  transporters,
  target = 0.9,
}: TransporterPerformanceCardProps) {
  const ranked = [...transporters]
    .filter((transporter) => transporter.deliveries > 0)
    .sort((a, b) => b.onTimeRate - a.onTimeRate);

  return (
    <Card variant="default" padding="lg" className="h-full gap-4">
      <div className="flex items-center gap-3">
        <IconChip icon={Truck} size={36} />
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold leading-tight text-foreground">
            Carrier Reliability
          </h2>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            On-time rate against your {Math.round(target * 100)}% target
          </p>
        </div>
      </div>

      {ranked.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No carrier has completed a delivery in this period.
        </p>
      ) : (
        <ol className="flex flex-col gap-3.5">
          {ranked.map((transporter) => {
            const meetsTarget = transporter.onTimeRate >= target;
            const logoUrl =
              transporter.logoUrl ?? getTransporterLogoUrl(transporter.transporterId);

            return (
              <li key={transporter.transporterId} className="flex items-center gap-3">
                <CompanyAvatar
                  src={logoUrl}
                  name={transporter.name}
                  fallback={transporter.fleetCode.slice(0, 2).toUpperCase()}
                  size="sm"
                  shape="circle"
                  className="shrink-0"
                />

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-[13px] font-medium text-foreground">
                      {transporter.name}
                    </span>
                    <span
                      className={cn(
                        'shrink-0 text-[13px] font-semibold tabular-nums',
                        meetsTarget ? 'text-success' : 'text-warning-subtle-foreground',
                      )}
                    >
                      {formatMetric(transporter.onTimeRate, 'percent')}
                    </span>
                  </div>

                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        'h-full rounded-full',
                        meetsTarget ? 'bg-primary' : 'bg-warning',
                      )}
                      style={{ width: `${Math.max(3, transporter.onTimeRate * 100)}%` }}
                    />
                  </div>

                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {transporter.deliveries} deliveries ·{' '}
                    {formatNumber(Math.round(transporter.distanceKm), {
                      maximumFractionDigits: 0,
                    })}{' '}
                    km
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
