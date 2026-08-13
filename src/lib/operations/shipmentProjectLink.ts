/**
 * Frontend-only shipment → finance project links.
 *
 * The Shipments module talks to the real backend; the Finance module's
 * clients and projects are local demo data with no `Project` table on the
 * backend yet (see `@/stores/finance.store`). Until that gap closes, a
 * shipment's tag to a project lives here, in this browser's storage, rather
 * than being sent anywhere. Same pattern `CreateShipmentModal` already uses
 * for its remembered custom locations: read/write through localStorage, and
 * fail silently if storage is unavailable rather than break shipment
 * creation over it.
 */

const STORAGE_KEY = 'fleetin.shipmentProjectLinks';

function loadLinks(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
  } catch {
    return {};
  }
}

function saveLinks(links: Record<string, string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
  } catch {
    // Storage unavailable (private browsing, quota) — the session still works, it just won't persist.
  }
}

/** The finance project a shipment was tagged with at creation, or null. */
export function getProjectLink(missionId: string): string | null {
  return loadLinks()[missionId] ?? null;
}

/** Tags a shipment to a finance project, or clears the tag when passed null. */
export function setProjectLink(missionId: string, projectId: string | null): void {
  const links = loadLinks();
  if (projectId) {
    links[missionId] = projectId;
  } else {
    delete links[missionId];
  }
  saveLinks(links);
}
