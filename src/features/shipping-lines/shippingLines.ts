import { useEffect } from 'react';
import { create } from 'zustand';

import { registerCompanyLogos } from '@/features/companies/companyLogos';

/**
 * The shipping lines a shipment can be booked under, and their marks.
 *
 * There is no `/shipping-lines` endpoint: a line is not an account in Fleetin,
 * it is a name printed on a container and a logo an operator recognises. So the
 * list lives in the browser — the six carriers whose boxes move through this
 * corridor, plus whatever the account adds.
 *
 * Two kinds of change are stored, and they are deliberately different things:
 *
 * - **Custom lines** — a carrier Fleetin's seed list never heard of. Added,
 *   renamed and removed freely.
 * - **Overrides on a built-in line** — almost always a logo, occasionally a
 *   spelling. The seed name is kept as the key so an upgrade to the seed list
 *   never orphans the logo somebody uploaded.
 *
 * Logos are data URLs, downscaled on the way in. `localStorage` is a few
 * megabytes for the whole app, and a carrier mark is not allowed to be most of
 * it — see `readLogoFile`.
 */

/**
 * The carriers whose boxes move through this corridor.
 *
 * The exact six Fleetin works with — not a plausible list of the world's
 * biggest lines. A carrier that never calls at Djibouti sitting in the picker
 * is a wrong answer waiting to be chosen, and every report that groups by line
 * inherits it.
 */
export const SEED_SHIPPING_LINES: readonly string[] = [
  'MSC',
  'CMA CGM',
  'Maersk Line',
  'COSCO Shipping Lines',
  'Pacific International Lines (PIL)',
  'Hapag-Lloyd',
];

/**
 * Each line's own artwork, shipped with the app.
 *
 * A line has no record on the server — it is a name printed on a box, not an
 * account — so there is no `logoKey` column to hang a mark off the way a
 * shipper or transporter has one. These are static assets instead, and they are
 * the *default*: an account that uploads its own replaces them through
 * `update`, and the override is what `resolve` prefers.
 *
 * CMA CGM appears here and in the shipper book both, because it is one business
 * doing two jobs — the line whose containers move, and, on its own cargo, the
 * shipper booking the haul. Same artwork on both, from the same source file, so
 * the two can never drift into looking like different companies.
 */
const SEED_LINE_LOGOS: Record<string, string> = {
  MSC: '/shipping-lines/msc.jpeg',
  'CMA CGM': '/shipping-lines/cma-cgm.png',
  'Maersk Line': '/shipping-lines/maersk-line.png',
  'COSCO Shipping Lines': '/shipping-lines/cosco-shipping-lines.jpeg',
  'Pacific International Lines (PIL)': '/shipping-lines/pacific-international-lines-pil.jpeg',
  'Hapag-Lloyd': '/shipping-lines/hapag-lloyd.jpg',
};

export interface ShippingLine {
  /** Stable key. For a seed line this is its original name, forever. */
  id: string;
  /** What to print — the override where one was set, else the seed name. */
  name: string;
  /** Data URL, or null when the line falls back to its letterform initials. */
  logoUrl: string | null;
  /** False for the seven above: they can be renamed and re-marked, not deleted. */
  removable: boolean;
}

interface StoredEntry {
  id: string;
  name?: string;
  logoUrl?: string | null;
  custom?: boolean;
}

const STORAGE_KEY = 'fleetin.shippingLines';

function loadStored(): StoredEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is StoredEntry =>
        typeof entry === 'object' && entry !== null && typeof (entry as StoredEntry).id === 'string',
    );
  } catch {
    return [];
  }
}

function saveStored(entries: StoredEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    /* Private browsing, or the quota is full. The session still works; the
       list simply reverts to the seed next time. */
  }
}

function resolve(entries: StoredEntry[]): ShippingLine[] {
  const overrides = new Map(entries.map((entry) => [entry.id, entry]));

  const seeded: ShippingLine[] = SEED_SHIPPING_LINES.map((id) => {
    const override = overrides.get(id);
    return {
      id,
      name: override?.name?.trim() || id,
      /* An uploaded mark wins; the shipped asset is the floor. `undefined`
         means nobody has touched it, `null` means somebody cleared it — and a
         cleared mark must stay cleared rather than springing back. */
      logoUrl: override && 'logoUrl' in override ? override.logoUrl ?? null : SEED_LINE_LOGOS[id] ?? null,
      removable: false,
    };
  });

  const custom: ShippingLine[] = entries
    .filter((entry) => entry.custom && !SEED_SHIPPING_LINES.includes(entry.id))
    .map((entry) => ({
      id: entry.id,
      name: entry.name?.trim() || entry.id,
      logoUrl: entry.logoUrl ?? null,
      removable: true,
    }));

  return [...seeded, ...custom];
}

