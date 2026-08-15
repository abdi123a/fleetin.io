import { create } from 'zustand';

import type { Mission } from '@/types/mission';

/**
 * Shipments are the operational source of truth. Empty Return used to be
 * kept in sync from here by hand (`syncMissionIntoEmptyReturns`, plus the
 * reverse callbacks `assignShipmentToCycle`/`completeShipmentFromCycle`) —
 * that whole bridge is gone now that Empty Return reads real `Booking`/
 * `EmptyReturnCycle` rows by `shipmentId` directly (see
 * `@/features/empty-returns`), so there is nothing left here to derive.
 */

export interface ShipmentPrefillData {
  bookingId?: string;
  shipperId?: string;
  shipperName?: string;
  shipperCompany?: string;
  shipperPhone?: string;
  shipperEmail?: string;
  pickupLocation?: string;
  pickupCity?: string;
  deliveryLocation?: string;
  deliveryCity?: string;
  cargoType?: string;
  goodsDescription?: string;
  totalWeightKg?: number;
  rateFDJ?: number;
  containerNumber?: string;
  shipmentCategory?:
    | 'container_20'
    | 'container_40'
    | 'bulk'
    | 'machinery'
    | 'containerized'
    | 'bulky_goods'
    | 'special';
  dimensions?: string;
  equipmentType?: string;
  bulkCommodity?: string;
  bulkHandlingMethod?: string;
  machineryType?: string;
  lashingStandard?: string;
}

interface ShipmentState {
  missions: Mission[];
  isCreateModalOpen: boolean;
  prefillData: ShipmentPrefillData | null;
}

interface ShipmentActions {
  openCreateModal: (prefillData?: ShipmentPrefillData) => void;
  closeCreateModal: () => void;
  addShipment: (mission: Mission) => void;
  setMissions: (missions: Mission[]) => void;
  updateMissionStatus: (id: string, status: Mission['status']) => void;
}

export type ShipmentStore = ShipmentState & ShipmentActions;

export const useShipmentStore = create<ShipmentStore>((set, get) => ({
  missions: [],
  isCreateModalOpen: false,
  prefillData: null,

  openCreateModal: (prefillData) =>
    set({
      isCreateModalOpen: true,
      prefillData: prefillData || null,
    }),

  closeCreateModal: () =>
    set({
      isCreateModalOpen: false,
      prefillData: null,
    }),

  setMissions: (missions) => set({ missions }),

  addShipment: (mission) => {
    // Deliberately leaves `isCreateModalOpen` untouched — the modal shows a
    // success screen after creation, and closes only when the user dismisses
    // it via `closeCreateModal` (see CreateShipmentModal's `handleClose`).
    // The shipment already exists on the backend by the time this runs (the
    // caller awaits the real POST /shipments first) — this just reflects the
    // server's response into local state without a further network call.
    set((state) => ({
      missions: [mission, ...state.missions],
    }));
  },

  updateMissionStatus: (id, status) => {
    const current = get().missions.find((m) => m.id === id);
    if (!current || current.status === status) return;
    const updated: Mission = { ...current, status };
    set((state) => ({
      missions: state.missions.map((m) => (m.id === id ? updated : m)),
    }));
  },
}));
