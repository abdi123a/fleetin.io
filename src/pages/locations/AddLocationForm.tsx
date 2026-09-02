import { useEffect, useState } from 'react';
import { AlertTriangle, Info } from '@/design-system/icons';
import { Button, Input, Select, Textarea } from '@/design-system';
import {
  LOCATION_KINDS,
  LOCATION_KIND_LABELS,
  coordsOf,
  useCreateLocation,
  useMapsStatus,
  useUpdateLocation,
  type LocationKind,
  type LocationRecord,
  type PlaceCandidate,
} from '@/features/locations';
import { LocationMapPicker } from '@/features/locations/components/LocationMapPicker';
import { PlaceSearchField } from '@/features/locations/components/PlaceSearchField';

/**
 * Add a place to the catalogue by finding it on Google.
 *
 * What this replaces: a city dropdown of thirteen hardcoded names, three
 * "Address Type" text boxes, and a fake map — a `<div>` whose click handler
 * computed `lat = 15 − y × 20` from the pixel you hit. Nothing it produced was
 * a real coordinate, and nothing downstream could measure to it.
 *
 * The shape now is one decision followed by confirmation: search Google, pick
 * the place, check the pin. Everything else on the form is pre-filled from the
 * result and editable — the name because this office calls SGTD "Doraleh
 * Container Terminal (SGTD)" and Google does not, the kind because Google files
 * half the free zones under "point_of_interest".
 *
 * Entering a place by hand is kept as a genuine path, not a degraded one: a
 * private gate or a yard Google has never heard of is a real place a shipment
 * goes to, and it is also the whole form when no API key is configured.
 */

export interface AddLocationFormProps {
  /** Present when editing rather than adding. */
  location?: LocationRecord;
  onSuccess?: (location: LocationRecord) => void;
  onCancel?: () => void;
  isCompact?: boolean;
}

interface FormState {
  name: string;
  kind: LocationKind;
  googlePlaceId: string | null;
  formattedAddress: string;
  city: string;
  country: string;
  gateOrTerminal: string;
  contactPerson: string;
  contactPhone: string;
  notes: string;
  latitude: number | null;
  longitude: number | null;
}

const EMPTY: FormState = {
  name: '',
  kind: 'other',
  googlePlaceId: null,
  formattedAddress: '',
  city: 'Djibouti',
  country: 'Djibouti',
  gateOrTerminal: '',
  contactPerson: '',
  contactPhone: '',
  notes: '',
  latitude: null,
  longitude: null,
};

const KIND_OPTIONS = LOCATION_KINDS.map((kind) => ({
  value: kind,
  label: LOCATION_KIND_LABELS[kind],
}));

function stateFrom(location: LocationRecord): FormState {
  const { lat, lng } = coordsOf(location);
  return {
    name: location.name,
    kind: location.kind,
    googlePlaceId: location.googlePlaceId,
    formattedAddress: location.formattedAddress ?? '',
    city: location.city,
    country: location.country,
    gateOrTerminal: location.gateOrTerminal ?? '',
    contactPerson: location.contactPerson ?? '',
    contactPhone: location.contactPhone ?? '',
    notes: location.notes ?? '',
    latitude: lat,
    longitude: lng,
  };
}

