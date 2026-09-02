import { useEffect, useRef, useState } from 'react';
import type { StyleSpecification } from 'maplibre-gl';
import { Map as MapLibreMap, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Compass, Minus, Plus } from '@/design-system/icons';
import { useThemeStore } from '@/stores/theme.store';
import { cn } from '@/utils';

/**
 * A real map with one draggable pin.
 *
 * Replaces the placeholder this form used to carry: a `<div>` where a click ran
 * `lat = 15 − y × 20`, `lng = 32 + x × 20` — a pixel formula, so every
 * "coordinate" it produced was a position in a rectangle rather than a position
 * on Earth.
 *
 * The basemap is CARTO raster tiles through MapLibre, the same stack the BI
 * tracking map already runs on. Deliberately not the Google Maps JS API: the
 * geography here — the search, the address, the coordinates, the distance — is
 * all Google's, and it arrives through the backend so the key stays on the
 * server. Rendering Google's own tiles would need a second key shipped in this
 * bundle and a second mapping library beside the one already installed, to draw
 * the same pin in the same place.
 *
 * The pin is draggable because Google's coordinate for a port is its front door
 * and a truck uses gate 3. Dragging is how that gets corrected, and the drag
 * marks the location `manual` so a later reader knows a human moved it.
 */

const CARTO_LIGHT: StyleSpecification = {
  version: 8,
  sources: {
    'carto-light': {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
        'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
        'https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
      ],
      tileSize: 256,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    },
  },
  layers: [{ id: 'carto-light-tiles', type: 'raster', source: 'carto-light', minzoom: 0, maxzoom: 19 }],
};

const CARTO_DARK: StyleSpecification = {
  version: 8,
  sources: {
    'carto-dark': {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
      ],
      tileSize: 256,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    },
  },
  layers: [{ id: 'carto-dark-tiles', type: 'raster', source: 'carto-dark', minzoom: 0, maxzoom: 19 }],
};

/** Djibouti city. Where the map opens before anything has been picked. */
const DEFAULT_CENTER: [number, number] = [43.1456, 11.5721];
const DEFAULT_ZOOM = 10;
/** Close enough to see which gate the pin is on. */
const PICKED_ZOOM = 15;

export interface LocationMapPickerProps {
  latitude: number | null;
  longitude: number | null;
  /** Fired on drag-end and on map click. Not on every frame of the drag. */
  onChange: (coords: { latitude: number; longitude: number }) => void;
  height?: number;
  className?: string;
  /** Read-only preview — no dragging, no click-to-place. */
  readOnly?: boolean;
}

