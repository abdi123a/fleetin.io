import { useMemo, useState } from 'react';
import { AlertTriangle, Loader2, MapPin, Plus, X } from '@/design-system/icons';
import { Button, Combobox, Input, Select } from '@/design-system';
import {
  LOCATION_KINDS,
  LOCATION_KIND_LABELS,
  useCreateLocation,
  useLocations,
  useMapsStatus,
  type LocationKind,
  type LocationRecord,
  type PlaceCandidate,
} from '..';
import { PlaceSearchField } from './PlaceSearchField';

/**
 * Pick where a shipment starts or ends — from the catalogue, or from Google.
 *
 * The picker this replaces read a list of bare strings out of localStorage:
 * a place added on one machine did not exist on the next one, a typo was
 * permanent, and none of them carried a coordinate, so the "distance" beside
 * them was a substring match returning 10, 15, 20 or 25. This reads the real
 * `locations` table, and a place picked here is a place a road can be measured
 * to.
 *
 * "Add a location" opens Google search inline rather than sending the operator
 * to another page: they are mid-way through a shipment, and losing the form to
 * go and create a destination is how a shipment gets abandoned.
 *
 * The list is ordered, never filtered. `preferKinds` floats the expected sort
 * of place to the top — ports for a pickup, free zones for a drop-off — and
 * everything else follows it, because a shipment does occasionally run
 * depot-to-depot and a picker that hides the answer is worse than one that
 * buries it.
 */

export interface ShipmentLocationFieldProps {
  value: string | null;
  onChange: (location: LocationRecord | null) => void;
  /** Floated to the top of the list. Everything else still appears below. */
  preferKinds?: LocationKind[];
  placeholder?: string;
  disabled?: boolean;
}

export function ShipmentLocationField({
  value,
  onChange,
  preferKinds = [],
  placeholder = 'Select a location',
  disabled,
}: ShipmentLocationFieldProps) {
  const [adding, setAdding] = useState(false);
  const { data: locations, isLoading } = useLocations({ active: true });

  const options = useMemo(() => {
    const rows = locations ?? [];
    const rank = (location: LocationRecord) => {
      const index = preferKinds.indexOf(location.kind);
      return index === -1 ? preferKinds.length : index;
    };
    return [...rows]
      .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
      .map((location) => ({ value: location.id, label: location.name }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locations, preferKinds.join(',')]);

  const byId = useMemo(
    () => new Map((locations ?? []).map((location) => [location.id, location])),
    [locations],
  );

  return (
    <div className="space-y-2">
      <Combobox
        value={value ?? ''}
        placeholder={isLoading ? 'Loading locations…' : placeholder}
        disabled={disabled || isLoading}
        leadingIcon={<MapPin className="h-3.5 w-3.5 text-primary" />}
        options={[...options, { value: ADD_LOCATION, label: '+ Add a location…' }]}
        onChange={(next) => {
          if (next === ADD_LOCATION) {
            setAdding(true);
            return;
          }
          onChange(byId.get(next) ?? null);
        }}
      />

      {adding && (
        <InlineLocationCreator
          preferKind={preferKinds[0]}
          onCancel={() => setAdding(false)}
          onCreated={(location) => {
            setAdding(false);
            onChange(location);
          }}
        />
      )}
    </div>
  );
}

const ADD_LOCATION = '__add_location__';

/**
 * Search Google, save, and select — without leaving the shipment form.
 *
 * Deliberately narrower than the full Locations form: name, type, and the
 * position that arrives with the Google result. Gate, contact and notes are
 * left to the Locations page, because somebody halfway through booking a
 * shipment is not going to fill them in and a form that asks anyway is a form
 * they abandon.
 */
function InlineLocationCreator({
  preferKind,
  onCancel,
  onCreated,
}: {
  preferKind?: LocationKind;
  onCancel: () => void;
  onCreated: (location: LocationRecord) => void;
}) {
  const [picked, setPicked] = useState<PlaceCandidate | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<LocationKind>(preferKind ?? 'other');
  const [error, setError] = useState<string | null>(null);

  const { data: mapsStatus } = useMapsStatus();
  const googleReady = mapsStatus?.googleConfigured ?? false;
  const createLocation = useCreateLocation();

  const accept = (candidate: PlaceCandidate) => {
    setPicked(candidate);
    setName(candidate.name);
    setKind(preferKind ?? candidate.kind);
    setError(null);
  };

  const save = async () => {
    if (!picked || !name.trim()) return;
    setError(null);
    try {
      const saved = await createLocation.mutateAsync({
        googlePlaceId: picked.googlePlaceId,
        name: name.trim(),
        kind,
      });
      onCreated(saved);
    } catch (caught) {
      setError((caught as Error).message || 'Could not save the location.');
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-border bg-secondary/30 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-foreground">Add a location</span>
        <button
          type="button"
          aria-label="Close"
          onClick={onCancel}
          className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {googleReady ? (
        <PlaceSearchField onPick={accept} placeholder="Search Google for the place…" />
      ) : (
        <p className="flex items-start gap-2 text-[11px] text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning-subtle-foreground" />
          <span>
            Google search is off on this server. Add the location from the Locations page,
            where a pin can be dropped by hand.
          </span>
        </p>
      )}

      {picked && (
        <>
          <p className="truncate text-[11px] text-muted-foreground">
            {picked.formattedAddress}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Name"
            />
            <Select
              value={kind}
              options={LOCATION_KINDS.map((option) => ({
                value: option,
                label: LOCATION_KIND_LABELS[option],
              }))}
              onChange={(event) => setKind(event.target.value as LocationKind)}
            />
          </div>
          {error && <p className="text-[11px] text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              isLoading={createLocation.isPending}
              onClick={save}
              leadingIcon={
                createLocation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )
              }
            >
              Save & use
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