export function AddLocationForm({
  location,
  onSuccess,
  onCancel,
  isCompact = false,
}: AddLocationFormProps) {
  const isEditing = Boolean(location);
  const [form, setForm] = useState<FormState>(location ? stateFrom(location) : EMPTY);
  const [errors, setErrors] = useState<{ name?: string; coords?: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  /* Set when the operator drags the pin or types a coordinate, so the form can
     say the position is theirs now rather than Google's. */
  const [pinMoved, setPinMoved] = useState(false);

  const { data: mapsStatus } = useMapsStatus();
  const googleReady = mapsStatus?.googleConfigured ?? false;

  const createLocation = useCreateLocation();
  const updateLocation = useUpdateLocation();
  const isSubmitting = createLocation.isPending || updateLocation.isPending;

  useEffect(() => {
    if (location) setForm(stateFrom(location));
  }, [location]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key === 'name' && errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
  };

  /** A Google result, taken whole. The operator edits it afterwards if needed. */
  const acceptCandidate = (candidate: PlaceCandidate) => {
    setForm((prev) => ({
      ...prev,
      googlePlaceId: candidate.googlePlaceId,
      /* Google's name only when the operator has not typed their own — an
         existing name is a deliberate choice and must survive a re-search. */
      name: prev.name.trim() ? prev.name : candidate.name,
      kind: candidate.kind,
      formattedAddress: candidate.formattedAddress,
      city: candidate.city ?? prev.city,
      country: candidate.country ?? prev.country,
      latitude: candidate.latitude,
      longitude: candidate.longitude,
    }));
    setPinMoved(false);
    setErrors({});
  };

  const movePin = (coords: { latitude: number; longitude: number }) => {
    setForm((prev) => ({ ...prev, latitude: coords.latitude, longitude: coords.longitude }));
    setPinMoved(true);
    setErrors((prev) => ({ ...prev, coords: undefined }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitError(null);

    const nextErrors: typeof errors = {};
    if (!form.name.trim()) nextErrors.name = 'Give the location a name.';
    if (form.latitude == null || form.longitude == null) {
      nextErrors.coords =
        'A location needs a position — search for it, or click the map to drop a pin.';
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    const payload = {
      name: form.name.trim(),
      kind: form.kind,
      formattedAddress: form.formattedAddress || undefined,
      city: form.city || undefined,
      country: form.country || undefined,
      gateOrTerminal: form.gateOrTerminal || undefined,
      contactPerson: form.contactPerson || undefined,
      contactPhone: form.contactPhone || undefined,
      notes: form.notes || undefined,
      latitude: form.latitude ?? undefined,
      longitude: form.longitude ?? undefined,
    };

    try {
      const saved = location
        ? await updateLocation.mutateAsync({ id: location.id, payload })
        : await createLocation.mutateAsync({
            ...payload,
            /* Sent only when the pin still sits where Google put it. A dragged
               pin is the operator's position, and passing the place id would
               have the server overwrite it with Google's own. */
            googlePlaceId: pinMoved ? undefined : (form.googlePlaceId ?? undefined),
          });
      onSuccess?.(saved);
    } catch (error) {
      setSubmitError((error as Error).message || 'Could not save the location.');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-6 py-5 sm:px-8">
        {/* ─ Find it on Google ─ */}
        <div className="space-y-2">
          <label className="block text-[11px] font-bold text-foreground">
            Find the place
          </label>
          <PlaceSearchField onPick={acceptCandidate} enabled={googleReady} />
          {!googleReady && (
            <p className="flex items-start gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2 text-[11px] text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                No Google Maps key on the server, so search is off. Drop the pin on the map
                and fill the name in yourself — the location works either way, and distances
                to it fall back to straight-line estimates until a key is set.
              </span>
            </p>
          )}
        </div>

        {/* ─ The pin ─ */}
        <div className="space-y-2">
          <LocationMapPicker
            latitude={form.latitude}
            longitude={form.longitude}
            onChange={movePin}
            height={isCompact ? 240 : 320}
          />
          {errors.coords && <p className="text-xs text-destructive">{errors.coords}</p>}

          <div className="grid grid-cols-2 gap-3">
            <CoordinateInput
              label="Latitude"
              value={form.latitude}
              onChange={(value) => {
                setForm((prev) => ({ ...prev, latitude: value }));
                setPinMoved(true);
              }}
            />
            <CoordinateInput
              label="Longitude"
              value={form.longitude}
              onChange={(value) => {
                setForm((prev) => ({ ...prev, longitude: value }));
                setPinMoved(true);
              }}
            />
          </div>

          {form.googlePlaceId && pinMoved && (
            <p className="text-[11px] text-muted-foreground">
              Pin moved off Google’s position — saved as this office’s own.
            </p>
          )}
        </div>

        {/* ─ What it is ─ */}
        <div className="space-y-3 border-t border-border/40 pt-4">
          <div className="space-y-1">
            <label htmlFor="location-name" className="block text-[11px] font-bold text-foreground">
              Name *
            </label>
            <Input
              id="location-name"
              value={form.name}
              onChange={(event) => set('name', event.target.value)}
              placeholder="Doraleh Container Terminal (SGTD)"
              hasError={Boolean(errors.name)}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="location-kind" className="block text-[11px] font-bold text-foreground">
                Type
              </label>
              <Select
                id="location-kind"
                value={form.kind}
                options={KIND_OPTIONS}
                onChange={(event) => set('kind', event.target.value as LocationKind)}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="location-city" className="block text-[11px] font-bold text-foreground">
                City
              </label>
              <Input
                id="location-city"
                value={form.city}
                onChange={(event) => set('city', event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="location-address" className="block text-[11px] font-bold text-foreground">
              Address
            </label>
            <Input
              id="location-address"
              value={form.formattedAddress}
              onChange={(event) => set('formattedAddress', event.target.value)}
              placeholder="Filled in from Google when you pick a place"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="location-gate" className="block text-[11px] font-bold text-foreground">
                Gate or Terminal
              </label>
              <Input
                id="location-gate"
                value={form.gateOrTerminal}
                onChange={(event) => set('gateOrTerminal', event.target.value)}
                placeholder="Gate 3"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="location-country" className="block text-[11px] font-bold text-foreground">
                Country
              </label>
              <Input
                id="location-country"
                value={form.country}
                onChange={(event) => set('country', event.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="location-contact" className="block text-[11px] font-bold text-foreground">
                Contact
              </label>
              <Input
                id="location-contact"
                value={form.contactPerson}
                onChange={(event) => set('contactPerson', event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="location-phone" className="block text-[11px] font-bold text-foreground">
                Phone
              </label>
              <Input
                id="location-phone"
                value={form.contactPhone}
                onChange={(event) => set('contactPhone', event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="location-notes" className="block text-[11px] font-bold text-foreground">
              Notes
            </label>
            <Textarea
              id="location-notes"
              rows={2}
              value={form.notes}
              onChange={(event) => set('notes', event.target.value)}
              placeholder="Access hours, which gate trucks use, who to call on arrival"
            />
          </div>
        </div>

        {submitError && (
          <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{submitError}</span>
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border/40 bg-background px-6 py-4 sm:px-8">
        {onCancel && (
          <Button type="button" onClick={onCancel} variant="outline" size="sm" className="rounded-lg">
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          isLoading={isSubmitting}
          size="sm"
          className="rounded-lg bg-primary px-5 font-semibold text-primary-foreground"
        >
          {isEditing ? 'Save Changes' : 'Save Location'}
        </Button>
      </div>
    </form>
  );
}

/**
 * A coordinate, typed.
 *
 * Kept as free text while being edited rather than parsed on every keystroke:
 * `parseFloat` on "11." gives 11, which snaps the pin across the map mid-typing
 * and then fights the next character.
 */
function CoordinateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const [draft, setDraft] = useState(value == null ? '' : String(value));

  useEffect(() => {
    setDraft(value == null ? '' : String(value));
  }, [value]);

  return (
    <div className="space-y-1">
      <label className="block text-[11px] font-bold text-foreground">{label}</label>
      <Input
        inputMode="decimal"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          const parsed = Number.parseFloat(draft);
          onChange(Number.isFinite(parsed) ? parsed : null);
        }}
        placeholder="—"
      />
    </div>
  );
}
