import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Persisted catalog of transporter vehicle types.
 *
 * Same pattern as partnerDocumentType.store.ts: "New Transporter Onboarding"
 * (AddPartnerForm.tsx) picks vehicle types from this list instead of typing
 * free text, and a type added from that form is saved here so it is
 * available as a pick for every transporter onboarded after it.
 */

export interface VehicleType {
  id: string;
  label: string;
}

interface VehicleTypeState {
  types: VehicleType[];
  /** Adds a type, or returns the existing one if the label already exists (case-insensitive). */
  addType: (label: string) => VehicleType;
  removeType: (id: string) => void;
}

const SEED_TYPES: VehicleType[] = [
  { id: 'vt-40ft-container', label: '40ft Container' },
  { id: 'vt-flatbed', label: 'Flatbed' },
  { id: 'vt-tanker', label: 'Tanker' },
];

export const useVehicleTypeStore = create<VehicleTypeState>()(
  persist(
    (set, get) => ({
      types: SEED_TYPES,

      addType: (label) => {
        const trimmed = label.trim();
        const existing = get().types.find((t) => t.label.toLowerCase() === trimmed.toLowerCase());
        if (existing) return existing;

        const type: VehicleType = { id: `vehicletype-${Date.now()}`, label: trimmed };
        set((state) => ({ types: [...state.types, type] }));
        return type;
      },

      removeType: (id) => {
        set((state) => ({ types: state.types.filter((t) => t.id !== id) }));
      },
    }),
    { name: 'fleetin-vehicle-types-storage' },
  ),
);
