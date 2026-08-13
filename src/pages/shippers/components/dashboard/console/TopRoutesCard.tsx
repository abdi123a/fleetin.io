import { useMemo } from 'react';
import { Card } from '@/design-system';
import type { ShipperShipmentRow } from '@/features/shipper-bi';
import { cn } from '@/utils';
import { PanelHeader, PanelLink, PANEL_SURFACE } from './PanelHeader';

/**
 * The busiest corridors, as bars against the top route.
 *
 * Bars are scaled to the leader rather than to the total: at five rows the
 * shares are all small fractions and every bar would collapse to a stub.
 *
 * They wear `--chart-1` rather than the accent gold — the accent is spoken for
 * by the Delayed status, and route volume is not a warning.
 */

export interface TopRoutesCardProps {
  rows: ShipperShipmentRow[];
  onViewAll?: () => void;
}

export function TopRoutesCard({ rows, onViewAll }: TopRoutesCardProps) {
  const routes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const key = `${row.origin} \u2192 ${row.destination}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);
  }, [rows]);

  const max = routes[0]?.count ?? 1;

  return (
    <Card variant="default" padding="lg" className={cn('h-full gap-6', PANEL_SURFACE)}>
      <PanelHeader
        title="Top Routes"
        action={onViewAll ? <PanelLink onClick={onViewAll}>View all</PanelLink> : undefined}
      />

      {routes.length === 0 ? (
        <p className="type-body-sm flex flex-1 items-center justify-center py-8 text-center text-muted-foreground">
          No routes in this window.
        </p>
      ) : (
        <ul className="flex flex-1 flex-col justify-between gap-4">
          {routes.map((route) => (
            <li key={route.label} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-3">
                <span className="type-body-sm truncate font-medium text-foreground">
                  {route.label}
                </span>
                <span className="type-body-sm shrink-0 font-semibold tabular-nums text-foreground">
                  {route.count}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(6, (route.count / max) * 100)}%`,
                    backgroundColor: 'var(--chart-1)',
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