interface ShippingLineState {
  entries: StoredEntry[];
  lines: ShippingLine[];
  add: (name: string, logoUrl?: string | null) => ShippingLine | null;
  update: (id: string, patch: { name?: string; logoUrl?: string | null }) => void;
  remove: (id: string) => void;
}

const commit = (entries: StoredEntry[]) => {
  saveStored(entries);
  return { entries, lines: resolve(entries) };
};

export const useShippingLineStore = create<ShippingLineState>((set, get) => {
  const initial = loadStored();
  return {
    entries: initial,
    lines: resolve(initial),

    add: (name, logoUrl = null) => {
      const trimmed = name.trim();
      if (!trimmed) return null;
      /* Case-insensitive, because "cma cgm" and "CMA CGM" are one carrier and a
         second entry for it would quietly split every report that groups by
         line. An existing line is updated rather than duplicated. */
      const existing = get().lines.find(
        (line) => line.name.toLowerCase() === trimmed.toLowerCase(),
      );
      if (existing) {
        if (logoUrl) get().update(existing.id, { logoUrl });
        return get().lines.find((line) => line.id === existing.id) ?? existing;
      }
      const entry: StoredEntry = { id: trimmed, name: trimmed, logoUrl, custom: true };
      set((state) => commit([...state.entries, entry]));
      return { id: entry.id, name: trimmed, logoUrl: logoUrl ?? null, removable: true };
    },

    update: (id, patch) =>
      set((state) => {
        const index = state.entries.findIndex((entry) => entry.id === id);
        const isSeed = SEED_SHIPPING_LINES.includes(id);
        const next = [...state.entries];
        if (index === -1) {
          next.push({ id, custom: !isSeed, ...patch });
        } else {
          next[index] = { ...next[index], id, ...patch };
        }
        return commit(next);
      }),

    remove: (id) =>
      set((state) => commit(state.entries.filter((entry) => entry.id !== id))),
  };
});

/** Every line a shipment can be booked under, seed list first. */
export function useShippingLines(): ShippingLine[] {
  const lines = useShippingLineStore((state) => state.lines);

  /* A line's mark should follow its name everywhere — the shipment header, a
     report, a booking row — not just the picker it was uploaded from. The
     company registry is that one place, so every logo is published into it. */
  useEffect(() => {
    const marked = lines.filter((line) => line.logoUrl);
    if (marked.length > 0) {
      registerCompanyLogos(
        marked.map((line) => ({ id: line.id, name: line.name, logoUrl: line.logoUrl })),
      );
    }
  }, [lines]);

  return lines;
}

/**
 * A picked file as a small square data URL.
 *
 * Downscaled rather than rejected. The settings branding field caps uploads at
 * half a megabyte and tells the user to export it smaller, which is fair for a
 * letterhead that has to print; a carrier mark is rendered at 24px in a
 * dropdown, so refusing a 3 MB PNG teaches nothing when the browser can just
 * resize it. The longest edge lands at 96px, which keeps a full list of custom
 * lines to a few tens of kilobytes of `localStorage`.
 *
 * SVG is passed through untouched: it is already tiny, and rasterising a
 * wordmark to 96px would be a downgrade.
 */
export function readLogoFile(file: File, maxEdge = 96): Promise<string> {
  if (file.type === 'image/svg+xml') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('unreadable'));
      reader.onerror = () => reject(new Error('unreadable'));
      reader.readAsDataURL(file);
    });
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('no canvas'));
        return;
      }
      ctx.drawImage(image, 0, 0, width, height);
      /* PNG, not JPEG: carrier marks are usually transparent, and a white box
         behind a logo on a tinted row is worse than a few extra kilobytes. */
      resolve(canvas.toDataURL('image/png'));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('not an image'));
    };
    image.src = url;
  });
}
