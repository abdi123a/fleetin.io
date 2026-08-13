import { useMemo } from 'react';
import { Card, CompanyAvatar } from '@/design-system';
import type { ShipperShipmentRow } from '@/features/shipper-bi';
import { getTransporterLogoUrl } from '@/features/shipper-bi/mocks/transporterProfiles';
import { cn } from '@/utils';
import { PanelHeader, PanelLink, PANEL_SURFACE } from './PanelHeader';
import { classifyStatus, ON_TIME_TARGET } from './statusTone';

/**
 * Who actually delivers.
 *
 * The dashboard reported one on-time rate for the whole account, which is an
 * average over carriers that do not perform alike — and an average is the one
 * number you cannot act on, because it names nobody. This ranks the carriers
 * that moved enough volume in the window to be judged, so the next tender
 * conversation has a figure behind it.
 *
 * Carriers under `MIN_SAMPLE` loads are held back rather than shown at 0% or
 * 100%: a single late delivery out of two is noise, and putting it at the top
 * of a league table is how a dashboard loses its reader.
 */

/** Loads a carrier must have moved in the window before it is ranked. */
const MIN_SAMPLE = 3;

export interface TransporterReliabilityCardProps {
  rows: ShipperShipmentRow[];
  onViewAll: () => void;
}

export function TransporterReliabilityCard({
  rows,
  onViewAll,
}: TransporterReliabilityCardProps) {
  const { ranked, withheld } = useMemo(() => {
    const byCarrier = new Map<string, { loads: number; onTime: number; late: number }>();

    for (const row of rows) {
      const entry = byCarrier.get(row.transporter) ?? { loads: 0, onTime: 0, late: 0 };
      entry.loads += 1;
      const status = classifyStatus(row);
      if (status === 'delayed') entry.late += 1;
      else entry.onTime += 1;
      byCarrier.set(row.transporter, entry);
    }

    const all = [...byCarrier.entries()].map(([name, entry]) => ({
      name,
      ...entry,
      rate: entry.onTime / entry.loads,
    }));

    return {
      ranked: all
        .filter((carrier) => carrier.loads >= MIN_SAMPLE)
        .sort((a, b) => b.rate - a.rate || b.loads - a.loads)
        .slice(0, 5),
      withheld: all.filter((carrier) => carrier.loads < MIN_SAMPLE).length,
    };
  }, [rows]);

  return (
    <Card variant="default" padding="lg" className={cn('h-full gap-5', PANEL_SURFACE)}>
      <PanelHeader
        title="Carrier Reliability"
        action={<PanelLink onClick={onViewAll}>Compare</PanelLink>}
      />

      {ranked.length === 0 ? (
        <p className="type-body-sm text-muted-foreground">
          No carrier moved {MIN_SAMPLE} or more loads in this window.
        </p>
      ) : (
        <ul className="flex flex-1 flex-col justify-between gap-3.5">
          {ranked.map((carrier) => {
            // Two bands, not three. A carrier either keeps the 90% promise or
            // it does not; the middle band existed only to soften the reading,
            // and an amber 82% is still a carrier to raise in the next tender.
            const keepsPromise = carrier.rate >= ON_TIME_TARGET;

            return (
              <li key={carrier.name} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <CompanyAvatar
                      src={getTransporterLogoUrl(carrier.name)}
                      name={carrier.name}
                      fallback={carrier.name.substring(0, 2).toUpperCase()}
                      size="xs"
                      shape="circle"
                      className="shrink-0"
                    />
                    <span className="type-body-sm min-w-0 truncate font-medium text-foreground">
                      {carrier.name}
                    </span>
                  </div>
                  <span className="shrink-0 tabular-nums">
                    <span
                      className={cn(
                        'type-body-sm',
                        keepsPromise
                          ? 'text-primary-subtle-foreground'
                          : 'text-accent-subtle-foreground',
                      )}
                    >
                      {(carrier.rate * 100).toFixed(0)}%
                    </span>
                    <span className="type-body-xs ml-1.5 text-muted-foreground">
                      {carrier.loads} loads
                    </span>
                  </span>
                </div>

                {/* The target sits on the track, so a bar's length can be read
                    against the promise rather than against the panel width. */}
                <div className="relative h-2 overflow-hidden rounded-full bg-surface-sunken">
                  <div
                    className={cn(
                      'h-full rounded-full transition-[width] duration-500',
                      keepsPromise ? 'bg-primary' : 'bg-accent-bold',
                    )}
                    style={{ width: `${Math.max(2, carrier.rate * 100)}%` }}
                  />
                  <span
                    className="absolute inset-y-0 w-px bg-foreground/35"
                    style={{ left: `${ON_TIME_TARGET * 100}%` }}
                    aria-hidden
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {withheld > 0 ? (
        <p className="type-body-xs text-muted-foreground">
          {withheld} carrier{withheld === 1 ? '' : 's'} under {MIN_SAMPLE} loads not ranked.
        </p>
      ) : null}
    </Card>
  );
}
