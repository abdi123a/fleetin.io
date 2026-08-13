import { useMemo, useState } from 'react';
import { Skeleton } from '@/design-system';
import { useBiFilters } from '../filters';
import { useOverviewSection } from '../api/queries';
import { peekDataset } from '../api/biService';
import { MapSearchField, TrackingMap } from '../charts';
import type { LiveShipment } from '../contracts';

/**
 * The live corridor, as the detail page's cover.
 *
 * It sits above the profile rather than inside the control tower because it is
 * the one element true of the shipper on every tab — where their freight is
 * right now. A cover photo on a customer record would be decoration; this is
 * the same question the page exists to answer, so it takes that slot.
 *
 * Self-contained by design: it reads the same URL-backed filters and the same
 * query key the panel below uses, so React Query serves both from one fetch and
 * the cover can never disagree with the dashboard under it.
 */

export interface ShipperCoverMapProps {
  shipperId: string;
  /** Injected so the cover and the panel observe the same instant. */
  now?: Date;
  height?: number;
}

export function ShipperCoverMap({ shipperId, now, height = 300 }: ShipperCoverMapProps) {
  const asOf = useMemo(() => now ?? new Date(), [now]);
  const [query, setQuery] = useState('');

  const { filters } = useBiFilters(asOf);
  const dataset = useMemo(() => peekDataset(shipperId, asOf), [shipperId, asOf]);
  const { data } = useOverviewSection({ shipperId, filters, now: asOf });

  const visible = useMemo<LiveShipment[]>(() => {
    const shipments = data?.liveShipments ?? [];
    const needle = query.trim().toLowerCase();
    if (!needle) return shipments;
    return shipments.filter(
      (shipment) =>
        shipment.reference.toLowerCase().includes(needle) ||
        shipment.routeName.toLowerCase().includes(needle) ||
        shipment.transporterName.toLowerCase().includes(needle),
    );
  }, [data?.liveShipments, query]);

  if (!data) {
    return <Skeleton shape="block" className="w-full rounded-none" style={{ height }} />;
  }

  return (
    <TrackingMap
      shipments={visible}
      bounds={data.mapBounds}
      routes={dataset.routes}
      height={height}
      showCountPill={false}
      className="rounded-none border-0"
      overlay={
        <>
          <MapSearchField value={query} onChange={setQuery} />
          <span className="flex h-10 items-center gap-2 rounded-full bg-surface px-4 text-[13px] text-muted-foreground shadow-md">
            <span className="size-2 rounded-full bg-success" aria-hidden />
            {visible.length} tracked
          </span>
        </>
      }
    />
  );
}