export function LocationMapPicker({
  latitude,
  longitude,
  onChange,
  height = 260,
  className,
  readOnly = false,
}: LocationMapPickerProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const marker = useRef<Marker | null>(null);
  /* Held in a ref so the map's event handlers, which are bound once, always
     call the current callback rather than the one from first render. */
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [failed, setFailed] = useState(false);

  const isDark = useThemeStore((state) => state.resolvedTheme === 'dark');

  useEffect(() => {
    if (!container.current || map.current) return;

    try {
      const instance = new MapLibreMap({
        container: container.current,
        style: isDark ? CARTO_DARK : CARTO_LIGHT,
        center:
          latitude != null && longitude != null ? [longitude, latitude] : DEFAULT_CENTER,
        zoom: latitude != null && longitude != null ? PICKED_ZOOM : DEFAULT_ZOOM,
        attributionControl: { compact: true },
      });

      if (!readOnly) {
        instance.on('click', (event) => {
          onChangeRef.current({
            latitude: Number(event.lngLat.lat.toFixed(7)),
            longitude: Number(event.lngLat.lng.toFixed(7)),
          });
        });
      }

      map.current = instance;
    } catch {
      /* No WebGL — a remote desktop, a locked-down browser. The lat/lng fields
         beside this still work, so the form is usable without the map. */
      setFailed(true);
    }

    /**
     * Tell the map when its box changes size.
     *
     * This picker lives inside a Sheet that slides in, so at the moment the map
     * is constructed its container is still 0×0. MapLibre reads the size once,
     * computes a viewport of no pixels, and then requests no tiles at all — the
     * canvas is there, WebGL is fine, and the panel stays empty forever. It has
     * no internal resize handling for anything but the window.
     *
     * The observer also covers the ordinary cases: the sheet being resized, and
     * the browser going from desktop to mobile width.
     */
    const observer = new ResizeObserver(() => map.current?.resize());
    if (container.current) observer.observe(container.current);

    return () => {
      observer.disconnect();
      map.current?.remove();
      map.current = null;
      marker.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Theme changes swap the basemap in place rather than rebuilding the map,
     which would lose the viewport the operator had panned to. */
  useEffect(() => {
    map.current?.setStyle(isDark ? CARTO_DARK : CARTO_LIGHT);
  }, [isDark]);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;

    if (latitude == null || longitude == null) {
      marker.current?.remove();
      marker.current = null;
      return;
    }

    if (!marker.current) {
      const element = document.createElement('div');
      element.className = 'fleetin-map-pin';
      /* Inline rather than a Tailwind class: MapLibre appends this element
         outside the React tree, so a JIT-scanned class would not be emitted. */
      element.style.cssText = [
        'width:20px',
        'height:20px',
        'border-radius:9999px',
        'background:var(--primary)',
        'border:3px solid var(--surface, #fff)',
        'box-shadow:0 1px 6px rgba(0,0,0,0.35)',
        readOnly ? 'cursor:default' : 'cursor:grab',
      ].join(';');

      marker.current = new Marker({ element, draggable: !readOnly })
        .setLngLat([longitude, latitude])
        .addTo(instance);

      if (!readOnly) {
        marker.current.on('dragend', () => {
          const position = marker.current?.getLngLat();
          if (!position) return;
          onChangeRef.current({
            latitude: Number(position.lat.toFixed(7)),
            longitude: Number(position.lng.toFixed(7)),
          });
        });
      }

      instance.easeTo({ center: [longitude, latitude], zoom: PICKED_ZOOM, duration: 600 });
      return;
    }

    marker.current.setLngLat([longitude, latitude]);
    /* Only recentre when the new point is off-screen. Recentring on every
       change would yank the map back after every small drag. */
    if (!instance.getBounds().contains([longitude, latitude])) {
      instance.easeTo({ center: [longitude, latitude], duration: 600 });
    }
  }, [latitude, longitude, readOnly]);

  if (failed) {
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded-lg border border-border bg-secondary/30 px-4 text-center text-xs text-muted-foreground',
          className,
        )}
        style={{ height }}
      >
        This browser cannot draw the map. Enter the coordinates below instead.
      </div>
    );
  }

  return (
    <div
      className={cn('relative overflow-hidden rounded-lg border border-border', className)}
      style={{ height }}
    >
      <div ref={container} className="h-full w-full" />

      <div className="absolute right-2 top-2 flex flex-col gap-1">
        <MapButton label="Zoom in" onClick={() => map.current?.zoomIn()}>
          <Plus className="h-3.5 w-3.5" />
        </MapButton>
        <MapButton label="Zoom out" onClick={() => map.current?.zoomOut()}>
          <Minus className="h-3.5 w-3.5" />
        </MapButton>
        {latitude != null && longitude != null && (
          <MapButton
            label="Centre on the pin"
            onClick={() =>
              map.current?.easeTo({ center: [longitude, latitude], zoom: PICKED_ZOOM })
            }
          >
            <Compass className="h-3.5 w-3.5" />
          </MapButton>
        )}
      </div>

      {!readOnly && latitude == null && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-background/85 px-3 py-2 text-center text-[11px] font-medium text-muted-foreground backdrop-blur-sm">
          Search for the place above, or click the map to drop a pin.
        </div>
      )}
    </div>
  );
}

function MapButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background/90 text-foreground shadow-xs backdrop-blur-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </button>
  );
}
