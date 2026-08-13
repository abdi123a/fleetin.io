import { create } from 'zustand';

import {
  findPartnerByName,
  isDeliveredContainerShipment,
  isOpenFullLoadShipment,
} from '@/lib/operations/shipmentBridge';
import { useEmptyReturnStore } from '@/stores/emptyReturn.store';
import type { Mission, MissionTimelineStep } from '@/types/mission';
import type { PartnerRecord } from '@/types/partner';

/**
 * Shipments are the operational source of truth, and this store is where the
 * Empty Return module is kept honest about them. Every mutation that changes
 * what a shipment *is* — created, status moved, matched, delivered — funnels
 * through here and re-syncs the Empty Return store:
 *
 * - a containerized shipment entering `Pending` joins the Matching pool;
 * - one leaving `Pending` by ordinary dispatch is withdrawn from that pool;
 * - one reaching a delivered status becomes an empty-return record.
 *
 * The reverse direction (`assignShipmentToCycle`, `completeShipmentFromCycle`)
 * is called by the Empty Return store when Matching consumes a shipment. The
 * two store modules import each other; every cross-call happens inside an
 * action body, never during module evaluation, which is what makes the cycle
 * safe.
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
  /**
   * A live partner cache, hydrated by `useHydrateShipments()` alongside
   * `missions`. Exists only so `assignShipmentToCycle` can resolve a
   * transporter's real id without importing mock data directly — its call
   * site is inside the (out-of-scope) Empty Returns store and its signature
   * can't change, so this is the seam.
   */
  partners: PartnerRecord[];
  isCreateModalOpen: boolean;
  prefillData: ShipmentPrefillData | null;
}

interface ShipmentActions {
  openCreateModal: (prefillData?: ShipmentPrefillData) => void;
  closeCreateModal: () => void;
  addShipment: (mission: Mission) => void;
  setMissions: (missions: Mission[]) => void;
  setPartners: (partners: PartnerRecord[]) => void;
  updateMissionStatus: (id: string, status: Mission['status']) => void;
  /**
   * Called by the Empty Return store when Matching welds this shipment to an
   * empty: the returning truck becomes the shipment's vehicle, the empty's
   * carrier becomes its transporter, and the timeline records the cycle.
   */
  assignShipmentToCycle: (
    shipmentId: string,
    cycleId: string,
    transporterName: string,
    truck: string | null,
  ) => void;
  /** Called by the Empty Return store when the cycle's full load is delivered. */
  completeShipmentFromCycle: (shipmentId: string, cycleLabel: string) => void;
}

export type ShipmentStore = ShipmentState & ShipmentActions;

/** `YYYY-MM-DD HH:mm` — the format every Mission timestamp uses. */
function nowStamp(): string {
  return new Date().toISOString().replace('T', ' ').substring(0, 16);
}

/**
 * Re-state this shipment to the Empty Return module. Idempotent — the register
 * actions dedupe by shipment id, so calling it on every mutation is safe.
 */
function syncMissionIntoEmptyReturns(mission: Mission): void {
  const emptyReturns = useEmptyReturnStore.getState();
  if (isOpenFullLoadShipment(mission)) {
    emptyReturns.registerShipmentFullLoad(mission);
    return;
  }
  // No longer an open full load (dispatched, cancelled, delivered…) — a stale
  // Matching pool entry must not survive the transition.
  emptyReturns.withdrawShipmentFullLoad(mission.id);
  if (isDeliveredContainerShipment(mission)) {
    emptyReturns.registerShipmentEmptyReturn(mission);
  }
}

export const useShipmentStore = create<ShipmentStore>((set, get) => ({
  missions: [],
  partners: [],
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
  setPartners: (partners) => set({ partners }),

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
    syncMissionIntoEmptyReturns(mission);
  },

  updateMissionStatus: (id, status) => {
    const current = get().missions.find((m) => m.id === id);
    if (!current || current.status === status) return;
    const updated: Mission = { ...current, status };
    set((state) => ({
      missions: state.missions.map((m) => (m.id === id ? updated : m)),
    }));
    syncMissionIntoEmptyReturns(updated);
  },

  assignShipmentToCycle: (shipmentId, cycleId, transporterName, truck) => {
    const partner = findPartnerByName(transporterName, get().partners);
    set((state) => ({
      missions: state.missions.map((mission) => {
        if (mission.id !== shipmentId) return mission;

        const step: MissionTimelineStep = {
          id: `step-cycle-${cycleId}`,
          key: 'vehicle_assignment',
          title: 'Matched to Empty-Return Cycle',
          description: `Cycle ${cycleId}: returning truck ${truck ?? 'TBD'} from ${transporterName} assigned via Empty Return Matching`,
          timestamp: nowStamp(),
          status: 'completed',
          actor: 'Empty Return Matching',
        };

        return {
          ...mission,
          status: 'Assigned',
          transporter: partner
            ? {
                id: partner.id,
                name: partner.primaryDispatcher.name,
                company: partner.companyLegalName,
                phone: partner.primaryDispatcher.phone,
                fleetCode: `FLT-${partner.id.slice(-3)}`,
                rating: mission.transporter.rating,
              }
            : mission.transporter,
          assignedTruck: truck
            ? {
                id: `VEH-${truck}`,
                registrationNumber: truck,
                vehicleType: 'Container Truck (Empty Return Cycle)',
                capacity: '28 Metric Tons',
                isVerified: true,
              }
            : mission.assignedTruck,
          timeline: [...mission.timeline, step],
        };
      }),
    }));
  },

  completeShipmentFromCycle: (shipmentId, cycleLabel) => {
    const stamp = nowStamp();
    set((state) => ({
      missions: state.missions.map((mission) =>
        mission.id === shipmentId
          ? {
              ...mission,
              status: 'Completed',
              completedAt: stamp,
              timeline: [
                ...mission.timeline,
                {
                  id: `step-cycle-complete-${cycleLabel}`,
                  key: 'completion',
                  title: 'Completion Timestamp',
                  description: `Delivered via empty-return cycle ${cycleLabel}`,
                  timestamp: stamp,
                  status: 'completed',
                  actor: 'Empty Return Cycle',
                },
              ],
            }
          : mission,
      ),
    }));
    // The delivered box is this shipment's container — its empty-return record
    // is spawned by the cycle loop itself, so no re-sync is needed here.
  },
}));
