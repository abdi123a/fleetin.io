import { useMemo, useState } from 'react';
import { SheetHeading, FilterBar, PageHeader, TablePager, usePagedRows } from '@/components';
import { AlertTriangle, Loader2, MapPin, Plus, Route } from '@/design-system/icons';
import {
  Button,
  LocationCard,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  useConfirm,
} from '@/design-system';
import {
  LOCATION_KIND_LABELS,
  coordsOf,
  useBuildDistanceBook,
  useDeleteLocation,
  useLocations,
  useMapsStatus,
  type LocationKind,
  type LocationRecord,
} from '@/features/locations';
import { LocationMapPicker } from '@/features/locations/components/LocationMapPicker';
import { AddLocationForm } from './AddLocationForm';

/**
 * The corridor's places, as one list.
 *
 * Until 2026-09-02 this page rendered six rows hardcoded in its own module and
 * held them in `useState` — nothing was ever saved, and the shipment wizard read
 * an entirely separate list of bare strings out of localStorage. Both are gone:
 * this is the `locations` table, and it is the same list the wizard picks from.
 *
 * The filter bands are the location kinds, because "which ports do we have" is
 * the question actually asked of this page.
 */

type Band = 'all' | LocationKind;

export function LocationsPage() {
  const [band, setBand] = useState<Band>('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<LocationRecord | null>(null);
  const [isFormOpen, setFormOpen] = useState(false);
  const [viewing, setViewing] = useState<LocationRecord | null>(null);
  const [pageSize, setPageSize] = useState(12);

  const { data: locations, isLoading, error } = useLocations();
  const { data: mapsStatus } = useMapsStatus();
  const deleteLocation = useDeleteLocation();
  const buildDistances = useBuildDistanceBook();
  const { confirm, confirmDialog } = useConfirm();

  const all = useMemo(() => locations ?? [], [locations]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return all.filter((location) => {
      if (band !== 'all' && location.kind !== band) return false;
      if (!needle) return true;
      return [location.name, location.formattedAddress, location.reference, location.city]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle));
    });
  }, [all, band, search]);

  const paged = usePagedRows(visible, { pageSize });

  const tabs = useMemo(() => {
    const counted = (kind: LocationKind) => all.filter((row) => row.kind === kind).length;
    return [
      { key: 'all' as const, label: 'All', count: all.length },
      { key: 'port' as const, label: 'Ports', count: counted('port') },
      { key: 'free_zone' as const, label: 'Free Zones', count: counted('free_zone') },
      { key: 'depot' as const, label: 'Depots', count: counted('depot') },
      { key: 'yard' as const, label: 'Yards', count: counted('yard') },
      { key: 'customer' as const, label: 'Customer Sites', count: counted('customer') },
      { key: 'other' as const, label: 'Other', count: counted('other') },
      /* A band with nothing in it is a band nobody needs to see. `All` and the
         two the corridor always has stay regardless, so the bar never collapses
         to one tab on a fresh account. */
    ].filter((tab) => tab.count > 0 || tab.key === 'all' || tab.key === 'port' || tab.key === 'free_zone');
  }, [all]);

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (location: LocationRecord) => {
    setEditing(location);
    setFormOpen(true);
  };

  const handleDelete = async (location: LocationRecord) => {
    const ok = await confirm({
      title: `Retire ${location.name}?`,
      description:
        'It stops being offered when planning a pickup or delivery. Shipments that already used it are untouched.',
      confirmLabel: 'Retire',
    });
    if (!ok) return;
    await deleteLocation.mutateAsync(location.id);
  };

  return (
    <div className="w-full min-w-0 space-y-6 pb-12">
      {confirmDialog}

      <PageHeader
        title="Locations"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              shape="pill"
              size="sm"
              isLoading={buildDistances.isPending}
              onClick={() => buildDistances.mutate(false)}
              leadingIcon={<Route className="h-4 w-4" />}
            >
              Measure Distances
            </Button>
            <Button
              variant="primary"
              shape="pill"
              size="sm"
              onClick={openNew}
              leadingIcon={<Plus className="h-4 w-4" />}
            >
              New Location
            </Button>
          </div>
        }
      />

      {mapsStatus && !mapsStatus.googleConfigured && (
        <p className="flex items-start gap-2 rounded-lg border border-border bg-secondary/40 px-4 py-3 text-xs text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-subtle-foreground" />
          <span>
            No Google Maps key on the server. Places can still be added by dropping a pin, and
            distances fall back to straight-line estimates — which run about a third short of
            the road. Set <code className="font-mono">GOOGLE_MAPS_API_KEY</code> to switch both on.
          </span>
        </p>
      )}

      {buildDistances.data && (
        <p className="rounded-lg border border-border bg-secondary/40 px-4 py-3 text-xs text-muted-foreground">
          {buildDistances.data.measured} pair
          {buildDistances.data.measured === 1 ? '' : 's'} measured
          {buildDistances.data.skipped > 0 && `, ${buildDistances.data.skipped} already known`}
          {buildDistances.data.failed > 0 && `, ${buildDistances.data.failed} could not be routed`}
          {buildDistances.data.provider === 'haversine' && ' — straight-line, no Google key'}.
        </p>
      )}

      <FilterBar
        tabs={tabs}
        active={band}
        onSelect={setBand}
        label="Location type"
        search={{
          value: search,
          onChange: setSearch,
          placeholder: 'Search locations',
          matched: visible.length,
          total: all.length,
        }}
      />

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading locations…
        </div>
      ) : error ? (
        <p className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{(error as Error).message}</span>
        </p>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-16 text-center">
          <MapPin className="h-8 w-8 text-muted-foreground/60" />
          <p className="text-sm text-muted-foreground">
            {all.length === 0
              ? 'No locations yet. Add the ports and free zones this account runs between.'
              : 'Nothing matches that filter.'}
          </p>
          {all.length === 0 && (
            <Button variant="primary" size="sm" shape="pill" onClick={openNew}>
              Add the first location
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-4 pt-2">
          {paged.rows.map((location) => (
            <LocationCard
              key={location.id}
              city={location.name}
              cityLabel={`${LOCATION_KIND_LABELS[location.kind]} · ${location.reference}`}
              address={location.formattedAddress || `${location.city}, ${location.country}`}
              addressLabel={
                location.source === 'google'
                  ? 'Verified on Google'
                  : 'Position set by hand'
              }
              onEdit={() => openEdit(location)}
              onDelete={() => handleDelete(location)}
              onViewMap={() => setViewing(location)}
            />
          ))}
        </div>
      )}

      {visible.length > 0 && (
        <TablePager
          paged={paged}
          noun="locations"
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[12, 24, 48, 96]}
        />
      )}

      {/* Add / edit */}
      <Sheet
        open={isFormOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
      >
        <SheetContent
          side="right"
          className="flex h-full w-full flex-col gap-0 overflow-hidden border-l border-border bg-background p-0"
        >
          <SheetHeading
            titleComponent={SheetTitle}
            descriptionComponent={SheetDescription}
            title={editing ? 'Edit Location' : 'Add Location'}
            description="Search Google for the place, then check the pin sits on the gate trucks use."
          />
          <AddLocationForm
            /* Keyed so switching between rows resets the form rather than
               carrying the previous location's values into the next one. */
            key={editing?.id ?? 'new'}
            location={editing ?? undefined}
            isCompact
            onSuccess={() => {
              setFormOpen(false);
              setEditing(null);
            }}
            onCancel={() => {
              setFormOpen(false);
              setEditing(null);
            }}
          />
        </SheetContent>
      </Sheet>

      {/* Where it is */}
      <Sheet open={Boolean(viewing)} onOpenChange={(open) => !open && setViewing(null)}>
        <SheetContent
          side="right"
          className="flex h-full w-full flex-col gap-0 overflow-hidden border-l border-border bg-background p-0"
        >
          {viewing && (
            <>
              <SheetHeading
                titleComponent={SheetTitle}
                descriptionComponent={SheetDescription}
                title={viewing.name}
                description={viewing.formattedAddress || `${viewing.city}, ${viewing.country}`}
              />
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
                <LocationMapPicker
                  latitude={coordsOf(viewing).lat}
                  longitude={coordsOf(viewing).lng}
                  onChange={() => {}}
                  height={340}
                  readOnly
                />
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                  <Fact label="Reference" value={viewing.reference} />
                  <Fact label="Type" value={LOCATION_KIND_LABELS[viewing.kind]} />
                  <Fact
                    label="Coordinates"
                    value={`${coordsOf(viewing).lat.toFixed(5)}, ${coordsOf(viewing).lng.toFixed(5)}`}
                  />
                  <Fact
                    label="Position"
                    value={viewing.source === 'google' ? 'Verified on Google' : 'Set by hand'}
                  />
                  {viewing.gateOrTerminal && (
                    <Fact label="Gate" value={viewing.gateOrTerminal} />
                  )}
                  {viewing.contactPerson && (
                    <Fact label="Contact" value={viewing.contactPerson} />
                  )}
                  {viewing.contactPhone && <Fact label="Phone" value={viewing.contactPhone} />}
                </dl>
                {viewing.notes && (
                  <p className="rounded-md border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
                    {viewing.notes}
                  </p>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 font-medium text-foreground">{value}</dd>
    </div>
  );
}

export default LocationsPage;
