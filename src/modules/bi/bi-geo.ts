/**
 * Where the corridor's named places actually are.
 *
 * The BI contract's `Route` carries origin/destination coordinates so the
 * tracking map can draw a corridor rather than markers in the sea. Real
 * shipments store their pickup/delivery as free text (`"Doraleh Container
 * Terminal (DCT) — Port of Doraleh, Djibouti"`), not coordinates, so this is
 * the gazetteer that resolves one to the other.
 *
 * These are real published coordinates for real places — reference geography,
 * not invented business data. A location that isn't in the table resolves to
 * `null` and its route is emitted without a position rather than with a made-up
 * one; the map simply doesn't draw that leg.
 */

export interface GeoPoint {
  lat: number;
  lng: number;
}

/** Matched on a lowercased substring, longest key first, so "Doraleh Container Terminal (DCT) — …" hits `doraleh container terminal`. */
const GAZETTEER: Record<string, GeoPoint> = {
  'doraleh container terminal': { lat: 11.6094, lng: 43.0567 },
  'doraleh multipurpose port': { lat: 11.6021, lng: 43.0473 },
  'djibouti multipurpose port': { lat: 11.6021, lng: 43.0473 },
  'horizon djibouti terminals': { lat: 11.5931, lng: 43.0722 },
  'port of djibouti': { lat: 11.5951, lng: 43.1437 },
  'doraleh empty depot': { lat: 11.5983, lng: 43.0611 },
  'doraleh port': { lat: 11.6021, lng: 43.0473 },
  sgtd: { lat: 11.6072, lng: 43.0538 },
  'port of tadjourah': { lat: 11.7869, lng: 42.8822 },
  tadjoura: { lat: 11.7869, lng: 42.8822 },
  'port of ghoubet': { lat: 11.5203, lng: 42.4494 },
  damerjog: { lat: 11.4322, lng: 43.2408 },
  'nagad free zone': { lat: 11.5472, lng: 43.1225 },
  nagad: { lat: 11.5472, lng: 43.1225 },
  'holhol free zone': { lat: 11.3086, lng: 42.9556 },
  diftz: { lat: 11.5364, lng: 43.0244 },
  'pk12': { lat: 11.5364, lng: 43.0244 },
  'djibouti free zone': { lat: 11.5731, lng: 43.1069 },
  dfz: { lat: 11.5731, lng: 43.1069 },
  'dire dawa': { lat: 9.5931, lng: 41.8661 },
  'addis ababa': { lat: 8.9806, lng: 38.7578 },
  adama: { lat: 8.54, lng: 39.2675 },
  hawassa: { lat: 7.0622, lng: 38.4764 },
  'modjo': { lat: 8.5906, lng: 39.1128 },
  mogadishu: { lat: 2.0469, lng: 45.3182 },
  hargeisa: { lat: 9.5624, lng: 44.077 },
  berbera: { lat: 10.4396, lng: 45.0143 },
  djibouti: { lat: 11.5721, lng: 43.1456 },
};

const KEYS_LONGEST_FIRST = Object.keys(GAZETTEER).sort((a, b) => b.length - a.length);

export function locate(locationName: string | null | undefined): GeoPoint | null {
  if (!locationName) return null;
  const needle = locationName.toLowerCase();
  for (const key of KEYS_LONGEST_FIRST) {
    if (needle.includes(key)) return GAZETTEER[key];
  }
  return null;
}
