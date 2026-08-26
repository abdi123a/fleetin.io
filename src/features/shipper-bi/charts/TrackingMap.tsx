import { useEffect, useMemo, useRef, useState } from 'react';
import type { StyleSpecification } from 'maplibre-gl';
import { Map as MapLibreMap, Marker, Popup } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Maximize, Minus, Plus, Search } from '@/design-system/icons';
import { useThemeStore } from '@/stores/theme.store';
import { cn } from '@/utils';
import type { LiveShipment, MapBounds, Route } from '../contracts';
import { STAGE_LABELS } from '../contracts';
import { riskSeverityThresholds } from '@/lib/bi/config';

/**
 * The corridor, live.
 *
 * A dark basemap with the shipper's own geography drawn on top: route
 * corridors as lines, open shipments as markers coloured by risk. Markers use
 * the status scale rather than series hues — their colour *means* "this one
 * needs attention", and it always ships beside a readable label in the popup
 * rather than standing alone.
 *
 * Uses CARTO raster tiles for 100% reliable, zero-latency basemap rendering
 * without external vector font/sprite network dependencies.
 */

const MAP_STYLE_LIGHT: StyleSpecification = {
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
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    },
  },
  layers: [
    {
      id: 'carto-light-tiles',
      type: 'raster',
      source: 'carto-light',
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};

const MAP_STYLE_DARK: StyleSpecification = {
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
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    },
  },
  layers: [
    {
      id: 'carto-dark-tiles',
      type: 'raster',
      source: 'carto-dark',
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};

export interface TrackingMapProps {
  shipments: LiveShipment[];
  bounds: MapBounds;
  routes: Route[];
  onSelect?: (shipment: LiveShipment) => void;
  /** Rendered into the top-left overlay — search, sort. */
  overlay?: React.ReactNode;
  className?: string;
  /** Pixel height, or `'100%'` when the parent supplies the box. */
  height?: number | '100%';
  showCountPill?: boolean;
}

function riskColor(riskScore: number): string {
  if (riskScore >= riskSeverityThresholds().critical) return 'var(--destructive)';
  if (riskScore >= riskSeverityThresholds().warning) return 'var(--warning)';
  return 'var(--primary)';
}

export function TrackingMap({
  shipments,
  bounds,
  routes,
  onSelect,
  overlay,
  className,
  height = 420,
  showCountPill = true,
}: TrackingMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const [failed, setFailed] = useState(false);

  /**
   * The theme comes from the store, not the DOM.
   *
   * This read used to be `document.documentElement.dataset.theme === 'dark'`,
   * an attribute nothing in the app has ever written — the theme is a class on
   * `<html>`. So the check was permanently false and the dark basemap never
   * shipped: a light Positron map sat in a dark page. Subscribing to the store
   * also makes it reactive, which the DOM read was not.
   */
  const isDark = useThemeStore((state) => state.resolvedTheme === 'dark');

  const routeFeatures = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: routes.map((route) => ({
        type: 'Feature' as const,
        properties: { name: route.name },
        geometry: {
          type: 'LineString' as const,
          coordinates: [
            [route.originLng, route.originLat],
            [route.destinationLng, route.destinationLat],
          ],
        },
      })),
    }),
    [routes],
  );

  useEffect(() => {
    if (!container.current || map.current) return;

    let instance: MapLibreMap;
    try {
      instance = new MapLibreMap({
        container: container.current,
        style: isDark ? MAP_STYLE_DARK : MAP_STYLE_LIGHT,
        bounds: [
          [bounds.minLng, bounds.minLat],
          [bounds.maxLng, bounds.maxLat],
        ],
        fitBoundsOptions: { padding: 64 },
        attributionControl: { compact: true },
      });
    } catch {
      // WebGL unavailable — headless runners and locked-down machines both hit
      // this. The card falls back rather than throwing away the whole panel.
      setFailed(true);
      return;
    }

    map.current = instance;

    const resizeObserver =
      typeof ResizeObserver !== 'undefined' && container.current
        ? new ResizeObserver(() => {
            instance.resize();
          })
        : null;
    if (container.current && resizeObserver) resizeObserver.observe(container.current);

    // Falling back to the corridor view must fully tear the instance down —
    // not just hide it. A GL context, its render loop and its worker
    // (maplibre-gl-worker.mjs) keep running against a network that will
    // never answer if `instance.remove()` is skipped here, which is exactly
    // the kind of leak that starves the tab's render thread over time. Both
    // paths that declare failure — a caught construction error and the load
    // deadline below — go through this one teardown so neither can forget it.
    let tornDown = false;
    const failAndTeardown = () => {
      if (tornDown) return;
      tornDown = true;
      window.clearTimeout(timeout);
      instance.remove();
      if (map.current === instance) map.current = null;
      setFailed(true);
    };

    // MapLibre's `error` is a catch-all for every resource it ever requests: a
    // tile that 404s at the edge of the viewport, a glyph range, a sprite
    // sheet. Wiring it to the teardown meant one missing tile out of hundreds
    // permanently replaced a working basemap with the no-basemap fallback —
    // which is exactly what was happening on this page. A map missing one tile
    // is still a map, so these are reported and otherwise survived.
    instance.on('error', (event) => {
      if (import.meta.env.DEV) console.warn('[TrackingMap]', event.error ?? event);
    });

    // Whether the basemap came up at all is a different question, and the only
    // reliable signal is that `load` never fires: a blocked or unreachable tile
    // host resolves neither `load` nor a fatal error — the fetch simply hangs,
    // and the card would sit on a blank grey canvas forever. A corporate
    // firewall or a sandboxed preview blocking the tile domain is precisely
    // this case, so failure is declared on a deadline rather than an event.
    const timeout = window.setTimeout(failAndTeardown, 15000);

    instance.on('load', () => {
      if (tornDown) return;
      window.clearTimeout(timeout);
      instance.addSource('routes', { type: 'geojson', data: routeFeatures });
      instance.addLayer({
        id: 'route-lines',
        type: 'line',
        source: 'routes',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#60969d',
          'line-width': 2,
          'line-opacity': 0.55,
        },
      });
    });

    return () => {
      resizeObserver?.disconnect();
      window.clearTimeout(timeout);
      if (!tornDown) {
        tornDown = true;
        instance.remove();
        if (map.current === instance) map.current = null;
      }
    };
    // Bounds, routes and the basemap style are re-applied by the effects below;
    // re-creating the map on any of those would fight the user's pan and zoom.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Swap the basemap when the page theme changes.
   *
   * The style is a construction argument, so without this the map keeps
   * whichever basemap it was born with — the cover would stay light behind a
   * dark page for the rest of the session. `setStyle` replaces the basemap and
   * drops the layers added on top of it, so the route corridors are re-added on
   * the `styledata` that follows; markers are DOM overlays and survive on their
   * own.
   */
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;

    instance.setStyle(isDark ? MAP_STYLE_DARK : MAP_STYLE_LIGHT);

    const restoreRoutes = () => {
      if (instance.getSource('routes')) return;
      instance.addSource('routes', { type: 'geojson', data: routeFeatures });
      instance.addLayer({
        id: 'route-lines',
        type: 'line',
        source: 'routes',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#60969d', 'line-width': 2, 'line-opacity': 0.55 },
      });
    };

    instance.once('styledata', restoreRoutes);
    return () => {
      instance.off('styledata', restoreRoutes);
    };
    // Routes have their own effect; re-running this on a data change would
    // needlessly re-download the whole basemap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDark]);

  /* Markers are rebuilt whenever the filtered shipment set changes. */
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;

    for (const marker of markers.current) marker.remove();
    markers.current = [];

    for (const shipment of shipments) {
      const element = document.createElement('button');
      element.type = 'button';
      element.className = 'fl-map-marker';
      element.style.setProperty('--marker-color', riskColor(shipment.riskScore));
      element.setAttribute(
        'aria-label',
        `${shipment.reference}, ${STAGE_LABELS[shipment.stage]}, ${shipment.routeName}`,
      );
      element.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3.5 8.5 12 4l8.5 4.5v7L12 20l-8.5-4.5v-7Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M3.5 8.5 12 13m0 0 8.5-4.5M12 13v7" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';

      if (onSelect) element.addEventListener('click', () => onSelect(shipment));

      const marker = new Marker({ element })
        .setLngLat([shipment.lng, shipment.lat])
        .setPopup(
          new Popup({ offset: 18, closeButton: false }).setHTML(
            `<div class="fl-map-popup">
               <strong>${shipment.reference}</strong>
               <span>${STAGE_LABELS[shipment.stage]} · ${shipment.transporterName}</span>
               <span>${shipment.routeName}</span>
             </div>`,
          ),
        )
        .addTo(instance);

      markers.current.push(marker);
    }
  }, [shipments, onSelect]);

  /* Refit when the filters change the extent of what is in flight. */
  useEffect(() => {
    const instance = map.current;
    if (!instance || shipments.length === 0) return;
    instance.fitBounds(
      [
        [bounds.minLng, bounds.minLat],
        [bounds.maxLng, bounds.maxLat],
      ],
      { padding: 64, duration: 600, maxZoom: 9 },
    );
  }, [bounds, shipments.length]);

  const zoom = (delta: number) => map.current?.zoomTo((map.current?.getZoom() ?? 6) + delta);

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-card border border-border bg-surface-sunken',
        className,
      )}
      style={{ height }}
    >
      {failed ? (
        <FallbackCorridor shipments={shipments} routes={routes} />
      ) : (
        <div ref={container} className="size-full" />
      )}

      {/* Overlays sit above the canvas; the map keeps its own pointer events. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="pointer-events-auto flex flex-wrap items-center gap-2">{overlay}</div>
          <MapControl
            onClick={() => container.current?.requestFullscreen?.()}
            label="Expand map to full screen"
          >
            <Maximize className="size-4" />
          </MapControl>
        </div>

        <div className="flex items-end justify-between gap-3">
          {showCountPill ? (
            <p className="pointer-events-none rounded-full bg-surface/90 px-3 py-1.5 text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur-sm">
              {shipments.length} shipment{shipments.length === 1 ? '' : 's'} in flight
            </p>
          ) : (
            <div />
          )}
          <div className="pointer-events-auto flex flex-col gap-2">
            <MapControl onClick={() => zoom(1)} label="Zoom in">
              <Plus className="size-4" />
            </MapControl>
            <MapControl onClick={() => zoom(-1)} label="Zoom out">
              <Minus className="size-4" />
            </MapControl>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The floating circular controls the reference layout parks over the canvas. */
function MapControl({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="pointer-events-auto flex size-10 items-center justify-center rounded-full bg-surface text-foreground shadow-md transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {children}
    </button>
  );
}

/**
 * What the card shows when the basemap cannot load.
 *
 * A schematic of the corridor rather than an error box: without tiles the
 * geography is gone, but the relative position of every shipment along its
 * route is still real data and still worth reading.
 */
function FallbackCorridor({
  shipments,
  routes,
}: {
  shipments: LiveShipment[];
  routes: Route[];
}) {
  return (
    <div className="relative size-full overflow-hidden">
      {/* A faint street grid so the panel reads as a schematic of the corridor
          rather than a card that failed to load something. */}
      <svg className="absolute inset-0 size-full text-border" aria-hidden>
        <defs>
          <pattern id="corridor-grid" width="56" height="56" patternUnits="userSpaceOnUse">
            <path d="M56 0H0v56" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#corridor-grid)" />
      </svg>

      <div className="relative flex size-full flex-col justify-center gap-4 overflow-y-auto px-6 pb-16 pt-20 sm:px-8">
        {routes.slice(0, 6).map((route) => {
          const onRoute = shipments.filter((s) => s.routeName === route.name);
          return (
            <div key={route.id} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <span className="truncate font-medium text-foreground">{route.name}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {onRoute.length} in flight
                </span>
              </div>
              <div className="relative h-1.5 rounded-full bg-border">
                {onRoute.map((shipment) => {
                  // An unplaced corridor has no axis to lay progress along, so
                  // the pip sits at the start rather than at a computed NaN.
                  const originLng = route.originLng;
                  const span =
                    route.destinationLng != null && originLng != null
                      ? route.destinationLng - originLng || 1
                      : 1;
                  const progress =
                    originLng == null
                      ? 0
                      : Math.min(1, Math.max(0, (shipment.lng - originLng) / span));
                  return (
                    <span
                      key={shipment.shipmentId}
                      className="absolute top-1/2 size-3 -translate-y-1/2 rounded-full border-2 border-surface shadow-sm"
                      style={{
                        left: `calc(${progress * 100}% - 6px)`,
                        backgroundColor: riskColor(shipment.riskScore),
                      }}
                      title={`${shipment.reference} · ${STAGE_LABELS[shipment.stage]}`}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Stated once, quietly, at the edge — the corridor data above is real and
          should not be framed by an apology. */}
      <p className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-surface/90 px-3 py-1.5 text-[11px] text-muted-foreground shadow-sm backdrop-blur-sm">
        Basemap unavailable — showing corridor progress
      </p>
    </div>
  );
}

/** The search field the reference layout floats over the map. */
export function MapSearchField({
  value,
  onChange,
  placeholder = 'Search reference or route',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex h-10 items-center gap-2 rounded-full bg-surface px-4 shadow-md">
      <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label="Search shipments on the map"
        className="w-40 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground sm:w-56"
      />
    </label>
  );
}
