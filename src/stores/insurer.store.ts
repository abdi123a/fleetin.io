import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * The insurance companies a vehicle's cover can be written by.
 *
 * Same pattern as vehicleType.store.ts: a small list somebody picks from
 * instead of typing, and an entry added while filing one certificate is there
 * for the next truck. There is no `/insurers` endpoint and there should not be
 * — an insurer is not an account in Fleetin, it is a name on a policy.
 *
 * Seeded with the four companies writing motor cover on this corridor, which
 * is also what the demo dataset uses. A short, right list beats a long,
 * plausible one: an insurer that does not operate in Djibouti sitting in the
 * picker is a wrong answer waiting to be chosen.
 */
export interface Insurer {
  id: string;
  label: string;
}

interface InsurerState {
  insurers: Insurer[];
  /** Adds one, or returns the existing entry if the name is already there. */
  addInsurer: (label: string) => Insurer;
  removeInsurer: (id: string) => void;
}

const SEED_INSURERS: Insurer[] = [
  { id: 'ins-gxa', label: 'GXA Assurances' },
  { id: 'ins-amerga', label: 'AMERGA Insurance' },
  { id: 'ins-nyala', label: 'Nyala Insurance' },
  { id: 'ins-africa', label: 'Africa Insurance' },
];

export const useInsurerStore = create<InsurerState>()(
  persist(
    (set, get) => ({
      insurers: SEED_INSURERS,

      addInsurer: (label) => {
        const trimmed = label.trim();
        const existing = get().insurers.find((i) => i.label.toLowerCase() === trimmed.toLowerCase());
        if (existing) return existing;

        const insurer: Insurer = { id: `insurer-${Date.now()}`, label: trimmed };
        set((state) => ({ insurers: [...state.insurers, insurer] }));
        return insurer;
      },

      removeInsurer: (id) => {
        set((state) => ({ insurers: state.insurers.filter((i) => i.id !== id) }));
      },
    }),
    { name: 'fleetin-insurers-storage' },
  ),
);
